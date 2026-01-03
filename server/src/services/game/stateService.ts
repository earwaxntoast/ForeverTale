/**
 * State Evaluation Service
 * Handles dynamic object state changes using AI evaluation
 *
 * Every object can have a stateDescription that changes based on player actions.
 * This service evaluates actions and updates states appropriately.
 */

import { PrismaClient, GameObject, ObjectSystem } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../../utils/logger.js';

const prisma = new PrismaClient();
const anthropic = new Anthropic();
const FAST_MODEL = 'claude-3-5-haiku-20241022';

export interface StateChangeResult {
  changed: boolean;
  objectId: string;
  objectName: string;
  previousState: string | null;
  newState: string | null;
  narrative?: string;  // How to describe the change to the player
  systemEffects?: Array<{
    objectId: string;
    objectName: string;
    newState: string;
  }>;
}

/**
 * Evaluate if an action should change an object's state
 * Uses a fast AI model to determine state changes
 */
export async function evaluateStateChange(
  storyId: string,
  objectId: string,
  action: string,
  context: {
    roomDescription?: string;
    otherObjectsInRoom?: string[];
    playerInventory?: string[];
    currentNarrative?: string;
  } = {}
): Promise<StateChangeResult> {
  // Fetch the object
  const object = await prisma.gameObject.findUnique({
    where: { id: objectId },
    include: {
      system: {
        include: {
          objects: true,
        },
      },
    },
  });

  if (!object) {
    return {
      changed: false,
      objectId,
      objectName: 'Unknown',
      previousState: null,
      newState: null,
    };
  }

  const previousState = object.stateDescription;

  // Build prompt for state evaluation
  const prompt = `You are evaluating whether a player action changes an object's physical state in a text adventure game.

OBJECT: ${object.name}
DESCRIPTION: ${object.description || 'No description'}
CURRENT STATE: ${previousState || 'Normal/default state'}

PLAYER ACTION: "${action}"

${context.roomDescription ? `ROOM: ${context.roomDescription}` : ''}
${context.otherObjectsInRoom?.length ? `OTHER OBJECTS NEARBY: ${context.otherObjectsInRoom.join(', ')}` : ''}
${context.playerInventory?.length ? `PLAYER CARRYING: ${context.playerInventory.join(', ')}` : ''}

Based on the player's action, should this object's physical state change?
- Consider realistic cause and effect
- Only change state if the action would logically affect the object
- State changes should be observable and relevant to gameplay

Respond in JSON format:
{
  "stateChanged": true/false,
  "newState": "Brief description of new state (e.g., 'lit and crackling with flames', 'shattered into pieces', 'now cold to the touch')" or null if unchanged,
  "narrative": "Optional: A short sentence describing the change for the player to see (e.g., 'The torch bursts into flame.')" or null,
  "affectsSystem": true/false // Does this affect connected objects in the same system?
}`;

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const jsonMatch = textContent?.text?.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        changed: false,
        objectId,
        objectName: object.name,
        previousState,
        newState: null,
      };
    }

    const result = JSON.parse(jsonMatch[0]) as {
      stateChanged: boolean;
      newState: string | null;
      narrative: string | null;
      affectsSystem: boolean;
    };

    if (!result.stateChanged) {
      return {
        changed: false,
        objectId,
        objectName: object.name,
        previousState,
        newState: null,
      };
    }

    // Update the object's state
    await prisma.gameObject.update({
      where: { id: objectId },
      data: { stateDescription: result.newState },
    });

    const stateChangeResult: StateChangeResult = {
      changed: true,
      objectId,
      objectName: object.name,
      previousState,
      newState: result.newState,
      narrative: result.narrative || undefined,
    };

    // If this affects the system, evaluate related objects
    if (result.affectsSystem && object.system) {
      const systemEffects = await propagateSystemStateChange(
        object.system,
        object.id,
        result.newState || '',
        action
      );
      stateChangeResult.systemEffects = systemEffects;
    }

    return stateChangeResult;

  } catch (error) {
    logger.error('STATE_SERVICE', `Failed to evaluate state change: ${error}`);
    return {
      changed: false,
      objectId,
      objectName: object.name,
      previousState,
      newState: null,
    };
  }
}

