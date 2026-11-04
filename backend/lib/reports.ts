import { T, listRecs, iso, ymdInTz, hourInTz, zonedToUtcMs, NL, Q } from './core';
import type { Rec, Access } from './core';
import { PLATFORMS } from './platforms';

const DAY = 86400000;

export async function loadPosts(w: string): Promise<Rec[]> {
  return (await listRecs(T.posts(w), 500)).filter((p) => !p.deletedAt);
}

function flatten(posts: Rec[]): Rec[] {
  const out: Rec[] = [];
  for (const p of posts) {
    for (const t of p.targets || []) out.push({ ...t, postId: p.id, title: p.title || String(p.caption || '').slice(0, 70) || 'Untitled post' });
  }
  return out;
}

function timeline(targets: Rec[], from: number, to: number, tz: string): Rec[] {
  const days: Rec = {};
  const span = Math.min(90, Math.max(1, Math.ceil((to - from) / DAY)));
  for (let i = 0; i <= span; i++) days[ymdInTz(from + i * DAY, tz)] = { date: ymdInTz(from + i * DAY, tz), published: 0, failed: 0 };
  for (const t of targets) {
    if (t.status === 'published' && t.publishedAt) {
      const d = ymdInTz(Date.parse(t.publishedAt), tz);
      if (days[d]) days[d].published++;
    }
    if (t.status === 'failed' && t.failedAt) {
      const d = ymdInTz(Date.parse(t.failedAt), tz);
      if (days[d]) days[d].failed++;
    }
  }
  return Object.values(days);
}

export async function overview(a: Access, from: number, to: number): Promise<Rec> {
  const w = a.ws.id;
  const tz: string = a.ws.timezone || 'UTC';
  const [posts, accounts, activity] = await Promise.all([loadPosts(w), listRecs(T.accounts(w), 200), listRecs(T.activity(w), 100)]);
  const live = accounts.filter((x) => !x.deletedAt);
  const targets = flatten(posts);
  const inRange = (s?: string): boolean => !!s && Date.parse(s) >= from && Date.parse(s) <= to;
  const published = targets.filter((t) => t.status === 'published' && inRange(t.publishedAt));
  const failed = targets.filter((t) => t.status === 'failed' && inRange(t.failedAt || t.createdAt));
  const scheduled = targets.filter((t) => ['queued', 'paused', 'awaiting_approval', 'publishing'].includes(t.status));
  const drafts = posts.filter((p) => p.status === 'draft' && !p.isTemplate);
  const manual = targets.filter((t) => t.status === 'manual');
  const upcoming = scheduled.filter((t) => t.status === 'queued' || t.status === 'awaiting_approval').sort((x, y) => Date.parse(x.scheduledAt) - Date.parse(y.scheduledAt)).slice(0, 8);
  const byPlatform: Rec = {};
  for (const t of targets) {
    const row = byPlatform[t.platform] || (byPlatform[t.platform] = { published: 0, scheduled: 0, failed: 0 });
    if (t.status === 'published' && inRange(t.publishedAt)) row.published++;
    if (t.status === 'failed' && inRange(t.failedAt || t.createdAt)) row.failed++;
    if (['queued', 'paused', 'awaiting_approval'].includes(t.status)) row.scheduled++;
  }
  const insights: Rec[] = [];
  if (failed.length) insights.push({ tone: 'bad', text: failed.length + ' publication' + (failed.length > 1 ? 's' : '') + ' failed in this period. Open the calendar and retry them.' });
  if (manual.length) insights.push({ tone: 'warn', text: manual.length + ' post' + (manual.length > 1 ? 's need' : ' needs') + ' manual publishing because the account has no API connection.' });
  const waiting = targets.filter((t) => t.status === 'awaiting_approval').length;
  if (waiting) insights.push({ tone: 'info', text: waiting + ' target' + (waiting > 1 ? 's are' : ' is') + ' awaiting approval and will not publish until approved.' });
  const broken = live.filter((x) => x.connection && (x.connection.state === 'expired' || x.connection.state === 'permission_required'));
  if (broken.length) insights.push({ tone: 'warn', text: broken.length + ' connected account' + (broken.length > 1 ? 's need' : ' needs') + ' re-authorization.' });
  const week = scheduled.filter((t) => Date.parse(t.scheduledAt) < Date.now() + 7 * DAY).length;
  if (live.length && !week) insights.push({ tone: 'info', text: 'Nothing is scheduled for the next 7 days. Plan content in the Content Studio.' });
  if (!live.length) insights.push({ tone: 'info', text: 'Add your first social account to start scheduling.' });
  const storageMb = Math.round(((a.ws.storageBytes || 0) / 1048576) * 10) / 10;
  const cap = a.plan.limits && a.plan.limits.storageMb;
  if (cap && storageMb / cap > 0.85) insights.push({ tone: 'warn', text: 'Media storage is ' + Math.round((storageMb / cap) * 100) + '% full.' });
  return {
    counts: { accounts: live.length, scheduled: scheduled.length, published: published.length, failed: failed.length, drafts: drafts.length, awaitingApproval: waiting, manual: manual.length },
    upcoming, byPlatform, timeline: timeline(targets, from, to, tz), insights,
    recent: activity.sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 10),
    metrics: { available: false, reason: 'Impressions, engagement and audience growth come from each network. They appear once a publishing provider with analytics access is connected. SocialFlow never estimates them.' },
  };
}

