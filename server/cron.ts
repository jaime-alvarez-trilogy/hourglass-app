/**
 * FR3: Cron Push Dispatcher
 * node-cron task: every 30 minutes, fetch all tokens → send silent pushes → clean stale tokens.
 */

import cron from 'node-cron';
import { getAllTokens, deleteTokens } from './db';
import { sendPushBatch } from './push';

/**
 * Execute one cron run: fetch tokens, push, clean stale.
 * Exported for testing and manual triggering.
 */
export async function runCron(): Promise<void> {
  const tokens = getAllTokens();
  const total = tokens.length;

  if (total === 0) {
    console.log('[cron] No tokens registered — skipping push.');
    return;
  }

  console.log(`[cron] Sending push to ${total} device(s)...`);

  const { sent, failed, staleTokens } = await sendPushBatch(tokens);

  console.log(`[cron] Push complete: ${sent} sent, ${failed} failed, ${staleTokens.length} stale.`);

  if (staleTokens.length > 0) {
    deleteTokens(staleTokens);
    console.log(`[cron] Removed ${staleTokens.length} stale token(s).`);
  }
}

/**
 * Start the node-cron schedule: every 30 minutes.
 */
export function startCron(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      await runCron();
    } catch (err) {
      console.error('[cron] Unexpected error in cron run:', err);
    }
  });
  console.log('[cron] Scheduled: every 30 minutes.');
}
