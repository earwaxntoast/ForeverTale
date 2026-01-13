import { PrismaClient, Puzzle, PuzzleStep } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// Types
// ============================================

export interface ObjectiveStep {
  stepNumber: number;
  description: string;
  isCompleted: boolean;
  isRevealed: boolean;
  hint?: string;
}

export interface ObjectiveDisplay {
  id: string;
  name: string;
  description: string;
  steps: ObjectiveStep[];
  isActive: boolean;
}

export interface PuzzleCompletionResult {
  completedSteps: PuzzleStep[];
  completedPuzzles: Puzzle[];
  activatedPuzzles: Puzzle[];
  narratives: string[];
}

// ============================================
// Puzzle Step Completion
// ============================================

/**
 * Check if a player action completes any puzzle steps
 * Called after each player action
 */
export async function checkPuzzleStepCompletion(
  storyId: string,
  playerAction: string,
  currentRoomId: string,
  inventory: string[] // Item names in inventory
): Promise<PuzzleCompletionResult> {
  const result: PuzzleCompletionResult = {
    completedSteps: [],
    completedPuzzles: [],
    activatedPuzzles: [],
    narratives: [],
  };

  // Get current room name
  const currentRoom = await prisma.room.findUnique({
    where: { id: currentRoomId },
    select: { name: true },
  });

  if (!currentRoom) return result;

  // Get active puzzles with their steps
  const activePuzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      status: 'active',
    },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      room: { select: { name: true } },
    },
  });

  for (const puzzle of activePuzzles) {
    // Find the next incomplete AND revealed step
    const nextStep = puzzle.steps.find(s => !s.isCompleted && s.isRevealed);
    if (!nextStep) continue;

    // Check all requirements using new schema fields
    const roomMatch = checkRoomRequirement(nextStep, currentRoom.name);
    const itemsMatch = checkItemRequirements(nextStep, inventory);
    const actionMatch = checkActionRequirements(nextStep, playerAction);

    // All requirements must match
    if (roomMatch && itemsMatch && actionMatch) {
      // Complete the step
      await prisma.puzzleStep.update({
        where: { id: nextStep.id },
        data: {
          isCompleted: true,
          completedAt: new Date(),
        },
      });

      result.completedSteps.push(nextStep);
      result.narratives.push(`[Objective progress: ${nextStep.description}]`);

      // Reveal the next step in this puzzle (progressive reveal)
      const unreveledSteps = puzzle.steps.filter(
        s => s.id !== nextStep.id && !s.isCompleted && !s.isRevealed
      );
      const nextUnrevealedStep = unreveledSteps
        .sort((a, b) => a.stepNumber - b.stepNumber)[0];

      if (nextUnrevealedStep) {
        await prisma.puzzleStep.update({
          where: { id: nextUnrevealedStep.id },
          data: {
            isRevealed: true,
            revealedBy: nextStep.id,
          },
        });
      }

      // Check if puzzle is now complete
      const remainingSteps = puzzle.steps.filter(
        s => s.id !== nextStep.id && !s.isCompleted
      );

      if (remainingSteps.length === 0) {
        // Puzzle complete!
        await prisma.puzzle.update({
          where: { id: puzzle.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            isActive: false,
          },
        });

        result.completedPuzzles.push(puzzle);
        result.narratives.push(`[Objective complete: ${puzzle.name}]`);

        // Apply puzzle reward
        await applyPuzzleReward(storyId, puzzle);

        // Activate linked puzzles
        const activated = await activateLinkedPuzzles(puzzle.id);
        result.activatedPuzzles.push(...activated);

        for (const p of activated) {
          result.narratives.push(`[New objective: ${p.name}]`);
        }
      }
    }
  }

  // Also check for step reveals based on player action (revealTriggers)
  await checkStepReveals(storyId, playerAction);

  return result;
}

/**
 * Check if room requirement is met
 */
