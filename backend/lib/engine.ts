import { db, storage } from './runtime';
import { T, getRec, addRec, patchRec, delRec, listRecs, uid, iso, planFor, getUsage, bumpUsage, zonedToUtcMs } from './core';
import type { Rec } from './core';
import { PLATFORMS, composeText, mergeVariant, validateVariant } from './platforms';
import type { MediaInfo, PlatformDef } from './platforms';
import { providerKey, publishViaAyrshare } from './providers';
import type { PublishResult } from './providers';

const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [2, 5, 15, 45, 120];
const LOCK_MS = 5 * 60 * 1000;
const DAY = 86400000;

export async function notify(w: string, n: { type: string; title: string; body?: string; level?: string; postId?: string }): Promise<void> {
  try {
    await addRec(T.notifs(w), { ...n, at: iso(), readBy: [] }, 'n');
  } catch (e) {
    console.error('notify failed', e);
  }
}

export async function logEvent(w: string, e: Rec): Promise<void> {
  try {
    await addRec(T.logs(w), { ...e, at: iso() }, 'l');
  } catch (err) {
    console.error('log failed', err);
  }
}

export function derivePostStatus(post: Rec): string {
  const targets: Rec[] = post.targets || [];
  if (!targets.length) return post.status || 'draft';
  const s = targets.map((t) => t.status);
  if (s.includes('awaiting_approval')) return 'pending_approval';
  if (s.includes('publishing')) return 'publishing';
  if (s.includes('queued')) return 'scheduled';
  if (s.includes('paused')) return 'paused';
  const live = s.filter((x) => x !== 'cancelled');
  if (!live.length) return 'cancelled';
  if (live.every((x) => x === 'published')) return 'published';
  if (live.includes('published')) return 'partial';
  if (live.includes('failed')) return 'failed';
  if (live.includes('manual')) return 'needs_manual';
  return 'draft';
}

export async function mutatePost(w: string, postId: string, fn: (p: Rec) => Rec | null): Promise<Rec | null> {
  for (let i = 0; i < 6; i++) {
    const p = await getRec(T.posts(w), postId);
    if (!p) return null;
    const changes = fn(p);
    if (!changes) return p;
    const merged = { ...p, ...changes };
    const status = (merged.targets || []).length ? derivePostStatus(merged) : changes.status || p.status;
    const rev = (p.rev ?? 0) + 1;
    const ok = await patchRec(T.posts(w), postId, { ...changes, status, rev, updatedAt: iso() }, { rev: p.rev ?? 0 });
    if (ok) return { ...merged, status, rev };
  }
  throw new Error('This post is being changed by another process. Please retry.');
}

export async function enqueue(w: string, postId: string, targets: Rec[]): Promise<void> {
  for (const t of targets) {
    const rec = { id: t.id, wsId: w, postId, runAt: Date.parse(t.scheduledAt), attempts: 0, status: 'pending' };
    const [added] = await db.tx.add(T.jobs, [rec]);
    if (!added) await patchRec(T.jobs, t.id, { runAt: rec.runAt, status: 'pending', lockedUntil: 0 });
  }
}

export async function resolveMedia(w: string, ids: string[], withUrls: boolean): Promise<MediaInfo[]> {
  if (!ids.length) return [];
  const docs = await db.get(T.media(w), ids);
  const out: MediaInfo[] = [];
  for (const m of docs) {
    if (m && !m.deletedAt) out.push({ id: m.id, type: m.kind, name: m.name, width: m.width, height: m.height, duration: m.duration, url: m.url, path: m.path });
  }
  if (withUrls) {
    const need = out.filter((m) => m.path);
    if (need.length) {
      const urls = await storage.url(need.map((m) => m.path as string));
      for (const m of need) {
        const hit = urls.find((u) => u.path === m.path);
        if (hit) m.url = hit.url;
      }
    }
  }
  return out;
}

export async function validatePost(w: string, post: Rec, platformIds: string[]): Promise<Rec[]> {
  const media = await resolveMedia(w, post.mediaIds || [], false);
  const out: Rec[] = [];
  for (const pid of platformIds) {
    const p = PLATFORMS[pid];
    if (!p) continue;
    for (const issue of validateVariant(p, mergeVariant(post, pid), media)) out.push({ platform: pid, ...issue });
  }
  return out;
}

