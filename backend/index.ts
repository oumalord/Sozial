import { router, requireAuth, requireAdminEmailAllowlist, storage, db, revokeUser } from './lib/runtime';
import type { RouterContext, RouterMiddleware, RouterResponse } from './lib/runtime';
import {
  T, ROLES, PERMS, ADMIN_EMAILS, json, error, iso, uid, ekey, getRec, addRec, patchRec, delRec, listRecs, setSystem, ensurePlans, planFor, needFeature,
  needsApproval, getUsage, bumpUsage, isValidTz, zonedToUtcMs, access, isResp, audit, act,
} from './lib/core';
import type { Rec, Access } from './lib/core';
import { PLATFORMS } from './lib/platforms';
import { integrationStatus, providerKey, verifyAyrshare, paymentsConfigured } from './lib/providers';
import { mutatePost, enqueue, processDue, evergreenTick, validatePost, notify, nextEvergreenStart } from './lib/engine';
import { overview, analytics, exportCsv, smartTimes, loadPosts } from './lib/reports';
import { runAi } from './lib/ai';

const DEFAULT_PREFS = {
  inApp: { published: true, failed: true, expired: true, upcoming: true, approval: true, storage: true, billing: true },
  email: { published: false, failed: true, expired: true, upcoming: false, approval: true, storage: false, billing: true },
  whatsapp: false,
};
const DEFAULT_SETTINGS = { postingFrequency: 3, preferredDays: [1, 3, 5], slots: ['09:00', '13:00', '18:00'] };
const ALLOWED_MIME: Rec = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
const MAX_UPLOAD_BYTES = 3200000;
const B = (ctx: RouterContext): Rec => (ctx.body && typeof ctx.body === 'object' ? (ctx.body as Rec) : {});
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const fail = (e: unknown): RouterResponse => {
  console.error('route error', e);
  return error(e instanceof Error ? e.message : 'Server error', 500);
};

type Handler = (ctx: RouterContext, a: Access) => Promise<RouterResponse>;
function W(perm: string | undefined, fn: Handler): RouterMiddleware[] {
  return [
    requireAuth(),
    async (ctx: RouterContext) => {
      const a = await access(ctx, perm);
      if (isResp(a)) return a;
      try {
        return await fn(ctx, a);
      } catch (e) {
        return fail(e);
      }
    },
  ];
}
function U(fn: (ctx: RouterContext) => Promise<RouterResponse>): RouterMiddleware[] {
  return [
    requireAuth(),
    async (ctx: RouterContext) => {
      try {
        return await fn(ctx);
      } catch (e) {
        return fail(e);
      }
    },
  ];
}
function ADM(fn: (ctx: RouterContext) => Promise<RouterResponse>): RouterMiddleware[] {
  return [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx: RouterContext) => {
      try {
        return await fn(ctx);
      } catch (e) {
        return fail(e);
      }
    },
  ];
}

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => String(t).split('#').join('').split(' ').join('').slice(0, 60)).filter(Boolean).slice(0, 60);
}

function cleanVariant(v: unknown): Rec {
  if (!v || typeof v !== 'object') return {};
  const x = v as Rec;
  const o: Rec = {};
  for (const k of ['caption', 'title', 'description', 'link', 'format', 'tags']) if (typeof x[k] === 'string') o[k] = x[k].slice(0, 10000);
  if (Array.isArray(x.hashtags)) o.hashtags = cleanTags(x.hashtags);
  if (x.opts && typeof x.opts === 'object') {
    o.opts = {};
    for (const [k, val] of Object.entries(x.opts as Rec)) {
      if (typeof val === 'string') o.opts[k.slice(0, 40)] = val.slice(0, 200);
      else if (typeof val === 'boolean') o.opts[k.slice(0, 40)] = val;
    }
  }
  return o;
}

async function cleanPost(b: Rec, w: string): Promise<Rec> {
  const o: Rec = {};
  if ('title' in b) o.title = str(b.title, 200);
  if ('caption' in b) o.caption = str(b.caption, 10000);
  if ('hashtags' in b) o.hashtags = cleanTags(b.hashtags);
  if ('link' in b) o.link = str(b.link, 500);
  if ('altText' in b) o.altText = str(b.altText, 1000);
  if ('brandId' in b) o.brandId = str(b.brandId, 60) || null;
  if ('campaignId' in b) o.campaignId = str(b.campaignId, 60) || null;
  if ('thumbnailMediaId' in b) o.thumbnailMediaId = str(b.thumbnailMediaId, 60) || null;
  if ('isTemplate' in b) o.isTemplate = !!b.isTemplate;
  if ('mediaIds' in b) {
    const ids: string[] = Array.isArray(b.mediaIds) ? b.mediaIds.map(String).slice(0, 20) : [];
    const docs = ids.length ? await db.get(T.media(w), ids) : [];
    o.mediaIds = ids.filter((_id, i) => docs[i] && !docs[i]!.deletedAt);
  }
  if ('variants' in b && b.variants && typeof b.variants === 'object') {
    o.variants = {};
    for (const pid of Object.keys(PLATFORMS)) if ((b.variants as Rec)[pid]) o.variants[pid] = cleanVariant((b.variants as Rec)[pid]);
  }
  return o;
}

function publicWs(ws: Rec, role: string, plan: Rec): Rec {
  return {
    id: ws.id, name: ws.name, type: ws.type, timezone: ws.timezone, role, approvalPolicy: ws.approvalPolicy || 'creators',
    settings: ws.settings || DEFAULT_SETTINGS, onboardingDone: !!ws.onboardingDone, storageBytes: ws.storageBytes || 0, createdAt: ws.createdAt,
    trial: ws.trial || null, trialUsed: !!ws.trialUsed, plan: { id: plan.id, name: plan.name, limits: plan.limits, features: plan.features },
  };
}

async function publicPlans(): Promise<Rec[]> {
  await ensurePlans();
  return (await listRecs(T.plans, 20)).filter((p) => p.active).sort((x, y) => x.sort - y.sort);
}

function range(ctx: RouterContext): { from: number; to: number } {
  const to = Number(ctx.query.to) || Date.now();
  const from = Number(ctx.query.from) || to - 30 * 86400000;
  return { from, to };
}

async function holdForApproval(w: string, post: Rec): Promise<void> {
  const queued = (post.targets || []).filter((t: Rec) => t.status === 'queued');
  if (!queued.length) return;
  await delRec(T.jobs, queued.map((t: Rec) => t.id));
  await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.status === 'queued' ? { ...t, status: 'awaiting_approval' } : t)), approval: { status: 'pending', at: iso() } }));
}

