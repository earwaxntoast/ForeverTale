import { PrismaClient } from '@prisma/client';
import * as roomService from './roomService';
import * as objectService from './objectService';
import * as commandParser from './commandParser';
import { generateDilemma } from '../ai/gameAI';
import * as timedEventService from './timedEventService';
import * as puzzleService from './puzzleService';

const prisma = new PrismaClient();

export interface GameState {
  storyId: string;
  currentRoom: roomService.RoomWithDetails;
  turnCount: number;
  score: number;
}

export interface GameResponse {
  success: boolean;
  narrative: string;
  roomChanged: boolean;
  newRoomId?: string;
  gameState: {
    roomName: string;
    turnCount: number;
    score: number;
  };
  dilemmaTriggered?: {
    id: string;
    description: string;
    options: string[];
  };
  timedEvents?: {
    activeCount: number;
    narratives: string[];
    triggered: Array<{
      name: string;
      narrative: string;
      consequence: timedEventService.EventConsequence;
    }>;
  };
  gameOver?: {
    reason: string;
    narrative: string;
  };
}

/**
 * Initialize a new game from a story seed
 */
export async function initializeGame(
  storyId: string,
  storySeed: {
    startingRoom: {
      name: string;
      description: string;
      atmosphere?: Record<string, unknown>;
    };
    initialObjects?: Array<{
      name: string;
      description: string;
      isTakeable?: boolean;
    }>;
  }
): Promise<GameState> {
  // Create starting room
  const startingRoom = await roomService.createStartingRoom(
    storyId,
    storySeed.startingRoom.name,
    storySeed.startingRoom.description,
    storySeed.startingRoom.atmosphere
  );

  // Create initial objects
  if (storySeed.initialObjects) {
    for (const obj of storySeed.initialObjects) {
      await objectService.createObject({
        storyId,
        roomId: startingRoom.id,
        name: obj.name,
        description: obj.description,
        isTakeable: obj.isTakeable ?? true,
      });
    }
  }

  // Initialize personality scores
  await prisma.personalityScores.create({
    data: { storyId },
  });

  // Get the full room with details
  const room = await roomService.getRoom(startingRoom.id);
  if (!room) {
    throw new Error('Failed to create starting room');
  }

  // Get player state
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
  });

  return {
    storyId,
    currentRoom: room,
    turnCount: playerState?.turnCount || 0,
    score: playerState?.score || 0,
  };
}

/**
 * Process a player's turn
 */
