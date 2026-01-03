import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import * as roomService from './roomService';
import * as objectService from './objectService';
import { objectMatchesName } from './objectService';
import * as skillService from './skillService';
import * as puzzleService from './puzzleService';
import * as vehicleService from './vehicleService';
import * as stateService from './stateService';
import { processCommand as aiProcessCommand, generateSpectacularNarrative, extractAndCreateDiscoveredItems, extractAndCreateDiscoveredPassages, extractAndCreateTimedEvents, updateCharacterPresence } from '../ai/gameAI';

const prisma = new PrismaClient();

export type CommandType =
  | 'GO'
  | 'LOOK'
  | 'EXAMINE'
  | 'TAKE'
  | 'DROP'
  | 'USE'
  | 'INVENTORY'
  | 'TALK'
  | 'HELP'
  | 'BOARD'
  | 'DISEMBARK'
  | 'LAUNCH'
  | 'UNKNOWN';

export interface ParsedCommand {
  type: CommandType;
  target?: string;
  modifier?: string;
  rawInput: string;
}

export interface CommandResult {
  success: boolean;
  response: string;
  roomChanged?: boolean;
  newRoomId?: string;
  personalitySignal?: {
    dimension: string;
    delta: number;
    confidence: number;
    reasoning: string;
    choiceContext?: string;
    alternatives?: string[];
  };
  // Vehicle-related menu options (for destination selection)
  menuOptions?: Array<{ id: string; name: string }>;
  menuType?: 'destination';  // Type of menu for UI handling
}

// Direction aliases
const DIRECTION_ALIASES: Record<string, roomService.Direction> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  u: 'up',
  d: 'down',
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  up: 'up',
  down: 'down',
  upstairs: 'up',
  downstairs: 'down',
};

// Command patterns
const COMMAND_PATTERNS: Array<{ pattern: RegExp; type: CommandType; targetGroup?: number; modifierGroup?: number }> = [
  // Movement
  { pattern: /^go\s+(.+)$/i, type: 'GO', targetGroup: 1 },
  { pattern: /^(north|south|east|west|up|down|n|s|e|w|u|d)$/i, type: 'GO', targetGroup: 1 },
  { pattern: /^walk\s+(.+)$/i, type: 'GO', targetGroup: 1 },
  { pattern: /^move\s+(.+)$/i, type: 'GO', targetGroup: 1 },

  // Looking
  { pattern: /^look$/i, type: 'LOOK' },
  { pattern: /^look\s+around$/i, type: 'LOOK' },
  { pattern: /^l$/i, type: 'LOOK' },
  { pattern: /^look\s+at\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },
  { pattern: /^look\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },
  { pattern: /^examine\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },
  { pattern: /^x\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },
  { pattern: /^inspect\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },
  { pattern: /^search\s+(.+)$/i, type: 'EXAMINE', targetGroup: 1 },

  // Taking/Dropping
  { pattern: /^take\s+(.+)$/i, type: 'TAKE', targetGroup: 1 },
  { pattern: /^get\s+(.+)$/i, type: 'TAKE', targetGroup: 1 },
  { pattern: /^pick\s+up\s+(.+)$/i, type: 'TAKE', targetGroup: 1 },
  { pattern: /^grab\s+(.+)$/i, type: 'TAKE', targetGroup: 1 },
  { pattern: /^drop\s+(.+)$/i, type: 'DROP', targetGroup: 1 },
  { pattern: /^put\s+down\s+(.+)$/i, type: 'DROP', targetGroup: 1 },
  { pattern: /^leave\s+(.+)$/i, type: 'DROP', targetGroup: 1 },

  // Using items
  { pattern: /^use\s+(.+?)\s+on\s+(.+)$/i, type: 'USE', targetGroup: 1, modifierGroup: 2 },
  { pattern: /^use\s+(.+?)\s+with\s+(.+)$/i, type: 'USE', targetGroup: 1, modifierGroup: 2 },
  { pattern: /^use\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^open\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^close\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^unlock\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^wear\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^put\s+on\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^equip\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^activate\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^read\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^eat\s+(.+)$/i, type: 'USE', targetGroup: 1 },
  { pattern: /^drink\s+(.+)$/i, type: 'USE', targetGroup: 1 },

  // Inventory
  { pattern: /^inventory$/i, type: 'INVENTORY' },
  { pattern: /^inv$/i, type: 'INVENTORY' },
  { pattern: /^i$/i, type: 'INVENTORY' },

  // Talking
  { pattern: /^talk\s+to\s+(.+)$/i, type: 'TALK', targetGroup: 1 },
  { pattern: /^talk\s+(.+)$/i, type: 'TALK', targetGroup: 1 },
  { pattern: /^speak\s+to\s+(.+)$/i, type: 'TALK', targetGroup: 1 },
  { pattern: /^speak\s+with\s+(.+)$/i, type: 'TALK', targetGroup: 1 },
  { pattern: /^ask\s+(.+)$/i, type: 'TALK', targetGroup: 1 },

  // Vehicle - Boarding
  { pattern: /^board\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },
  { pattern: /^board$/i, type: 'BOARD' },
  { pattern: /^enter\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },
  { pattern: /^get\s+in\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },
  { pattern: /^get\s+into\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },
  { pattern: /^climb\s+into\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },
  { pattern: /^climb\s+aboard\s+(.+)$/i, type: 'BOARD', targetGroup: 1 },

  // Vehicle - Disembarking
  { pattern: /^disembark$/i, type: 'DISEMBARK' },
  { pattern: /^exit$/i, type: 'DISEMBARK' },
  { pattern: /^leave\s+vehicle$/i, type: 'DISEMBARK' },
  { pattern: /^get\s+out$/i, type: 'DISEMBARK' },
  { pattern: /^get\s+off$/i, type: 'DISEMBARK' },
  { pattern: /^climb\s+out$/i, type: 'DISEMBARK' },

  // Vehicle - Launching/Traveling
  { pattern: /^launch$/i, type: 'LAUNCH' },
  { pattern: /^launch\s+to\s+(.+)$/i, type: 'LAUNCH', targetGroup: 1 },
  { pattern: /^sail\s+to\s+(.+)$/i, type: 'LAUNCH', targetGroup: 1 },
  { pattern: /^drive\s+to\s+(.+)$/i, type: 'LAUNCH', targetGroup: 1 },
  { pattern: /^fly\s+to\s+(.+)$/i, type: 'LAUNCH', targetGroup: 1 },
  { pattern: /^travel\s+to\s+(.+)$/i, type: 'LAUNCH', targetGroup: 1 },
  { pattern: /^go\s+back$/i, type: 'LAUNCH', targetGroup: 0 },  // Special: go back to previous location

  // Help
  { pattern: /^help$/i, type: 'HELP' },
  { pattern: /^\?$/i, type: 'HELP' },
];

