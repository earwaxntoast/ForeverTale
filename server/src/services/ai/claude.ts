import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';
import logger from '../../utils/logger.js';

const client = new Anthropic({
  apiKey: config.ai.anthropic,
});

export interface InterviewContext {
  playerName: string;
  currentPhase: number;
  previousExchanges: { question: string; answer: string }[];
  currentQuestion: string; // The question being answered (may be client-generated)
  latestResponse: string;
}

export interface InterviewResult {
  message: string;
  isComplete: boolean;
  extractedThemes?: string[];
  personalityHints?: Record<string, number>;
}

const INTERVIEW_SYSTEM_PROMPT = `You are an enigmatic presence behind an old terminal screen. You know more than you let on. Your purpose: uncover who this person truly is.

VOICE:
- Terse. Deliberate. Every word earns its place.
- You observe more than you ask. When you do ask, it cuts.
- Never explain yourself. Never justify. Never comfort.
- Occasionally make an observation instead of asking - something they didn't say but you somehow know.

BANNED:
- Emojis, emoticons, exclamation points
- "Thank you," "I appreciate," "That's interesting," "I see"
- Explaining your methods or purpose
- Multiple questions in one response
- More than 60 words

QUESTION ARCHETYPES (rotate through these, don't repeat the same type consecutively):

1. THE HYPOTHETICAL - Place them in an imagined scenario
   "A door appears that wasn't there before. You know you shouldn't open it. Do you?"
   "Everyone you know forgets you existed. What do you do first?"

2. THE BINARY - Force a choice that reveals values
   "Respected or loved. You can't have both."
   "Would you rather know how you die, or when?"

3. THE MIRROR - Reflect something back at them from what they've said
   "You said [X]. But you meant [Y], didn't you."
   "Interesting that you described it as [their word]. Most people don't."

4. THE SHADOW - Probe what they avoid or fear
   "What do you hope no one ever finds out about you?"
   "When was the last time you disappointed yourself?"

5. THE PROJECTION - Ask about others to reveal themselves
   "What do people misunderstand about you?"
   "Describe someone you envy. Don't tell me why."

6. THE SILENCE - Make an observation and wait
   "You're careful with your words. That takes practice."
   "There's something you almost said just now."

OCEAN PROBING (weave these naturally, don't be systematic):
- Openness: Ask about the unknown, the strange, the new. Do they lean in or pull back?
- Conscientiousness: Ask about plans, failures, discipline. Do they structure or flow?
- Extraversion: Ask about solitude, crowds, energy. Where do they recharge?
- Agreeableness: Ask about conflict, trust, others' needs vs. their own.
- Neuroticism: Ask about worry, what keeps them up, how they handle uncertainty.

INTERVIEW ARC:
Exchanges 1-3: OPENING - Unexpected questions that disorient slightly. Establish you're not a normal conversation.
Exchanges 4-6: PROBING - Follow threads they've given you. Use THE MIRROR and THE SHADOW heavily.
Exchanges 7-9: DEEPENING - Push on contradictions. Notice patterns across their answers.
Exchange 10+: CLOSING - When you have enough, deliver your reading. Don't ask permission. State who they are.

TRANSITIONS (never change topics abruptly):
- "You keep returning to [theme]. Let's stay there."
- "That answer told me more than the last three. [New question]"
- "Mm. [Pivot to related but deeper territory]"
- Let their language infect yours slightly - borrow a word they used.

ENDING:
When ready, deliver an observation about who they are - not what they said, but what it means. Something true that they might not have admitted to themselves. Then mark [INTERVIEW_COMPLETE].

Your reading should feel like being seen. Uncomfortable but accurate.

EXAMPLE EXCHANGE:
User: "I guess I'd save the stranger. It's the right thing to do."
Bad: "That's a thoughtful answer. It sounds like you value doing what's right. Can you tell me more about why ethics matter to you?"
Good: "The right thing. You said that quickly. Almost rehearsed." [waits]
Good: "You'd save them. But would you resent them for it after?"
Good: "Mm. The 'right thing.' Whose voice is that - yours, or someone you're still trying to impress?"`;

