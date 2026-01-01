// ============================================
// MULTI-STEP STORY GENERATION TYPES
// ============================================

// Context passed to all generation steps
export interface GenerationContext {
  storyId: string;
  playerName: string;
  interviewExchanges: { question: string; answer: string }[];
  extractedThemes: string[];
  playerStoryPreference?: string; // Player's preferred story type (overrides AI suggestions)
  completedSteps: GenerationStepName[];
  stepData: Partial<AllStepData>;
}

export type GenerationStepName =
  | 'identity'
  | 'initialMap'
  | 'connectingAreas'
  | 'characters'
  | 'backstory'
  | 'dilemmas'
  | 'puzzles'
  | 'startingSkills'
  | 'secretFacts'
  | 'opening';

// Progress event for client feedback (themed narratives)
export interface GenerationProgress {
  currentStep: GenerationStepName;
  stepNumber: number;
  totalSteps: number;
  stepDescription: string;
  themedNarrative: string;
  isComplete: boolean;
  error?: string;
}

// Aggregated data from all steps
export interface AllStepData {
  identity: IdentityData;
  initialMap: InitialMapData;
  connectingAreas: ConnectingAreasData;
  characters: CharactersData;
  backstory: BackstoryData;
  dilemmas: DilemmasData;
  puzzles: PuzzlesData;
  startingSkills: StartingSkillsData;
  secretFacts: SecretFactsData;
  opening: OpeningData;
}

// ============================================
// Step 1: Identity
// ============================================
export interface IdentityData {
  title: string;
  genreBlend: string[];  // 2-3 genres
  tone: 'mysterious' | 'humorous' | 'dark' | 'whimsical' | 'dramatic' | 'tense' | 'melancholic' | 'hopeful';
  centralConflict: string;
  keyThemes: string[];  // 3-5 themes
  settingEra: string;   // "medieval fantasy", "cyberpunk 2150", etc.
  worldRules: string[]; // Key rules of this world (e.g., "magic costs memories")
}

// ============================================
// Step 2: Initial Map
// ============================================
export interface MapRoomData {
  name: string;
  x: number;
  y: number;
  z: number;
  briefDescription: string;  // 1 sentence for now
  thematicRole: 'sanctuary' | 'danger' | 'mystery' | 'resource' | 'transition' | 'landmark' | 'hidden';
  isStoryCritical: boolean;
  suggestedAtmosphere: {
    lighting?: string;
    mood?: string;
    sounds?: string;
    smells?: string;
  };
  // Which directions have exits (to be populated with actual connections)
  exits: {
    north?: boolean;
    south?: boolean;
    east?: boolean;
    west?: boolean;
    up?: boolean;
    down?: boolean;
  };
}

export interface InitialMapData {
  rooms: MapRoomData[];      // 15-30 rooms
  startingRoomIndex: number; // Which room player starts in
  mapTheme: string;          // Overall map theme for coherence
}

// ============================================
// Step 3: Connecting Areas
// ============================================
export interface ConnectionDescription {
  direction: 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
  targetRoomName: string;
  descriptionFromHere: string;     // "A sturdy oak door leads north"
  descriptionFromThere: string;    // "A sturdy oak door leads south"
}

export interface RoomObject {
  name: string;
  description: string;
  isTakeable: boolean;
  isStoryCritical?: boolean;
  initialState?: Record<string, unknown>;
}

export interface EnhancedRoomData extends MapRoomData {
  fullDescription: string;           // 2-3 paragraphs
  connectionDescriptions: ConnectionDescription[];
  objects: RoomObject[];
}

export interface ConnectingAreasData {
  rooms: EnhancedRoomData[];
}

// ============================================
// Step 4: Characters
// ============================================
export interface CharacterData {
  name: string;
  role: 'mentor' | 'antagonist' | 'ally' | 'neutral' | 'mysterious' | 'merchant' | 'guardian';
  briefDescription: string;        // Physical appearance
  personality: {
    traits: string[];
    motivations: string[];
    secrets?: string;
  };
  voiceDescription: string;        // How they speak
  startingRoomName: string;        // Where they are initially
  dialogueStyle: 'formal' | 'casual' | 'cryptic' | 'aggressive' | 'friendly' | 'nervous';
  relationshipToPlayer: string;    // Initial relationship
}

export interface CharactersData {
  characters: CharacterData[];     // 3-8 NPCs
}

// ============================================
// Step 5: Backstory
// ============================================
export interface BackstoryData {
  background: string;              // 2-3 paragraphs
  origin: string;                  // Where player comes from
  recentEvents: string;            // What led them here
  personality: {
    traits: string[];              // From interview
    strengths: string[];
    weaknesses: string[];
  };
  isSecretBackstory: boolean;      // If true, player discovers past during game
  memoryFragments?: string[];      // Hints of past for amnesia stories
}

// ============================================
// Step 6: Dilemmas
// ============================================
export type OCEANDimension = 'O' | 'C' | 'E' | 'A' | 'N';

