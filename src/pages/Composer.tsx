import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Copy, Sparkles, Trash2, Image as Img, X, Film } from 'lucide-react';
import * as A from '../lib/api';
import { useWs, go } from '../lib/hooks';
import { Badge, Button, Card, Field, Modal, PlatformChip, Spinner, StatusBadge, Toggle, cx } from '../lib/ui';
import { fmtDateTime, hmInTz, ymdInTz, timeAgo } from '../lib/format';
import { MediaPicker } from './Media';

const NL = String.fromCharCode(10);
const tagsOf = (s: string): string[] => s.split(',').join(' ').split(' ').map((x) => x.split('#').join('')).filter(Boolean);
const compose = (caption: string, tags: string[]): string => [caption, tags.map((t) => '#' + t).join(' ')].filter(Boolean).join(NL + NL);
const OPEN = ['queued', 'paused', 'awaiting_approval'];

function AiHelper({ platform, onCaption, onTags, onClose, current }: { platform?: string; onCaption: (t: string) => void; onTags: (t: string[]) => void; onClose: () => void; current: string }) {
    const { ws, toast } = useWs();
    const [task, setTask] = useState('caption');
    const [topic, setTopic] = useState('');
    const [tone, setTone] = useState('conversational');
    const [audience, setAudience] = useState('');
    const [res, setRes] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        try {
            const r = await A.post('/api/w/' + ws.id + '/ai', { task, topic, tone, audience, platform, text: current });
            setRes(r.result);
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal title='AI writing assistant' onClose={onClose}>
            <div className='space-y-3'>
                <div className='flex gap-1.5'>{[['caption', 'Captions'], ['hashtags', 'Hashtags'], ['rewrite', 'Rewrite current']].map(([k, l]) => <button key={k} onClick={() => { setTask(k); setRes(null); }} className={cx('rounded-lg border px-3 py-1.5 text-xs font-medium', task === k ? 'border-brand bg-brand text-white' : 'border-line')}>{l}</button>)}</div>
                {task !== 'rewrite' && <Field label='What is the post about?'><textarea className='input' rows={3} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder='Describe the product, event or idea. The AI cannot see your uploaded media.' /></Field>}
                {task === 'caption' && <Field label='Audience'><input className='input' value={audience} onChange={(e) => setAudience(e.target.value)} placeholder='Young professionals in Nairobi' /></Field>}
                {task !== 'hashtags' && (
                    <Field label='Tone'><select className='input' value={tone} onChange={(e) => setTone(e.target.value)}>{['professional', 'conversational', 'entertaining', 'promotional', 'educational', 'inspirational'].map((t) => <option key={t}>{t}</option>)}</select></Field>
                )}
                <Button loading={busy} onClick={run} disabled={task === 'rewrite' ? !current.trim() : !topic.trim()}><Sparkles size={14} />Generate</Button>
                {res?.captions && <ul className='space-y-2'>{res.captions.map((c: string, i: number) => <li key={i} className='rounded-xl border border-line p-3 text-sm'>{c}<div className='mt-2'><Button size='sm' variant='secondary' onClick={() => { onCaption(c); onClose(); }}>Use this caption</Button></div></li>)}</ul>}
                {res?.text && <div className='rounded-xl border border-line p-3 text-sm'>{res.text}<div className='mt-2'><Button size='sm' variant='secondary' onClick={() => { onCaption(res.text); onClose(); }}>Replace caption</Button></div></div>}
                {res?.hashtags && <div><div className='mb-2 flex flex-wrap gap-1.5'>{res.hashtags.map((h: string) => <Badge key={h} tone='info'>#{h}</Badge>)}</div><Button size='sm' variant='secondary' onClick={() => { onTags(res.hashtags); onClose(); }}>Add these hashtags</Button></div>}
                <p className='text-[11px] text-muted'>AI output can be wrong. Always review and edit before publishing.</p>
            </div>
        </Modal>
    );
}

function Preview({ platform, p, text, media, account, limit, over }: { platform: string; p: any; text: string; media: any[]; account?: any; limit: number; over: boolean }) {
    return (
        <Card className='overflow-hidden'>
            <div className='flex items-center gap-2 border-b border-line p-3'>
                {p ? <PlatformChip p={p} size={30} /> : <div className='h-[30px] w-[30px] rounded-lg bg-surface2' />}
                <div className='min-w-0'><div className='truncate text-sm font-semibold'>{account?.displayName || account?.handle || 'Your account'}</div><div className='text-[11px] text-muted'>{p?.name || platform} preview · now</div></div>
            </div>
            {media.length > 0 && (
                <div className={cx('grid gap-0.5 bg-surface2', media.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                    {media.slice(0, 4).map((m) => <div key={m.id} className='aspect-square'>{m.kind === 'video' ? <video src={m.url} className='h-full w-full object-cover' muted /> : <img src={m.url} alt={m.name} className='h-full w-full object-cover' />}</div>)}
                </div>
            )}
            <div className='whitespace-pre-wrap break-words p-3 text-sm'>{text || <span className='text-muted'>Your caption appears here.</span>}</div>
            <div className={cx('border-t border-line px-3 py-2 text-right text-[11px]', over ? 'font-semibold text-bad' : 'text-muted')}>{text.length.toLocaleString()} / {limit.toLocaleString()}</div>
        </Card>
    );
}

function Targets({ post, onChange }: { post: any; onChange: (p: any) => void }) {
    const { ws, tz, meta, can, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const [logs, setLogs] = useState<any[] | null>(null);
    const act = async (path: string, body: any, ok: string) => {
        try {
            const r = await A.post('/api/w/' + ws.id + '/posts/' + post.id + '/' + path, body);
            onChange(r.post);
            toast(ok);
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    const targets: any[] = post.targets || [];
    if (!targets.length) return null;
    const sched = can('post.schedule');
    return (
        <Card className='p-4'>
            <div className='mb-3 flex items-center justify-between'><h3 className='text-sm font-semibold'>Publishing status</h3><StatusBadge status={post.status} /></div>
            <ul className='space-y-3'>
                {targets.map((t) => (
                    <li key={t.id} className='rounded-xl border border-line p-3'>
                        <div className='flex items-center gap-2'>{P[t.platform] && <PlatformChip p={P[t.platform]} size={24} />}<span className='min-w-0 flex-1 truncate text-sm font-medium'>{t.handle}</span><StatusBadge status={t.status} /></div>
                        <div className='mt-1 text-xs text-muted'>{t.status === 'published' ? 'Published ' + fmtDateTime(t.publishedAt, tz) + (t.confirmedBy === 'user' ? ' (confirmed by you)' : '') : fmtDateTime(t.scheduledAt, tz)}{t.attempts > 0 && ' · attempt ' + t.attempts}</div>
                        {t.error && <div className='mt-2 rounded-lg bg-bad/10 p-2 text-xs text-bad'>{t.error}</div>}
                        {t.externalUrl && <a href={t.externalUrl} target='_blank' rel='noreferrer' className='mt-1 block text-xs text-brand underline'>View live post</a>}
                        {sched && ['failed', 'manual'].includes(t.status) && <div className='mt-2 flex gap-2'><Button size='sm' variant='secondary' onClick={() => act('retry', { targetId: t.id }, 'Retry started')}>Retry</Button><Button size='sm' variant='secondary' onClick={() => act('mark-published', { targetId: t.id }, 'Marked as published')}>I published it manually</Button></div>}
                    </li>
                ))}
            </ul>
            {sched && (
                <div className='mt-3 flex flex-wrap gap-2'>
                    {targets.some((t) => t.status === 'queued') && <Button size='sm' variant='secondary' onClick={() => act('pause', {}, 'Paused')}>Pause</Button>}
                    {targets.some((t) => t.status === 'paused') && <Button size='sm' variant='secondary' onClick={() => act('resume', {}, 'Resumed')}>Resume</Button>}
                    {targets.some((t) => OPEN.includes(t.status) || ['failed', 'manual'].includes(t.status)) && <Button size='sm' variant='danger' onClick={async () => { if (await ask('Cancel all pending publications for this post?', 'Cancel publications')) act('cancel', {}, 'Cancelled'); }}>Cancel</Button>}
                </div>
            )}
            <button className='mt-3 text-xs text-brand' onClick={async () => setLogs(logs ? null : (await A.get('/api/w/' + ws.id + '/posts/' + post.id + '/logs')).items)}>{logs ? 'Hide publishing log' : 'Show publishing log'}</button>
            {logs && (logs.length === 0 ? <p className='mt-2 text-xs text-muted'>No attempts yet.</p> : <ul className='mt-2 space-y-1.5 text-[11px]'>{logs.map((l) => <li key={l.id} className={l.level === 'error' ? 'text-bad' : 'text-muted'}>{timeAgo(l.at)} · {l.platform} · attempt {l.attempt}: {l.message}</li>)}</ul>)}
        </Card>
    );
}

function Evergreen({ post, accounts, onChange }: { post: any; accounts: any[]; onChange: (p: any) => void }) {
    const { ws, tz, can, toast } = useWs();
    const eg = post.evergreen || {};
    const [f, setF] = useState<any>({ enabled: !!eg.enabled, interval: eg.interval || 'weekly', startDate: eg.startDate || ymdInTz(Date.now() + 7 * 86400000, tz), endDate: eg.endDate || '', time: eg.time || '09:00', maxReposts: eg.maxReposts || 12, paused: !!eg.paused, accountIds: eg.accountIds || [] });
    const [busy, setBusy] = useState(false);
    const ok = ws.plan.features.evergreen;
    const save = async () => {
        setBusy(true);
        try {
            const r = await A.put('/api/w/' + ws.id + '/posts/' + post.id + '/evergreen', f);
            onChange(r.post);
            toast('Evergreen settings saved');
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Card className='p-4'>
            <div className='mb-2 flex items-center justify-between'><h3 className='text-sm font-semibold'>Evergreen recycling</h3>{ok ? <Toggle on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label='Enable evergreen' /> : <Badge tone='accent'>Pro</Badge>}</div>
            {!ok ? <p className='text-xs text-muted'>Automatically repost your best content weekly or monthly. Available on Pro and above.</p> : (
                <>
                    <p className='mb-3 text-[11px] text-muted'>Each repost is a fresh copy scheduled for the chosen accounts. A new one is never created while the previous one is still pending, and reposting stops at your maximum.</p>
                    {f.enabled && (
                        <div className='space-y-3'>
                            <div className='grid grid-cols-2 gap-2'>
                                <Field label='Repeat'><select className='input' value={f.interval} onChange={(e) => setF({ ...f, interval: e.target.value })}><option value='weekly'>Every week</option><option value='monthly'>Every month</option></select></Field>
                                <Field label='Time'><input type='time' className='input' value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
                                <Field label='Start date'><input type='date' className='input' value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
                                <Field label='End date (optional)'><input type='date' className='input' value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
                                <Field label='Maximum reposts'><input type='number' min={1} max={100} className='input' value={f.maxReposts} onChange={(e) => setF({ ...f, maxReposts: Number(e.target.value) })} /></Field>
                                <div className='flex items-end gap-2 pb-2 text-sm'><Toggle on={f.paused} onChange={(v) => setF({ ...f, paused: v })} label='Pause' />Paused</div>
                            </div>
                            <div><span className='label'>Recycle to</span><div className='flex flex-wrap gap-1.5'>{accounts.map((a) => <button key={a.id} onClick={() => setF({ ...f, accountIds: f.accountIds.includes(a.id) ? f.accountIds.filter((x: string) => x !== a.id) : [...f.accountIds, a.id] })} className={cx('rounded-lg border px-2.5 py-1 text-xs', f.accountIds.includes(a.id) ? 'border-brand bg-brand text-white' : 'border-line')}>{a.displayName || a.handle}</button>)}</div></div>
                            {eg.count > 0 && <p className='text-xs text-muted'>{eg.count} repost{eg.count === 1 ? '' : 's'} so far{eg.lastRepostAt ? ', last ' + fmtDateTime(eg.lastRepostAt, tz) : ''}.</p>}
                        </div>
                    )}
                    {can('post.write') && <Button className='mt-3' size='sm' loading={busy} onClick={save}>Save evergreen</Button>}
                </>
            )}
        </Card>
    );
}

function Comments({ post }: { post: any }) {
    const { ws, can, toast } = useWs();
    const [items, setItems] = useState<any[]>([]);
    const [text, setText] = useState('');
    const load = () => A.get('/api/w/' + ws.id + '/posts/' + post.id + '/comments').then((r) => setItems(r.items)).catch(() => undefined);
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [post.id]);
    const send = async () => {
        try {
            await A.post('/api/w/' + ws.id + '/posts/' + post.id + '/comments', { text });
            setText('');
            load();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    return (
        <Card className='p-4'>
            <h3 className='mb-3 text-sm font-semibold'>Comments and revisions</h3>
            {items.length === 0 ? <p className='mb-2 text-xs text-muted'>No comments yet.</p> : <ul className='mb-3 space-y-2'>{items.map((c) => <li key={c.id} className='rounded-xl bg-surface2 p-2.5 text-xs'><b>{c.name}</b> <span className='text-muted'>{timeAgo(c.at)}</span><div className='mt-0.5'>{c.text}</div></li>)}</ul>}
            {can('comment') && <div className='flex gap-2'><input className='input' placeholder='Add a comment' value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && send()} /><Button size='sm' disabled={!text.trim()} onClick={send}>Send</Button></div>}
            {(post.revisions || []).length > 0 && (
                <details className='mt-3 text-xs'><summary className='cursor-pointer text-muted'>{post.revisions.length} earlier revision{post.revisions.length === 1 ? '' : 's'}</summary><ul className='mt-2 space-y-1.5'>{[...post.revisions].reverse().map((r: any, i: number) => <li key={i} className='text-muted'>{timeAgo(r.at)} by {r.by}: {r.caption || r.title || '(empty)'}</li>)}</ul></details>
            )}
        </Card>
    );
}

export default function Composer({ id, query }: { id: string; query: Record<string, string> }) {
    const { ws, tz, meta, can, role, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const isNew = id === 'new';
    const writable = can('post.write');
    const [post, setPost] = useState<any>(null);
    const [ready, setReady] = useState(isNew);
    const [form, setForm] = useState<any>({ title: '', caption: '', hashtags: '', link: '', altText: '', mediaIds: [], variants: {}, brandId: '', thumbnailMediaId: '' });
    const [sel, setSel] = useState<string[]>([]);
    const [tab, setTab] = useState('base');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [media, setMedia] = useState<any[]>([]);
    const [brands, setBrands] = useState<any[]>([]);
    const [issues, setIssues] = useState<any[]>([]);
    const [mode, setMode] = useState('schedule');
    const [date, setDate] = useState(query.date || ymdInTz(Date.now() + 86400000, tz));
    const [time, setTime] = useState('09:00');
    const [perAcc, setPerAcc] = useState(false);
    const [times, setTimes] = useState<Record<string, { date: string; time: string }>>({});
    const [busy, setBusy] = useState('');
    const [picker, setPicker] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [suggest, setSuggest] = useState<any>(null);

    const hydrate = (p: any) => {
        setPost(p);
        const variants: any = {};
        for (const [k, v] of Object.entries<any>(p.variants || {})) variants[k] = { ...v, hashtagsText: (v.hashtags || []).join(' ') };
        setForm({ title: p.title || '', caption: p.caption || '', hashtags: (p.hashtags || []).join(' '), link: p.link || '', altText: p.altText || '', mediaIds: p.mediaIds || [], variants, brandId: p.brandId || '', thumbnailMediaId: p.thumbnailMediaId || '' });
        const open = (p.targets || []).filter((t: any) => ['queued', 'paused', 'awaiting_approval', 'failed', 'manual'].includes(t.status));
        if (open.length) {
            setSel(Array.from(new Set<string>(open.map((t: any) => t.accountId))));
            setDate(ymdInTz(Date.parse(open[0].scheduledAt), tz));
            setTime(hmInTz(Date.parse(open[0].scheduledAt), tz));
        }
    };
    const loadMedia = () => A.get('/api/w/' + ws.id + '/media').then((m) => setMedia(m.items)).catch(() => undefined);

    useEffect(() => {
        let off = false;
        (async () => {
            try {
                const [a, m, b] = await Promise.all([A.get('/api/w/' + ws.id + '/accounts'), A.get('/api/w/' + ws.id + '/media'), A.get('/api/w/' + ws.id + '/brands')]);
                if (off) return;
                setAccounts(a.accounts);
                setMedia(m.items);
                setBrands(b.brands);
                if (!isNew) {
                    const r = await A.get('/api/w/' + ws.id + '/posts/' + id);
                    if (off) return;
                    hydrate(r.post);
                }
            } catch (e: any) {
                toast(e.message, 'err');
            } finally {
                if (!off) setReady(true);
            }
        })();
        return () => {
            off = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const payload = () => {
        const variants: any = {};
        for (const [k, v] of Object.entries<any>(form.variants)) {
            const c: any = {};
            for (const [kk, vv] of Object.entries<any>(v)) {
                if (kk === 'hashtagsText') {
                    const t = tagsOf(vv || '');
                    if (t.length) c.hashtags = t;
                } else if (kk === 'opts') {
                    if (Object.keys(vv || {}).length) c.opts = vv;
                } else if (kk !== 'hashtags' && vv !== '' && vv !== undefined) c[kk] = vv;
            }
            if (Object.keys(c).length) variants[k] = c;
        }
        return { title: form.title, caption: form.caption, hashtags: tagsOf(form.hashtags), link: form.link, altText: form.altText, mediaIds: form.mediaIds, variants, brandId: form.brandId, thumbnailMediaId: form.thumbnailMediaId };
    };

    const selAccounts = accounts.filter((a) => sel.includes(a.id));
    const selPlatforms: string[] = Array.from(new Set<string>(selAccounts.map((a) => a.platform)));
    useEffect(() => {
        if (!selPlatforms.length) {
            setIssues([]);
            return;
        }
        const t = setTimeout(async () => {
            try {
                setIssues((await A.post('/api/w/' + ws.id + '/posts/validate', { ...payload(), platforms: selPlatforms })).issues);
            } catch {
                /* validation is advisory here; the server checks again on schedule */
            }
        }, 700);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(form), sel.join(',')]);

    const eff = (pid: string) => {
        const v = form.variants[pid] || {};
        const tags = v.hashtagsText ? tagsOf(v.hashtagsText) : tagsOf(form.hashtags);
        return { caption: v.caption || form.caption, title: v.title || form.title, link: v.link || form.link, tags, format: v.format || P[pid].formats[0].value, opts: v.opts || {} };
    };
    const setVar = (pid: string, patch: any) => setForm({ ...form, variants: { ...form.variants, [pid]: { ...(form.variants[pid] || {}), ...patch } } });
    const mediaObjs = form.mediaIds.map((m: string) => media.find((x) => x.id === m)).filter(Boolean);
    const needsApproval = role === 'creator' || (ws.plan.features.approvals && ws.approvalPolicy === 'everyone');

    const ensureSaved = async (extra: any = {}) => {
        const body = { ...payload(), ...extra };
        const r = post ? await A.put('/api/w/' + ws.id + '/posts/' + post.id, body) : await A.post('/api/w/' + ws.id + '/posts', body);
        setPost(r.post);
        return r.post;
    };
    const saveDraft = async () => {
        setBusy('save');
        try {
            const p = await ensureSaved();
            toast('Draft saved');
            if (isNew) window.location.replace('#/studio/' + p.id);
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const saveTemplate = async () => {
        setBusy('tpl');
        try {
            await A.post('/api/w/' + ws.id + '/posts', { ...payload(), isTemplate: true });
            toast('Saved as a reusable template');
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const schedule = async () => {
        setBusy('go');
        try {
            const p = await ensureSaved();
            const targets = sel.map((aid) => ({ accountId: aid, ...(perAcc ? times[aid] || { date, time } : { date, time }), tz }));
            const r = await A.post('/api/w/' + ws.id + '/posts/' + p.id + '/schedule', { mode, tz, targets });
            setPost(r.post);
            toast(r.approval ? 'Submitted for approval' : mode === 'now' ? 'Publishing started' : 'Scheduled');
            window.location.replace('#/studio/' + p.id);
        } catch (e: any) {
            if (e.data?.issues) setIssues(e.data.issues);
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const decide = async (path: string, body: any) => {
        try {
            const r = await A.post('/api/w/' + ws.id + '/posts/' + post.id + '/' + path, body);
            setPost(r.post);
            toast(path === 'approve' ? 'Approved' : 'Changes requested');
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    const suggestTimes = async (pid: string) => {
        try {
            setSuggest({ pid, ...(await A.get('/api/w/' + ws.id + '/smart-times?platform=' + pid + '&count=4')) });
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };

    if (!ready) return <Spinner />;
    const issueList = issues.filter((i) => i.level === 'error');
    const warnList = issues.filter((i) => i.level === 'warn');
    const curP = tab !== 'base' && P[tab] ? tab : selPlatforms[0];
    const curEff = curP ? eff(curP) : null;
    const curAcc = selAccounts.find((a) => a.platform === curP);

    return (
        <div className='fade-in'>
            <div className='mb-5 flex flex-wrap items-center gap-2'>
                <Button variant='ghost' size='sm' onClick={() => go('studio')}><ArrowLeft size={14} />Studio</Button>
                <h1 className='text-xl font-semibold'>{post ? 'Edit post' : 'New post'}</h1>
                {post && <StatusBadge status={post.status} />}
                <div className='flex-1' />
                {writable && <Button variant='secondary' size='sm' loading={busy === 'tpl'} onClick={saveTemplate}>Save as template</Button>}
                {post && writable && <Button variant='secondary' size='sm' onClick={async () => { const r = await A.post('/api/w/' + ws.id + '/posts/' + post.id + '/duplicate'); go('studio/' + r.post.id); }}><Copy size={14} />Duplicate</Button>}
                {post && can('post.delete') && <Button variant='ghost' size='sm' onClick={async () => { if (await ask('Delete this post and cancel its scheduled publications?', 'Delete')) { await A.del('/api/w/' + ws.id + '/posts/' + post.id); go('studio'); } }}><Trash2 size={14} />Delete</Button>}
                {writable && <Button size='sm' loading={busy === 'save'} onClick={saveDraft}>Save draft</Button>}
            </div>
            {!writable && <Card className='mb-4 p-3 text-sm text-muted'>You have view-only access to this post.</Card>}
            {post?.approval?.status === 'changes_requested' && <Card className='mb-4 border-warn/50 bg-warn/5 p-3 text-sm'>Changes requested{post.approval.by ? ' by ' + post.approval.by : ''}: {post.approval.note || 'see comments'}</Card>}
            {post?.status === 'pending_approval' && can('post.approve') && (
                <Card className='mb-4 flex flex-wrap items-center gap-3 border-brand/50 bg-brand/5 p-3 text-sm'>
                    <span className='flex-1'>This post is waiting for approval and will not publish until approved.</span>
                    <Button size='sm' onClick={() => decide('approve', {})}>Approve</Button>
                    <Button size='sm' variant='secondary' onClick={() => { const note = window.prompt('What should change?') ; if (note !== null) decide('reject', { note }); }}>Request changes</Button>
                </Card>
            )}

            <div className='grid gap-4 lg:grid-cols-[1fr_380px]'>
                <div className='space-y-4'>
                    <Card className='space-y-3 p-5'>
                        <div className='flex items-center justify-between'><h3 className='text-sm font-semibold'>Content</h3>{writable && <Button size='sm' variant='secondary' onClick={() => setAiOpen(true)}><Sparkles size={14} />AI assist</Button>}</div>
                        <Field label='Title (used by YouTube and Pinterest)'><input className='input' disabled={!writable} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></Field>
                        <Field label='Caption'><textarea className='input' rows={6} disabled={!writable} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder='Write once. Customise per platform below.' /></Field>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <Field label='Hashtags (space or comma separated)'><input className='input' disabled={!writable} value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder='#launch #newarrivals' /></Field>
                            <Field label='Link (where supported)'><input className='input' disabled={!writable} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder='https://' /></Field>
                        </div>
                        <Field label='Alternative text for images'><input className='input' disabled={!writable} value={form.altText} onChange={(e) => setForm({ ...form, altText: e.target.value })} /></Field>
                        {brands.length > 1 && <Field label='Brand'><select className='input' disabled={!writable} value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}><option value=''>No brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>}
                    </Card>

                    <Card className='p-5'>
                        <div className='mb-3 flex items-center justify-between'><h3 className='text-sm font-semibold'>Media</h3>{writable && <Button size='sm' variant='secondary' onClick={() => setPicker(true)}><Img size={14} />Choose from library</Button>}</div>
                        {mediaObjs.length === 0 ? <p className='text-sm text-muted'>No media attached. Add images or a video from your library, or upload new files there.</p> : (
                            <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                                {mediaObjs.map((m: any, i: number) => (
                                    <div key={m.id} className='group relative aspect-square overflow-hidden rounded-xl bg-surface2'>
                                        {m.kind === 'video' ? <div className='flex h-full items-center justify-center text-muted'><Film size={24} /></div> : <img src={m.url} alt={m.name} className='h-full w-full object-cover' />}
                                        <span className='absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white'>{i + 1}</span>
                                        {writable && <button aria-label={'Remove ' + m.name} className='absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white' onClick={() => setForm({ ...form, mediaIds: form.mediaIds.filter((x: string) => x !== m.id) })}><X size={12} /></button>}
                                        {writable && i > 0 && <button className='absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-[10px] text-white' onClick={() => { const a = [...form.mediaIds]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setForm({ ...form, mediaIds: a }); }}>Earlier</button>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {mediaObjs.some((m: any) => m.kind === 'video') && (
                            <Field label='Thumbnail or cover image'><select className='input mt-3' disabled={!writable} value={form.thumbnailMediaId} onChange={(e) => setForm({ ...form, thumbnailMediaId: e.target.value })}><option value=''>Platform default</option>{media.filter((m) => m.kind === 'image').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
                        )}
                    </Card>

                    <Card className='p-5'>
                        <h3 className='mb-3 text-sm font-semibold'>Where to publish</h3>
                        {accounts.length === 0 ? <p className='text-sm text-muted'>No accounts yet. <a className='text-brand underline' href='#/accounts'>Add a social account</a> first.</p> : (
                            <div className='flex flex-wrap gap-2'>
                                {accounts.map((a) => {
                                    const on = sel.includes(a.id);
                                    return <button key={a.id} disabled={!writable} onClick={() => { setSel(on ? sel.filter((x) => x !== a.id) : [...sel, a.id]); }} className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition', on ? 'border-brand bg-brand/10' : 'border-line hover:bg-surface2')}>{P[a.platform] && <PlatformChip p={P[a.platform]} size={22} />}<span className='max-w-[140px] truncate'>{a.displayName || a.handle}</span></button>;
                                })}
                            </div>
                        )}
                        {selPlatforms.length > 0 && (
                            <div className='mt-5'>
                                <div className='mb-3 flex flex-wrap gap-1.5'>
                                    {[['base', 'Shared'], ...selPlatforms.map((p) => [p, P[p].name])].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg border px-3 py-1.5 text-xs font-medium', (tab === k || (k === 'base' && !P[tab])) ? 'border-brand bg-brand text-white' : 'border-line')}>{l}</button>)}
                                </div>
                                {tab !== 'base' && P[tab] && selPlatforms.includes(tab) ? (() => {
                                    const p = P[tab];
                                    const v = form.variants[tab] || {};
                                    const e = eff(tab);
                                    const len = compose(e.caption, e.tags).length;
                                    return (
                                        <div className='space-y-3 rounded-xl border border-line p-4'>
                                            <div className='text-xs text-muted'>{p.name}: {p.aspect}. Leave a field empty to use the shared content.</div>
                                            {p.formats.length > 1 && <Field label='Format'><select className='input' disabled={!writable} value={e.format} onChange={(ev) => setVar(tab, { format: ev.target.value })}>{p.formats.map((f: any) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></Field>}
                                            {p.hasTitle && <Field label={'Title' + (p.titleRequired ? ' (required)' : '')}><input className='input' disabled={!writable} value={v.title || ''} placeholder={form.title} maxLength={p.titleMax || 200} onChange={(ev) => setVar(tab, { title: ev.target.value })} /></Field>}
                                            <Field label={p.captionLabel}><textarea className='input' rows={4} disabled={!writable} value={v.caption || ''} placeholder={form.caption} onChange={(ev) => setVar(tab, { caption: ev.target.value })} /></Field>
                                            <div className={cx('text-right text-[11px]', len > p.captionMax ? 'font-semibold text-bad' : 'text-muted')}>{len.toLocaleString()} / {p.captionMax.toLocaleString()}{p.hashtagMax ? ' · max ' + p.hashtagMax + ' hashtags' : ''}</div>
                                            <Field label='Hashtags for this platform'><input className='input' disabled={!writable} value={v.hashtagsText || ''} placeholder={form.hashtags} onChange={(ev) => setVar(tab, { hashtagsText: ev.target.value })} /></Field>
                                            {p.hasLink && <Field label='Link'><input className='input' disabled={!writable} value={v.link || ''} placeholder={form.link} onChange={(ev) => setVar(tab, { link: ev.target.value })} /></Field>}
                                            {p.fields.map((f: any) => {
                                                const cur = (v.opts || {})[f.key] ?? f.default ?? (f.type === 'toggle' ? false : '');
                                                const setO = (val: any) => setVar(tab, { opts: { ...(v.opts || {}), [f.key]: val } });
                                                return f.type === 'toggle' ? <div key={f.key} className='flex items-center justify-between text-sm'>{f.label}<Toggle on={!!cur} onChange={setO} label={f.label} /></div> : f.type === 'select' ? <Field key={f.key} label={f.label}><select className='input' disabled={!writable} value={cur} onChange={(ev) => setO(ev.target.value)}>{f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field> : <Field key={f.key} label={f.label} hint={f.help}><input className='input' disabled={!writable} value={cur} onChange={(ev) => setO(ev.target.value)} /></Field>;
                                            })}
                                            {p.notes.map((n: string) => <p key={n} className='text-[11px] text-muted'>{n}</p>)}
                                        </div>
                                    );
                                })() : <p className='text-xs text-muted'>Pick a platform tab to customise its caption, format and options.</p>}
                            </div>
                        )}
                    </Card>

                    {writable && can('post.schedule') && (
                        <Card className='p-5'>
                            <h3 className='mb-3 text-sm font-semibold'>Schedule</h3>
                            <div className='mb-3 flex gap-2'>{[['schedule', 'Schedule for later'], ['now', 'Publish now']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={cx('rounded-xl border px-4 py-2 text-sm font-medium', mode === k ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>{l}</button>)}</div>
                            {mode === 'schedule' && (
                                <div className='space-y-3'>
                                    {!perAcc ? (
                                        <div className='flex flex-wrap items-end gap-2'>
                                            <Field label='Date'><input type='date' className='input' value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                                            <Field label={'Time (' + tz + ')'}><input type='time' className='input' value={time} onChange={(e) => setTime(e.target.value)} /></Field>
                                            {selPlatforms[0] && <Button size='sm' variant='secondary' onClick={() => suggestTimes(selPlatforms[0])}>Suggest times</Button>}
                                        </div>
                                    ) : (
                                        <div className='space-y-2'>{selAccounts.map((a) => {
                                            const t = times[a.id] || { date, time };
                                            return <div key={a.id} className='flex flex-wrap items-center gap-2'><span className='w-36 truncate text-sm'>{a.displayName || a.handle}</span><input type='date' className='input !w-auto' value={t.date} onChange={(e) => setTimes({ ...times, [a.id]: { ...t, date: e.target.value } })} /><input type='time' className='input !w-auto' value={t.time} onChange={(e) => setTimes({ ...times, [a.id]: { ...t, time: e.target.value } })} /><button className='text-xs text-brand' onClick={() => suggestTimes(a.platform)}>Suggest</button></div>;
                                        })}</div>
                                    )}
                                    <label className='flex items-center gap-2 text-sm'><Toggle on={perAcc} onChange={(v) => { setPerAcc(v); if (v) { const t: any = {}; sel.forEach((s) => (t[s] = times[s] || { date, time })); setTimes(t); } }} label='Different time per account' />Use a different time for each account</label>
                                    {suggest && (
                                        <div className='rounded-xl bg-surface2 p-3'>
                                            <div className='mb-2 text-[11px] text-muted'>{suggest.note}</div>
                                            <div className='flex flex-wrap gap-1.5'>{suggest.slots.map((s: any) => <button key={s.iso} className='rounded-lg border border-line bg-surface px-2.5 py-1 text-xs hover:border-brand' onClick={() => { if (perAcc) { const acc = selAccounts.find((a) => a.platform === suggest.pid); if (acc) setTimes({ ...times, [acc.id]: { date: s.date, time: s.time } }); } else { setDate(s.date); setTime(s.time); } }}>{s.date} {s.time}</button>)}{suggest.slots.length === 0 && <span className='text-xs text-muted'>No free slots found.</span>}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {issueList.length > 0 && <div className='mt-4 space-y-1 rounded-xl bg-bad/10 p-3 text-xs text-bad'><div className='flex items-center gap-1.5 font-semibold'><AlertTriangle size={14} />Fix before scheduling</div>{issueList.map((i, k) => <div key={k}>{i.message}</div>)}</div>}
                            {needsApproval && <p className='mt-3 text-xs text-muted'>Your role requires approval, so this will be submitted for review and will not publish until approved.</p>}
                            <Button className='mt-4' loading={busy === 'go'} disabled={!sel.length || issueList.length > 0} onClick={schedule}>{needsApproval ? 'Submit for approval' : mode === 'now' ? 'Publish now' : 'Schedule post'}{sel.length > 0 && ' to ' + sel.length + ' account' + (sel.length === 1 ? '' : 's')}</Button>
                        </Card>
                    )}
                </div>

                <div className='space-y-4'>
                    <div className='lg:sticky lg:top-0 lg:space-y-4'>
                        {selPlatforms.length > 1 && <div className='mb-2 flex flex-wrap gap-1.5'>{selPlatforms.map((p) => <button key={p} onClick={() => setTab(p)} className={cx('rounded-lg border px-2.5 py-1 text-xs', curP === p ? 'border-brand bg-brand/10 text-brand' : 'border-line')}>{P[p].name}</button>)}</div>}
                        <Preview platform={curP || 'Preview'} p={curP ? P[curP] : null} account={curAcc} text={curEff ? compose(curEff.caption, curEff.tags) : compose(form.caption, tagsOf(form.hashtags))} media={mediaObjs} limit={curP ? P[curP].captionMax : 2200} over={curEff && curP ? compose(curEff.caption, curEff.tags).length > P[curP].captionMax : false} />
                        {warnList.length > 0 && <Card className='mt-4 space-y-1 border-warn/50 bg-warn/5 p-3 text-xs'>{warnList.map((w, k) => <div key={k}>{w.message}</div>)}</Card>}
                        {post && <div className='mt-4 space-y-4'><Targets post={post} onChange={setPost} /><Evergreen post={post} accounts={accounts} onChange={setPost} /><Comments post={post} /></div>}
                    </div>
                </div>
            </div>
            {picker && <MediaPicker selected={form.mediaIds} onChange={(ids) => setForm({ ...form, mediaIds: ids })} onClose={() => { setPicker(false); loadMedia(); }} />}
            {aiOpen && <AiHelper platform={curP} current={form.caption} onCaption={(t) => setForm({ ...form, caption: t })} onTags={(t) => setForm({ ...form, hashtags: Array.from(new Set(tagsOf(form.hashtags).concat(t))).join(' ') })} onClose={() => setAiOpen(false)} />}
        </div>
    );
}