/**
 * Parse a raw player input into a structured command
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  for (const { pattern, type, targetGroup, modifierGroup } of COMMAND_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        type,
        target: targetGroup ? match[targetGroup]?.toLowerCase() : undefined,
        modifier: modifierGroup ? match[modifierGroup]?.toLowerCase() : undefined,
        rawInput: trimmed,
      };
    }
  }

  return {
    type: 'UNKNOWN',
    rawInput: trimmed,
  };
}

/**
 * Generate a hash for caching command responses
 */
function generateCommandHash(storyId: string, roomId: string, command: ParsedCommand): string {
  const key = `${storyId}:${roomId}:${command.type}:${command.target || ''}:${command.modifier || ''}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Check cache for a previous response to this exact command
 */
async function checkCache(
  storyId: string,
  roomId: string,
  command: ParsedCommand
): Promise<string | null> {
  const hash = generateCommandHash(storyId, roomId, command);

  const cached = await prisma.interactionCache.findFirst({
    where: {
      storyId,
      commandHash: hash,
    },
  });

  return cached?.response || null;
}

/**
 * Cache a command response
 */
async function cacheResponse(
  storyId: string,
  roomId: string,
  command: ParsedCommand,
  response: string,
  objectId?: string,
  characterId?: string
): Promise<void> {
  const hash = generateCommandHash(storyId, roomId, command);

  await prisma.interactionCache.create({
    data: {
      storyId,
      roomId,
      objectId,
      characterId,
      commandType: command.type,
      commandTarget: command.target || '',
      commandHash: hash,
      response,
    },
  });
}

/**
 * Execute a parsed command
 */
export async function executeCommand(
  storyId: string,
  command: ParsedCommand
): Promise<CommandResult> {
  // Get current player state
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
  });

  if (!playerState) {
    return {
      success: false,
      response: 'Game state not found. Please start a new game.',
    };
  }

  const currentRoom = await roomService.getRoom(playerState.currentRoomId);
  if (!currentRoom) {
    return {
      success: false,
      response: 'Current room not found. Something went wrong.',
    };
  }

  // Handle different command types
  switch (command.type) {
    case 'GO':
      return handleGo(storyId, currentRoom, command);

    case 'LOOK':
      return handleLook(storyId, currentRoom);

    case 'EXAMINE':
      return handleExamine(storyId, currentRoom, command);

    case 'TAKE':
      return handleTake(storyId, currentRoom, command);

    case 'DROP':
      return handleDrop(storyId, currentRoom, command);

    case 'INVENTORY':
      return handleInventory(storyId);

    case 'USE':
      return handleUse(storyId, currentRoom, command);

    case 'TALK':
      return handleTalk(storyId, currentRoom, command);

    case 'BOARD':
      return handleBoard(storyId, currentRoom, command);

    case 'DISEMBARK':
      return handleDisembark(storyId, currentRoom);

    case 'LAUNCH':
      return handleLaunch(storyId, currentRoom, command);

    case 'HELP':
      return handleHelp();

    case 'UNKNOWN':
    default:
      // Fall through to AI processing
      return handleUnknown(storyId, currentRoom, command);
  }
}

/**
 * Handle GO command
 */
async function handleGo(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Go where? Try: GO NORTH, GO SOUTH, GO EAST, GO WEST, GO UP, or GO DOWN.',
    };
  }

  const direction = DIRECTION_ALIASES[command.target];
  if (!direction) {
    return {
      success: false,
      response: `I don't understand "${command.target}" as a direction. Try: NORTH, SOUTH, EAST, WEST, UP, or DOWN.`,
    };
  }

  // Check if there's an exit in that direction
  let targetRoomId = roomService.getRoomInDirection(currentRoom, direction);

  // If no exit exists, potentially generate a new room (dynamic world expansion)
  if (!targetRoomId) {
    // For now, just report no exit. Later we can add dynamic generation
    return {
      success: false,
      response: `You can't go ${direction} from here.`,
    };
  }

  // Move to the new room
  const { room: newRoom, isFirstVisit, description } = await roomService.moveToRoom(storyId, targetRoomId);

  const formattedDescription = roomService.formatRoomDescription(newRoom, description, isFirstVisit);

  // Extract and create any items mentioned in the room description
  // This is especially important on first visit
  const existingNames = newRoom.gameObjects?.map((o: { name: string }) => o.name) || [];
  const newItems = await extractAndCreateDiscoveredItems(
    storyId,
    newRoom.id,
    description,
    existingNames
  );

  // Check for puzzles that auto-discover on room entry
  const roomDiscovery = await puzzleService.discoverPuzzlesOnRoomEntry(storyId, newRoom.id);

  // If new items were discovered from the description, append a notice
  let response = formattedDescription;
  if (newItems.length > 0) {
    const itemNames = newItems.map(i => i.name).join(', ');
    response += `\n\n[You notice: ${itemNames}]`;
  }

  // Append any puzzle discovery narratives
  if (roomDiscovery.narratives.length > 0) {
    response += '\n\n' + roomDiscovery.narratives.join('\n');
  }

  return {
    success: true,
    response,
    roomChanged: true,
    newRoomId: newRoom.id,
  };
}

