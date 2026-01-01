/**
 * Grok AI Service - Used for action and combat scenes
 *
 * Grok's style is punchy, energetic, and good for high-stakes moments.
 * Falls back to Claude if Grok API is unavailable.
 */

import { config } from '../../config/index.js';
import { SceneContext, SceneResult } from './claude.js';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_IMAGE_API_URL = 'https://api.x.ai/v1/images/generations';

const SCENE_SYSTEM_PROMPT = `You are the narrator of ForeverTale, an AI-powered interactive fiction game. You're generating an ACTION SCENE - high energy, tension, stakes!

Your narration should:
- Be vivid and PUNCHY (2-4 paragraphs)
- Focus on movement, impact, and consequences
- Use short, sharp sentences for tension
- Describe physical sensations and adrenaline
- Make combat feel dynamic and consequential
- End with a moment that invites player response

Also analyze the player's action for personality insights using the OCEAN model:
- Openness (O): creative combat solutions, unusual tactics
- Conscientiousness (C): strategic planning, careful execution
- Extraversion (E): bold moves, leading the charge
- Agreeableness (A): protecting others, showing mercy
- Neuroticism (N): caution, defensive choices

Return a JSON object:
{
  "narrativeText": "The action scene narration...",
  "sceneType": "action",
  "personalityEvent": {
    "dimension": "O|C|E|A|N",
    "delta": -10 to 10,
    "reasoning": "Why this action indicates this trait"
  } or null,
  "chapterBreak": false,
  "storyComplete": false
}`;

export async function generateScene(context: SceneContext): Promise<SceneResult> {
  if (!config.ai.grok) {
    throw new Error('Grok API key not configured');
  }

  const recentScenes = context.previousScenes.slice(-3)
    .map(s => `[Player: ${s.playerInput}]\n${s.narrativeText}`)
    .join('\n\n---\n\n');

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.grok}`,
      },
      body: JSON.stringify({
        model: 'grok-2-1212',
        messages: [
          {
            role: 'system',
            content: SCENE_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: `Story: "${context.storySeed.title}"
Chapter: ${context.currentChapter}

Recent scenes:
${recentScenes || 'This is the beginning of the action.'}

---

Player action: "${context.playerInput}"

Generate the action scene:`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Grok response');
    }

    // Parse JSON from response
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    // Fallback: treat entire response as narrative
    return {
      narrativeText: content,
      sceneType: 'action',
    };
  } catch (error) {
    console.error('Grok scene generation error:', error);
    throw error;
  }
}

/**
 * Generate an image using Grok's Aurora model
 */
export async function generateImage(
  description: string,
  style: 'vga' | 'pixel' | 'retro' = 'vga'
): Promise<string> {
  if (!config.ai.grok) {
    throw new Error('Grok API key not configured');
  }

  const stylePrompts: Record<string, string> = {
    vga: 'VGA aesthetic, 256-color palette, visible dithering, pixel art style, retro DOS game style, 4:3 aspect ratio',
    pixel: '16-bit pixel art, clean edges, limited color palette, retro video game style',
    retro: 'Retro computer graphics, CRT monitor style, vintage computing aesthetic',
  };

  const fullPrompt = `${description}

Style: ${stylePrompts[style]}
Create a single static image that looks like it could be from a classic DOS adventure game from the early 1990s.`;

  console.log('[Grok] Generating image:', fullPrompt.slice(0, 100));

  try {
    const response = await fetch(GROK_IMAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.grok}`,
      },
      body: JSON.stringify({
        model: 'grok-2-image',
        prompt: fullPrompt,
        n: 1,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok Image API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const imageData = data.data?.[0]?.b64_json;

    if (!imageData) {
      throw new Error('No image data in Grok response');
    }

    // Return as data URL
    return `data:image/png;base64,${imageData}`;
  } catch (error) {
    console.error('[Grok] Image generation error:', error);
    throw error;
  }
}