export async function processTurn(
  storyId: string,
  playerInput: string
): Promise<GameResponse> {
  // Get current room before processing (for transcript)
  const playerStateBefore = await prisma.playerState.findUnique({
    where: { storyId },
  });

  // Log player input to transcript
  await addToTranscript(
    storyId,
    'player',
    playerInput,
    'command',
    playerStateBefore?.currentRoomId
  );

  // Parse the command
  const command = commandParser.parseCommand(playerInput);

  // Execute the command
  const result = await commandParser.executeCommand(storyId, command);

  // Get updated player state
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
  });

  if (!playerState) {
    throw new Error('Player state not found');
  }

  // Get current room
  const currentRoom = await roomService.getRoom(playerState.currentRoomId);
  if (!currentRoom) {
    throw new Error('Current room not found');
  }

  // Log narrator response to transcript
  await addToTranscript(
    storyId,
    'narrator',
    result.response,
    'narrative',
    currentRoom.id
  );

  // Record personality signal if present
  if (result.personalitySignal) {
    await recordPersonalityEvent(storyId, playerInput, result.personalitySignal);
  }

  // Check for puzzle step completion
  const inventory = await prisma.gameObject.findMany({
    where: { storyId, roomId: null },
    select: { name: true },
  });
  const inventoryNames = inventory.map(i => i.name);

  const puzzleResult = await puzzleService.checkPuzzleStepCompletion(
    storyId,
    playerInput,
    currentRoom.id,
    inventoryNames
  );

  // Tick all active timed events
  const tickResults = await timedEventService.tickEvents(storyId, currentRoom.id);
  const tickNarrative = timedEventService.formatTickResults(tickResults);
  const gameOverCheck = timedEventService.checkForGameOver(tickResults);

  // Get active event count for display
  const activeEvents = await timedEventService.getActiveEvents(storyId, currentRoom.id);

  // Log timed event narratives to transcript
  if (tickNarrative) {
    await addToTranscript(
      storyId,
      'system',
      tickNarrative,
      'system',
      currentRoom.id,
      { timedEvents: tickResults.map(r => ({ name: r.event.name, triggered: r.triggered })) }
    );
  }

  // Check for dilemma triggers
  const triggeredDilemma = await checkDilemmaTriggers(storyId, currentRoom.id);

  // If dilemma triggered, log it too
  if (triggeredDilemma) {
    await addToTranscript(
      storyId,
      'system',
      `[DILEMMA] ${triggeredDilemma.description}`,
      'system',
      currentRoom.id,
      { dilemmaId: triggeredDilemma.id, options: triggeredDilemma.options }
    );
  }

  // Build narrative with puzzle and timed event info appended
  let finalNarrative = result.response;

  // Add puzzle completion narratives
  if (puzzleResult.narratives.length > 0) {
    finalNarrative += '\n\n' + puzzleResult.narratives.join('\n');
  }

  if (tickNarrative) {
    finalNarrative += '\n\n' + tickNarrative;
  }

  // Build response
  const response: GameResponse = {
    success: result.success,
    narrative: finalNarrative,
    roomChanged: result.roomChanged || false,
    newRoomId: result.newRoomId,
    gameState: {
      roomName: currentRoom.name,
      turnCount: playerState.turnCount,
      score: playerState.score,
    },
  };

  // Add timed events info
  if (tickResults.length > 0 || activeEvents.length > 0) {
    response.timedEvents = {
      activeCount: activeEvents.length,
      narratives: tickResults.filter(r => r.narrative).map(r => r.narrative as string),
      triggered: tickResults
        .filter(r => r.triggered && r.consequence)
        .map(r => ({
          name: r.event.name,
          narrative: r.narrative || '',
          consequence: r.consequence as timedEventService.EventConsequence,
        })),
    };
  }

  // Handle game over from timed events
  if (gameOverCheck.isGameOver) {
    response.gameOver = {
      reason: 'timed_event',
      narrative: gameOverCheck.narrative || 'Time ran out.',
    };
  }

  if (triggeredDilemma) {
    response.dilemmaTriggered = triggeredDilemma;
  }

  return response;
}

/**
 * Record a personality event from gameplay
 */
async function recordPersonalityEvent(
  storyId: string,
  playerAction: string,
  signal: {
    dimension: string;
    delta: number;
    confidence: number;
    reasoning: string;
    choiceContext?: string;
    alternatives?: string[];
  }
): Promise<void> {
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
  });

  // Create the personality event
  await prisma.personalityEvent.create({
    data: {
      storyId,
      roomId: playerState?.currentRoomId,
      playerAction,
      dimension: signal.dimension,
      delta: signal.delta,
      confidence: signal.confidence,
      reasoning: signal.reasoning,
      choiceContext: signal.choiceContext,
      alternativesAvailable: signal.alternatives || [],
      isKeyMoment: signal.confidence >= 7, // High confidence = key moment
    },
  });

  // Update personality scores
  await updatePersonalityScore(storyId, signal.dimension, signal.delta, signal.confidence);
}

/**
 * Update the running personality score
 */
