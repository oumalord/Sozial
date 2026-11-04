import { secrets } from './runtime';
import type { MediaInfo, PlatformDef } from './platforms';

export type Rec = Record<string, any>;

export interface PublishRequest {
  platform: PlatformDef;
  variant: Rec;
  media: MediaInfo[];
  text: string;
  idempotencyKey: string;
}

export interface PublishResult {
  ok: boolean;
  manual?: boolean;
  retryable?: boolean;
  code?: string;
  message: string;
  externalId?: string;
  url?: string;
}

const AYRSHARE_KEY = 'AYRSHARE_API_KEY';
const PAYMENT_SECRETS = {
  stripe: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
  mpesa: ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY'],
};

export async function secretNames(): Promise<string[]> {
  try {
    return await secrets.listSecretNames();
  } catch {
    return [];
  }
}

export async function providerKey(): Promise<string | null> {
  const names = await secretNames();
  if (!names.includes(AYRSHARE_KEY)) return null;
  try {
    return await secrets.readSecret(AYRSHARE_KEY);
  } catch {
    return null;
  }
}

export async function integrationStatus(): Promise<Rec> {
  const names = await secretNames();
  const has = (list: string[]) => list.every((n) => names.includes(n));
  return {
    providers: [
      { id: 'ayrshare', name: 'Ayrshare', implemented: true, configured: names.includes(AYRSHARE_KEY), secret: AYRSHARE_KEY, note: 'Unified publishing API. The adapter follows the Ayrshare REST documentation and must be verified against your Ayrshare account.' },
      { id: 'uploadpost', name: 'Upload-Post', implemented: false, configured: false, secret: 'UPLOADPOST_API_KEY', note: 'Planned. The provider interface is ready but this adapter is not written yet.' },
    ],
    payments: {
      stripe: { configured: has(PAYMENT_SECRETS.stripe), secrets: PAYMENT_SECRETS.stripe },
      mpesa: { configured: has(PAYMENT_SECRETS.mpesa), secrets: PAYMENT_SECRETS.mpesa },
    },
  };
}

export async function paymentsConfigured(): Promise<boolean> {
  const s = await integrationStatus();
  return !!(s.payments.stripe.configured || s.payments.mpesa.configured);
}

const http = async (url: string, init: Rec): Promise<{ status: number; body: Rec }> => {
  const f = (globalThis as Rec).fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await f(url, { ...init, signal: ctl.signal });
    let body: Rec = {};
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
};

export async function verifyAyrshare(key: string, platformAyrId: string): Promise<{ state: string; message: string }> {
  try {
    const r = await http('https://app.ayrshare.com/api/user', { method: 'GET', headers: { Authorization: 'Bearer ' + key } });
    if (r.status === 401 || r.status === 403) return { state: 'expired', message: 'The provider rejected the API key. Replace AYRSHARE_API_KEY.' };
    if (r.status >= 400) return { state: 'disconnected', message: 'Provider returned HTTP ' + r.status + '.' };
    const active: string[] = Array.isArray(r.body.activeSocialAccounts) ? r.body.activeSocialAccounts : [];
    if (active.includes(platformAyrId)) return { state: 'connected', message: 'Linked in the publishing provider.' };
    return { state: 'permission_required', message: 'This network is not linked in your Ayrshare dashboard yet. Link it there, then verify again.' };
  } catch (e) {
    return { state: 'disconnected', message: 'Could not reach the provider: ' + (e instanceof Error ? e.message : 'network error') };
  }
}

export async function publishViaAyrshare(key: string, req: PublishRequest): Promise<PublishResult> {
  const p = req.platform;
  const v = req.variant;
  const body: Rec = {
    post: req.text,
    platforms: [p.ayrshareId],
    idempotencyKey: req.idempotencyKey,
  };
  const urls = req.media.map((m) => m.url).filter(Boolean);
  if (urls.length) body.mediaUrls = urls;
  if (p.id === 'youtube') {
    body.youTubeOptions = { title: v.title, visibility: (v.opts && v.opts.visibility) || 'private', shorts: v.format === 'short', madeForKids: !!(v.opts && v.opts.madeForKids === 'yes') };
  }
  if (p.id === 'instagram') body.instagramOptions = { reels: v.format === 'reel', stories: v.format === 'story' };
  if (p.id === 'pinterest') body.pinterestOptions = { title: v.title, link: v.link, boardId: v.opts && v.opts.boardId };
  try {
    const r = await http('https://app.ayrshare.com/api/post', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) return { ok: false, retryable: false, code: 'auth', message: 'The publishing provider rejected our credentials.' };
    if (r.status === 429) return { ok: false, retryable: true, code: 'rate_limit', message: 'Rate limited by the provider; retrying later.' };
    if (r.status >= 500) return { ok: false, retryable: true, code: 'provider_down', message: 'Provider error HTTP ' + r.status + '.' };
    const results: Rec[] = Array.isArray(r.body.postIds) ? r.body.postIds : [];
    const mine = results.find((x) => x.platform === p.ayrshareId);
    if (mine && mine.status === 'success') return { ok: true, message: 'Published', externalId: String(mine.id || r.body.id || ''), url: mine.postUrl };
    const reason = (mine && (mine.message || mine.error)) || r.body.message || (r.body.errors && JSON.stringify(r.body.errors)) || 'No platform confirmation was returned.';
    return { ok: false, retryable: false, code: 'rejected', message: String(reason).slice(0, 500) };
  } catch (e) {
    return { ok: false, retryable: true, code: 'network', message: 'Network problem talking to the provider: ' + (e instanceof Error ? e.message : 'unknown') };
  }
}
