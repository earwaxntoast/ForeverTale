import { Router, Request, Response } from 'express';
import { conductInterview, extractPlayerName } from '../services/ai/claude.js';

const router = Router();

interface InterviewRequest {
  playerName: string;
  currentPhase: number;
  previousExchanges: { question: string; answer: string }[];
  latestResponse: string;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as InterviewRequest;

    if (!body.playerName || !body.latestResponse) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await conductInterview({
      playerName: body.playerName,
      currentPhase: body.currentPhase || 0,
      previousExchanges: body.previousExchanges || [],
      latestResponse: body.latestResponse,
    });

    return res.json(result);
  } catch (error) {
    console.error('Interview route error:', error);
    return res.status(500).json({ error: 'Failed to process interview' });
  }
});

/**
 * Extract player name from natural language response
 */
router.post('/extract-name', async (req: Request, res: Response) => {
  try {
    const { response } = req.body;

    if (!response || typeof response !== 'string') {
      return res.status(400).json({ error: 'Missing response field' });
    }

    const result = await extractPlayerName(response);
    return res.json(result);
  } catch (error) {
    console.error('Name extraction error:', error);
    return res.status(500).json({ error: 'Failed to extract name' });
  }
});

export default router;
