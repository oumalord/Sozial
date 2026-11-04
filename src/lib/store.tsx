import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { get, post } from './api';
import type { R } from './api';
import { Button, Modal } from './ui';

interface AppCtx {
    user: R;
    profile: R;
    workspaces: R[];
    ws: R | null;
    role: string;
    meta: R;
    isAdmin: boolean;
    dark: boolean;
    can: (perm: string) => boolean;
    refresh: () => Promise<void>;
    selectWs: (id: string) => void;
    toast: (msg: string, kind?: 'ok' | 'err') => void;
    ask: (msg: string, confirmLabel?: string) => Promise<boolean>;
    toggleDark: () => void;
    signOut: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
    const c = useContext(Ctx);
    if (!c) throw new Error('useApp outside provider');
    return c;
}

function store(key: string, value?: string): string | null {
    try {
        if (value !== undefined) localStorage.setItem(key, value);
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function AppProvider({ children, loading, signedOut }: { children: ReactNode; loading: ReactNode; signedOut: ReactNode }) {
    const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
    const [data, setData] = useState<R>({});
    const [wsId, setWsId] = useState<string>(store('sf_ws') || '');
    const [dark, setDark] = useState<boolean>(store('sf_theme') ? store('sf_theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
    const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([]);
    const [dialog, setDialog] = useState<{ msg: string; label: string; done: (v: boolean) => void } | null>(null);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    const load = useCallback(async () => {
        const session = await get('/api/auth/session');
        if (!session.user) {
            setState('out');
            return;
        }
        const d = await get('/api/bootstrap');
        setData(d);
        setState('in');
    }, []);

    useEffect(() => {
        load().catch(() => setState('out'));
    }, [load]);

    const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, msg, kind }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    }, []);

    const ask = useCallback((msg: string, label = 'Confirm') => new Promise<boolean>((resolve) => setDialog({ msg, label, done: resolve })), []);

    if (state === 'loading') return <>{loading}</>;
    if (state === 'out') return <>{signedOut}</>;

    const workspaces: R[] = data.workspaces || [];
    const ws = workspaces.find((w) => w.id === wsId) || workspaces[0] || null;
    const role = ws ? ws.role : 'viewer';
    const value: AppCtx = {
        user: data.user,
        profile: data.profile || {},
        workspaces,
        ws,
        role,
        meta: data.meta || { platforms: {}, perms: {}, plans: [] },
        isAdmin: !!data.isAdmin,
        dark,
        can: (perm) => ((data.meta?.perms || {})[perm] || []).includes(role),
        refresh: async () => {
            setData(await get('/api/bootstrap'));
        },
        selectWs: (id) => {
            store('sf_ws', id);
            setWsId(id);
            window.location.hash = '#/overview';
        },
        toast,
        ask,
        toggleDark: () => {
            store('sf_theme', dark ? 'light' : 'dark');
            setDark(!dark);
        },
        signOut: async () => {
            await post('/api/auth/logout');
            window.location.hash = '';
            window.location.reload();
        },
    };

    return (
        <Ctx.Provider value={value}>
            {children}
            <div className='fixed bottom-4 right-4 z-[100] flex flex-col gap-2'>
                {toasts.map((t) => (
                    <div key={t.id} className={'fade-in max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ' + (t.kind === 'err' ? 'bg-bad text-white' : 'bg-navy text-white')}>
                        {t.msg}
                    </div>
                ))}
            </div>
            {dialog && (
                <Modal title='Please confirm' onClose={() => { dialog.done(false); setDialog(null); }} size='sm'>
                    <p className='text-sm text-muted'>{dialog.msg}</p>
                    <div className='mt-5 flex justify-end gap-2'>
                        <Button variant='secondary' onClick={() => { dialog.done(false); setDialog(null); }}>Cancel</Button>
                        <Button variant='danger' onClick={() => { dialog.done(true); setDialog(null); }}>{dialog.label}</Button>
                    </div>
                </Modal>
            )}
        </Ctx.Provider>
    );
}
