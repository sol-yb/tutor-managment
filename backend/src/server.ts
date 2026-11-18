import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';

const app = express();
app.use(cors({ origin: env.FRONTEND_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), authRoutes);
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});
app.listen(env.PORT, () => console.log(`API listening on port ${env.PORT}`));
