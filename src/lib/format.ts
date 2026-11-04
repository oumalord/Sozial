export function fmtDateTime(iso: string | undefined, tz: string): string {
    if (!iso) return '';
    try {
        return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function fmtDate(iso: string | undefined, tz: string): string {
    if (!iso) return '';
    try {
        return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium' }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function ymdInTz(ms: number, tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
}

export function hmInTz(ms: number, tz: string): string {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

export function bytes(n: number): string {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

export function timeAgo(iso: string): string {
    const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
}

export function timezones(): string[] {
    const f = (Intl as any).supportedValuesOf;
    if (typeof f === 'function') return f.call(Intl, 'timeZone');
    return ['UTC', 'Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
}

export function browserTz(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
