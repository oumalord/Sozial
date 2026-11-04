import type { VercelRequest, VercelResponse } from '@vercel/node';
import { evergreenTick } from '../../backend/lib/engine';

export default async function evergreenCron(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (!process.env.CRON_SECRET) return void response.status(503).json({ error: 'CRON_SECRET is not configured.' });
  if (request.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return void response.status(401).json({ error: 'Unauthorized.' });
  try {
    const created = await evergreenTick();
    response.status(200).json({ ok: true, created });
  } catch (e) {
    console.error('evergreen failed', e);
    response.status(500).json({ error: 'Evergreen job failed.' });
  }
}