function checkRoomRequirement(
  step: PuzzleStep,
  currentRoomName: string
): boolean {
  if (!step.requiredRoom) return true;
  return currentRoomName.toLowerCase() === step.requiredRoom.toLowerCase();
}

/**
 * Check if item requirements are met
 */
function checkItemRequirements(
  step: PuzzleStep,
  inventory: string[]
): boolean {
  const requiredItems = step.requiredItems as string[] | null;
  if (!requiredItems?.length) return true;

  const normalizedInventory = inventory.map(i => i.toLowerCase());

  return requiredItems.every(requiredItem =>
    normalizedInventory.some(invItem =>
      invItem.includes(requiredItem.toLowerCase())
    )
  );
}

// Common words to skip when matching actions
const SKIP_WORDS = new Set(['the', 'a', 'an', 'at', 'on', 'in', 'to', 'with', 'of', 'and', 'or']);

// Verb synonym groups - any verb in a group can match any other
const VERB_SYNONYMS: Record<string, string[]> = {
  examine: ['examine', 'look', 'inspect', 'study', 'view', 'check', 'observe', 'see', 'read'],
  take: ['take', 'get', 'grab', 'pick', 'gather', 'collect', 'acquire', 'retrieve'],
  touch: ['touch', 'feel', 'press', 'push', 'tap', 'poke'],
  use: ['use', 'apply', 'activate', 'operate', 'employ'],
  talk: ['talk', 'speak', 'ask', 'tell', 'say', 'chat', 'converse'],
  open: ['open', 'unlock', 'unseal'],
  move: ['move', 'push', 'pull', 'slide', 'shift'],
  give: ['give', 'hand', 'offer', 'present', 'show'],
  attack: ['attack', 'hit', 'strike', 'fight', 'punch', 'kick'],
};

// Build reverse lookup: word -> canonical verb
const VERB_LOOKUP: Record<string, string> = {};
for (const [canonical, synonyms] of Object.entries(VERB_SYNONYMS)) {
  for (const syn of synonyms) {
    VERB_LOOKUP[syn] = canonical;
  }
}

/**
 * Extract significant words from an action string
 * Filters out common articles/prepositions
 */
function extractSignificantWords(action: string): string[] {
  return action
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 0 && !SKIP_WORDS.has(word));
}

/**
 * Get canonical verb for a word (if it's a known verb)
 */
function getCanonicalVerb(word: string): string | null {
  return VERB_LOOKUP[word.toLowerCase()] || null;
}

/**
 * Check if two words match (considering synonyms for verbs)
 */
function wordsMatch(word1: string, word2: string): boolean {
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();

  // Direct match
  if (w1 === w2) return true;

  // Partial match (one contains the other)
  if (w1.includes(w2) || w2.includes(w1)) return true;

  // Verb synonym match
  const canon1 = getCanonicalVerb(w1);
  const canon2 = getCanonicalVerb(w2);
  if (canon1 && canon2 && canon1 === canon2) return true;

  return false;
}

/**
 * Check if action requirements are met
 * Uses flexible matching with verb synonyms and partial word matching
 * Now uses step.completionAction instead of requirements.requiredActions
 */
