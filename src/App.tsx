import { useEffect, useState } from 'react';
import { Activity, Bell, CalendarDays, ChevronDown, ChevronsLeft, CreditCard, Images, LayoutDashboard, Link2, LogOut, Megaphone, Menu, Moon, PenSquare, Plus, Settings as Cog, ShieldCheck, Sparkles, Sun, Users } from 'lucide-react';
import * as A from './lib/api';
import { AppProvider, useApp } from './lib/store';
import { useRoute, go } from './lib/hooks';
import { Button, Card, Empty, Field, Modal, Spinner, cx } from './lib/ui';
import { timeAgo, timezones, browserTz } from './lib/format';
import Onboarding from './pages/Onboarding';
import Overview from './pages/Overview';
import Analytics from './pages/Analytics';
import Admin from './pages/Admin';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import Media from './pages/Media';
import Calendar from './pages/Calendar';
import Studio from './pages/Studio';

const PAGES: Record<string, any> = {
    overview: Overview,
    analytics: Analytics,
    admin: Admin,
    studio: Studio,
    calendar: Calendar,
    media: Media,
    accounts: Accounts,
    settings: Settings,
};

const NAV: [string, string, any][] = [
    ['overview', 'Overview', LayoutDashboard],
    ['studio', 'Content Studio', PenSquare],
    ['calendar', 'Publishing calendar', CalendarDays],
    ['media', 'Media Library', Images],
    ['accounts', 'Social accounts', Link2],
    ['analytics', 'Reports', Activity],
    ['assistant', 'AI assistant', Sparkles],
    ['campaigns', 'Campaigns', Megaphone],
    ['team', 'Team', Users],
    ['billing', 'Plan & billing', CreditCard],
    ['settings', 'Settings', Cog],
];

function SignedOut() {
    const [register, setRegister] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            await A.post('/api/auth/' + (register ? 'register' : 'login'), { name, email, password });
            window.location.reload();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className='auth-screen flex min-h-full flex-col items-center justify-center px-5 py-10'>
            <div className='auth-panel w-full max-w-[410px] p-6 text-center sm:p-8'>
            <div className='mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-extrabold text-white shadow-lg shadow-brand/20'>S<span className='text-accent'>.</span></div>
            <h1 className='font-[Manrope] text-[27px] font-extrabold tracking-[-0.03em]'>SocialFlow<span className='text-brand'>.</span></h1>
            <p className='mt-2 text-sm text-muted'>Create once. Schedule intelligently. Publish everywhere.</p>
            <form className='mt-7 space-y-3 text-left' onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                {register && <Field label='Name'><input className='input' autoComplete='name' value={name} onChange={(event) => setName(event.target.value)} required /></Field>}
                <Field label='Email'><input className='input' type='email' autoComplete='email' value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
                <Field label='Password'><input className='input' type='password' autoComplete={register ? 'new-password' : 'current-password'} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
                {error && <p className='text-sm text-bad'>{error}</p>}
                <Button type='submit' loading={busy} className='w-full !rounded-lg !py-3' variant='primary'>{register ? 'Create account' : 'Sign in'}</Button>
            </form>
            <button className='mt-5 text-xs font-medium text-muted hover:text-brand' onClick={() => { setError(''); setRegister(!register); }}>
                {register ? 'Already have an account? Sign in' : 'New to SocialFlow? Create an account'}
            </button>
            </div>
            <p className='mt-5 text-[10px] text-muted'>A calmer way to run your social channels.</p>
        </div>
    );
}

function NewWorkspace({ onClose }: { onClose: () => void }) {
    const { refresh, toast, selectWs } = useApp();
    const [name, setName] = useState('');
    const [type, setType] = useState('agency');
    const [tz, setTz] = useState(browserTz());
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        try {
            const r = await A.post('/api/workspaces', { name, type, timezone: tz });
            await refresh();
            selectWs(r.workspace.id);
            onClose();
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal title='New workspace' onClose={onClose} size='sm'>
            <div className='space-y-3'>
                <Field label='Workspace or client name'><input className='input' autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label='Type'>
                    <select className='input' value={type} onChange={(e) => setType(e.target.value)}>
                        <option value='creator'>Content creator</option><option value='business'>Business</option><option value='agency'>Marketing agency</option><option value='manager'>Social media manager</option>
                    </select>
                </Field>
                <Field label='Time zone'><select className='input' value={tz} onChange={(e) => setTz(e.target.value)}>{timezones().map((t) => <option key={t}>{t}</option>)}</select></Field>
                <div className='flex justify-end gap-2 pt-2'><Button variant='secondary' onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!name.trim()} onClick={save}>Create</Button></div>
            </div>
        </Modal>
    );
}