async function updatePersonalityScore(
  storyId: string,
  dimension: string,
  delta: number,
  confidence: number
): Promise<void> {
  const scores = await prisma.personalityScores.findUnique({
    where: { storyId },
  });

  if (!scores) return;

  // Map dimension to field names
  const dimensionMap: Record<string, { scoreField: string; confidenceField: string }> = {
    O: { scoreField: 'openness', confidenceField: 'opennessConfidence' },
    C: { scoreField: 'conscientiousness', confidenceField: 'conscientiousnessConfidence' },
    E: { scoreField: 'extraversion', confidenceField: 'extraversionConfidence' },
    A: { scoreField: 'agreeableness', confidenceField: 'agreeablenessConfidence' },
    N: { scoreField: 'neuroticism', confidenceField: 'neuroticismConfidence' },
  };

  const fields = dimensionMap[dimension];
  if (!fields) return;

  const currentScore = Number(scores[fields.scoreField as keyof typeof scores]) || 50;
  const currentConfidence = Number(scores[fields.confidenceField as keyof typeof scores]) || 0;

  // Weighted moving average - early data points have more weight
  const weight = 1 / (currentConfidence + 1);
  const adjustedDelta = delta * weight * (confidence / 10);
  const newScore = Math.max(0, Math.min(100, currentScore + adjustedDelta));

  await prisma.personalityScores.update({
    where: { storyId },
    data: {
      [fields.scoreField]: newScore,
      [fields.confidenceField]: currentConfidence + 1,
    },
  });
}

/**
 * Check if any dilemmas should trigger in the current room
 */
async function checkDilemmaTriggers(
  storyId: string,
  roomId: string
): Promise<{ id: string; description: string; options: string[] } | null> {
  // Find untriggered dilemmas for this room
  const dilemma = await prisma.dilemmaPoint.findFirst({
    where: {
      storyId,
      roomId,
      isTriggered: false,
    },
  });

  if (!dilemma) return null;

  // Mark as triggered
  await prisma.dilemmaPoint.update({
    where: { id: dilemma.id },
    data: {
      isTriggered: true,
      triggeredAt: new Date(),
    },
  });

  const optionA = dilemma.optionA as { description: string };
  const optionB = dilemma.optionB as { description: string };
  const optionC = dilemma.optionC as { description: string } | null;

  const options = [optionA.description, optionB.description];
  if (optionC) options.push(optionC.description);

  return {
    id: dilemma.id,
    description: dilemma.description,
    options,
  };
}

/**
 * Handle player's response to a dilemma
 */
export async function handleDilemmaResponse(
  storyId: string,
  dilemmaId: string,
  chosenOption: string, // 'A', 'B', 'C', or 'OTHER'
  playerResponse: string
): Promise<{ outcomeNarrative: string }> {
  const dilemma = await prisma.dilemmaPoint.findUnique({
    where: { id: dilemmaId },
  });

  if (!dilemma) {
    return { outcomeNarrative: 'The moment passes.' };
  }

  // Log the player's dilemma choice to transcript
  await addToTranscript(
    storyId,
    'player',
    playerResponse,
    'command',
    dilemma.roomId || undefined,
    { dilemmaId, chosenOption }
  );

  // Update the dilemma record
  await prisma.dilemmaPoint.update({
    where: { id: dilemmaId },
    data: {
      chosenOption,
      playerResponse,
    },
  });

  // Calculate personality signal based on choice
  const optionA = dilemma.optionA as { description: string; personalityImplication: string; outcomeNarrative?: string };
  const optionB = dilemma.optionB as { description: string; personalityImplication: string; outcomeNarrative?: string };
  const optionC = dilemma.optionC as { description: string; personalityImplication: string; outcomeNarrative?: string } | null;

  let delta = 0;
  let reasoning = '';
  let outcomeNarrative = '';

  switch (chosenOption) {
    case 'A':
      delta = 5; // Positive direction for dimension
      reasoning = optionA.personalityImplication;
      outcomeNarrative = optionA.outcomeNarrative || 'You follow through on your decision.';
      break;
    case 'B':
      delta = -5; // Negative direction for dimension
      reasoning = optionB.personalityImplication;
      outcomeNarrative = optionB.outcomeNarrative || 'You follow through on your decision.';
      break;
    case 'C':
      if (optionC) {
        delta = 0; // Neutral/middle ground
        reasoning = optionC.personalityImplication;
        outcomeNarrative = optionC.outcomeNarrative || 'You follow through on your decision.';
      }
      break;
    case 'OTHER':
      // Player found a creative solution - generate outcome with AI
      delta = 0;
      reasoning = 'Player chose a creative alternative solution.';
      outcomeNarrative = `You choose a different path: ${playerResponse}. The consequences of your unique approach will unfold.`;
      break;
  }

  // Log the outcome narrative to transcript
  await addToTranscript(
    storyId,
    'narrator',
    outcomeNarrative,
    'narrative',
    dilemma.roomId || undefined,
    { dilemmaId, chosenOption, outcome: true }
  );

  // Record the personality event
  await recordPersonalityEvent(storyId, playerResponse, {
    dimension: dilemma.primaryDimension,
    delta,
    confidence: 8, // Dilemmas are high-confidence signals
    reasoning,
    choiceContext: dilemma.description,
    alternatives: [optionA.description, optionB.description],
  });

  // If there's a secondary dimension, record that too
  if (dilemma.secondaryDimension) {
    await recordPersonalityEvent(storyId, playerResponse, {
      dimension: dilemma.secondaryDimension,
      delta: delta * 0.5, // Secondary signal is weaker
      confidence: 5,
      reasoning: `Secondary signal from: ${reasoning}`,
    });
  }

  return { outcomeNarrative };
}

