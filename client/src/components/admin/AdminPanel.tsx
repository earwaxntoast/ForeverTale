import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, AdminSession, AdminStats, TranscriptEntry, InterviewExchange } from '../../services/api';
import './AdminPanel.css';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'actions' | 'sessions' | 'stats';
type StatusFilter = 'all' | 'in_progress' | 'completed' | 'abandoned';

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('actions');
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [selectedSession, setSelectedSession] = useState<AdminSession | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [interviewData, setInterviewData] = useState<InterviewExchange[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<string | null>(null);

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const data = await apiClient.admin.getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const data = await apiClient.admin.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // Load transcript for selected session
  const loadTranscript = useCallback(async (sessionId: string, since?: string) => {
    try {
      const data = await apiClient.admin.getSessionTranscript(sessionId, since);
      if (since && data.transcript.length > 0) {
        // Append new entries
        setTranscript(prev => [...prev, ...data.transcript]);
      } else if (!since) {
        // Full load
        setTranscript(data.transcript);
        // Store interview data on initial load
        setInterviewData(data.story.initialInterview || null);
      }
      lastUpdateRef.current = data.lastUpdate;
    } catch (err) {
      console.error('Failed to load transcript:', err);
    }
  }, []);

  // Start polling for live updates
  const startPolling = useCallback((sessionId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(() => {
      if (lastUpdateRef.current) {
        loadTranscript(sessionId, lastUpdateRef.current);
      }
    }, 2000); // Poll every 2 seconds
  }, [loadTranscript]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Handle session selection (double-click)
  const handleSessionDoubleClick = useCallback((session: AdminSession) => {
    setSelectedSession(session);
    lastUpdateRef.current = null;
    loadTranscript(session.id);

    // Only poll for live updates if session is in progress
    if (session.status === 'in_progress') {
      startPolling(session.id);
    }
  }, [loadTranscript, startPolling]);

  // Close session viewer
  const handleCloseViewer = useCallback(() => {
    stopPolling();
    setSelectedSession(null);
    setTranscript([]);
    setInterviewData(null);
    lastUpdateRef.current = null;
  }, [stopPolling]);

  // Filter sessions by status
  const filteredSessions = statusFilter === 'all'
    ? sessions
    : sessions.filter(s => s.status === statusFilter);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  // Load data when tab changes
  useEffect(() => {
    if (!isOpen) return;

    if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'stats') {
      loadStats();
    }
  }, [isOpen, activeTab, loadSessions, loadStats]);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setSelectedSession(null);
      setTranscript([]);
    }
  }, [isOpen, stopPolling]);

  // Clear database handler
  const handleClearDatabase = async () => {
    if (!confirm('Clear all game data? Users will be preserved.')) return;

    setIsLoading(true);
    setMessage(null);
    try {
      const result = await apiClient.admin.clearDatabase();
      setMessage({ type: 'success', text: result.message });
      loadStats();
      loadSessions();
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  // Clear all handler
  const handleClearAll = async () => {
    if (!confirm('NUCLEAR OPTION: Clear EVERYTHING including users?')) return;
    if (!confirm('Are you REALLY sure? This cannot be undone!')) return;

    setIsLoading(true);
    setMessage(null);
    try {
      const result = await apiClient.admin.clearAll();
      setMessage({ type: 'success', text: result.message });
      loadStats();
      loadSessions();
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  // Format timestamp
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString();
  };

  if (!isOpen) return null;

  return (
    <div className={`admin-panel ${isOpen ? 'open' : ''}`}>
      <div className="admin-header">
        <h2>ADMIN PANEL</h2>
        <button className="admin-close" onClick={onClose}>X</button>
      </div>

      <div className="admin-tabs">
        <button
          className={activeTab === 'actions' ? 'active' : ''}
          onClick={() => setActiveTab('actions')}
        >
          Actions
        </button>
        <button
          className={activeTab === 'sessions' ? 'active' : ''}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
        <button
          className={activeTab === 'stats' ? 'active' : ''}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </div>

      <div className="admin-content">
        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <div className="admin-actions">
            {message && (
              <div className={`admin-message ${message.type}`}>
                {message.text}
              </div>
            )}

            <div className="action-group">
              <h3>Database Management</h3>

              <button
                className="action-btn warning"
                onClick={handleClearDatabase}
                disabled={isLoading}
              >
                Clear Game Data
                <span className="action-desc">
                  Delete all games, rooms, objects. Keep users.
                </span>
              </button>

              <button
                className="action-btn danger"
                onClick={handleClearAll}
                disabled={isLoading}
              >
                NUCLEAR: Clear Everything
                <span className="action-desc">
                  Delete ALL data including users. Cannot be undone!
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="admin-sessions">
            {selectedSession ? (
              <div className="session-viewer">
                <div className="viewer-header">
                  <button onClick={handleCloseViewer}>&larr; Back</button>
                  <span className="viewer-title">{selectedSession.title}</span>
                  {selectedSession.status === 'in_progress' ? (
                    <span className="live-indicator">LIVE</span>
                  ) : (
                    <span className={`status-badge ${selectedSession.status}`}>
                      {selectedSession.status.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="transcript-view">
                  {/* Interview Section */}
                  {interviewData && interviewData.length > 0 && (
                    <div className="interview-section">
                      <div className="interview-header">─── INTERVIEW ───</div>
                      {interviewData.map((exchange, index) => (
                        <div key={index} className="interview-exchange">
                          <div className="transcript-entry narrator">
                            <span className="entry-speaker">[NARRATOR]</span>
                            <span className="entry-content">{exchange.question}</span>
                          </div>
                          <div className="transcript-entry player">
                            <span className="entry-speaker">[PLAYER]</span>
                            <span className="entry-content">{exchange.answer}</span>
                          </div>
                        </div>
                      ))}
                      <div className="interview-header">─── GAME START ───</div>
                    </div>
                  )}

                  {/* Game Transcript */}
                  {transcript.length === 0 && !interviewData ? (
                    <div className="no-transcript">No transcript entries</div>
                  ) : (
                    transcript.map((entry) => (
                      <div
                        key={entry.id}
                        className={`transcript-entry ${entry.speaker}`}
                      >
                        <span className="entry-time">{formatTime(entry.createdAt)}</span>
                        <span className="entry-speaker">[{entry.speaker}]</span>
                        <span className="entry-content">{entry.content}</span>
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>
            ) : (
              <div className="session-list">
                <div className="list-header">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="status-filter"
                  >
                    <option value="all">All Sessions</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="abandoned">Abandoned</option>
                  </select>
                  <button onClick={loadSessions}>Refresh</button>
                </div>

                <div className="list-hint">Double-click to view transcript</div>

                {filteredSessions.length === 0 ? (
                  <div className="no-sessions">No sessions found</div>
                ) : (
                  filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className={`session-item ${session.status}`}
                      onDoubleClick={() => handleSessionDoubleClick(session)}
                    >
                      <div className="session-header">
                        <span className="session-title">{session.title}</span>
                        <span className={`status-badge ${session.status}`}>
                          {session.status === 'in_progress' ? 'LIVE' : session.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="session-meta">
                        <span>{session.playerName}</span>
                        <span>Turn {session.turnCount}</span>
                        <span>{session.transcriptCount} entries</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="admin-stats">
            {stats ? (
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-value">{stats.users}</span>
                  <span className="stat-label">Users</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.stories.active}</span>
                  <span className="stat-label">Active Games</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.stories.total}</span>
                  <span className="stat-label">Total Games</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.rooms}</span>
                  <span className="stat-label">Rooms</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.objects}</span>
                  <span className="stat-label">Objects</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.transcriptEntries}</span>
                  <span className="stat-label">Transcript Entries</span>
                </div>
              </div>
            ) : (
              <div className="loading">Loading stats...</div>
            )}
            <button className="refresh-btn" onClick={loadStats}>
              Refresh Stats
            </button>
          </div>
        )}
      </div>

      <div className="admin-footer">
        <span className="dev-mode">DEV MODE</span>
        <span className="hint">Ctrl+Shift+A to close</span>
      </div>
    </div>
  );
}