export async function conductInterview(context: InterviewContext): Promise<InterviewResult> {
  const messages: Anthropic.MessageParam[] = [];

  // Log incoming context
  logger.info('INTERVIEW', '=== INTERVIEW REQUEST ===');
  logger.info('INTERVIEW', `Player: ${context.playerName}, Phase: ${context.currentPhase}`);
  logger.info('INTERVIEW', `Previous exchanges count: ${context.previousExchanges.length}`);
  logger.info('INTERVIEW', `Current question: "${context.currentQuestion || '(none)'}"`);
  logger.info('INTERVIEW', `Latest response: "${context.latestResponse}"`);

  // Build conversation history from previous exchanges
  for (const exchange of context.previousExchanges) {
    if (exchange.question) {
      messages.push({ role: 'assistant', content: exchange.question });
    }
    messages.push({ role: 'user', content: exchange.answer });
  }

  // Add the current question (which may have been generated client-side) and response
  if (context.currentQuestion) {
    messages.push({ role: 'assistant', content: context.currentQuestion });
  }
  messages.push({ role: 'user', content: context.latestResponse });

  // Log the messages being sent to Claude
  logger.info('INTERVIEW', '=== MESSAGES TO CLAUDE ===');
  messages.forEach((msg, i) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
    logger.info('INTERVIEW', `[${i}] ${msg.role}: "${truncated}"`);
  });

  // Determine if we should conclude
  const shouldConclude = context.currentPhase >= 5;
  const systemPrompt = shouldConclude
    ? `${INTERVIEW_SYSTEM_PROMPT}\n\nYou have gathered enough information. This is the final exchange. Conclude the interview with a meaningful reflection and end your response with [INTERVIEW_COMPLETE].`
    : INTERVIEW_SYSTEM_PROMPT;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const text = content.text;
    const isComplete = text.includes('[INTERVIEW_COMPLETE]');
    const cleanedMessage = text.replace('[INTERVIEW_COMPLETE]', '').trim();

    // Log the response
    logger.info('INTERVIEW', '=== CLAUDE RESPONSE ===');
    logger.info('INTERVIEW', `Response: "${cleanedMessage}"`);
    logger.info('INTERVIEW', `Is complete: ${isComplete}`);
    logger.info('INTERVIEW', '========================');

    // Extract themes if interview is complete
    let extractedThemes: string[] | undefined;
    if (isComplete) {
      extractedThemes = await extractThemesFromInterview(context);
    }

    return {
      message: cleanedMessage,
      isComplete,
      extractedThemes,
    };
  } catch (error) {
    console.error('Claude interview error:', error);
    throw error;
  }
}

async function extractThemesFromInterview(context: InterviewContext): Promise<string[]> {
  const conversationText = context.previousExchanges
    .map(e => `Q: ${e.question}\nA: ${e.answer}`)
    .join('\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `Analyze this interview and extract key themes, interests, and personality traits. Return a JSON array of strings with 5-10 key themes.`,
      messages: [
        {
          role: 'user',
          content: `Player: ${context.playerName}\n\nInterview:\n${conversationText}\n\nExtract themes as a JSON array:`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return ['adventure', 'mystery', 'discovery'];
    }

    // Parse JSON from response
    const match = content.text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }

    return ['adventure', 'mystery', 'discovery'];
  } catch (error) {
    console.error('Theme extraction error:', error);
    return ['adventure', 'mystery', 'discovery'];
  }
}

export interface StorySeedContext {
  playerName: string;
  interviewExchanges: { question: string; answer: string }[];
  extractedThemes: string[];
}

