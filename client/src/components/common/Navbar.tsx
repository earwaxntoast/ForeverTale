import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import './Navbar.css';

export function Navbar() {
  const [isHovered, setIsHovered] = useState(false);
  const displayMode = useGameStore((state) => state.displayMode);
  const setDisplayMode = useGameStore((state) => state.setDisplayMode);
  const crtEffectsEnabled = useGameStore((state) => state.crtEffectsEnabled);
  const setCrtEffectsEnabled = useGameStore((state) => state.setCrtEffectsEnabled);
  const flickerIntensity = useGameStore((state) => state.flickerIntensity);
  const setFlickerIntensity = useGameStore((state) => state.setFlickerIntensity);
  const barrelStrength = useGameStore((state) => state.barrelStrength);
  const setBarrelStrength = useGameStore((state) => state.setBarrelStrength);
  const scanlineOpacity = useGameStore((state) => state.scanlineOpacity);
  const setScanlineOpacity = useGameStore((state) => state.setScanlineOpacity);

  return (
    <div
      className={`navbar-container ${isHovered ? 'visible' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover trigger zone */}
      <div className="navbar-trigger" />

      {/* Actual navbar */}
      <nav className="navbar">
        <div className="navbar-brand">FOREVERTALE</div>

        <div className="navbar-controls">
          <div className="navbar-item">
            <label htmlFor="display-mode">Display:</label>
            <select
              id="display-mode"
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as 'bordered' | 'fullscreen')}
            >
              <option value="bordered">CRT Monitor</option>
              <option value="fullscreen">Fullscreen</option>
            </select>
          </div>

          <div className="navbar-item">
            <label htmlFor="crt-effects">
              <input
                type="checkbox"
                id="crt-effects"
                checked={crtEffectsEnabled}
                onChange={(e) => setCrtEffectsEnabled(e.target.checked)}
              />
              Effects
            </label>
          </div>

          <div className="navbar-divider" />

          <div className="navbar-item slider-item">
            <label htmlFor="flicker">Flicker:</label>
            <input
              type="range"
              id="flicker"
              min="0"
              max="10"
              value={flickerIntensity}
              onChange={(e) => setFlickerIntensity(Number(e.target.value))}
            />
            <span className="slider-value">{flickerIntensity}</span>
          </div>

          <div className="navbar-item slider-item">
            <label htmlFor="barrel">Curve:</label>
            <input
              type="range"
              id="barrel"
              min="0"
              max="10"
              value={barrelStrength}
              onChange={(e) => setBarrelStrength(Number(e.target.value))}
            />
            <span className="slider-value">{barrelStrength}</span>
          </div>

          <div className="navbar-item slider-item">
            <label htmlFor="scanlines">Scanlines:</label>
            <input
              type="range"
              id="scanlines"
              min="0"
              max="10"
              value={scanlineOpacity}
              onChange={(e) => setScanlineOpacity(Number(e.target.value))}
            />
            <span className="slider-value">{scanlineOpacity}</span>
          </div>
        </div>
      </nav>
    </div>
  );
}