/**
 * Handle LOOK command
 */
async function handleLook(
  storyId: string,
  currentRoom: roomService.RoomWithDetails
): Promise<CommandResult> {
  const description = currentRoom.description || 'You look around but see nothing remarkable.';
  const formattedDescription = roomService.formatRoomDescription(currentRoom, description, false);

  // Extract and create any items mentioned in the room description
  // This ensures that items mentioned in descriptions become interactable
  const existingNames = currentRoom.gameObjects.map(o => o.name);
  const newItems = await extractAndCreateDiscoveredItems(
    storyId,
    currentRoom.id,
    description,
    existingNames
  );

  // If new items were discovered from the description, append a notice
  let response = formattedDescription;
  if (newItems.length > 0) {
    const itemNames = newItems.map(i => i.name).join(', ');
    response += `\n\n[You notice: ${itemNames}]`;
  }

  return {
    success: true,
    response,
  };
}

/**
 * Handle EXAMINE command
 */
async function handleExamine(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Examine what? Try: EXAMINE [object name]',
    };
  }

  // Look for matching object in room or inventory (includes synonym matching)
  const inventory = await objectService.getInventory(storyId);
  const allObjects = [...currentRoom.gameObjects, ...inventory];
  const matchingObject = allObjects.find(
    obj => objectMatchesName(obj, command.target!)
  );

  if (matchingObject) {
    // Build description including any discovered details
    const objectState = (matchingObject.state as Record<string, unknown>) || {};
    const discoveredDetails = objectState.discoveredDetails as string[] || [];

    let response = matchingObject.description || `You examine the ${matchingObject.name}. It seems ordinary.`;

    if (discoveredDetails.length > 0) {
      response += '\n\n' + discoveredDetails.join('\n\n');
    }

    return {
      success: true,
      response,
    };
  }

  // Look for matching character
  const matchingCharacter = currentRoom.charactersHere.find(
    char => char.name.toLowerCase().includes(command.target!)
  );

  if (matchingCharacter) {
    const response = matchingCharacter.description || `You look at ${matchingCharacter.name}.`;
    return {
      success: true,
      response,
    };
  }

  // Fall back to AI for creative examination
  const aiResult = await aiProcessCommand(storyId, command.rawInput, {
    room: currentRoom,
    objects: currentRoom.gameObjects,
    characters: currentRoom.charactersHere,
  });

  // Extract and create any newly discovered items from the AI response
  const existingNames = currentRoom.gameObjects.map(o => o.name);
  const newItems = await extractAndCreateDiscoveredItems(
    storyId,
    currentRoom.id,
    aiResult.response,
    existingNames
  );

  // Update character presence based on AI response
  await updateCharacterPresence(storyId, currentRoom.id, aiResult.response);

  // If items were discovered, append a hint to the response
  let response = aiResult.response;
  if (newItems.length > 0) {
    const itemNames = newItems.map(i => i.name).join(', ');
    response += `\n\n[You notice: ${itemNames}]`;
  }

  return {
    success: true,
    response,
    personalitySignal: aiResult.personalitySignal,
  };
}