function checkActionRequirements(
  step: PuzzleStep,
  playerAction: string
): boolean {
  const completionAction = step.completionAction;
  if (!completionAction) return true;

  const playerWords = extractSignificantWords(playerAction);
  const requiredWords = extractSignificantWords(completionAction);

  // Strategy 1: Direct substring match (original behavior)
  if (playerAction.toLowerCase().includes(completionAction.toLowerCase())) {
    return true;
  }

  // Strategy 2: Check if all required words are in player action (with synonym support)
  // This handles: required="examine blueprints", player="look at the blueprints"
  const allRequiredWordsMatch = requiredWords.every(reqWord =>
    playerWords.some(playerWord => wordsMatch(playerWord, reqWord))
  );

  if (allRequiredWordsMatch && requiredWords.length > 0) {
    return true;
  }

  // Strategy 3: Check if player action words are all in required action (with synonym support)
  // This handles: required="touch Floating Hammer", player="touch hammer"
  const allPlayerWordsMatch = playerWords.every(playerWord =>
    requiredWords.some(reqWord => wordsMatch(playerWord, reqWord))
  );

  if (allPlayerWordsMatch && playerWords.length > 0) {
    return true;
  }

  // Strategy 4: Verb + any noun match
  // Check if the verb matches AND at least one noun matches
  if (playerWords.length >= 1 && requiredWords.length >= 1) {
    const playerVerb = playerWords[0];
    const requiredVerb = requiredWords[0];
    const verbMatches = wordsMatch(playerVerb, requiredVerb);

    if (verbMatches) {
      // Check if any noun from player matches any noun from required
      const playerNouns = playerWords.slice(1);
      const requiredNouns = requiredWords.slice(1);

      const anyNounMatches = playerNouns.some(pn =>
        requiredNouns.some(rn => wordsMatch(pn, rn))
      );

      if (anyNounMatches || requiredNouns.length === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if player action triggers any step reveals
 * Steps can be revealed early by matching their revealTriggers
 */
async function checkStepReveals(storyId: string, playerAction: string): Promise<void> {
  const normalizedAction = playerAction.toLowerCase();

  // Find all unrevealed steps in active puzzles
  const activePuzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      isDiscovered: true,
      status: 'active',
    },
    include: {
      steps: {
        where: { isRevealed: false },
        orderBy: { stepNumber: 'asc' },
      },
    },
  });

  for (const puzzle of activePuzzles) {
    for (const step of puzzle.steps) {
      const triggers = step.revealTriggers as string[] | null;
      if (!triggers?.length) continue;

      // Check if player action matches any reveal trigger
      const triggerMatched = triggers.some(trigger => {
        const normalizedTrigger = trigger.toLowerCase();
        // Direct match or word overlap
        return normalizedAction.includes(normalizedTrigger) ||
          normalizedTrigger.includes(normalizedAction);
      });

      if (triggerMatched) {
        await prisma.puzzleStep.update({
          where: { id: step.id },
          data: {
            isRevealed: true,
            revealedBy: `action:${playerAction.substring(0, 50)}`,
          },
        });
      }
    }
  }
}

/**
 * Apply reward when puzzle is completed
 */
async function applyPuzzleReward(storyId: string, puzzle: Puzzle): Promise<void> {
  const rewardType = puzzle.rewardType;
  const rewardData = puzzle.rewardData as Record<string, unknown>;

  switch (rewardType) {
    case 'item': {
      // Create item in player inventory
      const itemName = rewardData.itemName as string;
      const itemDesc = rewardData.description as string;
      if (itemName) {
        await prisma.gameObject.create({
          data: {
            storyId,
            roomId: null, // null = in inventory
            name: itemName,
            description: itemDesc || '',
            isTakeable: true,
          },
        });
      }
      break;
    }

    case 'skill_boost': {
      // Increase a skill level
      const skillName = rewardData.skillName as string;
      const boost = (rewardData.amount as number) || 1;
      if (skillName) {
        const skill = await prisma.playerAbility.findFirst({
          where: { storyId, name: skillName },
        });
        if (skill) {
          await prisma.playerAbility.update({
            where: { id: skill.id },
            data: { level: { increment: boost } },
          });
        }
      }
      break;
    }

    case 'secret_reveal': {
      // Reveal a secret fact
      const factContent = rewardData.factContent as string;
      if (factContent) {
        await prisma.storyFact.updateMany({
          where: {
            storyId,
            content: { contains: factContent },
            isSecret: true,
          },
          data: {
            isRevealed: true,
            revealedAt: new Date(),
          },
        });
      }
      break;
    }

    case 'room_unlock': {
      // Reveal a hidden exit in a room
      const roomName = rewardData.roomName as string;
      const direction = rewardData.direction as string;
      if (roomName && direction) {
        const room = await prisma.room.findFirst({
          where: { storyId, name: roomName },
        });
        if (room) {
          const discoveredExits = (room.discoveredExits as string[]) || [];
          if (!discoveredExits.includes(direction)) {
            await prisma.room.update({
              where: { id: room.id },
              data: {
                discoveredExits: [...discoveredExits, direction],
              },
            });
          }
        }
      }
      break;
    }

    case 'dilemma': {
      // Trigger a dilemma - this will be handled by the game engine
      // Just mark it for triggering
      if (puzzle.targetDilemmaId) {
        await prisma.dilemmaPoint.update({
          where: { id: puzzle.targetDilemmaId },
          data: { isTriggered: true, triggeredAt: new Date() },
        });
      }
      break;
    }

    case 'character_info': {
      // Reveal character information - could update character description
      console.log(`Character info reward: ${JSON.stringify(rewardData)}`);
      break;
    }
  }
}

/**
 * Activate and discover puzzles that depend on the completed puzzle
 */
async function activateLinkedPuzzles(completedPuzzleId: string): Promise<Puzzle[]> {
  // Find sequential links from this puzzle
  const links = await prisma.puzzleLink.findMany({
    where: {
      sourcePuzzleId: completedPuzzleId,
      linkType: 'sequential',
    },
    include: {
      targetPuzzle: true,
    },
  });

  const activated: Puzzle[] = [];

  for (const link of links) {
    // Only activate if target is still pending
    if (link.targetPuzzle.status === 'pending') {
      await prisma.puzzle.update({
        where: { id: link.targetPuzzleId },
        data: {
          status: 'active',
          isActive: true,
          isDiscovered: true, // Also mark as discovered
          startedAt: new Date(),
        },
      });
      activated.push(link.targetPuzzle);
    }
  }

  return activated;
}

// ============================================
// Objectives for Sidebar
// ============================================

/**
 * Get discovered objectives for sidebar display
 * Only shows puzzles that have been discovered by the player
 * Only shows steps that have been revealed (progressive reveal system)
 */
export async function getObjectives(storyId: string): Promise<ObjectiveDisplay[]> {
  const puzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      isDiscovered: true, // Only show discovered puzzles
      status: { in: ['active', 'pending'] }, // Not completed or failed
    },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
    },
    orderBy: { displayOrder: 'asc' },
  });

  return puzzles.map(puzzle => ({
    id: puzzle.id,
    name: puzzle.name,
    description: puzzle.description,
    // Only include revealed steps (progressive reveal)
    steps: puzzle.steps
      .filter(step => step.isRevealed)
      .map(step => ({
        stepNumber: step.stepNumber,
        description: step.description,
        isCompleted: step.isCompleted,
        isRevealed: step.isRevealed,
        hint: step.hint || undefined,
      })),
    isActive: puzzle.status === 'active',
  }));
}

