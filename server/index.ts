/**
 * FR1: Device Token Registration Endpoint
 * Express server: POST /register, POST /unregister, GET /health
 */

import express, { Request, Response } from 'express';
import { upsertToken, deleteToken, getTokenCount } from './db';
import { startCron } from './cron';

export const app = express();
app.use(express.json());

// POST /register — upsert device token
app.post('/register', (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== 'string' || token.trim() === '') {
    res.status(400).json({ error: 'token required' });
    return;
  }

  upsertToken(token.trim());
  res.json({ ok: true });
});

// POST /unregister — remove device token (idempotent)
app.post('/unregister', (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };

  if (token && typeof token === 'string') {
    deleteToken(token.trim());
  }

  res.json({ ok: true });
});

// GET /health — liveness check + token count
app.get('/health', (_req: Request, res: Response) => {
  const tokenCount = getTokenCount();
  res.json({ ok: true, tokenCount });
});

// Start server (only when this module is the entry point)
if (require.main === module) {
  const PORT = parseInt(process.env.PORT ?? process.env.PING_SERVER_PORT ?? '3000', 10);
  app.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
    startCron();
  });
}
