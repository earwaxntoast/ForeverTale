import Anthropic from '@anthropic-ai/sdk';
import logger from '../../../utils/logger.js';
import {
  GenerationContext,
  IdentityData,
  InitialMapData,
  ConnectingAreasData,
  CharactersData,
  BackstoryData,
  StoryBeatsData,
  PuzzlesData,
  StartingSkillsData,
  SecretFactsData,
  CoherencePassData,
  RoomUpdate,
  ObjectUpdate,
  CharacterUpdate,
  OpeningData,
} from './types.js';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';
const FAST_MODEL = 'claude-3-5-haiku-20241022'; // Fast model for simpler tasks

// Attempt to repair common JSON issues from AI responses
function repairJson(jsonText: string): string {
  let repaired = jsonText.trim();

  // Check if this looks like multiple objects without array wrapper
  // Pattern: starts with {, ends with }, but has },{  in the middle (comma-separated objects)
  if (repaired.startsWith('{') && repaired.endsWith('}') && !repaired.startsWith('[')) {
    // Check if there's a },{ pattern indicating multiple objects
    if (/\}\s*,\s*\{/.test(repaired)) {
      // Wrap in array brackets
      repaired = '[' + repaired + ']';
    }
  }

  // Remove trailing commas before closing brackets/braces
  // Match: comma followed by optional whitespace/newlines, then ] or }
  repaired = repaired.replace(/,(\s*[\]}])/g, '$1');

  // Fix unescaped newlines in strings (common AI mistake)
  // This is tricky - we need to find strings and escape newlines within them
  // For now, replace literal newlines within what looks like string content

  // Fix truncated JSON by attempting to close brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Add missing closing brackets/braces
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  // Fix common quote issues - unescaped quotes in strings
  // Look for patterns like "text "with" quotes" and try to escape them
  // This is a heuristic and may not catch all cases

  return repaired;
}

// Find the position context in JSON for error messages
function getJsonErrorContext(jsonText: string, position: number): string {
  const start = Math.max(0, position - 50);
  const end = Math.min(jsonText.length, position + 50);
  const before = jsonText.slice(start, position);
  const after = jsonText.slice(position, end);
  return `...${before}<<<ERROR HERE>>>${after}...`;
}

// Helper to parse JSON from AI response with repair attempts
function parseJsonResponse<T>(response: Anthropic.Message, stepName?: string): T {
  const textContent = response.content.find(c => c.type === 'text');
  let jsonText = textContent?.text || '{}';
  const originalLength = jsonText.length;

  // Extract JSON from markdown code blocks if present
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  } else {
    // Try to find raw JSON object
    const rawMatch = jsonText.match(/\{[\s\S]*\}/);
    if (rawMatch) {
      jsonText = rawMatch[0];
    }
  }

  // First attempt: parse as-is
  try {
    return JSON.parse(jsonText) as T;
  } catch (firstError) {
    logger.warn('STORY_GEN', `Initial JSON parse failed for ${stepName || 'unknown step'}, attempting repair...`);

    // Log a snippet of the problematic area
    if (firstError instanceof SyntaxError) {
      const posMatch = firstError.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        logger.warn('STORY_GEN', `Error context: ${getJsonErrorContext(jsonText, pos)}`);
      }
    }

    // Second attempt: try to repair common issues
    const repairedJson = repairJson(jsonText);

    try {
      const result = JSON.parse(repairedJson) as T;
      logger.info('STORY_GEN', `JSON repair successful for ${stepName || 'unknown step'}`);
      return result;
    } catch (secondError) {
      // Log the raw response for debugging
      logger.error('STORY_GEN', `JSON parsing failed for ${stepName || 'unknown step'}`);
      logger.error('STORY_GEN', `Original response length: ${originalLength}, extracted JSON length: ${jsonText.length}`);
      logger.error('STORY_GEN', `First 500 chars: ${jsonText.slice(0, 500)}`);
      logger.error('STORY_GEN', `Last 500 chars: ${jsonText.slice(-500)}`);

      // Re-throw with more context
      throw new Error(`JSON parsing failed for ${stepName}: ${secondError instanceof Error ? secondError.message : 'Unknown error'}. Response length: ${jsonText.length} chars.`);
    }
  }
}