/**
 * Handle TAKE command
 */
async function handleTake(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Take what? Try: TAKE [object name]',
    };
  }

  const result = await objectService.takeObject(storyId, currentRoom.id, command.target);

  // Append discovery narratives to response if any
  if (result.discoveryNarratives && result.discoveryNarratives.length > 0) {
    result.response += '\n\n' + result.discoveryNarratives.join('\n');
  }

  return result;
}

/**
 * Handle DROP command
 */
async function handleDrop(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Drop what? Try: DROP [object name]',
    };
  }

  const result = await objectService.dropObject(storyId, currentRoom.id, command.target);
  return result;
}

/**
 * Handle INVENTORY command
 */
async function handleInventory(storyId: string): Promise<CommandResult> {
  const inventory = await objectService.getInventory(storyId);

  if (inventory.length === 0) {
    return {
      success: true,
      response: 'You are not carrying anything.',
    };
  }

  const itemList = inventory.map(obj => `  - ${obj.name}`).join('\n');
  return {
    success: true,
    response: `You are carrying:\n${itemList}`,
  };
}

/**
 * Handle USE command
 */
async function handleUse(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Use what? Try: USE [object] or USE [object] ON [target]',
    };
  }

  // Find the target object in room or inventory (includes synonym matching)
  const inventory = await objectService.getInventory(storyId);
  const allObjects = [...currentRoom.gameObjects, ...inventory];
  const matchingObject = allObjects.find(
    obj => objectMatchesName(obj, command.target!)
  );

  // Use AI for creative use/read/open etc.
  const aiResult = await aiProcessCommand(storyId, command.rawInput, {
    room: currentRoom,
    objects: currentRoom.gameObjects,
    characters: currentRoom.charactersHere,
  });

  // If we found a matching object and the AI revealed new information, save it
  if (matchingObject && aiResult.response.length > 50) {
    // Save discovered details to object state
    const currentState = (matchingObject.state as Record<string, unknown>) || {};
    const discoveredDetails = (currentState.discoveredDetails as string[]) || [];

    // Only add if this is meaningfully new content (not a rejection/error message)
    const isNewContent = !aiResult.response.toLowerCase().includes("don't understand") &&
                         !aiResult.response.toLowerCase().includes("nothing happens") &&
                         !discoveredDetails.some(d => d === aiResult.response);

    if (isNewContent) {
      // Extract a summary of what was discovered (the AI response)
      await prisma.gameObject.update({
        where: { id: matchingObject.id },
        data: {
          state: {
            ...currentState,
            discoveredDetails: [...discoveredDetails, aiResult.response],
            lastInteraction: command.rawInput,
          },
          firstExaminedAt: matchingObject.firstExaminedAt || new Date(),
        },
      });
    }
  }

  // Evaluate if the action changes the object's physical state
  let stateChangeNarrative: string | null = null;
  if (matchingObject) {
    const stateChange = await stateService.evaluateStateChange(
      storyId,
      matchingObject.id,
      command.rawInput,
      {
        roomDescription: currentRoom.description || undefined,
        otherObjectsInRoom: currentRoom.gameObjects.map(o => o.name),
        playerInventory: inventory.map(o => o.name),
      }
    );

    if (stateChange.changed && stateChange.narrative) {
      stateChangeNarrative = stateChange.narrative;

      // If system effects occurred, add those narratives too
      if (stateChange.systemEffects && stateChange.systemEffects.length > 0) {
        const effectNarratives = stateChange.systemEffects
          .map(e => `The ${e.objectName} is now ${e.newState}.`)
          .join(' ');
        stateChangeNarrative += ' ' + effectNarratives;
      }
    }
  }

  // Extract and create any newly discovered items from the AI response
  const existingNames = [...currentRoom.gameObjects, ...inventory].map(o => o.name);
  const newItems = await extractAndCreateDiscoveredItems(
    storyId,
    currentRoom.id,
    aiResult.response,
    existingNames
  );

  // Update character presence based on AI response
  await updateCharacterPresence(storyId, currentRoom.id, aiResult.response);

  // Check if a new passage/room was revealed (e.g., opening a door)
  const newPassage = await extractAndCreateDiscoveredPassages(
    storyId,
    currentRoom.id,
    aiResult.response,
    command.rawInput
  );

  // Check if a timed event was triggered (e.g., alarm, countdown)
  const newTimedEvent = await extractAndCreateTimedEvents(
    storyId,
    currentRoom.id,
    aiResult.response,
    command.rawInput
  );

  // Check if this action triggers puzzle discovery
  const actionDiscovery = await puzzleService.discoverPuzzlesFromAction(storyId, command.rawInput);

  // Check if this action reveals any hidden exits
  const exitDiscovery = await puzzleService.discoverHiddenExits(storyId, currentRoom.id, command.rawInput);

  // Check if this action completes any puzzle steps
  const inventoryNames = inventory.map(obj => obj.name);
  const puzzleCompletion = await puzzleService.checkPuzzleStepCompletion(
    storyId,
    command.rawInput,
    currentRoom.id,
    inventoryNames
  );

  // Build final response
  let response = aiResult.response;

  // Add state change narrative if object state changed
  if (stateChangeNarrative) {
    response += '\n\n' + stateChangeNarrative;
  }

  if (newItems.length > 0) {
    const itemNames = newItems.map(i => i.name).join(', ');
    response += `\n\n[You notice: ${itemNames}]`;
  }
  if (newPassage) {
    if (newPassage.isPortal) {
      response += `\n\n[Portal opened: enter portal to reach ${newPassage.roomName}]`;
    } else {
      response += `\n\n[New exit: ${newPassage.direction} to ${newPassage.roomName}]`;
    }
  }
  if (newTimedEvent) {
    response += `\n\n[Event started: ${newTimedEvent.eventName} - ${newTimedEvent.turnsRemaining} turns remaining]`;
  }
  if (exitDiscovery.narratives.length > 0) {
    response += '\n\n' + exitDiscovery.narratives.join('\n');
  }
  if (actionDiscovery.narratives.length > 0) {
    response += '\n\n' + actionDiscovery.narratives.join('\n');
  }
  if (puzzleCompletion.narratives.length > 0) {
    response += '\n\n' + puzzleCompletion.narratives.join('\n');
  }

  return {
    success: true,
    response,
    personalitySignal: aiResult.personalitySignal,
  };
}