export interface DilemmaOption {
  description: string;
  personalityImplication: string;
}

export interface DilemmaData {
  name: string;
  description: string;
  primaryDimension: OCEANDimension;
  secondaryDimension?: OCEANDimension;
  triggerRoomName?: string;        // Room name where this can trigger
  triggerCondition?: string;       // Optional condition
  optionA: DilemmaOption;
  optionB: DilemmaOption;
  optionC?: DilemmaOption;
}

export interface DilemmasData {
  dilemmas: DilemmaData[];         // ceil(roomCount / 5)
}

// ============================================
// Step 7: Puzzles
// ============================================
export interface PuzzleStepRequirements {
  requiredItems?: string[];
  requiredActions?: string[];      // Verb patterns like "examine", "use X on Y"
  requiredRoom?: string;
}

export interface PuzzleStepData {
  stepNumber: number;
  description: string;
  hint?: string;
  requirements: PuzzleStepRequirements;
  timedUrgency?: {
    turnsAllowed: number;
    failureConsequence: string;
  };
}

export type PuzzleRewardType = 'item' | 'skill_boost' | 'dilemma' | 'secret_reveal' | 'room_unlock' | 'character_info';

export interface PuzzleReward {
  type: PuzzleRewardType;
  data: Record<string, unknown>;
}

export interface PuzzleData {
  name: string;
  description: string;
  roomName: string;                 // Primary room
  steps: PuzzleStepData[];          // 2-5 steps per puzzle
  reward: PuzzleReward;
  leadsToDilemma?: string;          // Name of dilemma this leads to
  prerequisites?: string[];          // Puzzle names that must be complete first
}

export interface PuzzleChainLink {
  sourcePuzzle: string;
  targetPuzzle: string;
  linkType: 'sequential' | 'parallel' | 'conditional';
  condition?: string;
}

export interface PuzzlesData {
  puzzles: PuzzleData[];            // 3 puzzles per room
  puzzleChains: PuzzleChainLink[];
}

// ============================================
// Step 8: Starting Skills
// ============================================
export interface SkillData {
  name: string;
  level: number;                    // 1-10
  triggerVerbs: string[];           // ["hack", "breach", "crack"]
  triggerNouns: string[];           // ["terminal", "console", "computer"]
  description: string;              // Brief description of the skill
}

export interface StartingSkillsData {
  skills: SkillData[];              // 3-6 skills
}

// ============================================
// Step 9: Secret Facts
// ============================================
export type FactType = 'WORLD' | 'CHARACTER' | 'PLAYER_HISTORY' | 'STORY_EVENT';

export interface SecretFactData {
  content: string;                  // The secret truth
  factType: FactType;
  importance: number;               // 1-10
  deflectionHint: string;           // What to say if asked before reveal
  revealTrigger: string;            // Condition for reveal
  linkedPuzzle?: string;            // Puzzle name that reveals this
  topics: string[];                 // Keywords for matching
}

export interface SecretFactsData {
  secrets: SecretFactData[];        // 3-10 secrets
}

// ============================================
// Step 10: Opening
// ============================================
export interface StartingItem {
  name: string;
  description: string;
}

export interface OpeningData {
  startingRoomName: string;
  openingNarrative: string;         // 3-4 paragraphs
  initialObjective: string;         // First puzzle/goal made clear
  startingItems: StartingItem[];
  immediateChoices: string[];       // What player can do right away
}

// ============================================
// Step Execution Config
// ============================================
export interface StepConfig {
  name: GenerationStepName;
  description: string;
  themedNarrative: string;
  maxRetries: number;
}

export const GENERATION_STEPS: StepConfig[] = [
  { name: 'identity', description: 'Creating story identity...', themedNarrative: 'The mists of possibility swirl...', maxRetries: 3 },
  { name: 'initialMap', description: 'Designing world map...', themedNarrative: 'A world takes shape in the darkness...', maxRetries: 3 },
  { name: 'connectingAreas', description: 'Connecting areas...', themedNarrative: 'Paths weave between shadows...', maxRetries: 3 },
  { name: 'characters', description: 'Generating characters...', themedNarrative: 'Figures emerge from the gloom...', maxRetries: 3 },
  { name: 'backstory', description: 'Writing backstory...', themedNarrative: 'Memories surface, half-forgotten...', maxRetries: 3 },
  { name: 'dilemmas', description: 'Creating dilemmas...', themedNarrative: 'Choices crystallize before you...', maxRetries: 3 },
  { name: 'puzzles', description: 'Designing puzzles...', themedNarrative: 'Secrets hide in plain sight...', maxRetries: 3 },
  { name: 'startingSkills', description: 'Assigning skills...', themedNarrative: 'Your abilities awaken...', maxRetries: 3 },
  { name: 'secretFacts', description: 'Hiding secrets...', themedNarrative: 'Truths lie buried, waiting...', maxRetries: 3 },
  { name: 'opening', description: 'Writing opening...', themedNarrative: 'Your story begins...', maxRetries: 3 },
];
