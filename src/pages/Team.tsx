import { useState } from 'react';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner } from '../lib/ui';
import { useLoad, useWs } from '../lib/hooks';
import * as A from '../lib/api';
import { Check, Crown, Mail, Shield, UserPlus, Users, X } from 'lucide-react';

const ROLE_DESCRIPTION: Record<string, string> = {
    owner: 'Full organization control',
    admin: 'Manage settings, people, and content',
    manager: 'Coordinate publishing and approvals',
    creator: 'Create and schedule content',
    editor: 'Edit content and campaigns',
    approver: 'Review and approve submissions',
    viewer: 'Read-only workspace access',
};

type Member = { id: string; userId: string; name: string; email: string; role: string; joinedAt?: string; status?: string };
type Invitation = { id: string; email: string; role: string; invitedBy?: string; at?: string };

export default function Team() {
    const { ws, can, toast, ask, user } = useWs();
    const [inviteOpen, setInviteOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('creator');
    const [busy, setBusy] = useState(false);
    const { data, loading, err, reload } = useLoad(async () => A.get('/api/w/' + ws.id + '/team'), [ws.id]);
    const members: Member[] = data?.members || [];
    const invitations: Invitation[] = data?.invites || [];
    const roles: string[] = (data?.roles || ['admin', 'manager', 'creator', 'editor', 'approver', 'viewer']).filter((item: string) => item !== 'owner');
    const canManage = can('team.manage');

    const invite = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await A.post('/api/w/' + ws.id + '/team/invite', { email, role });
            toast(result.status === 'active' ? 'Organization access granted.' : 'Invitation saved. Share the app link with this person.', 'ok');
            setInviteOpen(false);
            setEmail('');
            setRole('creator');
            await reload();
        } catch (error: any) {
            toast(error.message, 'err');
        } finally {
            setBusy(false);
        }
    };

    const changeRole = async (member: Member, nextRole: string) => {
        if (nextRole === member.role) return;
        try {
            await A.put('/api/w/' + ws.id + '/team/' + member.userId, { role: nextRole });
            toast('Role updated.', 'ok');
            await reload();
        } catch (error: any) {
            toast(error.message, 'err');
        }
    };

    const removeMember = async (member: Member) => {
        if (!(await ask('Remove ' + member.email + ' from this organization?', 'Remove member'))) return;
        try {
            await A.del('/api/w/' + ws.id + '/team/' + member.userId);
            toast('Member removed.', 'ok');
            await reload();
        } catch (error: any) {
            toast(error.message, 'err');
        }
    };

    const revokeInvite = async (invitation: Invitation) => {
        if (!(await ask('Revoke the invitation for ' + invitation.email + '?', 'Revoke invite'))) return;
        try {
            await A.post('/api/w/' + ws.id + '/team/revoke', { email: invitation.email });
            toast('Invitation revoked.', 'ok');
            await reload();
        } catch (error: any) {
            toast(error.message, 'err');
        }
    };

    return <div className='fade-in'>
        <PageHeader title='People & roles' subtitle={'Manage who can work in ' + ws.name} actions={canManage ? <Button className='!rounded-lg' onClick={() => setInviteOpen(true)}><UserPlus size={15} />Add person</Button> : undefined} />
        {err && <Card className='mb-4 border-bad p-4 text-sm text-bad'>{err}</Card>}
        {loading && !data ? <Spinner label='Loading organization team' /> : <>
            <div className='mb-5 grid grid-cols-2 gap-3 xl:grid-cols-3'>
                <Card className='metric-card p-4'><div className='flex items-center justify-between text-xs text-muted'><span>People</span><Users size={16} className='text-[#a8c7ff]' /></div><div className='mt-3 font-[Manrope] text-[28px] font-bold'>{members.length}</div><div className='mt-2 text-[10px] text-muted'>Active organization accounts</div></Card>
                <Card className='metric-card p-4'><div className='flex items-center justify-between text-xs text-muted'><span>Pending invites</span><Mail size={16} className='text-[#c0b4ff]' /></div><div className='mt-3 font-[Manrope] text-[28px] font-bold'>{invitations.length}</div><div className='mt-2 text-[10px] text-muted'>Waiting for registration</div></Card>
                <Card className='metric-card col-span-2 p-4 xl:col-span-1'><div className='flex items-center gap-2 text-xs font-semibold'><Shield size={15} className='text-[#7bd9b0]' />Role-based access</div><p className='mt-2 text-[10px] leading-relaxed text-muted'>Organization admins control their own people and content. They cannot access other organizations or superadmin tools.</p></Card>
            </div>

            <Card className='module-panel overflow-hidden'>
                <div className='flex items-center justify-between border-b border-line px-4 py-4 sm:px-5'><div><h2 className='text-sm font-bold'>Organization people</h2><p className='mt-1 text-[10px] text-muted'>Assign responsibilities to each account</p></div><span className='rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-muted'>{members.length} active</span></div>
                {members.length ? <div className='divide-y divide-white/[0.06]'>{members.map((member) => <div key={member.userId} className='flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5'>
                    <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#4d70ab,#353751)] text-xs font-bold text-white'>{String(member.name || member.email || '?').slice(0, 1).toUpperCase()}</span>
                    <div className='min-w-[150px] flex-1'><div className='text-xs font-semibold'>{member.name || member.email}</div><div className='mt-1 truncate text-[10px] text-muted'>{member.email}{member.email === user.email ? ' · You' : ''}</div></div>
                    <div className='min-w-[190px] flex-1 sm:flex-none'>{member.role === 'owner' ? <div className='flex items-center gap-2'><Badge tone='accent'><Crown size={11} />Organization admin</Badge><span className='text-[9px] text-muted'>{ROLE_DESCRIPTION.owner}</span></div> : canManage ? <Field label='Responsibility'><select aria-label={'Role for ' + member.email} className='input !w-full !py-1.5 text-[10px] sm:w-[190px]' value={member.role} onChange={(event) => changeRole(member, event.target.value)}>{roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)} — {ROLE_DESCRIPTION[item]}</option>)}</select></Field> : <div><Badge tone='neutral'>{member.role}</Badge><div className='mt-1 text-[9px] text-muted'>{ROLE_DESCRIPTION[member.role]}</div></div>}</div>
                    {canManage && member.role !== 'owner' && <button className='toolbar-icon h-8 w-8 text-[#f19a87] hover:bg-[#f19a87]/10' aria-label={'Remove ' + member.email} title='Remove member' onClick={() => removeMember(member)}><X size={15} /></button>}
                </div>)}</div> : <Empty title='No organization members yet' text='Add an admin, manager, creator, or specialist to this workspace.' />}
            </Card>

            <Card className='module-panel mt-4 overflow-hidden'>
                <div className='flex items-center justify-between border-b border-line px-4 py-4 sm:px-5'><div><h2 className='text-sm font-bold'>Invitations</h2><p className='mt-1 text-[10px] text-muted'>New users claim their role when they register with the invited email</p></div><span className='rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-muted'>{invitations.length} pending</span></div>
                {invitations.length ? <div className='divide-y divide-white/[0.06]'>{invitations.map((invitation) => <div key={invitation.id} className='flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5'><span className='flex h-8 w-8 items-center justify-center rounded-lg bg-[#8f78ff]/10 text-[#c0b4ff]'><Mail size={15} /></span><span className='min-w-0 flex-1'><span className='block truncate text-xs font-semibold'>{invitation.email}</span><span className='mt-1 block text-[9px] text-muted'>Invited as {invitation.role} · {invitation.invitedBy || 'Organization admin'}</span></span><Badge tone='warn'>Pending</Badge>{canManage && <button className='toolbar-icon h-8 w-8 text-[#f19a87]' aria-label={'Revoke invite for ' + invitation.email} onClick={() => revokeInvite(invitation)}><X size={15} /></button>}</div>)}</div> : <div className='px-4 py-4 text-xs text-muted sm:px-5'>No pending invitations.</div>}
            </Card>
        </>}
        {inviteOpen && <Modal title='Add organization account' onClose={() => setInviteOpen(false)} size='sm'><form className='space-y-3' onSubmit={invite}><Field label='Work email'><input className='input' type='email' autoFocus maxLength={200} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder='person@company.com' /></Field><Field label='Responsibility'><select className='input' value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)} — {ROLE_DESCRIPTION[item]}</option>)}</select></Field><p className='rounded-lg bg-white/[0.04] p-3 text-[10px] leading-relaxed text-muted'>Access is limited to this organization. The person signs in or registers with this email; no password is created or shared by an admin.</p><div className='flex justify-end gap-2 pt-2'><Button type='button' variant='secondary' onClick={() => setInviteOpen(false)}>Cancel</Button><Button type='submit' loading={busy} disabled={!email.trim()}><Check size={14} />Grant access</Button></div></form></Modal>}
    </div>;
}