async function runAdapter(ws: Rec, post: Rec, target: Rec): Promise<PublishResult> {
  try {
    const acc = await getRec(T.accounts(ws.id), target.accountId);
    if (!acc || acc.deletedAt) return { ok: false, retryable: false, code: 'account', message: 'The connected account was removed.' };
    const p: PlatformDef | undefined = PLATFORMS[target.platform];
    if (!p) return { ok: false, retryable: false, code: 'platform', message: 'Unknown platform.' };
    const variant = mergeVariant(post, p.id);
    const media = await resolveMedia(ws.id, post.mediaIds || [], true);
    const blocking = validateVariant(p, variant, media).filter((i) => i.level === 'error');
    if (blocking.length) return { ok: false, retryable: false, code: 'validation', message: blocking.map((i) => i.message).join(' ') };
    if (acc.mode !== 'provider') return { ok: false, manual: true, retryable: false, code: 'manual', message: 'This account is in manual mode, so ' + p.name + ' must be published by hand.' };
    const key = await providerKey();
    if (!key) return { ok: false, retryable: false, code: 'provider_missing', message: 'No publishing provider is configured. An administrator must set AYRSHARE_API_KEY.' };
    const state = acc.connection && acc.connection.state;
    if (state === 'expired' || state === 'permission_required') return { ok: false, retryable: false, code: 'auth', message: 'The connection for this account needs attention: ' + (acc.connection.message || state) };
    return await publishViaAyrshare(key, { platform: p, variant, media, text: composeText(variant), idempotencyKey: target.id });
  } catch (e) {
    return { ok: false, retryable: true, code: 'exception', message: e instanceof Error ? e.message : 'Unexpected error' };
  }
}

async function claim(job: Rec): Promise<boolean> {
  const t = Date.now();
  if (job.status === 'running') {
    if ((job.lockedUntil ?? 0) > t) return false;
    return patchRec(T.jobs, job.id, { status: 'running', lockedUntil: t + LOCK_MS }, { status: 'running', lockedUntil: job.lockedUntil });
  }
  return patchRec(T.jobs, job.id, { status: 'running', lockedUntil: t + LOCK_MS }, { status: 'pending' });
}

export async function processJob(job: Rec): Promise<void> {
  if (!(await claim(job))) return;
  const w: string = job.wsId;
  const ws = await getRec(T.workspaces, w);
  if (!ws || ws.deletedAt) {
    await delRec(T.jobs, [job.id]);
    return;
  }
  const post = await getRec(T.posts(w), job.postId);
  const target = post && (post.targets || []).find((t: Rec) => t.id === job.id);
  if (!post || post.deletedAt || !target || (target.status !== 'queued' && target.status !== 'publishing')) {
    await delRec(T.jobs, [job.id]);
    return;
  }
  if (target.externalId) {
    await delRec(T.jobs, [job.id]);
    return;
  }
  const attempt = (target.attempts ?? 0) + 1;
  await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'publishing', attempts: attempt, startedAt: iso() } : t)) }));
  const res = await runAdapter(ws, post, target);
  const label = (post.title || String(post.caption || '').slice(0, 50) || 'Untitled post') + ' on ' + target.platform;
  await logEvent(w, { postId: post.id, targetId: target.id, platform: target.platform, attempt, level: res.ok ? 'info' : 'error', message: res.message, code: res.code || 'ok' });
  if (res.ok) {
    await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'published', publishedAt: iso(), externalId: res.externalId, externalUrl: res.url, error: null, confirmedBy: 'platform' } : t)) }));
    await delRec(T.jobs, [job.id]);
    await notify(w, { type: 'published', title: 'Published', body: label, postId: post.id });
    return;
  }
  if (res.manual) {
    await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'manual', error: res.message } : t)) }));
    await delRec(T.jobs, [job.id]);
    await notify(w, { type: 'failed', level: 'warn', title: 'Manual publishing needed', body: label + ': ' + res.message, postId: post.id });
    return;
  }
  if (res.retryable && attempt < MAX_ATTEMPTS) {
    const wait = BACKOFF_MIN[Math.min(attempt - 1, BACKOFF_MIN.length - 1)] * 60000;
    await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'queued', error: res.message, nextRetryAt: iso(Date.now() + wait) } : t)) }));
    await patchRec(T.jobs, job.id, { status: 'pending', runAt: Date.now() + wait, attempts: attempt, lockedUntil: 0 });
    return;
  }
  await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'failed', failedAt: iso(), error: res.message } : t)) }));
  await delRec(T.jobs, [job.id]);
  await db.tx.add(T.jobsFailed, [{ id: target.id, wsId: w, postId: post.id, platform: target.platform, error: res.message, code: res.code || 'error', at: iso() }]);
  await notify(w, { type: 'failed', level: 'error', title: 'Publishing failed', body: label + ': ' + res.message, postId: post.id });
  if (res.code === 'auth') {
    await patchRec(T.accounts(w), target.accountId, { connection: { state: 'expired', message: res.message, checkedAt: iso() } });
    await notify(w, { type: 'expired', level: 'warn', title: 'Connection needs attention', body: target.platform + ' account: ' + res.message });
  }
}

