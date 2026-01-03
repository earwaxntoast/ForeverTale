import { PrismaClient, Room } from '@prisma/client';
import { generateRoomDescription } from '../ai/gameAI';

const prisma = new PrismaClient();

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';

export interface RoomWithDetails extends Room {
  gameObjects: Array<{
    id: string;
    name: string;
    description: string | null;
    synonyms: unknown; // JSON array of alternative names
    state: unknown;
    firstExaminedAt: Date | null;
  }>;
  charactersHere: Array<{ id: string; name: string; description: string | null }>;
}

export interface ExitInfo {
  direction: Direction;
  roomId: string | null;
  description?: string;
}

// Direction offsets for grid navigation
const DIRECTION_OFFSETS: Record<Direction, { x: number; y: number; z: number }> = {
  north: { x: 0, y: 1, z: 0 },
  south: { x: 0, y: -1, z: 0 },
  east: { x: 1, y: 0, z: 0 },
  west: { x: -1, y: 0, z: 0 },
  up: { x: 0, y: 0, z: 1 },
  down: { x: 0, y: 0, z: -1 },
};

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  up: 'down',
  down: 'up',
};

/**
 * Get a room by ID with all its details
 */
export async function getRoom(roomId: string): Promise<RoomWithDetails | null> {
  return prisma.room.findUnique({
    where: { id: roomId },
    include: {
      gameObjects: {
        where: { roomId: roomId }, // Only objects in this room (not in inventory)
        select: { id: true, name: true, description: true, synonyms: true, state: true, firstExaminedAt: true },
      },
      charactersHere: {
        select: { id: true, name: true, description: true },
      },
    },
  });
}

/**
 * Get a room at specific coordinates
 */
export async function getRoomAtCoordinates(
  storyId: string,
  x: number,
  y: number,
  z: number = 0
): Promise<Room | null> {
  return prisma.room.findUnique({
    where: {
      storyId_x_y_z: { storyId, x, y, z },
    },
  });
}

/**
 * Create a new room
 */
export async function createRoom(data: {
  storyId: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  description?: string;
  shortDescription?: string;
  isStoryCritical?: boolean;
  isGenerated?: boolean;
  atmosphere?: object;
}): Promise<Room> {
  return prisma.room.create({
    data: {
      storyId: data.storyId,
      name: data.name,
      x: data.x,
      y: data.y,
      z: data.z ?? 0,
      description: data.description,
      shortDescription: data.shortDescription,
      isStoryCritical: data.isStoryCritical ?? false,
      isGenerated: data.isGenerated ?? false,
      atmosphere: data.atmosphere ?? {},
    },
  });
}

/**
 * Connect two rooms in a given direction
 * @param revealHiddenExits - If true, any hidden exits in this direction will be marked as discovered
 */
export async function connectRooms(
  fromRoomId: string,
  toRoomId: string,
  direction: Direction,
  bidirectional: boolean = true,
  revealHiddenExits: boolean = false
): Promise<void> {
  const directionField = `${direction}RoomId` as const;

  // Get the from room to check for hidden exits
  const fromRoom = await prisma.room.findUnique({
    where: { id: fromRoomId },
    select: { hiddenExits: true, discoveredExits: true },
  });

  const updateData: Record<string, unknown> = { [directionField]: toRoomId };

  // If revealing hidden exits and this direction was hidden, mark it as discovered
  if (revealHiddenExits && fromRoom) {
    const hiddenExits = (fromRoom.hiddenExits as string[]) || [];
    const discoveredExits = (fromRoom.discoveredExits as string[]) || [];
    if (hiddenExits.includes(direction) && !discoveredExits.includes(direction)) {
      updateData.discoveredExits = [...discoveredExits, direction];
    }
  }

  // Update the "from" room
  await prisma.room.update({
    where: { id: fromRoomId },
    data: updateData,
  });

  // If bidirectional, also connect the reverse
  if (bidirectional) {
    const oppositeDirection = OPPOSITE_DIRECTION[direction];
    const oppositeField = `${oppositeDirection}RoomId` as const;

    // Get the to room to check for hidden exits
    const toRoom = await prisma.room.findUnique({
      where: { id: toRoomId },
      select: { hiddenExits: true, discoveredExits: true },
    });

    const reverseUpdateData: Record<string, unknown> = { [oppositeField]: fromRoomId };

    // If revealing hidden exits and the opposite direction was hidden, mark it as discovered
    if (revealHiddenExits && toRoom) {
      const hiddenExits = (toRoom.hiddenExits as string[]) || [];
      const discoveredExits = (toRoom.discoveredExits as string[]) || [];
      if (hiddenExits.includes(oppositeDirection) && !discoveredExits.includes(oppositeDirection)) {
        reverseUpdateData.discoveredExits = [...discoveredExits, oppositeDirection];
      }
    }

    await prisma.room.update({
      where: { id: toRoomId },
      data: reverseUpdateData,
    });
  }
}

/**
 * Get available exits from a room
 */
