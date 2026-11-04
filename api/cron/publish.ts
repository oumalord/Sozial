import type { VercelRequest, VercelResponse } from '@vercel/node';
import { iso, setSystem } from '../../backend/lib/core';
import type { Rec } from '../../backend/lib/core';
import { processDue } from '../../backend/lib/engine';

export default async function publishCron(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (!process.env.CRON_SECRET) return void response.status(503).json({ error: 'CRON_SECRET is not configured.' });
  if (request.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return void response.status(401).json({ error: 'Unauthorized.' });
  let info: Rec = {};
  try {
    info = await processDue();
    await setSystem('engine', { lastRunAt: iso(), pending: info.pending, due: info.due, lastError: null });
    response.status(200).json({ ok: true, ...info });
  } catch (e) {
    console.error('publish-due failed', e);
    await setSystem('engine', { lastRunAt: iso(), lastError: e instanceof Error ? e.message : 'error' });
    response.status(500).json({ error: 'Publishing job failed.' });
  }
}