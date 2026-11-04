import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, CheckCircle2, CircleHelp, Radio, TrendingUp } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs } from '../lib/hooks';
import { Badge, Button, Card, Empty, PageHeader, PlatformChip, Spinner, Tabs, cx } from '../lib/ui';
import { HourBars } from '../lib/charts';
import { fmtDateTime } from '../lib/format';
import { startOfDayMs } from '../lib/time';

function Metric({ label, value, note, icon, tone }: { label: string; value: string | number; note: string; icon: React.ReactNode; tone: string }) {
    return <Card className='metric-card p-4 sm:p-5'><div className='flex items-start justify-between gap-3'><div><div className='text-xs font-medium text-muted'>{label}</div><div className='mt-2 font-[Manrope] text-[29px] font-bold leading-none tracking-[-0.03em]'>{value}</div></div><div className={cx('flex h-10 w-10 items-center justify-center rounded-xl', tone)}>{icon}</div></div><div className='mt-3 text-[11px] text-muted'>{note}</div></Card>;
}

function DeliveryChart({ rows }: { rows: any[] }) {
    const width = 780;
    const bottom = 178;
    const max = Math.max(4, ...rows.map((row) => row.published + row.failed));
    const points = rows.map((row, index) => ({ x: rows.length < 2 ? width / 2 : index * width / (rows.length - 1), y: bottom - ((row.published + row.failed) / max) * 142 }));
    const line = points.map((point, index) => (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' ');
    const fill = `${line} L ${width} ${bottom} L 0 ${bottom} Z`;
    if (!rows.some((row) => row.published || row.failed)) return <div className='flex h-[215px] items-center justify-center'><Empty title='No delivery history yet' text='Post results will appear here as your content is published.' /></div>;
    return <>
        <svg viewBox={`0 0 ${width} 205`} preserveAspectRatio='none' className='h-[215px] w-full' role='img' aria-label='Post delivery over time'>
            <defs><linearGradient id='analyticsFill' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stopColor='rgb(var(--brand))' stopOpacity='.2' /><stop offset='100%' stopColor='rgb(var(--brand))' stopOpacity='.01' /></linearGradient></defs>
            {[0, Math.ceil(max / 2), max].map((tick) => { const y = bottom - (tick / max) * 142; return <g key={tick}><line x1='0' x2={width} y1={y} y2={y} stroke='rgb(var(--line))' strokeDasharray='3 5' /><text x='1' y={y - 5} fill='rgb(var(--muted))' fontSize='9'>{tick}</text></g>; })}
            <path d={fill} fill='url(#analyticsFill)' /><path d={line} fill='none' stroke='rgb(var(--brand))' strokeWidth='3' strokeLinecap='round' strokeLinejoin='round' vectorEffect='non-scaling-stroke' />
        </svg>
        <div className='-mt-1 flex justify-between text-[9px] text-muted'><span>{rows[0]?.date?.slice(5)}</span><span>{rows[Math.floor(rows.length / 2)]?.date?.slice(5)}</span><span>{rows[rows.length - 1]?.date?.slice(5)}</span></div>
    </>;
}

export default function Analytics() {
    const { ws, tz, meta, can, toast } = useWs();
    const [period, setPeriod] = useState('30');
    const range = useMemo(() => {
        const to = Date.now();
        return { from: period === 'today' ? startOfDayMs(to, tz) : to - Number(period) * 86400000, to };
    }, [period, tz]);
    const { data, loading, err } = useLoad(() => A.get('/api/w/' + ws.id + '/analytics?from=' + range.from + '&to=' + range.to), [ws.id, range.from, range.to]);
    const platforms: Record<string, any> = meta.platforms;
    const published = data?.timeline.reduce((sum: number, row: any) => sum + row.published, 0) || 0;
    const failed = data?.timeline.reduce((sum: number, row: any) => sum + row.failed, 0) || 0;
    const successRate = published + failed ? Math.round((published / (published + failed)) * 100) : null;
    const performance = Object.entries<any>(data?.byPlatform || {}).sort((a, b) => b[1].published - a[1].published);
    const exportReport = async () => {
        try {
            const result = await A.get('/api/w/' + ws.id + '/export');
            const objectUrl = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = result.filename;
            anchor.click();
            URL.revokeObjectURL(objectUrl);
        } catch (error: any) {
            toast(error.message, 'err');
        }
    };
    return <div className='fade-in'>
        <PageHeader title='Analytics' subtitle='Understand your publishing rhythm and channel reliability' actions={<><Tabs tabs={[["7", "7 days"], ["30", "30 days"], ["90", "90 days"]]} value={period} onChange={setPeriod} />{can('post.write') && <Button variant='secondary' className='!rounded-lg' onClick={exportReport}><ArrowDownToLine size={15} />Export report</Button>}</>} />
        {err && <Card className='mb-4 border-bad p-4 text-sm text-bad'>{err}</Card>}
        {loading && !data ? <Spinner /> : data && <>
            <div className='mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4'>
                <Metric label='Published posts' value={published} note='Confirmed by connected channels' icon={<CheckCircle2 size={18} />} tone='bg-[#edf7f1] text-[#25836a]' />
                <Metric label='Failed deliveries' value={failed} note='Posts that need a review' icon={<AlertTriangle size={18} />} tone='bg-[#fff0e9] text-[#d66d4e]' />
                <Metric label='Delivery success' value={successRate === null ? '—' : successRate + '%'} note={successRate === null ? 'No completed deliveries in this period' : 'Published out of completed attempts'} icon={<TrendingUp size={18} />} tone='bg-brand/10 text-brand' />
                <Metric label='Active channels' value={performance.length} note='Channels with post activity' icon={<Radio size={18} />} tone='bg-[#f3efff] text-[#7057be]' />
            </div>
            <div className='mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.8fr)]'>
                <Card className='p-4 sm:p-5'><div className='mb-4 flex items-center justify-between'><div><h2 className='text-sm font-bold'>Delivery over time</h2><p className='mt-1 text-[11px] text-muted'>Published and failed posts by day</p></div><span className='flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand'><Activity size={16} /></span></div><DeliveryChart rows={data.timeline} /></Card>
                <Card className='p-4 sm:p-5'><div className='mb-4'><h2 className='text-sm font-bold'>Publishing rhythm</h2><p className='mt-1 text-[11px] text-muted'>Posts published by local hour · {tz}</p></div><HourBars hours={data.hours} /><div className='mt-4 rounded-lg bg-surface2/70 p-3 text-[11px] leading-relaxed text-muted'>Timing reflects your publishing history, not predicted audience engagement.</div></Card>
            </div>
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]'>
                <Card className='overflow-hidden'><div className='border-b border-line px-4 py-4 sm:px-5'><h2 className='text-sm font-bold'>Channel performance</h2><p className='mt-1 text-[11px] text-muted'>Publishing results by social network</p></div>
                    {performance.length ? <div className='overflow-x-auto'><table className='w-full min-w-[500px] text-left text-xs'><thead className='bg-surface2/70 text-[10px] uppercase tracking-[0.07em] text-muted'><tr><th className='px-4 py-3 font-semibold sm:px-5'>Channel</th><th className='px-3 py-3 font-semibold'>Published</th><th className='px-3 py-3 font-semibold'>Failed</th><th className='px-4 py-3 text-right font-semibold sm:px-5'>Success rate</th></tr></thead><tbody className='divide-y divide-line'>{performance.map(([id, row]) => <tr key={id} className='transition hover:bg-surface2/60'><td className='px-4 py-3 sm:px-5'><div className='flex items-center gap-2.5'>{platforms[id] && <PlatformChip p={platforms[id]} size={28} />}<span className='font-semibold'>{platforms[id]?.name || id}</span></div></td><td className='px-3 py-3 font-semibold'>{row.published}</td><td className='px-3 py-3 text-muted'>{row.failed}</td><td className='px-4 py-3 text-right sm:px-5'><Badge tone={row.successRate >= 90 ? 'ok' : row.successRate >= 70 ? 'warn' : 'bad'}>{row.successRate}%</Badge></td></tr>)}</tbody></table></div> : <Empty title='No channel results yet' text='Connect an account and publish a post to see delivery performance.' />}
                </Card>
                <Card className='overflow-hidden'><div className='flex items-center justify-between border-b border-line px-4 py-4 sm:px-5'><div><h2 className='text-sm font-bold'>Recent published posts</h2><p className='mt-1 text-[11px] text-muted'>Latest confirmed deliveries</p></div><ArrowUpRight size={16} className='text-muted' /></div>
                    {data.recent.length ? <ul className='divide-y divide-line'>{data.recent.slice(0, 6).map((post: any) => <li key={post.id} className='flex items-center gap-3 px-4 py-3 sm:px-5'>{platforms[post.platform] && <PlatformChip p={platforms[post.platform]} size={28} />}<div className='min-w-0 flex-1'><div className='truncate text-xs font-semibold'>{post.title}</div><div className='mt-1 text-[10px] text-muted'>{post.handle} · {fmtDateTime(post.publishedAt, tz)}</div></div>{post.externalUrl && <a href={post.externalUrl} target='_blank' rel='noreferrer' className='toolbar-icon h-8 w-8' aria-label='Open published post'><ArrowUpRight size={14} /></a>}</li>)}</ul> : <Empty title='Nothing published in this period' text='Confirmed posts will appear here.' />}
                </Card>
            </div>
            <Card className='mt-4 flex items-start gap-3 p-4 sm:p-5'><span className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand'><CircleHelp size={16} /></span><div><h2 className='text-xs font-bold'>Network audience metrics</h2><p className='mt-1 text-[11px] leading-relaxed text-muted'>{data.metrics.reason}</p></div></Card>
        </>}
    </div>;
}