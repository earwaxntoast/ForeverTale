import { useEffect, useState, useCallback } from 'react';
import { apiClient, SidebarResponse } from '../../services/api';
import { renderAsciiMap, MapRoom } from '../../utils/asciiMap';
import './GameSidebar.css';

interface GameSidebarProps {
  storyId: string;
  refreshTrigger?: number; // Increment to force refresh
}

export function GameSidebar({ storyId, refreshTrigger }: GameSidebarProps) {
  const [data, setData] = useState<SidebarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapLines, setMapLines] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);

  // Re-render map when zoom changes
  const renderMap = useCallback((mapData: MapRoom[], zoomLevel: number) => {
    const map = renderAsciiMap(mapData, {
      width: 28,
      height: 14,
      zoom: zoomLevel,
    });
    setMapLines(map);
  }, []);

  // Fetch sidebar data
  useEffect(() => {
    if (!storyId) return;

    const fetchSidebar = async () => {
      try {
        const response = await apiClient.getSidebar(storyId);
        setData(response);
        setError(null);

        // Render ASCII map
        renderMap(response.map as MapRoom[], zoom);
      } catch (err) {
        console.error('Failed to fetch sidebar:', err);
        setError('Failed to load');
      }
    };

    fetchSidebar();
  }, [storyId, refreshTrigger, renderMap, zoom]);

  // Handle zoom changes
  const handleZoomIn = () => {
    const newZoom = Math.min(zoom + 0.25, 2);
    setZoom(newZoom);
    if (data) {
      renderMap(data.map as MapRoom[], newZoom);
    }
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoom - 0.25, 0.5);
    setZoom(newZoom);
    if (data) {
      renderMap(data.map as MapRoom[], newZoom);
    }
  };

  if (error) {
    return (
      <div className="game-sidebar">
        <div className="sidebar-error">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="game-sidebar">
        <div className="sidebar-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="game-sidebar">
      {/* Left Column: Character + Abilities */}
      <div className="sidebar-column sidebar-left">
        {/* Character Info */}
        <section className="sidebar-section character-section">
          <h2 className="sidebar-title">{data.character.name}</h2>
          {data.character.traits.length > 0 && (
            <div className="character-traits">
              {data.character.traits.map((trait, i) => (
                <span key={i} className="trait-tag">{trait}</span>
              ))}
            </div>
          )}
        </section>

        {/* Abilities/Stats */}
        <section className="sidebar-section abilities-section">
          <h3 className="section-header">ABILITIES</h3>
          {data.abilities.length > 0 ? (
            <ul className="abilities-list">
              {data.abilities.map((ability, i) => (
                <li key={i} className="ability-item">
                  <span className="ability-name">{ability.name}</span>
                  <span className="ability-level">Lv.{ability.level}</span>
                  <div className="ability-progress">
                    <div
                      className="ability-progress-bar"
                      style={{ width: `${ability.progress}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-section">No abilities yet</div>
          )}
        </section>
      </div>

      {/* Middle Column: Inventory + Objectives */}
      <div className="sidebar-column sidebar-middle">
        {/* Inventory */}
        <section className="sidebar-section inventory-section">
          <h3 className="section-header">INVENTORY</h3>
          {data.inventory && data.inventory.length > 0 ? (
            <ul className="inventory-list">
              {data.inventory.map((item) => (
                <li key={item.id} className="inventory-item" title={item.description}>
                  {item.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-section">Empty</div>
          )}
        </section>

        {/* Objectives */}
        <section className="sidebar-section objectives-section">
          <h3 className="section-header">OBJECTIVES</h3>
          {data.objectives && data.objectives.length > 0 ? (
            <ul className="objectives-list">
              {data.objectives.map((objective) => (
                <li key={objective.id} className="objective-item">
                  <div className="objective-name">{objective.name}</div>
                  <ul className="objective-steps">
                    {objective.steps.map((step, idx) => (
                      <li
                        key={idx}
                        className={`objective-step ${step.completed ? 'completed' : ''}`}
                      >
                        <span className="step-checkbox">
                          {step.completed ? '[x]' : '[ ]'}
                        </span>
                        <span className={step.completed ? 'step-text-completed' : ''}>
                          {step.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-section">No active objectives</div>
          )}
        </section>
      </div>

      {/* Right Column: Map */}
      <div className="sidebar-column sidebar-right">
        <section className="sidebar-section map-section">
          <div className="map-header">
            <h3 className="section-header">MAP</h3>
            <div className="map-zoom-controls">
              <button
                className="zoom-button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom out"
              >
                -
              </button>
              <button
                className="zoom-button"
                onClick={handleZoomIn}
                disabled={zoom >= 2}
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>
          <pre className="ascii-map">
            {mapLines.map((line, i) => (
              <div key={i}>{line || ' '}</div>
            ))}
          </pre>
          <div className="map-legend">
            <span>@ You</span>
            <span>. Visited</span>
          </div>
        </section>
      </div>
    </div>
  );
}