export async function analytics(a: Access, from: number, to: number): Promise<Rec> {
  const w = a.ws.id;
  const tz: string = a.ws.timezone || 'UTC';
  const [posts, accounts] = await Promise.all([loadPosts(w), listRecs(T.accounts(w), 200)]);
  const targets = flatten(posts);
  const hours: number[] = new Array(24).fill(0);
  const byPlatform: Rec = {};
  const byAccount: Rec = {};
  const accName: Rec = {};
  for (const x of accounts) accName[x.id] = x.displayName || x.handle;
  for (const t of targets) {
    const at = t.status === 'published' ? t.publishedAt : t.status === 'failed' ? t.failedAt || t.createdAt : null;
    if (!at || Date.parse(at) < from || Date.parse(at) > to) continue;
    const row = byPlatform[t.platform] || (byPlatform[t.platform] = { published: 0, failed: 0 });
    const arow = byAccount[t.accountId] || (byAccount[t.accountId] = { name: accName[t.accountId] || t.handle || 'Account', platform: t.platform, published: 0, failed: 0 });
    if (t.status === 'published') { row.published++; arow.published++; hours[hourInTz(Date.parse(at), tz)]++; } else { row.failed++; arow.failed++; }
  }
  for (const k of Object.keys(byPlatform)) {
    const r = byPlatform[k];
    r.successRate = r.published + r.failed ? Math.round((r.published / (r.published + r.failed)) * 100) : null;
  }
  const recent = targets.filter((t) => t.status === 'published' && t.publishedAt && Date.parse(t.publishedAt) >= from && Date.parse(t.publishedAt) <= to).sort((x, y) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt)).slice(0, 15);
  return { timeline: timeline(targets, from, to, tz), byPlatform, byAccount: Object.values(byAccount), hours, recent, advanced: !!(a.plan.features && a.plan.features.advancedAnalytics), metrics: { available: false, reason: 'Views, likes, comments, shares, saves, reach, watch time and follower growth are reported by each network. They are not available until a publishing provider with analytics access is connected, so they are shown as unavailable rather than invented.' } };
}

const csvCell = (v: unknown): string => {
  const s = v === undefined || v === null ? '' : String(v);
  return s.includes(',') || s.includes(Q) || s.includes(NL) ? Q + s.split(Q).join(Q + Q) + Q : s;
};

export async function exportCsv(a: Access): Promise<string> {
  const w = a.ws.id;
  const [posts, accounts] = await Promise.all([loadPosts(w), listRecs(T.accounts(w), 200)]);
  const acc: Rec = {};
  for (const x of accounts) acc[x.id] = x;
  const rows = [['post', 'platform', 'account', 'status', 'scheduled_at_utc', 'published_at_utc', 'url', 'error']];
  for (const t of flatten(posts)) rows.push([t.title, t.platform, (acc[t.accountId] && acc[t.accountId].handle) || t.handle, t.status, t.scheduledAt, t.publishedAt, t.externalUrl, t.error]);
  return rows.map((r) => r.map(csvCell).join(',')).join(NL);
}

const DEFAULT_TIMES: Rec = { instagram: ['11:00', '19:00'], facebook: ['09:00', '13:00'], tiktok: ['12:00', '20:00'], youtube: ['15:00', '18:00'], linkedin: ['08:30', '12:00'], x: ['09:00', '17:00'], pinterest: ['20:00', '21:00'], threads: ['10:00', '19:00'] };

export async function smartTimes(a: Access, platform: string, count: number): Promise<Rec> {
  const tz: string = a.ws.timezone || 'UTC';
  const s: Rec = a.ws.settings || {};
  const days: number[] = Array.isArray(s.preferredDays) && s.preferredDays.length ? s.preferredDays : [1, 2, 3, 4, 5];
  const times: string[] = Array.isArray(s.slots) && s.slots.length ? s.slots : DEFAULT_TIMES[platform] || ['09:00', '18:00'];
  const posts = await loadPosts(a.ws.id);
  const busy = flatten(posts).filter((t) => t.platform === platform && ['queued', 'paused', 'awaiting_approval'].includes(t.status)).map((t) => Date.parse(t.scheduledAt));
  const slots: Rec[] = [];
  const today = ymdInTz(Date.now(), tz).split('-').map(Number);
  for (let i = 0; i < 60 && slots.length < count; i++) {
    const d = new Date(Date.UTC(today[0], today[1] - 1, today[2] + i));
    if (!days.includes(d.getUTCDay())) continue;
    const date = d.toISOString().slice(0, 10);
    for (const time of times) {
      const ms = zonedToUtcMs(date, time, tz);
      if (isNaN(ms) || ms < Date.now() + 600000) continue;
      if (busy.some((b) => Math.abs(b - ms) < 45 * 60000)) continue;
      slots.push({ date, time, iso: iso(ms) });
      if (slots.length >= count) break;
    }
  }
  return { basis: 'estimate', note: 'No engagement history is available, so these are general estimates based on your preferred days and time slots. They avoid existing posts on this platform.', slots, platform: PLATFORMS[platform] ? platform : null };
}
