import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import './GeneratingScreen.css';

interface SubProgress {
  current: number;
  total: number;
  label: string;
}

interface GenerationProgress {
  currentStep: string;
  stepNumber: number;
  totalSteps: number;
  stepDescription: string;
  themedNarrative: string;
  isComplete: boolean;
  error?: string;
  subProgress?: SubProgress;
  logMessages?: string[];
}

// Step narratives for display
const STEP_NARRATIVES: Record<string, { title: string; description: string }> = {
  identity: {
    title: 'Forming Identity',
    description: 'The mists of possibility swirl, coalescing into something unique...',
  },
  initialMap: {
    title: 'Shaping the World',
    description: 'A world takes shape in the darkness, its boundaries defined by imagination...',
  },
  connectingAreas: {
    title: 'Weaving Paths',
    description: 'Paths weave between shadows, connecting distant places with hidden passages...',
  },
  characters: {
    title: 'Awakening Souls',
    description: 'Figures emerge from the gloom, each carrying their own secrets and desires...',
  },
  backstory: {
    title: 'Remembering the Past',
    description: 'Memories surface, half-forgotten whispers of who you once were...',
  },
  dilemmas: {
    title: 'Crystallizing Choices',
    description: 'Choices crystallize before you, each path leading to a different truth...',
  },
  puzzles: {
    title: 'Hiding Mysteries',
    description: 'Secrets hide in plain sight, waiting for the curious to discover them...',
  },
  startingSkills: {
    title: 'Awakening Abilities',
    description: 'Your abilities awaken, dormant powers stirring within...',
  },
  secretFacts: {
    title: 'Burying Truths',
    description: 'Truths lie buried, waiting for the right moment to reveal themselves...',
  },
  opening: {
    title: 'Beginning Your Tale',
    description: 'Your story begins, the first words written in the book of your destiny...',
  },
};

export default function GeneratingScreen() {
  const { currentStoryId, setScreen } = useGameStore();
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const hasConnectedRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Don't connect if no storyId yet or already connected
    if (!currentStoryId || hasConnectedRef.current) return;

    hasConnectedRef.current = true;

    // Connect to SSE endpoint for progress updates
    const eventSource = new EventSource(`/api/stories/${currentStoryId}/generation-progress`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip connection message
        if (data.connected) return;

        setProgress(data);

        // Update log messages if provided
        if (data.logMessages && data.logMessages.length > 0) {
          setLogMessages(data.logMessages);
        }

        // Check for completion
        if (data.isComplete) {
          eventSource.close();
          // Small delay before transitioning to let user see completion
          setTimeout(() => {
            setScreen('playing');
          }, 2000);
        }

        // Check for error
        if (data.error) {
          setError(data.error);
          eventSource.close();
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      // Don't set error immediately - might just be reconnecting
    };

    return () => {
      eventSource.close();
    };
  }, [currentStoryId, setScreen]);

  // Auto-scroll log container
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  // Calculate progress percentage
  const progressPercent = progress
    ? Math.round((progress.stepNumber / progress.totalSteps) * 100)
    : 0;

  // Get current step narrative
  const currentNarrative = progress
    ? STEP_NARRATIVES[progress.currentStep] || {
        title: progress.stepDescription,
        description: progress.themedNarrative,
      }
    : { title: 'Preparing', description: 'Weaving the threads of your destiny...' };

  if (error) {
    return (
      <div className="generating-screen">
        <div className="generating-error">
          <p className="error-title">The threads of fate have tangled...</p>
          <p className="error-message">{error}</p>
          <button onClick={() => setScreen('interview')} className="retry-button">
            Return to Interview
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="generating-screen">
      <div className="generating-content">
        <h2 className="generating-title">Crafting Your Story</h2>

        {/* Main progress bar */}
        <div className="progress-container">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="progress-text">
            {progress ? `Step ${progress.stepNumber} of ${progress.totalSteps}` : 'Initializing...'}
          </div>
        </div>

        {/* Step info */}
        <div className="step-info">
          <h3 className="step-title">{currentNarrative.title}</h3>
          <p className="step-description">{currentNarrative.description}</p>
        </div>

        {/* Activity indicator bar */}
        <div className="activity-container">
          <div className="activity-bar">
            <div className="activity-pulse" />
          </div>
        </div>

        {/* Boot-up log messages */}
        <div className="log-container" ref={logContainerRef}>
          {logMessages.length === 0 ? (
            <div className="log-entry">[ OK ] Initializing story generation systems...</div>
          ) : (
            logMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`log-entry ${msg.includes('[DONE]') ? 'log-done' : ''} ${msg.includes('[BOOT]') ? 'log-boot' : ''}`}
              >
                {msg}
              </div>
            ))
          )}
        </div>

        {/* Sub-progress if available */}
        {progress?.subProgress && (
          <div className="sub-progress-container">
            <div className="sub-progress-bar">
              <div
                className="sub-progress-fill"
                style={{ width: `${(progress.subProgress.current / progress.subProgress.total) * 100}%` }}
              />
            </div>
            <div className="sub-progress-text">
              {progress.subProgress.label}: {progress.subProgress.current} / {progress.subProgress.total}
            </div>
          </div>
        )}

        {progress?.isComplete && (
          <p className="completion-text">Your story awaits...</p>
        )}
      </div>
    </div>
  );
}