/**
 * Get count of active objectives
 */
export async function getActiveObjectiveCount(storyId: string): Promise<number> {
  return prisma.puzzle.count({
    where: {
      storyId,
      status: 'active',
      isActive: true,
    },
  });
}

/**
 * Get completed objective count
 */
export async function getCompletedObjectiveCount(storyId: string): Promise<number> {
  return prisma.puzzle.count({
    where: {
      storyId,
      status: 'completed',
    },
  });
}

/**
 * Manually activate a puzzle (e.g., when player discovers it)
 */
export async function activatePuzzle(puzzleId: string): Promise<Puzzle> {
  return prisma.puzzle.update({
    where: { id: puzzleId },
    data: {
      status: 'active',
      isActive: true,
      startedAt: new Date(),
    },
  });
}

/**
 * Mark a puzzle as failed (e.g., timed out)
 */
export async function failPuzzle(puzzleId: string): Promise<Puzzle> {
  return prisma.puzzle.update({
    where: { id: puzzleId },
    data: {
      status: 'failed',
      isActive: false,
    },
  });
}

/**
 * Get puzzle by name
 */
export async function getPuzzleByName(
  storyId: string,
  name: string
): Promise<Puzzle | null> {
  return prisma.puzzle.findFirst({
    where: { storyId, name },
  });
}