export function getExits(room: Room): ExitInfo[] {
  const exits: ExitInfo[] = [];

  if (room.northRoomId) exits.push({ direction: 'north', roomId: room.northRoomId });
  if (room.southRoomId) exits.push({ direction: 'south', roomId: room.southRoomId });
  if (room.eastRoomId) exits.push({ direction: 'east', roomId: room.eastRoomId });
  if (room.westRoomId) exits.push({ direction: 'west', roomId: room.westRoomId });
  if (room.upRoomId) exits.push({ direction: 'up', roomId: room.upRoomId });
  if (room.downRoomId) exits.push({ direction: 'down', roomId: room.downRoomId });

  return exits;
}

/**
 * Get the room ID in a given direction, or null if no exit
 */
export function getRoomInDirection(room: Room, direction: Direction): string | null {
  switch (direction) {
    case 'north': return room.northRoomId;
    case 'south': return room.southRoomId;
    case 'east': return room.eastRoomId;
    case 'west': return room.westRoomId;
    case 'up': return room.upRoomId;
    case 'down': return room.downRoomId;
    default: return null;
  }
}

/**
 * Move player to a new room, handling first-visit logic
 */
export async function moveToRoom(
  storyId: string,
  roomId: string
): Promise<{ room: RoomWithDetails; isFirstVisit: boolean; description: string }> {
  const room = await getRoom(roomId);
  if (!room) {
    throw new Error(`Room ${roomId} not found`);
  }

  const isFirstVisit = room.firstVisitedAt === null;

  // Update room visit tracking
  await prisma.room.update({
    where: { id: roomId },
    data: {
      firstVisitedAt: isFirstVisit ? new Date() : undefined,
      visitCount: { increment: 1 },
    },
  });

  // Update player state
  await prisma.playerState.update({
    where: { storyId },
    data: {
      currentRoomId: roomId,
      turnCount: { increment: 1 },
    },
  });

  // Generate description if first visit and no description exists
  let description = room.description || '';
  if (isFirstVisit && !description) {
    description = await generateRoomDescription(storyId, room);
    await prisma.room.update({
      where: { id: roomId },
      data: { description },
    });
  } else if (!isFirstVisit && room.shortDescription) {
    // Use short description on revisits
    description = room.shortDescription;
  }

  return { room, isFirstVisit, description };
}

/**
 * Generate a new room dynamically when player goes in an unexplored direction
 */
export async function generateAdjacentRoom(
  storyId: string,
  fromRoom: Room,
  direction: Direction
): Promise<Room> {
  const offset = DIRECTION_OFFSETS[direction];
  const newX = fromRoom.x + offset.x;
  const newY = fromRoom.y + offset.y;
  const newZ = fromRoom.z + offset.z;

  // Check if a room already exists at these coordinates
  const existingRoom = await getRoomAtCoordinates(storyId, newX, newY, newZ);
  if (existingRoom) {
    // Connect the rooms if not already connected, revealing any hidden exits
    await connectRooms(fromRoom.id, existingRoom.id, direction, true, true);
    return existingRoom;
  }

  // Generate a new room via AI
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: { storyFacts: { where: { importance: { gte: 7 } } } },
  });

  if (!story) {
    throw new Error(`Story ${storyId} not found`);
  }

  // Create a placeholder room - AI will generate details on first visit
  const newRoom = await prisma.room.create({
    data: {
      storyId,
      name: `Unexplored Area`, // Will be updated by AI
      x: newX,
      y: newY,
      z: newZ,
      isGenerated: true,
      hiddenExits: [], // Dynamically created rooms start with no hidden exits
      discoveredExits: [], // All exits are visible by default
    },
  });

  // Connect the rooms, revealing any hidden exits on the source room
  await connectRooms(fromRoom.id, newRoom.id, direction, true, true);

  return newRoom;
}

/**
 * Format room description for display
 */
export function formatRoomDescription(
  room: RoomWithDetails,
  description: string,
  isFirstVisit: boolean
): string {
  const lines: string[] = [];

  // Room name
  lines.push(`== ${room.name.toUpperCase()} ==`);
  lines.push('');

  // Description
  lines.push(description);

  // Objects in room
  if (room.gameObjects.length > 0) {
    lines.push('');
    const objectNames = room.gameObjects.map(obj => obj.name).join(', ');
    lines.push(`You can see: ${objectNames}`);
  }

  // Characters in room
  if (room.charactersHere.length > 0) {
    lines.push('');
    const characterNames = room.charactersHere.map(char => char.name).join(', ');
    lines.push(`Present here: ${characterNames}`);
  }

  // Exits
  const exits = getExits(room);
  if (exits.length > 0) {
    lines.push('');
    const exitDirections = exits.map(e => e.direction).join(', ');
    lines.push(`Exits: ${exitDirections}`);
  }

  return lines.join('\n');
}

/**
 * Create the initial room for a new story
 */
export async function createStartingRoom(
  storyId: string,
  name: string,
  description: string,
  atmosphere?: Record<string, unknown>
): Promise<Room> {
  // Create the starting room at origin
  const room = await createRoom({
    storyId,
    name,
    x: 0,
    y: 0,
    z: 0,
    description,
    isStoryCritical: true,
    isGenerated: false,
    atmosphere,
  });

  // Create player state pointing to this room
  await prisma.playerState.create({
    data: {
      storyId,
      currentRoomId: room.id,
    },
  });

  return room;
}
