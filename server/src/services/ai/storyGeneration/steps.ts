import Anthropic from '@anthropic-ai/sdk';
import logger from '../../../utils/logger.js';
import {
  GenerationContext,
  IdentityData,
  InitialMapData,
  ConnectingAreasData,
  CharactersData,
  BackstoryData,
  DilemmasData,
  PuzzlesData,
  StartingSkillsData,
  SecretFactsData,
  OpeningData,
} from './types.js';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// Attempt to repair common JSON issues from AI responses
function repairJson(jsonText: string): string {
  let repaired = jsonText;

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
// Step 3: Generate Connecting Areas
// ============================================
export async function generateConnectingAreas(context: GenerationContext): Promise<ConnectingAreasData> {
  const identity = context.stepData.identity!;
  const initialMap = context.stepData.initialMap!;

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

  const roomsWithAdjacent = initialMap.rooms.map(room => ({
    ...room,
    adjacentRooms: getAdjacentRooms(room).map(a => ({ direction: a.direction, name: a.room.name, brief: a.room.briefDescription }))
  }));

  const prompt = `Expand these room descriptions with full details and coherent connections.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Setting: ${identity.settingEra}
- Themes: ${identity.keyThemes.join(', ')}

MAP THEME: ${initialMap.mapTheme}

ROOMS TO EXPAND:
${JSON.stringify(roomsWithAdjacent, null, 2)}

REQUIREMENTS:
1. Write a 2-3 paragraph full description for each room
2. For each exit, describe BOTH how it looks from this room AND how it looks from the other side
   - A door described as "ornate wooden door" from one side should match from the other
   - If there's a window showing a garden, the garden room should mention the window
3. Add 2-4 objects per room that fit the theme
4. Ensure atmospheric coherence between connected rooms

Return ONLY valid JSON:
{
  "rooms": [
    {
      "name": "Room Name",
      "x": 0, "y": 0, "z": 0,
      "briefDescription": "One sentence",
      "fullDescription": "2-3 paragraphs of rich description...",
      "thematicRole": "sanctuary",
      "isStoryCritical": true,
      "suggestedAtmosphere": { "lighting": "...", "mood": "...", "sounds": "...", "smells": "..." },
      "exits": { "north": true },
      "connectionDescriptions": [
        {
          "direction": "north",
          "targetRoomName": "Adjacent Room Name",
          "descriptionFromHere": "A heavy oak door leads north, its surface carved with...",
          "descriptionFromThere": "A heavy oak door leads south, matching carvings visible from this side..."
        }
      ],
      "objects": [
        { "name": "Object Name", "description": "Description", "isTakeable": false, "isStoryCritical": false }
      ]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 50000, // Very large response with full descriptions for 15-30 rooms
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<ConnectingAreasData>(response, 'connectingAreas');
}

// ============================================
// Step 4: Generate Characters
// ============================================
export async function generateCharacters(context: GenerationContext): Promise<CharactersData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;

  const roomNames = connectingAreas.rooms.map(r => r.name);
  const criticalRooms = connectingAreas.rooms.filter(r => r.isStoryCritical).map(r => r.name);

  const prompt = `Create NPCs for this story world.

STORY IDENTITY:
- Title: ${identity.title}
- Genres: ${identity.genreBlend.join(', ')}
- Tone: ${identity.tone}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}
- World Rules: ${identity.worldRules.join(', ')}

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
// Step 6: Generate Dilemmas
// ============================================
export async function generateDilemmas(context: GenerationContext): Promise<DilemmasData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;
  const characters = context.stepData.characters!;
  const backstory = context.stepData.backstory!;

  const roomCount = connectingAreas.rooms.length;
  const dilemmaCount = Math.ceil(roomCount / 5);
  const roomNames = connectingAreas.rooms.map(r => r.name);
  const characterNames = characters.characters.map(c => c.name);

  const prompt = `Create ${dilemmaCount} personality-testing dilemmas for this story.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Central Conflict: ${identity.centralConflict}
- Themes: ${identity.keyThemes.join(', ')}

PLAYER BACKSTORY:
${backstory.background}
Traits: ${backstory.personality.traits.join(', ')}

AVAILABLE ROOMS: ${roomNames.join(', ')}
CHARACTERS: ${characterNames.join(', ')}

OCEAN PERSONALITY DIMENSIONS:
- O (Openness): Creativity, curiosity, willingness to try new things
- C (Conscientiousness): Organization, discipline, following rules
- E (Extraversion): Social engagement, assertiveness, energy from others
- A (Agreeableness): Cooperation, trust, empathy, helping others
- N (Neuroticism): Emotional stability, anxiety, stress response

REQUIREMENTS:
1. Create ${dilemmaCount} dilemmas that test different OCEAN dimensions
2. Each dilemma should present a meaningful choice with no "right" answer
3. Options should reveal personality through choice, not skill
4. Spread dilemmas across different rooms
5. Make them fit naturally into the story world

Return ONLY valid JSON:
{
  "dilemmas": [
    {
      "name": "Internal identifier",
      "description": "The situation the player faces",
      "primaryDimension": "O", // O, C, E, A, or N
      "secondaryDimension": "A", // optional second dimension
      "triggerRoomName": "Room Name",
      "triggerCondition": "Optional condition like 'after talking to X'",
      "optionA": {
        "description": "First choice",
        "personalityImplication": "What this choice reveals (e.g., 'Shows high openness')"
      },
      "optionB": {
        "description": "Second choice",
        "personalityImplication": "What this choice reveals"
      },
      "optionC": {
        "description": "Optional third choice",
        "personalityImplication": "What this choice reveals"
      }
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseJsonResponse<DilemmasData>(response, 'dilemmas');
}

// ============================================
// Step 7: Generate Puzzles
// ============================================
export async function generatePuzzles(context: GenerationContext): Promise<PuzzlesData> {
  const identity = context.stepData.identity!;
  const connectingAreas = context.stepData.connectingAreas!;
  const characters = context.stepData.characters!;
  const dilemmas = context.stepData.dilemmas!;

  const rooms = connectingAreas.rooms;
  const characterNames = characters.characters.map(c => `${c.name} (${c.role}, in ${c.startingRoomName})`);
  const dilemmaNames = dilemmas.dilemmas.map(d => `${d.name} (${d.triggerRoomName})`);

  const prompt = `Create puzzles for each room that lead players toward dilemmas.

STORY IDENTITY:
- Title: ${identity.title}
- Tone: ${identity.tone}
- Themes: ${identity.keyThemes.join(', ')}

ROOMS AND OBJECTS:
${rooms.map(r => `- ${r.name} (${r.thematicRole}): ${r.objects.map(o => o.name).join(', ')}`).join('\n')}

CHARACTERS: ${characterNames.join(', ')}

DILEMMAS TO LEAD TOWARD: ${dilemmaNames.join(', ')}

REQUIREMENTS:
1. Create 3 puzzles per room (${rooms.length * 3} total)
2. Each puzzle has 2-5 steps that must be completed in order
3. Steps should use objects, characters, and actions available in the world
4. Puzzles should chain together - completing one unlocks others
5. Some puzzle chains should lead to dilemmas
6. Rewards can be: item, skill_boost, dilemma, secret_reveal, room_unlock, character_info
7. Some steps can have timed urgency (X turns to complete)

PUZZLE CHAIN STRUCTURE:
- Start with simple puzzles that unlock medium ones
- Medium puzzles lead to complex ones
- Complex puzzles trigger dilemmas

Return ONLY valid JSON:
{
  "puzzles": [
    {
      "name": "Puzzle Name",
      "description": "What the puzzle is about",
      "roomName": "Room Name",
      "steps": [
        {
          "stepNumber": 1,
          "description": "What player needs to do",
          "hint": "Optional hint",
          "requirements": {
            "requiredItems": ["item name"],
            "requiredActions": ["examine X", "use X on Y"],
            "requiredRoom": "Room Name if specific"
          },
          "timedUrgency": { "turnsAllowed": 5, "failureConsequence": "Description" } // optional
        }
      ],
      "reward": {
        "type": "item", // item, skill_boost, dilemma, secret_reveal, room_unlock, character_info
        "data": { "itemName": "Key", "description": "A brass key" }
      },
      "leadsToDilemma": "Dilemma Name", // optional
      "prerequisites": ["Other Puzzle Name"] // optional
    }
  ],
  "puzzleChains": [
    {
      "sourcePuzzle": "First Puzzle",
      "targetPuzzle": "Second Puzzle",
      "linkType": "sequential", // sequential, parallel, conditional
      "condition": "Optional condition text"
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 50000, // Very large response with 3 puzzles per room (45-90 puzzles total)
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
    p.steps.flatMap(s => s.requirements.requiredActions || [])
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
// Step 10: Generate Opening
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
