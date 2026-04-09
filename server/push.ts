/**
 * FR3: Expo Push Batch Sender
 * Sends silent push notifications to device tokens in chunks of ≤100.
 * Returns { sent, failed, staleTokens[] } for cron cleanup.
 */

import fetch from 'node-fetch';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

export interface PushBatchResult {
  sent: number;
  failed: number;
  staleTokens: string[];
}

interface ExpoPushMessage {
  to: string;
  data: { type: string };
  _contentAvailable: boolean;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
}

/**
 * Send silent push notifications to all provided tokens in batches of 100.
 * Returns aggregate counts and list of stale (DeviceNotRegistered) tokens.
 */
export async function sendPushBatch(tokens: string[]): Promise<PushBatchResult> {
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, staleTokens: [] };
  }

  let sent = 0;
  let failed = 0;
  const staleTokens: string[] = [];

  // Chunk tokens into arrays of CHUNK_SIZE
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    chunks.push(tokens.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of chunks) {
    const messages: ExpoPushMessage[] = chunk.map(token => ({
      to: token,
      data: { type: 'bg_refresh' },
      _contentAvailable: true,
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });

      const body = (await response.json()) as { data: ExpoTicket[] };
      const tickets = body.data ?? [];

      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sent++;
        } else {
          failed++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            staleTokens.push(chunk[idx]);
          }
        }
      });
    } catch (err) {
      console.error('[push] Failed to send chunk to Expo push API:', err);
      failed += chunk.length;
    }
  }

  return { sent, failed, staleTokens };
}
