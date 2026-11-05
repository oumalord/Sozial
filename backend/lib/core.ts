import { db, json, error, increment } from './runtime';
import type { RouterContext, RouterResponse } from './runtime';

export { json, error };
export type Rec = Record<string, any>;

export const ADMIN_EMAILS = ['obwandalordphick14@gmail.com', 'sirlordphick@gmail.com'];
export const NL = String.fromCharCode(10);
export const Q = String.fromCharCode(34);

export const iso = (ms: number = Date.now()): string => new Date(ms).toISOString();
export const uid = (prefix: string): string => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const tkey = (s: string): string => s.split('').filter((c) => /[A-Za-z0-9]/.test(c)).join('').slice(0, 64);

export function ekey(email: string): string {
  const e = email.trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < e.length; i++) h = ((h * 33) ^ e.charCodeAt(i)) >>> 0;
  return tkey(e).slice(0, 50) + h.toString(36);
}

const wt = (name: string) => (w: string): string => 'ws_' + w + '_' + name;

export const T = {
  profiles: 'profiles',
  workspaces: 'workspaces',
  plans: 'plans',
  jobs: 'jobs_due',
  jobsFailed: 'jobs_failed',
  evergreen: 'evergreen_idx',
  audit: 'audit_log',
  system: 'system_settings',
  postizAssignments: 'postiz_assignments',
  postizPublishes: 'postiz_publishes',
  mem: (u: string): string => 'mem_' + tkey(u),
  inv: (email: string): string => 'inv_' + ekey(email),
  members: wt('members'),
  wsinv: wt('invites'),
  accounts: wt('accounts'),
  brands: wt('brands'),
  media: wt('media'),
  folders: wt('folders'),
  posts: wt('posts'),
  logs: wt('logs'),
  notifs: wt('notifs'),
  activity: wt('activity'),
  comments: wt('comments'),
  campaigns: wt('campaigns'),
  usage: wt('usage'),
  payments: wt('payments'),
};

// ---------- database helpers ----------
export async function getRec<R extends Rec = Rec>(table: string, id: string): Promise<R | null> {
  const [r] = await db.get<R>(table, [id], { consistent: true });
  return r ?? null;
}

export async function addRec(table: string, rec: Rec, prefix: string = 'r'): Promise<Rec> {
  const id: string = rec.id || uid(prefix);
  const full = { ...rec, id };
  const [res] = await db.tx.add(table, [full]);
  if (!res) throw new Error('Record already exists');
  return full;
}

export async function patchRec(table: string, id: string, record: Rec, cond?: Rec): Promise<boolean> {
  const item: { id: string; record: Rec; if?: Rec } = { id, record };
  if (cond) item.if = cond;
  const [ok] = await db.tx.update(table, [item], { patch: true });
  return !!ok;
}

export async function delRec(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 400) await db.delete(table, ids.slice(i, i + 400));
}

export async function listRecs(table: string, max: number = 200): Promise<Rec[]> {
  const out: Rec[] = [];
  let nextToken: string | undefined;
  try {
    for (let i = 0; i < Math.min(50, Math.ceil(max / 100)) && out.length < max; i++) {
      const page = await db.list(table, { limit: Math.min(100, max - out.length), nextToken });
      out.push(...page.items);
      nextToken = page.nextToken;
      if (!nextToken) break;
    }
  } catch (e) {
    console.warn('listRecs failed for', table, e instanceof Error ? e.message : e);
  }
  return out;
}

export async function setSystem(id: string, rec: Rec): Promise<void> {
  await db.tx.add(T.system, [{ id, ...rec }]);
  await patchRec(T.system, id, { ...rec, updatedAt: iso() });
}

// ---------- roles & permissions ----------
export const ROLES = ['owner', 'admin', 'manager', 'creator', 'editor', 'approver', 'viewer'];
const WRITERS = ['owner', 'admin', 'manager', 'creator', 'editor'];
export const PERMS: Record<string, string[]> = {
  'post.write': WRITERS,
  'post.schedule': WRITERS,
  'post.approve': ['owner', 'admin', 'manager', 'approver'],
  'post.delete': ['owner', 'admin', 'manager', 'editor'],
  'media.write': WRITERS,
  'accounts.manage': ['owner', 'admin', 'manager'],
  'team.manage': ['owner', 'admin'],
  'settings.manage': ['owner', 'admin'],
  'billing.manage': ['owner'],
  'ws.delete': ['owner'],
  'ai.use': WRITERS,
  comment: [...WRITERS, 'approver'],
  'campaign.write': ['owner', 'admin', 'manager', 'editor'],
};
export const can = (role: string, perm: string): boolean => (PERMS[perm] || []).includes(role);