function Bell_({ wsId }: { wsId: string }) {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const load = () => A.get('/api/w/' + wsId + '/notifications').then((d) => setItems(d.items)).catch(() => undefined);
    useEffect(() => {
        load();
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsId]);
    const unread = items.filter((i) => !i.read).length;
    return (
        <div className='relative'>
            <button aria-label='Notifications' className='relative rounded-xl p-2 hover:bg-surface2' onClick={() => { setOpen(!open); if (!open) load(); }}>
                <Bell size={18} />
                {unread > 0 && <span className='absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[9px] font-bold text-white'>{unread}</span>}
            </button>
            {open && (
                <>
                    <div className='fixed inset-0 z-40' onClick={() => setOpen(false)} />
                    <Card className='fade-in absolute right-0 z-50 mt-2 w-80 max-w-[90vw] p-2 shadow-xl'>
                        <div className='flex items-center justify-between px-2 py-1.5'>
                            <span className='text-sm font-semibold'>Notifications</span>
                            {unread > 0 && <button className='text-xs text-brand' onClick={async () => { await A.post('/api/w/' + wsId + '/notifications/read'); load(); }}>Mark all read</button>}
                        </div>
                        <div className='max-h-96 overflow-y-auto'>
                            {items.length === 0 ? <Empty title='All caught up' text='Alerts about publishing, approvals and connections appear here.' /> : items.map((n) => (
                                <button key={n.id} className={cx('block w-full rounded-xl px-2 py-2 text-left hover:bg-surface2', !n.read && 'bg-brand/5')} onClick={() => { setOpen(false); if (n.postId) go('studio/' + n.postId); }}>
                                    <div className='flex items-center gap-2 text-sm font-medium'><i className={cx('h-2 w-2 rounded-full', n.level === 'error' ? 'bg-bad' : n.level === 'warn' ? 'bg-warn' : 'bg-ok')} />{n.title}</div>
                                    {n.body && <div className='mt-0.5 line-clamp-2 text-xs text-muted'>{n.body}</div>}
                                    <div className='mt-0.5 text-[10px] text-muted'>{timeAgo(n.at)}</div>
                                </button>
                            ))}
                        </div>
                    </Card>
                </>
            )}
        </div>
    );
}

