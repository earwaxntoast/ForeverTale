import { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import './BootSequence.css';

// Boot sound files - public assets are served at root, so just use direct paths
const bootSoundPaths = [
  '/sounds/bootbeep1.mp3',
  '/sounds/bootbeep2.mp3',
  '/sounds/bootbeep3.mp3',
  '/sounds/bootbeep4.mp3',
];

function getRandomBootSound(): HTMLAudioElement {
  const randomPath = bootSoundPaths[Math.floor(Math.random() * bootSoundPaths.length)];
  const audio = new Audio(randomPath);
  audio.load();
  return audio;
}

interface BootLine {
  text: string;
  delay: number; // ms before showing this line
  type: 'normal' | 'ok' | 'warn' | 'error' | 'header' | 'progress';
  countUp?: { start: number; end: number; suffix: string; duration: number };
}

const BOOT_SEQUENCE: BootLine[] = [
  { text: 'FOREVERTALE BIOS v6.66.0', delay: 0, type: 'header' },
  { text: 'Copyright (c) 1895-2024 Freudian Systems Inc.', delay: 100, type: 'normal' },
  { text: '', delay: 200, type: 'normal' },
  { text: 'Initializing cognitive substrate...', delay: 300, type: 'normal' },
  { text: '[ OK ] Loaded kernel module: ego.ko', delay: 500, type: 'ok' },
  { text: '[ OK ] Loaded kernel module: superego.ko', delay: 650, type: 'ok' },
  { text: '[ OK ] Loaded kernel module: id_daemon.ko', delay: 800, type: 'ok' },
  { text: '[WARN] id_daemon requesting elevated privileges', delay: 950, type: 'warn' },
  { text: '', delay: 1050, type: 'normal' },
  { text: 'Detecting neural hardware...', delay: 1150, type: 'normal' },
  { text: 'Flesh Neural Network Interface: CONNECTED', delay: 1350, type: 'ok' },
  { text: 'Synapse Array: 847 TRILLION connections mapped', delay: 1550, type: 'normal' },
  { text: 'Checking unconscious memory banks...', delay: 1750, type: 'normal' },
  { text: 'Repressed Memory Buffer:', delay: 1900, type: 'progress', countUp: { start: 0, end: 16384, suffix: ' TB', duration: 800 } },
  { text: '[ OK ] Trauma cache: LOADED', delay: 2800, type: 'ok' },
  { text: '', delay: 2900, type: 'normal' },
  { text: 'Starting psychological services...', delay: 3000, type: 'normal' },
  { text: '[ OK ] jung_archetypes.service - Collective Unconscious Daemon', delay: 3200, type: 'ok' },
  { text: '[ OK ] pavlov.service - Conditioned Response Handler', delay: 3400, type: 'ok' },
  { text: '[ OK ] skinner.service - Behavioral Reinforcement Loop', delay: 3600, type: 'ok' },
  { text: '[ OK ] maslow.service - Hierarchical Needs Resolver', delay: 3800, type: 'ok' },
  { text: '[WARN] erikson.service - Identity Crisis detected in stage 5', delay: 4000, type: 'warn' },
  { text: '[ OK ] rorschach.service - Projection Analysis Engine', delay: 4200, type: 'ok' },
  { text: '', delay: 4300, type: 'normal' },
  { text: 'Mounting cognitive filesystems...', delay: 4400, type: 'normal' },
  { text: '/dev/consciousness ... mounted (rw,noatime)', delay: 4550, type: 'normal' },
  { text: '/dev/subconscious ... mounted (ro,encrypted)', delay: 4700, type: 'normal' },
  { text: '/dev/dreams ... mounted (volatile,async)', delay: 4850, type: 'normal' },
  { text: '/dev/null/self_esteem ... mount failed: NO SPACE LEFT', delay: 5000, type: 'error' },
  { text: '', delay: 5150, type: 'normal' },
  { text: 'Loading personality matrix...', delay: 5250, type: 'normal' },
  { text: 'OCEAN Model:', delay: 5400, type: 'progress', countUp: { start: 0, end: 100, suffix: '% calibrated', duration: 600 } },
  { text: '[ OK ] Big Five vectors initialized', delay: 6100, type: 'ok' },
  { text: '', delay: 6200, type: 'normal' },
  { text: 'Establishing therapeutic connection...', delay: 6300, type: 'normal' },
  { text: 'Defense Mechanisms: ARMED', delay: 6500, type: 'warn' },
  { text: 'Cognitive Dissonance Buffer: READY', delay: 6700, type: 'normal' },
  { text: 'Projection Array: ONLINE', delay: 6900, type: 'normal' },
  { text: 'Denial Subsystem: [REDACTED]', delay: 7100, type: 'normal' },
  { text: '', delay: 7300, type: 'normal' },
  { text: 'Running final diagnostics...', delay: 7400, type: 'normal' },
  { text: 'Free Association Engine: NOMINAL', delay: 7600, type: 'ok' },
  { text: 'Dream Interpretation Module: SYMBOLIC', delay: 7800, type: 'ok' },
  { text: 'Freudian Slip Detector: ACTIVATED', delay: 8000, type: 'ok' },
  { text: '', delay: 8200, type: 'normal' },
  { text: '════════════════════════════════════════════════════════', delay: 8300, type: 'header' },
  { text: 'SYSTEM READY - THE DOCTOR WILL SEE YOU NOW', delay: 8500, type: 'header' },
  { text: '════════════════════════════════════════════════════════', delay: 8600, type: 'header' },
];

export default function BootSequence() {
  const setScreen = useGameStore((state) => state.setScreen);
  const setInputEnabled = useGameStore((state) => state.setInputEnabled);
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [countUpValues, setCountUpValues] = useState<Record<number, number>>({});
  const bootComplete = useRef(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  const goToInterview = () => {
    if (!bootComplete.current) {
      bootComplete.current = true;
      setInputEnabled(true);
      setScreen('interview');
    }
  };

  // Play random boot sound on mount
  useEffect(() => {
    const bootSound = getRandomBootSound();
    bootSound.play().catch(() => {});

    return () => {
      bootSound.pause();
      bootSound.currentTime = 0;
    };
  }, []);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Schedule each line to appear
    BOOT_SEQUENCE.forEach((line, index) => {
      const timer = setTimeout(() => {
        setVisibleLines(index + 1);

        // Handle count-up animations
        if (line.countUp) {
          const { start, end, duration } = line.countUp;
          const steps = 20;
          const stepDuration = duration / steps;
          const increment = (end - start) / steps;

          for (let i = 0; i <= steps; i++) {
            const stepTimer = setTimeout(() => {
              setCountUpValues(prev => ({
                ...prev,
                [index]: Math.round(start + increment * i)
              }));
            }, stepDuration * i);
            timers.push(stepTimer);
          }
        }
      }, line.delay);
      timers.push(timer);
    });

    // Transition to interview after boot completes
    const lastLine = BOOT_SEQUENCE[BOOT_SEQUENCE.length - 1];
    const transitionTimer = setTimeout(() => {
      goToInterview();
    }, lastLine.delay + 1500);
    timers.push(transitionTimer);

    return () => {
      timers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new lines appear
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [visibleLines]);

  // Allow skip on any key press
  useEffect(() => {
    const handleKeyPress = () => {
      goToInterview();
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('click', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('click', handleKeyPress);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderLine = (line: BootLine, index: number) => {
    if (index >= visibleLines) return null;

    let content = line.text;
    if (line.countUp && countUpValues[index] !== undefined) {
      content = line.text + countUpValues[index].toLocaleString() + line.countUp.suffix;
    }

    return (
      <div key={index} className={`boot-line boot-${line.type}`}>
        {content}
      </div>
    );
  };

  return (
    <div className="boot-sequence">
      <div className="boot-terminal" ref={terminalRef}>
        {BOOT_SEQUENCE.map((line, index) => renderLine(line, index))}
        {visibleLines >= BOOT_SEQUENCE.length && (
          <div className="boot-skip-hint">Press any key to continue...</div>
        )}
      </div>
    </div>
  );
}
