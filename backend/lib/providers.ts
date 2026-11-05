import { secrets } from './runtime';
import type { MediaInfo, PlatformDef } from './platforms';

export type Rec = Record<string, any>;

export interface PublishRequest {
  platform: PlatformDef;
  providerIdentifier: string;
  integrationId: string;
  variant: Rec;
  media: MediaInfo[];
  thumbnail?: MediaInfo;
  text: string;
  idempotencyKey: string;
}

export interface PublishResult {
  ok: boolean;
  accepted?: boolean;
  manual?: boolean;
  retryable?: boolean;
  code?: string;
  message: string;
  externalId?: string;
  url?: string;
}

const POSTIZ_API_URL = 'POSTIZ_API_URL';
const POSTIZ_API_KEY = 'POSTIZ_API_KEY';
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

export interface PostizConfig {
  apiUrl: string;
  apiKey: string;
}

export interface PostizIntegration extends Rec {
  id: string;
  name: string;
  identifier: string;
  platform: string;
  profile?: string;
  picture?: string;
}

const PLATFORM_BY_POSTIZ_ID: Record<string, string> = {
  x: 'x', twitter: 'x', linkedin: 'linkedin', 'linkedin-page': 'linkedin', facebook: 'facebook',
  instagram: 'instagram', 'instagram-standalone': 'instagram', threads: 'threads', youtube: 'youtube',
  tiktok: 'tiktok', pinterest: 'pinterest',
};

export function postizPlatform(identifier: string): string | null {
  return PLATFORM_BY_POSTIZ_ID[identifier] || null;
}

export async function postizConfig(): Promise<PostizConfig | null> {
  const names = await secretNames();
  if (!names.includes(POSTIZ_API_URL) || !names.includes(POSTIZ_API_KEY)) return null;
  try {
    const rawUrl = await secrets.readSecret(POSTIZ_API_URL);
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return { apiUrl: rawUrl.replace(/\/+$/, ''), apiKey: await secrets.readSecret(POSTIZ_API_KEY) };
  } catch {
    return null;
  }
}