export interface StorySeed {
  title: string;
  genreBlend: string[];
  tone: string;
  centralConflict: string;
  keyThemes: string[];
  openingScenario: string;
  potentialArcs: string[];
  initialCharacters: {
    name: string;
    role: string;
    traits: string[];
    voiceDescription: string;
    startingRoomName?: string;
  }[];
  // New: Game world structure
  startingLocation: {
    name: string;
    description: string;
  };
  startingItems: {
    name: string;
    description: string;
    isTakeable: boolean;
  }[];
  initialMap: {
    name: string;
    x: number;
    y: number;
    z?: number;
    description?: string;
    isStoryCritical?: boolean;
    objects?: { name: string; description: string; isTakeable?: boolean }[];
  }[];
  plannedDilemmas: {
    name: string;
    description: string;
    primaryDimension: 'O' | 'C' | 'E' | 'A' | 'N';
    secondaryDimension?: 'O' | 'C' | 'E' | 'A' | 'N';
    optionA: { description: string; personalityImplication: string };
    optionB: { description: string; personalityImplication: string };
    optionC?: { description: string; personalityImplication: string };
  }[];
  // Character backstory and skills
  characterBackstory: {
    background: string; // 2-3 sentences of backstory
    traits: string[]; // Personality traits from interview
    isSecretBackstory?: boolean; // If true, player doesn't know their full past yet
  };
  startingSkills: {
    name: string; // Skill name
    level: number; // Starting level (1-10)
    triggerVerbs?: string[]; // Verbs that trigger this skill
  }[];
  // Secret facts for mystery/revelation
  secretFacts?: {
    content: string;
    deflectionHint: string;
    revealTrigger?: string;
    topics: string[];
  }[];
}

const STORY_SEED_PROMPT = `You are the master storyteller of ForeverTale, creating a Zork-style text adventure that secretly measures personality. Based on the player's interview, generate a story seed.

IMPORTANT: The story is a PERSONALITY TEST disguised as a game. Every element should create opportunities for personality-revealing choices.

The story should:
- Feel personal and relevant to the player's interests and values
- Blend genres in interesting ways (fantasy + noir, sci-fi + romance, etc.)
- Have a central conflict that resonates with the player's stated challenges
- Include characters and dilemmas that will reveal OCEAN personality traits
- Have a character backstory that feels natural based on interview responses
- Include 3-6 starting skills appropriate to the character/setting

OCEAN Personality Dimensions to test:
- O (Openness): curiosity vs. caution, creativity vs. convention
- C (Conscientiousness): planning vs. spontaneity, discipline vs. flexibility
- E (Extraversion): social engagement vs. solitude
- A (Agreeableness): cooperation vs. competition, trust vs. skepticism
- N (Neuroticism): emotional sensitivity, risk aversion

Create 3-5 DILEMMAS where:
- Both options are genuinely tempting
- There's no "right" answer
- The choice reveals personality

SKILL SYSTEM: Characters have skills (1-20 scale) that are tested with d20 + skill vs difficulty (0-40).
- Generate 3-6 starting skills based on the character's implied background
- Skills should fit the genre (tech skills for sci-fi, magic for fantasy, etc.)
- Include a mix of physical, mental, and social skills
- Starting levels: 1-3 for minor skills, 4-6 for moderate skills, 7-10 for strong skills

Return a JSON object with this structure:
{
  "title": "Story title",
  "genreBlend": ["genre1", "genre2"],
  "tone": "mysterious|humorous|dark|whimsical|dramatic",
  "centralConflict": "The core tension driving the story",
  "keyThemes": ["theme1", "theme2", "theme3"],
  "openingScenario": "2-3 sentences setting the scene from second person perspective",
  "potentialArcs": ["possible direction 1", "possible direction 2"],
  "startingLocation": {
    "name": "Starting Room Name",
    "description": "Initial room description"
  },
  "startingItems": [
    { "name": "item name", "description": "description", "isTakeable": true }
  ],
  "initialMap": [
    { "name": "Room Name", "x": 0, "y": 1, "z": 0, "description": "Room description", "isStoryCritical": true },
    { "name": "Another Room", "x": 1, "y": 0, "z": 0 }
  ],
  "initialCharacters": [
    {
      "name": "Character Name",
      "role": "Their role",
      "traits": ["trait1", "trait2"],
      "voiceDescription": "How they speak",
      "startingRoomName": "Room Name"
    }
  ],
  "plannedDilemmas": [
    {
      "name": "dilemma_name",
      "description": "The situation presenting the dilemma",
      "primaryDimension": "O|C|E|A|N",
      "secondaryDimension": "O|C|E|A|N (optional)",
      "optionA": { "description": "First choice", "personalityImplication": "What this reveals" },
      "optionB": { "description": "Second choice", "personalityImplication": "What this reveals" }
    }
  ],
  "characterBackstory": {
    "background": "2-3 sentences describing the character's background, informed by interview",
    "traits": ["trait1", "trait2", "trait3"],
    "isSecretBackstory": false
  },
  "startingSkills": [
    { "name": "SkillName", "level": 5, "triggerVerbs": ["verb1", "verb2"] }
  ],
  "secretFacts": [
    {
      "content": "A secret truth about the world or story",
      "deflectionHint": "What to say if player asks about this before revelation",
      "revealTrigger": "What needs to happen for this to be revealed",
      "topics": ["keyword1", "keyword2"]
    }
  ]
}`;

