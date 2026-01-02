import { Router, Request, Response } from 'express';
import { prisma } from '../models/prisma.js';
import { generateStorySeed } from '../services/ai/claude.js';
import { routeSceneGeneration, analyzeInputForRouting } from '../services/ai/router.js';
import * as gameEngine from '../services/game/gameEngine.js';
import * as roomService from '../services/game/roomService.js';
import * as objectService from '../services/game/objectService.js';
import * as skillService from '../services/game/skillService.js';
import * as puzzleService from '../services/game/puzzleService.js';
import {
  StoryGenerationOrchestrator,
  persistGeneratedStory,
  GenerationProgress,
} from '../services/ai/storyGeneration/index.js';

// Store for SSE progress emitters
const progressEmitters = new Map<string, (progress: GenerationProgress) => void>();

const router = Router();

// Create a new story from interview data (multi-step generation)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { playerName, interviewExchanges, storyPreference } = req.body;

    if (!playerName || !interviewExchanges) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract themes from interview
    const themes = extractThemesSimple(interviewExchanges);

    // For now, use a mock user ID (auth comes later)
    const mockUserId = 'mock-user-' + Date.now();

    // Check if user exists, create if not
    let user = await prisma.user.findFirst({
      where: { firebaseUid: mockUserId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          firebaseUid: mockUserId,
          email: 'anonymous@forevertale.game',
          displayName: playerName,
        },
      });

      // Create default preferences
      await prisma.userPreferences.create({
        data: {
          userId: user.id,
        },
      });

      // Create free subscription
      await prisma.subscription.create({
        data: {
          userId: user.id,
          tier: 'free',
          status: 'active',
        },
      });
    }

    // Create the story record first (placeholder, will be filled by orchestrator)
    const story = await prisma.story.create({
      data: {
        userId: user.id,
        title: 'Generating...', // Will be updated by orchestrator
        status: 'in_progress',
        genreTags: [],
        initialInterview: interviewExchanges,
      },
    });

    // Return the storyId immediately so client can connect to SSE for progress
    res.json({
      storyId: story.id,
      status: 'generating',
    });

    // Create the multi-step story generator (runs in background after response sent)
    const orchestrator = new StoryGenerationOrchestrator(
      story.id,
      playerName,
      interviewExchanges,
      themes,
      storyPreference // Player's preferred story type (fantasy, sci-fi, etc.)
    );

    // Set up progress emitter for SSE clients
    orchestrator.on('progress', (progress: GenerationProgress) => {
      const emitter = progressEmitters.get(story.id);
      if (emitter) {
        emitter(progress);
      }
    });

    // Generate all story data through the 10 steps (runs after response sent)
    try {
      const allData = await orchestrator.generate();

      // Persist all generated data to the database
      await persistGeneratedStory(story.id, playerName, allData);

      // Update story status to indicate completion
      await prisma.story.update({
        where: { id: story.id },
        data: { status: 'completed' },
      });

      // Emit final completion event
      const emitter = progressEmitters.get(story.id);
      if (emitter) {
        emitter({
          currentStep: 'opening',
          stepNumber: 10,
          totalSteps: 10,
          stepDescription: 'Complete',
          themedNarrative: 'Your story awaits...',
          isComplete: true,
        });
      }
    } catch (genError) {
      console.error('Background story generation error:', genError);
      // Emit error event
      const emitter = progressEmitters.get(story.id);
      if (emitter) {
        emitter({
          currentStep: 'identity',
          stepNumber: 0,
          totalSteps: 10,
          stepDescription: 'Failed',
          themedNarrative: 'The threads of fate have tangled...',
          isComplete: false,
          error: genError instanceof Error ? genError.message : 'Generation failed',
        });
      }
      // Update story status to indicate failure
      await prisma.story.update({
        where: { id: story.id },
        data: { status: 'abandoned' },
      });
    }

    return; // Response already sent
  } catch (error) {
    console.error('Create story error:', error);
    return res.status(500).json({ error: 'Failed to create story' });
  }
});

