/**
 * ASCII Art Generator - Uses Claude to generate ASCII art for scenes and characters
 *
 * Fits perfectly with the retro terminal aesthetic!
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config/index.js';

const client = new Anthropic({
  apiKey: config.ai.anthropic,
});

export type ArtStyle = 'detailed' | 'simple' | 'minimal';
export type ArtSubject = 'scene' | 'character' | 'object' | 'title' | 'symbol';

interface AsciiArtRequest {
  description: string;
  style?: ArtStyle;
  subject?: ArtSubject;
  maxWidth?: number;
  maxHeight?: number;
}

const STYLE_GUIDES: Record<ArtStyle, string> = {
  detailed: `Use a rich variety of ASCII characters to create depth and texture.
Include shading using characters like: ░▒▓█ or .:-=+*#%@
Add fine details where appropriate.`,

  simple: `Use clean lines and basic shapes.
Focus on recognizable silhouettes and key features.
Use characters like: | - / \\ _ = + * # @ O o .`,

  minimal: `Extremely simple, icon-like representation.
Use only essential lines to convey the subject.
Maximum 10-15 lines tall.`,
};

const SUBJECT_GUIDES: Record<ArtSubject, string> = {
  scene: `Create an atmospheric scene that sets a mood.
Include environmental elements like ground, sky, or structures.
Consider perspective and depth.`,

  character: `Focus on the character's distinctive features.
Show posture and attitude.
Can be portrait-style or full-body.`,

  object: `Highlight the object's key characteristics.
Show it from the most recognizable angle.
Add relevant details that hint at its purpose.`,

  title: `Create decorative, eye-catching text art.
Can include flourishes and borders.
Should be bold and readable.`,

  symbol: `Create an iconic, symbolic representation.
Should be immediately recognizable.
Works well at small sizes.`,
};

const ASCII_SYSTEM_PROMPT = `You are an ASCII art generator for ForeverTale, a retro text adventure game with a green-on-black CRT terminal aesthetic.

Your task is to create ASCII art that will be displayed in a monospace terminal.

CRITICAL RULES:
1. ONLY output the ASCII art itself - no explanations, no markdown code blocks, no commentary
2. Use only standard ASCII characters that display well in terminals
3. The art should look good in phosphor green (#33ff33) on black
4. Consider that the art will have a subtle glow effect applied
5. Keep within the specified dimensions
6. Make it evocative and atmospheric - this is for an adventure game!

Good characters to use:
- Structural: | - / \\ _ = + [ ] { } ( ) < >
- Shading: . : ; ' \` , " ~
- Dense: # @ $ % & * █ ▓ ▒ ░
- Special: ^ v o O 0 x X

Remember: Output ONLY the ASCII art, nothing else.`;

export async function generateAsciiArt(request: AsciiArtRequest): Promise<string> {
  const {
    description,
    style = 'simple',
    subject = 'scene',
    maxWidth = 60,
    maxHeight = 20,
  } = request;

  const prompt = `Create ASCII art of: ${description}

Style: ${style}
${STYLE_GUIDES[style]}

Subject type: ${subject}
${SUBJECT_GUIDES[subject]}

Dimensions: Maximum ${maxWidth} characters wide, ${maxHeight} lines tall.

Generate the ASCII art now:`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: ASCII_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Clean up any accidental markdown or explanations
    let art = content.text.trim();

    // Remove markdown code blocks if present
    art = art.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '');

    // Remove any leading/trailing explanatory text (heuristic: if first line is long prose)
    const lines = art.split('\n');
    if (lines[0] && lines[0].length > maxWidth && !lines[0].includes('█') && !lines[0].includes('#')) {
      // First line looks like explanation, try to find where art starts
      const artStartIndex = lines.findIndex(line =>
        line.includes('█') || line.includes('▓') || line.includes('#') ||
        line.includes('|') || line.includes('/') || line.includes('\\') ||
        (line.trim().length > 0 && line.trim().length <= maxWidth)
      );
      if (artStartIndex > 0) {
        art = lines.slice(artStartIndex).join('\n');
      }
    }

    return art.trim();
  } catch (error) {
    console.error('[ASCII Art] Generation error:', error);
    throw error;
  }
}

// Pre-defined art pieces for common elements
export const TITLE_ART_PROMPT = `A mystical floating book or ancient tome, magical and mysterious.
The book should appear to glow with inner power.
Include some magical sparkles or energy wisps around it.
This is the title screen art for an adventure game called "ForeverTale".`;

export const SCENE_PROMPTS = {
  forest: 'A mysterious forest path with tall trees, dappled light, and an air of ancient magic',
  dungeon: 'A dark dungeon corridor with stone walls, flickering torchlight, and ominous shadows',
  tavern: 'A cozy medieval tavern interior with a bar, hanging lanterns, and wooden beams',
  castle: 'A grand castle on a hilltop, towers reaching to the sky, banners flying',
  cave: 'The entrance to a dark cave, stalactites dripping, unknown depths beyond',
  village: 'A peaceful village square with cobblestones, a well, and thatched-roof cottages',
  ocean: 'A vast ocean view with waves, a distant ship, and clouds on the horizon',
  mountain: 'A towering mountain peak shrouded in mist, a winding path leading upward',
};

/**
 * Generate title screen art
 */
export async function generateTitleArt(): Promise<string> {
  return generateAsciiArt({
    description: TITLE_ART_PROMPT,
    style: 'detailed',
    subject: 'title',
    maxWidth: 70,
    maxHeight: 25,
  });
}

/**
 * Generate scene art for a location
 */
export async function generateSceneArt(locationDescription: string): Promise<string> {
  return generateAsciiArt({
    description: locationDescription,
    style: 'simple',
    subject: 'scene',
    maxWidth: 60,
    maxHeight: 15,
  });
}

/**
 * Generate character portrait
 */
export async function generateCharacterArt(characterDescription: string): Promise<string> {
  return generateAsciiArt({
    description: characterDescription,
    style: 'simple',
    subject: 'character',
    maxWidth: 30,
    maxHeight: 20,
  });
}
