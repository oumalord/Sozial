import { useCallback, useEffect, useState } from 'react';
import { useApp } from './store';
import type { R } from './api';

export function useLoad<T = any>(fn: () => Promise<T>, deps: any[] = []) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');
    const reload = useCallback(async () => {
        setLoading(true);
        setErr('');
        try {
            setData(await fn());
        } catch (e: any) {
            setErr(e.message || 'Failed to load');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    useEffect(() => {
        reload();
    }, [reload]);
    return { data, loading, err, reload, setData };
}

function readRoute() {
    const h = window.location.hash.replace(/^#\/?/, '');
    const parts0 = h.split('?');
    const parts = parts0[0].split('/').filter(Boolean);
    const query: Record<string, string> = {};
    new URLSearchParams(parts0[1] || '').forEach((v, k) => {
        query[k] = v;
    });
    return { page: parts[0] || 'overview', id: parts[1] || '', query };
}

export function useRoute() {
    const [r, setR] = useState(readRoute);
    useEffect(() => {
        const f = () => setR(readRoute());
        window.addEventListener('hashchange', f);
        return () => window.removeEventListener('hashchange', f);
    }, []);
    return r;
}

export const go = (path: string) => {
    window.location.hash = '#/' + path;
};

export function useWs() {
    const a = useApp();
    return { ...a, ws: a.ws as R, tz: (a.ws as R).timezone as string };
}
