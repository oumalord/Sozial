import { neon } from '@neondatabase/serverless';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { del, put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export type Rec = Record<string, any>;
export interface RouterContext {
  request: VercelRequest;
  response: VercelResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Rec;
  user?: { userId: string; email?: string; name?: string };
}
export interface RouterResponse { statusCode: number; body: any; headers?: Record<string, string> }
export type RouterMiddleware = (ctx: RouterContext) => Promise<RouterResponse | void>;

const databaseUrl = () => {
  const value = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!value) throw new Error('Set DATABASE_URL to your Neon connection string.');
  return value;
};
let sqlClient: NeonQueryFunction<false, false> | undefined;
const sql = () => (sqlClient ||= neon(databaseUrl()));
let schemaReady: Promise<void> | undefined;

async function ensureSchema(): Promise<void> {
  schemaReady ||= (async () => {
    await sql().query('CREATE TABLE IF NOT EXISTS socialflow_records (table_name text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (table_name, id))');
    await sql().query("CREATE INDEX IF NOT EXISTS socialflow_records_path_idx ON socialflow_records ((data->>'path'))");
    await sql().query('CREATE INDEX IF NOT EXISTS socialflow_records_data_idx ON socialflow_records USING GIN (data jsonb_path_ops)');
  })();
  try { await schemaReady; } catch (e) { schemaReady = undefined; throw e; }
}

const incrementKey = '__socialflow_increment__';
export const increment = (by: number) => ({ [incrementKey]: by });
const isIncrement = (value: unknown): value is Record<typeof incrementKey, number> => !!value && typeof value === 'object' && incrementKey in value;

async function getRows(table: string, ids: string[]): Promise<(Rec | null)[]> {
  if (!ids.length) return [];
  await ensureSchema();
  const rows = await sql().query('SELECT id, data FROM socialflow_records WHERE table_name = $1 AND id = ANY($2::text[])', [table, ids]) as { id: string; data: Rec }[];
  const found = new Map(rows.map((row) => [row.id, row.data]));
  return ids.map((id) => found.get(id) ?? null);
}

export const db = {
  get: async <R extends Rec = Rec>(table: string, ids: string[], _options?: { consistent?: boolean }): Promise<(R | null)[]> => await getRows(table, ids) as (R | null)[],
  tx: {
    add: async (table: string, records: Rec[]): Promise<boolean[]> => {
      await ensureSchema();
      const results: boolean[] = [];
      for (const record of records) {
        const result = await sql().query('INSERT INTO socialflow_records (table_name, id, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (table_name, id) DO NOTHING RETURNING id', [table, String(record.id), JSON.stringify(record)]);
        results.push(result.length > 0);
      }
      return results;
    },
    update: async (table: string, items: { id: string; record: Rec; if?: Rec }[], _options?: { patch?: boolean }): Promise<boolean[]> => {
      await ensureSchema();
      const results: boolean[] = [];
      for (const item of items) {
        const increments = Object.entries(item.record).filter((entry) => isIncrement(entry[1]));
        if (increments.length) {
          const patch = Object.fromEntries(Object.entries(item.record).filter((entry) => !isIncrement(entry[1])));
          const params: unknown[] = [table, item.id, JSON.stringify(patch)];
          let expression = 'data || $3::jsonb';
          for (const [key, value] of increments) {
            const keyParam = params.length + 1;
            params.push(key);
            const valueParam = params.length + 1;
            params.push((value as Record<typeof incrementKey, number>)[incrementKey]);
            expression = `jsonb_set(${expression}, ARRAY[$${keyParam}::text], to_jsonb(COALESCE((data->>$${keyParam})::numeric, 0) + $${valueParam}::numeric), true)`;
          }
          const conditions = item.if ? `AND data @> $${params.length + 1}::jsonb` : '';
          if (item.if) params.push(JSON.stringify(item.if));
          const updated = await sql().query(`UPDATE socialflow_records SET data = ${expression} WHERE table_name = $1 AND id = $2 ${conditions} RETURNING id`, params);
          results.push(updated.length > 0);
          continue;
        }
        const [current] = await getRows(table, [item.id]);
        if (!current) { results.push(false); continue; }
        const next = { ...current };
        for (const [key, value] of Object.entries(item.record)) {
          next[key] = isIncrement(value) ? (Number(current[key]) || 0) + value[incrementKey] : value;
        }
        const conditions = item.if ? 'AND data @> $5::jsonb' : '';
        const params: unknown[] = [table, item.id, JSON.stringify(next), JSON.stringify(current)];
        if (item.if) params.push(JSON.stringify(item.if));
        const updated = await sql().query(`UPDATE socialflow_records SET data = $3::jsonb WHERE table_name = $1 AND id = $2 AND data = $4::jsonb ${conditions} RETURNING id`, params);
        results.push(updated.length > 0);
      }
      return results;
    },
  },
  delete: async (table: string, ids: string[]): Promise<void> => {
    if (!ids.length) return;
    await ensureSchema();
    await sql().query('DELETE FROM socialflow_records WHERE table_name = $1 AND id = ANY($2::text[])', [table, ids]);
  },
  list: async (table: string, options: { limit: number; nextToken?: string }): Promise<{ items: Rec[]; nextToken?: string }> => {
    await ensureSchema();
    const offset = options.nextToken ? Number(Buffer.from(options.nextToken, 'base64url').toString()) || 0 : 0;
    const rows = await sql().query('SELECT data FROM socialflow_records WHERE table_name = $1 ORDER BY id LIMIT $2 OFFSET $3', [table, options.limit, offset]) as { data: Rec }[];
    const nextOffset = offset + rows.length;
    return { items: rows.map((row) => row.data), ...(rows.length === options.limit ? { nextToken: Buffer.from(String(nextOffset)).toString('base64url') } : {}) };
  },
};

