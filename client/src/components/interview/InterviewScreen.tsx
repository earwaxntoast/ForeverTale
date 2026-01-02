import { useCallback, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import Terminal from '../game/Terminal';
import { apiClient } from '@/services/api';

export default function InterviewScreen() {
  const {
    messages,
    addMessage,
    addInterviewExchange,
    interviewExchanges,
    interviewPhase,
    setInterviewPhase,
    playerName,
    setPlayerName,
    setInputEnabled,
    setLoading,
    setLoadingMessage,
    setScreen,
    setCurrentStoryId,
  } = useGameStore();

  // Local state only for the story preference phase (doesn't need to persist)
  const awaitingStoryPreferenceRef = useRef(false);
  const completedExchangesRef = useRef<{ question: string; answer: string }[]>([]);

  const handlePlayerInput = useCallback(async (input: string) => {
    // Add player's message to terminal
    addMessage({
      type: 'player',
      content: input,
    });

    // Disable input while processing
    setInputEnabled(false);
    setLoading(true);
    setLoadingMessage('Contemplating');

    try {
      // Handle story preference response (after interview completes)
      if (awaitingStoryPreferenceRef.current && playerName) {
        setLoading(false);

        // Store the preference and start generation
        addMessage({
          type: 'system',
          content: 'Your preference has been noted. Generating your personalized story...',
        });
        setScreen('generating_story');
        awaitingStoryPreferenceRef.current = false;

        // Generate story with the player's preference
        generateStory(playerName, completedExchangesRef.current, input);
        return;
      }

      // First input is the player's name - check both phase AND no exchanges as safety
      if (interviewPhase === 0 && interviewExchanges.length === 0) {
        setLoadingMessage('Listening');

        // Extract the name from natural language response
        const { name } = await apiClient.extractName(input);

        setPlayerName(name);
        setLoading(false);

        // Add response using the extracted name - mysterious ancient monk tone
        const nameResponses = [
          `${name}. The name settles into place. But names only reveal what we allow them to, ${name}. Tell me... if you could reshape one aspect of your inner self, what would you reach for?`,
          `So it is. Every name carries the weight of a life lived, ${name}. What regret do you carry that still weighs on you in quiet moments?`,
          `A name is just the beginning, ${name}. The soul beneath it is what interests me. What brings you to a state of genuine happiness?`,
          `Very well, ${name}. You exist in a world not of your making. If you held the power to change one thing about it, what would you choose?`,
          `${name}. I hear you. Trust is a rare currency in this life. Is there anyone you trust without reservation?`,
          `${name}. The name echoes. But even those with clear names can lose their way. Tell me, ${name}... When did you last feel truly lost?`,
          `${name}. A timely name. Time is a river we cannot enter twice. If you could witness any moment in history, which would call to you?`,
          `I sense there is more beneath the surface, ${name}. We all carry gifts we may not recognize. What quality in yourself do you consider your greatest gift to others?`,
          `${name}. The syllables know their shape. In stillness, the mind speaks loudest. What occupies your mind when silence surrounds you?`,
          `${name}. So you say. We all harbor secrets, ${name}, even from ourselves. What truth about yourself have you never spoken aloud?`,
          `${name} resonates. Beauty and wonder hide in unexpected places, even a name. What in this world do you find most beautiful?`,
          `Now we begin. Fear walks beside us, ${name}. Have you ever faced one of your deepest fears made real? Tell me about it.`,
          `Fear of failure chains many to smaller lives, ${name}. What would you pursue if failure were impossible?`,
          `${name}. I will remember it. Those who pass through our lives leave marks. Share the wisdom a past connection left with you.`,
          `${name}. The name settles. Old wounds have long memories. Who in your history do you wish you could find peace with?`,
          `Memory is a strange country, ${name}. What is the first thing you remember from your earliest days?`,
          `${name}. So be it. Each year writes new chapters within us. What has this year taught you about who you are?`,
          `${name}. A beginning. We are often our own harshest critics. What unkind words do you whisper to yourself in the dark?`,
          `${name}. The threads connect. Fear shapes us in ways we rarely admit. What frightens you more than anything else?`,
          `${name}. I accept it. Life offers moments of profound presence. When did you last feel the fullness of being alive?`,
          `${name}. It hangs in the air... ${name}, we measure ourselves against invisible standards. Do you ever feel you have fallen short of who you should be?`,
          `${name}. Now I know you, and we will see if you know yourself. Wisdom often comes too late. What advice would you offer to the younger soul you once were?`,
          `${name}. The shape of it is clear. We choose our companions carefully. What quality do you treasure most in those you call friends?`,
          `Acknowledged. Something always stands between us and our potential, ${name}. What invisible force holds you back from becoming?`,
          `${name}. I see. Life moves through seasons of shadow and light. Which chapter of your life held the most light? Which the most darkness?`,
          `${name}. The name knows itself. Our earliest years cast long shadows. How do you remember your childhood?`,
          `${name}. So you shall be called. We are often mysteries even to those closest to us. What do others consistently fail to understand about you?`,
          `${name}. It is spoken. Tears are the cleric of the soul. When did tears last find you, and what summoned them?`,
          `${name}. A name among names. Some wounds refuse to close. What is something you cannot bring yourself to forgive?`,
          `I will hold it. Pain finds us all eventually, ${name}. How do you find comfort when distress finds you?`,
          `${name}. Curious. Some flee company while others flee emptiness. Do you seek solitude, or does it seek you?`,
          `The player takes form inside the game. Self-doubt is a persistent shadow, ${name}. What doubt about yourself troubles you most?`,
          `I hear the weight of it. Love is the great mystery, ${name}. Do you believe there is one soul meant for another?`,
          `So the story begins. Life is constant motion, ${name}; to be still is to be dead. Do you welcome change, or resist its current?`,
          `A name for the journey. We all dream of days unclouded. What does a perfect day hold for you, ${name}?`,
          `${name}. The word settles between us. Kindness toward oneself is sometimes difficult. Are you harder on yourself than you should be?`,
          `The beginning of understanding. Others reveal what we value. What never fails to impress you about others?`,
          `${name}. And so we begin. We all have a place where we belong. Where in all the world do you feel most yourself?`,
          `${name}. A marker in the stream. The unlived life haunts us all. If your life could be entirely different, what shape would it take?`,
          `${name}. So you have chosen. Children dream without limits. What dream did you hold as a child for who you would become?`,
          `${name}. It echoes. Emotions demand expression or burial. Do you give voice to your emotions, or do they remain within?`,
          `${name}. Now I see you. Denial is a shield we all carry. What truth are you choosing not to face?`,
          `${name}. A name with history. Others see what we cannot. How do you receive the criticism of others?`,
          `${name}. So it begins. Mortality frames every choice. If time held no limits, would you wish to live forever?`,
          `${name}. The first truth. Dreams deferred still call to us. What rests at the top of your list of dreams yet unfulfilled?`,
          `${name}. I will carry it forward. We build ourselves through deeds. What accomplishment fills you with the deepest pride?`,
          `${name}. Spoken into being. Truth and deception define our boundaries. What is the greatest untruth you have ever told?`,
          `${name}. A sound I will remember. Understanding often arrives suddenly. Has clarity ever struck you like lightning?`,
          `${name}. The pattern emerges. We change more than we know. What would the person you once were say upon seeing you now?`,
          `${name}. I accept this beginning. The future waits to be written. What grand vision have you yet to bring into being?`,
          `${name}. So the path opens. Some moments sear themselves into us. What experience burned brightest in your memory?`,
          `${name}. A name finding its place. Innocence, once lost, cannot return. What do you miss most from the innocence of childhood?`,
          `${name}. The shape of you begins to form. Hope is the light we carry forward. What awaits you that brings hope?`,
          `${name}. So we begin our work. The world holds mysteries beyond explanation. Have you witnessed something you cannot explain?`,
          `${name}. It is enough for now. We all need something to hold onto. What philosophy carries you through darkness?`,
          `${name}. A door opens. The question of what follows haunts humanity. Do you believe consciousness survives the body?`,
          `${name}. The first step of many. Gratitude reveals what we truly value. What one thing fills you with the most gratitude?`,
          `${name}. I accept the weight of it. The nature of evil is an ancient question. Do you believe some are born with darkness in them?`,
          `${name}. Now the conversation truly begins. Life offers rare moments of pure existence. When do you feel most completely alive?`,
          `${name}. A name is a kind of promise. The sacred means different things to each soul. What does the word spirituality mean to you?`,
          `${name}. So you've told me. The future is a canvas we paint with intention. In ten years, what life do you imagine for yourself?`,
          `${name}. It resonates between us. Success wears many faces, ${name}. How do you measure a life well-lived?`,
          `${name}. The first of many revelations. Freedom is the deepest human longing. When do you feel the most free?`,
          `${name}. I hold the name carefully. The question of destiny divides us all. Do you believe in the design of fate?`,
          `${name}. So you are known. Identity is the puzzle we spend our lives solving. What defines the core of who you are?`,
          `${name}. The beginning of deeper things. Death is the shadow that gives life its shape. Do you think often about the end of things?`,
          `${name}. A name that has traveled far to reach me. Mortality whispers to us all. Does the thought of death trouble you?`,
          `${name}. Now we can speak of real things. Transformation is the hope of every soul. Is true change possible for a person?`,
          `${name}. It hangs between us. Old wounds demand resolution. Is forgiveness necessary for those who have wronged you?`,
          `${name}. A name like a key. Maybe the key to home? What does the feeling of home mean to you?`,
          `${name}. So we meet at last. The mind is restless in the dark. What question keeps you awake in the small hours?`,
        ];
        const randomResponse = nameResponses[Math.floor(Math.random() * nameResponses.length)];

        addMessage({
          type: 'narrator',
          content: randomResponse,
          isTyping: true,
        });

        setInterviewPhase(1);
        setInputEnabled(true);
        return;
      }

      // Build the current exchange BEFORE calling API
      // Note: addMessage above is async - the player's input hasn't been added to messages yet
      // So messages[-1] is actually the narrator's last question
      const currentExchange = {
        question: messages[messages.length - 1]?.content || '',
        answer: input,
      };

      // Send to interview API
      // Include the current question so the server knows what was asked
      const response = await apiClient.interview({
        playerName: playerName || 'Traveler',
        currentPhase: interviewPhase,
        previousExchanges: interviewExchanges,
        currentQuestion: currentExchange.question,
        latestResponse: input,
      });

      setLoading(false);

      // Store the exchange in state for future calls
      addInterviewExchange(currentExchange);

      // Add the response immediately
      addMessage({
        type: 'narrator',
        content: response.message,
        isTyping: true,
      });

      if (response.isComplete) {
        // Interview complete - ask for story preference before generating
        completedExchangesRef.current = [...interviewExchanges, currentExchange];
        awaitingStoryPreferenceRef.current = true;

        // Ask the player what type of story they'd like
        addMessage({
          type: 'narrator',
          content: `I have seen enough of your soul, ${playerName}. Now tell me... what kind of tale calls to you? Do you yearn for high fantasy with magic and mythical creatures? Perhaps the cold logic of science fiction? The shadows of horror? The intrigue of mystery? A romantic journey? Or something else entirely? Speak freely—your preference will shape the world that awaits you.`,
          isTyping: true,
        });

        setInputEnabled(true);
      } else {
        // Continue interview - enable input for next response
        setInterviewPhase(interviewPhase + 1);
        setInputEnabled(true);
      }
    } catch (error) {
      console.error('Interview error:', error);
      setLoading(false);

      // Fallback response on error - maintain mysterious tone
      addMessage({
        type: 'narrator',
        content: 'The connection flickered. Continue.',
        isTyping: true,
      });

      setInterviewPhase(interviewPhase + 1);
      setInputEnabled(true);
    }
  }, [
    playerName,
    interviewPhase,
    interviewExchanges,
    messages,
    addMessage,
    addInterviewExchange,
    setInterviewPhase,
    setPlayerName,
    setInputEnabled,
    setLoading,
    setLoadingMessage,
    setScreen,
  ]);

  const generateStory = async (
    name: string,
    exchanges: { question: string; answer: string }[],
    storyPreference?: string
  ) => {
    try {
      // Start story generation - returns immediately with storyId
      const result = await apiClient.generateStory({
        playerName: name,
        interviewExchanges: exchanges,
        storyPreference,
      });

      // Store the story ID immediately - GeneratingScreen will connect to SSE
      setCurrentStoryId(result.storyId);

      // Screen was already set to 'generating_story' before this function was called
      // GeneratingScreen will handle progress tracking and transition to 'playing'
    } catch (error) {
      console.error('Story generation error:', error);
      // Show error message
      addMessage({
        type: 'system',
        content: 'Story generation failed. Please try again.',
        isTyping: false,
      });
      setLoading(false);
      setInputEnabled(true);
      setScreen('interview'); // Go back to interview on error
    }
  };

  return (
    <div className="interview-screen">
      <Terminal onInput={handlePlayerInput} />
    </div>
  );
}
