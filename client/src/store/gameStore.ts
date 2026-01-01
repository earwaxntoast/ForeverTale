import { create } from 'zustand';

// Game screens/phases
export type GameScreen =
  | 'title'
  | 'boot_sequence'
  | 'interview'
  | 'generating_story'
  | 'playing'
  | 'chapter_break'
  | 'analysis'
  | 'credits';

// Message in the terminal
export interface TerminalMessage {
  id: string;
  type: 'narrator' | 'player' | 'system' | 'character';
  content: string;
  characterName?: string;
  timestamp: Date;
  isTyping?: boolean;
}

// Interview exchange
export interface InterviewExchange {
  question: string;
  answer: string;
}

// Mock user for now (auth comes later)
export interface User {
  id: string;
  displayName: string;
  isAnonymous: boolean;
}

interface GameState {
  // Current screen
  screen: GameScreen;
  setScreen: (screen: GameScreen) => void;

  // User (mock for now)
  user: User | null;
  setUser: (user: User | null) => void;

  // Terminal messages
  messages: TerminalMessage[];
  addMessage: (message: Omit<TerminalMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setMessageTypingComplete: (id: string) => void;

  // Interview state
  interviewPhase: number;
  setInterviewPhase: (phase: number) => void;
  playerName: string | null;
  setPlayerName: (name: string | null) => void;
  interviewExchanges: InterviewExchange[];
  addInterviewExchange: (exchange: InterviewExchange) => void;
  clearInterview: () => void;

  // Current story
  currentStoryId: string | null;
  setCurrentStoryId: (id: string | null) => void;

  // Input state
  isInputEnabled: boolean;
  setInputEnabled: (enabled: boolean) => void;
  inputPlaceholder: string;
  setInputPlaceholder: (placeholder: string) => void;

  // Loading states
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (message: string) => void;

  // Settings
  crtEffectsEnabled: boolean;
  setCrtEffectsEnabled: (enabled: boolean) => void;
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  displayMode: 'bordered' | 'fullscreen';
  setDisplayMode: (mode: 'bordered' | 'fullscreen') => void;
  flickerIntensity: number; // 0-10
  setFlickerIntensity: (intensity: number) => void;
  barrelStrength: number; // 1-10
  setBarrelStrength: (strength: number) => void;
  scanlineOpacity: number; // 0-10
  setScanlineOpacity: (opacity: number) => void;

  // Reset everything for new game
  resetGame: () => void;
}

// Generate unique IDs
let messageIdCounter = 0;
const generateId = () => `msg_${++messageIdCounter}_${Date.now()}`;

// Create mock anonymous user
const createMockUser = (): User => ({
  id: `anon_${Date.now()}`,
  displayName: 'Traveler',
  isAnonymous: true,
});

export const useGameStore = create<GameState>((set) => ({
  // Screen
  screen: 'title',
  setScreen: (screen) => set({ screen }),

  // User
  user: createMockUser(),
  setUser: (user) => set({ user }),

  // Terminal messages
  messages: [],
  addMessage: (message) => set((state) => ({
    messages: [...state.messages, {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    }],
  })),
  clearMessages: () => set({ messages: [] }),
  setMessageTypingComplete: (id) => set((state) => ({
    messages: state.messages.map(m =>
      m.id === id ? { ...m, isTyping: false } : m
    ),
  })),

  // Interview
  interviewPhase: 0,
  setInterviewPhase: (phase) => set({ interviewPhase: phase }),
  playerName: null,
  setPlayerName: (name) => set({ playerName: name }),
  interviewExchanges: [],
  addInterviewExchange: (exchange) => set((state) => ({
    interviewExchanges: [...state.interviewExchanges, exchange],
  })),
  clearInterview: () => set({ interviewExchanges: [], interviewPhase: 0, playerName: null }),

  // Story
  currentStoryId: null,
  setCurrentStoryId: (id) => set({ currentStoryId: id }),

  // Input
  isInputEnabled: false,
  setInputEnabled: (enabled) => set({ isInputEnabled: enabled }),
  inputPlaceholder: 'Type your response...',
  setInputPlaceholder: (placeholder) => set({ inputPlaceholder: placeholder }),

  // Loading
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
  loadingMessage: '',
  setLoadingMessage: (message) => set({ loadingMessage: message }),

  // Settings
  crtEffectsEnabled: true,
  setCrtEffectsEnabled: (enabled) => set({ crtEffectsEnabled: enabled }),
  audioEnabled: false,
  setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
  displayMode: 'bordered',
  setDisplayMode: (mode) => set({ displayMode: mode }),
  flickerIntensity: 3,
  setFlickerIntensity: (intensity) => set({ flickerIntensity: intensity }),
  barrelStrength: 4,
  setBarrelStrength: (strength) => set({ barrelStrength: strength }),
  scanlineOpacity: 5,
  setScanlineOpacity: (opacity) => set({ scanlineOpacity: opacity }),

  // Reset
  resetGame: () => set({
    screen: 'title',
    messages: [],
    interviewPhase: 0,
    playerName: null,
    interviewExchanges: [],
    currentStoryId: null,
    isInputEnabled: false,
    isLoading: false,
    loadingMessage: '',
  }),
}));
