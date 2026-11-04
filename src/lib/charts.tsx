export function StackedBars({ data, height = 180 }: { data: { label: string; a: number; b: number }[]; height?: number }) {
    const max = Math.max(1, ...data.map((d) => d.a + d.b));
    const w = 100 / Math.max(1, data.length);
    return (
        <div>
            <svg viewBox={'0 0 100 ' + height / 2} preserveAspectRatio='none' className='w-full' style={{ height }}>
                {[0.25, 0.5, 0.75, 1].map((g) => (
                    <line key={g} x1='0' x2='100' y1={(height / 2) * (1 - g)} y2={(height / 2) * (1 - g)} stroke='currentColor' className='text-line' strokeWidth='0.3' />
                ))}
                {data.map((d, i) => {
                    const ha = (d.a / max) * (height / 2 - 2);
                    const hb = (d.b / max) * (height / 2 - 2);
                    return (
                        <g key={i}>
                            <rect x={i * w + w * 0.2} width={w * 0.6} y={height / 2 - ha} height={ha} rx='0.6' fill='rgb(var(--brand))' />
                            <rect x={i * w + w * 0.2} width={w * 0.6} y={height / 2 - ha - hb} height={hb} rx='0.6' fill='rgb(var(--bad))' />
                        </g>
                    );
                })}
            </svg>
            <div className='mt-1 flex justify-between text-[10px] text-muted'>
                <span>{data[0]?.label}</span>
                <span>{data[data.length - 1]?.label}</span>
            </div>
        </div>
    );
}

export function HBars({ rows }: { rows: { label: string; value: number; color: string; note?: string }[] }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
        <div className='space-y-3'>
            {rows.map((r) => (
                <div key={r.label}>
                    <div className='mb-1 flex justify-between text-xs'>
                        <span className='font-medium'>{r.label}</span>
                        <span className='text-muted'>{r.note ?? r.value}</span>
                    </div>
                    <div className='h-2 overflow-hidden rounded-full bg-surface2'>
                        <div className='h-full rounded-full' style={{ width: (r.value / max) * 100 + '%', background: r.color }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function HourBars({ hours }: { hours: number[] }) {
    const max = Math.max(1, ...hours);
    return (
        <div>
            <div className='flex h-24 items-end gap-[3px]'>
                {hours.map((h, i) => (
                    <div key={i} title={i + ':00 - ' + h + ' posts'} className='flex-1 rounded-t bg-brand/80' style={{ height: Math.max(3, (h / max) * 100) + '%', opacity: h ? 1 : 0.2 }} />
                ))}
            </div>
            <div className='mt-1 flex justify-between text-[10px] text-muted'>
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
        </div>
    );
}
