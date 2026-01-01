// User & Auth Types
export interface User {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  userId: string;
  mediaFrequency: MediaFrequency;
  mediaTypes: MediaTypes;
  audioMode: AudioMode;
  preferredThemes: string[];
  narratorStyle: string;
  crtEffectsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MediaFrequency = 'every_scene' | 'key_moments' | 'manual' | 'off';
export type MediaTypes = 'images' | 'videos' | 'both' | 'none';
export type AudioMode = 'none' | 'effects_only' | 'voiceover_only' | 'full_character';

// Subscription Types
export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  storiesUsedThisPeriod: number;
  createdAt: Date;
}

export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'unlimited';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due';

export const TIER_LIMITS: Record<SubscriptionTier, { maxStories: number; mediaAllowed: boolean; videoAllowed: boolean }> = {
  free: { maxStories: 1, mediaAllowed: true, videoAllowed: false },
  basic: { maxStories: 5, mediaAllowed: true, videoAllowed: true },
  pro: { maxStories: 15, mediaAllowed: true, videoAllowed: true },
  unlimited: { maxStories: Infinity, mediaAllowed: true, videoAllowed: true },
};

// Story Types
export interface Story {
  id: string;
  userId: string;
  title: string | null;
  status: StoryStatus;
  genreTags: string[];
  initialInterview: InterviewData | null;
  storySeed: StorySeed | null;
  currentChapterId: string | null;
  currentSceneId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export type StoryStatus = 'in_progress' | 'completed' | 'abandoned';

export interface InterviewData {
  exchanges: InterviewExchange[];
  extractedThemes: string[];
  personalityHints: Partial<OceanScores>;
}

export interface InterviewExchange {
  question: string;
  answer: string;
  timestamp: Date;
}

export interface StorySeed {
  genreBlend: string[];
  centralConflict: string;
  keyThemes: string[];
  openingScenario: string;
  potentialArcs: string[];
  initialCharacters: CharacterSeed[];
}

export interface CharacterSeed {
  name: string;
  role: string;
  traits: string[];
  voiceDescription: string;
}

// Chapter & Scene Types
export interface Chapter {
  id: string;
  storyId: string;
  chapterNumber: number;
  title: string | null;
  summary: string | null;
  status: 'in_progress' | 'completed';
  createdAt: Date;
  completedAt: Date | null;
}

export interface Scene {
  id: string;
  chapterId: string;
  sceneNumber: number;
  sceneType: SceneType;
  narrativeText: string;
  playerInput: string | null;
  aiProvider: AIProvider;
  tokensUsed: number | null;
  createdAt: Date;
}

export type SceneType = 'dialogue' | 'action' | 'exploration' | 'decision';
export type AIProvider = 'claude' | 'grok' | 'gemini';

// Entity Types
export interface Character {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  personalityTraits: Record<string, unknown>;
  relationships: CharacterRelationship[];
  firstAppearanceSceneId: string | null;
  lastSeenSceneId: string | null;
  isMajorCharacter: boolean;
  imageUrl: string | null;
  elevenLabsVoiceId: string | null;
  voiceSettings: VoiceSettings | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterRelationship {
  characterId: string;
  relationship: string;
  sentiment: number; // -1 to 1
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

export interface Location {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  attributes: Record<string, unknown>;
  connectedLocations: string[];
  firstAppearanceSceneId: string | null;
  imageUrl: string | null;
  createdAt: Date;
}

export interface GameEvent {
  id: string;
  storyId: string;
  sceneId: string | null;
  eventType: string;
  description: string;
  outcome: string | null;
  impactScore: number;
  involvedCharacters: string[];
  involvedLocations: string[];
  createdAt: Date;
}

export interface Item {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  currentOwnerId: string | null;
  currentLocationId: string | null;
  firstAppearanceSceneId: string | null;
  createdAt: Date;
}

// Personality Types
export interface OceanScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export interface PersonalityScores extends OceanScores {
  id: string;
  storyId: string;
  opennessConfidence: number;
  conscientiousnessConfidence: number;
  extraversionConfidence: number;
  agreeablenessConfidence: number;
  neuroticismConfidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalityEvent {
  id: string;
  storyId: string;
  sceneId: string | null;
  playerAction: string;
  dimension: OceanDimension;
  delta: number;
  reasoning: string;
  createdAt: Date;
}

export type OceanDimension = 'O' | 'C' | 'E' | 'A' | 'N';

export interface StoryAnalysis {
  id: string;
  storyId: string;
  finalScores: OceanScores;
  personalitySummary: string;
  keyMoments: KeyMoment[];
  archetype: string;
  growthNarrative: string;
  createdAt: Date;
}

export interface KeyMoment {
  sceneId: string;
  description: string;
  impact: string;
}

// Callback Types
export interface CallbackCandidate {
  id: string;
  userId: string;
  sourceStoryId: string;
  entityType: 'character' | 'location' | 'event' | 'item';
  entityId: string;
  memorabilityScore: number;
  themes: string[];
  summary: string;
  timesUsed: number;
  createdAt: Date;
}

// Media Types
export interface GeneratedMedia {
  id: string;
  storyId: string;
  sceneId: string | null;
  mediaType: 'image' | 'video';
  promptUsed: string;
  gcsUrl: string;
  gcsUrlRaw: string | null;
  thumbnailUrl: string | null;
  generationCost: number | null;
  createdAt: Date;
}

export interface GeneratedAudio {
  id: string;
  storyId: string;
  sceneId: string | null;
  audioType: 'narration' | 'dialogue' | 'effect' | 'ambient';
  characterId: string | null;
  textContent: string | null;
  effectName: string | null;
  elevenLabsVoiceId: string | null;
  gcsUrl: string;
  durationSeconds: number | null;
  generationCost: number | null;
  createdAt: Date;
}

// API Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Scene Context for AI routing
export interface SceneContext {
  sceneType: SceneType;
  hasCharacterInteraction: boolean;
  hasCombat: boolean;
  needsWorldbuilding: boolean;
  currentLocation: Location | null;
  presentCharacters: Character[];
  recentEvents: GameEvent[];
}

// Game state for frontend
export interface GameState {
  story: Story | null;
  currentChapter: Chapter | null;
  currentScene: Scene | null;
  characters: Character[];
  locations: Location[];
  items: Item[];
  isLoading: boolean;
  error: string | null;
}
