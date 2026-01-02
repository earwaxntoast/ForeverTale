import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import {
  GenerationContext,
  GenerationProgress,
  AllStepData,
  GenerationStepName,
  GENERATION_STEPS,
} from './types.js';
import * as steps from './steps.js';

const prisma = new PrismaClient();

// Helper to format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

// Step function type
type StepFunction = (context: GenerationContext) => Promise<unknown>;

// Map step names to their functions
const STEP_FUNCTIONS: Record<GenerationStepName, StepFunction> = {
  identity: steps.generateIdentity,
  initialMap: steps.generateInitialMap,
  connectingAreas: steps.generateConnectingAreas,
  characters: steps.generateCharacters,
  backstory: steps.generateBackstory,
  dilemmas: steps.generateDilemmas,
  puzzles: steps.generatePuzzles,
  startingSkills: steps.generateStartingSkills,
  secretFacts: steps.generateSecretFacts,
  opening: steps.generateOpening,
};

// Helper for exponential backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Orchestrator for multi-step story generation
 * Emits 'progress' events with themed narratives
 */
export class StoryGenerationOrchestrator extends EventEmitter {
  private context: GenerationContext;
  private aborted: boolean = false;

  constructor(
    storyId: string,
    playerName: string,
    interviewExchanges: { question: string; answer: string }[],
    extractedThemes: string[],
    playerStoryPreference?: string
  ) {
    super();
    this.context = {
      storyId,
      playerName,
      interviewExchanges,
      extractedThemes,
      playerStoryPreference,
      completedSteps: [],
      stepData: {},
    };
  }