/**
 * Handle TALK command
 */
async function handleTalk(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  if (!command.target) {
    return {
      success: false,
      response: 'Talk to whom? Try: TALK TO [character name]',
    };
  }

  // Look for matching character
  const matchingCharacter = currentRoom.charactersHere.find(
    char => char.name.toLowerCase().includes(command.target!)
  );

  if (!matchingCharacter) {
    return {
      success: false,
      response: `You don't see anyone called "${command.target}" here.`,
    };
  }

  // Use AI for dialogue
  const aiResult = await aiProcessCommand(storyId, command.rawInput, {
    room: currentRoom,
    objects: currentRoom.gameObjects,
    characters: currentRoom.charactersHere,
  });

  // Update character presence based on AI response (in case other characters are mentioned)
  await updateCharacterPresence(storyId, currentRoom.id, aiResult.response);

  return {
    success: true,
    response: aiResult.response,
    personalitySignal: aiResult.personalitySignal,
  };
}

/**
 * Handle HELP command
 */
function handleHelp(): CommandResult {
  const helpText = `
AVAILABLE COMMANDS:
  Movement:    GO [direction], NORTH, SOUTH, EAST, WEST, UP, DOWN (or N, S, E, W, U, D)
  Looking:     LOOK, LOOK AT [object], EXAMINE [object] (or X)
  Objects:     TAKE [object], DROP [object], USE [object], USE [object] ON [target]
  Inventory:   INVENTORY (or I)
  Characters:  TALK TO [character]
  Vehicles:    BOARD [vehicle], DISEMBARK, LAUNCH TO [destination]
  Help:        HELP (or ?)

You can also try other actions - Anything goes. There are no limits in this realm.
  `.trim();

  return {
    success: true,
    response: helpText,
  };
}

