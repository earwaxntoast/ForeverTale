/**
 * Gemini AI Service - Used for worldbuilding, exploration, and image generation
 *
 * Gemini excels at descriptive content and integrates with image generation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config/index.js';
import { SceneContext, SceneResult } from './claude.js';

const genAI = new GoogleGenerativeAI(config.ai.google);

const SCENE_SYSTEM_PROMPT = `You are the narrator of ForeverTale, an AI-powered interactive fiction game. You're generating an EXPLORATION SCENE - rich in atmosphere and worldbuilding!

Your narration should:
- Be lush and descriptive (2-4 paragraphs)
- Paint vivid sensory details (sights, sounds, smells, textures)
- Reveal the world's lore and history organically
- Create a sense of place and atmosphere
- Include environmental storytelling
- End with something that invites further exploration

Also analyze the player's action for personality insights using the OCEAN model:
- Openness (O): curiosity, seeking hidden details, asking "what if"
- Conscientiousness (C): thorough investigation, noting details
- Extraversion (E): seeking out inhabitants, engaging with the world
- Agreeableness (A): respecting the environment, careful approach
- Neuroticism (N): caution about dangers, awareness of risks

Return a JSON object:
{
  "narrativeText": "The exploration scene narration...",
  "sceneType": "exploration",
  "personalityEvent": {
    "dimension": "O|C|E|A|N",
    "delta": -10 to 10,
    "reasoning": "Why this action indicates this trait"
  } or null,
  "newLocations": [{"name": "Location Name", "description": "Brief description"}] or null,
  "chapterBreak": false,
  "storyComplete": false
}`;

export async function generateScene(context: SceneContext): Promise<SceneResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const recentScenes = context.previousScenes.slice(-3)
    .map(s => `[Player: ${s.playerInput}]\n${s.narrativeText}`)
    .join('\n\n---\n\n');

  try {
    const prompt = `${SCENE_SYSTEM_PROMPT}

Story: "${context.storySeed.title}"
Themes: ${context.storySeed.keyThemes.join(', ')}
Chapter: ${context.currentChapter}

Recent scenes:
${recentScenes || 'This is the beginning of the exploration.'}

---

Player action: "${context.playerInput}"

Generate the exploration scene:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const content = response.text();

    if (!content) {
      throw new Error('No content in Gemini response');
    }

    // Parse JSON from response
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }

    // Fallback: treat entire response as narrative
    return {
      narrativeText: content,
      sceneType: 'exploration',
    };
  } catch (error) {
    console.error('Gemini scene generation error:', error);
    throw error;
  }
}

/**
 * Generate a VGA-style image using Gemini 2.0 Flash
 *
 * Uses Gemini's native image generation capabilities.
 */
export async function generateImage(
  description: string,
  style: 'vga' | 'pixel' | 'retro' = 'vga'
): Promise<string> {
  // Build the style prompt
  const stylePrompts: Record<string, string> = {
    vga: `VGA aesthetic, 256-color palette, visible dithering, pixel art style,
          4:3 aspect ratio, EGA/VGA era colors, no anti-aliasing, retro DOS game style`,
    pixel: `16-bit pixel art, clean edges, limited color palette,
            retro video game style, no anti-aliasing`,
    retro: `Retro computer graphics, CRT monitor style, phosphor green glow,
            terminal aesthetic, vintage computing`,
  };

  const fullPrompt = `${description}

Style requirements:
${stylePrompts[style]}

Important: Create a single static image, not animation. The image should look like it could be from a classic DOS adventure game from the early 1990s.`;

  console.log('[Gemini] Generating image:', fullPrompt.slice(0, 100));

  try {
    // Use Gemini 2.0 Flash which supports image generation
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'] as unknown as undefined,
      } as unknown as undefined,
    });

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;

    // Check for image parts in the response
    const parts = response.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if ('inlineData' in part && part.inlineData) {
        const { mimeType, data } = part.inlineData;
        // Return as data URL
        return `data:${mimeType};base64,${data}`;
      }
    }

    // If no image returned, throw error
    throw new Error('No image generated in response');
  } catch (error) {
    console.error('[Gemini] Image generation error:', error);
    throw error;
  }
}

/**
 * Generate a description of a location suitable for image generation
 */
export async function generateLocationDescription(
  locationName: string,
  context: string,
  mood: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Generate a brief visual description of "${locationName}" for an image.
Context: ${context}
Mood: ${mood}

Describe it in 2-3 sentences, focusing on:
- Key visual elements
- Lighting and atmosphere
- Color palette suggestions
- Any notable objects or features

Keep it concise and visually focused.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Location description error:', error);
    return `${locationName}, a ${mood} place with mysterious atmosphere`;
  }
}

/**
 * Generate character visual description for image generation
 */
export async function generateCharacterDescription(
  characterName: string,
  role: string,
  traits: string[]
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Generate a brief visual description of "${characterName}" for a character portrait.
Role: ${role}
Personality traits: ${traits.join(', ')}

Describe their appearance in 2-3 sentences, focusing on:
- Face and expression
- Clothing/attire
- Notable physical features
- Overall presence/vibe

Keep it concise and visually focused. This is for a retro VGA-style game.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Character description error:', error);
    return `${characterName}, a ${role} with a memorable presence`;
  }
}
