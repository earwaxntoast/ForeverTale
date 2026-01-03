import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient, Room, Story } from '@prisma/client';
import * as timedEventService from '../game/timedEventService';

const anthropic = new Anthropic();
const prisma = new PrismaClient();

interface StoryContext {
  genre: string;
  theme: string;
  tone: string;
  storySeed: Record<string, unknown>;
  recentFacts: string[];
  playerAbilities: Array<{ name: string; level: number }>;
}

/**
 * Get story context for AI prompts
 */
async function getStoryContext(storyId: string): Promise<StoryContext> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    include: {
      storyFacts: {
        where: { isContradicted: false },
        orderBy: { importance: 'desc' },
        take: 20,
      },
    },
  });

  if (!story) {
    throw new Error(`Story ${storyId} not found`);
  }

  // Fetch player abilities for context
  const abilities = await prisma.playerAbility.findMany({
    where: { storyId },
    orderBy: { level: 'desc' },
    take: 20,
  });

  const storySeed = (story.storySeed as Record<string, unknown>) || {};
  const genreTags = (story.genreTags as string[]) || [];

  return {
    genre: genreTags[0] || 'fantasy',
    theme: (storySeed.theme as string) || 'adventure',
    tone: (storySeed.tone as string) || 'mysterious',
    storySeed,
    recentFacts: story.storyFacts.map(f => f.content),
    playerAbilities: abilities.map(a => ({ name: a.name, level: Number(a.level) })),
  };
}

/**
 * Generate a description for a room on first visit
 */