async function scheduleTargets(a: Access, post: Rec, reqTargets: Rec[], mode: string, tz: string): Promise<RouterResponse> {
  const w = a.ws.id;
  if (!reqTargets.length) return error('Select at least one account.', 400);
  const ids = reqTargets.map((t) => String(t.accountId));
  if (new Set(ids).size !== ids.length) return error('Each account can only be selected once.', 400);
  const accDocs = await db.get(T.accounts(w), ids);
  const accs: Rec[] = [];
  for (let i = 0; i < ids.length; i++) {
    const acc = accDocs[i];
    if (!acc || acc.deletedAt) return error('One of the selected accounts no longer exists.', 400);
    accs.push(acc);
  }
  const now = Date.now();
  const times: number[] = [];
  for (const t of reqTargets) {
    if (mode === 'now') { times.push(now); continue; }
    const ms = zonedToUtcMs(str(t.date, 10), str(t.time, 5), isValidTz(t.tz) ? t.tz : tz);
    if (isNaN(ms)) return error('Choose a valid date and time.', 400);
    if (ms < now - 60000) return error('The scheduled time is in the past. Pick a future time or use Publish now.', 400);
    times.push(Math.max(ms, now));
  }
  const issues = (await validatePost(w, post, accs.map((x) => x.platform))).filter((i) => i.level === 'error');
  if (issues.length) return json({ error: 'Fix the highlighted problems before scheduling.', issues }, 422);
  const usage = await getUsage(w);
  const limit = a.plan.limits && a.plan.limits.scheduledPerMonth;
  if (limit != null && usage.scheduled + accs.length > limit) return json({ error: 'Monthly scheduling limit reached (' + usage.scheduled + ' of ' + limit + ' on the ' + a.plan.name + ' plan).', upgrade: true }, 402);
  const approval = needsApproval(a.ws, a.role, a.plan);
  const fresh = accs.map((acc, i) => ({ id: uid('t'), accountId: acc.id, platform: acc.platform, handle: acc.handle, scheduledAt: iso(times[i]), tz: isValidTz(reqTargets[i].tz) ? reqTargets[i].tz : tz, status: approval ? 'awaiting_approval' : 'queued', attempts: 0, createdAt: iso() }));
  const drop = (post.targets || []).filter((t: Rec) => t.status !== 'published');
  await delRec(T.jobs, drop.map((t: Rec) => t.id));
  await mutatePost(w, post.id, (p) => ({
    targets: [...(p.targets || []).filter((t: Rec) => t.status === 'published'), ...fresh],
    approval: approval ? { status: 'pending', requestedBy: a.name, at: iso() } : { status: 'not_required' },
  }));
  await bumpUsage(w, 'scheduled', fresh.length);
  const label = post.title || String(post.caption || '').slice(0, 50) || 'Untitled post';
  if (approval) {
    await notify(w, { type: 'approval', title: 'Post awaiting approval', body: label + ' was submitted by ' + a.name, postId: post.id });
    await act(a, 'submitted "' + label + '" for approval');
  } else {
    await enqueue(w, post.id, fresh);
    await act(a, (mode === 'now' ? 'queued for immediate publishing: ' : 'scheduled: ') + label);
    if (mode === 'now') await processDue({ postId: post.id });
  }
  return json({ post: await getRec(T.posts(w), post.id), approval });
}

