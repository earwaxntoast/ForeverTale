import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import interviewRouter from './routes/interview.js';
import storiesRouter from './routes/stories.js';
import mediaRouter from './routes/media.js';
import adminRouter from './routes/admin.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Info
app.get('/api', (req, res) => {
  res.json({
    message: 'ForeverTale API',
    version: '1.0.0',
    endpoints: {
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

// Routes
app.use('/api/interview', interviewRouter);
app.use('/api/stories', storiesRouter);
app.use('/api/media', mediaRouter);
app.use('/api/admin', adminRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║           ForeverTale API Server              ║
║═══════════════════════════════════════════════║
║  Status:  Running                             ║
║  Port:    ${PORT}                                ║
║  Mode:    ${process.env.NODE_ENV || 'development'}                       ║
╚═══════════════════════════════════════════════╝
  `);
});

export default app;