// Format interview for prompts
function formatInterview(exchanges: { question: string; answer: string }[]): string {
  return exchanges.map(e => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n');
}

// ============================================
// Step 1: Generate Identity
// ============================================
export async function generateIdentity(context: GenerationContext): Promise<IdentityData> {
  // Build the preference instruction
  const preferenceInstruction = context.playerStoryPreference
    ? `
CRITICAL - PLAYER'S STORY PREFERENCE (HIGHEST PRIORITY):
"${context.playerStoryPreference}"

The player has explicitly chosen this type of story. Their preference MUST take priority over any conflicting themes from the interview. For example:
- If the interview suggested sci-fi themes but the player wants fantasy, create a FANTASY story
- If the interview suggested horror but the player wants romance, create a ROMANCE story
- Incorporate the interview personality traits into the player's chosen genre, but the genre/setting MUST match their preference

`
    : '';

  const prompt = `Based on this player interview, create a unique story identity.

PLAYER NAME: ${context.playerName}
${preferenceInstruction}
INTERVIEW:
${formatInterview(context.interviewExchanges)}

EXTRACTED THEMES FROM INTERVIEW: ${context.extractedThemes.join(', ')}
${context.playerStoryPreference ? '(Note: Use these themes for personality/character traits, but let the player\'s story preference dictate the genre and setting)' : ''}

Generate a story identity that:
1. ${context.playerStoryPreference ? `Uses the genre/setting the player explicitly requested: "${context.playerStoryPreference}"` : 'Reflects themes suggested by the interview'}
2. Incorporates the player's personality traits revealed in the interview
3. Creates an engaging world that feels personal to this specific player

Return ONLY valid JSON matching this structure:
{
  "title": "An evocative story title",
  "genreBlend": ["genre1", "genre2"], // 2-3 genres that blend together${context.playerStoryPreference ? ' - MUST align with player preference' : ''}
  "tone": "mysterious", // one of: mysterious, humorous, dark, whimsical, dramatic, tense, melancholic, hopeful
  "centralConflict": "The main conflict driving the story",
  "keyThemes": ["theme1", "theme2", "theme3"], // 3-5 themes
  "settingEra": "Description of setting and time period"${context.playerStoryPreference ? ' - MUST match player preference' : ''},
  "worldRules": ["rule1", "rule2"] // Special rules of this world
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<IdentityData>(response, 'identity');
}

// ============================================
// Step 2: Generate Initial Map
// ============================================
export async function generateInitialMap(context: GenerationContext): Promise<InitialMapData> {
  const identity = context.stepData.identity!;

  const prompt = `Design a game map for this story. Create 15-30 interconnected rooms on a grid.

STORY IDENTITY:
- Title: ${identity.title}
- Genres: ${identity.genreBlend.join(', ')}
- Tone: ${identity.tone}
- Setting: ${identity.settingEra}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}
- World Rules: ${identity.worldRules.join(', ')}

REQUIREMENTS:
1. Create 15-30 rooms with x,y,z coordinates forming a connected map
2. Room (0,0,0) should be the starting location
3. Adjacent rooms should share thematic connections (no jarring transitions)
4. Include a variety of thematic roles: sanctuary, danger, mystery, resource, transition, landmark, hidden
5. Mark 5-8 rooms as story-critical locations
6. Ensure the map is navigable - no isolated rooms
7. Use z-coordinate for different levels (0 = ground, positive = up, negative = down)

VEHICLES (if appropriate for the setting):
- Consider adding 0-3 vehicles that make sense for the story's setting
- Vehicles are ROOMS that players can enter and travel between locations
- Good vehicle examples by setting:
  - Fantasy: ship, carriage, flying carpet, dragon mount
  - Sci-fi: spaceship, hovercraft, teleporter pod
  - Modern: car, boat, subway, elevator
  - Historical: wagon, steamship, hot air balloon
- Vehicles should be docked at a room that makes thematic sense (boat at dock, car at garage)
- Only include vehicles if they enhance the story - not every story needs them
- Vehicles use z=180-199 coordinates (this range is reserved for vehicles)

Return ONLY valid JSON:
{
  "mapTheme": "Overall description of the map's theme and feel",
  "startingRoomIndex": 0,
  "rooms": [
    {
      "name": "Room Name",
      "x": 0, "y": 0, "z": 0,
      "briefDescription": "One sentence description",
      "thematicRole": "sanctuary", // sanctuary, danger, mystery, resource, transition, landmark, hidden
      "isStoryCritical": true,
      "suggestedAtmosphere": {
        "lighting": "dim candlelight",
        "mood": "tense anticipation",
        "sounds": "distant echoes",
        "smells": "old parchment"
      },
      "exits": { "north": true, "east": true } // which directions have exits
    },
    {
      "name": "Old Fishing Boat",
      "x": 0, "y": 0, "z": 180,
      "briefDescription": "A weathered but seaworthy vessel",
      "thematicRole": "resource",
      "isStoryCritical": false,
      "isVehicle": true,
      "vehicleType": "water",
      "boardingKeywords": ["boat", "vessel", "ship"],
      "dockedAtRoomName": "The Docks",
      "suggestedAtmosphere": {
        "lighting": "natural light filtering through weathered planks",
        "mood": "adventure and possibility",
        "sounds": "creaking wood, lapping water",
        "smells": "salt air and old rope"
      },
      "exits": {}
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<InitialMapData>(response, 'initialMap');
}

// ============================================
// Step 3: Generate Connecting Areas (Two-Phase Parallel)
// ============================================

// Helper: Split array into batches
function splitIntoBatches<T>(arr: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < arr.length; i += batchSize) {
    batches.push(arr.slice(i, i + batchSize));
  }
  return batches;
}

// Phase 3a: Generate room descriptions for a batch (Sonnet)
interface RoomDescriptionResult {
  name: string;
  fullDescription: string;
  connectionDescriptions: Array<{
    direction: string;
    targetRoomName: string;
    descriptionFromHere: string;
    descriptionFromThere: string;
    isHidden: boolean;
    hiddenUntil?: string;
  }>;
  knownDestinationRoomNames?: string[];
}

async function generateRoomDescriptionsBatch(
  identity: IdentityData,
  rooms: Array<{
    name: string;
    briefDescription: string;
    thematicRole: string;
    isVehicle?: boolean;
    vehicleType?: string;
    dockedAtRoomName?: string;
    adjacentRooms: Array<{ direction: string; name: string; brief: string }>;
  }>,
  mapTheme: string,
  allRoomNames: string[]
): Promise<RoomDescriptionResult[]> {
  const prompt = `Expand these ${rooms.length} room descriptions with full details and coherent connections.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Setting: ${identity.settingEra}
- Themes: ${identity.keyThemes.join(', ')}

MAP THEME: ${mapTheme}

ROOMS TO EXPAND:
${JSON.stringify(rooms, null, 2)}

ALL ROOM NAMES IN WORLD (for vehicle destinations): ${allRoomNames.join(', ')}

REQUIREMENTS:
1. Write a 2-3 paragraph full description for each room
2. For each exit (from adjacentRooms), describe BOTH directions:
   - descriptionFromHere: how the exit looks from this room
   - descriptionFromThere: how it looks from the other side (matching style)
3. Mark 15-25% of exits as HIDDEN (isHidden: true)
   - Hidden exits should NOT be mentioned in fullDescription
   - Include "hiddenUntil" describing what reveals it (e.g., "examine bookcase")
4. For vehicles (isVehicle=true): include knownDestinationRoomNames (2-4 destinations)

Return ONLY valid JSON array:
[
  {
    "name": "Room Name",
    "fullDescription": "2-3 paragraphs...",
    "connectionDescriptions": [
      {
        "direction": "north",
        "targetRoomName": "Other Room",
        "descriptionFromHere": "A door leads north...",
        "descriptionFromThere": "A door leads south...",
        "isHidden": false
      }
    ],
    "knownDestinationRoomNames": ["Port A", "Port B"]
  }
]`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<RoomDescriptionResult[]>(response, 'roomDescriptions');
}

// Phase 3b: Generate objects for a single room (Haiku - fast)
interface RoomObjectsResult {
  objects: Array<{
    name: string;
    description: string;
    synonyms: string[];
    isTakeable: boolean;
    isStoryCritical: boolean;
  }>;
}

async function generateRoomObjects(
  identity: IdentityData,
  room: {
    name: string;
    fullDescription: string;
    thematicRole: string;
    isVehicle?: boolean;
  }
): Promise<RoomObjectsResult> {
  const prompt = `Generate 2-4 interactive objects for this room.

STORY: ${identity.title} (${identity.tone})
THEMES: ${identity.keyThemes.join(', ')}

ROOM: ${room.name}
TYPE: ${room.thematicRole}${room.isVehicle ? ' (VEHICLE)' : ''}
DESCRIPTION: ${room.fullDescription}

Create objects that:
- Fit the room's atmosphere and purpose
- Include a mix of takeable and fixed items
- Have 2-4 synonyms each (alternative names players might use)

Return ONLY valid JSON:
{
  "objects": [
    { "name": "Object Name", "description": "Brief description", "synonyms": ["alt1", "alt2"], "isTakeable": true, "isStoryCritical": false }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    return parseJsonResponse<RoomObjectsResult>(response, 'roomObjects');
  } catch (error) {
    console.error(`Error generating objects for room ${room.name}:`, error);
    // Return empty objects on error - room will still work
    return { objects: [] };
  }
}

// Main orchestrator for Step 3
export async function generateConnectingAreas(context: GenerationContext): Promise<ConnectingAreasData> {
  const identity = context.stepData.identity!;
  const initialMap = context.stepData.initialMap!;

  console.log(`[Phase 3] Starting two-phase generation for ${initialMap.rooms.length} rooms`);
  const startTime = Date.now();

  // Build a map of rooms for reference
  const roomsByCoord = new Map<string, typeof initialMap.rooms[0]>();
  for (const room of initialMap.rooms) {
    roomsByCoord.set(`${room.x},${room.y},${room.z}`, room);
  }

  // Find adjacent rooms for each room
  function getAdjacentRooms(room: typeof initialMap.rooms[0]) {
    const adjacent: { direction: string; room: typeof initialMap.rooms[0] }[] = [];
    const checks = [
      { dir: 'north', dx: 0, dy: 1, dz: 0 },
      { dir: 'south', dx: 0, dy: -1, dz: 0 },
      { dir: 'east', dx: 1, dy: 0, dz: 0 },
      { dir: 'west', dx: -1, dy: 0, dz: 0 },
      { dir: 'up', dx: 0, dy: 0, dz: 1 },
      { dir: 'down', dx: 0, dy: 0, dz: -1 },
    ];
    for (const check of checks) {
      if (room.exits[check.dir as keyof typeof room.exits]) {
        const key = `${room.x + check.dx},${room.y + check.dy},${room.z + check.dz}`;
        const adj = roomsByCoord.get(key);
        if (adj) adjacent.push({ direction: check.dir, room: adj });
      }
    }
    return adjacent;
  }

  // Prepare rooms with adjacency info
  const roomsWithAdjacent = initialMap.rooms.map(room => ({
    name: room.name,
    briefDescription: room.briefDescription,
    thematicRole: room.thematicRole,
    isVehicle: room.isVehicle,
    vehicleType: room.vehicleType,
    dockedAtRoomName: room.dockedAtRoomName,
    adjacentRooms: getAdjacentRooms(room).map(a => ({
      direction: a.direction,
      name: a.room.name,
      brief: a.room.briefDescription
    }))
  }));

  const allRoomNames = initialMap.rooms.map(r => r.name);

  // ============================================
  // PHASE 3a: Room Descriptions (Sonnet, batched in parallel)
  // ============================================
  console.log(`[Phase 3a] Generating room descriptions in batches...`);
  const phase3aStart = Date.now();

  const BATCH_SIZE = 5;
  const batches = splitIntoBatches(roomsWithAdjacent, BATCH_SIZE);
  console.log(`[Phase 3a] Split into ${batches.length} batches of ~${BATCH_SIZE} rooms`);

  // Run all batches in parallel
  const descriptionBatchResults = await Promise.all(
    batches.map((batch, idx) => {
      console.log(`[Phase 3a] Starting batch ${idx + 1}/${batches.length}`);
      return generateRoomDescriptionsBatch(identity, batch, initialMap.mapTheme, allRoomNames);
    })
  );

  // Flatten batch results into a map by room name
  const descriptionsByName = new Map<string, RoomDescriptionResult>();
  for (const batchResult of descriptionBatchResults) {
    for (const roomDesc of batchResult) {
      descriptionsByName.set(roomDesc.name, roomDesc);
    }
  }

  console.log(`[Phase 3a] Completed in ${((Date.now() - phase3aStart) / 1000).toFixed(1)}s`);

  // ============================================
  // PHASE 3b: Object Generation (Haiku, all in parallel)
  // ============================================
  console.log(`[Phase 3b] Generating objects for ${initialMap.rooms.length} rooms in parallel...`);
  const phase3bStart = Date.now();

  // Prepare room data with descriptions for object generation
  const roomsForObjects = initialMap.rooms.map(room => {
    const desc = descriptionsByName.get(room.name);
    return {
      name: room.name,
      fullDescription: desc?.fullDescription || room.briefDescription,
      thematicRole: room.thematicRole,
      isVehicle: room.isVehicle,
    };
  });

  // Run ALL object generations in parallel (Haiku is fast)
  const objectResults = await Promise.all(
    roomsForObjects.map(room => generateRoomObjects(identity, room))
  );

  // Build object map by room name
  const objectsByName = new Map<string, RoomObjectsResult>();
  roomsForObjects.forEach((room, idx) => {
    objectsByName.set(room.name, objectResults[idx]);
  });

  console.log(`[Phase 3b] Completed in ${((Date.now() - phase3bStart) / 1000).toFixed(1)}s`);

  // ============================================
  // Merge results into final ConnectingAreasData
  // ============================================
  const enhancedRooms = initialMap.rooms.map(room => {
    const desc = descriptionsByName.get(room.name);
    const objs = objectsByName.get(room.name);

    return {
      // Copy all original fields
      name: room.name,
      x: room.x,
      y: room.y,
      z: room.z,
      briefDescription: room.briefDescription,
      thematicRole: room.thematicRole,
      isStoryCritical: room.isStoryCritical,
      suggestedAtmosphere: room.suggestedAtmosphere,
      exits: room.exits,
      isVehicle: room.isVehicle,
      vehicleType: room.vehicleType,
      boardingKeywords: room.boardingKeywords,
      dockedAtRoomName: room.dockedAtRoomName,
      // Add generated fields
      fullDescription: desc?.fullDescription || room.briefDescription,
      connectionDescriptions: (desc?.connectionDescriptions || []).map(cd => ({
        direction: cd.direction as 'north' | 'south' | 'east' | 'west' | 'up' | 'down',
        targetRoomName: cd.targetRoomName,
        descriptionFromHere: cd.descriptionFromHere,
        descriptionFromThere: cd.descriptionFromThere,
        isHidden: cd.isHidden,
        hiddenUntil: cd.hiddenUntil,
      })),
      knownDestinationRoomNames: desc?.knownDestinationRoomNames,
      objects: objs?.objects || [],
    };
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Phase 3] Complete! Total time: ${totalTime}s for ${initialMap.rooms.length} rooms`);

  return { rooms: enhancedRooms };
}

// ============================================
// Step 4: Generate Characters
// ============================================

// Extract names mentioned in interview answers (from questions about people in player's life)
function extractNamesFromInterview(exchanges: { question: string; answer: string }[]): string[] {
  const names: string[] = [];

  // Look for questions that ask about people (friends, family, mentors, rivals, etc.)
  const peopleKeywords = [
    'friend', 'family', 'mentor', 'rival', 'person', 'people', 'someone',
    'who', 'name', 'close to', 'trust', 'admire', 'look up to', 'enemy',
    'partner', 'companion', 'ally', 'nemesis', 'confidant'
  ];

  for (const exchange of exchanges) {
    const questionLower = exchange.question.toLowerCase();
    const hasPeopleContext = peopleKeywords.some(kw => questionLower.includes(kw));

    if (hasPeopleContext && exchange.answer) {
      // Extract capitalized words that look like names (2-15 chars, start with capital)
      // This regex finds words that start with a capital letter
      const potentialNames = exchange.answer.match(/\b[A-Z][a-z]{1,14}\b/g) || [];

      // Filter out common words that aren't names
      const commonWords = new Set([
        'The', 'This', 'That', 'They', 'There', 'Then', 'What', 'When', 'Where',
        'Which', 'While', 'With', 'Would', 'Could', 'Should', 'About', 'After',
        'Before', 'Because', 'Being', 'Between', 'Both', 'But', 'Can', 'Did',
        'Does', 'Done', 'Each', 'Even', 'Every', 'For', 'From', 'Get', 'Got',
        'Had', 'Has', 'Have', 'Her', 'Here', 'Him', 'His', 'How', 'However',
        'Into', 'Its', 'Just', 'Like', 'Made', 'Make', 'Many', 'May', 'More',
        'Most', 'Much', 'Must', 'Never', 'New', 'Not', 'Now', 'Off', 'Old',
        'One', 'Only', 'Other', 'Our', 'Out', 'Over', 'Own', 'Part', 'People',
        'Place', 'Said', 'Same', 'See', 'She', 'Some', 'Still', 'Such', 'Take',
        'Than', 'Their', 'Them', 'These', 'Thing', 'Think', 'Those', 'Through',
        'Time', 'Too', 'Two', 'Under', 'Until', 'Very', 'Want', 'Way', 'Well',
        'Were', 'Will', 'Work', 'Year', 'Yes', 'Yet', 'You', 'Your'
      ]);

      for (const name of potentialNames) {
        if (!commonWords.has(name) && !names.includes(name)) {
          names.push(name);
        }
      }
    }
  }

  return names;
}

export async function generateCharacters(context: GenerationContext): Promise<CharactersData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;

  const roomNames = connectingAreas.rooms.map(r => r.name);
  const criticalRooms = connectingAreas.rooms.filter(r => r.isStoryCritical).map(r => r.name);

  // Extract names from the player's interview for personalization
  const playerLifeNames = extractNamesFromInterview(context.interviewExchanges);

  // Build the names instruction if we have any
  const namesInstruction = playerLifeNames.length > 0
    ? `
IMPORTANT - USE THESE NAMES FROM THE PLAYER'S LIFE:
The player mentioned these people in their interview: ${playerLifeNames.join(', ')}

You MUST use some of these first names for key NPCs to make the story personal:
- Use at least ${Math.min(3, playerLifeNames.length)} of these names for important characters (mentor, ally, antagonist)
- Adapt the names to fit the setting if needed (e.g., "Mike" → "Sir Michael" in fantasy, "Mike-7" in sci-fi)
- The characters don't need to match the real people - just use the names as a personal touch
`
    : '';

  const prompt = `Create NPCs for this story world.

STORY IDENTITY:
- Title: ${identity.title}
- Genres: ${identity.genreBlend.join(', ')}
- Tone: ${identity.tone}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}
- World Rules: ${identity.worldRules.join(', ')}
${namesInstruction}
AVAILABLE ROOMS: ${roomNames.join(', ')}
STORY-CRITICAL ROOMS: ${criticalRooms.join(', ')}

REQUIREMENTS:
1. Create 4-8 distinct NPCs
2. Include variety: at least one mentor, one potential antagonist, one neutral party
3. Place characters in rooms that fit their role
4. Give each a unique voice and personality
5. Include secrets that could be revealed through gameplay

Return ONLY valid JSON:
{
  "characters": [
    {
      "name": "Character Name",
      "role": "mentor", // mentor, antagonist, ally, neutral, mysterious, merchant, guardian
      "briefDescription": "Physical appearance in 1-2 sentences",
      "personality": {
        "traits": ["trait1", "trait2", "trait3"],
        "motivations": ["what they want", "why"],
        "secrets": "Something hidden about them"
      },
      "voiceDescription": "How they speak - accent, mannerisms, vocabulary",
      "startingRoomName": "Room Name from the list above",
      "dialogueStyle": "formal", // formal, casual, cryptic, aggressive, friendly, nervous
      "relationshipToPlayer": "Initial attitude toward the player"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<CharactersData>(response, 'characters');
}

// ============================================
// Step 5: Generate Backstory
// ============================================
export async function generateBackstory(context: GenerationContext): Promise<BackstoryData> {
  const identity = context.stepData.identity!;

  const prompt = `Create the player character's backstory based on their interview.

PLAYER NAME: ${context.playerName}

INTERVIEW:
${formatInterview(context.interviewExchanges)}

STORY IDENTITY:
- Title: ${identity.title}
- Setting: ${identity.settingEra}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}

