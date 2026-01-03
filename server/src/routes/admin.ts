import { Router, Request, Response } from 'express';
import { prisma } from '../models/prisma.js';
import { StoryStatus, Prisma } from '@prisma/client';

const router = Router();

// Middleware to check if we're in dev mode
const devOnly = (req: Request, res: Response, next: Function) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Admin routes disabled in production' });
  }
  next();
};

router.use(devOnly);

// Clear all game data (keeps users but removes all game-related data)
router.post('/clear-database', async (req: Request, res: Response) => {
  try {
    // Delete in order to respect foreign key constraints
    // Start with the most dependent tables

    await prisma.gameTranscript.deleteMany({});
    await prisma.interactionCache.deleteMany({});
    await prisma.skillCheck.deleteMany({});
    await prisma.timedEvent.deleteMany({});
    await prisma.gameObject.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.playerState.deleteMany({});
    await prisma.playerAbility.deleteMany({});
    await prisma.personalityEvent.deleteMany({});
    await prisma.personalityScores.deleteMany({});
    await prisma.storyAnalysis.deleteMany({});
    await prisma.storyFact.deleteMany({});
    await prisma.dilemmaPoint.deleteMany({});
    await prisma.characterBackstory.deleteMany({});
    await prisma.callbackInstance.deleteMany({});
    await prisma.callbackCandidate.deleteMany({});
    await prisma.generatedAudio.deleteMany({});
    await prisma.generatedMedia.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.gameEvent.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.character.deleteMany({});
    await prisma.scene.deleteMany({});
    await prisma.chapter.deleteMany({});
    await prisma.story.deleteMany({});

    return res.json({
      success: true,
      message: 'All game data cleared. Users and subscriptions preserved.'
    });
  } catch (error) {
    console.error('Clear database error:', error);
    return res.status(500).json({ error: 'Failed to clear database', details: String(error) });
  }
});

// Full nuclear option - clear everything including users
router.post('/clear-all', async (req: Request, res: Response) => {
  try {
    // Delete everything in dependency order
    await prisma.gameTranscript.deleteMany({});
    await prisma.interactionCache.deleteMany({});
    await prisma.skillCheck.deleteMany({});
    await prisma.timedEvent.deleteMany({});
    await prisma.gameObject.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.playerState.deleteMany({});
    await prisma.playerAbility.deleteMany({});
    await prisma.personalityEvent.deleteMany({});
    await prisma.personalityScores.deleteMany({});
    await prisma.storyAnalysis.deleteMany({});
    await prisma.storyFact.deleteMany({});
    await prisma.dilemmaPoint.deleteMany({});
    await prisma.characterBackstory.deleteMany({});
    await prisma.callbackInstance.deleteMany({});
    await prisma.callbackCandidate.deleteMany({});
    await prisma.generatedAudio.deleteMany({});
    await prisma.generatedMedia.deleteMany({});
    await prisma.item.deleteMany({});
    await prisma.gameEvent.deleteMany({});
    await prisma.location.deleteMany({});
    await prisma.character.deleteMany({});
    await prisma.scene.deleteMany({});
    await prisma.chapter.deleteMany({});
    await prisma.story.deleteMany({});
    await prisma.soundEffect.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.userPreferences.deleteMany({});
    await prisma.user.deleteMany({});

    return res.json({
      success: true,
      message: 'Database completely cleared. All data removed.'
    });
  } catch (error) {
    console.error('Clear all error:', error);
    return res.status(500).json({ error: 'Failed to clear database', details: String(error) });
  }
});

// Get all sessions (all stories, any status)
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const { status } = req.query; // Optional filter: 'in_progress', 'completed', 'abandoned'

    const where: Prisma.StoryWhereInput = status
      ? { status: status as StoryStatus }
      : {};

    const sessions = await prisma.story.findMany({
      where,
      include: {
        user: {
          select: { displayName: true, email: true }
        },
        playerState: {
          select: { turnCount: true, score: true }
        },
        _count: {
          select: {
            transcript: true,
            rooms: true,
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 100, // Limit to last 100 sessions
    });

    return res.json(sessions.map(s => ({
      id: s.id,
      title: s.title,
      status: s.status,
      playerName: s.user?.displayName || 'Anonymous',
      turnCount: s.playerState?.turnCount || 0,
      score: s.playerState?.score || 0,
      transcriptCount: s._count.transcript,
      roomCount: s._count.rooms,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })));
  } catch (error) {
    console.error('Get sessions error:', error);
    return res.status(500).json({ error: 'Failed to get sessions' });
  }
});

// Get session transcript (live feed data)
router.get('/sessions/:id/transcript', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { since } = req.query; // Optional: get entries since this timestamp

    const where: Record<string, unknown> = { storyId: id };

    if (since) {
      where.createdAt = { gt: new Date(since as string) };
    }

    const transcript = await prisma.gameTranscript.findMany({
      where,
      orderBy: { turnNumber: 'asc' },
      select: {
        id: true,
        turnNumber: true,
        speaker: true,
        content: true,
        messageType: true,
        roomId: true,
        metadata: true,
        createdAt: true,
      }
    });

    // Also get story info including interview data
    const story = await prisma.story.findUnique({
      where: { id },
      select: {
        title: true,
        status: true,
        initialInterview: true,
        playerState: {
          select: {
            turnCount: true,
            score: true,
            currentRoomId: true,
          }
        }
      }
    });

    return res.json({
      story: {
        title: story?.title,
        status: story?.status,
        turnCount: story?.playerState?.turnCount,
        score: story?.playerState?.score,
        currentRoomId: story?.playerState?.currentRoomId,
        initialInterview: story?.initialInterview,
      },
      transcript,
      lastUpdate: transcript.length > 0
        ? transcript[transcript.length - 1].createdAt
        : null,
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    return res.status(500).json({ error: 'Failed to get transcript' });
  }
});

// Get database stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [
      userCount,
      storyCount,
      activeStoryCount,
      roomCount,
      objectCount,
      transcriptCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.story.count(),
      prisma.story.count({ where: { status: 'in_progress' } }),
      prisma.room.count(),
      prisma.gameObject.count(),
      prisma.gameTranscript.count(),
    ]);

    return res.json({
      users: userCount,
      stories: {
        total: storyCount,
        active: activeStoryCount,
      },
      rooms: roomCount,
      objects: objectCount,
      transcriptEntries: transcriptCount,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
