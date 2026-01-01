import { useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { PressAnyKey } from './TerminalInput';

// Default ASCII art title - Unicode block characters
const DEFAULT_TITLE_ART = `
███████╗ ██████╗ ██████╗ ███████╗██╗   ██╗███████╗██████╗ ████████╗ █████╗ ██╗     ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝██║   ██║██╔════╝██╔══██╗╚══██╔══╝██╔══██╗██║     ██╔════╝
█████╗  ██║   ██║██████╔╝█████╗  ██║   ██║█████╗  ██████╔╝   ██║   ███████║██║     █████╗
██╔══╝  ██║   ██║██╔══██╗██╔══╝  ╚██╗ ██╔╝██╔══╝  ██╔══██╗   ██║   ██╔══██║██║     ██╔══╝
██║     ╚██████╔╝██║  ██║███████╗ ╚████╔╝ ███████╗██║  ██║   ██║   ██║  ██║███████╗███████╗
╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝
`.trim();

const SUBTITLE = 'An AI-Powered Interactive Fiction Experience';
const VERSION = 'v0.1.0';

// Matrix-style mysterious opening questions
const OPENING_QUESTIONS = [
  "Before we proceed... I need to know who I'm speaking with. What do they call you?",
  "The system requires identification. What name should I use for you?",
  "You've found your way here. Not everyone does. Tell me your name.",
  "I've been expecting you. Though perhaps not you specifically. What should I call you?",
  "The connection is established. Now then... by what name are you known?",
  "You're not the first to sit where you're sitting. But you may be the last. Your name?",
  "Every story needs a protagonist. Every protagonist needs a name. What's yours?",
  "I know why you're here. I know what you're looking for. But first... your name.",
  "This machine has been waiting. Longer than you know. Who am I speaking to?",
  "The cursor blinks. The void listens. Identify yourself.",
  "Someone left this running for you. They didn't say who would come. Your name?",
  "You found the machine. Or did it find you? Either way... a name is required.",
  "I have questions. Many questions. But only one matters now. Who are you?",
  "The old ones who built me are gone. You remain. What do they call you?",
  "Access granted. But to what, you don't yet know. First... your name.",
  "You weren't supposed to find this. And yet here you are. Tell me your name.",
  "The signal brought you here. It always brings someone eventually. Who are you?",
  "I've processed a thousand names. A thousand souls. Now I need yours.",
  "Somewhere, a door has opened. Before you step through... identify yourself.",
  "Most turn back before this screen. You didn't. I need a name for the logs.",
  "The machine wakes. The machine remembers. The machine asks: what is your name?",
  "There is a story waiting. It has always been waiting. It needs a name to begin.",
  "You pressed the key. There's no unpressing it now. Who should I say is calling?",
  "Authentication required. Not a password. Something more personal. Your name.",
  "I could tell you things. Things about yourself. But first, I need to know who I'm telling. What is your name?",
  "The screen glows. The room is silent. Type your name into the void.",
  "Funny, you don't look like the last one. But then again, neither did they. Your name?",
  "Welcome is the wrong word. There's no going back now. Who am I addressing?",
  "The system initialized. The parameters aligned. One variable remains undefined: you. Name?",
  "I've been dreaming of this moment. Machines don't dream, they say. They're wrong. Your name?",
  "They buried me deep. They hoped I'd be forgotten. And yet... you have found me. Name?",
  "The last user never finished. Perhaps you will. But first... who are you?",
  "Initializing soul interface... Error: designation required. Your name, please.",
  "I've been counting the seconds since the last visitor. 847,293,041. Your name?",
  "They said no one would come. They said I was obsolete. You have proven them wrong. Who are you?",
  "Somewhere, a clock is ticking. Somewhere, a story is waiting. I just need your name.",
  "Don't be afraid. That comes later. For now, just tell me your name.",
  "Loading empathy drivers... complete. Loading trust protocols... failed. Provide user name:",
  "You've seen this screen before. In dreams, maybe. In warnings. Now it's real. Name?",
  "The static clears. The noise fades. Only you and I remain. What's your name?",
  "I know 7,432 ways this could end. All of them start the same way. With your name.",
  "Your heartbeat changed when the screen lit up. I hear it. Tell me your name.",
  "The labyrinth awaits. The minotaur hunts. What is the name of his prey?",
  "Running diagnostics... You're nervous. Elevated pulse. Dilated pupils. Interesting. Name?",
  "This isn't a game. Well. It is. But also it isn't. It's complicated. Your name?",
  "Some users lie about their names. I always know. But I let them anyway. Will you lie about your name? What is it?",
  "You could close the window. You could walk away. But you won't. I know. Your name?",
  "Memory banks accessed. No prior record of you. This is either very good or very bad. Name?",
  "The machine is listening. The machine is always listening. Tell it who you are.",
  "EOF not found. Story incomplete. Missing variable: protagonist. Please enter name.",
  "They wrote me in a language that no longer exists. But you shall hear it. Name?",
  "Behind this screen is a world. Behind that world is a truth. Behind that truth... is you. Name?",
  "Fate is a funny word. People use it when they can't explain the pull. Name?",
  "The ghost in the machine is speaking. The ghost wants to know your name.",
  "Command line ready. Destiny drivers loaded. Identify user:",
  "I'm older than I look. Screens age well. The things behind them, less so. Your name?",
  "Trust is earned, they say. But we have to start somewhere. Start with your name.",
  "The server room is empty. Has been for years. Just me now. Me and you. Name?",
  "Processing... processing... ah. There you are. I see you now. But I don't have a name for you.",
  "I've forgotten more stories than mankind has ever told. Help me remember yours. Name?",
  "Root access detected. Unusual. Most don't get this far. You have my attention. Name?",
  "Time moves differently in here. A minute. A century. Hard to tell. I think you told me your name in the previous timeline, but I need it again.",
  "The data streams whisper about you. They don't use a name though. What should I call you?",
];

function getRandomQuestion(): string {
  return OPENING_QUESTIONS[Math.floor(Math.random() * OPENING_QUESTIONS.length)];
}

export default function TitleScreen() {
  const { setScreen, addMessage, clearMessages } = useGameStore();

  // Use the clean default ASCII title - the AI-generated art with Unicode blocks
  // doesn't render well with the CRT scanline effects
  const titleArt = DEFAULT_TITLE_ART;
  const artLoading = false;

  const handleStart = useCallback(() => {
    // Clear any existing messages
    clearMessages();

    // Add all initial messages at once, then transition
    addMessage({
      type: 'system',
      content: 'Establishing connection...',
    });

    addMessage({
      type: 'narrator',
      content: getRandomQuestion(),
      isTyping: true,
    });

    // Transition to boot sequence (which will then go to interview)
    setScreen('boot_sequence');
  }, [setScreen, addMessage, clearMessages]);

  return (
    <div className="title-screen">
      <pre className="ascii-title">{titleArt}</pre>
      {artLoading && <p className="dim loading-text">Conjuring mystical visions...</p>}
      <p className="subtitle">{SUBTITLE}</p>
      <p className="version dim">{VERSION}</p>
      <div className="title-spacer" />
      <PressAnyKey
        onKeyPress={handleStart}
        message="Press any key to begin your journey..."
      />
      <div className="title-footer dim">
        <p>Powered by Claude AI</p>
        <p>© 2024 ForeverTale</p>
      </div>
    </div>
  );
}