  /**
   * Generate the full story through all steps
   */
  async generate(): Promise<AllStepData> {
    const totalStartTime = Date.now();
    console.log('\n========================================');
    console.log('STORY GENERATION STARTING');
    console.log(`Story ID: ${this.context.storyId}`);
    console.log(`Player: ${this.context.playerName}`);
    console.log(`Total steps: ${GENERATION_STEPS.length}`);
    console.log('========================================\n');

    for (let i = 0; i < GENERATION_STEPS.length; i++) {
      if (this.aborted) {
        throw new Error('Generation aborted');
      }

      const stepConfig = GENERATION_STEPS[i];
      const stepFn = STEP_FUNCTIONS[stepConfig.name];
      const stepStartTime = Date.now();

      // Log step start
      console.log(`[Step ${i + 1}/${GENERATION_STEPS.length}] Starting: ${stepConfig.name}`);
      console.log(`  Description: ${stepConfig.description}`);

      // Emit progress at start of step
      this.emitProgress(stepConfig.name, i + 1, false);

      try {
        // Execute with retry
        const result = await this.executeWithRetry(
          () => stepFn(this.context),
          stepConfig.name,
          stepConfig.maxRetries
        );

        const stepDuration = Date.now() - stepStartTime;
        console.log(`[Step ${i + 1}/${GENERATION_STEPS.length}] Completed: ${stepConfig.name} (${formatDuration(stepDuration)})`);

        // Store result in context
        (this.context.stepData as Record<string, unknown>)[stepConfig.name] = result;
        this.context.completedSteps.push(stepConfig.name);

        // Persist intermediate result for recovery
        await this.persistStepResult(stepConfig.name, result);

      } catch (error) {
        const stepDuration = Date.now() - stepStartTime;
        console.error(`[Step ${i + 1}/${GENERATION_STEPS.length}] FAILED: ${stepConfig.name} after ${formatDuration(stepDuration)}`);
        console.error(`Step ${stepConfig.name} failed:`, error);
        this.emit('error', { step: stepConfig.name, error });
        throw error;
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    console.log('\n========================================');
    console.log('STORY GENERATION COMPLETE');
    console.log(`Total time: ${formatDuration(totalDuration)}`);
    console.log('========================================\n');

    // Emit final completion
    this.emitProgress('opening', GENERATION_STEPS.length, true);

    return this.context.stepData as AllStepData;
  }

  /**
   * Abort the generation process
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Get current context (for debugging/inspection)
   */
  getContext(): GenerationContext {
    return this.context;
  }

  /**
   * Execute a step with exponential backoff retry
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    stepName: string,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.error(
          `Step ${stepName} failed (attempt ${attempt}/${maxRetries}):`,
          error
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Emit a progress event
   */
  private emitProgress(
    currentStep: GenerationStepName,
    stepNumber: number,
    isComplete: boolean
  ): void {
    const stepConfig = GENERATION_STEPS.find(s => s.name === currentStep);

    const progress: GenerationProgress = {
      currentStep,
      stepNumber,
      totalSteps: GENERATION_STEPS.length,
      stepDescription: stepConfig?.description || '',
      themedNarrative: stepConfig?.themedNarrative || '',
      isComplete,
    };

    this.emit('progress', progress);
  }

  /**
   * Persist step result to database for recovery
   */
  private async persistStepResult(stepName: string, data: unknown): Promise<void> {
    try {
      const story = await prisma.story.findUnique({
        where: { id: this.context.storyId },
      });

      const existingSeed = (story?.storySeed as Record<string, unknown>) || {};
      const generationSteps = (existingSeed.generationSteps as Record<string, unknown>) || {};

      const newSeed = {
        ...existingSeed,
        generationSteps: {
          ...generationSteps,
          [stepName]: data,
        },
      };

      await prisma.story.update({
        where: { id: this.context.storyId },
        data: {
          storySeed: newSeed as object,
        },
      });
    } catch (error) {
      console.error(`Failed to persist step ${stepName}:`, error);
      // Don't throw - persistence failure shouldn't stop generation
    }
  }
}

/**
 * Resume generation from a previous checkpoint
 */
export async function resumeGeneration(storyId: string): Promise<AllStepData> {
  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      storySeed: true,
      initialInterview: true,
      characterBackstory: { select: { name: true } },
    },
  });

  if (!story) {
    throw new Error('Story not found');
  }

  const existingSeed = story.storySeed as { generationSteps?: Record<string, unknown> } | null;
  const completedSteps = existingSeed?.generationSteps || {};
  const completedStepNames = Object.keys(completedSteps) as GenerationStepName[];

  // Extract player name from interview or backstory
  const interview = story.initialInterview as { question: string; answer: string }[] | null;
  const playerName = story.characterBackstory?.name || 'Unknown';

  // Reconstruct context
  const context: GenerationContext = {
    storyId,
    playerName,
    interviewExchanges: interview || [],
    extractedThemes: extractThemesFromSeed(existingSeed),
    completedSteps: completedStepNames,
    stepData: completedSteps as Partial<AllStepData>,
  };

  // Find remaining steps
  const remainingSteps = GENERATION_STEPS.filter(
    s => !completedStepNames.includes(s.name)
  );

  if (remainingSteps.length === 0) {
    // Already complete
    return completedSteps as unknown as AllStepData;
  }

  // Create orchestrator and continue from checkpoint
  const orchestrator = new StoryGenerationOrchestrator(
    storyId,
    playerName,
    context.interviewExchanges,
    context.extractedThemes
  );

  // Inject existing data
  Object.assign(orchestrator.getContext().stepData, completedSteps);
  orchestrator.getContext().completedSteps = completedStepNames;

  // Continue generation (will skip completed steps due to context)
  return orchestrator.generate();
}

/**
 * Extract themes from existing seed data
 */
function extractThemesFromSeed(seed: Record<string, unknown> | null): string[] {
  if (!seed) return [];

  const identity = seed.identity as { keyThemes?: string[] } | undefined;
  return identity?.keyThemes || [];
}

/**
 * Convenience function to generate story with progress callback
 */
export async function generateStoryWithProgress(
  storyId: string,
  playerName: string,
  interviewExchanges: { question: string; answer: string }[],
  extractedThemes: string[],
  onProgress?: (progress: GenerationProgress) => void
): Promise<AllStepData> {
  const orchestrator = new StoryGenerationOrchestrator(
    storyId,
    playerName,
    interviewExchanges,
    extractedThemes
  );

  if (onProgress) {
    orchestrator.on('progress', onProgress);
  }

  return orchestrator.generate();
}