/**
 * Handle BOARD command - board a vehicle
 */
async function handleBoard(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  // Check if there are any vehicles docked here
  const vehicles = await vehicleService.getDockedVehicles(currentRoom.id);

  if (vehicles.length === 0) {
    return {
      success: false,
      response: "There's no vehicle here to board.",
    };
  }

  // If no target specified and only one vehicle, board it
  const target = command.target || '';
  const result = await vehicleService.boardVehicle(storyId, currentRoom.id, target);

  if (!result.success) {
    return {
      success: false,
      response: result.narrative,
    };
  }

  // Get the vehicle room description
  const vehicleRoom = result.vehicleRoom!;
  const description = vehicleRoom.description || `You are aboard the ${vehicleRoom.name}.`;
  const formattedDescription = roomService.formatRoomDescription(
    { ...vehicleRoom, gameObjects: [], charactersHere: [] } as roomService.RoomWithDetails,
    description,
    true
  );

  // Check if vehicle is docked somewhere
  const { dockedAt } = await vehicleService.isPlayerInVehicle(storyId);
  let response = result.narrative + '\n\n' + formattedDescription;

  if (dockedAt) {
    response += `\n\n[Docked at: ${dockedAt.name}. Type DISEMBARK to leave or LAUNCH TO [destination] to travel.]`;
  } else {
    response += `\n\n[Type LAUNCH TO [destination] to travel, or LAUNCH to see available destinations.]`;
  }

  return {
    success: true,
    response,
    roomChanged: true,
    newRoomId: vehicleRoom.id,
  };
}

/**
 * Handle DISEMBARK command - leave a vehicle
 */
async function handleDisembark(
  storyId: string,
  currentRoom: roomService.RoomWithDetails
): Promise<CommandResult> {
  // Check if we're in a vehicle
  const { inVehicle, dockedAt } = await vehicleService.isPlayerInVehicle(storyId);

  if (!inVehicle) {
    return {
      success: false,
      response: "You're not in a vehicle.",
    };
  }

  const result = await vehicleService.disembarkVehicle(storyId);

  if (!result.success) {
    return {
      success: false,
      response: result.narrative,
    };
  }

  // Get the destination room description
  const destRoom = result.destinationRoom!;
  const destRoomWithDetails = await roomService.getRoom(destRoom.id);

  if (!destRoomWithDetails) {
    return {
      success: true,
      response: result.narrative,
      roomChanged: true,
      newRoomId: destRoom.id,
    };
  }

  const description = destRoomWithDetails.description || 'You step out of the vehicle.';
  const formattedDescription = roomService.formatRoomDescription(
    destRoomWithDetails,
    description,
    false
  );

  return {
    success: true,
    response: result.narrative + '\n\n' + formattedDescription,
    roomChanged: true,
    newRoomId: destRoom.id,
  };
}

/**
 * Handle LAUNCH command - travel to a destination in a vehicle
 */
async function handleLaunch(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  // Check if we're in a vehicle
  const { inVehicle, vehicle } = await vehicleService.isPlayerInVehicle(storyId);

  if (!inVehicle || !vehicle) {
    return {
      success: false,
      response: "You need to be in a vehicle to travel. Try BOARD [vehicle] first.",
    };
  }

  // Special case: "go back"
  if (command.rawInput.toLowerCase() === 'go back') {
    const result = await vehicleService.goBack(storyId);

    if (!result.success) {
      return {
        success: false,
        response: result.narrative,
      };
    }

    const destRoom = result.destinationRoom!;
    return {
      success: true,
      response: result.narrative + `\n\n[The ${vehicle.name} is now docked at ${destRoom.name}.]`,
    };
  }

  // Launch to destination
  const destination = command.target || '';
  const result = await vehicleService.launchVehicle(storyId, destination);

  // If we have menu options, return them for selection
  if (result.menuOptions && result.menuOptions.length > 0) {
    const optionsList = result.menuOptions
      .map((opt, i) => `  ${i + 1}. ${opt.name}`)
      .join('\n');

    return {
      success: false,
      response: `${result.narrative}\n\n${optionsList}\n\n[Type LAUNCH TO [destination name] to travel]`,
      menuOptions: result.menuOptions,
      menuType: 'destination',
    };
  }

  if (!result.success) {
    return {
      success: false,
      response: result.narrative,
    };
  }

  // Successfully traveled
  const destRoom = result.destinationRoom!;
  return {
    success: true,
    response: result.narrative + `\n\n[The ${vehicle.name} is now docked at ${destRoom.name}. Type DISEMBARK to leave the vehicle.]`,
  };
}

