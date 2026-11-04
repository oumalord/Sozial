import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Loader2, X, Inbox } from 'lucide-react';

export const cx = (...a: Array<string | false | null | undefined>): string => a.filter(Boolean).join(' ');

const VARIANTS: Record<string, string> = {
    primary: 'bg-brand text-white hover:opacity-90 shadow-sm',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface2',
    ghost: 'text-ink hover:bg-surface2',
    danger: 'bg-bad text-white hover:opacity-90',
    accent: 'bg-accent text-navy hover:opacity-90',
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: any) {
    return (
        <button
            {...rest}
            disabled={disabled || loading}
            className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm', VARIANTS[variant], className)}
        >
            {loading && <Loader2 size={14} className='animate-spin' />}
            {children}
        </button>
    );
}

export function Card({ className, children, ...rest }: any) {
    return <div {...rest} className={cx('card', className)}>{children}</div>;
}

const TONES: Record<string, string> = {
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    info: 'bg-brand/15 text-brand',
    neutral: 'bg-surface2 text-muted',
    accent: 'bg-accent/25 text-ink',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: string; children: ReactNode; className?: string }) {
    return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>{children}</span>;
}

const STATUS: Record<string, [string, string]> = {
    draft: ['Draft', 'neutral'],
    pending_approval: ['Awaiting approval', 'info'],
    awaiting_approval: ['Awaiting approval', 'info'],
    scheduled: ['Scheduled', 'info'],
    queued: ['Scheduled', 'info'],
    publishing: ['Publishing', 'warn'],
    published: ['Published', 'ok'],
    partial: ['Partly published', 'warn'],
    failed: ['Failed', 'bad'],
    cancelled: ['Cancelled', 'neutral'],
    paused: ['Paused', 'warn'],
    manual: ['Manual action needed', 'warn'],
    needs_manual: ['Manual action needed', 'warn'],
};

export function StatusBadge({ status }: { status: string }) {
    const s = STATUS[status] || [status, 'neutral'];
    return <Badge tone={s[1]}>{s[0]}</Badge>;
}

export const STATUS_COLOR: Record<string, string> = {
    draft: '#94a3b8', scheduled: '#2563eb', queued: '#2563eb', pending_approval: '#7c3aed', awaiting_approval: '#7c3aed', publishing: '#f59e0b', published: '#10b981', partial: '#f59e0b', failed: '#ef4444', cancelled: '#94a3b8', paused: '#f59e0b', manual: '#f59e0b', needs_manual: '#f59e0b',
};

const CONN: Record<string, [string, string]> = {
    connected: ['Connected', 'ok'],
    disconnected: ['Disconnected', 'neutral'],
    expired: ['Authentication expired', 'bad'],
    permission_required: ['Permission required', 'warn'],
    publishing_unavailable: ['Publishing unavailable', 'neutral'],
    pending_approval: ['Integration pending approval', 'warn'],
};

export function ConnBadge({ state }: { state: string }) {
    const s = CONN[state] || [state, 'neutral'];
    return <Badge tone={s[1]}>{s[0]}</Badge>;
}

export function PlatformChip({ p, size = 28 }: { p: { short: string; color: string; name?: string }; size?: number }) {
    return (
        <span title={p.name} style={{ background: p.color, width: size, height: size, fontSize: size * 0.36 }} className='inline-flex shrink-0 items-center justify-center rounded-lg font-bold text-white'>
            {p.short}
        </span>
    );
}

export function Spinner({ label }: { label?: string }) {
    return (
        <div className='flex items-center justify-center gap-2 py-16 text-sm text-muted'>
            <Loader2 className='animate-spin' size={18} /> {label || 'Loading'}
        </div>
    );
}

export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
    return (
        <div className='flex flex-col items-center justify-center px-6 py-14 text-center'>
            <div className='mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface2 text-muted'>{icon || <Inbox size={22} />}</div>
            <div className='text-sm font-semibold'>{title}</div>
            {text && <p className='mt-1 max-w-sm text-sm text-muted'>{text}</p>}
            {action && <div className='mt-4'>{action}</div>}
        </div>
    );
}

export function Modal({ title, onClose, children, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
    useEffect(() => {
        const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);
    const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
    return (
        <div className='fixed inset-0 z-[90] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4' onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div className={cx('fade-in max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl', w)}>
                <div className='mb-4 flex items-center justify-between'>
                    <h3 className='text-base font-semibold'>{title}</h3>
                    <button aria-label='Close' onClick={onClose} className='rounded-lg p-1 text-muted hover:bg-surface2'><X size={18} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
    return (
        <label className='block'>
            <span className='label'>{label}</span>
            {children}
            {hint && <span className='mt-1 block text-[11px] text-muted'>{hint}</span>}
        </label>
    );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
        <button type='button' role='switch' aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-brand' : 'bg-line')}>
            <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
        </button>
    );
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
    return (
        <div className='inline-flex flex-wrap gap-1 rounded-xl bg-surface2 p-1'>
            {tabs.map(([k, l]) => (
                <button key={k} onClick={() => onChange(k)} className={cx('rounded-lg px-3 py-1.5 text-xs font-medium transition', value === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}>{l}</button>
            ))}
        </div>
    );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
    return (
        <div className='mb-6 flex flex-wrap items-end justify-between gap-3'>
            <div>
                <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
                {subtitle && <p className='mt-1 text-sm text-muted'>{subtitle}</p>}
            </div>
            <div className='flex flex-wrap items-center gap-2'>{actions}</div>
        </div>
    );
}

export function Meter({ value, max, label }: { value: number; max: number | null | undefined; label: string }) {
    const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return (
        <div>
            <div className='mb-1 flex justify-between text-xs'>
                <span className='text-muted'>{label}</span>
                <span className='font-medium'>{value}{max ? ' / ' + max : ''}</span>
            </div>
            <div className='h-2 overflow-hidden rounded-full bg-surface2'>
                <div className={cx('h-full rounded-full', pct > 85 ? 'bg-bad' : 'bg-brand')} style={{ width: pct + '%' }} />
            </div>
        </div>
    );
}