/**
 * Propagate state changes to related objects in the same system
 * For example, turning off a generator affects all connected lights
 */
async function propagateSystemStateChange(
  system: ObjectSystem & { objects: GameObject[] },
  triggerObjectId: string,
  triggerNewState: string,
  action: string
): Promise<Array<{ objectId: string; objectName: string; newState: string }>> {
  const effects: Array<{ objectId: string; objectName: string; newState: string }> = [];

  // Get other objects in the system (excluding the trigger)
  const relatedObjects = system.objects.filter(obj => obj.id !== triggerObjectId);

  if (relatedObjects.length === 0) {
    return effects;
  }

  const objectList = relatedObjects.map(obj =>
    `- ${obj.name}: ${obj.stateDescription || 'Normal state'}`
  ).join('\n');

  const prompt = `A state change in a connected system of objects.

SYSTEM: ${system.name}
SYSTEM DESCRIPTION: ${system.description || 'Connected objects'}
SYSTEM STATE: ${system.systemState || 'Normal'}

TRIGGERING EVENT:
Object "${system.objects.find(o => o.id === triggerObjectId)?.name}" changed to: "${triggerNewState}"
Due to action: "${action}"

CONNECTED OBJECTS:
${objectList}

Which of these connected objects should have their state affected, and how?
Consider realistic cause-and-effect relationships within the system.

Respond in JSON:
{
  "systemState": "New overall system state" or null if unchanged,
  "effects": [
    { "name": "Object Name", "newState": "New state description" }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const jsonMatch = textContent?.text?.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return effects;
    }

    const result = JSON.parse(jsonMatch[0]) as {
      systemState: string | null;
      effects: Array<{ name: string; newState: string }>;
    };

    // Update system state if changed
    if (result.systemState) {
      await prisma.objectSystem.update({
        where: { id: system.id },
        data: { systemState: result.systemState },
      });
    }

    // Update affected objects
    for (const effect of result.effects || []) {
      const obj = relatedObjects.find(o =>
        o.name.toLowerCase() === effect.name.toLowerCase()
      );
      if (obj) {
        await prisma.gameObject.update({
          where: { id: obj.id },
          data: { stateDescription: effect.newState },
        });
        effects.push({
          objectId: obj.id,
          objectName: obj.name,
          newState: effect.newState,
        });
      }
    }

    return effects;

  } catch (error) {
    logger.error('STATE_SERVICE', `Failed to propagate system state: ${error}`);
    return effects;
  }
}

/**
 * Create a new object system to link related objects
 */
export async function createObjectSystem(
  storyId: string,
  name: string,
  description: string,
  objectIds: string[]
): Promise<ObjectSystem> {
  const system = await prisma.objectSystem.create({
    data: {
      storyId,
      name,
      description,
    },
  });

  // Link objects to the system
  if (objectIds.length > 0) {
    await prisma.gameObject.updateMany({
      where: { id: { in: objectIds } },
      data: { systemId: system.id },
    });
  }

  return system;
}

/**
 * Get the state description for an object to include in AI context
 * Returns a formatted string if the object has a non-default state
 */
export function getStateNarrative(object: {
  name: string;
  stateDescription: string | null
}): string | null {
  if (!object.stateDescription) {
    return null;
  }
  return `The ${object.name} is ${object.stateDescription}.`;
}

/**
 * Get all non-default object states in a room for AI context
 */
export async function getRoomObjectStates(roomId: string): Promise<string[]> {
  const objects = await prisma.gameObject.findMany({
    where: {
      roomId,
      stateDescription: { not: null },
    },
    select: {
      name: true,
      stateDescription: true,
    },
  });

  return objects
    .filter(obj => obj.stateDescription)
    .map(obj => `The ${obj.name} is ${obj.stateDescription}.`);
}