/**
 * Get current step for a puzzle
 */
export async function getCurrentPuzzleStep(
  puzzleId: string
): Promise<PuzzleStep | null> {
  return prisma.puzzleStep.findFirst({
    where: {
      puzzleId,
      isCompleted: false,
    },
    orderBy: { stepNumber: 'asc' },
  });
}

// ============================================
// Puzzle Discovery
// ============================================

export interface DiscoveryResult {
  discoveredPuzzles: Puzzle[];
  narratives: string[];
}

/**
 * Discover puzzles when player picks up an item
 * If an item is required for any puzzle step, that puzzle is discovered
 */
export async function discoverPuzzlesFromItem(
  storyId: string,
  itemName: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    discoveredPuzzles: [],
    narratives: [],
  };

  const normalizedItem = itemName.toLowerCase();

  // Find all undiscovered puzzles
  const undiscoveredPuzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      isDiscovered: false,
      status: 'pending',
    },
    include: {
      steps: true,
    },
  });

  for (const puzzle of undiscoveredPuzzles) {
    // Check if any step requires this item
    for (const step of puzzle.steps) {
      const requiredItems = step.requiredItems as string[] | null;
      if (requiredItems?.length) {
        const hasMatch = requiredItems.some(reqItem =>
          normalizedItem.includes(reqItem.toLowerCase()) ||
          reqItem.toLowerCase().includes(normalizedItem)
        );

        if (hasMatch) {
          // Discover the puzzle
          await prisma.puzzle.update({
            where: { id: puzzle.id },
            data: { isDiscovered: true },
          });

          result.discoveredPuzzles.push(puzzle);
          result.narratives.push(`[New objective discovered: ${puzzle.name}]`);
          break; // Only need to discover once per puzzle
        }
      }
    }
  }

  return result;
}

/**
 * Discover puzzles when player performs an action
 * If an action matches any puzzle step's completionAction or revealTriggers, that puzzle is discovered
 */
export async function discoverPuzzlesFromAction(
  storyId: string,
  action: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    discoveredPuzzles: [],
    narratives: [],
  };

  const normalizedAction = action.toLowerCase();

  // Find all undiscovered puzzles
  const undiscoveredPuzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      isDiscovered: false,
      status: 'pending',
    },
    include: {
      steps: true,
    },
  });

  for (const puzzle of undiscoveredPuzzles) {
    // Check if any step's completionAction or revealTriggers match the player's action
    for (const step of puzzle.steps) {
      let hasMatch = false;

      // Check completionAction
      if (step.completionAction) {
        hasMatch = normalizedAction.includes(step.completionAction.toLowerCase());
      }

      // Check revealTriggers
      if (!hasMatch) {
        const triggers = step.revealTriggers as string[] | null;
        if (triggers?.length) {
          hasMatch = triggers.some(trigger =>
            normalizedAction.includes(trigger.toLowerCase())
          );
        }
      }

      if (hasMatch) {
        // Discover the puzzle
        await prisma.puzzle.update({
          where: { id: puzzle.id },
          data: { isDiscovered: true },
        });

        result.discoveredPuzzles.push(puzzle);
        result.narratives.push(`[New objective discovered: ${puzzle.name}]`);
        break; // Only need to discover once per puzzle
      }
    }
  }

  return result;
}

/**
 * Discover puzzles when player enters a room
 * Only discovers puzzles that have discoversOnRoomEntry = true
 */
export async function discoverPuzzlesOnRoomEntry(
  storyId: string,
  roomId: string
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    discoveredPuzzles: [],
    narratives: [],
  };

  // Find puzzles in this room that should auto-discover on entry
  const puzzlesToDiscover = await prisma.puzzle.findMany({
    where: {
      storyId,
      roomId,
      isDiscovered: false,
      discoversOnRoomEntry: true,
      status: 'pending',
    },
  });

  for (const puzzle of puzzlesToDiscover) {
    await prisma.puzzle.update({
      where: { id: puzzle.id },
      data: {
        isDiscovered: true,
        status: 'active', // Also activate since it's immediately apparent
        isActive: true,
        startedAt: new Date(),
      },
    });

    result.discoveredPuzzles.push(puzzle);
    result.narratives.push(`[New objective: ${puzzle.name}]`);
  }

  return result;
}