const routes: Record<string, RouterMiddleware[]> = {
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  // ---------- session ----------
  'GET /api/bootstrap': U(async (ctx) => {
    const u = ctx.user!;
    const email = (u.email || '').toLowerCase();
    let profile = await getRec(T.profiles, u.userId);
    if (!profile) profile = await addRec(T.profiles, { id: u.userId, email, name: u.name || email.split('@')[0] || 'Member', timezone: 'UTC', prefs: DEFAULT_PREFS, createdAt: iso() }, 'u');
    if (email) {
      for (const inv of await listRecs(T.inv(email), 50)) {
        const ws = await getRec(T.workspaces, inv.wsId);
        if (ws && !ws.deletedAt) {
          await db.tx.add(T.mem(u.userId), [{ id: ws.id, wsId: ws.id, role: inv.role }]);
          await db.tx.add(T.members(ws.id), [{ id: u.userId, userId: u.userId, email, name: profile.name, role: inv.role, status: 'active', joinedAt: iso() }]);
          await delRec(T.wsinv(ws.id), [ekey(email)]);
        }
        await delRec(T.inv(email), [inv.id]);
      }
    }
    const mems = await listRecs(T.mem(u.userId), 100);
    const docs = mems.length ? await db.get(T.workspaces, mems.map((m) => m.id)) : [];
    const workspaces: Rec[] = [];
    for (let i = 0; i < mems.length; i++) {
      const ws = docs[i];
      if (!ws || ws.deletedAt) continue;
      workspaces.push(publicWs(ws, mems[i].role, await planFor(ws)));
    }
    const status = await integrationStatus();
    return json({
      user: { id: u.userId, email, name: profile.name },
      profile: { name: profile.name, timezone: profile.timezone, prefs: profile.prefs || DEFAULT_PREFS },
      workspaces,
      isAdmin: ADMIN_EMAILS.includes(email),
      meta: { platforms: PLATFORMS, perms: PERMS, roles: ROLES, plans: await publicPlans(), providers: status.providers, payments: status.payments },
    });
  }),
  'PUT /api/profile': U(async (ctx) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    if ('name' in b) rec.name = str(b.name, 80) || 'Member';
    if (isValidTz(b.timezone)) rec.timezone = b.timezone;
    if (b.prefs && typeof b.prefs === 'object') rec.prefs = { inApp: { ...DEFAULT_PREFS.inApp, ...((b.prefs as Rec).inApp || {}) }, email: { ...DEFAULT_PREFS.email, ...((b.prefs as Rec).email || {}) }, whatsapp: false };
    await patchRec(T.profiles, ctx.user!.userId, rec);
    return json({ ok: true });
  }),
  'DELETE /api/profile': U(async (ctx) => {
    const u = ctx.user!;
    for (const m of await listRecs(T.mem(u.userId), 100)) {
      const members = await listRecs(T.members(m.id), 5);
      if (m.role === 'owner' && members.filter((x) => x.id !== u.userId).length === 0) await patchRec(T.workspaces, m.id, { deletedAt: iso() });
      await delRec(T.members(m.id), [u.userId]);
      await delRec(T.mem(u.userId), [m.id]);
    }
    await delRec(T.profiles, [u.userId]);
    await audit(ctx, null, 'account.deleted');
    await revokeUser((u.email || '').toLowerCase());
    return json({ ok: true });
  }),
  'GET /api/integrations': U(async () => json({ ...(await integrationStatus()), platforms: PLATFORMS })),

  // ---------- workspaces ----------
  'POST /api/workspaces': U(async (ctx) => {
    const u = ctx.user!;
    const b = B(ctx);
    const name = str(b.name, 80).trim();
    if (!name) return error('Give the workspace a name.', 400);
    const mems = await listRecs(T.mem(u.userId), 100);
    const owned = mems.filter((m) => m.role === 'owner');
    if (owned.length) {
      const docs = await db.get(T.workspaces, owned.map((m) => m.id));
      let multi = false;
      for (const d of docs) if (d && !d.deletedAt && (await planFor(d)).features.multiWorkspace) multi = true;
      const alive = docs.filter((d) => d && !d.deletedAt).length;
      if (alive >= 1 && !multi) return json({ error: 'Your plan includes one workspace. The Agency plan supports multiple client workspaces.', upgrade: true }, 402);
    }
    const profile = await getRec(T.profiles, u.userId);
    const id = uid('w');
    const ws = await addRec(T.workspaces, { id, name, type: ['creator', 'business', 'agency', 'manager'].includes(b.type) ? b.type : 'creator', timezone: isValidTz(b.timezone) ? b.timezone : (profile && profile.timezone) || 'UTC', ownerId: u.userId, planId: 'free', approvalPolicy: 'creators', settings: DEFAULT_SETTINGS, onboardingDone: false, storageBytes: 0, createdAt: iso() }, 'w');
    await db.tx.add(T.mem(u.userId), [{ id, wsId: id, role: 'owner' }]);
    await db.tx.add(T.members(id), [{ id: u.userId, userId: u.userId, email: (u.email || '').toLowerCase(), name: (profile && profile.name) || u.name || 'Owner', role: 'owner', status: 'active', joinedAt: iso() }]);
    await db.tx.add(T.brands(id), [{ id: 'main', name: name, color: '#2563eb', createdAt: iso() }]);
    await audit(ctx, id, 'workspace.created', { name });
    return json({ workspace: publicWs(ws, 'owner', await planFor(ws)) }, 201);
  }),
  'PUT /api/w/:w': W('settings.manage', async (ctx, a) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    if ('name' in b) rec.name = str(b.name, 80).trim() || a.ws.name;
    if (['creator', 'business', 'agency', 'manager'].includes(b.type)) rec.type = b.type;
    if (isValidTz(b.timezone)) rec.timezone = b.timezone;
    if ('onboardingDone' in b) rec.onboardingDone = !!b.onboardingDone;
    if (b.approvalPolicy === 'everyone' || b.approvalPolicy === 'creators') {
      if (b.approvalPolicy === 'everyone') {
        const blocked = needFeature(a.plan, 'approvals');
        if (blocked) return blocked;
      }
      rec.approvalPolicy = b.approvalPolicy;
    }
    if (b.settings && typeof b.settings === 'object') {
      const s = b.settings as Rec;
      const cur: Rec = a.ws.settings || DEFAULT_SETTINGS;
      rec.settings = {
        postingFrequency: Math.min(50, Math.max(1, Number(s.postingFrequency) || cur.postingFrequency)),
        preferredDays: Array.isArray(s.preferredDays) ? s.preferredDays.map(Number).filter((d: number) => d >= 0 && d <= 6) : cur.preferredDays,
        slots: Array.isArray(s.slots) ? s.slots.map(String).filter((x: string) => x.length === 5 && x.includes(':')).slice(0, 8) : cur.slots,
      };
    }
    await patchRec(T.workspaces, a.ws.id, rec);
    const ws = await getRec(T.workspaces, a.ws.id);
    await audit(ctx, a.ws.id, 'workspace.updated');
    return json({ workspace: publicWs(ws!, a.role, a.plan) });
  }),
  'DELETE /api/w/:w': W('ws.delete', async (ctx, a) => {
    await patchRec(T.workspaces, a.ws.id, { deletedAt: iso() });
    await audit(ctx, a.ws.id, 'workspace.deleted');
    return json({ ok: true });
  }),

  // ---------- overview, analytics, exports ----------
  'GET /api/w/:w/overview': W(undefined, async (ctx, a) => {
    const r = range(ctx);
    return json(await overview(a, r.from, r.to));
  }),
  'GET /api/w/:w/analytics': W(undefined, async (ctx, a) => {
    const r = range(ctx);
    return json(await analytics(a, r.from, r.to));
  }),
  'GET /api/w/:w/export': W(undefined, async (_ctx, a) => {
    const blocked = needFeature(a.plan, 'exports');
    if (blocked) return blocked;
    return json({ csv: await exportCsv(a), filename: 'socialflow-publishing-report.csv' });
  }),
  'GET /api/w/:w/smart-times': W(undefined, async (ctx, a) => json(await smartTimes(a, str(ctx.query.platform, 20), Math.min(12, Number(ctx.query.count) || 6)))),

  // ---------- brands & accounts ----------
  'GET /api/w/:w/brands': W(undefined, async (_ctx, a) => json({ brands: await listRecs(T.brands(a.ws.id), 100) })),
  'POST /api/w/:w/brands': W('accounts.manage', async (ctx, a) => {
    const b = B(ctx);
    const name = str(b.name, 60).trim();
    if (!name) return error('Give the brand a name.', 400);
    const brand = await addRec(T.brands(a.ws.id), { name, color: str(b.color, 9) || '#2563eb', createdAt: iso() }, 'b');
    return json({ brand }, 201);
  }),
  'DELETE /api/w/:w/brands/:id': W('accounts.manage', async (ctx, a) => {
    await delRec(T.brands(a.ws.id), [ctx.params.id]);
    return json({ ok: true });
  }),
  'GET /api/w/:w/accounts': W(undefined, async (_ctx, a) => {
    const keyOk = !!(await providerKey());
    const list = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt).map((x) => {
      let connection: Rec;
      if (x.mode !== 'provider') connection = { state: 'publishing_unavailable', message: 'Manual mode: SocialFlow reminds you and you publish by hand.' };
      else if (!keyOk) connection = { state: 'pending_approval', message: 'No publishing provider is configured yet (AYRSHARE_API_KEY).' };
      else connection = x.connection || { state: 'disconnected', message: 'Not verified yet. Run Verify connection.' };
      return { ...x, connection };
    });
    return json({ accounts: list, limit: a.plan.limits.accounts });
  }),
  'POST /api/w/:w/accounts': W('accounts.manage', async (ctx, a) => {
    const b = B(ctx);
    if (!PLATFORMS[b.platform]) return error('Choose a supported platform.', 400);
    const handle = str(b.handle, 100).trim();
    if (!handle) return error('Enter the account handle or page name.', 400);
    const live = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt);
    const cap = a.plan.limits.accounts;
    if (cap != null && live.length >= cap) return json({ error: 'The ' + a.plan.name + ' plan allows ' + cap + ' connected accounts.', upgrade: true }, 402);
    const acc = await addRec(T.accounts(a.ws.id), { platform: b.platform, handle, displayName: str(b.displayName, 100).trim() || handle, mode: b.mode === 'provider' ? 'provider' : 'manual', brandId: str(b.brandId, 60) || 'main', createdAt: iso() }, 'a');
    await act(a, 'added ' + PLATFORMS[b.platform].name + ' account ' + handle);
    return json({ account: acc }, 201);
  }),
  'PUT /api/w/:w/accounts/:id': W('accounts.manage', async (ctx, a) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    if ('displayName' in b) rec.displayName = str(b.displayName, 100);
    if ('brandId' in b) rec.brandId = str(b.brandId, 60) || 'main';
    if (b.mode === 'provider' || b.mode === 'manual') rec.mode = b.mode;
    await patchRec(T.accounts(a.ws.id), ctx.params.id, rec);
    return json({ ok: true });
  }),
  'DELETE /api/w/:w/accounts/:id': W('accounts.manage', async (ctx, a) => {
    await patchRec(T.accounts(a.ws.id), ctx.params.id, { deletedAt: iso() });
    await act(a, 'removed a social account');
    return json({ ok: true });
  }),
  'POST /api/w/:w/accounts/:id/verify': W('accounts.manage', async (ctx, a) => {
    const acc = await getRec(T.accounts(a.ws.id), ctx.params.id);
    if (!acc || acc.deletedAt) return error('Account not found', 404);
    if (acc.mode !== 'provider') return error('Manual accounts have no connection to verify.', 400);
    const key = await providerKey();
    if (!key) return json({ error: 'No publishing provider is configured. An administrator must set AYRSHARE_API_KEY.' }, 409);
    const res = await verifyAyrshare(key, PLATFORMS[acc.platform].ayrshareId);
    const connection = { ...res, checkedAt: iso() };
    await patchRec(T.accounts(a.ws.id), acc.id, { connection });
    if (res.state === 'expired') await notify(a.ws.id, { type: 'expired', level: 'warn', title: 'Connection needs attention', body: acc.handle + ': ' + res.message });
    return json({ connection });
  }),

  // ---------- media ----------
  'GET /api/w/:w/media': W(undefined, async (_ctx, a) => {
    const w = a.ws.id;
    const items = (await listRecs(T.media(w), 300)).filter((m) => !m.deletedAt).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const folders = await listRecs(T.folders(w), 100);
    const shown = items.slice(0, 120);
    const paths = shown.filter((m) => m.path).map((m) => m.path as string);
    const urls: Rec = {};
    for (let i = 0; i < paths.length; i += 40) {
      for (const u of await storage.url(paths.slice(i, i + 40))) urls[u.path] = u.url;
    }
    const used = items.reduce((n, m) => n + (m.size || 0), 0);
    return json({ items: shown.map((m) => ({ ...m, url: m.path ? urls[m.path] : m.url })), folders, usedBytes: used, limitBytes: (a.plan.limits.storageMb || 0) * 1048576 });
  }),
  'POST /api/w/:w/media': W('media.write', async (ctx, a) => {
    const w = a.ws.id;
    const b = B(ctx);
    const ext = ALLOWED_MIME[String(b.mime)];
    if (!ext) return error('Unsupported file type. Use JPEG, PNG, WebP, MP4 or MOV.', 400);
    const data = str(b.data, 6000000);
    if (!data) return error('The file is empty.', 400);
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes > MAX_UPLOAD_BYTES) return error('Direct upload is limited to 3.2 MB. For larger videos use Add by URL.', 413);
    const usage = (await listRecs(T.media(w), 500)).filter((m) => !m.deletedAt).reduce((n, m) => n + (m.size || 0), 0);
    const cap = (a.plan.limits.storageMb || 0) * 1048576;
    if (cap && usage + bytes > cap) {
      await notify(w, { type: 'storage', level: 'warn', title: 'Storage limit reached', body: 'Upgrade or delete files to upload more.' });
      return json({ error: 'Not enough storage left on the ' + a.plan.name + ' plan.', upgrade: true }, 402);
    }
    const id = uid('m');
    const path = 'ws/' + w + '/media/' + id + '.' + ext;
    const [uploaded] = await storage.write([{ path, content: data, contentType: b.mime }]);
    if (!uploaded) return error('Upload failed. Please try again.', 502);
    const media = await addRec(T.media(w), { id, name: str(b.name, 160) || id + '.' + ext, kind: String(b.mime).startsWith('video') ? 'video' : 'image', mime: b.mime, size: bytes, path, url: uploaded.url, width: Number(b.width) || null, height: Number(b.height) || null, duration: Number(b.duration) || null, folderId: str(b.folderId, 60) || null, tags: [], createdBy: a.userId, createdAt: iso() }, 'm');
    await patchRec(T.workspaces, w, { storageBytes: usage + bytes });
    return json({ media }, 201);
  }),
  'POST /api/w/:w/media/link': W('media.write', async (ctx, a) => {
    const b = B(ctx);
    const url = str(b.url, 1000).trim();
    if (!url.startsWith('https://')) return error('Enter a public https:// link to an image or video file.', 400);
    const kind = b.kind === 'video' ? 'video' : 'image';
    const media = await addRec(T.media(a.ws.id), { name: str(b.name, 160) || url.split('/').pop() || 'linked-media', kind, mime: kind + '/external', size: 0, url, external: true, folderId: str(b.folderId, 60) || null, tags: [], createdBy: a.userId, createdAt: iso() }, 'm');
    return json({ media }, 201);
  }),
  'PUT /api/w/:w/media/:id': W('media.write', async (ctx, a) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    if ('name' in b) rec.name = str(b.name, 160) || 'Untitled';
    if ('folderId' in b) rec.folderId = str(b.folderId, 60) || null;
    if (Array.isArray(b.tags)) rec.tags = cleanTags(b.tags).slice(0, 20);
    await patchRec(T.media(a.ws.id), ctx.params.id, rec);
    return json({ ok: true });
  }),
  'DELETE /api/w/:w/media/:id': W('post.delete', async (ctx, a) => {
    const m = await getRec(T.media(a.ws.id), ctx.params.id);
    if (!m) return json({ ok: true });
    if (m.path) await storage.delete([m.path]);
    await patchRec(T.media(a.ws.id), m.id, { deletedAt: iso() });
    await patchRec(T.workspaces, a.ws.id, { storageBytes: Math.max(0, (a.ws.storageBytes || 0) - (m.size || 0)) });
    return json({ ok: true });
  }),
  'POST /api/w/:w/folders': W('media.write', async (ctx, a) => {
    const name = str(B(ctx).name, 60).trim();
    if (!name) return error('Give the folder a name.', 400);
    return json({ folder: await addRec(T.folders(a.ws.id), { name, createdAt: iso() }, 'f') }, 201);
  }),
  'DELETE /api/w/:w/folders/:id': W('media.write', async (ctx, a) => {
    await delRec(T.folders(a.ws.id), [ctx.params.id]);
    for (const m of await listRecs(T.media(a.ws.id), 300)) if (m.folderId === ctx.params.id) await patchRec(T.media(a.ws.id), m.id, { folderId: null });
    return json({ ok: true });
  }),

  // ---------- notifications & activity ----------
  'GET /api/w/:w/notifications': W(undefined, async (_ctx, a) => {
    const profile = await getRec(T.profiles, a.userId);
    const prefs: Rec = (profile && profile.prefs && profile.prefs.inApp) || DEFAULT_PREFS.inApp;
    const all = (await listRecs(T.notifs(a.ws.id), 150)).filter((n) => prefs[n.type] !== false).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 40);
    return json({ items: all.map((n) => ({ ...n, read: (n.readBy || []).includes(a.userId) })) });
  }),
  'POST /api/w/:w/notifications/read': W(undefined, async (_ctx, a) => {
    for (const n of await listRecs(T.notifs(a.ws.id), 150)) if (!(n.readBy || []).includes(a.userId)) await patchRec(T.notifs(a.ws.id), n.id, { readBy: [...(n.readBy || []), a.userId] });
    return json({ ok: true });
  }),
  'GET /api/w/:w/activity': W(undefined, async (_ctx, a) => json({ items: (await listRecs(T.activity(a.ws.id), 150)).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 50) })),

  // ---------- posts ----------
  'GET /api/w/:w/posts': W(undefined, async (ctx, a) => {
    let posts = await loadPosts(a.ws.id);
    const q = ctx.query;
    if (q.templates === '1') posts = posts.filter((p) => p.isTemplate);
    else posts = posts.filter((p) => !p.isTemplate);
    if (q.status) posts = posts.filter((p) => p.status === q.status);
    if (q.brandId) posts = posts.filter((p) => p.brandId === q.brandId);
    if (q.campaignId) posts = posts.filter((p) => p.campaignId === q.campaignId);
    posts.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    return json({ posts: posts.slice(0, 300) });
  }),
  'POST /api/w/:w/posts': W('post.write', async (ctx, a) => {
    const b = B(ctx);
    const clean = await cleanPost(b, a.ws.id);
    const post = await addRec(T.posts(a.ws.id), { title: '', caption: '', hashtags: [], link: '', mediaIds: [], variants: {}, targets: [], revisions: [], ...clean, status: 'draft', rev: 0, createdBy: a.userId, createdByName: a.name, createdAt: iso(), updatedAt: iso() }, 'p');
    await act(a, 'created a ' + (post.isTemplate ? 'template' : 'draft') + (post.title ? ': ' + post.title : ''));
    return json({ post }, 201);
  }),
  'GET /api/w/:w/posts/:id': W(undefined, async (ctx, a) => {
    const post = await getRec(T.posts(a.ws.id), ctx.params.id);
    if (!post || post.deletedAt) return error('Post not found', 404);
    return json({ post });
  }),
  'PUT /api/w/:w/posts/:id': W('post.write', async (ctx, a) => {
    const w = a.ws.id;
    const before = await getRec(T.posts(w), ctx.params.id);
    if (!before || before.deletedAt) return error('Post not found', 404);
    if (before.status === 'publishing') return error('This post is publishing right now. Try again in a moment.', 409);
    const clean = await cleanPost(B(ctx), w);
    const hadQueued = (before.targets || []).some((t: Rec) => t.status === 'queued');
    const changedContent = ['caption', 'mediaIds', 'title', 'hashtags', 'variants', 'link'].some((k) => k in clean && JSON.stringify(clean[k]) !== JSON.stringify(before[k]));
    const rev = { at: iso(), by: a.name, caption: String(before.caption || '').slice(0, 300), title: before.title || '' };
    const post = await mutatePost(w, before.id, (p) => ({ ...clean, revisions: [...(p.revisions || []), rev].slice(-20) }));
    if (hadQueued && changedContent && needsApproval(a.ws, a.role, a.plan)) {
      await holdForApproval(w, post!);
      await notify(w, { type: 'approval', title: 'Edited post needs re-approval', body: (before.title || 'A post') + ' was changed by ' + a.name, postId: before.id });
    }
    return json({ post: await getRec(T.posts(w), before.id) });
  }),
  'DELETE /api/w/:w/posts/:id': W('post.delete', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return json({ ok: true });
    if (post.status === 'publishing') return error('This post is publishing right now.', 409);
    await delRec(T.jobs, (post.targets || []).map((t: Rec) => t.id));
    await patchRec(T.posts(w), post.id, { deletedAt: iso(), status: 'cancelled' });
    await delRec(T.evergreen, [post.id]);
    await act(a, 'deleted a post');
    return json({ ok: true });
  }),
  'POST /api/w/:w/posts/:id/duplicate': W('post.write', async (ctx, a) => {
    const src = await getRec(T.posts(a.ws.id), ctx.params.id);
    if (!src || src.deletedAt) return error('Post not found', 404);
    const post = await addRec(T.posts(a.ws.id), { title: (src.title || 'Untitled') + ' (copy)', caption: src.caption, hashtags: src.hashtags || [], link: src.link, mediaIds: src.mediaIds || [], variants: src.variants || {}, brandId: src.brandId || null, campaignId: src.campaignId || null, thumbnailMediaId: src.thumbnailMediaId || null, isTemplate: false, targets: [], revisions: [], status: 'draft', rev: 0, createdBy: a.userId, createdByName: a.name, createdAt: iso(), updatedAt: iso() }, 'p');
    return json({ post }, 201);
  }),
  'POST /api/w/:w/posts/validate': W(undefined, async (ctx, a) => {
    const b = B(ctx);
    const draft = { ...(await cleanPost(b, a.ws.id)), caption: str(b.caption, 10000) };
    const ids: string[] = Array.isArray(b.platforms) ? b.platforms.map(String) : [];
    return json({ issues: await validatePost(a.ws.id, draft, ids) });
  }),
  'POST /api/w/:w/posts/:id/schedule': W('post.schedule', async (ctx, a) => {
    const b = B(ctx);
    const post = await getRec(T.posts(a.ws.id), ctx.params.id);
    if (!post || post.deletedAt) return error('Post not found', 404);
    const tz = isValidTz(b.tz) ? b.tz : a.ws.timezone || 'UTC';
    return scheduleTargets(a, post, Array.isArray(b.targets) ? b.targets : [], b.mode === 'now' ? 'now' : 'schedule', tz);
  }),
  'POST /api/w/:w/posts/:id/approve': W('post.approve', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post || post.deletedAt) return error('Post not found', 404);
    const waiting = (post.targets || []).filter((t: Rec) => t.status === 'awaiting_approval');
    if (!waiting.length) return error('Nothing is awaiting approval on this post.', 409);
    await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.status === 'awaiting_approval' ? { ...t, status: 'queued' } : t)), approval: { status: 'approved', by: a.name, at: iso() } }));
    await enqueue(w, post.id, waiting);
    await act(a, 'approved ' + (post.title || 'a post'));
    await notify(w, { type: 'approval', title: 'Post approved', body: (post.title || 'A post') + ' was approved by ' + a.name, postId: post.id });
    return json({ post: await getRec(T.posts(w), post.id) });
  }),
  'POST /api/w/:w/posts/:id/reject': W('post.approve', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post || post.deletedAt) return error('Post not found', 404);
    const note = str(B(ctx).note, 500);
    await mutatePost(w, post.id, (p) => ({ targets: (p.targets || []).filter((t: Rec) => t.status === 'published'), status: 'draft', approval: { status: 'changes_requested', by: a.name, note, at: iso() } }));
    await addRec(T.comments(w), { postId: post.id, userId: a.userId, name: a.name, text: 'Changes requested: ' + (note || 'see post'), at: iso() }, 'c');
    await act(a, 'requested changes on ' + (post.title || 'a post'));
    await notify(w, { type: 'approval', level: 'warn', title: 'Changes requested', body: (post.title || 'A post') + ': ' + (note || 'please revise'), postId: post.id });
    return json({ post: await getRec(T.posts(w), post.id) });
  }),
  'POST /api/w/:w/posts/:id/cancel': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const open = (post.targets || []).filter((t: Rec) => ['queued', 'paused', 'awaiting_approval', 'manual', 'failed'].includes(t.status));
    await delRec(T.jobs, open.map((t: Rec) => t.id));
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (open.some((o: Rec) => o.id === t.id) ? { ...t, status: 'cancelled' } : t)) }));
    await act(a, 'cancelled ' + (post.title || 'a scheduled post'));
    return json({ post: updated });
  }),
  'POST /api/w/:w/posts/:id/pause': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const queued = (post.targets || []).filter((t: Rec) => t.status === 'queued');
    await delRec(T.jobs, queued.map((t: Rec) => t.id));
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.status === 'queued' ? { ...t, status: 'paused' } : t)) }));
    return json({ post: updated });
  }),
  'POST /api/w/:w/posts/:id/resume': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const paused = (post.targets || []).filter((t: Rec) => t.status === 'paused');
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.status === 'paused' ? { ...t, status: 'queued' } : t)) }));
    await enqueue(w, post.id, paused);
    return json({ post: updated });
  }),
  'POST /api/w/:w/posts/:id/reschedule': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const b = B(ctx);
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const target = (post.targets || []).find((t: Rec) => t.id === b.targetId);
    if (!target || !['queued', 'paused', 'awaiting_approval'].includes(target.status)) return error('Only scheduled posts can be moved.', 409);
    const tz = isValidTz(b.tz) ? b.tz : target.tz || a.ws.timezone || 'UTC';
    const ms = zonedToUtcMs(str(b.date, 10), str(b.time, 5), tz);
    if (isNaN(ms)) return error('Choose a valid date and time.', 400);
    if (ms < Date.now() - 60000) return error('That time is in the past.', 400);
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, scheduledAt: iso(ms), tz } : t)) }));
    if (target.status === 'queued') await patchRec(T.jobs, target.id, { runAt: ms, status: 'pending', lockedUntil: 0, reminded: false });
    await act(a, 'rescheduled ' + (post.title || 'a post'));
    return json({ post: updated });
  }),
  'POST /api/w/:w/posts/:id/retry': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const b = B(ctx);
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const target = (post.targets || []).find((t: Rec) => t.id === b.targetId);
    if (!target || !['failed', 'manual'].includes(target.status)) return error('Only failed or manual publications can be retried.', 409);
    const when = iso();
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'queued', attempts: 0, error: null, scheduledAt: when } : t)) }));
    await enqueue(w, post.id, [{ ...target, scheduledAt: when }]);
    await delRec(T.jobsFailed, [target.id]);
    await processDue({ postId: post.id });
    return json({ post: (await getRec(T.posts(w), post.id)) || updated });
  }),
  'POST /api/w/:w/posts/:id/mark-published': W('post.schedule', async (ctx, a) => {
    const w = a.ws.id;
    const b = B(ctx);
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post) return error('Post not found', 404);
    const target = (post.targets || []).find((t: Rec) => t.id === b.targetId);
    if (!target || !['manual', 'failed'].includes(target.status)) return error('This publication is not waiting for manual confirmation.', 409);
    const updated = await mutatePost(w, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === target.id ? { ...t, status: 'published', publishedAt: iso(), externalUrl: str(b.url, 500) || null, error: null, confirmedBy: 'user' } : t)) }));
    await delRec(T.jobsFailed, [target.id]);
    await act(a, 'confirmed manual publishing of ' + (post.title || 'a post'));
    return json({ post: updated });
  }),
  'GET /api/w/:w/posts/:id/logs': W(undefined, async (ctx, a) => json({ items: (await listRecs(T.logs(a.ws.id), 200)).filter((l) => l.postId === ctx.params.id).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 40) })),
  'GET /api/w/:w/posts/:id/comments': W(undefined, async (ctx, a) => json({ items: (await listRecs(T.comments(a.ws.id), 200)).filter((c) => c.postId === ctx.params.id).sort((x, y) => String(x.at).localeCompare(String(y.at))) })),
  'POST /api/w/:w/posts/:id/comments': W('comment', async (ctx, a) => {
    const text = str(B(ctx).text, 1000).trim();
    if (!text) return error('Write a comment first.', 400);
    const c = await addRec(T.comments(a.ws.id), { postId: ctx.params.id, userId: a.userId, name: a.name, text, at: iso() }, 'c');
    return json({ comment: c }, 201);
  }),
  'PUT /api/w/:w/posts/:id/evergreen': W('post.write', async (ctx, a) => {
    const blocked = needFeature(a.plan, 'evergreen');
    if (blocked) return blocked;
    const w = a.ws.id;
    const b = B(ctx);
    const post = await getRec(T.posts(w), ctx.params.id);
    if (!post || post.deletedAt) return error('Post not found', 404);
    const old: Rec = post.evergreen || {};
    const accountIds: string[] = Array.isArray(b.accountIds) ? b.accountIds.map(String).slice(0, 20) : old.accountIds || [];
    const eg: Rec = {
      enabled: !!b.enabled, interval: b.interval === 'monthly' ? 'monthly' : 'weekly', startDate: str(b.startDate, 10), endDate: str(b.endDate, 10), time: str(b.time, 5) || '09:00',
      maxReposts: Math.min(100, Math.max(1, Number(b.maxReposts) || 12)), paused: !!b.paused, accountIds, count: old.count || 0, lastRepostAt: old.lastRepostAt || null, lastChildId: old.lastChildId || null,
    };
    if (eg.enabled && !accountIds.length) return error('Choose at least one account to recycle to.', 400);
    await mutatePost(w, post.id, () => ({ evergreen: eg }));
    if (eg.enabled) {
      const nextAt = nextEvergreenStart(eg, a.ws.timezone || 'UTC');
      const [added] = await db.tx.add(T.evergreen, [{ id: post.id, wsId: w, postId: post.id, nextAt }]);
      if (!added && !old.enabled) await patchRec(T.evergreen, post.id, { nextAt });
      else if (!added) await patchRec(T.evergreen, post.id, { wsId: w });
    } else await delRec(T.evergreen, [post.id]);
    return json({ post: await getRec(T.posts(w), post.id) });
  }),

  // ---------- bulk scheduling ----------
  'POST /api/w/:w/bulk/preview': W('post.schedule', async (ctx, a) => {
    const blocked = needFeature(a.plan, 'bulk');
    if (blocked) return blocked;
    const text = str(B(ctx).csv, 400000);
    const NL = String.fromCharCode(10);
    const Q = String.fromCharCode(34);
    const lines = text.split(NL).map((l) => (l.endsWith(String.fromCharCode(13)) ? l.slice(0, -1) : l)).filter((l) => l.trim());
    if (lines.length < 2) return error('The file needs a header row and at least one data row.', 400);
    const parse = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === Q && line[i + 1] === Q) { cur += Q; i++; } else if (c === Q) inQ = false; else cur += c;
        } else if (c === Q) inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
      }
      out.push(cur);
      return out.map((x) => x.trim());
    };
    const head = parse(lines[0]).map((h) => h.toLowerCase());
    const col = (name: string): number => head.indexOf(name);
    const need = ['caption', 'platform', 'account', 'date', 'time'];
    const missing = need.filter((n) => col(n) < 0);
    if (missing.length) return error('Missing columns: ' + missing.join(', ') + '. Expected: title, caption, media, platform, account, date, time, timezone, hashtags.', 400);
    const accounts = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt);
    const media = (await listRecs(T.media(a.ws.id), 300)).filter((m) => !m.deletedAt);
    const rows: Rec[] = [];
    for (const line of lines.slice(1, 201)) {
      const c = parse(line);
      const g = (n: string): string => (col(n) >= 0 ? c[col(n)] || '' : '');
      rows.push({ title: g('title'), caption: g('caption'), media: g('media'), platform: g('platform').toLowerCase(), account: g('account'), date: g('date'), time: g('time'), timezone: g('timezone') || a.ws.timezone || 'UTC', hashtags: g('hashtags') });
    }
    return json({ rows: await checkRows(a, rows, accounts, media) });
  }),
  'POST /api/w/:w/bulk/commit': W('post.schedule', async (ctx, a) => {
    const blocked = needFeature(a.plan, 'bulk');
    if (blocked) return blocked;
    const rows: Rec[] = Array.isArray(B(ctx).rows) ? (B(ctx).rows as Rec[]).slice(0, 200) : [];
    const accounts = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt);
    const media = (await listRecs(T.media(a.ws.id), 300)).filter((m) => !m.deletedAt);
    const checked = await checkRows(a, rows, accounts, media);
    const results: Rec[] = [];
    for (const r of checked) {
      if (r.errors.length) { results.push({ ok: false, errors: r.errors }); continue; }
      const post = await addRec(T.posts(a.ws.id), { title: str(r.title, 200), caption: str(r.caption, 10000), hashtags: cleanTags(String(r.hashtags || '').split(' ').filter(Boolean)), link: '', mediaIds: r.mediaId ? [r.mediaId] : [], variants: {}, targets: [], revisions: [], status: 'draft', rev: 0, createdBy: a.userId, createdByName: a.name, createdAt: iso(), updatedAt: iso() }, 'p');
      const res = await scheduleTargets(a, post, [{ accountId: r.accountId, date: r.date, time: r.time, tz: r.timezone }], 'schedule', r.timezone);
      results.push(res.statusCode < 300 ? { ok: true } : { ok: false, errors: [JSON.parse(res.body).error || 'Could not schedule'] });
    }
    await act(a, 'bulk scheduled ' + results.filter((x) => x.ok).length + ' posts');
    return json({ results });
  }),

  // ---------- campaigns ----------
  'GET /api/w/:w/campaigns': W(undefined, async (_ctx, a) => {
    const posts = await loadPosts(a.ws.id);
    const list = (await listRecs(T.campaigns(a.ws.id), 100)).map((c) => ({ ...c, postCount: posts.filter((p) => p.campaignId === c.id).length, publishedCount: posts.filter((p) => p.campaignId === c.id && p.status === 'published').length }));
    return json({ campaigns: list });
  }),
  'POST /api/w/:w/campaigns': W('campaign.write', async (ctx, a) => {
    const b = B(ctx);
    const name = str(b.name, 100).trim();
    if (!name) return error('Give the campaign a name.', 400);
    const c = await addRec(T.campaigns(a.ws.id), { name, goal: str(b.goal, 500), startDate: str(b.startDate, 10), endDate: str(b.endDate, 10), color: str(b.color, 9) || '#2563eb', createdAt: iso() }, 'g');
    const drafts: Rec[] = Array.isArray(b.posts) ? b.posts.slice(0, 20) : [];
    for (const d of drafts) {
      const pid = String(d.platform || '');
      await addRec(T.posts(a.ws.id), { title: str(d.title, 200), caption: str(d.caption, 10000), hashtags: [], link: '', mediaIds: [], variants: PLATFORMS[pid] ? { [pid]: { caption: str(d.caption, 10000) } } : {}, targets: [], revisions: [], campaignId: c.id, plannedDayOffset: Number(d.dayOffset) || 0, status: 'draft', rev: 0, createdBy: a.userId, createdByName: a.name, createdAt: iso(), updatedAt: iso() }, 'p');
    }
    await act(a, 'created campaign ' + name);
    return json({ campaign: c }, 201);
  }),
  'PUT /api/w/:w/campaigns/:id': W('campaign.write', async (ctx, a) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    for (const k of ['name', 'goal', 'startDate', 'endDate', 'color']) if (k in b) rec[k] = str(b[k], 500);
    await patchRec(T.campaigns(a.ws.id), ctx.params.id, rec);
    return json({ ok: true });
  }),
  'DELETE /api/w/:w/campaigns/:id': W('campaign.write', async (ctx, a) => {
    await delRec(T.campaigns(a.ws.id), [ctx.params.id]);
    return json({ ok: true });
  }),

  // ---------- AI ----------
  'POST /api/w/:w/ai': W('ai.use', async (ctx, a) => {
    const blocked = needFeature(a.plan, 'ai');
    if (blocked) return blocked;
    const usage = await getUsage(a.ws.id);
    const credits = a.plan.limits.aiCredits || 0;
    if (usage.aiCalls >= credits) return json({ error: 'You have used all ' + credits + ' AI credits this month.', upgrade: true }, 402);
    const b = B(ctx);
    let stats: Rec | null = null;
    if (b.task === 'insights') {
      const o = await overview(a, Date.now() - 90 * 86400000, Date.now());
      stats = { counts: o.counts, byPlatform: o.byPlatform };
    }
    const result = await runAi(b, stats);
    await bumpUsage(a.ws.id, 'aiCalls', 1);
    return json({ result, creditsLeft: credits - usage.aiCalls - 1 });
  }),

  // ---------- team ----------
  'GET /api/w/:w/team': W(undefined, async (_ctx, a) => json({ members: await listRecs(T.members(a.ws.id), 100), invites: await listRecs(T.wsinv(a.ws.id), 100), limit: a.plan.limits.members })),
  'POST /api/w/:w/team/invite': W('team.manage', async (ctx, a) => {
    const blocked = needFeature(a.plan, 'team');
    if (blocked) return blocked;
    const b = B(ctx);
    const email = str(b.email, 200).trim().toLowerCase();
    if (!email.includes('@') || !email.includes('.')) return error('Enter a valid email address.', 400);
    if (!ROLES.includes(b.role) || b.role === 'owner') return error('Choose a valid role.', 400);
    const members = await listRecs(T.members(a.ws.id), 100);
    const invites = await listRecs(T.wsinv(a.ws.id), 100);
    if (members.length + invites.length >= (a.plan.limits.members || 1)) return json({ error: 'Your plan allows ' + a.plan.limits.members + ' team members.', upgrade: true }, 402);
    await db.tx.add(T.wsinv(a.ws.id), [{ id: ekey(email), email, role: b.role, invitedBy: a.name, at: iso() }]);
    await db.tx.add(T.inv(email), [{ id: a.ws.id, wsId: a.ws.id, wsName: a.ws.name, role: b.role }]);
    await audit(ctx, a.ws.id, 'team.invited', { email, role: b.role });
    return json({ ok: true, delivery: 'The invite is matched automatically when this person signs in with this email. Email delivery is not enabled yet, so share the app link with them.' });
  }),
  'POST /api/w/:w/team/revoke': W('team.manage', async (ctx, a) => {
    const email = str(B(ctx).email, 200).trim().toLowerCase();
    await delRec(T.wsinv(a.ws.id), [ekey(email)]);
    await delRec(T.inv(email), [a.ws.id]);
    return json({ ok: true });
  }),
  'PUT /api/w/:w/team/:uid': W('team.manage', async (ctx, a) => {
    const role = B(ctx).role;
    const m = await getRec(T.members(a.ws.id), ctx.params.uid);
    if (!m || m.role === 'owner') return error('This member is the owner or does not exist.', 400);
    if (!ROLES.includes(role) || role === 'owner') return error('Choose a valid role.', 400);
    await patchRec(T.members(a.ws.id), m.id, { role });
    await patchRec(T.mem(m.userId), a.ws.id, { role });
    await audit(ctx, a.ws.id, 'team.role_changed', { userId: m.userId, role });
    return json({ ok: true });
  }),
  'DELETE /api/w/:w/team/:uid': W('team.manage', async (ctx, a) => {
    const m = await getRec(T.members(a.ws.id), ctx.params.uid);
    if (!m || m.role === 'owner') return error('The owner cannot be removed.', 400);
    await delRec(T.members(a.ws.id), [m.id]);
    await delRec(T.mem(m.userId), [a.ws.id]);
    await audit(ctx, a.ws.id, 'team.removed', { userId: m.userId });
    return json({ ok: true });
  }),

  // ---------- billing ----------
  'GET /api/w/:w/billing': W(undefined, async (_ctx, a) => {
    const usage = await getUsage(a.ws.id);
    const accounts = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt).length;
    const members = (await listRecs(T.members(a.ws.id), 100)).length;
    const status = await integrationStatus();
    return json({
      plan: { id: a.plan.id, name: a.plan.name, limits: a.plan.limits, features: a.plan.features }, workspacePlanId: a.ws.planId || 'free', trial: a.ws.trial || null, trialUsed: !!a.ws.trialUsed,
      usage: { scheduled: usage.scheduled || 0, aiCalls: usage.aiCalls || 0, accounts, members, storageBytes: a.ws.storageBytes || 0 },
      plans: await publicPlans(), payments: status.payments, checkoutEnabled: await paymentsConfigured(),
      transactions: (await listRecs(T.payments(a.ws.id), 50)).sort((x, y) => String(y.at).localeCompare(String(x.at))),
    });
  }),
  'POST /api/w/:w/billing/trial': W('billing.manage', async (ctx, a) => {
    const plan = await getRec(T.plans, str(B(ctx).planId, 30));
    if (!plan || !plan.active || !plan.trialDays) return error('That plan has no free trial.', 400);
    if (a.ws.trialUsed) return error('This workspace has already used its free trial.', 409);
    const endsAt = iso(Date.now() + plan.trialDays * 86400000);
    await patchRec(T.workspaces, a.ws.id, { trial: { planId: plan.id, endsAt, startedAt: iso() }, trialUsed: true });
    await audit(ctx, a.ws.id, 'billing.trial_started', { plan: plan.id });
    await notify(a.ws.id, { type: 'billing', title: plan.name + ' trial started', body: 'Your trial ends on ' + endsAt.slice(0, 10) + '. No card was taken.' });
    return json({ ok: true, endsAt });
  }),
  'POST /api/w/:w/billing/plan': W('billing.manage', async (ctx, a) => {
    const plan = await getRec(T.plans, str(B(ctx).planId, 30));
    if (!plan || !plan.active) return error('Unknown plan.', 400);
    if (plan.priceMonthly > 0 && !(await paymentsConfigured())) return json({ error: 'Online checkout is not enabled yet. Stripe and M-Pesa credentials have not been configured, so paid plans can only be assigned by an administrator. You can start a free trial instead.' }, 409);
    if (plan.priceMonthly > 0) return json({ error: 'Checkout is configured but the payment flow is not finished yet.' }, 501);
    const accounts = (await listRecs(T.accounts(a.ws.id), 200)).filter((x) => !x.deletedAt).length;
    if (plan.limits.accounts != null && accounts > plan.limits.accounts) return error('Remove accounts first: the ' + plan.name + ' plan allows ' + plan.limits.accounts + '.', 409);
    await patchRec(T.workspaces, a.ws.id, { planId: plan.id, trial: null });
    await audit(ctx, a.ws.id, 'billing.plan_changed', { plan: plan.id });
    return json({ ok: true });
  }),

  // ---------- super administrator ----------
  'GET /api/admin/overview': ADM(async () => {
    const profiles = await listRecs(T.profiles, 500);
    const workspaces = (await listRecs(T.workspaces, 500)).filter((w) => !w.deletedAt);
    const jobs = await listRecs(T.jobs, 400);
    const failed = await listRecs(T.jobsFailed, 200);
    const engine = await getRec(T.system, 'engine');
    const dist: Rec = {};
    for (const w of workspaces) dist[w.planId || 'free'] = (dist[w.planId || 'free'] || 0) + 1;
    const overdue = jobs.filter((j) => j.runAt < Date.now() - 15 * 60000).length;
    return json({ users: profiles.length, workspaces: workspaces.length, pendingJobs: jobs.length, overdueJobs: overdue, failedJobs: failed.length, planDistribution: dist, engine, integrations: await integrationStatus() });
  }),
  'GET /api/admin/workspaces': ADM(async () => {
    const list = (await listRecs(T.workspaces, 300)).filter((w) => !w.deletedAt).map((w) => ({ id: w.id, name: w.name, type: w.type, planId: w.planId || 'free', ownerId: w.ownerId, createdAt: w.createdAt, storageBytes: w.storageBytes || 0, trial: w.trial || null }));
    return json({ workspaces: list });
  }),
  'PUT /api/admin/workspaces/:w': ADM(async (ctx) => {
    const planId = str(B(ctx).planId, 30);
    const plan = await getRec(T.plans, planId);
    if (!plan) return error('Unknown plan', 400);
    await patchRec(T.workspaces, ctx.params.w, { planId, trial: null });
    await audit(ctx, ctx.params.w, 'admin.plan_assigned', { planId });
    return json({ ok: true });
  }),
  'GET /api/admin/failed-jobs': ADM(async () => json({ items: (await listRecs(T.jobsFailed, 200)).sort((x, y) => String(y.at).localeCompare(String(x.at))) })),
  'POST /api/admin/failed-jobs/:id/retry': ADM(async (ctx) => {
    const rec = await getRec(T.jobsFailed, ctx.params.id);
    if (!rec) return error('Job not found', 404);
    if (rec.code === 'validation' || rec.code === 'account') return error('This failure needs a content or account fix and cannot be retried as is.', 409);
    const post = await getRec(T.posts(rec.wsId), rec.postId);
    const target = post && (post.targets || []).find((t: Rec) => t.id === rec.id);
    if (!post || !target || target.status !== 'failed') { await delRec(T.jobsFailed, [rec.id]); return error('The post changed since this failure; nothing to retry.', 409); }
    const when = iso();
    await mutatePost(rec.wsId, post.id, (p) => ({ targets: p.targets.map((t: Rec) => (t.id === rec.id ? { ...t, status: 'queued', attempts: 0, error: null, scheduledAt: when } : t)) }));
    await enqueue(rec.wsId, post.id, [{ ...target, scheduledAt: when }]);
    await delRec(T.jobsFailed, [rec.id]);
    await audit(ctx, rec.wsId, 'admin.job_retried', { target: rec.id });
    return json({ ok: true });
  }),
  'GET /api/admin/plans': ADM(async () => {
    await ensurePlans();
    return json({ plans: (await listRecs(T.plans, 20)).sort((x, y) => x.sort - y.sort) });
  }),
  'PUT /api/admin/plans/:id': ADM(async (ctx) => {
    const b = B(ctx);
    const rec: Rec = { updatedAt: iso() };
    for (const k of ['priceMonthly', 'priceYearly', 'trialDays']) if (k in b) rec[k] = Math.max(0, Number(b[k]) || 0);
    if ('active' in b) rec.active = !!b.active;
    if (b.limits && typeof b.limits === 'object') rec.limits = b.limits;
    if (b.features && typeof b.features === 'object') rec.features = b.features;
    await ensurePlans();
    await patchRec(T.plans, ctx.params.id, rec);
    await audit(ctx, null, 'admin.plan_edited', { plan: ctx.params.id });
    return json({ ok: true });
  }),
  'GET /api/admin/audit': ADM(async () => json({ items: (await listRecs(T.audit, 200)).sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 100) })),
  'GET /api/admin/flags': ADM(async () => json({ flags: ((await getRec(T.system, 'flags')) || {}).values || {} })),
  'PUT /api/admin/flags': ADM(async (ctx) => {
    const values: Rec = {};
    for (const [k, v] of Object.entries(B(ctx).flags || {})) values[k.slice(0, 40)] = !!v;
    await setSystem('flags', { values });
    return json({ ok: true });
  }),
};

