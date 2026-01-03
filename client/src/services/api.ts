// API client for ForeverTale backend

const API_BASE = '/api';

interface InterviewRequest {
  playerName: string;
  currentPhase: number;
  previousExchanges: { question: string; answer: string }[];
  currentQuestion: string; // The question being answered
  latestResponse: string;
}

interface InterviewResponse {
  message: string;
  isComplete: boolean;
  extractedThemes?: string[];
}

interface GenerateStoryRequest {
  playerName: string;
  interviewExchanges: { question: string; answer: string }[];
  storyPreference?: string; // Player's preferred story type (fantasy, sci-fi, etc.)
}

interface GenerateStoryResponse {
  storyId: string;
  title: string;
  openingScene: string;
  storySeed: object;
}

interface SceneRequest {
  storyId: string;
  playerInput: string;
}

interface GameState {
  roomName: string;
  turnCount: number;
  score: number;
}

interface DilemmaInfo {
  id: string;
  description: string;
  options: string[];
}

interface SceneResponse {
  narrativeText: string;
  gameState: GameState;
  roomChanged: boolean;
  dilemma?: DilemmaInfo;
}

interface GameStateResponse {
  roomName: string;
  roomDescription: string;
  turnCount: number;
  score: number;
  exits: Array<{ direction: string; roomId: string }>;
  objects: Array<{ id: string; name: string; description: string }>;
  characters: Array<{ id: string; name: string; description: string }>;
}

interface OpeningResponse {
  storyTitle: string;
  chapterTitle: string;
  chapterNumber: number;
  openingNarrative: string;
  initialObjective: string;
  immediateChoices: string[];
}

interface DilemmaRequest {
  storyId: string;
  dilemmaId: string;
  chosenOption: string;
  playerResponse: string;
}

interface ExtractNameResponse {
  name: string;
  confidence: number;
}

export interface SidebarAbility {
  name: string;
  level: number;
  progress: number;
}

export interface SidebarMapRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  isVisited: boolean;
  isCurrent: boolean;
  hasPortal?: boolean;
  exits: {
    north: boolean;
    south: boolean;
    east: boolean;
    west: boolean;
    up: boolean;
    down: boolean;
  };
}

export interface SidebarInventoryItem {
  id: string;
  name: string;
  description: string;
}

export interface SidebarObjectiveStep {
  description: string;
  completed: boolean;
}

export interface SidebarObjective {
  id: string;
  name: string;
  description: string;
  steps: SidebarObjectiveStep[];
}

export interface SidebarResponse {
  character: {
    name: string;
    background: string | null;
    traits: string[];
    isBackstoryRevealed: boolean;
  };
  abilities: SidebarAbility[];
  notes: string[];
  inventory: SidebarInventoryItem[];
  objectives: SidebarObjective[];
  map: SidebarMapRoom[];
  currentRoomId: string | null;
}

// Admin types
export interface AdminSession {
  id: string;
  title: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  playerName: string;
  turnCount: number;
  score: number;
  transcriptCount: number;
  roomCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptEntry {
  id: string;
  turnNumber: number;
  speaker: string;
  content: string;
  messageType: string;
  roomId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface InterviewExchange {
  question: string;
  answer: string;
}

export interface SessionTranscript {
  story: {
    title: string;
    status: string;
    turnCount: number;
    score: number;
    currentRoomId: string | null;
    initialInterview?: InterviewExchange[];
  };
  transcript: TranscriptEntry[];
  lastUpdate: string | null;
}

export interface AdminStats {
  users: number;
  stories: { total: number; active: number };
  rooms: number;
  objects: number;
  transcriptEntries: number;
}

interface ApiClient {
  interview: (data: InterviewRequest) => Promise<InterviewResponse>;
  extractName: (response: string) => Promise<ExtractNameResponse>;
  generateStory: (data: GenerateStoryRequest) => Promise<GenerateStoryResponse>;
  submitAction: (data: SceneRequest) => Promise<SceneResponse>;
  getStory: (storyId: string) => Promise<object>;
  getAnalysis: (storyId: string) => Promise<object>;
  getGameState: (storyId: string) => Promise<GameStateResponse>;
  getOpening: (storyId: string) => Promise<OpeningResponse>;
  getSidebar: (storyId: string) => Promise<SidebarResponse>;
  submitDilemmaResponse: (data: DilemmaRequest) => Promise<{ success: boolean; outcomeNarrative?: string }>;
  // Admin endpoints
  admin: {
    clearDatabase: () => Promise<{ success: boolean; message: string }>;
    clearAll: () => Promise<{ success: boolean; message: string }>;
    getSessions: () => Promise<AdminSession[]>;
    getSessionTranscript: (sessionId: string, since?: string) => Promise<SessionTranscript>;
    getStats: () => Promise<AdminStats>;
  };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const apiClient: ApiClient = {
  interview: (data) =>
    request<InterviewResponse>('/interview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  extractName: (response) =>
    request<ExtractNameResponse>('/interview/extract-name', {
      method: 'POST',
      body: JSON.stringify({ response }),
    }),

  generateStory: (data) =>
    request<GenerateStoryResponse>('/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  submitAction: (data) =>
    request<SceneResponse>(`/stories/${data.storyId}/scenes`, {
      method: 'POST',
      body: JSON.stringify({ playerInput: data.playerInput }),
    }),

  getStory: (storyId) =>
    request<object>(`/stories/${storyId}`),

  getAnalysis: (storyId) =>
    request<object>(`/stories/${storyId}/analysis`),

  getGameState: (storyId) =>
    request<GameStateResponse>(`/stories/${storyId}/state`),

  getOpening: (storyId) =>
    request<OpeningResponse>(`/stories/${storyId}/opening`),

  getSidebar: (storyId) =>
    request<SidebarResponse>(`/stories/${storyId}/sidebar`),

  submitDilemmaResponse: (data) =>
    request<{ success: boolean; outcomeNarrative?: string }>(`/stories/${data.storyId}/dilemma/${data.dilemmaId}`, {
      method: 'POST',
      body: JSON.stringify({
        chosenOption: data.chosenOption,
        playerResponse: data.playerResponse,
      }),
    }),

  // Admin endpoints (dev only)
  admin: {
    clearDatabase: () =>
      request<{ success: boolean; message: string }>('/admin/clear-database', {
        method: 'POST',
      }),

    clearAll: () =>
      request<{ success: boolean; message: string }>('/admin/clear-all', {
        method: 'POST',
      }),

    getSessions: () =>
      request<AdminSession[]>('/admin/sessions'),

    getSessionTranscript: (sessionId: string, since?: string) => {
      const params = since ? `?since=${encodeURIComponent(since)}` : '';
      return request<SessionTranscript>(`/admin/sessions/${sessionId}/transcript${params}`);
    },

    getStats: () =>
      request<AdminStats>('/admin/stats'),
  },
};