export const storage = {
  write: async (files: { path: string; content: string; contentType: string }[]): Promise<{ url: string; path: string }[]> => {
    const saved: { url: string; path: string }[] = [];
    for (const file of files) {
      const blob = await put(file.path, Buffer.from(file.content, 'base64'), { access: 'public', contentType: file.contentType, addRandomSuffix: false, allowOverwrite: true });
      saved.push({ path: file.path, url: blob.url });
    }
    return saved;
  },
  url: async (paths: string[]): Promise<{ path: string; url: string }[]> => {
    if (!paths.length) return [];
    await ensureSchema();
    const rows = await sql().query("SELECT data->>'path' AS path, data->>'url' AS url FROM socialflow_records WHERE data->>'path' = ANY($1::text[]) AND data ? 'url'", [paths]) as { path: string; url: string }[];
    return rows.filter((row) => row.path && row.url);
  },
  delete: async (paths: string[]): Promise<void> => {
    const urls = await storage.url(paths);
    if (urls.length) await del(urls.map((item) => item.url));
  },
};

const configuredSecrets = ['AYRSHARE_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'OPENAI_API_KEY'];
export const secrets = {
  listSecretNames: async (): Promise<string[]> => configuredSecrets.filter((name) => !!process.env[name]),
  readSecret: async (name: string): Promise<string> => {
    const value = process.env[name];
    if (!value) throw new Error('Missing environment variable: ' + name);
    return value;
  },
};

export async function revokeUser(email: string): Promise<void> {
  await ensureSchema();
  await sql().query("DELETE FROM socialflow_records WHERE table_name = 'auth_sessions' AND data->>'userId' = $1", [email]);
  await db.delete('auth_users', [email]);
}

export const ai = {
  generate: async (input: { system: string; prompt: string; schema: Rec; maxTokens?: number; thinkingMode?: string }): Promise<{ text: string }> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Set OPENAI_API_KEY to enable AI features.');
    const response = await fetch(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: input.maxTokens || 2500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt + '\nReturn JSON matching this schema: ' + JSON.stringify(input.schema) }] }),
    });
    const result = await response.json() as Rec;
    if (!response.ok) throw new Error(result.error?.message || 'AI provider request failed.');
    const text = result.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('The AI returned an empty answer.');
    return { text };
  },
};

export function json(body: any, statusCode = 200): RouterResponse { return { statusCode, body }; }
export function error(message: string, statusCode = 400): RouterResponse { return json({ error: message }, statusCode); }

