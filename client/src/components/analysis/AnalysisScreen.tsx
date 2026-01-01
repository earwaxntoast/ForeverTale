import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { PressAnyKey } from '../game/TerminalInput';

// Mock OCEAN scores for now
interface OceanScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

const DIMENSION_LABELS: Record<keyof OceanScores, { name: string; low: string; high: string }> = {
  openness: {
    name: 'Openness',
    low: 'Practical & Conventional',
    high: 'Creative & Adventurous',
  },
  conscientiousness: {
    name: 'Conscientiousness',
    low: 'Flexible & Spontaneous',
    high: 'Organized & Disciplined',
  },
  extraversion: {
    name: 'Extraversion',
    low: 'Reserved & Reflective',
    high: 'Outgoing & Energetic',
  },
  agreeableness: {
    name: 'Agreeableness',
    low: 'Analytical & Detached',
    high: 'Friendly & Compassionate',
  },
  neuroticism: {
    name: 'Emotional Sensitivity',
    low: 'Calm & Resilient',
    high: 'Sensitive & Aware',
  },
};

export default function AnalysisScreen() {
  const { resetGame, setScreen } = useGameStore();
  const [showResults, setShowResults] = useState(false);
  const [animationPhase, setAnimationPhase] = useState(0);

  // Mock scores - will be replaced with real API data
  const [scores] = useState<OceanScores>({
    openness: 72,
    conscientiousness: 58,
    extraversion: 45,
    agreeableness: 81,
    neuroticism: 35,
  });

  const archetype = 'The Compassionate Explorer';
  const summary = `Your journey revealed a soul drawn to new experiences while maintaining deep
empathy for others. You approach challenges with an open mind, preferring understanding
over confrontation. Your decisions reflect a balance between curiosity and care,
making you a natural bridge-builder in any world you inhabit.`;

  useEffect(() => {
    // Animate the reveal
    const phases = [500, 1500, 2500, 3500, 4500, 5500, 6500];
    phases.forEach((delay, index) => {
      setTimeout(() => setAnimationPhase(index + 1), delay);
    });

    setTimeout(() => setShowResults(true), 7000);
  }, []);

  const handleRestart = useCallback(() => {
    resetGame();
    setScreen('title');
  }, [resetGame, setScreen]);

  const renderBar = (value: number, dimension: keyof OceanScores) => {
    const label = DIMENSION_LABELS[dimension];
    const filledWidth = Math.round((value / 100) * 30);
    const emptyWidth = 30 - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);

    return (
      <div className="score-row">
        <div className="score-label">{label.name}</div>
        <div className="score-bar">
          <span className="dim">{label.low}</span>
          <span className="bar">[{bar}]</span>
          <span className="dim">{label.high}</span>
        </div>
        <div className="score-value">{value}%</div>
      </div>
    );
  };

  return (
    <div className="analysis-screen">
      <div className="analysis-header">
        {animationPhase >= 1 && (
          <>
            <p className="dim">═══════════════════════════════════════</p>
            <h2>JOURNEY COMPLETE</h2>
            <p className="dim">═══════════════════════════════════════</p>
          </>
        )}
      </div>

      <div className="analysis-content">
        {animationPhase >= 2 && (
          <div className="analysis-section">
            <p className="dim">Analyzing your choices...</p>
          </div>
        )}

        {animationPhase >= 3 && (
          <div className="analysis-section archetype">
            <p className="dim">Your Archetype:</p>
            <h3 className="bright">{archetype}</h3>
          </div>
        )}

        {animationPhase >= 4 && (
          <div className="analysis-section scores">
            <p className="dim">Personality Profile (OCEAN):</p>
            <div className="scores-container">
              {renderBar(scores.openness, 'openness')}
              {renderBar(scores.conscientiousness, 'conscientiousness')}
              {renderBar(scores.extraversion, 'extraversion')}
              {renderBar(scores.agreeableness, 'agreeableness')}
              {renderBar(scores.neuroticism, 'neuroticism')}
            </div>
          </div>
        )}

        {animationPhase >= 5 && (
          <div className="analysis-section summary">
            <p className="dim">Your Story:</p>
            <p className="summary-text">{summary}</p>
          </div>
        )}

        {animationPhase >= 6 && (
          <div className="analysis-section">
            <p className="dim">═══════════════════════════════════════</p>
          </div>
        )}

        {showResults && (
          <div className="analysis-footer">
            <PressAnyKey
              onKeyPress={handleRestart}
              message="Press any key to begin a new journey..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