export async function integrationStatus(): Promise<Rec> {
  const names = await secretNames();
  const has = (list: string[]) => list.every((n) => names.includes(n));
  const postiz = await postizConfig();
  return {
    providers: [
      { id: 'postiz', name: 'Postiz', implemented: true, configured: !!postiz, note: 'Self-hosted publishing engine. Social connections are managed by SozialFlow administrators.' },
      { id: 'openai', name: 'OpenAI', implemented: true, configured: names.includes('OPENAI_API_KEY'), secret: 'OPENAI_API_KEY', note: 'Powers AI content generation and workspace insights.' },
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

const http = async (url: string, init: Rec): Promise<{ status: number; body: any }> => {
  const f = (globalThis as Rec).fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  try {
    const res = await f(url, { ...init, signal: ctl.signal });
    let body: any = {};
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

export async function listPostizIntegrations(config?: PostizConfig): Promise<PostizIntegration[]> {
  const current = config || await postizConfig();
  if (!current) throw new Error('Configure POSTIZ_API_URL and POSTIZ_API_KEY on the SozialFlow server.');
  const r = await http(current.apiUrl + '/integrations', { method: 'GET', headers: { Authorization: current.apiKey } });
  if (r.status >= 400) throw new Error(String(r.body.message || r.body.error || 'Postiz could not list connected accounts.').slice(0, 400));
  const rows: Rec[] = Array.isArray(r.body) ? r.body : Array.isArray(r.body.integrations) ? r.body.integrations : [];
  return rows.filter((item) => item && typeof item.id === 'string' && typeof item.identifier === 'string' && postizPlatform(item.identifier))
    .map((item) => ({ id: item.id, name: String(item.name || item.profile || item.identifier), identifier: item.identifier, platform: postizPlatform(item.identifier) as string, profile: item.profile, picture: item.picture, disabled: !!item.disabled }));
}

export async function getPostizIntegration(integrationId: string, config?: PostizConfig): Promise<PostizIntegration | null> {
  return (await listPostizIntegrations(config)).find((item) => item.id === integrationId && !item.disabled) || null;
}

export async function listPostizPosts(config: PostizConfig, startDate: string, endDate: string): Promise<Rec[]> {
  const query = new URLSearchParams({ startDate, endDate });
  const r = await http(config.apiUrl + '/posts?' + query.toString(), { method: 'GET', headers: { Authorization: config.apiKey } });
  if (r.status >= 400) throw new Error(String(r.body.message || r.body.error || 'Postiz could not return post statuses.').slice(0, 400));
  return Array.isArray(r.body) ? r.body : Array.isArray(r.body.posts) ? r.body.posts : [];
}

export async function publishViaPostiz(config: PostizConfig, req: PublishRequest): Promise<PublishResult> {
  const p = req.platform;
  const v = req.variant;
  const upload = async (media: MediaInfo): Promise<Rec> => {
    if (!media.url) throw new Error('Postiz cannot access ' + media.name + '. Make sure media is publicly reachable over HTTPS.');
    const r = await http(config.apiUrl + '/upload-from-url', { method: 'POST', headers: { Authorization: config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: media.url }) });
    if (r.status >= 400 || typeof r.body.id !== 'string' || typeof r.body.path !== 'string') throw new Error(String(r.body.message || r.body.error || 'Postiz could not import ' + media.name + '.').slice(0, 400));
    return { id: r.body.id, path: r.body.path };
  };
  const images = await Promise.all(req.media.map(upload));
  const settings: Rec = { __type: req.providerIdentifier };
  if (p.id === 'x') settings.who_can_reply_post = 'everyone';
  if (p.id === 'youtube') {
    settings.title = String(v.title || '').slice(0, 100);
    settings.type = (v.opts && v.opts.visibility) || 'private';
    settings.selfDeclaredMadeForKids = (v.opts && v.opts.madeForKids) === 'yes' ? 'yes' : 'no';
    const tags = String((v.opts && v.opts.tags) || '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 15);
    if (tags.length) settings.tags = tags.map((tag) => ({ value: tag, label: tag }));
  }
  if (p.id === 'instagram') settings.post_type = v.format === 'story' ? 'story' : 'post';
  if (p.id === 'tiktok') Object.assign(settings, { title: String(v.title || '').slice(0, 90), privacy_level: (v.opts && v.opts.privacy) || 'PUBLIC_TO_EVERYONE', duet: !!(v.opts && v.opts.allowDuet), stitch: !!(v.opts && v.opts.allowStitch), comment: v.opts?.allowComment !== false, autoAddMusic: 'no', brand_content_toggle: !!(v.opts && v.opts.branded), brand_organic_toggle: false, video_made_with_ai: false, content_posting_method: 'DIRECT_POST' });
  if (p.id === 'pinterest') Object.assign(settings, { title: v.title, link: v.link, board: v.opts && v.opts.boardId });
  if (p.id === 'facebook' && v.link) settings.url = v.link;
  if (req.thumbnail && p.id === 'youtube') settings.thumbnail = await upload(req.thumbnail);
  const body = { type: 'now', date: new Date().toISOString(), shortLink: false, tags: [], posts: [{ integration: { id: req.integrationId }, value: [{ content: req.text, image: images }], settings }] };
  try {
    const r = await http(config.apiUrl + '/posts', { method: 'POST', headers: { Authorization: config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) return { ok: false, retryable: false, code: 'auth', message: 'Postiz rejected the configured API key or integration access.' };
    if (r.status === 429) return { ok: false, retryable: true, code: 'rate_limit', message: 'Postiz rate limit reached; retrying later.' };
    if (r.status >= 500) return { ok: false, retryable: true, code: 'provider_down', message: 'Postiz returned HTTP ' + r.status + '.' };
    if (r.status >= 400) return { ok: false, retryable: false, code: 'rejected', message: String(r.body.message || r.body.error || 'Postiz rejected the post.').slice(0, 500) };
    const item = Array.isArray(r.body) ? r.body[0] : r.body;
    const externalId = item && (item.postId || item.id);
    if (externalId) return { ok: true, accepted: true, message: 'Post accepted by Postiz; awaiting platform status.', externalId: String(externalId), url: item.releaseURL };
    return { ok: false, retryable: false, code: 'rejected', message: 'Postiz did not return a post ID.' };
  } catch (e) {
    return { ok: false, retryable: true, code: 'network', message: 'Network problem talking to Postiz: ' + (e instanceof Error ? e.message : 'unknown') };
  }
}