function Shell() {
    const { ws, workspaces, selectWs, isAdmin, user, dark, toggleDark, signOut, can } = useApp();
    const { page, id, query } = useRoute();
    const [collapsed, setCollapsed] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [creating, setCreating] = useState(false);
    const [accountMenu, setAccountMenu] = useState(false);
    useEffect(() => setDrawer(false), [page]);

    if (!ws) {
        if (isAdmin && page === 'admin') return <Admin />;
        return <Onboarding />;
    }
    const showOnboarding = !ws.onboardingDone && can('settings.manage');
    const items = NAV.filter(([k]) => PAGES[k]).concat(isAdmin && PAGES.admin ? [['admin', 'Administration', ShieldCheck] as [string, string, any]] : []);
    const Page = PAGES[page] || PAGES.overview;
    const trialEnds = ws.trial && Date.parse(ws.trial.endsAt) > Date.now() ? ws.trial : null;

    const nav = (compact: boolean) => {
        const groups = [{ label: 'Workspace', routes: ['overview', 'calendar', 'studio'] }, { label: 'Library', routes: ['media', 'accounts'] }, { label: 'Manage', routes: ['analytics', 'assistant', 'campaigns', 'team', 'billing', 'admin'] }];
        return <nav className='flex-1 overflow-y-auto px-3 py-4'>
            {groups.map((group) => {
                const links = items.filter(([key]) => group.routes.includes(key));
                if (!links.length) return null;
                return <div key={group.label} className='mb-5'>
                    {!compact && <div className='mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted/80'>{group.label}</div>}
                    <div className='space-y-1'>{links.map(([key, label, Icon]) => <a key={key} href={'#/' + key} title={label} className={cx('nav-link', page === key ? 'nav-link-active' : '')}>
                        <Icon size={17} strokeWidth={page === key ? 2.2 : 1.8} />{!compact && <span>{label}</span>}{key === 'calendar' && !compact && <span className='ml-auto rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand'>Live</span>}
                    </a>)}</div>
                </div>;
            })}
        </nav>;
    };
    const brand = (compact: boolean) => <a href='#/overview' className='flex h-[76px] items-center gap-3 border-b border-line px-5'>
        <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-extrabold text-white shadow-[0_6px_14px_rgb(27_101_232_/_0.24)]'>S<span className='text-accent'>.</span></span>
        {!compact && <span className='font-[Manrope] text-[19px] font-extrabold tracking-[-0.02em] text-ink'>SocialFlow<span className='text-brand'>.</span></span>}
    </a>;
    const sidebar = (compact: boolean, mobile = false) => <aside className={cx('app-sidebar flex shrink-0 flex-col bg-surface', compact ? 'w-[78px]' : 'w-[252px]', mobile && 'h-full w-[286px] shadow-2xl')}>
        {brand(compact)}
        {!compact && <div className='px-4 pt-4'><button className='flex w-full items-center gap-2 rounded-xl border border-line bg-surface2/70 p-2.5 text-left hover:bg-surface2' onClick={() => setCreating(true)}>
            <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand shadow-sm'><Users size={15} /></span><span className='min-w-0 flex-1'><span className='block truncate text-xs font-semibold'>{ws.name}</span><span className='block text-[10px] text-muted'>Workspace</span></span><ChevronDown size={14} className='text-muted' />
        </button></div>}
        {nav(compact)}
        <div className='mt-auto border-t border-line p-3'>
            {!compact && <div className='mb-3 rounded-xl bg-[linear-gradient(135deg,rgb(var(--brand)/0.09),rgb(var(--accent)/0.12))] p-3'>
                <div className='flex items-center justify-between'><span className='text-[11px] font-semibold'>{ws.plan.name} plan</span><span className='h-1.5 w-1.5 rounded-full bg-ok' /></div>
                <p className='mt-1 text-[10px] leading-relaxed text-muted'>{trialEnds ? 'Trial ends ' + trialEnds.endsAt.slice(0, 10) : ws.plan.id === 'free' ? 'Your workspace is ready to grow.' : 'Your plan is active.'}</p>
                {ws.plan.id === 'free' && <a href='#/billing' className='mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-brand'>Explore plans <ChevronDown size={11} className='-rotate-90' /></a>}
            </div>}
            <a href='#/settings' className={cx('nav-link', page === 'settings' && 'nav-link-active')} title='Settings'><Cog size={17} />{!compact && <span>Settings</span>}</a>
            <button className='nav-link mt-1 w-full' onClick={signOut} title='Sign out'><LogOut size={17} />{!compact && <span>Sign out</span>}</button>
            <button className='mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-medium text-muted hover:bg-surface2' onClick={() => setCollapsed(!collapsed)} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}>{compact ? <ChevronsLeft size={15} className='rotate-180' /> : <><ChevronsLeft size={15} /><span>Collapse menu</span></>}</button>
        </div>
    </aside>;

    return (
        <div className='app-frame flex h-full'>
            <div className='hidden md:flex'>{sidebar(collapsed)}</div>
            {drawer && <div className='fixed inset-0 z-50 md:hidden'><button aria-label='Close menu' className='absolute inset-0 bg-ink/35 backdrop-blur-[2px]' onClick={() => setDrawer(false)} />{sidebar(false, true)}</div>}
            <div className='flex min-w-0 flex-1 flex-col'>
                <header className='app-topbar sticky top-0 z-30 flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8'>
                    <button className='toolbar-icon md:hidden' aria-label='Open menu' onClick={() => setDrawer(true)}><Menu size={19} /></button>
                    <div className='flex min-w-0 items-center gap-2 text-xs text-muted'><span className='hidden sm:inline'>Workspace</span><ChevronDown size={13} className='hidden rotate-[-90deg] sm:block' /><select className='max-w-[210px] truncate border-0 bg-transparent py-1 text-sm font-semibold text-ink outline-none' value={ws.id} onChange={(e) => (e.target.value === '__new' ? setCreating(true) : selectWs(e.target.value))}>
                        {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}<option value='__new'>+ New workspace</option>
                    </select></div>
                    <div className='flex-1' />
                    <span className='hidden text-xs text-muted lg:block'>{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    {can('post.write') && <Button size='sm' className='!rounded-lg !px-3' onClick={() => go('studio/new')}><Plus size={15} /> <span className='hidden sm:inline'>Create post</span></Button>}
                    <Bell_ wsId={ws.id} />
                    <button className='toolbar-icon' aria-label='Toggle theme' title={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleDark}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
                    <div className='relative'>
                        <button className='flex h-9 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-2 transition hover:bg-surface2' aria-label='Account menu' aria-expanded={accountMenu} onClick={() => setAccountMenu(!accountMenu)}>
                            <span className='flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(145deg,#2c79ed,#53b5cd)] text-[11px] font-bold text-white'>{(user.name || user.email || '?').slice(0, 1).toUpperCase()}</span><ChevronDown size={13} className='text-muted' />
                        </button>
                        {accountMenu && <><button className='fixed inset-0 z-30 cursor-default' aria-label='Close account menu' onClick={() => setAccountMenu(false)} /><Card className='absolute right-0 z-40 mt-2 w-56 p-2 shadow-xl'><div className='border-b border-line px-2 pb-2'><div className='text-xs font-semibold'>{user.name}</div><div className='mt-0.5 truncate text-[11px] text-muted'>{user.email}</div></div><a href='#/settings' className='mt-1 block rounded-lg px-2 py-2 text-xs hover:bg-surface2' onClick={() => setAccountMenu(false)}>Account settings</a><button className='flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-bad hover:bg-bad/5' onClick={signOut}><LogOut size={14} />Sign out</button></Card></>}
                    </div>
                </header>
                <main className='min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
                    <div className='mx-auto w-full max-w-[1480px]'><Page key={ws.id + page + id} id={id} query={query} /></div>
                </main>
            </div>
            {creating && <NewWorkspace onClose={() => setCreating(false)} />}
            {showOnboarding && <Onboarding />}
        </div>
    );
}

export default function App() {
    return (
        <AppProvider loading={<Spinner label='Loading SocialFlow' />} signedOut={<SignedOut />}>
            <Shell />
        </AppProvider>
    );
}