export async function generateRoomDescription(
  storyId: string,
  room: Room
): Promise<string> {
  const context = await getStoryContext(storyId);

  // Get adjacent rooms for context
  const adjacentRooms = await prisma.room.findMany({
    where: {
      storyId,
      OR: [
        { id: room.northRoomId || undefined },
        { id: room.southRoomId || undefined },
        { id: room.eastRoomId || undefined },
        { id: room.westRoomId || undefined },
      ].filter(condition => condition.id !== undefined),
    },
    select: { name: true, description: true },
  });

  const atmosphere = room.atmosphere as Record<string, unknown> || {};

  const prompt = `You are the narrator for a ${context.genre} text adventure game in the style of Zork.

STORY CONTEXT:
- Genre: ${context.genre}
- Theme: ${context.theme}
- Tone: ${context.tone}
${context.recentFacts.length > 0 ? `- Established facts:\n${context.recentFacts.map(f => `  * ${f}`).join('\n')}` : ''}

ROOM TO DESCRIBE:
- Name: ${room.name}
${atmosphere.lighting ? `- Lighting: ${atmosphere.lighting}` : ''}
${atmosphere.mood ? `- Mood: ${atmosphere.mood}` : ''}
${atmosphere.sounds ? `- Sounds: ${atmosphere.sounds}` : ''}
${atmosphere.smells ? `- Smells: ${atmosphere.smells}` : ''}

${adjacentRooms.length > 0 ? `ADJACENT AREAS: ${adjacentRooms.map(r => r.name).join(', ')}` : ''}

Write a vivid, atmospheric description of this room from the player's perspective as they enter for the first time.
- Use second person ("You enter...", "You see...")
- Be descriptive but concise (2-4 sentences)
- Include sensory details that match the atmosphere
- Hint at possible interactions or mysteries
- Match the ${context.genre} genre and ${context.tone} tone

DO NOT mention exits or directions - those will be listed separately.
DO NOT list objects or characters - those will be shown separately.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || 'You find yourself in an unremarkable space.';
}

/**
 * Generate a name and initial details for a dynamically created room
 */
export async function generateRoomDetails(
  storyId: string,
  fromRoom: Room,
  direction: string
): Promise<{ name: string; atmosphere: Record<string, unknown> }> {
  const context = await getStoryContext(storyId);

  const prompt = `You are designing a room for a ${context.genre} text adventure game.

The player is moving ${direction} from "${fromRoom.name}".

STORY CONTEXT:
- Genre: ${context.genre}
- Theme: ${context.theme}
- Tone: ${context.tone}

Based on the genre and the fact they're coming from "${fromRoom.name}", suggest a logical adjacent area.

Respond in JSON format:
{
  "name": "Room Name (2-4 words)",
  "atmosphere": {
    "lighting": "description of lighting",
    "mood": "emotional tone",
    "sounds": "ambient sounds if any",
    "smells": "ambient smells if any"
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');

  try {
    const parsed = JSON.parse(textContent?.text || '{}');
    return {
      name: parsed.name || 'Unknown Area',
      atmosphere: parsed.atmosphere || {},
    };
  } catch {
    return {
      name: 'Unknown Area',
      atmosphere: {},
    };
  }
}

/**
 * Process a player command and generate an appropriate response
 */
export async function processCommand(
  storyId: string,
  command: string,
  roomContext: {
    room: Room;
    objects: Array<{ id: string; name: string; description: string | null }>;
    characters: Array<{ id: string; name: string; description: string | null }>;
    requestSkillCheck?: boolean;
    suggestedSkill?: string;
  }
): Promise<{
  response: string;
  actionType: string;
  targetId?: string;
  stateChanges?: Record<string, unknown>;
  personalitySignal?: {
    dimension: string;
    delta: number;
    confidence: number;
    reasoning: string;
  };
  skillCheckDifficulty?: number;
  successNarrative?: string;
  failureNarrative?: string;
}> {
  const context = await getStoryContext(storyId);

  const objectList = roomContext.objects.map(o => o.name).join(', ') || 'nothing of note';
  const characterList = roomContext.characters.map(c => c.name).join(', ') || 'no one';
  const roomDescription = roomContext.room.description || '';

  // If skill check is requested, include skill check parameters in prompt
  const skillCheckInstructions = roomContext.requestSkillCheck ? `
SKILL CHECK REQUIRED:
This action requires a "${roomContext.suggestedSkill}" check. Determine the appropriate difficulty (0-40 scale):
- 0-5: Trivial (anyone can do this)
- 6-10: Easy
- 11-15: Moderate
- 16-20: Challenging
- 21-25: Hard
- 26-30: Very Hard
- 31-35: Heroic
- 36-40: Legendary/Near-impossible

IMPORTANT: When referencing skills in your narrative, use the EXACT skill name "${roomContext.suggestedSkill}" as shown in the player's skill list. Do not paraphrase or use alternative names.

Also provide BOTH a success and failure narrative.` : '';

  // Format player abilities for prompt
  const abilitiesList = context.playerAbilities.length > 0
    ? context.playerAbilities.map(a => `${a.name} (${a.level.toFixed(1)})`).join(', ')
    : 'none';

  const prompt = `You are the game engine for a ${context.genre} text adventure in the style of Zork.

CURRENT ROOM: ${roomContext.room.name}
${roomDescription ? `ROOM DESCRIPTION: ${roomDescription}` : ''}
OBJECTS HERE: ${objectList}
CHARACTERS HERE: ${characterList}

STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}
${context.recentFacts.length > 0 ? `- Key facts: ${context.recentFacts.slice(0, 5).join('; ')}` : ''}
- Player skills: ${abilitiesList}

PLAYER COMMAND: "${command}"
${skillCheckInstructions}

Interpret this command and respond appropriately. Be a "yes, and" game master - try to make the player's action work within reason.
IMPORTANT: If the player references something mentioned in the ROOM DESCRIPTION, respond consistently with that description. Do NOT contradict previously established details.

Respond in JSON format:
{
  "response": "The narrative response to show the player (2-4 sentences, second person)",
  "actionType": "LOOK|EXAMINE|TAKE|DROP|USE|TALK|MOVE|SKILL|OTHER",
  "targetId": "name of object/character targeted, if any",
  "stateChanges": { "any": "state changes to record" },
  "personalitySignal": {
    "dimension": "O|C|E|A|N or null if not personality-revealing",
    "delta": -10 to +10 score change (0 if not applicable),
    "confidence": 1-10 how clearly this reveals personality,
    "reasoning": "brief explanation of why this action reveals this trait"
  }${roomContext.requestSkillCheck ? `,
  "skillCheckDifficulty": <number 0-40>,
  "successNarrative": "What happens if the skill check succeeds (2-3 sentences)",
  "failureNarrative": "What happens if the skill check fails (2-3 sentences)"` : ''}
}

If the command doesn't make sense in context of the game, provide a helpful response guiding the player.
If the action reveals something about the player's personality (risk-taking, helpfulness, curiosity, etc.), include the personalitySignal.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5-20251101',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');

  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = textContent?.text || '{}';
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonText);
    return {
      response: parsed.response || "I don't understand that command.",
      actionType: parsed.actionType || 'OTHER',
      targetId: parsed.targetId,
      stateChanges: parsed.stateChanges,
      personalitySignal: parsed.personalitySignal?.dimension ? parsed.personalitySignal : undefined,
      skillCheckDifficulty: parsed.skillCheckDifficulty,
      successNarrative: parsed.successNarrative,
      failureNarrative: parsed.failureNarrative,
    };
  } catch {
    return {
      response: "I don't quite understand. Try commands like LOOK, EXAMINE [object], GO [direction], TAKE [object], or TALK TO [character].",
      actionType: 'OTHER',
    };
  }
}

/**
 * Generate a spectacular narrative for critical success (nat 20) or critical failure (nat 1)
 */
export async function generateSpectacularNarrative(
  storyId: string,
  command: string,
  skillName: string,
  resultType: 'critical_success' | 'critical_failure',
  roomContext: {
    room: Room;
    objects: Array<{ id: string; name: string; description: string | null }>;
    characters: Array<{ id: string; name: string; description: string | null }>;
  }
): Promise<string> {
  const context = await getStoryContext(storyId);

  const objectList = roomContext.objects.map(o => o.name).join(', ') || 'nothing of note';
  const characterList = roomContext.characters.map(c => c.name).join(', ') || 'no one';

  const isCriticalSuccess = resultType === 'critical_success';

  // Format player abilities for prompt
  const abilitiesList = context.playerAbilities.length > 0
    ? context.playerAbilities.map(a => `${a.name} (${a.level.toFixed(1)})`).join(', ')
    : 'none';

  const prompt = `You are the narrator for a ${context.genre} text adventure game.

CURRENT ROOM: ${roomContext.room.name}
OBJECTS HERE: ${objectList}
CHARACTERS HERE: ${characterList}

STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}
- Player skills: ${abilitiesList}

PLAYER ACTION: "${command}"
SKILL USED: ${skillName}
RESULT: ${isCriticalSuccess ? 'NATURAL 20 - CRITICAL SUCCESS!' : 'NATURAL 1 - CRITICAL FAILURE!'}
NOTE: When referencing the skill, use the exact name "${skillName}" as shown.

${isCriticalSuccess
  ? `Write a SPECTACULAR SUCCESS narrative. This is a moment of legend!
- The player succeeds beyond their wildest expectations
- Something unexpectedly wonderful happens as a bonus
- Make it memorable and exciting
- 3-4 sentences, vivid and dramatic`
  : `Write a SPECTACULAR FAILURE narrative. This is comedically or dramatically bad!
- The failure should be memorable but not game-ending
- Include an amusing or dramatic twist
- The player should face consequences but not be completely stuck
- 3-4 sentences, vivid and dramatic (can be darkly humorous)`}

Write in second person ("You..."). Match the ${context.tone} tone of the story.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');
  return textContent?.text || (isCriticalSuccess
    ? 'Against all odds, you succeed spectacularly!'
    : 'Things go terribly, hilariously wrong.');
}

/**
 * Generate a dilemma scenario for personality testing
 */
export async function generateDilemma(
  storyId: string,
  targetDimension: 'O' | 'C' | 'E' | 'A' | 'N',
  roomContext: Room
): Promise<{
  description: string;
  optionA: { description: string; personalityImplication: string };
  optionB: { description: string; personalityImplication: string };
}> {
  const context = await getStoryContext(storyId);

  const dimensionDescriptions: Record<string, string> = {
    O: 'Openness (curiosity vs. caution, creativity vs. convention)',
    C: 'Conscientiousness (planning vs. spontaneity, discipline vs. flexibility)',
    E: 'Extraversion (social engagement vs. solitude, assertiveness vs. reservation)',
    A: 'Agreeableness (cooperation vs. competition, trust vs. skepticism)',
    N: 'Neuroticism (emotional sensitivity vs. stability, caution vs. confidence)',
  };

  const prompt = `You are designing a moral/practical dilemma for a ${context.genre} text adventure game.

LOCATION: ${roomContext.name}
STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}

TARGET PERSONALITY DIMENSION: ${dimensionDescriptions[targetDimension]}

Create a compelling dilemma that reveals the player's tendency on this dimension. Both options should be reasonable - there's no "right" answer.

Requirements:
- The dilemma should feel natural to the story and setting
- Both options should be genuinely tempting
- The choice should reveal personality, not just preference
- Keep it concise and actionable

Respond in JSON format:
{
  "description": "The situation the player faces (2-3 sentences)",
  "optionA": {
    "description": "First option (1 sentence)",
    "personalityImplication": "What choosing this reveals about the player"
  },
  "optionB": {
    "description": "Second option (1 sentence)",
    "personalityImplication": "What choosing this reveals about the player"
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find(c => c.type === 'text');

  try {
    let jsonText = textContent?.text || '{}';
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    return JSON.parse(jsonText);
  } catch {
    return {
      description: 'You face a difficult choice.',
      optionA: { description: 'Take the first path.', personalityImplication: 'Shows decisiveness.' },
      optionB: { description: 'Take the second path.', personalityImplication: 'Shows caution.' },
    };
  }
}

/**
 * Extract discoverable items from an AI response and create them as game objects
 */
export async function extractAndCreateDiscoveredItems(
  storyId: string,
  roomId: string,
  aiResponse: string,
  existingObjectNames: string[]
): Promise<Array<{ name: string; description: string }>> {
  const context = await getStoryContext(storyId);

  // Get existing objects to avoid duplicates
  const existingNamesLower = existingObjectNames.map(n => n.toLowerCase());

  const prompt = `Analyze this game narrative response and extract ANY specific items mentioned that a player might want to examine or interact with.

NARRATIVE:
"${aiResponse}"

ITEMS ALREADY IN THIS ROOM: ${existingObjectNames.length > 0 ? existingObjectNames.join(', ') : 'none'}

IMPORTANT: Be THOROUGH in extracting items. Extract ANY specific object mentioned, including:
- Items on surfaces (on mantelpieces, tables, shelves, etc.)
- Items in containers (in boxes, on racks, etc.)
- Decorative items (drawings, flowers, trinkets, tokens, etc.)
- Items being worn or held by characters
- Items that are part of furniture (drawer, handle, etc.) if specifically mentioned
- Documents, papers, books, notes
- Small objects like stones, keys, coins, jewelry

DO NOT extract:
- Generic structural elements (walls, floor, ceiling)
- The furniture itself unless it's specifically interactable (extract "brass drawer" not "desk")
- Abstract concepts
- Items already in the existing items list

For EACH new item found, provide:
- name: A short name (2-4 words) matching how it was described in the narrative
- description: The description from the narrative, preserving WHERE the item was mentioned (e.g., "A child's drawing resting on the stone mantelpiece")
- isTakeable: true if it could be picked up (most small items), false if it's fixed/attached
- synonyms: array of 2-4 alternative names players might use to refer to this object

Extract ALL mentioned items. If 3 items are on a mantelpiece, extract all 3.

Respond ONLY with a JSON array:
[
  { "name": "item name", "description": "brief description including location", "isTakeable": true, "synonyms": ["alt1", "alt2"] }
]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    let jsonText = textContent?.text || '[]';

    // Extract JSON from potential markdown code blocks
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Also try to find array directly
    const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    }

    const items = JSON.parse(jsonText);

    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    // Create the discovered items in the database
    const createdItems: Array<{ name: string; description: string }> = [];

    for (const item of items) {
      // Skip if item already exists (case-insensitive check)
      // Also check for items with * prefix (already discovered items)
      const itemNameLower = item.name.toLowerCase();
      if (existingNamesLower.some(existing => {
        const existingClean = existing.replace(/^\*/, '');
        return existingClean.includes(itemNameLower) ||
               itemNameLower.includes(existingClean) ||
               existing.includes(itemNameLower) ||
               itemNameLower.includes(existing);
      })) {
        continue;
      }

      // Prefix with * to indicate this is a dynamically discovered item
      const itemName = `*${item.name}`;

      // Create the game object
      await prisma.gameObject.create({
        data: {
          storyId,
          roomId,
          name: itemName,
          description: item.description,
          synonyms: item.synonyms || [],
          isTakeable: item.isTakeable ?? true,
          state: { discoveredFrom: 'ai_response' },
        },
      });

      createdItems.push({ name: itemName, description: item.description });
    }

    return createdItems;
  } catch (error) {
    console.error('Error extracting discovered items:', error);
    return [];
  }
}