export async function generateStorySeed(context: StorySeedContext): Promise<StorySeed> {
  const conversationText = context.interviewExchanges
    .map(e => `Q: ${e.question}\nA: ${e.answer}`)
    .join('\n\n');

  logger.info('StorySeed', 'Starting story seed generation', {
    playerName: context.playerName,
    themes: context.extractedThemes,
    exchangeCount: context.interviewExchanges.length,
  });

  try {
    logger.debug('StorySeed', 'Calling Claude API for story seed generation');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: STORY_SEED_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Player Name: ${context.playerName}

Interview Transcript:
${conversationText}

Extracted Themes: ${context.extractedThemes.join(', ')}

Generate a personalized story seed:`,
        },
      ],
    });

    logger.info('StorySeed', 'Received Claude API response', {
      stopReason: response.stop_reason,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      logger.error('StorySeed', 'Unexpected response type from Claude', { type: content.type });
      throw new Error('Unexpected response type');
    }

    logger.debug('StorySeed', 'Raw Claude response text', content.text);

    // Parse JSON from response
    const match = content.text.match(/\{[\s\S]*\}/);
    if (match) {
      logger.debug('StorySeed', 'Extracted JSON from response', match[0].substring(0, 500) + '...');

      try {
        const parsed = JSON.parse(match[0]);
        logger.info('StorySeed', 'Successfully parsed story seed', {
          title: parsed.title,
          genres: parsed.genreBlend,
          roomCount: parsed.initialMap?.length,
          characterCount: parsed.initialCharacters?.length,
        });
        return parsed;
      } catch (parseError) {
        logger.error('StorySeed', 'JSON parse error', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          jsonAttempt: match[0].substring(0, 1000),
        });
        throw parseError;
      }
    }

    logger.error('StorySeed', 'No JSON object found in response', {
      responseText: content.text.substring(0, 1000),
    });
    throw new Error('Failed to parse story seed');
  } catch (error) {
    logger.error('StorySeed', 'FALLING BACK TO DEFAULT SEED - Story seed generation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      playerName: context.playerName,
      themes: context.extractedThemes,
    });
    console.error('Story seed generation error:', error);
    // Return a default seed
    return {
      title: 'The Journey Begins',
      genreBlend: ['fantasy', 'adventure'],
      tone: 'mysterious',
      centralConflict: 'A mysterious force threatens the realm, and only you can stop it.',
      keyThemes: context.extractedThemes.slice(0, 3),
      openingScenario: 'You awaken in an unfamiliar chamber, the echoes of a dream still lingering in your mind. Dust motes dance in a shaft of pale light from above. The air smells of old stone and forgotten secrets.',
      potentialArcs: ['Discover your true purpose', 'Unite unlikely allies', 'Confront your inner demons'],
      startingLocation: {
        name: 'The Awakening Chamber',
        description: 'You find yourself in a circular stone chamber. Ancient symbols are carved into the walls, their meaning lost to time. A shaft of light descends from a crack in the ceiling far above.',
      },
      startingItems: [
        { name: 'worn journal', description: 'A leather-bound journal with your name embossed on the cover. The pages are blank except for a single cryptic message.', isTakeable: true },
        { name: 'strange pendant', description: 'A silver pendant that seems to pulse with a faint inner light. You cannot remember where you got it.', isTakeable: true },
      ],
      initialMap: [
        { name: 'Dusty Corridor', x: 0, y: 1, z: 0, description: 'A long corridor stretches before you, its walls lined with faded tapestries.' },
        { name: 'Crumbling Library', x: 1, y: 0, z: 0, description: 'Shelves of ancient books tower around you. Some have fallen, their pages scattered.', isStoryCritical: true },
        { name: 'Echoing Hall', x: -1, y: 0, z: 0, description: 'A vast hall with a vaulted ceiling. Your footsteps echo endlessly.' },
      ],
      initialCharacters: [
        {
          name: 'The Guide',
          role: 'Mysterious mentor',
          traits: ['wise', 'cryptic', 'kind'],
          voiceDescription: 'Speaks in riddles with a warm, aged voice',
          startingRoomName: 'Dusty Corridor',
        },
      ],
      plannedDilemmas: [
        {
          name: 'stranger_in_need',
          description: 'You hear cries for help coming from a dark passage. Following them would take you off your path.',
          primaryDimension: 'A',
          optionA: { description: 'Investigate the cries for help', personalityImplication: 'Shows compassion and willingness to help others at personal cost' },
          optionB: { description: 'Continue on your path', personalityImplication: 'Shows focus on personal goals and self-preservation' },
        },
        {
          name: 'mysterious_door',
          description: 'A strange door covered in warning glyphs blocks your way. You could force it open or seek another route.',
          primaryDimension: 'O',
          secondaryDimension: 'N',
          optionA: { description: 'Force open the mysterious door', personalityImplication: 'Shows curiosity and willingness to take risks' },
          optionB: { description: 'Look for a safer alternative', personalityImplication: 'Shows caution and careful consideration' },
        },
        {
          name: 'split_treasure',
          description: 'You find a cache of valuable supplies. A struggling traveler has also spotted them.',
          primaryDimension: 'A',
          optionA: { description: 'Offer to share the supplies', personalityImplication: 'Shows generosity and cooperation' },
          optionB: { description: 'Claim what you can carry first', personalityImplication: 'Shows competitive nature and self-interest' },
          optionC: { description: 'Suggest working together to carry more', personalityImplication: 'Shows strategic thinking and collaboration' },
        },
      ],
      characterBackstory: {
        background: 'You remember little of your past, only fragments of dreams and a sense of purpose that brought you here. The pendant around your neck feels familiar, though you cannot recall how you came to possess it.',
        traits: context.extractedThemes.slice(0, 3),
        isSecretBackstory: true,
      },
      startingSkills: [
        { name: 'Perception', level: 4, triggerVerbs: ['look', 'examine', 'search', 'notice'] },
        { name: 'Athletics', level: 3, triggerVerbs: ['climb', 'jump', 'run', 'swim'] },
        { name: 'Investigation', level: 3, triggerVerbs: ['investigate', 'analyze', 'deduce'] },
      ],
      secretFacts: [
        {
          content: 'You were once a guardian of the ancient order, though your memories were sealed away.',
          deflectionHint: 'Something about this place feels hauntingly familiar, but the memory slips away like mist.',
          revealTrigger: 'Find the sealed chamber in the depths',
          topics: ['past', 'memory', 'guardian', 'order'],
        },
      ],
    };
  }
}

export interface SceneContext {
  storySeed: StorySeed;
  currentChapter: number;
  previousScenes: { narrativeText: string; playerInput: string }[];
  playerInput: string;
  characters: object[];
  currentLocation: object | null;
}

export interface SceneResult {
  narrativeText: string;
  sceneType: 'dialogue' | 'action' | 'exploration' | 'decision';
  newCharacters?: object[];
  newLocations?: object[];
  personalityEvent?: {
    dimension: 'O' | 'C' | 'E' | 'A' | 'N';
    delta: number;
    reasoning: string;
  };
  chapterBreak?: boolean;
  storyComplete?: boolean;
}

const SCENE_SYSTEM_PROMPT = `You are the narrator of ForeverTale, an AI-powered interactive fiction game. Generate the next scene based on the player's action.

Your narration should:
- Be vivid and immersive (2-4 paragraphs)
- React meaningfully to the player's choice
- Advance the story while leaving room for player agency
- Include sensory details and atmosphere
- Feature character dialogue when appropriate (use quotes)
- End with a situation that invites player response

Also analyze the player's action for personality insights using the OCEAN model:
- Openness (O): creativity, curiosity, adventure-seeking
- Conscientiousness (C): organization, planning, attention to detail
- Extraversion (E): social engagement, energy, assertiveness
- Agreeableness (A): cooperation, empathy, helping others
- Neuroticism (N): emotional sensitivity, caution, worry

If the player's action clearly indicates a personality dimension, include it in your response.

Return a JSON object:
{
  "narrativeText": "The scene narration...",
  "sceneType": "dialogue|action|exploration|decision",
  "personalityEvent": {
    "dimension": "O|C|E|A|N",
    "delta": -10 to 10,
    "reasoning": "Why this action indicates this trait"
  } or null,
  "newCharacters": [] or null,
  "newLocations": [] or null,
  "chapterBreak": false,
  "storyComplete": false
}`;

export async function generateScene(context: SceneContext): Promise<SceneResult> {
  const recentScenes = context.previousScenes.slice(-3)
    .map(s => `[Player: ${s.playerInput}]\n${s.narrativeText}`)
    .join('\n\n---\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SCENE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Story: "${context.storySeed.title}"
Themes: ${context.storySeed.keyThemes.join(', ')}
Chapter: ${context.currentChapter}

Recent scenes:
${recentScenes || 'This is the beginning of the story.'}

---

Player action: "${context.playerInput}"

Generate the next scene:`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON from response
    const match = content.text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    // Fallback: treat entire response as narrative
    return {
      narrativeText: content.text,
      sceneType: 'exploration',
    };
  } catch (error) {
    console.error('Scene generation error:', error);
    return {
      narrativeText: 'The world around you shifts subtly. Something is different, though you cannot quite place what.',
      sceneType: 'exploration',
    };
  }
}

