import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleHelp, FileText, Link2, Plus, Radio, Sparkles } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs, go } from '../lib/hooks';
import { Badge, Button, Card, Empty, PageHeader, PlatformChip, Spinner, Tabs, cx } from '../lib/ui';
import { fmtDateTime, timeAgo } from '../lib/format';
import { startOfDayMs } from '../lib/time';

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

export default function Overview() {
    const { ws, tz, meta, can, user } = useWs();
    const [preset, setPreset] = useState('30');
    const [custom, setCustom] = useState({ from: '', to: '' });
    const range = useMemo(() => {
        const now = Date.now();
        if (preset === 'today') return { from: startOfDayMs(now, tz), to: now };
        if (preset === 'custom' && custom.from) return { from: new Date(custom.from + 'T00:00:00').getTime(), to: custom.to ? new Date(custom.to + 'T23:59:59').getTime() : now };
        const days = preset === 'custom' ? 30 : Number(preset);
        return { from: now - days * 86400000, to: now };
    }, [preset, custom.from, custom.to, tz]);
    const { data, loading, err } = useLoad(async () => {
        const [overview, accounts] = await Promise.all([A.get('/api/w/' + ws.id + '/overview?from=' + range.from + '&to=' + range.to), A.get('/api/w/' + ws.id + '/accounts')]);
        return { ...overview, accounts: accounts.accounts as any[] };
    }, [ws.id, range.from, range.to]);
    const platforms: Record<string, any> = meta.platforms;
    const counts = data?.counts;
    const failures = (counts?.failed || 0) + (counts?.awaitingApproval || 0);
    const ready = (counts?.published || 0) + (counts?.failed || 0);
    const successRate = ready ? Math.round((counts.published / ready) * 100) : null;
    return <div className='fade-in'>
        <div className='mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end'>
            <div><div className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand'><span className='h-1.5 w-1.5 rounded-full bg-brand' />SocialFlow workspace</div><h1 className='font-[Manrope] text-[27px] font-bold leading-tight tracking-[-0.03em]'>Welcome back, {(user.name || 'there').split(' ')[0]}</h1><p className='mt-1.5 text-sm text-muted'>Here’s what’s happening across {ws.name}.</p></div>
            <div className='flex flex-wrap items-center gap-2'><Tabs tabs={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["custom", "Custom"]]} value={preset} onChange={setPreset} />{can('post.write') && <Button className='!rounded-lg' onClick={() => go('studio/new')}><Plus size={15} />Create post</Button>}</div>
        </div>
        {preset === 'custom' && <div className='mb-4 flex flex-wrap items-center gap-2'><input aria-label='Start date' type='date' className='input !w-auto' value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /><span className='text-xs text-muted'>to</span><input aria-label='End date' type='date' className='input !w-auto' value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>}
        {err && <Card className='mb-4 border-bad p-4 text-sm text-bad'>{err}</Card>}
        {loading && !data ? <Spinner /> : data && <>
            <div className='mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4'>
                <Metric icon={<Link2 size={18} />} label='Connected accounts' value={counts.accounts} note='Across your active channels' tone='bg-brand/10 text-brand' onClick={() => go('accounts')} />
                <Metric icon={<CalendarClock size={18} />} label='Scheduled posts' value={counts.scheduled} note='In the publishing queue' tone='bg-[#eaf6f3] text-[#21866e]' onClick={() => go('calendar')} />
                <Metric icon={<CheckCircle2 size={18} />} label='Published' value={counts.published} note='Within the selected period' tone='bg-[#eff7e9] text-[#5d9c46]' />
                <Metric icon={<AlertTriangle size={18} />} label='Needs attention' value={failures} note={`${counts.failed} failed · ${counts.awaitingApproval} awaiting approval`} tone='bg-[#fff2e8] text-[#d47c38]' onClick={() => go('calendar')} />
            </div>

            <Card className='mb-5 p-4 sm:p-5'><div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Your channels</h2><p className='mt-1 text-[11px] text-muted'>Connected accounts and publishing status</p></div><button className='inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline' onClick={() => go('accounts')}>Manage channels <ChevronRight size={14} /></button></div>
                {data.accounts.length ? <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>{data.accounts.slice(0, 8).map((account: any) => <button key={account.id} onClick={() => go('accounts')} className='flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3 text-left transition hover:border-brand/40 hover:bg-surface2/60'>
                    {platforms[account.platform] ? <PlatformChip p={platforms[account.platform]} size={34} /> : <span className='flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-brand/10 text-brand'><Radio size={16} /></span>}
                    <span className='min-w-0 flex-1'><span className='block truncate text-xs font-semibold'>{account.displayName || account.handle}</span><span className='mt-0.5 block truncate text-[10px] text-muted'>{platforms[account.platform]?.name || account.platform} · {account.handle}</span></span>
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', account.connection?.state === 'expired' || account.connection?.state === 'permission_required' ? 'bg-bad' : 'bg-ok')} title={account.connection?.state || 'Ready'} />
                </button>)}</div> : <div className='flex flex-col items-start gap-3 rounded-xl border border-dashed border-line bg-surface2/50 p-4 sm:flex-row sm:items-center sm:justify-between'><div><div className='text-sm font-semibold'>Connect your first channel</div><p className='mt-1 text-xs text-muted'>Add an account to start planning and publishing from one place.</p></div><Button size='sm' variant='secondary' onClick={() => go('accounts')}><Plus size={14} />Add account</Button></div>}
            </Card>

            <div className='mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]'>
                <Card className='p-4 sm:p-5'><TrendChart rows={data.timeline} /></Card>
                <Card className='p-4 sm:p-5'><div className='flex items-start justify-between'><div><h2 className='text-sm font-bold'>Publishing health</h2><p className='mt-1 text-[11px] text-muted'>Delivery status at a glance</p></div><span className='flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf6f1] text-[#21866e]'><Activity size={16} /></span></div>
                    <div className='mt-5 space-y-4'>
                        <div><div className='mb-1.5 flex justify-between text-xs'><span>Publish success</span><span className='font-semibold'>{successRate === null ? 'No data' : successRate + '%'}</span></div><div className='h-2 rounded-full bg-surface2'><div className='h-full rounded-full bg-[#45ad83] transition-all' style={{ width: (successRate ?? 0) + '%' }} /></div></div>
                        <div><div className='mb-1.5 flex justify-between text-xs'><span>Scheduled queue</span><span className='font-semibold'>{counts.scheduled}</span></div><div className='h-2 rounded-full bg-surface2'><div className='h-full rounded-full bg-brand transition-all' style={{ width: Math.min(100, counts.scheduled * 10) + '%' }} /></div></div>
                        <div><div className='mb-1.5 flex justify-between text-xs'><span>Drafts ready</span><span className='font-semibold'>{counts.drafts}</span></div><div className='h-2 rounded-full bg-surface2'><div className='h-full rounded-full bg-[#e4aa45] transition-all' style={{ width: Math.min(100, counts.drafts * 10) + '%' }} /></div></div>
                    </div>
                    <div className='mt-5 rounded-xl bg-surface2/70 p-3'><div className='flex items-center gap-2 text-xs font-semibold'><CircleHelp size={15} className='text-brand' />Performance data</div><p className='mt-1.5 text-[11px] leading-relaxed text-muted'>{data.metrics.reason}</p></div>
                </Card>
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.9fr)]'>
                <Card className='overflow-hidden'><div className='flex items-center justify-between border-b border-line px-4 py-4 sm:px-5'><div><h2 className='text-sm font-bold'>Coming up</h2><p className='mt-1 text-[11px] text-muted'>Next posts in your schedule</p></div><button className='text-xs font-semibold text-brand hover:underline' onClick={() => go('calendar')}>Open calendar</button></div>
                    {data.upcoming.length ? <ul className='divide-y divide-line'>{data.upcoming.slice(0, 6).map((target: any) => <li key={target.id} className='flex items-center gap-3 px-4 py-3 transition hover:bg-surface2/60 sm:px-5' onClick={() => go('studio/' + target.postId)} role='button' tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && go('studio/' + target.postId)}>
                        {platforms[target.platform] && <PlatformChip p={platforms[target.platform]} size={32} />}<div className='min-w-0 flex-1'><div className='truncate text-xs font-semibold'>{target.title}</div><div className='mt-1 text-[10px] text-muted'>{target.handle} · {fmtDateTime(target.scheduledAt, tz)}</div></div>{target.status === 'awaiting_approval' ? <Badge tone='info'>Approval</Badge> : <span className='whitespace-nowrap text-[10px] font-medium text-muted'>{timeAgo(target.scheduledAt)}</span>}
                    </li>)}</ul> : <Empty title='Your calendar is clear' text='Draft a post and choose when it should go out.' action={can('post.write') ? <Button size='sm' onClick={() => go('studio/new')}><Plus size={14} />Create a post</Button> : undefined} />}
                </Card>
                <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-1'>
                    <Card className='p-4 sm:p-5'><div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Workspace pulse</h2><p className='mt-1 text-[11px] text-muted'>Signals that need your attention</p></div><Sparkles size={17} className='text-[#d59b37]' /></div>
                        {data.insights.length ? <ul className='space-y-3'>{data.insights.slice(0, 4).map((insight: any, index: number) => <li key={index} className='flex gap-2.5'><span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', insight.tone === 'bad' ? 'bg-bad' : insight.tone === 'warn' ? 'bg-[#e6a445]' : 'bg-brand')} /><span className='text-xs leading-relaxed text-muted'>{insight.text}</span></li>)}</ul> : <p className='text-xs text-muted'>All clear. No issues need your attention.</p>}
                    </Card>
                    <Card className='p-4 sm:p-5'><div className='mb-3 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Recent activity</h2><p className='mt-1 text-[11px] text-muted'>Latest workspace updates</p></div><FileText size={16} className='text-muted' /></div>
                        {data.recent.length ? <ul className='space-y-3'>{data.recent.slice(0, 4).map((entry: any) => <li key={entry.id} className='flex gap-3'><span className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[9px] font-bold text-brand'>{String(entry.name || '?').slice(0, 1).toUpperCase()}</span><div className='min-w-0'><p className='text-xs leading-relaxed'><strong className='font-semibold'>{entry.name}</strong> <span className='text-muted'>{entry.text}</span></p><p className='mt-0.5 text-[10px] text-muted'>{timeAgo(entry.at)}</p></div></li>)}</ul> : <p className='text-xs text-muted'>Workspace activity will appear here.</p>}
                    </Card>
                </div>
            </div>
        </>}
    </div>;
}