/**
 * Extract newly accessible passages/rooms from an AI response and create them
 * Supports both physical (grid-adjacent) and magical (portal/teleport) connections
 */
export async function extractAndCreateDiscoveredPassages(
  storyId: string,
  currentRoomId: string,
  aiResponse: string,
  command: string
): Promise<{ direction: string; roomName: string; isPortal?: boolean } | null> {
  // Only check for passages when the command suggests opening/entering
  const passageCommands = /\b(open|enter|go through|push|pull|unlock|break down|cast|activate|use|step into|touch)\b/i;
  if (!passageCommands.test(command)) {
    return null;
  }

  // Check if the response suggests a new accessible area
  const passageIndicators = /\b(reveals?|opens? to|leads? (to|into)|beyond|stretches|corridor|hallway|passage|room beyond|door (swings?|opens?)|portal|teleport|transport|warp|dimension|realm|appears?|materializes?)\b/i;
  if (!passageIndicators.test(aiResponse)) {
    return null;
  }

  // Detect if this is a magical/portal connection vs physical
  const portalIndicators = /\b(portal|teleport|warp|dimension|realm|magic|spell|rift|vortex|gateway|astral|planar|otherworld|void|beam|transport|materialize|shimmer|glow|energy|arcane)\b/i;
  const isLikelyPortal = portalIndicators.test(aiResponse) || portalIndicators.test(command);

  // Get current room to find coordinates and check grid
  const currentRoom = await prisma.room.findUnique({
    where: { id: currentRoomId },
  });

  if (!currentRoom) {
    return null;
  }

  // Direction offsets for grid calculations
  const directionOffsets: Record<string, { x: number; y: number; z: number }> = {
    north: { x: 0, y: 1, z: 0 },
    south: { x: 0, y: -1, z: 0 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    down: { x: 0, y: 0, z: -1 },
  };

  const oppositeDirections: Record<string, string> = {
    north: 'south', south: 'north',
    east: 'west', west: 'east',
    up: 'down', down: 'up',
  };

  // Check which directions already have exits
  const existingExits: string[] = [];
  if (currentRoom.northRoomId) existingExits.push('north');
  if (currentRoom.southRoomId) existingExits.push('south');
  if (currentRoom.eastRoomId) existingExits.push('east');
  if (currentRoom.westRoomId) existingExits.push('west');
  if (currentRoom.upRoomId) existingExits.push('up');
  if (currentRoom.downRoomId) existingExits.push('down');

  // Check which directions have rooms on the grid (even if not connected)
  const occupiedDirections: string[] = [...existingExits];
  const availableDirections: string[] = [];

  for (const [dir, offset] of Object.entries(directionOffsets)) {
    if (existingExits.includes(dir)) continue;

    const checkX = currentRoom.x + offset.x;
    const checkY = currentRoom.y + offset.y;
    const checkZ = currentRoom.z + offset.z;

    const roomAtCoords = await prisma.room.findUnique({
      where: {
        storyId_x_y_z: { storyId, x: checkX, y: checkY, z: checkZ },
      },
    });

    if (roomAtCoords) {
      occupiedDirections.push(dir);
    } else {
      availableDirections.push(dir);
    }
  }

  // If no directions are available for physical passages, check if it might be a portal
  if (availableDirections.length === 0 && !isLikelyPortal) {
    console.log('No available directions for new room - grid is full around current room');
    return null;
  }

  const context = await getStoryContext(storyId);

  // Different prompts for portal vs physical passage
  const prompt = isLikelyPortal
    ? `Analyze this game response to determine if a PORTAL, TELEPORTER, or MAGICAL GATEWAY has been opened.

PLAYER COMMAND: "${command}"

GAME RESPONSE:
"${aiResponse}"

STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}

CURRENT ROOM: "${currentRoom.name}"

Does this response describe opening a portal/gateway to a NEW location?
- Portals can lead anywhere - another dimension, the moon, across the world, etc.
- The destination does NOT need to be physically adjacent

Respond ONLY with JSON:
{
  "createsPassage": true/false,
  "isPortal": true,
  "newRoom": {
    "name": "Destination Name (2-4 words)",
    "description": "Brief atmospheric description of the destination",
    "direction": "through" // Use "through" for portals, or a cardinal direction if it makes sense
  },
  "isTemporary": true/false,
  "isOneWay": true/false
}

If no portal is created, respond with: {"createsPassage": false}`
    : `Analyze this game response to determine if a NEW passageway or room has been revealed that the player can now enter.

PLAYER COMMAND: "${command}"

GAME RESPONSE:
"${aiResponse}"

STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}

CURRENT ROOM: "${currentRoom.name}" at grid position (${currentRoom.x}, ${currentRoom.y}, ${currentRoom.z})
EXISTING EXITS: ${existingExits.length > 0 ? existingExits.join(', ') : 'none'}
AVAILABLE DIRECTIONS FOR NEW ROOMS: ${availableDirections.join(', ')}

Does this response describe opening access to a NEW area the player can now enter?
- If YES: What is the area called? Pick a direction from the AVAILABLE DIRECTIONS only.
- If NO: The response is just descriptive without creating a new accessible area

IMPORTANT: You MUST choose a direction from the available directions list: ${availableDirections.join(', ')}

Respond ONLY with JSON:
{
  "createsPassage": true/false,
  "newRoom": {
    "name": "Room Name (2-4 words)",
    "description": "Brief atmospheric description",
    "direction": "${availableDirections[0]}" // Must be one of: ${availableDirections.join(', ')}
  }
}

If no new passage is created, respond with: {"createsPassage": false}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    let jsonText = textContent?.text || '{}';

    // Extract JSON
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    if (!parsed.createsPassage || !parsed.newRoom) {
      return null;
    }

    const isPortal = parsed.isPortal || isLikelyPortal;
    const isTemporary = parsed.isTemporary || false;
    const isOneWay = parsed.isOneWay || false;

    let direction = parsed.newRoom.direction?.toLowerCase() || 'through';
    let newX: number, newY: number, newZ: number;

    if (isPortal) {
      // Portal destinations are placed in a separate "dimension" on the grid
      // Use large offsets to separate them from the main map
      // Each portal destination gets a unique position based on a hash or counter

      // Find a free spot in the "portal dimension" (z = 100+)
      const portalZ = 100; // Portal destinations start at z=100
      let portalX = 0;
      let portalY = 0;

      // Find an empty spot in the portal dimension
      let attempts = 0;
      let foundSpot = false;
      while (!foundSpot && attempts < 100) {
        const existingAtSpot = await prisma.room.findUnique({
          where: {
            storyId_x_y_z: { storyId, x: portalX, y: portalY, z: portalZ },
          },
        });
        if (!existingAtSpot) {
          foundSpot = true;
        } else {
          // Spiral outward to find empty spot
          portalX = Math.floor(attempts / 2) * (attempts % 2 === 0 ? 1 : -1);
          portalY = Math.floor((attempts + 1) / 2) * ((attempts + 1) % 2 === 0 ? 1 : -1);
          attempts++;
        }
      }

      newX = portalX;
      newY = portalY;
      newZ = portalZ;

      // For portals, use "through" as direction if not a cardinal direction
      if (!['north', 'south', 'east', 'west', 'up', 'down'].includes(direction)) {
        direction = 'through';
      }
    } else {
      // Physical passage - use grid-adjacent positioning
      // Validate direction is actually available - if not, pick the first available
      if (!availableDirections.includes(direction)) {
        console.log(`AI suggested unavailable direction "${direction}", using "${availableDirections[0]}" instead`);
        direction = availableDirections[0];
      }

      const offset = directionOffsets[direction];
      newX = currentRoom.x + offset.x;
      newY = currentRoom.y + offset.y;
      newZ = currentRoom.z + offset.z;
    }

    // Check if room already exists at target coordinates
    const existingRoom = await prisma.room.findUnique({
      where: {
        storyId_x_y_z: { storyId, x: newX, y: newY, z: newZ },
      },
    });

    if (existingRoom && !isPortal) {
      // For physical passages, connect to existing room
      // Also reveal this exit if it was hidden (player just discovered the passage)
      const currentHiddenExits = (currentRoom.hiddenExits as string[]) || [];
      const currentDiscoveredExits = (currentRoom.discoveredExits as string[]) || [];

      const updateData: Record<string, unknown> = { [`${direction}RoomId`]: existingRoom.id };

      // If this direction was hidden, mark it as discovered
      if (currentHiddenExits.includes(direction) && !currentDiscoveredExits.includes(direction)) {
        updateData.discoveredExits = [...currentDiscoveredExits, direction];
      }

      await prisma.room.update({
        where: { id: currentRoomId },
        data: updateData,
      });

      if (!isOneWay) {
        const oppositeDir = oppositeDirections[direction];
        const existingHiddenExits = (existingRoom.hiddenExits as string[]) || [];
        const existingDiscoveredExits = (existingRoom.discoveredExits as string[]) || [];

        const existingUpdateData: Record<string, unknown> = { [`${oppositeDir}RoomId`]: currentRoomId };

        // If the opposite direction was hidden in the existing room, mark it as discovered
        if (existingHiddenExits.includes(oppositeDir) && !existingDiscoveredExits.includes(oppositeDir)) {
          existingUpdateData.discoveredExits = [...existingDiscoveredExits, oppositeDir];
        }

        await prisma.room.update({
          where: { id: existingRoom.id },
          data: existingUpdateData,
        });
      }

      return { direction, roomName: existingRoom.name };
    }

    // Create the new room
    const newRoom = await prisma.room.create({
      data: {
        storyId,
        name: parsed.newRoom.name,
        description: parsed.newRoom.description,
        x: newX,
        y: newY,
        z: newZ,
        isGenerated: true,
        atmosphere: isPortal ? { isPortalDestination: true, isTemporary, sourceRoomId: currentRoomId } : {},
        hiddenExits: [], // Dynamically created rooms start with no hidden exits
        discoveredExits: [], // All exits are visible by default
      },
    });

    // Connect the rooms
    if (isPortal) {
      // For portals, we need to handle "through" direction specially
      // Store portal connection in room state/atmosphere since it's not a cardinal direction
      if (direction === 'through') {
        // Update current room to have a portal exit
        const currentAtmosphere = (currentRoom.atmosphere as Record<string, unknown>) || {};
        await prisma.room.update({
          where: { id: currentRoomId },
          data: {
            atmosphere: {
              ...currentAtmosphere,
              portalTo: newRoom.id,
              portalName: parsed.newRoom.name,
              portalIsTemporary: isTemporary,
            },
          },
        });

        // If not one-way, create return portal
        if (!isOneWay) {
          await prisma.room.update({
            where: { id: newRoom.id },
            data: {
              atmosphere: {
                isPortalDestination: true,
                portalTo: currentRoomId,
                portalName: currentRoom.name,
                returnPortal: true,
              },
            },
          });
        }
      } else {
        // Cardinal direction portal - use normal room connections
        await prisma.room.update({
          where: { id: currentRoomId },
          data: { [`${direction}RoomId`]: newRoom.id },
        });

        if (!isOneWay) {
          await prisma.room.update({
            where: { id: newRoom.id },
            data: { [`${oppositeDirections[direction]}RoomId`]: currentRoomId },
          });
        }
      }

      console.log(`Created portal destination "${newRoom.name}" at (${newX}, ${newY}, ${newZ}) - ${isOneWay ? 'one-way' : 'two-way'} ${isTemporary ? 'temporary ' : ''}portal from "${currentRoom.name}"`);
    } else {
      // Physical passage - bidirectional connection
      // Also reveal this exit if it was hidden (player just discovered the passage)
      const currentHiddenExits = (currentRoom.hiddenExits as string[]) || [];
      const currentDiscoveredExits = (currentRoom.discoveredExits as string[]) || [];

      const updateData: Record<string, unknown> = { [`${direction}RoomId`]: newRoom.id };

      // If this direction was hidden, mark it as discovered
      if (currentHiddenExits.includes(direction) && !currentDiscoveredExits.includes(direction)) {
        updateData.discoveredExits = [...currentDiscoveredExits, direction];
      }

      await prisma.room.update({
        where: { id: currentRoomId },
        data: updateData,
      });

      await prisma.room.update({
        where: { id: newRoom.id },
        data: { [`${oppositeDirections[direction]}RoomId`]: currentRoomId },
      });

      console.log(`Created new room "${newRoom.name}" at (${newX}, ${newY}, ${newZ}) - ${direction} of "${currentRoom.name}"`);
    }

    return { direction, roomName: parsed.newRoom.name, isPortal };
  } catch (error) {
    console.error('Error extracting discovered passages:', error);
    return null;
  }
}

/**
 * Extract and create timed events from an AI response
 * Detects countdowns, alarms, approaching threats, timers, etc.
 */
export async function extractAndCreateTimedEvents(
  storyId: string,
  roomId: string,
  aiResponse: string,
  command: string
): Promise<{ eventName: string; turnsRemaining: number } | null> {
  // Check for indicators of timed/countdown events
  const timerIndicators = /\b(countdown|timer|alarm|approaching|arriving|coming|moments?|minutes?|seconds?|will (arrive|come|happen|explode|trigger|activate)|getting closer|footsteps|ticking|hurry|running out of time|before|until|remaining|about to)\b/i;

  if (!timerIndicators.test(aiResponse)) {
    return null;
  }

  const context = await getStoryContext(storyId);

  const prompt = `Analyze this game narrative response to determine if a TIMED EVENT has been initiated - something bad (or significant) that will happen after a countdown of player turns.

PLAYER COMMAND: "${command}"

GAME RESPONSE:
"${aiResponse}"

STORY CONTEXT:
- Genre: ${context.genre}
- Tone: ${context.tone}

Examples of timed events:
- An alarm triggers and guards will arrive in several turns
- A bomb countdown has started
- A creature is approaching and will attack soon
- A ritual is in progress and will complete in X turns
- A door is slowly closing
- Something is waking up

If a timed event is present, determine:
1. Event name (short, descriptive)
2. Total turns until it triggers (3-10 is typical, based on urgency described)
3. What happens when it triggers (consequence type)
4. Progress narratives at key turn points
5. Whether the player can prevent it
6. A hint about how to prevent it (if applicable)

Respond ONLY with JSON:
{
  "hasTimedEvent": true/false,
  "event": {
    "name": "Guard Patrol Arrival",
    "description": "Guards are responding to the alarm and heading this way",
    "totalTurns": 5,
    "progressNarratives": [
      { "atTurns": 4, "narrative": "You hear boots echoing in the distance." },
      { "atTurns": 3, "narrative": "The footsteps grow louder. They're getting closer." },
      { "atTurns": 2, "narrative": "Voices shout commands nearby. You're running out of time!" },
      { "atTurns": 1, "narrative": "The guards are almost here! You hear them just around the corner!" }
    ],
    "triggerNarrative": "The guards burst into the room, weapons drawn! 'There you are!' one shouts.",
    "consequence": {
      "type": "game_over|damage|room_change|character_action|story_branch|custom",
      "data": {}
    },
    "canBePrevented": true,
    "preventionHint": "Find a place to hide or escape before they arrive"
  }
}

If no timed event is created, respond with: {"hasTimedEvent": false}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    let jsonText = textContent?.text || '{}';

    // Extract JSON
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    if (!parsed.hasTimedEvent || !parsed.event) {
      return null;
    }

    const eventData = parsed.event;

    // Create the timed event using the service
    const createdEvent = await timedEventService.createTimedEvent({
      storyId,
      roomId,
      name: eventData.name,
      description: eventData.description,
      totalTurns: eventData.totalTurns,
      progressNarratives: eventData.progressNarratives || [],
      triggerNarrative: eventData.triggerNarrative,
      consequence: eventData.consequence || { type: 'custom' },
      canBePrevented: eventData.canBePrevented ?? true,
      preventionHint: eventData.preventionHint,
    });

    console.log(`Created timed event "${eventData.name}" with ${eventData.totalTurns} turns remaining`);

    return {
      eventName: eventData.name,
      turnsRemaining: eventData.totalTurns,
    };
  } catch (error) {
    console.error('Error extracting timed events:', error);
    return null;
  }
}

