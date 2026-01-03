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

// Boot-up style log messages for each step
const STEP_LOG_MESSAGES: Record<GenerationStepName, string[]> = {
  identity: [
    '[ OK ] Initializing narrative consciousness...',
    '[ OK ] Loading archetypal pattern matrices...',
    '[ OK ] Calibrating genre synthesis protocols...',
    '[ OK ] Bootstrapping thematic resonance engine...',
    '[ OK ] Analyzing psychometric interview data...',
    '[ OK ] Cross-referencing Jungian symbol tables...',
    '[ OK ] Establishing narrative coherence field...',
    '[ OK ] Quantum-entangling story elements...',
  ],
  initialMap: [
    '[ OK ] Initializing spatial cognition module...',
    '[ OK ] Generating topological manifold...',
    '[ OK ] Seeding reality anchor points...',
    '[ OK ] Calculating liminal space coordinates...',
    '[ OK ] Mapping collective unconscious terrain...',
    '[ OK ] Reticulating splines...',
    '[ OK ] Rendering threshold guardians...',
    '[ OK ] Binding location memory engrams...',
  ],
  connectingAreas: [
    '[ OK ] Weaving interstitial pathways...',
    '[ OK ] Rendering environmental atmospherics...',
    '[ OK ] Populating object permanence tables...',
    '[ OK ] Calculating shadow projection angles...',
    '[ OK ] Establishing sensory detail buffers...',
    '[ OK ] Binding transitional narratives...',
    '[ OK ] Synchronizing room state machines...',
    '[ OK ] Validating spatial continuity...',
  ],
  characters: [
    '[ OK ] Spawning autonomous personality cores...',
    '[ OK ] Loading behavioral archetype templates...',
    '[ OK ] Initializing dialogue generation systems...',
    '[ OK ] Calibrating emotional response matrices...',
    '[ OK ] Binding character motivation engines...',
    '[ OK ] Establishing relationship graph nodes...',
    '[ OK ] Seeding secret knowledge containers...',
    '[ OK ] Activating voice synthesis patterns...',
  ],
  backstory: [
    '[ OK ] Excavating memory fragment caches...',
    '[ OK ] Reconstructing temporal narrative threads...',
    '[ OK ] Binding trauma response patterns...',
    '[ OK ] Calculating destiny probability curves...',
    '[ OK ] Establishing origin point coordinates...',
    '[ OK ] Loading formative experience modules...',
    '[ OK ] Synchronizing past-present resonance...',
    '[ OK ] Validating identity coherence...',
  ],
  dilemmas: [
    '[ OK ] Initializing moral complexity engine...',
    '[ OK ] Loading ethical paradox matrices...',
    '[ OK ] Calibrating parallel dimension sensors...',
    '[ OK ] Generating choice bifurcation points...',
    '[ OK ] Establishing consequence probability trees...',
    '[ OK ] Binding psychological revelation triggers...',
    '[ OK ] Seeding character-defining moments...',
    '[ OK ] Validating dilemma authenticity scores...',
  ],
  puzzles: [
    '[ OK ] Constructing cognitive challenge lattices...',
    '[ OK ] Seeding discovery reward pathways...',
    '[ OK ] Binding item-action dependency graphs...',
    '[ OK ] Establishing puzzle chain hierarchies...',
    '[ OK ] Loading hint gradient algorithms...',
    '[ OK ] Calibrating difficulty resonance curves...',
    '[ OK ] Generating eureka moment triggers...',
    '[ OK ] Validating solution accessibility paths...',
  ],
  startingSkills: [
    '[ OK ] Initializing ability manifestation cores...',
    '[ OK ] Binding verb-noun trigger matrices...',
    '[ OK ] Loading skill progression algorithms...',
    '[ OK ] Calibrating backstory-ability resonance...',
    '[ OK ] Establishing mastery growth curves...',
    '[ OK ] Seeding latent potential markers...',
    '[ OK ] Validating action-skill mappings...',
    '[ OK ] Activating competence feedback loops...',
  ],
  secretFacts: [
    '[ OK ] Encrypting hidden truth containers...',
    '[ OK ] Binding revelation trigger conditions...',
    '[ OK ] Loading deflection response patterns...',
    '[ OK ] Establishing secret importance weights...',
    '[ OK ] Seeding narrative surprise moments...',
    '[ OK ] Calibrating discovery satisfaction curves...',
    '[ OK ] Generating mystery depth layers...',
    '[ OK ] Validating secret coherence matrices...',
  ],
  opening: [
    '[ OK ] Composing initial narrative voice...',
    '[ OK ] Establishing atmospheric parameters...',
    '[ OK ] Binding player agency pathways...',
    '[ OK ] Loading immediate choice options...',
    '[ OK ] Calibrating hook engagement metrics...',
    '[ OK ] Seeding curiosity trigger points...',
    '[ OK ] Finalizing story bootstrap sequence...',
    '[ OK ] Preparing consciousness transfer...',
  ],
};

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
  private currentLogMessages: string[] = [];
  private logInterval: NodeJS.Timeout | null = null;
  private currentLogIndex: number = 0;

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
   * Start emitting log messages at intervals for a step
   */
  private startLogEmitter(stepName: GenerationStepName, stepNumber: number): void {
    const messages = STEP_LOG_MESSAGES[stepName] || [];
    this.currentLogMessages = [];
    this.currentLogIndex = 0;

    // Emit first message immediately
    if (messages.length > 0) {
      this.currentLogMessages.push(messages[0]);
      this.emitProgressWithLogs(stepName, stepNumber, false);
    }

    // Then emit a new message every 3-5 seconds
    this.logInterval = setInterval(() => {
      this.currentLogIndex++;
      if (this.currentLogIndex < messages.length) {
        this.currentLogMessages.push(messages[this.currentLogIndex]);
        this.emitProgressWithLogs(stepName, stepNumber, false);
      } else {
        // Cycle through messages if step takes very long
        const cycleIndex = this.currentLogIndex % messages.length;
        const cycleNum = Math.floor(this.currentLogIndex / messages.length);
        const cycledMessage = messages[cycleIndex].replace('[ OK ]', `[${cycleNum + 1}x]`);
        this.currentLogMessages.push(cycledMessage);
        // Keep only last 12 messages
        if (this.currentLogMessages.length > 12) {
          this.currentLogMessages = this.currentLogMessages.slice(-12);
        }
        this.emitProgressWithLogs(stepName, stepNumber, false);
      }
    }, 3000 + Math.random() * 2000); // 3-5 second intervals
  }

  /**
   * Stop the log emitter
   */
  private stopLogEmitter(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
  }

  /**
   * Emit progress with current log messages
   */
  private emitProgressWithLogs(
    currentStep: GenerationStepName,
    stepNumber: number,
    isComplete: boolean,
    subProgress?: { current: number; total: number; label: string }
  ): void {
    const stepConfig = GENERATION_STEPS.find(s => s.name === currentStep);

    const progress: GenerationProgress = {
      currentStep,
      stepNumber,
      totalSteps: GENERATION_STEPS.length,
      stepDescription: stepConfig?.description || '',
      themedNarrative: stepConfig?.themedNarrative || '',
      isComplete,
      logMessages: [...this.currentLogMessages],
      subProgress,
    };

    this.emit('progress', progress);
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
        this.stopLogEmitter();
        throw new Error('Generation aborted');
      }

      const stepConfig = GENERATION_STEPS[i];
      const stepFn = STEP_FUNCTIONS[stepConfig.name];
      const stepStartTime = Date.now();

      // Log step start
      console.log(`[Step ${i + 1}/${GENERATION_STEPS.length}] Starting: ${stepConfig.name}`);
      console.log(`  Description: ${stepConfig.description}`);

      // Start log message emitter for visual feedback
      this.startLogEmitter(stepConfig.name, i + 1);

      try {
        // Execute with retry
        const result = await this.executeWithRetry(
          () => stepFn(this.context),
          stepConfig.name,
          stepConfig.maxRetries
        );

        // Stop log emitter
        this.stopLogEmitter();

        const stepDuration = Date.now() - stepStartTime;
        console.log(`[Step ${i + 1}/${GENERATION_STEPS.length}] Completed: ${stepConfig.name} (${formatDuration(stepDuration)})`);

        // Add completion message to logs
        this.currentLogMessages.push(`[DONE] ${stepConfig.name} completed in ${formatDuration(stepDuration)}`);
        this.emitProgressWithLogs(stepConfig.name, i + 1, false);

        // Store result in context
        (this.context.stepData as Record<string, unknown>)[stepConfig.name] = result;
        this.context.completedSteps.push(stepConfig.name);

        // Persist intermediate result for recovery
        await this.persistStepResult(stepConfig.name, result);

      } catch (error) {
        this.stopLogEmitter();
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

    // Emit progress update (NOT isComplete - that comes from route handler after persist)
    this.currentLogMessages.push(`[BOOT] Story generation complete in ${formatDuration(totalDuration)}`);
    this.currentLogMessages.push(`[BOOT] Persisting story data...`);
    this.emitProgressWithLogs('opening', GENERATION_STEPS.length, false);

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