/**
 * Extract action verbs from input for skill detection
 * Returns array of potential verbs to check (first word + any action verbs)
 */
function extractVerbs(input: string): string[] {
  const words = input.toLowerCase().trim().split(/\s+/);
  const verbs: string[] = [];

  // Skip words that are typically not action verbs
  const skipWords = new Set([
    'i', 'the', 'a', 'an', 'to', 'try', 'want', 'need', 'would', 'like',
    'can', 'could', 'should', 'will', 'going', 'please', 'let', 'me',
    'my', 'with', 'on', 'in', 'at', 'from', 'for', 'of', 'this', 'that'
  ]);

  for (const word of words) {
    if (!skipWords.has(word) && word.length > 2) {
      verbs.push(word);
    }
  }

  return verbs;
}

// Keep backward-compatible single verb extraction
function extractVerb(input: string): string | null {
  const verbs = extractVerbs(input);
  return verbs.length > 0 ? verbs[0] : null;
}

/**
 * Extract semantic topics from a question/statement for caching
 */
function extractSemanticTopics(input: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
    'who', 'whom', 'where', 'when', 'why', 'how', 'here', 'there', 'about',
    'of', 'to', 'for', 'with', 'on', 'at', 'by', 'from', 'in', 'out', 'up',
    'down', 'and', 'or', 'but', 'if', 'then', 'so', 'than', 'too', 'very',
    'just', 'only', 'own', 'same', 'any', 'some', 'no', 'not', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'into', 'over', 'after',
    'before', 'between', 'under', 'again', 'further', 'once', 'during', 'being'
  ]);

  const words = input.toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Sort and dedupe for consistent hashing
  return [...new Set(words)].sort();
}

/**
 * Generate semantic hash from topics
 */
function generateSemanticHash(storyId: string, roomId: string, topics: string[]): string {
  const key = `${storyId}:${roomId}:semantic:${topics.join(',')}`;
  return crypto.createHash('md5').update(key).digest('hex');
}

/**
 * Check semantic cache for similar questions
 */
async function checkSemanticCache(
  storyId: string,
  roomId: string,
  topics: string[]
): Promise<string | null> {
  if (topics.length === 0) return null;

  const semanticHash = generateSemanticHash(storyId, roomId, topics);

  const cached = await prisma.interactionCache.findFirst({
    where: {
      storyId,
      semanticHash,
    },
  });

  return cached?.response || null;
}

/**
 * Cache response with semantic topics
 */
async function cacheSemanticResponse(
  storyId: string,
  roomId: string,
  command: ParsedCommand,
  topics: string[],
  response: string
): Promise<void> {
  const hash = generateCommandHash(storyId, roomId, command);
  const semanticHash = topics.length > 0 ? generateSemanticHash(storyId, roomId, topics) : null;

  await prisma.interactionCache.create({
    data: {
      storyId,
      roomId,
      commandType: command.type,
      commandTarget: command.target || '',
      commandHash: hash,
      semanticTopics: topics,
      semanticHash,
      response,
    },
  });
}

/**
 * Handle unknown commands by passing to AI
 */