REQUIREMENTS:
1. Create a backstory that explains why this character is here
2. Incorporate personality traits revealed in the interview
3. Decide if the backstory should be secret (amnesia, hidden identity, etc.)
4. If secret, include memory fragments that can be discovered

Return ONLY valid JSON:
{
  "background": "2-3 paragraphs describing the character's history",
  "origin": "Where they come from",
  "recentEvents": "What led them to the starting location",
  "personality": {
    "traits": ["trait1", "trait2", "trait3"],
    "strengths": ["strength1", "strength2"],
    "weaknesses": ["weakness1", "weakness2"]
  },
  "isSecretBackstory": false,
  "memoryFragments": ["Fragment 1 if amnesia...", "Fragment 2..."] // only if isSecretBackstory is true
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<BackstoryData>(response, 'backstory');
}

// ============================================
// Step 6: Generate Story Beats
// Major narrative convergence points with OCEAN-based resolution choices
// ============================================
export async function generateStoryBeats(context: GenerationContext): Promise<StoryBeatsData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;
  const characters = context.stepData.characters!;
  const backstory = context.stepData.backstory!;

  const characterInfo = characters.characters.map(c =>
    `${c.name} (${c.role}): ${c.personality.traits.join(', ')}`
  ).join('\n');

  const prompt = `Design 3-5 major story beats for this narrative. Each beat is a CONVERGENCE POINT
where puzzle paths come together AND the player must make a meaningful choice about HOW to resolve it.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}
- World Rules: ${identity.worldRules.join(', ')}

PLAYER CHARACTER:
${backstory.background}
Traits: ${backstory.personality.traits.join(', ')}

KEY CHARACTERS:
${characterInfo}

KEY LOCATIONS:
${connectingAreas.rooms.slice(0, 10).map(r => `- ${r.name}: ${r.thematicRole}`).join('\n')}

OCEAN PERSONALITY DIMENSIONS:
- O (Openness): Creativity, unconventional thinking, trying new approaches
- C (Conscientiousness): Discipline, following rules, methodical planning
- E (Extraversion): Direct confrontation, social solutions, assertiveness
- A (Agreeableness): Cooperation, diplomacy, helping others
- N (Neuroticism): Caution, risk-aversion, emotional responses

STORY BEAT DESIGN:
1. Each beat is a MAJOR milestone (not a small task)
2. Progress: early story → rising action → climax → resolution
3. Each beat has 2-3 RESOLUTION OPTIONS - different ways to resolve it
4. Each option reflects different OCEAN personality traits
5. Player's choice should feel meaningful - no "right" answer

RESOLUTION OPTIONS EXAMPLES:
- Beat: "Access the Lighthouse Beacon"
  - Option A (High O): Find a creative workaround using the old machinery
  - Option B (High C): Follow the proper maintenance protocol step by step
  - Option C (High E): Convince the keeper to help directly

Return ONLY valid JSON:
{
  "beats": [
    {
      "name": "Beat Name",
      "description": "What achieving this beat means for the story",
      "beatOrder": 1,
      "resolutionOptions": [
        {
          "id": "option_a",
          "description": "How this option resolves the beat",
          "approachStyle": "Creative", // Short label: Creative, Methodical, Diplomatic, etc.
          "primaryDimension": "O",
          "secondaryDimension": "E", // optional
          "personalityImplication": "Shows high openness and willingness to experiment",
          "outcomeNarrative": "2-3 sentences describing what happens when this is chosen"
        },
        {
          "id": "option_b",
          "description": "Second approach",
          "approachStyle": "Methodical",
          "primaryDimension": "C",
          "personalityImplication": "Shows conscientiousness and respect for proper procedures",
          "outcomeNarrative": "2-3 sentences describing this outcome"
        }
      ]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<StoryBeatsData>(response, 'storyBeats');
}

// ============================================
// Step 7: Generate Puzzle Dependency Chart
// Create diamond-structured puzzles that converge to story beats
// ============================================
export async function generatePuzzles(context: GenerationContext): Promise<PuzzlesData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;
  const characters = context.stepData.characters!;
  const storyBeats = context.stepData.storyBeats!;
  const initialMap = context.stepData.initialMap!;

  const rooms = connectingAreas.rooms;
  const startingRoom = rooms[initialMap.startingRoomIndex]?.name || rooms[0].name;

  // Build a reference of all available objects and characters
  const objectsByRoom = rooms.map(r => ({
    room: r.name,
    objects: r.objects.map(o => o.name),
  }));

  const characterInfo = characters.characters.map(c =>
    `${c.name} (${c.role}) - in ${c.startingRoomName}: ${c.personality}`
  );

  const prompt = `Design a puzzle dependency chart using the LucasArts diamond pattern.

