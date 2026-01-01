import { Router, Request, Response } from 'express';
import {
  generateAsciiArt,
  generateTitleArt,
  generateSceneArt,
  generateCharacterArt,
  ArtStyle,
  ArtSubject,
} from '../services/ai/ascii-art.js';

const router = Router();

// Simple in-memory cache for generated ASCII art (persists until server restart)
const artCache = new Map<string, { art: string; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Generate ASCII art
router.post('/ascii', async (req: Request, res: Response) => {
  try {
    const {
      description,
      style = 'simple',
      subject = 'scene',
      maxWidth = 60,
      maxHeight = 20,
      useCache = true,
    } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing description' });
    }

    // Check cache first
    const cacheKey = `ascii:${style}:${subject}:${description.slice(0, 50)}`;
    if (useCache) {
      const cached = artCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('[Media] Returning cached ASCII art');
        return res.json({
          success: true,
          art: cached.art,
          cached: true,
        });
      }
    }

    console.log(`[Media] Generating ${style} ASCII art:`, description.slice(0, 50));

    const art = await generateAsciiArt({
      description,
      style: style as ArtStyle,
      subject: subject as ArtSubject,
      maxWidth,
      maxHeight,
    });

    // Cache the result
    artCache.set(cacheKey, { art, timestamp: Date.now() });

    return res.json({
      success: true,
      art,
    });
  } catch (error) {
    console.error('ASCII art generation error:', error);
    return res.status(500).json({ error: 'Failed to generate ASCII art' });
  }
});

// Generate title screen ASCII art (with caching)
router.get('/title-art', async (_req: Request, res: Response) => {
  try {
    const cacheKey = 'title-art-ascii';

    // Check cache first
    const cached = artCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Media] Returning cached title art');
      return res.json({
        success: true,
        art: cached.art,
        cached: true,
      });
    }

    console.log('[Media] Generating title ASCII art...');
    const art = await generateTitleArt();

    // Cache the result
    artCache.set(cacheKey, { art, timestamp: Date.now() });

    return res.json({
      success: true,
      art,
    });
  } catch (error) {
    console.error('Title art generation error:', error);
    return res.status(500).json({ error: 'Failed to generate title art' });
  }
});

// Generate scene ASCII art
router.post('/scene-art', async (req: Request, res: Response) => {
  try {
    const { description, useCache = true } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing description' });
    }

    const cacheKey = `scene:${description.slice(0, 50)}`;
    if (useCache) {
      const cached = artCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ success: true, art: cached.art, cached: true });
      }
    }

    const art = await generateSceneArt(description);
    artCache.set(cacheKey, { art, timestamp: Date.now() });

    return res.json({ success: true, art });
  } catch (error) {
    console.error('Scene art generation error:', error);
    return res.status(500).json({ error: 'Failed to generate scene art' });
  }
});

// Generate character ASCII art
router.post('/character-art', async (req: Request, res: Response) => {
  try {
    const { description, useCache = true } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing description' });
    }

    const cacheKey = `char:${description.slice(0, 50)}`;
    if (useCache) {
      const cached = artCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ success: true, art: cached.art, cached: true });
      }
    }

    const art = await generateCharacterArt(description);
    artCache.set(cacheKey, { art, timestamp: Date.now() });

    return res.json({ success: true, art });
  } catch (error) {
    console.error('Character art generation error:', error);
    return res.status(500).json({ error: 'Failed to generate character art' });
  }
});

export default router;