const scrypt = promisify(scryptCallback);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const parseCookies = (header = ''): Record<string, string> => Object.fromEntries(header.split(';').map((entry) => entry.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2));
const cookie = (value: string, maxAge: number) => `sf_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

async function authEndpoint(ctx: RouterContext): Promise<RouterResponse | null> {
  if (!ctx.path.startsWith('/api/auth/')) return null;
  const endpoint = ctx.path.slice('/api/auth/'.length);
  const token = parseCookies(ctx.request.headers.cookie).sf_session;
  if (endpoint === 'session' && ctx.method === 'GET') {
    if (!token) return json({ user: null });
    const [session] = await getRows('auth_sessions', [hash(token)]);
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return json({ user: null });
    const [user] = await getRows('auth_users', [session.userId]);
    return user ? json({ user: { userId: user.userId, email: user.email, name: user.name } }) : json({ user: null });
  }
  if ((endpoint === 'register' || endpoint === 'login') && ctx.method === 'POST') {
    const email = String(ctx.body.email || '').trim().toLowerCase();
    const password = String(ctx.body.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) return error('Enter a valid email address.', 400);
    if (password.length < 10 || password.length > 200) return error('Password must be between 10 and 200 characters.', 400);
    await ensureSchema();
    const [existing] = await getRows('auth_users', [email]);
    let user: Rec;
    if (endpoint === 'register') {
      if (existing) return error('An account with that email already exists.', 409);
      const salt = randomBytes(16).toString('hex');
      const passwordHash = (await scrypt(password, salt, 64) as Buffer).toString('hex');
      user = { id: email, userId: 'u' + randomBytes(16).toString('hex'), email, name: String(ctx.body.name || email.split('@')[0]).trim().slice(0, 80), salt, passwordHash, createdAt: new Date().toISOString() };
      const [created] = await db.tx.add('auth_users', [user]);
      if (!created) return error('An account with that email already exists.', 409);
    } else {
      if (!existing) return error('Email or password is incorrect.', 401);
      const candidate = await scrypt(password, existing.salt, 64) as Buffer;
      const expected = Buffer.from(existing.passwordHash, 'hex');
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return error('Email or password is incorrect.', 401);
      user = existing;
    }
    const sessionToken = randomBytes(32).toString('base64url');
    await db.tx.add('auth_sessions', [{ id: hash(sessionToken), userId: user.id, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }]);
    return { ...json({ user: { userId: user.userId, email: user.email, name: user.name } }), headers: { 'Set-Cookie': cookie(sessionToken, 30 * 86400) } };
  }
  if (endpoint === 'logout' && ctx.method === 'POST') {
    if (token) await db.delete('auth_sessions', [hash(token)]);
    return { ...json({ ok: true }), headers: { 'Set-Cookie': cookie('', 0) } };
  }
  return error('Not found.', 404);
}

export function requireAuth(): RouterMiddleware {
  return async (ctx) => {
    if (!ctx.user) return error('Sign in to continue.', 401);
  };
}
export function requireAdminEmailAllowlist(emails: string[]): RouterMiddleware {
  return async (ctx) => emails.includes((ctx.user?.email || '').toLowerCase()) ? undefined : error('Administrator access required.', 403);
}

export function router(routes: Record<string, RouterMiddleware[]>): (request: VercelRequest, response: VercelResponse) => Promise<void> {
  return async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const method = (request.method || 'GET').toUpperCase();
    const path = url.pathname.replace(/\/$/, '') || '/';
    const body = request.body && typeof request.body === 'object' ? request.body as Rec : {};
    const ctx: RouterContext = { request, response, method, path, params: {}, query: Object.fromEntries(url.searchParams), body };
    try {
      const authResult = await authEndpoint(ctx);
      if (authResult) return send(response, authResult);
      const token = parseCookies(request.headers.cookie).sf_session;
      if (token) {
        const [session] = await getRows('auth_sessions', [hash(token)]);
        if (session && Date.parse(session.expiresAt) > Date.now()) {
          const [user] = await getRows('auth_users', [session.userId]);
          if (user) ctx.user = { userId: user.userId, email: user.email, name: user.name };
        }
      }
      for (const [pattern, middleware] of Object.entries(routes)) {
        const [routeMethod, ...routeParts] = pattern.split(' ');
        if (routeMethod !== method) continue;
        const routePath = routeParts.join(' ');
        const keys: string[] = [];
        const regex = new RegExp('^' + routePath.split('/').map((part) => {
          if (part.startsWith(':')) { keys.push(part.slice(1)); return '([^/]+)'; }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('/') + '$');
        const match = path.match(regex);
        if (!match) continue;
        ctx.params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
        for (const fn of middleware) {
          const result = await fn(ctx);
          if (result) return send(response, result);
        }
        return send(response, error('Route returned no response.', 500));
      }
      return send(response, error('Not found.', 404));
    } catch (e) {
      console.error('request failed', e);
      return send(response, error(e instanceof Error ? e.message : 'Server error.', 500));
    }
  };
}

function send(response: VercelResponse, result: RouterResponse): void {
  for (const [name, value] of Object.entries(result.headers || {})) response.setHeader(name, value);
  response.status(result.statusCode).json(result.body);
}