async function handleUnknown(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand
): Promise<CommandResult> {
  const input = command.rawInput;

  // Check if input contains a skill-triggering verb (check all potential verbs)
  const verbs = extractVerbs(input);
  let skillName: string | null = null;

  for (const verb of verbs) {
    skillName = await skillService.findSkillForVerb(verb, storyId);
    if (skillName) break;
  }

  // If this triggers a skill check, handle it specially
  if (skillName) {
    return handleSkillAction(storyId, currentRoom, command, skillName);
  }

  // Extract semantic topics for caching
  const topics = extractSemanticTopics(input);

  // Check semantic cache for similar questions
  const cached = await checkSemanticCache(storyId, currentRoom.id, topics);
  if (cached) {
    return {
      success: true,
      response: cached,
    };
  }

  // Use AI to interpret and respond
  const aiResult = await aiProcessCommand(storyId, command.rawInput, {
    room: currentRoom,
    objects: currentRoom.gameObjects,
    characters: currentRoom.charactersHere,
  });

  // Extract and create any newly discovered items from the AI response
  const existingNames = currentRoom.gameObjects.map(o => o.name);
  const newItems = await extractAndCreateDiscoveredItems(
    storyId,
    currentRoom.id,
    aiResult.response,
    existingNames
  );

  // Update character presence based on AI response
  // If AI mentions a character as being present, move them to this room
  await updateCharacterPresence(storyId, currentRoom.id, aiResult.response);

  // Check if a timed event was triggered (e.g., alarm, countdown)
  const newTimedEvent = await extractAndCreateTimedEvents(
    storyId,
    currentRoom.id,
    aiResult.response,
    command.rawInput
  );

  // Check if this action triggers puzzle discovery
  const actionDiscovery = await puzzleService.discoverPuzzlesFromAction(storyId, command.rawInput);

  // Check if this action reveals any hidden exits
  const exitDiscovery = await puzzleService.discoverHiddenExits(storyId, currentRoom.id, command.rawInput);

  // Check if this action completes any puzzle steps
  const inventory = await objectService.getInventory(storyId);
  const inventoryNames = inventory.map(obj => obj.name);
  const puzzleCompletion = await puzzleService.checkPuzzleStepCompletion(
    storyId,
    command.rawInput,
    currentRoom.id,
    inventoryNames
  );

  // Build final response
  let response = aiResult.response;
  if (newItems.length > 0) {
    const itemNames = newItems.map(i => i.name).join(', ');
    response += `\n\n[You notice: ${itemNames}]`;
  }
  if (newTimedEvent) {
    response += `\n\n[Event started: ${newTimedEvent.eventName} - ${newTimedEvent.turnsRemaining} turns remaining]`;
  }
  if (exitDiscovery.narratives.length > 0) {
    response += '\n\n' + exitDiscovery.narratives.join('\n');
  }
  if (actionDiscovery.narratives.length > 0) {
    response += '\n\n' + actionDiscovery.narratives.join('\n');
  }
  if (puzzleCompletion.narratives.length > 0) {
    response += '\n\n' + puzzleCompletion.narratives.join('\n');
  }

  // Cache the response with semantic topics
  await cacheSemanticResponse(storyId, currentRoom.id, command, topics, response);

  return {
    success: true,
    response,
    personalitySignal: aiResult.personalitySignal,
  };
}

/**
 * Handle actions that require skill checks
 */
async function handleSkillAction(
  storyId: string,
  currentRoom: roomService.RoomWithDetails,
  command: ParsedCommand,
  skillName: string
): Promise<CommandResult> {
  // Ask AI to determine difficulty and context
  const aiResult = await aiProcessCommand(storyId, command.rawInput, {
    room: currentRoom,
    objects: currentRoom.gameObjects,
    characters: currentRoom.charactersHere,
    requestSkillCheck: true,
    suggestedSkill: skillName,
  });

  // Default difficulty if AI doesn't specify
  const difficulty = aiResult.skillCheckDifficulty ?? skillService.DIFFICULTY_SCALE.MODERATE;

  // Perform the skill check
  const skillResult = await skillService.performSkillCheck(
    storyId,
    skillName,
    difficulty,
    command.rawInput
  );

  // Format the dice roll display
  let response = skillService.formatSkillCheckResult(skillResult);

  // For nat 20 or nat 1, get spectacular narrative from AI
  if (skillResult.isNat20 || skillResult.isNat1) {
    const spectacularNarrative = await generateSpectacularNarrative(
      storyId,
      command.rawInput,
      skillName,
      skillResult.isNat20 ? 'critical_success' : 'critical_failure',
      {
        room: currentRoom,
        objects: currentRoom.gameObjects,
        characters: currentRoom.charactersHere,
      }
    );
    response += '\n\n' + spectacularNarrative;
  } else {
    // Use the AI's regular narrative based on success/failure
    response += '\n\n' + (skillResult.success ? aiResult.successNarrative : aiResult.failureNarrative) || aiResult.response;
  }

  return {
    success: skillResult.success,
    response,
    personalitySignal: skillResult.personalitySignal,
  };
}