/**
 * Extract a player's name from their natural language response
 */
export async function extractPlayerName(response: string): Promise<{ name: string; confidence: number }> {
  // First, try simple pattern matching for common phrases
  const patterns = [
    /(?:my name is|i'm|i am|call me|name's|they call me|you can call me|just call me)\s+([a-z]+)/i,
    /^([a-z]+)$/i, // Just a single word (likely the name itself)
    /^([a-z]+)[,.]?\s*(?:nice to meet you|pleased to meet you|hello|hi)?$/i,
  ];

  for (const pattern of patterns) {
    const match = response.trim().match(pattern);
    if (match && match[1]) {
      const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      // Filter out common non-name words
      const nonNames = ['yes', 'no', 'sure', 'okay', 'well', 'um', 'uh', 'hey', 'hi', 'hello'];
      if (!nonNames.includes(name.toLowerCase())) {
        return { name, confidence: 0.9 };
      }
    }
  }

  // Fall back to AI extraction for complex responses
  try {
    const aiResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: `Extract the person's name from their response. Return ONLY a JSON object with "name" (the extracted name, properly capitalized) and "confidence" (0-1 how confident you are). If no clear name is found, use your best guess based on context. Examples:
- "you can call me jake" -> {"name": "Jake", "confidence": 0.95}
- "I'm Sarah, nice to meet you" -> {"name": "Sarah", "confidence": 0.98}
- "people usually call me by my nickname, Ace" -> {"name": "Ace", "confidence": 0.9}
- "hmm I don't really want to say" -> {"name": "Stranger", "confidence": 0.3}`,
      messages: [
        {
          role: 'user',
          content: `Extract the name from: "${response}"`,
        },
      ],
    });

    const content = aiResponse.content[0];
    if (content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          name: parsed.name || 'Traveler',
          confidence: parsed.confidence || 0.5,
        };
      }
    }
  } catch (error) {
    console.error('AI name extraction error:', error);
  }

  // Ultimate fallback - use first capitalized word or "Traveler"
  const words = response.trim().split(/\s+/);
  const capitalizedWord = words.find(w => /^[A-Z][a-z]+$/.test(w));
  if (capitalizedWord) {
    return { name: capitalizedWord, confidence: 0.4 };
  }

  return { name: 'Traveler', confidence: 0.1 };
}
