import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs, go } from '../lib/hooks';
import { Button, Card, Empty, Field, Modal, PageHeader, PlatformChip, Spinner, StatusBadge, STATUS_COLOR, Tabs, cx } from '../lib/ui';
import { fmtDateTime, hmInTz, ymdInTz } from '../lib/format';
import { addDays, addMonths, monthGrid, niceDay, weekStart } from '../lib/time';

const OPEN = ['queued', 'paused', 'awaiting_approval'];

export default function Calendar() {
    const { ws, tz, meta, can, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const today = ymdInTz(Date.now(), tz);
    const [view, setView] = useState('month');
    const [cursor, setCursor] = useState(today);
    const [fp, setFp] = useState('');
    const [fb, setFb] = useState('');
    const [fa, setFa] = useState('');
    const [sel, setSel] = useState<any>(null);
    const [moveTo, setMoveTo] = useState({ date: '', time: '' });
    const { data, loading, reload } = useLoad(async () => {
        const [posts, accounts, brands] = await Promise.all([A.get('/api/w/' + ws.id + '/posts'), A.get('/api/w/' + ws.id + '/accounts'), A.get('/api/w/' + ws.id + '/brands')]);
        return { posts: posts.posts as any[], accounts: accounts.accounts as any[], brands: brands.brands as any[] };
    }, [ws.id]);
    const canMove = can('post.schedule');

    const { items, drafts } = useMemo(() => {
        const items: any[] = [];
        const drafts: any[] = [];
        for (const p of data?.posts || []) {
            const live = (p.targets || []).filter((t: any) => t.status !== 'cancelled');
            if (!live.length) {
                if (p.status === 'draft') drafts.push(p);
                continue;
            }
            for (const t of live) {
                const at = t.status === 'published' && t.publishedAt ? t.publishedAt : t.scheduledAt;
                items.push({ ...t, at, post: p, title: p.title || String(p.caption || '').slice(0, 40) || 'Untitled post' });
            }
        }
        return { items: items.filter((i) => (!fp || i.platform === fp) && (!fa || i.accountId === fa) && (!fb || i.post.brandId === fb)), drafts };
    }, [data, fp, fa, fb]);
    const byDay = useMemo(() => {
        const m: Record<string, any[]> = {};
        for (const i of items) (m[ymdInTz(Date.parse(i.at), tz)] ||= []).push(i);
        for (const k of Object.keys(m)) m[k].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        return m;
    }, [items, tz]);

    const step = (n: number) => setCursor(view === 'month' ? addMonths(cursor, n) : addDays(cursor, view === 'week' ? 7 * n : n));
    const title = view === 'month' ? niceDay(cursor, { month: 'long', year: 'numeric' }) : view === 'week' ? niceDay(weekStart(cursor)) + ' to ' + niceDay(addDays(weekStart(cursor), 6)) : niceDay(cursor, { weekday: 'long', day: 'numeric', month: 'long' });

    const drop = async (ymd: string, e: React.DragEvent) => {
        e.preventDefault();
        const [postId, targetId] = e.dataTransfer.getData('text/plain').split('|');
        const it = items.find((i) => i.id === targetId && i.post.id === postId);
        if (!it || !OPEN.includes(it.status) || !canMove) return;
        try {
            await A.post('/api/w/' + ws.id + '/posts/' + postId + '/reschedule', { targetId, date: ymd, time: hmInTz(Date.parse(it.scheduledAt), tz), tz });
            toast('Rescheduled to ' + niceDay(ymd));
            reload();
        } catch (err: any) {
            toast(err.message, 'err');
        }
    };

    const chip = (i: any) => (
        <button key={i.id} draggable={OPEN.includes(i.status) && canMove} onDragStart={(e) => e.dataTransfer.setData('text/plain', i.post.id + '|' + i.id)} onClick={(e) => { e.stopPropagation(); setSel(i); setMoveTo({ date: ymdInTz(Date.parse(i.scheduledAt), tz), time: hmInTz(Date.parse(i.scheduledAt), tz) }); }}
            className='calendar-event' style={{ borderLeftColor: STATUS_COLOR[i.status] || '#94a3b8', backgroundColor: `color-mix(in srgb, ${P[i.platform]?.color || '#1b65e8'} 10%, rgb(var(--surface)))` }} title={i.title + ' (' + i.status + ')'}>
            <span className='calendar-event-mark' style={{ backgroundColor: P[i.platform]?.color || '#1b65e8' }} />
            <span className='calendar-event-time'>{hmInTz(Date.parse(i.at), tz)}</span>
            <span className='min-w-0 flex-1 truncate'>{i.title}</span>
            {i.status === 'published' && <CheckCircle2 size={11} className='shrink-0 text-ok' />}
        </button>
    );

    const cell = (ymd: string, inMonth = true, tall = false) => (
        <div key={ymd} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(ymd, e)} className={cx('calendar-day group', tall && 'calendar-day-tall', !inMonth && 'calendar-day-outside', ymd === today && 'calendar-day-today')}>
            <div className='mb-1 flex items-center justify-between'>
            <span className={cx('calendar-day-number', ymd === today && 'calendar-day-number-today')}>{ymd.slice(8)}</span>
                {can('post.write') && <button aria-label={'New post on ' + ymd} className='invisible rounded p-0.5 text-muted hover:bg-line group-hover:visible' onClick={() => go('studio/new?date=' + ymd)}><Plus size={13} /></button>}
            </div>
            <div className='space-y-1'>{(byDay[ymd] || []).slice(0, tall ? 50 : 3).map(chip)}{!tall && (byDay[ymd] || []).length > 3 && <button className='px-1 text-[10px] font-semibold text-brand' onClick={() => { setCursor(ymd); setView('day'); }}>+{byDay[ymd].length - 3} more</button>}</div>
        </div>
    );

    const act = async (path: string, body: any, ok: string) => {
        try {
            await A.post('/api/w/' + ws.id + '/posts/' + sel.post.id + '/' + path, body);
            toast(ok);
            setSel(null);
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };

    const listItems = [...items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const nextWeek = items.filter((item) => OPEN.includes(item.status) && Date.parse(item.scheduledAt) >= Date.now() && Date.parse(item.scheduledAt) < Date.now() + 7 * 86400000);
    const channelCounts = Object.entries(items.reduce((counts: Record<string, number>, item) => { counts[item.platform] = (counts[item.platform] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
    return (
        <div className='fade-in'>
            <PageHeader title='Publishing calendar' subtitle='Plan and track content across every connected channel' actions={<>{can('post.write') && <Button className='!rounded-lg' onClick={() => go('studio/new')}><Plus size={15} />Create post</Button>}</>} />
            <div className='calendar-toolbar mb-4 flex flex-wrap items-center gap-2'>
                <Tabs tabs={[['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['list', 'List']]} value={view} onChange={setView} />
                <div className='flex items-center gap-1'>
                    <Button variant='secondary' size='sm' aria-label='Previous' onClick={() => step(-1)}><ChevronLeft size={14} /></Button>
                    <Button variant='secondary' size='sm' className='!rounded-lg' onClick={() => setCursor(today)}>Today</Button>
                    <Button variant='secondary' size='sm' aria-label='Next' onClick={() => step(1)}><ChevronRight size={14} /></Button>
                </div>
                <h2 className='min-w-[150px] text-sm font-bold'>{title}</h2>
                <div className='flex-1' />
                <select aria-label='Filter by platform' className='input !w-auto !rounded-lg !py-2 text-xs' value={fp} onChange={(e) => setFp(e.target.value)}><option value=''>All platforms</option>{Object.values<any>(P).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select aria-label='Filter by brand' className='input !w-auto !rounded-lg !py-2 text-xs' value={fb} onChange={(e) => setFb(e.target.value)}><option value=''>All brands</option>{(data?.brands || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                <select aria-label='Filter by account' className='input !w-auto !rounded-lg !py-2 text-xs' value={fa} onChange={(e) => setFa(e.target.value)}><option value=''>All accounts</option>{(data?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.displayName || a.handle}</option>)}</select>
            </div>
            <div className='mb-3 flex flex-wrap gap-3 px-1 text-[10px] font-medium text-muted'>{[['queued', 'Scheduled'], ['published', 'Published'], ['failed', 'Failed'], ['awaiting_approval', 'Needs approval'], ['paused', 'Paused'], ['manual', 'Manual']].map(([k, l]) => <span key={k} className='flex items-center gap-1.5'><i className='h-2 w-2 rounded-full' style={{ background: STATUS_COLOR[k] }} />{l}</span>)}</div>

            {loading && !data ? <Spinner /> : (
                <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]'>
                    <Card className='calendar-panel overflow-hidden'>
                        {view === 'month' && (
                            <div className='overflow-x-auto'><div className='min-w-[780px]'>
                                <div className='calendar-weekdays grid grid-cols-7 border-b border-line text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted'>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className='py-3'>{d}</div>)}</div>
                                <div className='grid grid-cols-7 border-l border-t border-line'>{monthGrid(cursor).map((d) => cell(d.ymd, d.inMonth))}</div>
                            </div></div>
                        )}
                        {view === 'week' && <div className='overflow-x-auto'><div className='grid min-w-[760px] grid-cols-7 border-l border-t border-line'>{Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)).map((d) => cell(d, true, true))}</div></div>}
                        {view === 'day' && <div className='border-l border-t border-line'>{cell(cursor, true, true)}</div>}
                        {view === 'list' && (listItems.length === 0 ? <Empty title='Nothing scheduled' text='Posts you schedule or publish are listed here in time order.' /> : (
                            <ul className='divide-y divide-line'>{listItems.map((i) => (
                                <li key={i.id} className='flex cursor-pointer items-center gap-3 p-3 hover:bg-surface2' onClick={() => { setSel(i); setMoveTo({ date: ymdInTz(Date.parse(i.scheduledAt), tz), time: hmInTz(Date.parse(i.scheduledAt), tz) }); }}>
                                    {P[i.platform] && <PlatformChip p={P[i.platform]} />}
                                    <div className='min-w-0 flex-1'><div className='truncate text-sm font-medium'>{i.title}</div><div className='text-xs text-muted'>{i.handle} · {fmtDateTime(i.at, tz)}</div></div>
                                    <StatusBadge status={i.status} />
                                </li>
                            ))}</ul>
                        ))}
                    </Card>
                    <div className='space-y-4'>
                        <Card className='h-fit p-4'><div className='mb-4 flex items-center justify-between'><div><h3 className='text-sm font-bold'>This week</h3><p className='mt-1 text-[10px] text-muted'>Upcoming publishing queue</p></div><CalendarDays size={16} className='text-brand' /></div>
                            <div className='grid grid-cols-2 gap-2'><div className='rounded-lg bg-brand/5 p-3'><div className='font-[Manrope] text-xl font-bold'>{nextWeek.length}</div><div className='mt-1 text-[10px] text-muted'>scheduled</div></div><div className='rounded-lg bg-[#fff4e6] p-3'><div className='font-[Manrope] text-xl font-bold'>{drafts.length}</div><div className='mt-1 text-[10px] text-muted'>drafts</div></div></div>
                            {channelCounts.length > 0 && <div className='mt-4 space-y-2 border-t border-line pt-3'>{channelCounts.map(([platform, count]) => <div key={platform} className='flex items-center gap-2 text-[11px]'><i className='h-2 w-2 rounded-full' style={{ background: P[platform]?.color || '#1b65e8' }} /><span className='flex-1 text-muted'>{P[platform]?.name || platform}</span><span className='font-semibold'>{count}</span></div>)}</div>}
                        </Card>
                        <Card className='h-fit p-4'><div className='mb-1 flex items-center justify-between'><h3 className='text-sm font-bold'>Unscheduled drafts</h3><span className='rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-semibold text-muted'>{drafts.length}</span></div><p className='mb-3 text-[10px] leading-relaxed text-muted'>Open a draft to finish it or add it to your schedule.</p>
                            {drafts.length === 0 ? <p className='rounded-lg bg-surface2/70 p-3 text-xs text-muted'>No drafts waiting.</p> : <ul className='space-y-1.5'>{drafts.slice(0, 12).map((draft) => <li key={draft.id}><button className='w-full truncate rounded-lg border border-line bg-surface2/70 px-2.5 py-2.5 text-left text-[11px] font-medium transition hover:border-brand/40 hover:bg-surface2' onClick={() => go('studio/' + draft.id)}>{draft.title || String(draft.caption || '').slice(0, 40) || 'Untitled draft'}</button></li>)}</ul>}
                        </Card>
                    </div>
                </div>
            )}

            {sel && (
                <Modal title={sel.title} onClose={() => setSel(null)}>
                    <div className='space-y-3 text-sm'>
                        <div className='flex flex-wrap items-center gap-2'>{P[sel.platform] && <PlatformChip p={P[sel.platform]} />}<span className='text-muted'>{sel.handle}</span><StatusBadge status={sel.status} /></div>
                        <div className='text-muted'>{sel.status === 'published' ? 'Published ' : 'Scheduled for '}{fmtDateTime(sel.at, tz)} ({tz})</div>
                        {sel.error && <div className='rounded-xl bg-bad/10 p-3 text-xs text-bad'>{sel.error}</div>}
                        {sel.externalUrl && <a className='text-xs text-brand underline' href={sel.externalUrl} target='_blank' rel='noreferrer'>View live post</a>}
                        {OPEN.includes(sel.status) && canMove && (
                            <div className='flex flex-wrap items-end gap-2'>
                                <Field label='Date'><input type='date' className='input' value={moveTo.date} onChange={(e) => setMoveTo({ ...moveTo, date: e.target.value })} /></Field>
                                <Field label='Time'><input type='time' className='input' value={moveTo.time} onChange={(e) => setMoveTo({ ...moveTo, time: e.target.value })} /></Field>
                                <Button variant='secondary' onClick={() => act('reschedule', { targetId: sel.id, date: moveTo.date, time: moveTo.time, tz }, 'Rescheduled')}>Reschedule</Button>
                            </div>
                        )}
                        <div className='flex flex-wrap gap-2 pt-2'>
                            <Button onClick={() => go('studio/' + sel.post.id)}>Open in studio</Button>
                            {can('post.write') && <Button variant='secondary' onClick={async () => { const r = await A.post('/api/w/' + ws.id + '/posts/' + sel.post.id + '/duplicate'); go('studio/' + r.post.id); }}>Duplicate</Button>}
                            {['failed', 'manual'].includes(sel.status) && canMove && <Button variant='secondary' onClick={() => act('retry', { targetId: sel.id }, 'Retry started')}>Retry</Button>}
                            {['failed', 'manual'].includes(sel.status) && canMove && <Button variant='secondary' onClick={() => act('mark-published', { targetId: sel.id }, 'Marked as published')}>I published it manually</Button>}
                            {OPEN.includes(sel.status) && canMove && <Button variant='danger' onClick={async () => { if (await ask('Cancel this scheduled post?', 'Cancel post')) act('cancel', {}, 'Cancelled'); }}>Cancel</Button>}
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
