import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

import interviewRouter from './routes/interview.js';
import storiesRouter from './routes/stories.js';
import mediaRouter from './routes/media.js';
import adminRouter from './routes/admin.js';
import { attachUser, requireUser } from './middleware/muellerauth.js';
import { config } from './config/index.js';

const app = express();

// Behind Caddy on the same box.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

// Health + API info (public)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (_req, res) => {
  res.json({
    message: 'ForeverTale API',
    version: '1.0.0',
    auth: 'muellerauth',
    endpoints: {
      me: 'GET /api/me',
      interview: 'POST /api/interview',
      stories: {
        create: 'POST /api/stories',
        get: 'GET /api/stories/:id',
        submitAction: 'POST /api/stories/:id/scenes',
        analysis: 'GET /api/stories/:id/analysis',
      },
      media: {
        generate: 'POST /api/media/generate',
        titleArt: 'GET /api/media/title-art',
      },
    },
  });
});

// Who-am-I probe — safe public endpoint, returns { user: null } when unauthenticated.
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      isAdmin: req.user.isAdmin,
    },
  });
});

// All /api/* routes beyond this point require an authenticated muellerauth session.
app.use('/api', requireUser);
app.use('/api/interview', interviewRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/media', mediaRouter);
app.use('/api/admin', adminRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`ForeverTale API listening on :${config.port} (${config.nodeEnv})`);
});

export default app;
