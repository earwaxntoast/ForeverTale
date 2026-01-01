import { useEffect, useState, useCallback } from 'react';

/**
 * Hook to detect admin keyboard shortcut (Ctrl+Shift+A)
 * Returns true when triggered, toggle behavior
 */
export function useAdminShortcut(): {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
} {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+A to toggle admin panel
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return { isOpen, toggle, close };
}

// Keep old export name for compatibility but use new implementation
export function useSecretPhrase() {
  const { isOpen, close } = useAdminShortcut();
  return { triggered: isOpen, reset: close };
}

/**
 * Check if we're in development mode
 */
export function isDev(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
}