// ---------- plans & entitlements ----------
const trial = 14;
export const DEFAULT_PLANS: Rec[] = [
  { id: 'free', name: 'Free', sort: 0, active: true, priceMonthly: 0, priceYearly: 0, currency: 'USD', trialDays: 0,
    limits: { accounts: 3, scheduledPerMonth: 15, members: null, storageMb: 100, aiCredits: 0 },
    features: { ai: false, bulk: false, evergreen: false, advancedAnalytics: false, exports: false, team: true, approvals: false, multiWorkspace: false, whiteLabel: false } },
  { id: 'creator', name: 'Creator', sort: 1, active: true, priceMonthly: 12, priceYearly: 120, currency: 'USD', trialDays: trial,
    limits: { accounts: 6, scheduledPerMonth: 120, members: null, storageMb: 2000, aiCredits: 100 },
    features: { ai: true, bulk: false, evergreen: false, advancedAnalytics: false, exports: false, team: true, approvals: false, multiWorkspace: false, whiteLabel: false } },
  { id: 'pro', name: 'Pro', sort: 2, active: true, priceMonthly: 29, priceYearly: 290, currency: 'USD', trialDays: trial,
    limits: { accounts: 12, scheduledPerMonth: 600, members: null, storageMb: 10000, aiCredits: 500 },
    features: { ai: true, bulk: true, evergreen: true, advancedAnalytics: true, exports: true, team: true, approvals: false, multiWorkspace: false, whiteLabel: false } },
  { id: 'business', name: 'Business', sort: 3, active: true, priceMonthly: 79, priceYearly: 790, currency: 'USD', trialDays: trial,
    limits: { accounts: 30, scheduledPerMonth: 2500, members: null, storageMb: 50000, aiCredits: 1500 },
    features: { ai: true, bulk: true, evergreen: true, advancedAnalytics: true, exports: true, team: true, approvals: true, multiWorkspace: false, whiteLabel: false } },
  { id: 'agency', name: 'Agency', sort: 4, active: true, priceMonthly: 199, priceYearly: 1990, currency: 'USD', trialDays: trial,
    limits: { accounts: 100, scheduledPerMonth: 10000, members: null, storageMb: 200000, aiCredits: 5000 },
    features: { ai: true, bulk: true, evergreen: true, advancedAnalytics: true, exports: true, team: true, approvals: true, multiWorkspace: true, whiteLabel: true } },
];

let plansSeeded = false;
export async function ensurePlans(): Promise<void> {
  if (plansSeeded) return;
  const existing = await getRec(T.plans, 'free');
  if (!existing) await db.tx.add(T.plans, DEFAULT_PLANS);
  plansSeeded = true;
}

export async function planFor(ws: Rec): Promise<Rec> {
  await ensurePlans();
  const trialOn = ws.trial && Date.parse(ws.trial.endsAt) > Date.now();
  const id: string = trialOn ? ws.trial.planId : ws.planId || 'free';
  const plan = (await getRec(T.plans, id)) ?? (await getRec(T.plans, 'free')) ?? DEFAULT_PLANS[0];
  return { ...plan, limits: { ...plan.limits, members: null }, features: { ...plan.features, team: true } };
}

export function withUnlimitedTeam(plan: Rec): Rec {
  return { ...plan, limits: { ...plan.limits, members: null }, features: { ...plan.features, team: true } };
}

export function needFeature(plan: Rec, key: string): RouterResponse | null {
  if (plan.features && plan.features[key]) return null;
  return json({ error: 'The ' + plan.name + ' plan does not include this feature. Upgrade to unlock it.', upgrade: true }, 402);
}

export function needsApproval(ws: Rec, role: string, plan: Rec): boolean {
  if (role === 'creator') return true;
  return !!(plan.features && plan.features.approvals && ws.approvalPolicy === 'everyone');
}

// ---------- usage ----------
export const monthKey = (ms: number = Date.now()): string => new Date(ms).toISOString().slice(0, 7);

export async function getUsage(w: string): Promise<Rec> {
  return (await getRec(T.usage(w), monthKey())) ?? { id: monthKey(), scheduled: 0, aiCalls: 0 };
}

export async function bumpUsage(w: string, field: string, n: number = 1): Promise<void> {
  const key = monthKey();
  await db.tx.add(T.usage(w), [{ id: key, scheduled: 0, aiCalls: 0 }]);
  await db.tx.update(T.usage(w), [{ id: key, record: { [field]: increment(n) } }], { patch: true });
}

// ---------- time zones ----------
export function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(ms: number, tz: string): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts: Rec = {};
  for (const p of f.formatToParts(new Date(ms))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

export function zonedToUtcMs(date: string, time: string, tz: string): number {
  const d = date.split('-').map(Number);
  const t = time.split(':').map(Number);
  if (d.length !== 3 || t.length < 2 || d.some((x) => isNaN(x)) || t.some((x) => isNaN(x))) return NaN;
  const guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
  const off = tzOffsetMs(guess, tz);
  let ms = guess - off;
  const off2 = tzOffsetMs(ms, tz);
  if (off2 !== off) ms = guess - off2;
  return ms;
}

export function ymdInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
}

export function hourInTz(ms: number, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  return parseInt(h, 10);
}

// ---------- access control ----------
export interface Access {
  userId: string;
  email: string;
  name: string;
  ws: Rec;
  role: string;
  plan: Rec;
}

export const isResp = (x: unknown): x is RouterResponse => !!x && typeof x === 'object' && 'statusCode' in (x as object);

export async function access(ctx: RouterContext, perm?: string): Promise<Access | RouterResponse> {
  const userId = ctx.user!.userId;
  const w = ctx.params.w;
  const mem = await getRec(T.mem(userId), w);
  if (!mem) return error('Workspace not found', 404);
  const ws = await getRec(T.workspaces, w);
  if (!ws || ws.deletedAt) return error('Workspace not found', 404);
  if (perm && !can(mem.role, perm)) return error('Your role does not permit this action', 403);
  const plan = await planFor(ws);
  return { userId, email: ctx.user!.email || '', name: ctx.user!.name || ctx.user!.email || 'Member', ws, role: mem.role, plan };
}

export async function audit(ctx: RouterContext, wsId: string | null, action: string, detail: Rec = {}): Promise<void> {
  try {
    await addRec(T.audit, { at: iso(), userId: ctx.user?.userId, email: ctx.user?.email, wsId, action, detail }, 'a');
  } catch (e) {
    console.error('audit failed', e);
  }
}

export async function act(a: Access, text: string): Promise<void> {
  try {
    await addRec(T.activity(a.ws.id), { at: iso(), userId: a.userId, name: a.name, text }, 'v');
  } catch (e) {
    console.error('activity failed', e);
  }
}
