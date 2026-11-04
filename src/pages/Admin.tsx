import { useMemo, useState } from 'react';
import { Building2, Check, ChevronRight, CirclePlus, Copy, Search, ShieldCheck, Users } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad } from '../lib/hooks';
import { useApp } from '../lib/store';
import { Badge, Button, Card, Empty, Field, Modal, Spinner, cx } from '../lib/ui';
import { browserTz } from '../lib/format';

type Workspace = {
    id: string;
    name: string;
    type: string;
    planId: string;
    ownerName: string | null;
    ownerEmail: string | null;
    ownerStatus: 'active' | 'invited';
    createdAt: string;
};

const TYPE_LABELS: Record<string, string> = { business: 'Business', agency: 'Agency', manager: 'Social media manager', creator: 'Creator' };

export default function Admin() {
    const { user, signOut, toast } = useApp();
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [name, setName] = useState('');
    const [type, setType] = useState('business');
    const [ownerName, setOwnerName] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [planId, setPlanId] = useState('free');
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<any>(null);
    const { data, loading, err, reload } = useLoad(async () => {
        const [workspaces, overview, plans] = await Promise.all([A.get('/api/admin/workspaces'), A.get('/api/admin/overview'), A.get('/api/admin/plans')]);
        return { workspaces: workspaces.workspaces as Workspace[], overview, plans: plans.plans as any[] };
    }, []);
    const filtered = useMemo(() => (data?.workspaces || []).filter((workspace) => [workspace.name, workspace.ownerName, workspace.ownerEmail, TYPE_LABELS[workspace.type], workspace.planId].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase()))), [data, search]);

    const reset = () => {
        setName('');
        setType('business');
        setOwnerName('');
        setOwnerEmail('');
        setPlanId('free');
        setCreated(null);
    };
    const provision = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await A.post('/api/admin/workspaces', { name, type, ownerName, ownerEmail, planId, timezone: browserTz() });
            setCreated(result);
            toast(result.ownerRegistered ? 'Organization created and owner access granted.' : 'Organization created. The owner can claim it after registering.', 'ok');
            await reload();
        } catch (error: any) {
            toast(error.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.origin);
            toast('App link copied.', 'ok');
        } catch {
            toast('Copy the app URL from your browser address bar.', 'err');
        }
    };

    return <div className='min-h-full bg-[rgb(var(--bg))]'>
        <header className='sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-xl'>
            <div className='mx-auto flex h-[68px] max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8'>
                <span className='flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white'><ShieldCheck size={18} /></span>
                <div><div className='text-sm font-bold'>SocialFlow control room</div><div className='text-[10px] text-muted'>Superadmin · {user.email}</div></div>
                <div className='flex-1' />
                <a href='#/overview' className='hidden items-center gap-1 text-xs font-medium text-muted hover:text-brand sm:flex'>Workspace setup <ChevronRight size={14} /></a>
                <Button variant='secondary' size='sm' className='!rounded-lg' onClick={signOut}>Sign out</Button>
            </div>
        </header>

        <main className='mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
            <div className='mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
                <div><div className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-brand'><span className='h-1.5 w-1.5 rounded-full bg-brand' />Tenant administration</div><h1 className='font-[Manrope] text-[28px] font-bold tracking-[-0.03em]'>Organizations</h1><p className='mt-1 text-sm text-muted'>Provision a workspace, assign its plan, and invite the organization owner.</p></div>
                <Button className='!rounded-lg' onClick={() => { reset(); setCreateOpen(true); }}><CirclePlus size={16} />Provision organization</Button>
            </div>

            {err && <Card className='mb-4 border-bad p-4 text-sm text-bad'>{err}</Card>}
            {loading && !data ? <Spinner label='Loading organizations' /> : data && <>
                <div className='mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4'>
                    <Card className='p-4'><div className='flex items-center justify-between text-xs text-muted'><span>Organizations</span><Building2 size={16} className='text-brand' /></div><div className='mt-3 font-[Manrope] text-2xl font-bold'>{data.overview.workspaces}</div></Card>
                    <Card className='p-4'><div className='flex items-center justify-between text-xs text-muted'><span>Registered users</span><Users size={16} className='text-brand' /></div><div className='mt-3 font-[Manrope] text-2xl font-bold'>{data.overview.users}</div></Card>
                    <Card className='p-4'><div className='flex items-center justify-between text-xs text-muted'><span>Pending publishing jobs</span><span className='h-2 w-2 rounded-full bg-[#e6a445]' /></div><div className='mt-3 font-[Manrope] text-2xl font-bold'>{data.overview.pendingJobs}</div></Card>
                    <Card className='p-4'><div className='flex items-center justify-between text-xs text-muted'><span>Failed jobs</span><span className={cx('h-2 w-2 rounded-full', data.overview.failedJobs ? 'bg-bad' : 'bg-ok')} /></div><div className='mt-3 font-[Manrope] text-2xl font-bold'>{data.overview.failedJobs}</div></Card>
                </div>

                <Card className='overflow-hidden'>
                    <div className='flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
                        <div><h2 className='text-sm font-bold'>Tenant workspaces</h2><p className='mt-1 text-[11px] text-muted'>Owners receive workspace access when they sign in or register with their invited email.</p></div>
                        <label className='relative block w-full sm:max-w-[260px]'><Search size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-muted' /><input className='input !rounded-lg !py-2 !pl-9 text-xs' placeholder='Search organizations' value={search} onChange={(event) => setSearch(event.target.value)} /></label>
                    </div>
                    {filtered.length ? <div className='overflow-x-auto'><table className='w-full min-w-[760px] text-left text-xs'>
                        <thead className='bg-surface2/70 text-[10px] uppercase tracking-[0.08em] text-muted'><tr><th className='px-5 py-3 font-semibold'>Organization</th><th className='px-3 py-3 font-semibold'>Owner</th><th className='px-3 py-3 font-semibold'>Type</th><th className='px-3 py-3 font-semibold'>Plan</th><th className='px-3 py-3 font-semibold'>Access</th><th className='px-5 py-3 text-right font-semibold'>Created</th></tr></thead>
                        <tbody className='divide-y divide-line'>{filtered.map((workspace) => <tr key={workspace.id} className='transition hover:bg-surface2/50'>
                            <td className='px-5 py-3.5'><div className='font-semibold'>{workspace.name}</div><div className='mt-1 font-mono text-[9px] text-muted'>{workspace.id}</div></td>
                            <td className='px-3 py-3.5'><div className='font-medium'>{workspace.ownerName || 'Owner pending'}</div><div className='mt-1 text-[10px] text-muted'>{workspace.ownerEmail || 'No owner email'}</div></td>
                            <td className='px-3 py-3.5 text-muted'>{TYPE_LABELS[workspace.type] || workspace.type}</td>
                            <td className='px-3 py-3.5'><Badge tone='neutral'>{workspace.planId}</Badge></td>
                            <td className='px-3 py-3.5'><Badge tone={workspace.ownerStatus === 'active' ? 'ok' : 'warn'}>{workspace.ownerStatus === 'active' ? 'Active' : 'Invite pending'}</Badge></td>
                            <td className='px-5 py-3.5 text-right text-muted'>{workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : '—'}</td>
                        </tr>)}</tbody>
                    </table></div> : <Empty title={search ? 'No organizations match' : 'No organizations yet'} text={search ? 'Try another organization, owner email, or plan.' : 'Provision the first organization to start onboarding customers.'} />}
                </Card>
            </>}
        </main>

        {createOpen && <Modal title={created ? 'Organization provisioned' : 'Provision an organization'} onClose={() => { setCreateOpen(false); reset(); }} size='md'>
            {created ? <div className='space-y-4'>
                <div className='rounded-xl border border-ok/20 bg-ok/5 p-4'><div className='flex items-center gap-2 text-sm font-bold'><Check size={16} className='text-ok' />{created.workspace.name} is ready</div><p className='mt-2 text-xs leading-relaxed text-muted'>{created.ownerRegistered ? 'The owner already has an account and can access this workspace now.' : created.inviteDelivery}</p></div>
                <div className='rounded-xl bg-surface2 p-3'><div className='text-[10px] font-bold uppercase tracking-wide text-muted'>Owner</div><div className='mt-1 text-sm font-semibold'>{created.workspace.ownerEmail}</div><div className='mt-2 text-xs text-muted'>Plan: {created.workspace.planName} · Type: {TYPE_LABELS[created.workspace.type]}</div></div>
                {!created.ownerRegistered && <Button variant='secondary' className='w-full' onClick={copyLink}><Copy size={14} />Copy app link for owner</Button>}
                <div className='flex justify-end'><Button onClick={() => { setCreateOpen(false); reset(); }}>Done</Button></div>
            </div> : <form onSubmit={provision} className='space-y-3'>
                <div className='grid gap-3 sm:grid-cols-2'><Field label='Organization name'><input className='input' autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} required placeholder='Northstar Studio' /></Field><Field label='Organization type'><select className='input' value={type} onChange={(event) => setType(event.target.value)}><option value='business'>Business</option><option value='agency'>Agency</option><option value='manager'>Social media manager</option><option value='creator'>Creator</option></select></Field></div>
                <div className='grid gap-3 sm:grid-cols-2'><Field label='Owner name'><input className='input' maxLength={80} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder='Optional' /></Field><Field label='Owner email'><input className='input' type='email' maxLength={200} value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required placeholder='owner@company.com' /></Field></div>
                <Field label='Plan'><select className='input' value={planId} onChange={(event) => setPlanId(event.target.value)}>{(data?.plans || []).filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></Field>
                <p className='rounded-lg bg-surface2/70 p-3 text-[11px] leading-relaxed text-muted'>New owners receive access when they register using this email. Email delivery is not configured; no password is created or shared by the admin.</p>
                <div className='flex justify-end gap-2 pt-2'><Button type='button' variant='secondary' onClick={() => setCreateOpen(false)}>Cancel</Button><Button type='submit' loading={busy} disabled={!name.trim() || !ownerEmail.trim()}><Building2 size={15} />Create organization</Button></div>
            </form>}
        </Modal>}
    </div>;
}