STORY BEATS TO ACHIEVE (in order):
${storyBeats.beats.map(b => `${b.beatOrder}. "${b.name}" - ${b.description} [${b.resolutionOptions.length} resolution options]`).join('\n')}

NOTE: When all puzzles for a beat are complete, the player chooses HOW to resolve it (OCEAN personality choice).
Puzzles should gather what's needed to REACH the beat, not determine the outcome.

AVAILABLE WORLD:
Starting Room: ${startingRoom}

Rooms & Objects:
${objectsByRoom.map(r => `- ${r.room}: ${r.objects.join(', ') || '(empty)'}`).join('\n')}

Characters:
${characterInfo.join('\n')}

PUZZLE DESIGN RULES:

1. DIAMOND PATTERN: For each story beat, create 2-3 PARALLEL puzzle paths that converge.
   - Player should always have multiple things to work on
   - Completing ALL paths for a beat unlocks the next beat

2. PUZZLE COUNT: Create 6-10 puzzles total (NOT per room).
   - First beat: 2 parallel puzzles
   - Middle beats: 2-3 parallel puzzles each
   - Final beat: 1 climactic puzzle

3. STEPS (2-5 per puzzle): Each step involves characters, objects, or locations.
   - Steps should CAUSALLY CONNECT: completing step 1 gives what's needed for step 2
   - Example: "Find frequency note" → "Tune radio to frequency" → "Contact help"

