import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, CircleHelp, FileText, Link2, Plus, Radio, Sparkles } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs, go } from '../lib/hooks';
import { Button, Card, Empty, PageHeader, PlatformChip, Spinner, Tabs, cx } from '../lib/ui';
import { fmtDateTime, hmInTz, timeAgo, ymdInTz } from '../lib/format';
import { addDays, niceDay, startOfDayMs, weekStart } from '../lib/time';

function Metric({ icon, label, value, note, tone, onClick }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string; onClick?: () => void }) {
    return <Card className={cx('metric-card p-4 sm:p-5', onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md')} onClick={onClick}>
        <div className='flex items-start justify-between gap-3'><div><div className='text-xs font-medium text-muted'>{label}</div><div className='mt-2 font-[Manrope] text-[30px] font-bold leading-none tracking-[-0.03em]'>{value.toLocaleString()}</div></div><div className={cx('flex h-10 w-10 items-center justify-center rounded-xl', tone)}>{icon}</div></div>
        <div className='mt-3 text-[11px] text-muted'>{note}</div>
    </Card>;
}

function TrendChart({ rows }: { rows: any[] }) {
    const width = 780;
    const height = 220;
    const bottom = 188;
    const max = Math.max(4, ...rows.map((row) => row.published + row.failed));
    const points = rows.map((row, index) => ({ x: rows.length < 2 ? width / 2 : index * width / (rows.length - 1), y: bottom - ((row.published + row.failed) / max) * 150 }));
    const line = points.map((point, index) => (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' ');
    const area = `${line} L ${width} ${bottom} L 0 ${bottom} Z`;
    const ticks = [0, Math.ceil(max / 2), max];
    return <div className='trend-chart'>
        <div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Publishing activity</h2><p className='mt-1 text-[11px] text-muted'>Posts successfully published and failed</p></div><div className='flex gap-3 text-[10px] text-muted'><span className='flex items-center gap-1.5'><i className='h-2 w-2 rounded-full bg-brand' />Published</span><span className='flex items-center gap-1.5'><i className='h-2 w-2 rounded-full bg-[#e16d65]' />Failed</span></div></div>
        {rows.some((row) => row.published || row.failed) ? <>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio='none' className='h-[210px] w-full overflow-visible' role='img' aria-label='Published and failed posts over time'>
                <defs><linearGradient id='publishFill' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stopColor='rgb(var(--brand))' stopOpacity='.22' /><stop offset='100%' stopColor='rgb(var(--brand))' stopOpacity='.015' /></linearGradient></defs>
                {ticks.map((tick) => { const y = bottom - (tick / max) * 150; return <g key={tick}><line x1='0' x2={width} y1={y} y2={y} stroke='rgb(var(--line))' strokeDasharray='3 5' /><text x='0' y={y - 5} fill='rgb(var(--muted))' fontSize='9'>{tick}</text></g>; })}
                <path d={area} fill='url(#publishFill)' />
                <path d={line} fill='none' stroke='rgb(var(--brand))' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' vectorEffect='non-scaling-stroke' />
                {points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r='4.5' fill='rgb(var(--brand))' stroke='rgb(var(--surface))' strokeWidth='2' vectorEffect='non-scaling-stroke' />}
            </svg>
            <div className='-mt-1 flex justify-between pl-1 text-[9px] text-muted'><span>{rows[0]?.date?.slice(5)}</span><span>{rows[Math.floor(rows.length / 2)]?.date?.slice(5)}</span><span>{rows[rows.length - 1]?.date?.slice(5)}</span></div>
        </> : <div className='flex h-[210px] items-center justify-center'><Empty title='No publishing activity yet' text='Your delivery trend will appear here after the first post goes live.' /></div>}
    </div>;
}

function WeekPlanner({ posts, media, platforms, tz }: { posts: any[]; media: any[]; platforms: Record<string, any>; tz: string }) {
    const today = ymdInTz(Date.now(), tz);
    const [week, setWeek] = useState(() => weekStart(today));
    const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
    const eventsByDay: Record<string, any[]> = {};
    const mediaById = Object.fromEntries(media.map((item) => [item.id, item]));
    for (const post of posts) {
        for (const target of post.targets || []) {
            if (target.status === 'cancelled') continue;
            const at = target.status === 'published' && target.publishedAt ? target.publishedAt : target.scheduledAt;
            if (!at) continue;
            const date = ymdInTz(Date.parse(at), tz);
            if (!days.includes(date)) continue;
            const cover = (post.mediaIds || []).map((id: string) => mediaById[id]).find((item: any) => item?.kind === 'image' && item.url);
            (eventsByDay[date] ||= []).push({ ...target, at, cover, post, title: post.title || String(post.caption || '').slice(0, 62) || 'Untitled post' });
        }
    }
    return <Card className='week-planner overflow-hidden'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5'>
            <div className='flex items-center gap-3'><span className='flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand'><CalendarDays size={18} /></span><div><h2 className='text-sm font-bold'>Content calendar</h2><p className='mt-0.5 text-[10px] text-muted'>{niceDay(week, { month: 'short', day: 'numeric' })} – {niceDay(addDays(week, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</p></div></div>
            <div className='flex items-center gap-1.5'><button className='rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-muted hover:bg-surface2 hover:text-ink' onClick={() => setWeek(weekStart(today))}>Today</button><button className='toolbar-icon h-8 w-8' aria-label='Previous week' onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={15} /></button><button className='toolbar-icon h-8 w-8' aria-label='Next week' onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={15} /></button><button className='ml-1 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-[10px] font-semibold text-ink' onClick={() => go('calendar')}>Week <span className='ml-2 text-muted'>Month</span></button></div>
        </div>
        <div className='week-scroll overflow-x-auto'>
            <div className='grid min-w-[1000px] grid-cols-7'>
                {days.map((date) => <section key={date} className={cx('week-column min-h-[310px] border-r border-line last:border-r-0', date === today && 'week-column-today')}>
                    <div className='border-b border-line px-3 py-3'><div className='text-[9px] font-semibold uppercase tracking-[0.08em] text-muted'>{niceDay(date, { weekday: 'short' })}</div><div className={cx('mt-1 inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-xs font-bold', date === today ? 'bg-brand text-white' : 'text-ink')}>{niceDay(date, { day: 'numeric' })}</div></div>
                    <div className='space-y-2 p-2'>
                        {(eventsByDay[date] || []).slice(0, 4).map((event) => <button key={event.id} onClick={() => go('studio/' + event.post.id)} className='week-event group w-full overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.035] text-left transition hover:border-white/15 hover:bg-white/[0.07]'>
                            {event.cover?.url ? <img src={event.cover.url} alt={event.cover.name || ''} loading='lazy' className='aspect-[16/9] w-full object-cover' onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <div className='flex aspect-[16/9] items-center justify-center bg-[linear-gradient(140deg,rgba(52,88,133,.4),rgba(22,31,48,.85))]'>{platforms[event.platform] && <PlatformChip p={platforms[event.platform]} size={28} />}</div>}
                            <span className='block p-2'><span className='flex items-center justify-between gap-1 text-[9px] text-white/55'><span>{hmInTz(Date.parse(event.at), tz)}</span><span className={cx('rounded px-1.5 py-0.5 font-semibold', event.status === 'published' ? 'bg-[#2d634e] text-[#b3ebce]' : event.status === 'awaiting_approval' ? 'bg-[#665234] text-[#ffe0a2]' : 'bg-[#304d77] text-[#c5dcff]')}>{event.status === 'queued' ? 'Scheduled' : event.status === 'awaiting_approval' ? 'Review' : event.status}</span></span><span className='mt-1.5 block line-clamp-2 text-[10px] font-semibold leading-snug text-white/90'>{event.title}</span><span className='mt-1.5 block truncate text-[9px] text-white/45'>{platforms[event.platform]?.name || event.platform}</span></span>
                        </button>)}
                        {date >= today && <button className='flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-white/10 py-2 text-[9px] text-white/35 transition hover:border-white/25 hover:text-white/70' onClick={() => go('studio/new?date=' + date)}><Plus size={12} />Add post</button>}
                    </div>
                </section>)}
            </div>
        </div>
    </Card>;
}

export default function Overview() {
    const { ws, tz, meta, can, user } = useWs();
    const [preset, setPreset] = useState('30');
    const [custom, setCustom] = useState({ from: '', to: '' });
    const [libraryFilter, setLibraryFilter] = useState('all');
    const range = useMemo(() => {
        const now = Date.now();
        if (preset === 'today') return { from: startOfDayMs(now, tz), to: now };
        if (preset === 'custom' && custom.from) return { from: new Date(custom.from + 'T00:00:00').getTime(), to: custom.to ? new Date(custom.to + 'T23:59:59').getTime() : now };
        const days = preset === 'custom' ? 30 : Number(preset);
        return { from: now - days * 86400000, to: now };
    }, [preset, custom.from, custom.to, tz]);
    const { data, loading, err } = useLoad(async () => {
        const [overview, accounts, posts, media] = await Promise.all([
            A.get('/api/w/' + ws.id + '/overview?from=' + range.from + '&to=' + range.to),
            A.get('/api/w/' + ws.id + '/accounts'),
            A.get('/api/w/' + ws.id + '/posts'),
            A.get('/api/w/' + ws.id + '/media'),
        ]);
        return { ...overview, accounts: accounts.accounts as any[], posts: posts.posts as any[], media: media.items as any[] };
    }, [ws.id, range.from, range.to]);
    const platforms: Record<string, any> = meta.platforms;
    const counts = data?.counts;
    const failures = (counts?.failed || 0) + (counts?.awaitingApproval || 0);
    const ready = (counts?.published || 0) + (counts?.failed || 0);
    const successRate = ready ? Math.round((counts.published / ready) * 100) : null;
    const today = ymdInTz(Date.now(), tz);
    const libraryMedia = (data?.media || []).filter((item: any) => libraryFilter === 'all' || item.kind === libraryFilter).slice(0, 6);
    return <div className='fade-in'>
        <section className='dashboard-photo-hero relative isolate mb-5 flex min-h-[250px] flex-col justify-between overflow-hidden rounded-[20px] border border-white/10 bg-[#0b1421] p-5 text-white sm:min-h-[270px] sm:p-7 lg:p-8'>
            <img className='absolute inset-0 -z-20 h-full w-full object-cover' src='https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2000&q=85' alt='' loading='eager' onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            <div className='absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,14,25,.94)_0%,rgba(9,18,31,.74)_48%,rgba(9,18,31,.18)_100%),linear-gradient(0deg,rgba(7,14,25,.48),transparent_62%)]' />
            <div className='flex items-center justify-between gap-3'><div className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/75'><span className='h-1.5 w-1.5 rounded-full bg-[#81d9b0]' />Sozial workspace</div><span className='rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[10px] font-medium text-white/80 backdrop-blur-md'>{niceDay(today, { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>
            <div className='mt-8 max-w-2xl'><h1 className='font-[Manrope] text-[29px] font-bold leading-tight sm:text-[36px]'>Welcome back, {(user.name || 'there').split(' ')[0]}.</h1><p className='mt-2 max-w-lg text-sm leading-relaxed text-white/75 sm:text-[15px]'>Plan a thoughtful week of publishing across every channel.</p>
                <div className='mt-5 flex flex-wrap items-center gap-2'><Tabs tabs={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["custom", "Custom"]]} value={preset} onChange={setPreset} />{can('post.write') && <Button className='!rounded-lg !border !border-white/20 !bg-white !text-[#152236] hover:!bg-white/90' onClick={() => go('studio/new')}><Plus size={15} />Create post</Button>}<button className='flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-black/15 px-3 text-xs font-medium text-white/90 backdrop-blur-md transition hover:bg-black/30' onClick={() => go('calendar')}><CalendarDays size={15} />Open calendar <ArrowUpRight size={13} /></button></div>
            </div>
        </section>
        {preset === 'custom' && <div className='mb-4 flex flex-wrap items-center gap-2'><input aria-label='Start date' type='date' className='input !w-auto' value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><span className='text-xs text-muted'>to</span><input aria-label='End date' type='date' className='input !w-auto' value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>}
        {err && <Card className='mb-4 border-bad p-4 text-sm text-bad'>{err}</Card>}
        {loading && !data ? <Spinner /> : data && <>
            <div className='mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4'>
                <Metric icon={<Link2 size={18} />} label='Connected channels' value={counts.accounts} note='Ready to publish' tone='bg-[#31445f] text-[#a9c8ff]' onClick={() => go('accounts')} />
                <Metric icon={<CalendarClock size={18} />} label='Scheduled posts' value={counts.scheduled} note='Waiting in your queue' tone='bg-[#244b48] text-[#7de0be]' onClick={() => go('calendar')} />
                <Metric icon={<CheckCircle2 size={18} />} label='Published' value={counts.published} note='Within this period' tone='bg-[#3a473b] text-[#b8e3a9]' />
                <Metric icon={<AlertTriangle size={18} />} label='Needs attention' value={failures} note={`${counts.failed} failed · ${counts.awaitingApproval} for approval`} tone='bg-[#554237] text-[#ffc58c]' onClick={() => go('calendar')} />
            </div>

            <div className='mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.75fr)]'>
                <WeekPlanner posts={data.posts} media={data.media} platforms={platforms} tz={tz} />
                <Card className='publishing-queue overflow-hidden'><div className='flex items-center justify-between border-b border-line px-4 py-4 sm:px-5'><div><h2 className='text-sm font-bold'>Publishing queue</h2><p className='mt-1 text-[10px] text-muted'>Next content leaving the studio</p></div><span className='rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-semibold text-[#a8c7ff]'>{data.upcoming.length} queued</span></div>
                    {data.upcoming.length ? <ul className='divide-y divide-white/[0.06]'>{data.upcoming.slice(0, 6).map((target: any) => <li key={target.id}><button className='flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035] sm:px-5' onClick={() => go('studio/' + target.postId)}>
                        {platforms[target.platform] ? <PlatformChip p={platforms[target.platform]} size={30} /> : <span className='flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-white/10'><Radio size={15} /></span>}<span className='min-w-0 flex-1'><span className='block truncate text-[11px] font-semibold text-white/90'>{target.title}</span><span className='mt-1 block text-[9px] text-white/50'>{niceDay(ymdInTz(Date.parse(target.scheduledAt), tz), { weekday: 'short', month: 'short', day: 'numeric' })} · {hmInTz(Date.parse(target.scheduledAt), tz)}</span></span><span className={cx('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', target.status === 'awaiting_approval' ? 'bg-[#f3b65e]' : 'bg-[#70d6aa]')} />
                    </button></li>)}</ul> : <Empty title='Queue is clear' text='Your scheduled content will appear here.' action={can('post.write') ? <Button size='sm' onClick={() => go('studio/new')}><Plus size={14} />Create a post</Button> : undefined} />}
                    <button className='flex w-full items-center justify-center gap-1 border-t border-line py-3 text-[10px] font-semibold text-[#a8c7ff] hover:bg-white/[0.025]' onClick={() => go('calendar')}>View full queue <ArrowUpRight size={12} /></button>
                </Card>
            </div>

            <div className='dashboard-modules mb-5 grid gap-4 xl:grid-cols-3'>
                <Card className='module-panel overflow-hidden'><div className='flex items-center justify-between border-b border-white/[0.06] px-4 py-4'><div><h2 className='text-sm font-bold'>Media library</h2><p className='mt-1 text-[10px] text-muted'>Visuals ready for your next post</p></div><button className='text-[10px] font-semibold text-[#a8c7ff]' onClick={() => go('media')}>Open library <ArrowUpRight size={12} className='ml-1 inline' /></button></div>
                    <div className='flex gap-1 px-4 pt-3'>{[['all', 'All'], ['image', 'Images'], ['video', 'Videos']].map(([key, label]) => <button key={key} className={cx('rounded-md px-2.5 py-1 text-[9px] font-semibold transition', libraryFilter === key ? 'bg-[#445a7a] text-white' : 'text-muted hover:bg-white/[0.06] hover:text-white/80')} onClick={() => setLibraryFilter(key)}>{label}</button>)}</div>
                    {libraryMedia.length ? <div className='grid grid-cols-3 gap-2 p-4'>{libraryMedia.map((item: any) => <button key={item.id} className='group relative aspect-square overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.035]' onClick={() => go('media')} title={item.name}>
                        {item.url && item.kind === 'image' ? <img src={item.url} alt={item.name} loading='lazy' className='h-full w-full object-cover transition duration-300 group-hover:scale-105' onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <span className='flex h-full items-center justify-center bg-[linear-gradient(145deg,#334b67,#182535)] text-white/55'><Radio size={18} /></span>}
                        <span className='absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1.5 text-left text-[8px] text-white/85 opacity-0 backdrop-blur-sm transition group-hover:opacity-100'>{item.name}</span>
                    </button>)}</div> : <div className='p-4'><Empty title='No media yet' text='Upload a visual to start building your library.' action={<Button size='sm' variant='secondary' onClick={() => go('media')}><Plus size={13} />Add media</Button>} /></div>}
                </Card>

                <Card className='module-panel p-4'><div className='mb-4 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Publishing workflow</h2><p className='mt-1 text-[10px] text-muted'>One calendar, every connected channel</p></div><Activity size={16} className='text-[#ae9bff]' /></div>
                    <div className='workflow-origin mb-4 flex items-center gap-3 rounded-xl border border-[#8f78ff]/20 bg-[#8f78ff]/[0.08] p-3'><span className='flex h-9 w-9 items-center justify-center rounded-lg bg-[#8672ec]/20 text-[#c0b4ff]'><CalendarDays size={17} /></span><span className='min-w-0 flex-1'><span className='block text-[11px] font-semibold'>Scheduled content</span><span className='mt-0.5 block text-[9px] text-muted'>Publishing queue</span></span><span className='font-[Manrope] text-lg font-bold text-white'>{counts.scheduled}</span></div>
                    <div className='space-y-2'>{data.accounts.length ? data.accounts.slice(0, 5).map((account: any) => <button key={account.id} onClick={() => go('accounts')} className='flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]'>
                        {platforms[account.platform] ? <PlatformChip p={platforms[account.platform]} size={26} /> : <span className='flex h-[26px] w-[26px] items-center justify-center rounded-md bg-white/10'><Radio size={13} /></span>}<span className='min-w-0 flex-1 truncate text-[10px] font-medium'>{account.displayName || account.handle}</span><span className={cx('h-1.5 w-1.5 rounded-full', ['expired', 'permission_required'].includes(account.connection?.state) ? 'bg-[#f19a87]' : 'bg-[#70d6aa]')} />
                    </button>) : <button className='flex w-full items-center gap-2 rounded-lg border border-dashed border-white/10 p-3 text-left text-[10px] text-muted hover:border-white/25' onClick={() => go('accounts')}><Plus size={14} />Connect a channel to activate the workflow</button>}</div>
                    <button className='mt-4 flex w-full items-center justify-center gap-1 border-t border-white/[0.06] pt-3 text-[10px] font-semibold text-[#b8aaff]' onClick={() => go('accounts')}>Manage channels <ChevronRight size={12} /></button>
                </Card>

                <Card className='module-panel p-4'><div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Analytics</h2><p className='mt-1 text-[10px] text-muted'>Confirmed post performance</p></div><button className='toolbar-icon h-8 w-8' aria-label='Open full analytics' onClick={() => go('analytics')}><ArrowUpRight size={14} /></button></div>
                    <TrendChart rows={data.timeline} />
                    <div className='mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3'><div><div className='font-[Manrope] text-base font-bold'>{counts.published}</div><div className='mt-0.5 text-[9px] text-muted'>Published</div></div><div><div className='font-[Manrope] text-base font-bold'>{successRate === null ? '—' : successRate + '%'}</div><div className='mt-0.5 text-[9px] text-muted'>Success</div></div><div><div className='font-[Manrope] text-base font-bold'>{counts.failed}</div><div className='mt-0.5 text-[9px] text-muted'>Failed</div></div></div>
                </Card>
            </div>

            <div className='grid gap-4 xl:grid-cols-2'>
                <Card className='module-panel p-4 sm:p-5'>
                    <div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Workspace pulse</h2><p className='mt-1 text-[10px] text-muted'>Signals that need your attention</p></div><Sparkles size={17} className='text-[#d59b37]' /></div>
                        {data.insights.length ? <ul className='space-y-3'>{data.insights.slice(0, 4).map((insight: any, index: number) => <li key={index} className='flex gap-2.5'><span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', insight.tone === 'bad' ? 'bg-bad' : insight.tone === 'warn' ? 'bg-[#e6a445]' : 'bg-brand')} /><span className='text-xs leading-relaxed text-muted'>{insight.text}</span></li>)}</ul> : <p className='text-xs text-muted'>All clear. No issues need your attention.</p>}
                    <div className='mt-4 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3'><div className='flex items-center gap-2 text-[10px] font-semibold'><CircleHelp size={13} className='text-[#a8c7ff]' />Metrics note</div><p className='mt-1.5 text-[9px] leading-relaxed text-muted'>{data.metrics.reason}</p></div>
                </Card>
                <Card className='module-panel p-4 sm:p-5'><div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Recent activity</h2><p className='mt-1 text-[10px] text-muted'>The latest studio updates</p></div><FileText size={16} className='text-muted' /></div>
                    {data.recent.length ? <ul className='space-y-3'>{data.recent.slice(0, 5).map((entry: any) => <li key={entry.id} className='flex gap-3'><span className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-[#bdd3ff]'>{String(entry.name || '?').slice(0, 1).toUpperCase()}</span><div className='min-w-0'><p className='text-[10px] leading-relaxed'><strong className='font-semibold text-white/85'>{entry.name}</strong> <span className='text-muted'>{entry.text}</span></p><p className='mt-0.5 text-[9px] text-muted'>{timeAgo(entry.at)}</p></div></li>)}</ul> : <p className='text-xs text-muted'>Workspace activity will appear here.</p>}
                </Card>
            </div>
        </>}
    </div>;
}