// SSE endpoint for generation progress
router.get('/:id/generation-progress', async (req: Request, res: Response) => {
  const storyId = req.params.id;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // For nginx

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ connected: true, storyId })}\n\n`);

  // Store the emitter for this story
  progressEmitters.set(storyId, (progress: GenerationProgress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);

    // If complete, clean up
    if (progress.isComplete) {
      progressEmitters.delete(storyId);
    }
  });

  // Handle client disconnect
  req.on('close', () => {
    progressEmitters.delete(storyId);
  });
});

// Get story details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const story = await prisma.story.findUnique({
      where: { id: req.params.id },
      include: {
        chapters: {
          include: {
            scenes: true,
          },
        },
        characters: true,
        locations: true,
        personalityScores: true,
      },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    return res.json(story);
  } catch (error) {
    console.error('Get story error:', error);
    return res.status(500).json({ error: 'Failed to get story' });
  }
});

// Submit player action - now using the game engine
router.post('/:id/scenes', async (req: Request, res: Response) => {
  try {
    const { playerInput } = req.body;
    const storyId = req.params.id;

    if (!playerInput) {
      return res.status(400).json({ error: 'Missing player input' });
    }

    // Check if story exists
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Process the turn through the game engine
    const gameResponse = await gameEngine.processTurn(storyId, playerInput);

    // If there's a dilemma triggered, include it in response
    if (gameResponse.dilemmaTriggered) {
      return res.json({
        narrativeText: gameResponse.narrative,
        dilemma: gameResponse.dilemmaTriggered,
        gameState: gameResponse.gameState,
        roomChanged: gameResponse.roomChanged,
      });
    }

    return res.json({
      narrativeText: gameResponse.narrative,
      gameState: gameResponse.gameState,
      roomChanged: gameResponse.roomChanged,
    });
  } catch (error) {
    console.error('Submit action error:', error);
    return res.status(500).json({ error: 'Failed to process action' });
  }
});

// Handle dilemma response
router.post('/:id/dilemma/:dilemmaId', async (req: Request, res: Response) => {
  try {
    const { storyId, dilemmaId } = req.params;
    const { chosenOption, playerResponse } = req.body;

    await gameEngine.handleDilemmaResponse(
      req.params.id,
      dilemmaId,
      chosenOption,
      playerResponse
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Dilemma response error:', error);
    return res.status(500).json({ error: 'Failed to process dilemma response' });
  }
});

// Get current game state
router.get('/:id/state', async (req: Request, res: Response) => {
  try {
    const gameState = await gameEngine.getGameState(req.params.id);

    if (!gameState) {
      return res.status(404).json({ error: 'Game state not found' });
    }

    return res.json({
      roomName: gameState.currentRoom.name,
      roomDescription: gameState.currentRoom.description,
      turnCount: gameState.turnCount,
      score: gameState.score,
      exits: roomService.getExits(gameState.currentRoom),
      objects: gameState.currentRoom.gameObjects,
      characters: gameState.currentRoom.charactersHere,
    });
  } catch (error) {
    console.error('Get state error:', error);
    return res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Get sidebar data (character info, stats, notes, map)
router.get('/:id/sidebar', async (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;

    // Get story with initial interview (for player name)
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: {
        initialInterview: true,
        storySeed: true,
      },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Get player name from interview
    const interview = story.initialInterview as Array<{ question: string; answer: string }> | null;
    const nameAnswer = interview?.find(e =>
      e.question.toLowerCase().includes('name') ||
      e.question.toLowerCase().includes('call you')
    );
    const playerName = nameAnswer?.answer || 'Traveler';

    // Get character backstory
    const backstory = await prisma.characterBackstory.findFirst({
      where: { storyId },
    });

    // Get abilities/skills
    const abilities = await prisma.playerAbility.findMany({
      where: { storyId },
      select: {
        name: true,
        level: true,
        timesUsed: true,
        timesSucceeded: true,
      },
    });

    // Get revealed story facts (notes the player knows)
    const facts = await prisma.storyFact.findMany({
      where: {
        storyId,
        isSecret: false,
        isContradicted: false,
      },
      select: {
        content: true,
        factType: true,
        importance: true,
      },
      orderBy: { importance: 'desc' },
      take: 10,
    });

    // Get revealed secrets
    const revealedSecrets = await prisma.storyFact.findMany({
      where: {
        storyId,
        isSecret: true,
        isRevealed: true,
        isContradicted: false,
      },
      select: {
        content: true,
      },
    });

    // Get current player state for current room
    const playerState = await prisma.playerState.findUnique({
      where: { storyId },
    });

    // Get inventory (objects with null roomId)
    const inventory = await prisma.gameObject.findMany({
      where: {
        storyId,
        roomId: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    // Get all rooms for the map
    const rooms = await prisma.room.findMany({
      where: { storyId },
      select: {
        id: true,
        name: true,
        x: true,
        y: true,
        z: true,
        northRoomId: true,
        southRoomId: true,
        eastRoomId: true,
        westRoomId: true,
        upRoomId: true,
        downRoomId: true,
        firstVisitedAt: true,
        visitCount: true,
        atmosphere: true,
      },
    });

    // Build map data
    const mapData = rooms.map(room => ({
      id: room.id,
      name: room.name,
      x: room.x,
      y: room.y,
      z: room.z,
      isVisited: room.visitCount > 0 || room.firstVisitedAt !== null,
      isCurrent: room.id === playerState?.currentRoomId,
      hasPortal: !!(room.atmosphere as Record<string, unknown>)?.portalTo,
      exits: {
        north: !!room.northRoomId,
        south: !!room.southRoomId,
        east: !!room.eastRoomId,
        west: !!room.westRoomId,
        up: !!room.upRoomId,
        down: !!room.downRoomId,
      },
    }));

    // Get active objectives from puzzles
    const objectives = await puzzleService.getObjectives(storyId);

    return res.json({
      character: {
        name: playerName,
        background: backstory?.background || null,
        traits: backstory?.traits || [],
        isBackstoryRevealed: backstory?.isRevealed || false,
      },
      abilities: abilities.map(a => ({
        name: a.name,
        level: Number(a.level),
        progress: a.timesUsed > 0
          ? Math.floor((a.timesSucceeded / a.timesUsed) * 100)
          : 0,
      })),
      notes: [
        ...facts.map(f => f.content),
        ...revealedSecrets.map(s => `[Secret] ${s.content}`),
      ],
      inventory: inventory.map(item => ({
        id: item.id,
        name: item.name,
        description: item.description,
      })),
      objectives: objectives.map(obj => ({
        id: obj.id,
        name: obj.name,
        description: obj.description,
        steps: obj.steps.map(step => ({
          description: step.description,
          completed: step.isCompleted,
        })),
      })),
      map: mapData,
      currentRoomId: playerState?.currentRoomId,
    });
  } catch (error) {
    console.error('Get sidebar error:', error);
    return res.status(500).json({ error: 'Failed to get sidebar data' });
  }
});

// Get story analysis
router.get('/:id/analysis', async (req: Request, res: Response) => {
  try {
    const story = await prisma.story.findUnique({
      where: { id: req.params.id },
      include: {
        personalityScores: true,
        personalityEvents: true,
        storyAnalysis: true,
      },
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    return res.json({
      scores: story.personalityScores,
      events: story.personalityEvents,
      analysis: story.storyAnalysis,
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    return res.status(500).json({ error: 'Failed to get analysis' });
  }
});

// Helper: Extract themes from interview exchanges
function extractThemesSimple(exchanges: { question: string; answer: string }[]): string[] {
  const themes: string[] = [];
  const text = exchanges.map(e => e.answer).join(' ').toLowerCase();

  // Simple keyword matching (will be replaced by AI extraction)
  const themeKeywords: Record<string, string[]> = {
    adventure: ['adventure', 'explore', 'travel', 'discover', 'journey'],
    creativity: ['create', 'art', 'music', 'write', 'imagine', 'design'],
    relationships: ['family', 'friends', 'love', 'people', 'connect'],
    achievement: ['success', 'goal', 'accomplish', 'win', 'achieve'],
    nature: ['nature', 'outdoors', 'animals', 'environment', 'plants'],
    technology: ['technology', 'computers', 'games', 'programming', 'science'],
    mystery: ['mystery', 'puzzle', 'solve', 'curious', 'wonder'],
    helping: ['help', 'support', 'volunteer', 'care', 'community'],
  };

  for (const [theme, keywords] of Object.entries(themeKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      themes.push(theme);
    }
  }

  return themes.length > 0 ? themes : ['adventure', 'discovery'];
}

// Helper: Create initial map from story seed
async function createInitialMap(
  storyId: string,
  mapLayout: Array<{
    name: string;
    x: number;
    y: number;
    z?: number;
    description?: string;
    isStoryCritical?: boolean;
    objects?: Array<{ name: string; description: string; isTakeable?: boolean }>;
  }>,
  startingRoomId: string
): Promise<void> {
  const roomIdMap = new Map<string, string>();
  roomIdMap.set('0,0,0', startingRoomId);

  // Create all rooms first
  for (const roomDef of mapLayout) {
    const coordKey = `${roomDef.x},${roomDef.y},${roomDef.z || 0}`;

    // Skip if this is the starting room (0,0,0)
    if (coordKey === '0,0,0') continue;

    const room = await roomService.createRoom({
      storyId,
      name: roomDef.name,
      x: roomDef.x,
      y: roomDef.y,
      z: roomDef.z || 0,
      description: roomDef.description,
      isStoryCritical: roomDef.isStoryCritical || false,
    });

    roomIdMap.set(coordKey, room.id);

    // Create objects in the room
    if (roomDef.objects) {
      for (const obj of roomDef.objects) {
        await objectService.createObject({
          storyId,
          roomId: room.id,
          name: obj.name,
          description: obj.description,
          isTakeable: obj.isTakeable ?? true,
        });
      }
    }
  }

  // Connect adjacent rooms
  for (const [coordKey, roomId] of roomIdMap) {
    const [x, y, z] = coordKey.split(',').map(Number);

    // Check for adjacent rooms and connect them
    const directions: Array<{ dir: 'north' | 'south' | 'east' | 'west' | 'up' | 'down'; dx: number; dy: number; dz: number }> = [
      { dir: 'north', dx: 0, dy: 1, dz: 0 },
      { dir: 'south', dx: 0, dy: -1, dz: 0 },
      { dir: 'east', dx: 1, dy: 0, dz: 0 },
      { dir: 'west', dx: -1, dy: 0, dz: 0 },
      { dir: 'up', dx: 0, dy: 0, dz: 1 },
      { dir: 'down', dx: 0, dy: 0, dz: -1 },
    ];

    for (const { dir, dx, dy, dz } of directions) {
      const adjKey = `${x + dx},${y + dy},${z + dz}`;
      const adjRoomId = roomIdMap.get(adjKey);

      if (adjRoomId) {
        await roomService.connectRooms(roomId, adjRoomId, dir, false);
      }
    }
  }
}

export default router;