4. STEP NODE TYPES:
   - "character": Talk to someone to get info/item
   - "object": Interact with/use an object
   - "location": Go to a specific place
   - "action": Perform a specific action

5. PROGRESSIVE REVEAL:
   - First step of each puzzle: isInitiallyRevealed = true
   - Later steps: isInitiallyRevealed = false
   - revealTriggers: actions that reveal a step early (e.g., trying the radio reveals you need power)

6. ITEMS & CLUES:
   - Steps can give items (givesItem) that are required for later steps
   - Steps can reveal clues (givesClue) - narrative hints
   - Characters are great sources of both

7. STEP DESCRIPTIONS - CRYPTIC:
   - Show WHAT to interact with, not why
   - "Talk to the Keeper" not "Talk to the Keeper to learn about the storm"
   - "Find the Oil Can" not "Find the Oil Can to oil the hinges"

Return ONLY valid JSON:
{
  "puzzles": [
    {
      "name": "Puzzle Name",
      "description": "What this puzzle is about (internal, not shown to player)",
      "storyBeatName": "Beat Name this leads to",
      "branchPath": "beat1.left", // beat1.left, beat1.right, beat2.center, etc.
      "roomName": "Primary Room",
      "isInitialObjective": false, // true for ONE puzzle only - starting objective
      "isBottleneck": false, // true if this is a convergence point
      "steps": [
        {
          "stepNumber": 1,
          "description": "Find the Old Keeper", // CRYPTIC
          "hint": "He's usually near the beacon",
          "nodeType": "character", // character, object, location, action
          "targetName": "Old Keeper", // Character/Object/Room name
          "completionAction": "talk to keeper", // What completes this step
          "requiredItems": [], // Items needed
          "requiredRoom": null, // Room where this must happen
          "givesItem": "Lighthouse Key", // Item received on completion
          "givesClue": "The keeper mentions the generator hasn't worked in years",
          "isInitiallyRevealed": true, // First step visible
          "revealTriggers": [] // Actions that reveal this step early
        },
        {
          "stepNumber": 2,
          "description": "Unlock the Generator Room",
          "nodeType": "object",
          "targetName": "Generator Room Door",
          "completionAction": "use lighthouse key on door",
          "requiredItems": ["Lighthouse Key"],
          "isInitiallyRevealed": false, // Hidden until step 1 complete
          "revealTriggers": ["examine generator door", "try generator door"]
        }
      ],
      "reward": {
        "type": "room_unlock",
        "data": { "roomName": "Generator Room" }
      }
    }
  ],
  "puzzleChains": [
    {
      "sourcePuzzle": "First Puzzle",
      "targetPuzzle": "Second Puzzle",
      "linkType": "parallel", // parallel (both needed), sequential (one unlocks other)
      "condition": null
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 20000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<PuzzlesData>(response, 'puzzles');
}

// ============================================
// Step 8: Generate Starting Skills
// ============================================
export async function generateStartingSkills(context: GenerationContext): Promise<StartingSkillsData> {
  const identity = context.stepData.identity!;
  const backstory = context.stepData.backstory!;
  const puzzles = context.stepData.puzzles!;

  // Extract actions mentioned in puzzles
  const puzzleActions = puzzles.puzzles.flatMap(p =>
    p.steps.map(s => s.completionAction).filter(Boolean)
  );

  const prompt = `Create starting skills for the player character.

STORY IDENTITY:
- Title: ${identity.title}
- Setting: ${identity.settingEra}
- Themes: ${identity.keyThemes.join(', ')}

PLAYER BACKSTORY:
${backstory.background}
Origin: ${backstory.origin}
Strengths: ${backstory.personality.strengths.join(', ')}

ACTIONS NEEDED IN PUZZLES: ${[...new Set(puzzleActions)].join(', ')}

REQUIREMENTS:
1. Create 3-6 skills that fit the character's background
2. Each skill has trigger verbs (actions that use it) and trigger nouns (objects it applies to)
3. Starting levels range from 1-10
4. Include skills needed for the puzzles
5. Skills should feel organic to the character

Return ONLY valid JSON:
{
  "skills": [
    {
      "name": "Skill Name",
      "level": 5,
      "triggerVerbs": ["verb1", "verb2", "verb3"],
      "triggerNouns": ["noun1", "noun2"],
      "description": "Brief description of what this skill represents"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<StartingSkillsData>(response, 'startingSkills');
}

// ============================================
// Step 9: Generate Secret Facts
// ============================================
export async function generateSecretFacts(context: GenerationContext): Promise<SecretFactsData> {
  const identity = context.stepData.identity!;
  const characters = context.stepData.characters!;
  const backstory = context.stepData.backstory!;
  const puzzles = context.stepData.puzzles!;

  const characterSecrets = characters.characters
    .filter(c => c.personality.secrets)
    .map(c => `${c.name}: ${c.personality.secrets}`);

  const puzzleNames = puzzles.puzzles.map(p => p.name);

  const prompt = `Create hidden secrets and truths for this story world.

STORY IDENTITY:
- Title: ${identity.title}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}
- World Rules: ${identity.worldRules.join(', ')}

CHARACTER SECRETS: ${characterSecrets.join('; ')}

PLAYER BACKSTORY (potentially secret): ${backstory.isSecretBackstory ? backstory.background : 'Not secret'}

PUZZLES THAT CAN REVEAL SECRETS: ${puzzleNames.join(', ')}

REQUIREMENTS:
1. Create 5-10 secret facts about the world, characters, or player
2. Each secret should have a deflection hint (what to say if asked before reveal)
3. Link secrets to puzzles that reveal them
4. Secrets should add depth to the story when discovered
5. Some secrets should be world-changing revelations

Return ONLY valid JSON:
{
  "secrets": [
    {
      "content": "The actual secret truth",
      "factType": "WORLD", // WORLD, CHARACTER, PLAYER_HISTORY, STORY_EVENT
      "importance": 8, // 1-10
      "deflectionHint": "What NPCs say if asked about this before reveal",
      "revealTrigger": "Condition for reveal (e.g., 'complete X puzzle')",
      "linkedPuzzle": "Puzzle Name that reveals this",
      "topics": ["keyword1", "keyword2"] // for semantic matching
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<SecretFactsData>(response, 'secretFacts');
}

// ============================================
// Step 10: Coherence Pass
// Enhance descriptions with subtle foreshadowing based on puzzles and secrets
// ============================================

interface ImportantEntity {
  type: 'room' | 'object' | 'character';
  name: string;
  roomName?: string; // For objects
  currentDescription: string;
  puzzleContext: string[];
  secretContext: string[];
}

// Collect entities that need coherence enhancement
function collectImportantEntities(context: GenerationContext): ImportantEntity[] {
  const entities: ImportantEntity[] = [];
  const puzzles = context.stepData.puzzles!;
  const secrets = context.stepData.secretFacts!;
  const connectingAreas = context.stepData.connectingAreas!;
  const characters = context.stepData.characters!;

  // Track what's important and why
  const roomImportance = new Map<string, string[]>();
  const objectImportance = new Map<string, { room: string; reasons: string[] }>();
  const characterImportance = new Map<string, string[]>();

  // Scan puzzles for important entities
  for (const puzzle of puzzles.puzzles) {
    // Puzzle room is important
    if (!roomImportance.has(puzzle.roomName)) {
      roomImportance.set(puzzle.roomName, []);
    }
    roomImportance.get(puzzle.roomName)!.push(`Location for puzzle "${puzzle.name}"`);

    for (const step of puzzle.steps) {
      // Objects mentioned in puzzles
      if (step.nodeType === 'object' && step.targetName) {
        const key = step.targetName.toLowerCase();
        if (!objectImportance.has(key)) {
          objectImportance.set(key, { room: puzzle.roomName, reasons: [] });
        }
        objectImportance.get(key)!.reasons.push(`Used in puzzle step: "${step.description}"`);
      }

      // Characters mentioned in puzzles
      if (step.nodeType === 'character' && step.targetName) {
        const key = step.targetName;
        if (!characterImportance.has(key)) {
          characterImportance.set(key, []);
        }
        characterImportance.get(key)!.push(`Involved in puzzle: "${step.description}"`);
      }

      // Items given by steps
      if (step.givesItem) {
        const key = step.givesItem.toLowerCase();
        if (!objectImportance.has(key)) {
          objectImportance.set(key, { room: puzzle.roomName, reasons: [] });
        }
        objectImportance.get(key)!.reasons.push(`Key item obtained from puzzle step`);
      }

      // Required items
      for (const item of step.requiredItems || []) {
        const key = item.toLowerCase();
        if (!objectImportance.has(key)) {
          objectImportance.set(key, { room: puzzle.roomName, reasons: [] });
        }
        objectImportance.get(key)!.reasons.push(`Required for puzzle step: "${step.description}"`);
      }
    }
  }

  // Scan secrets for character connections
  for (const secret of secrets.secrets) {
    if (secret.factType === 'CHARACTER') {
      // Try to find which character this relates to
      for (const char of characters.characters) {
        if (secret.content.toLowerCase().includes(char.name.toLowerCase()) ||
            secret.topics.some(t => char.name.toLowerCase().includes(t.toLowerCase()))) {
          if (!characterImportance.has(char.name)) {
            characterImportance.set(char.name, []);
          }
          characterImportance.get(char.name)!.push(`Has secret: "${secret.deflectionHint}"`);
        }
      }
    }

    // Room secrets
    if (secret.factType === 'WORLD') {
      for (const room of connectingAreas.rooms) {
        if (secret.topics.some(t => room.name.toLowerCase().includes(t.toLowerCase()))) {
          if (!roomImportance.has(room.name)) {
            roomImportance.set(room.name, []);
          }
          roomImportance.get(room.name)!.push(`Connected to world secret`);
        }
      }
    }
  }

  // Build entity list for rooms
  for (const [roomName, reasons] of roomImportance) {
    const room = connectingAreas.rooms.find(r => r.name === roomName);
    if (room) {
      entities.push({
        type: 'room',
        name: roomName,
        currentDescription: room.fullDescription,
        puzzleContext: reasons.filter(r => r.includes('puzzle')),
        secretContext: reasons.filter(r => r.includes('secret')),
      });
    }
  }

  // Build entity list for objects
  for (const [objName, info] of objectImportance) {
    // Find the object in rooms
    for (const room of connectingAreas.rooms) {
      const obj = room.objects.find(o => o.name.toLowerCase() === objName);
      if (obj) {
        entities.push({
          type: 'object',
          name: obj.name,
          roomName: room.name,
          currentDescription: obj.description,
          puzzleContext: info.reasons.filter(r => r.includes('puzzle') || r.includes('item')),
          secretContext: [],
        });
        break;
      }
    }
  }

  // Build entity list for characters
  for (const [charName, reasons] of characterImportance) {
    const char = characters.characters.find(c => c.name === charName);
    if (char) {
      entities.push({
        type: 'character',
        name: charName,
        currentDescription: char.briefDescription,
        puzzleContext: reasons.filter(r => r.includes('puzzle')),
        secretContext: reasons.filter(r => r.includes('secret')),
      });
    }
  }

  return entities;
}

// Enhance a single entity description with Haiku
async function enhanceEntityDescription(
  entity: ImportantEntity,
  identity: IdentityData
): Promise<{ type: string; name: string; roomName?: string; updatedDescription: string } | null> {
  const contextLines: string[] = [];
  if (entity.puzzleContext.length > 0) {
    contextLines.push(`Puzzle involvement: ${entity.puzzleContext.join('; ')}`);
  }
  if (entity.secretContext.length > 0) {
    contextLines.push(`Secret connection: ${entity.secretContext.join('; ')}`);
  }

  const prompt = `You are enhancing a ${entity.type} description for a ${identity.tone} ${identity.genreBlend.join('/')} story.

STORY: "${identity.title}"
THEMES: ${identity.keyThemes.join(', ')}

${entity.type.toUpperCase()}: ${entity.name}
CURRENT DESCRIPTION: ${entity.currentDescription}

THIS ${entity.type.toUpperCase()}'S NARRATIVE IMPORTANCE:
${contextLines.join('\n')}

Your task: Enhance the description to SUBTLY foreshadow its importance.
- Do NOT spoil puzzles or reveal secrets
- Add sensory details that hint at significance
- Keep the same length and tone
- Make it feel naturally important, not obviously "quest item"-like

Return ONLY the enhanced description text, nothing else.`;

  try {
    const response = await anthropic.messages.create({
      model: FAST_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const updatedDescription = textContent?.text?.trim() || entity.currentDescription;

    return {
      type: entity.type,
      name: entity.name,
      roomName: entity.roomName,
      updatedDescription,
    };
  } catch (error) {
    logger.warn('STORY_GEN', `Failed to enhance ${entity.type} "${entity.name}": ${error}`);
    return null;
  }
}

export async function generateCoherencePass(context: GenerationContext): Promise<CoherencePassData> {
  const identity = context.stepData.identity!;

  console.log('[Step 10] Starting coherence pass...');
  const startTime = Date.now();

  // Collect important entities
  const entities = collectImportantEntities(context);
  console.log(`[Step 10] Found ${entities.length} entities to enhance`);

  // Run all enhancements in parallel (Haiku is fast)
  const enhancementResults = await Promise.all(
    entities.map(entity => enhanceEntityDescription(entity, identity))
  );

  // Filter out failures and organize results
  const roomUpdates: RoomUpdate[] = [];
  const objectUpdates: ObjectUpdate[] = [];
  const characterUpdates: CharacterUpdate[] = [];

  for (const result of enhancementResults) {
    if (!result) continue;

    switch (result.type) {
      case 'room':
        roomUpdates.push({
          roomName: result.name,
          updatedFullDescription: result.updatedDescription,
        });
        break;
      case 'object':
        objectUpdates.push({
          roomName: result.roomName!,
          objectName: result.name,
          updatedDescription: result.updatedDescription,
        });
        break;
      case 'character':
        characterUpdates.push({
          characterName: result.name,
          updatedBriefDescription: result.updatedDescription,
        });
        break;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Step 10] Coherence pass complete in ${duration}s`);
  console.log(`[Step 10] Updated: ${roomUpdates.length} rooms, ${objectUpdates.length} objects, ${characterUpdates.length} characters`);

  return {
    roomUpdates,
    objectUpdates,
    characterUpdates,
  };
}

// ============================================
// Step 11: Generate Opening
// ============================================
export async function generateOpening(context: GenerationContext): Promise<OpeningData> {
  const identity = context.stepData.identity!;
  const initialMap = context.stepData.initialMap!;
  const connectingAreas = context.stepData.connectingAreas!;
  const backstory = context.stepData.backstory!;
  const puzzles = context.stepData.puzzles!;

  const startingRoom = connectingAreas.rooms[initialMap.startingRoomIndex];

  // Find puzzles in the starting room
  const startingPuzzles = puzzles.puzzles.filter(p => p.roomName === startingRoom.name);
  const firstPuzzle = startingPuzzles[0] || puzzles.puzzles[0];

  const prompt = `Write the opening scene for this story.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Setting: ${identity.settingEra}
- Central Conflict: ${identity.centralConflict}

PLAYER: ${context.playerName}
BACKSTORY: ${backstory.recentEvents}

STARTING ROOM: ${startingRoom.name}
${startingRoom.fullDescription}

OBJECTS IN ROOM: ${startingRoom.objects.map(o => o.name).join(', ')}

FIRST PUZZLE TO INTRODUCE: ${firstPuzzle.name}
${firstPuzzle.description}
First step: ${firstPuzzle.steps[0]?.description}

REQUIREMENTS:
1. Write an evocative 3-4 paragraph opening that sets the scene
2. Introduce the player to their situation naturally
3. Make the first puzzle objective clear without being heavy-handed
4. Suggest 3-4 immediate actions the player could take
5. Include 1-2 starting items that make sense for the character

Return ONLY valid JSON:
{
  "startingRoomName": "${startingRoom.name}",
  "openingNarrative": "3-4 paragraphs of evocative opening text...",
  "initialObjective": "Clear statement of first goal without spoilers",
  "startingItems": [
    { "name": "Item Name", "description": "Brief description" }
  ],
  "immediateChoices": ["Look around", "Examine the desk", "Check the door"]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<OpeningData>(response, 'opening');
}