/**
 * Add a story fact for coherence tracking
 */
export async function addStoryFact(
  storyId: string,
  factType: 'WORLD' | 'CHARACTER' | 'PLAYER_ACTION' | 'STORY_EVENT',
  content: string,
  source: string,
  importance: number = 5
): Promise<void> {
  await prisma.storyFact.create({
    data: {
      storyId,
      factType,
      content,
      source,
      importance,
    },
  });
}

/**
 * Get current game state
 */
export async function getGameState(storyId: string): Promise<GameState | null> {
  const playerState = await prisma.playerState.findUnique({
    where: { storyId },
  });

  if (!playerState) return null;

  const currentRoom = await roomService.getRoom(playerState.currentRoomId);
  if (!currentRoom) return null;

  return {
    storyId,
    currentRoom,
    turnCount: playerState.turnCount,
    score: playerState.score,
  };
}

/**
 * Get the opening description for when the game starts
 */
export async function getOpeningNarrative(storyId: string): Promise<string> {
  const gameState = await getGameState(storyId);
  if (!gameState) {
    throw new Error('Game state not found');
  }

  const { currentRoom } = gameState;
  const description = currentRoom.description || 'You find yourself in an unfamiliar place.';

  const narrative = roomService.formatRoomDescription(currentRoom, description, true);

  // Log opening to transcript
  await addToTranscript(storyId, 'narrator', narrative, 'narrative', currentRoom.id);

  return narrative;
}

/**
 * Add an entry to the game transcript
 */
export async function addToTranscript(
  storyId: string,
  speaker: 'player' | 'narrator' | 'system' | string,
  content: string,
  messageType: 'narrative' | 'command' | 'dialogue' | 'system' = 'narrative',
  roomId?: string,
  metadata: object = {}
): Promise<void> {
  // Get the next turn number
  const lastEntry = await prisma.gameTranscript.findFirst({
    where: { storyId },
    orderBy: { turnNumber: 'desc' },
  });

  const turnNumber = (lastEntry?.turnNumber ?? -1) + 1;

  await prisma.gameTranscript.create({
    data: {
      storyId,
      turnNumber,
      speaker,
      content,
      messageType,
      roomId,
      metadata,
    },
  });
}

/**
 * Get the full transcript for a story
 */
export async function getTranscript(storyId: string): Promise<Array<{
  turnNumber: number;
  speaker: string;
  content: string;
  messageType: string;
  createdAt: Date;
}>> {
  return prisma.gameTranscript.findMany({
    where: { storyId },
    orderBy: { turnNumber: 'asc' },
    select: {
      turnNumber: true,
      speaker: true,
      content: true,
      messageType: true,
      createdAt: true,
    },
  });
}