/**
 * Manually discover a puzzle (e.g., when triggered by game logic)
 */
export async function discoverPuzzle(puzzleId: string): Promise<Puzzle> {
  return prisma.puzzle.update({
    where: { id: puzzleId },
    data: { isDiscovered: true },
  });
}

// ============================================
// Hidden Exit Discovery
// ============================================

export interface ExitDiscoveryResult {
  discoveredExits: { roomId: string; roomName: string; direction: string }[];
  narratives: string[];
}

/**
 * Check if player action reveals any hidden exits in the current room
 * Called after each player action to see if they discovered a secret passage
 */
export async function discoverHiddenExits(
  storyId: string,
  currentRoomId: string,
  playerAction: string
): Promise<ExitDiscoveryResult> {
  const result: ExitDiscoveryResult = {
    discoveredExits: [],
    narratives: [],
  };

  // Get current room with connection descriptions from story seed
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { storySeed: true },
  });

  const room = await prisma.room.findUnique({
    where: { id: currentRoomId },
    select: {
      id: true,
      name: true,
      hiddenExits: true,
      discoveredExits: true,
    },
  });

  if (!room || !story?.storySeed) return result;

  const hiddenExits = (room.hiddenExits as string[]) || [];
  const discoveredExits = (room.discoveredExits as string[]) || [];
  const normalizedAction = playerAction.toLowerCase();

  // Get the room's connection descriptions from the story seed
  const storySeed = story.storySeed as { connectingAreas?: { rooms?: Array<{
    name: string;
    connectionDescriptions?: Array<{
      direction: string;
      isHidden?: boolean;
      hiddenUntil?: string;
    }>;
  }> } };

  const roomData = storySeed.connectingAreas?.rooms?.find(
    r => r.name.toLowerCase() === room.name.toLowerCase()
  );

  if (!roomData?.connectionDescriptions) return result;

  // Check each hidden exit to see if player action matches hiddenUntil
  for (const conn of roomData.connectionDescriptions) {
    if (!conn.isHidden || !conn.hiddenUntil) continue;
    if (!hiddenExits.includes(conn.direction)) continue;
    if (discoveredExits.includes(conn.direction)) continue;

    // Check if player action matches the hiddenUntil condition
    const hiddenUntil = conn.hiddenUntil.toLowerCase();

    // Simple pattern matching - check if action contains key words from hiddenUntil
    // e.g., "examine bookcase" matches "examine bookcase"
    // e.g., "look at the old bookcase" matches "examine bookcase" (contains "bookcase")
    const hiddenUntilWords = hiddenUntil.split(/\s+/);
    const matchesAction = hiddenUntilWords.every(word =>
      normalizedAction.includes(word) ||
      // Also check common synonyms
      (word === 'examine' && (normalizedAction.includes('look') || normalizedAction.includes('search') || normalizedAction.includes('inspect'))) ||
      (word === 'use' && normalizedAction.includes('put')) ||
      (word === 'pull' && normalizedAction.includes('move'))
    );

    if (matchesAction) {
      // Reveal this exit!
      const newDiscoveredExits = [...discoveredExits, conn.direction];
      await prisma.room.update({
        where: { id: room.id },
        data: { discoveredExits: newDiscoveredExits },
      });

      result.discoveredExits.push({
        roomId: room.id,
        roomName: room.name,
        direction: conn.direction,
      });
      result.narratives.push(`[You discovered a hidden passage to the ${conn.direction}!]`);

      // Update discoveredExits array for subsequent checks in same action
      discoveredExits.push(conn.direction);
    }
  }

  return result;
}
