import { PrismaClient, Puzzle, PuzzleStep } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// Types
// ============================================

export interface PuzzleStepRequirements {
  requiredItems?: string[];
  requiredActions?: string[];
  requiredRoom?: string;
}

export interface ObjectiveStep {
  stepNumber: number;
  description: string;
  isCompleted: boolean;
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
    // Find the next incomplete step
    const nextStep = puzzle.steps.find(s => !s.isCompleted);
    if (!nextStep) continue;

    const requirements = nextStep.requirements as PuzzleStepRequirements;

    // Check all requirements
    const roomMatch = checkRoomRequirement(requirements, currentRoom.name);
    const itemsMatch = checkItemRequirements(requirements, inventory);
    const actionMatch = checkActionRequirements(requirements, playerAction);

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

  return result;
}

/**
 * Check if room requirement is met
 */
function checkRoomRequirement(
  requirements: PuzzleStepRequirements,
  currentRoomName: string
): boolean {
  if (!requirements.requiredRoom) return true;
  return currentRoomName.toLowerCase() === requirements.requiredRoom.toLowerCase();
}

/**
 * Check if item requirements are met
 */
function checkItemRequirements(
  requirements: PuzzleStepRequirements,
  inventory: string[]
): boolean {
  if (!requirements.requiredItems?.length) return true;

  const normalizedInventory = inventory.map(i => i.toLowerCase());

  return requirements.requiredItems.every(requiredItem =>
    normalizedInventory.some(invItem =>
      invItem.includes(requiredItem.toLowerCase())
    )
  );
}

/**
 * Check if action requirements are met
 */
function checkActionRequirements(
  requirements: PuzzleStepRequirements,
  playerAction: string
): boolean {
  if (!requirements.requiredActions?.length) return true;

  const normalizedAction = playerAction.toLowerCase();

  return requirements.requiredActions.some(requiredAction =>
    normalizedAction.includes(requiredAction.toLowerCase())
  );
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
      // Could unlock a hidden room or passage
      // For now, just log - actual implementation depends on game mechanics
      console.log(`Room unlock reward: ${JSON.stringify(rewardData)}`);
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
 * Activate puzzles that depend on the completed puzzle
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
 * Get active objectives for sidebar display
 */
export async function getObjectives(storyId: string): Promise<ObjectiveDisplay[]> {
  const puzzles = await prisma.puzzle.findMany({
    where: {
      storyId,
      isActive: true,
      status: { in: ['active', 'pending'] },
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
    steps: puzzle.steps.map(step => ({
      stepNumber: step.stepNumber,
      description: step.description,
      isCompleted: step.isCompleted,
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
