import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import Terminal from './Terminal';
import { GameSidebar } from './GameSidebar';
import { apiClient } from '@/services/api';
import './GameScreen.css';

interface ActiveDilemma {
  id: string;
  description: string;
  options: string[];
}

export default function GameScreen() {
  const addMessage = useGameStore((state) => state.addMessage);
  const setInputEnabled = useGameStore((state) => state.setInputEnabled);
  const setLoading = useGameStore((state) => state.setLoading);
  const setLoadingMessage = useGameStore((state) => state.setLoadingMessage);
  const setInputPlaceholder = useGameStore((state) => state.setInputPlaceholder);
  const currentStoryId = useGameStore((state) => state.currentStoryId);

  const initialized = useRef(false);
  const [activeDilemma, setActiveDilemma] = useState<ActiveDilemma | null>(null);
  const [sidebarRefresh, setSidebarRefresh] = useState(0);

  // Initialize the game - fetch initial state
  useEffect(() => {
    if (initialized.current || !currentStoryId) return;
    initialized.current = true;

    const initGame = async () => {
      try {
        // Get the initial game state
        const state = await apiClient.getGameState(currentStoryId);

        // Display chapter header
        addMessage({
          type: 'system',
          content: '═══════════════════════════════════════',
        });
        addMessage({
          type: 'system',
          content: 'CHAPTER I',
        });
        addMessage({
          type: 'system',
          content: '═══════════════════════════════════════',
        });

        // Display room info
        addMessage({
          type: 'narrator',
          content: `== ${state.roomName.toUpperCase()} ==`,
          isTyping: false,
        });

        if (state.roomDescription) {
          addMessage({
            type: 'narrator',
            content: state.roomDescription,
            isTyping: true,
          });
        }

        // Show objects
        if (state.objects.length > 0) {
          const objectNames = state.objects.map(o => o.name).join(', ');
          addMessage({
            type: 'narrator',
            content: `You can see: ${objectNames}`,
            isTyping: false,
          });
        }

        // Show characters
        if (state.characters.length > 0) {
          const charNames = state.characters.map(c => c.name).join(', ');
          addMessage({
            type: 'narrator',
            content: `Present here: ${charNames}`,
            isTyping: false,
          });
        }

        // Show exits
        if (state.exits.length > 0) {
          const exitDirs = state.exits.map(e => e.direction).join(', ');
          addMessage({
            type: 'narrator',
            content: `Exits: ${exitDirs}`,
            isTyping: false,
          });
        }

        addMessage({
          type: 'system',
          content: 'Type HELP for a list of commands.',
          isTyping: false,
        });

        setInputPlaceholder('What do you do?');
        setInputEnabled(true);
      } catch (error) {
        console.error('Failed to initialize game:', error);
        // Fall back to basic message
        addMessage({
          type: 'narrator',
          content: 'Your journey begins. Type HELP for commands.',
          isTyping: true,
        });
        setInputEnabled(true);
      }
    };

    initGame();
  }, [currentStoryId, addMessage, setInputEnabled, setInputPlaceholder]);

  const handlePlayerInput = useCallback(async (input: string) => {
    if (!currentStoryId) {
      addMessage({
        type: 'system',
        content: 'No active story. Please start a new game.',
        isTyping: false,
      });
      return;
    }

    // Add player's action to terminal
    addMessage({
      type: 'player',
      content: input,
    });

    // Handle dilemma response
    if (activeDilemma) {
      const upperInput = input.toUpperCase().trim();
      let chosenOption = 'OTHER';

      if (upperInput === 'A' || upperInput === '1') chosenOption = 'A';
      else if (upperInput === 'B' || upperInput === '2') chosenOption = 'B';
      else if (upperInput === 'C' || upperInput === '3') chosenOption = 'C';

      try {
        await apiClient.submitDilemmaResponse({
          storyId: currentStoryId,
          dilemmaId: activeDilemma.id,
          chosenOption,
          playerResponse: input,
        });

        addMessage({
          type: 'narrator',
          content: 'Your choice has been made. The story continues...',
          isTyping: true,
        });

        setActiveDilemma(null);
        setInputPlaceholder('What do you do?');
        setInputEnabled(true);
        return;
      } catch (error) {
        console.error('Dilemma response error:', error);
      }
    }

    setInputEnabled(false);
    setLoading(true);
    setLoadingMessage('Processing');

    try {
      const response = await apiClient.submitAction({
        storyId: currentStoryId,
        playerInput: input,
      });

      setLoading(false);

      // Display the response
      addMessage({
        type: 'narrator',
        content: response.narrativeText,
        isTyping: true,
      });

      // Refresh sidebar after action (map may have changed, items picked up, etc.)
      setSidebarRefresh(prev => prev + 1);

      // Check for dilemma
      if (response.dilemma) {
        setActiveDilemma(response.dilemma);

        addMessage({
          type: 'system',
          content: '───────────────────────────────────────',
        });
        addMessage({
          type: 'narrator',
          content: response.dilemma.description,
          isTyping: true,
        });

        response.dilemma.options.forEach((option, index) => {
          const letter = String.fromCharCode(65 + index); // A, B, C...
          addMessage({
            type: 'system',
            content: `  [${letter}] ${option}`,
            isTyping: false,
          });
        });

        addMessage({
          type: 'system',
          content: '───────────────────────────────────────',
        });

        setInputPlaceholder('Choose A, B, or describe your own action...');
        setInputEnabled(true);
        return;
      }

      setInputEnabled(true);
    } catch (error) {
      console.error('Game error:', error);
      setLoading(false);

      addMessage({
        type: 'narrator',
        content: "I don't understand that command. Type HELP for assistance.",
        isTyping: true,
      });

      setInputEnabled(true);
    }
  }, [currentStoryId, activeDilemma, addMessage, setInputEnabled, setLoading, setLoadingMessage, setInputPlaceholder]);

  return (
    <div className="game-screen game-screen-with-sidebar">
      <div className="game-main">
        <Terminal onInput={handlePlayerInput} />
      </div>
      {currentStoryId && (
        <div className="game-sidebar-container">
          <GameSidebar storyId={currentStoryId} refreshTrigger={sidebarRefresh} />
        </div>
      )}
    </div>
  );
}
