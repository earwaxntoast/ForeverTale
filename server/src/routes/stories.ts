import { Router, Request, Response } from 'express';
import { prisma } from '../models/prisma.js';
import { generateStorySeed } from '../services/ai/claude.js';
import { routeSceneGeneration, analyzeInputForRouting } from '../services/ai/router.js';
import * as gameEngine from '../services/game/gameEngine.js';
import * as roomService from '../services/game/roomService.js';
import * as objectService from '../services/game/objectService.js';
import * as skillService from '../services/game/skillService.js';

const router = Router();

// Create a new story from interview data
router.post('/', async (req: Request, res: Response) => {
  try {
    const { playerName, interviewExchanges } = req.body;

    if (!playerName || !interviewExchanges) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract themes from interview
    const themes = extractThemesSimple(interviewExchanges);

    // Generate story seed using Claude
    const storySeed = await generateStorySeed({
      playerName,
      interviewExchanges,
      extractedThemes: themes,
    });

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

    // Create the story
    const story = await prisma.story.create({
      data: {
        userId: user.id,
        title: storySeed.title,
        status: 'in_progress',
        genreTags: storySeed.genreBlend,
        initialInterview: interviewExchanges,
        storySeed: storySeed as object,
      },
    });

    // Create first chapter
    const chapter = await prisma.chapter.create({
      data: {
        storyId: story.id,
        chapterNumber: 1,
        title: 'The Beginning',
      },
    });

    // Update story with current chapter
    await prisma.story.update({
      where: { id: story.id },
      data: { currentChapterId: chapter.id },
    });

    // Create initial characters from story seed
    for (const char of storySeed.initialCharacters) {
      await prisma.character.create({
        data: {
          storyId: story.id,
          name: char.name,
          description: char.role,
          personalityTraits: { traits: char.traits },
          isMajorCharacter: true,
        },
      });
    }

    // Create character backstory from story seed
    if (storySeed.characterBackstory) {
      await prisma.characterBackstory.create({
        data: {
          storyId: story.id,
          name: playerName,
          background: storySeed.characterBackstory.background,
          traits: storySeed.characterBackstory.traits || [],
          isRevealed: !storySeed.characterBackstory.isSecretBackstory,
        },
      });
    }

    // Create starting abilities from story seed
    if (storySeed.startingSkills && storySeed.startingSkills.length > 0) {
      await skillService.createStartingAbilities(
        story.id,
        storySeed.startingSkills.map(skill => ({
          name: skill.name,
          level: skill.level,
          verbs: skill.triggerVerbs,
        }))
      );
    }

    // Create secret facts from story seed
    if (storySeed.secretFacts && storySeed.secretFacts.length > 0) {
      for (const fact of storySeed.secretFacts) {
        await prisma.storyFact.create({
          data: {
            storyId: story.id,
            content: fact.content,
            factType: 'SECRET',
            source: 'story_seed',
            importance: 8, // High importance for secrets
            isSecret: true,
            isRevealed: false,
            deflectionHint: fact.deflectionHint,
            revealTrigger: fact.revealTrigger,
            topics: fact.topics || [],
          },
        });
      }
    }

    // Initialize the game world
    const gameState = await gameEngine.initializeGame(story.id, {
      startingRoom: {
        name: storySeed.startingLocation?.name || 'The Beginning',
        description: storySeed.openingScenario,
        atmosphere: {
          mood: storySeed.tone || 'mysterious',
          lighting: 'dim',
        },
      },
      initialObjects: storySeed.startingItems || [],
    });

    // Create initial rooms based on story seed (if map layout provided)
    if (storySeed.initialMap) {
      await createInitialMap(story.id, storySeed.initialMap, gameState.currentRoom.id);
    }

    // Create planned dilemmas from story seed
    if (storySeed.plannedDilemmas) {
      for (const dilemma of storySeed.plannedDilemmas) {
        await prisma.dilemmaPoint.create({
          data: {
            storyId: story.id,
            name: dilemma.name,
            description: dilemma.description,
            primaryDimension: dilemma.primaryDimension,
            secondaryDimension: dilemma.secondaryDimension,
            optionA: dilemma.optionA,
            optionB: dilemma.optionB,
            optionC: dilemma.optionC,
          },
        });
      }
    }

    // Generate opening scene record
    const openingScene = await prisma.scene.create({
      data: {
        chapterId: chapter.id,
        sceneNumber: 1,
        sceneType: 'exploration',
        narrativeText: storySeed.openingScenario,
        aiProvider: 'claude',
      },
    });

    // Update story with current scene
    await prisma.story.update({
      where: { id: story.id },
      data: { currentSceneId: openingScene.id },
    });

    // Get the formatted opening narrative
    const openingNarrative = await gameEngine.getOpeningNarrative(story.id);

    return res.json({
      storyId: story.id,
      title: storySeed.title,
      openingScene: openingNarrative,
      storySeed,
    });
  } catch (error) {
    console.error('Create story error:', error);
    return res.status(500).json({ error: 'Failed to create story' });
  }
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
