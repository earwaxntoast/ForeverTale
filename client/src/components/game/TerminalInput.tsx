import { useState, useRef, useEffect, KeyboardEvent, FormEvent } from 'react';

interface TerminalInputProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function TerminalInput({
  onSubmit,
  disabled = false,
  placeholder = 'Type your response...'
}: TerminalInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when enabled
  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSubmit(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Allow Escape to blur
    if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="terminal-input-container">
      <span className="prompt-symbol">&gt;</span>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? '' : placeholder}
        className="terminal-input"
        autoComplete="off"
        spellCheck={false}
      />
      <span className={`cursor ${disabled ? 'hidden' : ''}`}>_</span>
    </form>
  );
}

// Simple "press any key" prompt
interface PressAnyKeyProps {
  onKeyPress: () => void;
  message?: string;
}

export function PressAnyKey({ onKeyPress, message = 'Press any key to continue...' }: PressAnyKeyProps) {
  useEffect(() => {
    const handleKeyPress = (e: globalThis.KeyboardEvent) => {
      // Ignore modifier keys alone
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }
      onKeyPress();
    };

    const handleClick = () => {
      onKeyPress();
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('click', handleClick);
    };
  }, [onKeyPress]);

  return (
    <div className="press-any-key">
      <span className="blink">{message}</span>
    </div>
  );
}
