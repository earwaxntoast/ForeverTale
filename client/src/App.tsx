import CRTScreen from './effects/CRTScreen';
import { useGameStore } from './store/gameStore';
import TitleScreen from './components/game/TitleScreen';
import BootSequence from './components/game/BootSequence';
import InterviewScreen from './components/interview/InterviewScreen';
import GameScreen from './components/game/GameScreen';
import AnalysisScreen from './components/analysis/AnalysisScreen';
import { AdminPanel } from './components/admin/AdminPanel';
import { Navbar } from './components/common/Navbar';
import { useSecretPhrase, isDev } from './hooks/useSecretPhrase';

function App() {
  const {
    screen,
    crtEffectsEnabled,
    displayMode,
    flickerIntensity,
    barrelStrength,
    scanlineOpacity
  } = useGameStore();
  const { triggered: adminPanelOpen, reset: closeAdminPanel } = useSecretPhrase();
  const showAdminPanel = isDev() && adminPanelOpen;

  const renderScreen = () => {
    switch (screen) {
      case 'title':
        return <TitleScreen />;
      case 'boot_sequence':
        return <BootSequence />;
      case 'interview':
        return <InterviewScreen />;
      case 'generating_story':
        return <GeneratingScreen />;
      case 'playing':
        return <GameScreen />;
      case 'analysis':
        return <AnalysisScreen />;
      default:
        return <TitleScreen />;
    }
  };

  return (
    <>
      {/* Auto-hide navbar at top */}
      <Navbar />

      {/* Admin Panel - Only in dev mode, activated by secret phrase */}
      {isDev() && (
        <AdminPanel isOpen={showAdminPanel} onClose={closeAdminPanel} />
      )}

      <CRTScreen
        enabled={crtEffectsEnabled}
        displayMode={displayMode}
        flickerIntensity={flickerIntensity}
        barrelStrength={barrelStrength}
        scanlineOpacity={scanlineOpacity}
      >
        <div className="game-container">
          {renderScreen()}
        </div>
      </CRTScreen>
    </>
  );
}

function GeneratingScreen() {
  return (
    <div className="generating-screen">
      <p className="dim">Weaving the threads of your destiny...</p>
      <p className="loading">Generating story</p>
    </div>
  );
}

export default App;