async function checkRows(a: Access, rows: Rec[], accounts: Rec[], media: Rec[]): Promise<Rec[]> {
  const out: Rec[] = [];
  for (const r of rows) {
    const errors: string[] = [];
    const acc = accounts.find((x) => x.platform === r.platform && (String(x.handle).toLowerCase() === String(r.account).toLowerCase() || String(x.displayName).toLowerCase() === String(r.account).toLowerCase()));
    if (!PLATFORMS[r.platform]) errors.push('Unknown platform. Use one of: ' + Object.keys(PLATFORMS).join(', ') + '.');
    else if (!acc) errors.push('No connected ' + PLATFORMS[r.platform].name + ' account matches ' + (r.account || 'an empty value') + '.');
    const tz = isValidTz(r.timezone) ? r.timezone : '';
    if (!tz) errors.push('Unknown timezone.');
    const ms = tz ? zonedToUtcMs(String(r.date), String(r.time), tz) : NaN;
    if (tz && isNaN(ms)) errors.push('Date must be YYYY-MM-DD and time HH:MM.');
    else if (tz && ms < Date.now()) errors.push('The date and time are in the past.');
    const m = r.media ? media.find((x) => String(x.name).toLowerCase() === String(r.media).toLowerCase()) : null;
    if (r.media && !m) errors.push('Media file ' + r.media + ' was not found in the library.');
    if (!String(r.caption).trim() && !m) errors.push('Add a caption or a media file.');
    if (!errors.length && acc) {
      const issues = await validatePost(a.ws.id, { caption: r.caption, hashtags: cleanTags(String(r.hashtags || '').split(' ').filter(Boolean)), mediaIds: m ? [m.id] : [], title: r.title }, [acc.platform]);
      for (const i of issues) if (i.level === 'error') errors.push(i.message);
    }
    out.push({ ...r, timezone: tz || r.timezone, accountId: acc ? acc.id : null, mediaId: m ? m.id : null, errors });
  }
  return out;
}

export const handler = router(routes);

export const publishDueHandler = async () => {
  let info: Rec = {};
  try {
    info = await processDue();
    await setSystem('engine', { lastRunAt: iso(), pending: info.pending, due: info.due, lastError: null });
  } catch (e) {
    console.error('publish-due failed', e);
    await setSystem('engine', { lastRunAt: iso(), lastError: e instanceof Error ? e.message : 'error' });
  }
  return { statusCode: 200 };
};

export const evergreenHandler = async () => {
  try {
    await evergreenTick();
  } catch (e) {
    console.error('evergreen failed', e);
  }
  return { statusCode: 200 };
};
