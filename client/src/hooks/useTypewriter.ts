import { useState, useEffect, useCallback, useRef } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number;
  delay?: number;
  onComplete?: () => void;
}

export function useTypewriter({
  text,
  speed = 30,
  delay = 0,
  onComplete,
}: UseTypewriterOptions) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Use ref for onComplete to avoid resetting the effect when callback changes
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setDisplayedText('');
    setIsComplete(false);
    setIsTyping(false);

    if (!text) return;

    const startTimeout = setTimeout(() => {
      setIsTyping(true);
      let currentIndex = 0;

      const typeInterval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          setIsComplete(true);
          onCompleteRef.current?.();
        }
      }, speed);

      return () => clearInterval(typeInterval);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [text, speed, delay]);

  const skip = useCallback(() => {
    setDisplayedText(text);
    setIsTyping(false);
    setIsComplete(true);
    onComplete?.();
  }, [text, onComplete]);

  return { displayedText, isTyping, isComplete, skip };
}

// Hook for typing multiple lines sequentially
interface TypewriterLine {
  text: string;
  speed?: number;
  delay?: number;
}

export function useTypewriterQueue(lines: TypewriterLine[], onAllComplete?: () => void) {
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [isAllComplete, setIsAllComplete] = useState(false);

  const currentLine = lines[currentLineIndex];

  const { displayedText, isTyping, skip } = useTypewriter({
    text: currentLine?.text || '',
    speed: currentLine?.speed || 30,
    delay: currentLine?.delay || 0,
    onComplete: () => {
      if (currentLineIndex < lines.length - 1) {
        setCompletedLines(prev => [...prev, currentLine.text]);
        setCurrentLineIndex(prev => prev + 1);
      } else {
        setIsAllComplete(true);
        onAllComplete?.();
      }
    },
  });

  const skipAll = useCallback(() => {
    setCompletedLines(lines.map(l => l.text));
    setCurrentLineIndex(lines.length - 1);
    setIsAllComplete(true);
    onAllComplete?.();
  }, [lines, onAllComplete]);

  return {
    completedLines,
    currentLine: displayedText,
    isTyping,
    isAllComplete,
    skip,
    skipAll,
  };
}