/**
 * Detect characters mentioned in AI response and move them to the current room
 * This ensures narrative consistency - if the AI says a character is present, they are present
 */
export async function updateCharacterPresence(
  storyId: string,
  roomId: string,
  aiResponse: string
): Promise<Array<{ name: string; movedFrom: string | null }>> {
  // Get all characters in this story
  const allCharacters = await prisma.character.findMany({
    where: { storyId },
    select: {
      id: true,
      name: true,
      currentRoomId: true,
      currentRoom: { select: { name: true } },
    },
  });

  if (allCharacters.length === 0) {
    return [];
  }

  const responseLower = aiResponse.toLowerCase();
  const movedCharacters: Array<{ name: string; movedFrom: string | null }> = [];

  for (const character of allCharacters) {
    // Skip if character is already in this room
    if (character.currentRoomId === roomId) {
      continue;
    }

    // Check if character is mentioned in the response
    // Use word boundary matching to avoid partial matches
    const nameLower = character.name.toLowerCase();
    const nameWords = nameLower.split(/\s+/);

    // Check for full name or significant parts (first name, last name)
    let isMentioned = false;

    // Check full name
    if (responseLower.includes(nameLower)) {
      isMentioned = true;
    }

    // Check individual name parts (for names like "Dr. Chen" or "Marcus Webb")
    // Only match if the word appears as a standalone word (with word boundaries)
    if (!isMentioned) {
      for (const word of nameWords) {
        if (word.length >= 3) { // Skip short words like "Dr", "Mr", etc.
          const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
          if (wordRegex.test(aiResponse)) {
            isMentioned = true;
            break;
          }
        }
      }
    }

    if (isMentioned) {
      // Check if the context suggests the character is PRESENT (not just mentioned)
      // Look for presence indicators near the character name
      const presenceIndicators = [
        'is here', 'stands', 'sitting', 'working', 'appears', 'notices you',
        'looks at', 'says', 'replies', 'asks', 'tells', 'explains', 'greets',
        'approaches', 'enters', 'arrives', 'waiting', 'busy', 'focused',
        'turns to', 'glances', 'watches', 'observes', 'nods', 'shakes',
        'gestures', 'points', 'shows', 'hands you', 'offers', 'gives'
      ];

      const nameIndex = responseLower.indexOf(nameLower);
      const contextStart = Math.max(0, nameIndex - 50);
      const contextEnd = Math.min(responseLower.length, nameIndex + nameLower.length + 100);
      const context = responseLower.substring(contextStart, contextEnd);

      const isPresent = presenceIndicators.some(indicator => context.includes(indicator));

      if (isPresent) {
        // Move the character to this room
        const previousRoom = character.currentRoom?.name || null;

        await prisma.character.update({
          where: { id: character.id },
          data: { currentRoomId: roomId },
        });

        movedCharacters.push({
          name: character.name,
          movedFrom: previousRoom,
        });

        console.log(`Character "${character.name}" moved to room (mentioned in AI response)`);
      }
    }
  }

  return movedCharacters;
}
