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
  | 'storyBeats'
  | 'puzzles'
  | 'startingSkills'
  | 'secretFacts'
  | 'coherencePass'
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
  // Sub-progress within a step (e.g., room 5/30)
  subProgress?: {
    current: number;
    total: number;
    label: string;
  };
  // Boot-up style log messages
  logMessages?: string[];
}

// Aggregated data from all steps
export interface AllStepData {
  identity: IdentityData;
  initialMap: InitialMapData;
  connectingAreas: ConnectingAreasData;
  characters: CharactersData;
  backstory: BackstoryData;
  storyBeats: StoryBeatsData;
  puzzles: PuzzlesData;
  startingSkills: StartingSkillsData;
  secretFacts: SecretFactsData;
  coherencePass: CoherencePassData;
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
  // Vehicle properties (rooms can be vehicles - boats, cars, elevators, etc.)
  isVehicle?: boolean;
  vehicleType?: 'water' | 'land' | 'air' | 'elevator' | 'magical';
  boardingKeywords?: string[];  // ["car", "toyota", "sedan"]
  dockedAtRoomName?: string;    // Room name where vehicle is initially docked
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
  isHidden: boolean;               // If true, exit is not visible until discovered
  hiddenUntil?: string;            // Optional: what reveals it (e.g., "examine bookcase", puzzle name)
}

export interface RoomObject {
  name: string;
  description: string;
  synonyms?: string[];              // Alternative names for the object
  isTakeable: boolean;
  isStoryCritical?: boolean;
  initialState?: Record<string, unknown>;
}

export interface EnhancedRoomData extends MapRoomData {
  fullDescription: string;           // 2-3 paragraphs
  connectionDescriptions: ConnectionDescription[];
  objects: RoomObject[];
  // Vehicle-specific: known destinations (room names)
  knownDestinationRoomNames?: string[];  // For vehicles: rooms they can travel to
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
// OCEAN Personality Dimensions (used for story beat resolution choices)
// ============================================
export type OCEANDimension = 'O' | 'C' | 'E' | 'A' | 'N';

// ============================================
// Step 6: Story Beats (major narrative convergence points with OCEAN choices)
// ============================================
export interface ResolutionOption {
  id: string;                       // "option_a", "option_b", "option_c"
  description: string;              // How this option resolves the beat
  approachStyle: string;            // "Creative", "Methodical", "Diplomatic", etc.
  primaryDimension: OCEANDimension;
  secondaryDimension?: OCEANDimension;
  personalityImplication: string;   // What choosing this reveals about the player
  outcomeNarrative: string;         // What happens when this choice is made
}

export interface StoryBeatData {
  name: string;                     // "Access the Lighthouse Beacon"
  description: string;              // What achieving this beat means for the story
  beatOrder: number;                // Sequence in story arc (1, 2, 3...)
  resolutionOptions: ResolutionOption[];  // 2-3 ways to resolve this beat, each tied to OCEAN
}

export interface StoryBeatsData {
  beats: StoryBeatData[];           // 3-5 major story beats
}

// ============================================
// Step 7: Puzzle Dependency Chart
// ============================================
export type PuzzleNodeType = 'character' | 'object' | 'location' | 'action';
export type PuzzleRewardType = 'item' | 'skill_boost' | 'dilemma' | 'secret_reveal' | 'room_unlock' | 'character_info';

export interface PuzzleStepData {
  stepNumber: number;
  description: string;              // Cryptic objective shown in sidebar
  hint?: string;                    // Optional hint if stuck

  // What this step involves
  nodeType: PuzzleNodeType;         // character, object, location, action
  targetName?: string;              // Name of character/object/room (e.g., "Old Keeper", "Oil Can")

  // Completion requirements
  completionAction: string;         // Action pattern: "talk to keeper", "use oil can on hinges"
  requiredItems?: string[];         // Items needed to complete
  requiredRoom?: string;            // Room name where step must happen

  // What completing this step provides
  givesItem?: string;               // Item name received on completion
  givesClue?: string;               // Narrative hint revealed (not shown in sidebar)

  // Visibility (for progressive reveal)
  isInitiallyRevealed: boolean;     // True for first step, false for others
  revealTriggers?: string[];        // Actions that reveal this step early (e.g., "use radio", "examine radio")
}

export interface PuzzleReward {
  type: PuzzleRewardType;
  data: Record<string, unknown>;
}

export interface PuzzleData {
  name: string;
  description: string;
  storyBeatName: string;            // Which beat this puzzle leads to
  branchPath: string;               // e.g., "beat1.left", "beat1.right" for parallel paths
  roomName: string;                 // Primary room where puzzle begins
  steps: PuzzleStepData[];          // 2-5 steps per puzzle
  reward?: PuzzleReward;
  isBottleneck?: boolean;           // True if this is a convergence point
  isInitialObjective?: boolean;     // True if this is the starting objective
}

export interface PuzzleChainLink {
  sourcePuzzle: string;
  targetPuzzle: string;
  linkType: 'sequential' | 'parallel' | 'conditional';
  condition?: string;
}

export interface PuzzlesData {
  puzzles: PuzzleData[];            // 5-10 puzzles per game with diamond structure
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
// Step 10: Coherence Pass
// Updates earlier-generated content with foreshadowing and narrative coherence
// ============================================
export interface RoomUpdate {
  roomName: string;
  updatedFullDescription?: string;
  updatedAtmosphere?: {
    lighting?: string;
    mood?: string;
    sounds?: string;
    smells?: string;
  };
}

export interface ObjectUpdate {
  roomName: string;
  objectName: string;
  updatedDescription: string;
}

export interface CharacterUpdate {
  characterName: string;
  updatedBriefDescription?: string;
  updatedVoiceDescription?: string;
}

export interface CoherencePassData {
  roomUpdates: RoomUpdate[];
  objectUpdates: ObjectUpdate[];
  characterUpdates: CharacterUpdate[];
}

// ============================================
// Step 11: Opening
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
  { name: 'storyBeats', description: 'Mapping story arc...', themedNarrative: 'Choices crystallize before you...', maxRetries: 3 },
  { name: 'puzzles', description: 'Designing puzzles...', themedNarrative: 'Secrets hide in plain sight...', maxRetries: 3 },
  { name: 'startingSkills', description: 'Assigning skills...', themedNarrative: 'Your abilities awaken...', maxRetries: 3 },
  { name: 'secretFacts', description: 'Hiding secrets...', themedNarrative: 'Truths lie buried, waiting...', maxRetries: 3 },
  { name: 'coherencePass', description: 'Weaving narrative threads...', themedNarrative: 'Connections shimmer into focus...', maxRetries: 3 },
  { name: 'opening', description: 'Writing opening...', themedNarrative: 'Your story begins...', maxRetries: 3 },
];
