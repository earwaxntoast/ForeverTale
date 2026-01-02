import { PrismaClient, Prisma } from '@prisma/client';
import { AllStepData, EnhancedRoomData, PuzzleData, PuzzleChainLink } from './types.js';

const prisma = new PrismaClient();

/**
 * Persist all generated story data to the database
 * Uses a transaction for atomic creation
 */
export async function persistGeneratedStory(
  storyId: string,
  playerName: string,
  data: AllStepData
): Promise<void> {
  // Use a longer timeout for the transaction - we're creating many records
  // (30+ rooms, 45+ puzzles with steps, characters, dilemmas, etc.)
  await prisma.$transaction(async (tx) => {
    // Maps to track created entity IDs
    const roomIdMap = new Map<string, string>();
    const dilemmaIdMap = new Map<string, string>();
    const puzzleIdMap = new Map<string, string>();

    // ============================================
    // 1. Update Story with identity info
    // ============================================
    await tx.story.update({
      where: { id: storyId },
      data: {
        title: data.identity.title,
        genreTags: data.identity.genreBlend,
      },
    });

    // ============================================
    // 2. Create Rooms from connectingAreas
    // ============================================
    for (const room of data.connectingAreas.rooms) {
      const created = await tx.room.create({
        data: {
          storyId,
          name: room.name,
          description: room.fullDescription,
          shortDescription: room.briefDescription,
          x: room.x,
          y: room.y,
          z: room.z,
          isStoryCritical: room.isStoryCritical,
          atmosphere: room.suggestedAtmosphere as Prisma.InputJsonValue,
        },
      });
      roomIdMap.set(room.name, created.id);

      // Create objects in room
      for (const obj of room.objects) {
        await tx.gameObject.create({
          data: {
            storyId,
            roomId: created.id,
            name: obj.name,
            description: obj.description,
            isTakeable: obj.isTakeable,
            isStoryCritical: obj.isStoryCritical || false,
            state: obj.initialState as Prisma.InputJsonValue || {},
          },
        });
      }
    }

    // ============================================
    // 3. Connect rooms via exits
    // ============================================
    for (const room of data.connectingAreas.rooms) {
      const roomId = roomIdMap.get(room.name);
      if (!roomId) continue;

      const exitUpdates: Prisma.RoomUpdateInput = {};

      for (const conn of room.connectionDescriptions) {
        const targetId = roomIdMap.get(conn.targetRoomName);
        if (targetId) {
          const exitField = `${conn.direction}RoomId` as keyof Prisma.RoomUpdateInput;
          (exitUpdates as Record<string, string>)[exitField] = targetId;
        }
      }

      if (Object.keys(exitUpdates).length > 0) {
        await tx.room.update({
          where: { id: roomId },
          data: exitUpdates,
        });
      }
    }

    // ============================================
    // 4. Create Characters
    // ============================================
    for (const char of data.characters.characters) {
      const roomId = roomIdMap.get(char.startingRoomName) || null;
      await tx.character.create({
        data: {
          storyId,
          name: char.name,
          description: char.briefDescription,
          personalityTraits: char.personality as Prisma.InputJsonValue,
          isMajorCharacter: char.role !== 'neutral',
          currentRoomId: roomId,
        },
      });
    }

    // ============================================
    // 5. Create Character Backstory
    // ============================================
    await tx.characterBackstory.create({
      data: {
        storyId,
        name: playerName,
        background: data.backstory.background,
        traits: data.backstory.personality.traits as Prisma.InputJsonValue,
        isRevealed: !data.backstory.isSecretBackstory,
      },
    });

    // ============================================
    // 6. Create Dilemmas
    // ============================================
    for (const dilemma of data.dilemmas.dilemmas) {
      const roomId = dilemma.triggerRoomName
        ? roomIdMap.get(dilemma.triggerRoomName) || null
        : null;

      const created = await tx.dilemmaPoint.create({
        data: {
          storyId,
          roomId,
          name: dilemma.name,
          description: dilemma.description,
          primaryDimension: dilemma.primaryDimension,
          secondaryDimension: dilemma.secondaryDimension,
          optionA: dilemma.optionA as unknown as Prisma.InputJsonValue,
          optionB: dilemma.optionB as unknown as Prisma.InputJsonValue,
          optionC: dilemma.optionC ? (dilemma.optionC as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
      dilemmaIdMap.set(dilemma.name, created.id);
    }

    // ============================================
    // 7. Create Puzzles with Steps
    // ============================================
    let displayOrder = 0;
    for (const puzzle of data.puzzles.puzzles) {
      const roomId = roomIdMap.get(puzzle.roomName) || null;
      const dilemmaId = puzzle.leadsToDilemma
        ? dilemmaIdMap.get(puzzle.leadsToDilemma) || null
        : null;

      const created = await tx.puzzle.create({
        data: {
          storyId,
          roomId,
          name: puzzle.name,
          description: puzzle.description,
          rewardType: puzzle.reward.type,
          rewardData: puzzle.reward.data as Prisma.InputJsonValue,
          targetDilemmaId: dilemmaId,
          displayOrder: displayOrder++,
        },
      });
      puzzleIdMap.set(puzzle.name, created.id);

      // Create puzzle steps
      for (const step of puzzle.steps) {
        await tx.puzzleStep.create({
          data: {
            puzzleId: created.id,
            stepNumber: step.stepNumber,
            description: step.description,
            hint: step.hint,
            requirements: step.requirements as Prisma.InputJsonValue,
          },
        });

        // Create timed event if step has urgency
        if (step.timedUrgency) {
          await tx.timedEvent.create({
            data: {
              storyId,
              roomId,
              name: `${puzzle.name}_step_${step.stepNumber}_timer`,
              description: `Timer for ${puzzle.name} step ${step.stepNumber}`,
              turnsRemaining: step.timedUrgency.turnsAllowed,
              totalTurns: step.timedUrgency.turnsAllowed,
              triggerNarrative: step.timedUrgency.failureConsequence,
              consequence: { type: 'puzzle_step_failed', puzzleName: puzzle.name, stepNumber: step.stepNumber } as Prisma.InputJsonValue,
              isActive: false, // Will be activated when puzzle step becomes current
            },
          });
        }
      }
    }

    // ============================================
    // 8. Create Puzzle Links (chains)
    // ============================================
    for (const link of data.puzzles.puzzleChains) {
      const sourceId = puzzleIdMap.get(link.sourcePuzzle);
      const targetId = puzzleIdMap.get(link.targetPuzzle);

      if (sourceId && targetId) {
        await tx.puzzleLink.create({
          data: {
            sourcePuzzleId: sourceId,
            targetPuzzleId: targetId,
            linkType: link.linkType,
            condition: link.condition,
          },
        });
      }
    }

    // ============================================
    // 9. Create Player Abilities
    // ============================================
    for (const skill of data.startingSkills.skills) {
      await tx.playerAbility.create({
        data: {
          storyId,
          name: skill.name,
          level: skill.level,
          origin: 'backstory',
          triggerVerbs: skill.triggerVerbs as Prisma.InputJsonValue,
          triggerNouns: skill.triggerNouns as Prisma.InputJsonValue,
        },
      });
    }

    // ============================================
    // 10. Create Secret Facts
    // ============================================
    for (const secret of data.secretFacts.secrets) {
      await tx.storyFact.create({
        data: {
          storyId,
          factType: secret.factType,
          content: secret.content,
          source: 'story_generation',
          importance: secret.importance,
          isSecret: true,
          isRevealed: false,
          deflectionHint: secret.deflectionHint,
          revealTrigger: secret.revealTrigger,
          topics: secret.topics as Prisma.InputJsonValue,
        },
      });
    }

    // ============================================
    // 11. Create PlayerState at starting room
    // ============================================
    const startingRoomId = roomIdMap.get(data.opening.startingRoomName);
    if (startingRoomId) {
      // Check if playerState already exists
      const existingState = await tx.playerState.findUnique({
        where: { storyId },
      });

      if (existingState) {
        await tx.playerState.update({
          where: { storyId },
          data: { currentRoomId: startingRoomId },
        });
      } else {
        await tx.playerState.create({
          data: {
            storyId,
            currentRoomId: startingRoomId,
          },
        });
      }

      // Mark starting room as visited
      await tx.room.update({
        where: { id: startingRoomId },
        data: {
          firstVisitedAt: new Date(),
          visitCount: 1,
        },
      });
    }

    // ============================================
    // 12. Create starting items in player inventory
    // ============================================
    for (const item of data.opening.startingItems) {
      await tx.gameObject.create({
        data: {
          storyId,
          roomId: null, // null = in player inventory
          name: item.name,
          description: item.description,
          isTakeable: true,
        },
      });
    }

    // ============================================
    // 13. Activate first puzzle(s) in chain
    // ============================================
    // Find puzzles with no prerequisites (root puzzles)
    const puzzlesWithPrereqs = new Set<string>();
    for (const link of data.puzzles.puzzleChains) {
      if (link.linkType === 'sequential') {
        puzzlesWithPrereqs.add(link.targetPuzzle);
      }
    }

    // Activate puzzles that have no prerequisites
    for (const puzzle of data.puzzles.puzzles) {
      if (!puzzlesWithPrereqs.has(puzzle.name)) {
        const puzzleId = puzzleIdMap.get(puzzle.name);
        if (puzzleId) {
          await tx.puzzle.update({
            where: { id: puzzleId },
            data: {
              status: 'active',
              isActive: true,
              startedAt: new Date(),
            },
          });
        }
      }
    }

    // ============================================
    // 14. Initialize Personality Scores
    // ============================================
    const existingScores = await tx.personalityScores.findUnique({
      where: { storyId },
    });

    if (!existingScores) {
      await tx.personalityScores.create({
        data: { storyId },
      });
    }

    // ============================================
    // 15. Create first chapter and opening scene
    // ============================================
    const chapter = await tx.chapter.create({
      data: {
        storyId,
        chapterNumber: 1,
        title: 'The Beginning',
        status: 'in_progress',
      },
    });

    await tx.scene.create({
      data: {
        chapterId: chapter.id,
        sceneNumber: 1,
        sceneType: 'exploration',
        narrativeText: data.opening.openingNarrative,
        aiProvider: 'claude',
      },
    });

    // ============================================
    // 16. Store complete story seed for reference
    // ============================================
    await tx.story.update({
      where: { id: storyId },
      data: {
        storySeed: data as unknown as Prisma.InputJsonValue,
        currentChapterId: chapter.id,
      },
    });
  }, {
    timeout: 120000, // 2 minutes - needed for creating many records
  });
}

/**
 * Get a summary of what was created
 */
export async function getGenerationSummary(storyId: string): Promise<{
  rooms: number;
  characters: number;
  puzzles: number;
  dilemmas: number;
  secrets: number;
  skills: number;
}> {
  const [rooms, characters, puzzles, dilemmas, secrets, skills] = await Promise.all([
    prisma.room.count({ where: { storyId } }),
    prisma.character.count({ where: { storyId } }),
    prisma.puzzle.count({ where: { storyId } }),
    prisma.dilemmaPoint.count({ where: { storyId } }),
    prisma.storyFact.count({ where: { storyId, isSecret: true } }),
    prisma.playerAbility.count({ where: { storyId } }),
  ]);

  return { rooms, characters, puzzles, dilemmas, secrets, skills };
}
