import { useEffect, useRef } from 'react';
import { useGameStore, TerminalMessage } from '@/store/gameStore';
import { useTypewriter } from '@/hooks/useTypewriter';
import TerminalInput from './TerminalInput';

interface TerminalProps {
  onInput?: (input: string) => void;
  showInput?: boolean;
}

export default function Terminal({ onInput, showInput = true }: TerminalProps) {
  // Use individual selectors to ensure proper re-rendering
  const messages = useGameStore((state) => state.messages);
  const isInputEnabled = useGameStore((state) => state.isInputEnabled);
  const inputPlaceholder = useGameStore((state) => state.inputPlaceholder);
  const isLoading = useGameStore((state) => state.isLoading);
  const loadingMessage = useGameStore((state) => state.loadingMessage);

  // Force component to track message count for re-renders
  const messageCount = messages.length;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, messageCount]);

  const handleInput = (input: string) => {
    onInput?.(input);
  };

  return (
    <div className="terminal-container">
      <div className="terminal-messages" ref={scrollRef}>
        {messages.map((message, index) => (
          <MessageLine
            key={message.id}
            message={message}
            isLatest={index === messages.length - 1}
          />
        ))}
        {isLoading && (
          <div className="terminal-message system">
            <span className="loading">{loadingMessage || 'Processing'}</span>
          </div>
        )}
      </div>
      {showInput && (
        <TerminalInput
          onSubmit={handleInput}
          disabled={!isInputEnabled || isLoading}
          placeholder={inputPlaceholder}
        />
      )}
    </div>
  );
}

interface MessageLineProps {
  message: TerminalMessage;
  isLatest: boolean;
}

function MessageLine({ message, isLatest }: MessageLineProps) {
  const { setMessageTypingComplete } = useGameStore();

  // Only use typewriter effect for latest narrator messages
  const shouldType = isLatest && message.type === 'narrator' && message.isTyping;

  const { displayedText, isComplete } = useTypewriter({
    text: shouldType ? message.content : '',
    speed: 20,
    onComplete: () => {
      if (shouldType) {
        setMessageTypingComplete(message.id);
      }
    },
  });

  const content = shouldType ? displayedText : message.content;

  const getClassName = () => {
    switch (message.type) {
      case 'narrator':
        return 'terminal-message narrator';
      case 'player':
        return 'terminal-message player';
      case 'system':
        return 'terminal-message system dim';
      case 'character':
        return 'terminal-message character';
      default:
        return 'terminal-message';
    }
  };

  return (
    <div className={getClassName()}>
      {message.type === 'player' && <span className="prompt-symbol">&gt; </span>}
      {message.type === 'character' && message.characterName && (
        <span className="character-name">{message.characterName}: </span>
      )}
      <span className="message-content">
        {content}
        {shouldType && !isComplete && <span className="typing-cursor">▌</span>}
      </span>
    </div>
  );
}
