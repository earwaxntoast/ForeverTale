import { PrismaClient, GameObject } from '@prisma/client';

const prisma = new PrismaClient();

export interface CommandResult {
  success: boolean;
  response: string;
  personalitySignal?: {
    dimension: string;
    delta: number;
    confidence: number;
    reasoning: string;
  };
}

/**
 * Get all objects in a room
 */
export async function getObjectsInRoom(roomId: string): Promise<GameObject[]> {
  return prisma.gameObject.findMany({
    where: { roomId },
  });
}

/**
 * Get player's inventory (objects with null roomId)
 */
export async function getInventory(storyId: string): Promise<GameObject[]> {
  return prisma.gameObject.findMany({
    where: {
      storyId,
      roomId: null,
    },
  });
}

/**
 * Find an object by name in a room
 */
export async function findObjectInRoom(
  roomId: string,
  objectName: string
): Promise<GameObject | null> {
  const objects = await prisma.gameObject.findMany({
    where: { roomId },
  });

  return objects.find(obj =>
    obj.name.toLowerCase().includes(objectName.toLowerCase())
  ) || null;
}

/**
 * Find an object by name in player's inventory
 */
export async function findObjectInInventory(
  storyId: string,
  objectName: string
): Promise<GameObject | null> {
  const inventory = await getInventory(storyId);

  return inventory.find(obj =>
    obj.name.toLowerCase().includes(objectName.toLowerCase())
  ) || null;
}

/**
 * Take an object from the current room
 */
export async function takeObject(
  storyId: string,
  roomId: string,
  objectName: string
): Promise<CommandResult> {
  const object = await findObjectInRoom(roomId, objectName);

  if (!object) {
    return {
      success: false,
      response: `You don't see any "${objectName}" here.`,
    };
  }

  if (!object.isTakeable) {
    return {
      success: false,
      response: `You can't take the ${object.name}.`,
    };
  }

  // Move object to inventory (roomId = null)
  await prisma.gameObject.update({
    where: { id: object.id },
    data: { roomId: null },
  });

  // Check if this is a story-critical item (potential personality signal)
  let personalitySignal: CommandResult['personalitySignal'];
  if (object.isStoryCritical) {
    personalitySignal = {
      dimension: 'C', // Conscientiousness - collecting important items
      delta: 2,
      confidence: 3,
      reasoning: 'Player is collecting items that may be important later.',
    };
  }

  return {
    success: true,
    response: `You take the ${object.name}.`,
    personalitySignal,
  };
}

/**
 * Drop an object from inventory into the current room
 */
export async function dropObject(
  storyId: string,
  roomId: string,
  objectName: string
): Promise<CommandResult> {
  const object = await findObjectInInventory(storyId, objectName);

  if (!object) {
    return {
      success: false,
      response: `You're not carrying any "${objectName}".`,
    };
  }

  // Move object to room
  await prisma.gameObject.update({
    where: { id: object.id },
    data: { roomId },
  });

  // Check if dropping a story-critical item
  let personalitySignal: CommandResult['personalitySignal'];
  if (object.isStoryCritical) {
    personalitySignal = {
      dimension: 'C', // Conscientiousness - abandoning important items
      delta: -2,
      confidence: 4,
      reasoning: 'Player is abandoning an item that may be important.',
    };
  }

  return {
    success: true,
    response: `You drop the ${object.name}.`,
    personalitySignal,
  };
}

/**
 * Create a new game object in a room
 */
export async function createObject(data: {
  storyId: string;
  roomId: string;
  name: string;
  description?: string;
  isTakeable?: boolean;
  isContainer?: boolean;
  isStoryCritical?: boolean;
  state?: object;
}): Promise<GameObject> {
  return prisma.gameObject.create({
    data: {
      storyId: data.storyId,
      roomId: data.roomId,
      name: data.name,
      description: data.description,
      isTakeable: data.isTakeable ?? true,
      isContainer: data.isContainer ?? false,
      isStoryCritical: data.isStoryCritical ?? false,
      state: data.state ?? {},
    },
  });
}

/**
 * Update an object's state
 */
export async function updateObjectState(
  objectId: string,
  stateChanges: Record<string, unknown>
): Promise<GameObject> {
  const object = await prisma.gameObject.findUnique({
    where: { id: objectId },
  });

  if (!object) {
    throw new Error(`Object ${objectId} not found`);
  }

  const currentState = (object.state as Record<string, unknown>) || {};
  const newState = { ...currentState, ...stateChanges };

  return prisma.gameObject.update({
    where: { id: objectId },
    data: { state: newState as object },
  });
}

/**
 * Open a container or door
 */
export async function openObject(
  storyId: string,
  objectName: string,
  roomId: string
): Promise<CommandResult> {
  // Check room first
  let object = await findObjectInRoom(roomId, objectName);

  // Then check inventory
  if (!object) {
    object = await findObjectInInventory(storyId, objectName);
  }

  if (!object) {
    return {
      success: false,
      response: `You don't see any "${objectName}" to open.`,
    };
  }

  if (!object.isContainer) {
    return {
      success: false,
      response: `The ${object.name} can't be opened.`,
    };
  }

  if (object.isOpen) {
    return {
      success: false,
      response: `The ${object.name} is already open.`,
    };
  }

  if (object.isLocked) {
    return {
      success: false,
      response: `The ${object.name} is locked.`,
    };
  }

  await prisma.gameObject.update({
    where: { id: object.id },
    data: { isOpen: true },
  });

  // Check for contained objects
  const containedObjects = await prisma.gameObject.findMany({
    where: { containedInId: object.id },
  });

  if (containedObjects.length > 0) {
    const itemList = containedObjects.map(obj => obj.name).join(', ');
    return {
      success: true,
      response: `You open the ${object.name}. Inside you find: ${itemList}`,
    };
  }

  return {
    success: true,
    response: `You open the ${object.name}. It's empty.`,
  };
}

/**
 * Unlock an object with a key
 */
export async function unlockObject(
  storyId: string,
  objectName: string,
  roomId: string
): Promise<CommandResult> {
  // Find the locked object
  let object = await findObjectInRoom(roomId, objectName);

  if (!object) {
    return {
      success: false,
      response: `You don't see any "${objectName}" to unlock.`,
    };
  }

  if (!object.isLocked) {
    return {
      success: false,
      response: `The ${object.name} isn't locked.`,
    };
  }

  // Check if player has the key
  if (object.keyObjectId) {
    const key = await prisma.gameObject.findUnique({
      where: { id: object.keyObjectId },
    });

    // Check if key is in inventory
    const inventory = await getInventory(storyId);
    const hasKey = inventory.some(obj => obj.id === object.keyObjectId);

    if (!hasKey) {
      return {
        success: false,
        response: `You need something to unlock the ${object.name}.`,
      };
    }

    // Unlock it
    await prisma.gameObject.update({
      where: { id: object.id },
      data: { isLocked: false },
    });

    return {
      success: true,
      response: `You unlock the ${object.name} with the ${key?.name || 'key'}.`,
    };
  }

  return {
    success: false,
    response: `You can't figure out how to unlock the ${object.name}.`,
  };
}
