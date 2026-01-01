/**
 * AI Router - Selects the appropriate AI provider based on scene context
 *
 * Design Decision: By Content Type routing
 * - Claude: Dialogue & Character (emotional intelligence, relationship dynamics)
 * - Grok: Action & Combat (high energy, tension, stakes)
 * - Gemini: World & Media (descriptions, worldbuilding, image generation)
 *
 * This decision was made because each AI has different strengths:
 * - Claude excels at nuanced dialogue and emotional content
 * - Grok has a punchy, energetic style good for action
 * - Gemini integrates well with image generation for worldbuilding
 */

import { generateScene as claudeGenerateScene, SceneContext, SceneResult } from './claude.js';
import { generateScene as grokGenerateScene } from './grok.js';
import { generateScene as geminiGenerateScene, generateImage } from './gemini.js';
import { config } from '../../config/index.js';

export type AIProvider = 'claude' | 'grok' | 'gemini';

export interface RouteContext {
  sceneType?: 'dialogue' | 'action' | 'exploration' | 'decision';
  hasCharacterInteraction: boolean;
  hasCombat: boolean;
  needsWorldbuilding: boolean;
  previousProvider?: AIProvider;
}

/**
 * Select the best AI provider for the given context
 */
export function selectProvider(context: RouteContext): AIProvider {
  // Combat and action scenes -> Grok (if available)
  if (context.hasCombat || context.sceneType === 'action') {
    if (config.ai.grok) {
      return 'grok';
    }
    return 'claude'; // Fallback
  }

  // Character dialogue and emotional scenes -> Claude
  if (context.hasCharacterInteraction || context.sceneType === 'dialogue') {
    return 'claude';
  }

  // Worldbuilding and exploration -> Gemini
  if (context.needsWorldbuilding || context.sceneType === 'exploration') {
    if (config.ai.google) {
      return 'gemini';
    }
    return 'claude'; // Fallback
  }

  // Decision points -> Claude (best for weighing options)
  if (context.sceneType === 'decision') {
    return 'claude';
  }

  // Default to Claude
  return 'claude';
}

/**
 * Analyze player input to determine scene context for routing
 */
export function analyzeInputForRouting(input: string): Partial<RouteContext> {
  const lowerInput = input.toLowerCase();

  // Action/Combat keywords
  const combatKeywords = ['attack', 'fight', 'strike', 'defend', 'battle', 'hit', 'shoot', 'kill', 'run', 'escape', 'chase'];
  const hasCombat = combatKeywords.some(kw => lowerInput.includes(kw));

  // Dialogue keywords
  const dialogueKeywords = ['talk', 'speak', 'ask', 'tell', 'say', 'greet', 'convince', 'persuade', 'negotiate'];
  const hasCharacterInteraction = dialogueKeywords.some(kw => lowerInput.includes(kw));

  // Exploration keywords
  const explorationKeywords = ['look', 'examine', 'explore', 'search', 'investigate', 'where', 'what is'];
  const needsWorldbuilding = explorationKeywords.some(kw => lowerInput.includes(kw));

  // Determine scene type
  let sceneType: RouteContext['sceneType'];
  if (hasCombat) {
    sceneType = 'action';
  } else if (hasCharacterInteraction) {
    sceneType = 'dialogue';
  } else if (needsWorldbuilding) {
    sceneType = 'exploration';
  } else {
    sceneType = 'decision';
  }

  return {
    sceneType,
    hasCombat,
    hasCharacterInteraction,
    needsWorldbuilding,
  };
}

/**
 * Generate a scene using the appropriate AI provider
 */
export async function routeSceneGeneration(
  context: SceneContext,
  routeContext?: Partial<RouteContext>
): Promise<SceneResult & { provider: AIProvider }> {
  // Analyze input if route context not provided
  const fullRouteContext: RouteContext = {
    hasCharacterInteraction: false,
    hasCombat: false,
    needsWorldbuilding: false,
    ...routeContext,
    ...analyzeInputForRouting(context.playerInput),
  };

  const provider = selectProvider(fullRouteContext);

  console.log(`[AI Router] Selected provider: ${provider} for input: "${context.playerInput.slice(0, 50)}..."`);

  let result: SceneResult;

  switch (provider) {
    case 'grok':
      try {
        result = await grokGenerateScene(context);
      } catch (error) {
        console.error('[AI Router] Grok failed, falling back to Claude:', error);
        result = await claudeGenerateScene(context);
      }
      break;

    case 'gemini':
      try {
        result = await geminiGenerateScene(context);
      } catch (error) {
        console.error('[AI Router] Gemini failed, falling back to Claude:', error);
        result = await claudeGenerateScene(context);
      }
      break;

    case 'claude':
    default:
      result = await claudeGenerateScene(context);
      break;
  }

  return {
    ...result,
    provider,
  };
}

/**
 * Generate an image for a scene using Gemini
 */
export async function generateSceneImage(
  description: string,
  style: 'vga' | 'pixel' | 'retro' = 'vga'
): Promise<string | null> {
  if (!config.ai.google) {
    console.warn('[AI Router] Gemini API key not configured, skipping image generation');
    return null;
  }

  try {
    return await generateImage(description, style);
  } catch (error) {
    console.error('[AI Router] Image generation failed:', error);
    return null;
  }
}
