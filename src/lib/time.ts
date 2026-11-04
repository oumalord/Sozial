export function startOfDayMs(ms: number, tz: string): number {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const p: Record<string, string> = {};
    for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    return ms - (ms % 1000) - (+p.hour * 3600 + +p.minute * 60 + +p.second) * 1000;
}

function parts(ymd: string): number[] {
    return ymd.split('-').map(Number);
}

export function addDays(ymd: string, n: number): string {
    const [y, m, d] = parts(ymd);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function addMonths(ymd: string, n: number): string {
    const [y, m] = parts(ymd);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

export function weekStart(ymd: string): string {
    const [y, m, d] = parts(ymd);
    return addDays(ymd, -(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7);
}

export function monthGrid(ymd: string): { ymd: string; inMonth: boolean }[] {
    const [y, m] = parts(ymd);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const start = Date.UTC(y, m - 1, 1 - ((first.getUTCDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start + i * 86400000);
        return { ymd: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === m - 1 };
    });
}

export function niceDay(ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
    const [y, m, d] = parts(ymd);
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