async function pool<X>(items: X[], size: number, fn: (x: X) => Promise<void>): Promise<void> {
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const mine = items[idx++];
      try {
        await fn(mine);
      } catch (e) {
        console.error('job failed unexpectedly', e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

export async function processDue(opts: { postId?: string } = {}): Promise<{ pending: number; due: number }> {
  const jobs = await listRecs(T.jobs, 400);
  const t = Date.now();
  const due = jobs
    .filter((j) => j.runAt <= t && (j.status === 'pending' || (j.status === 'running' && (j.lockedUntil ?? 0) < t)))
    .filter((j) => !opts.postId || j.postId === opts.postId)
    .sort((a, b) => a.runAt - b.runAt)
    .slice(0, 60);
  if (!opts.postId) {
    const soon = jobs.filter((j) => j.status === 'pending' && j.runAt > t && j.runAt < t + 3600000 && !j.reminded).slice(0, 20);
    for (const j of soon) {
      if (await patchRec(T.jobs, j.id, { reminded: true }, { status: 'pending' })) await notify(j.wsId, { type: 'upcoming', title: 'A post publishes within the hour', postId: j.postId });
    }
  }
  await pool(due, 5, processJob);
  return { pending: jobs.length, due: due.length };
}

export async function evergreenTick(): Promise<number> {
  const entries = await listRecs(T.evergreen, 200);
  const t = Date.now();
  let created = 0;
  for (const e of entries.filter((x) => x.nextAt <= t).slice(0, 25)) {
    const ws = await getRec(T.workspaces, e.wsId);
    const post = ws && !ws.deletedAt ? await getRec(T.posts(e.wsId), e.postId) : null;
    const eg = post && post.evergreen;
    if (!ws || !post || post.deletedAt || !eg || !eg.enabled) {
      await delRec(T.evergreen, [e.id]);
      continue;
    }
    const later = () => patchRec(T.evergreen, e.id, { nextAt: t + DAY });
    if (eg.paused) { await later(); continue; }
    if (eg.endDate && Date.parse(eg.endDate + 'T23:59:59Z') < t) {
      await mutatePost(e.wsId, post.id, () => ({ evergreen: { ...eg, enabled: false } }));
      await delRec(T.evergreen, [e.id]);
      continue;
    }
    if ((eg.count || 0) >= (eg.maxReposts || 12)) {
      await mutatePost(e.wsId, post.id, () => ({ evergreen: { ...eg, enabled: false } }));
      await delRec(T.evergreen, [e.id]);
      await notify(e.wsId, { type: 'upcoming', title: 'Evergreen recycling finished', body: 'Reached the maximum number of reposts.', postId: post.id });
      continue;
    }
    const plan = await planFor(ws);
    if (!(plan.features && plan.features.evergreen)) { await later(); continue; }
    if (eg.lastChildId) {
      const last = await getRec(T.posts(e.wsId), eg.lastChildId);
      if (last && ['scheduled', 'publishing', 'pending_approval', 'paused'].includes(last.status)) { await later(); continue; }
    }
    const accounts: Rec[] = [];
    for (const id of eg.accountIds || []) {
      const acc = await getRec(T.accounts(e.wsId), id);
      if (acc && !acc.deletedAt) accounts.push(acc);
    }
    const usage = await getUsage(e.wsId);
    const limit = plan.limits && plan.limits.scheduledPerMonth;
    if (!accounts.length || (limit != null && usage.scheduled + accounts.length > limit)) { await later(); continue; }
    const targets = accounts.map((acc) => ({ id: uid('t'), accountId: acc.id, platform: acc.platform, handle: acc.handle, scheduledAt: iso(t), tz: ws.timezone || 'UTC', status: 'queued', attempts: 0, createdAt: iso() }));
    const child = await addRec(T.posts(e.wsId), {
      title: post.title, caption: post.caption, hashtags: post.hashtags || [], link: post.link, mediaIds: post.mediaIds || [], variants: post.variants || {}, brandId: post.brandId || null,
      thumbnailMediaId: post.thumbnailMediaId || null, targets, status: 'scheduled', rev: 0, parentId: post.id, evergreenChild: true, createdBy: post.createdBy, createdByName: 'Evergreen recycler', createdAt: iso(), updatedAt: iso(),
    }, 'p');
    await enqueue(e.wsId, child.id, targets);
    await bumpUsage(e.wsId, 'scheduled', targets.length);
    const next = new Date(t);
    if (eg.interval === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    else next.setTime(t + 7 * DAY);
    await mutatePost(e.wsId, post.id, () => ({ evergreen: { ...eg, count: (eg.count || 0) + 1, lastRepostAt: iso(t), lastChildId: child.id } }));
    await patchRec(T.evergreen, e.id, { nextAt: next.getTime() });
    created++;
  }
  return created;
}

export function nextEvergreenStart(eg: Rec, tz: string): number {
  const startMs = eg.startDate ? zonedToUtcMs(eg.startDate, eg.time || '09:00', tz) : NaN;
  const soon = Date.now() + 60000;
  return isNaN(startMs) ? soon : Math.max(startMs, soon);
}
