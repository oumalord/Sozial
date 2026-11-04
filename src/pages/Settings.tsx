import { useState } from 'react';
import * as A from '../lib/api';
import { useWs } from '../lib/hooks';
import { Button, Card, Field, PageHeader, Toggle } from '../lib/ui';
import { DAYS, timezones } from '../lib/format';

const NOTIF: [string, string][] = [['published', 'Successful publications'], ['failed', 'Failed publications'], ['expired', 'Expired social connections'], ['upcoming', 'Upcoming scheduled content'], ['approval', 'Posts awaiting approval'], ['storage', 'Storage limits'], ['billing', 'Subscription and renewals']];

export default function Settings() {
    const { ws, profile, can, refresh, toast, ask, signOut, dark, toggleDark } = useWs();
    const admin = can('settings.manage');
    const [p, setP] = useState({ name: profile.name || '', timezone: profile.timezone || 'UTC' });
    const [prefs, setPrefs] = useState<any>(profile.prefs);
    const [w, setW] = useState({ name: ws.name, type: ws.type, timezone: ws.timezone, approvalPolicy: ws.approvalPolicy });
    const [s, setS] = useState<any>(ws.settings);
    const [busy, setBusy] = useState('');
    const run = async (key: string, fn: () => Promise<any>, ok: string) => {
        setBusy(key);
        try {
            await fn();
            await refresh();
            toast(ok);
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const tzs = timezones();
    const toggleDay = (d: number) => setS({ ...s, preferredDays: s.preferredDays.includes(d) ? s.preferredDays.filter((x: number) => x !== d) : [...s.preferredDays, d].sort() });
    return (
        <div className='fade-in max-w-3xl space-y-4'>
            <PageHeader title='Settings' subtitle='Your profile, workspace and notifications' />

            <Card className='p-5'>
                <h3 className='mb-3 text-sm font-semibold'>Your profile</h3>
                <div className='grid gap-3 sm:grid-cols-2'>
                    <Field label='Name'><input className='input' value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
                    <Field label='Your time zone'>
                        <select className='input' value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{tzs.map((t) => <option key={t}>{t}</option>)}</select>
                    </Field>
                </div>
                <div className='mt-3 flex items-center justify-between'>
                    <label className='flex items-center gap-2 text-sm'><Toggle on={dark} onChange={toggleDark} label='Dark theme' />Dark theme</label>
                    <Button loading={busy === 'p'} onClick={() => run('p', () => A.put('/api/profile', p), 'Profile saved')}>Save profile</Button>
                </div>
            </Card>

            {admin && (
                <Card className='p-5'>
                    <h3 className='mb-3 text-sm font-semibold'>Workspace</h3>
                    <div className='grid gap-3 sm:grid-cols-2'>
                        <Field label='Workspace name'><input className='input' value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
                        <Field label='Account type'>
                            <select className='input' value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })}>
                                <option value='creator'>Content creator</option><option value='business'>Business</option><option value='agency'>Marketing agency</option><option value='manager'>Social media manager</option>
                            </select>
                        </Field>
                        <Field label='Workspace time zone' hint='Used for scheduling and reports.'>
                            <select className='input' value={w.timezone} onChange={(e) => setW({ ...w, timezone: e.target.value })}>{tzs.map((t) => <option key={t}>{t}</option>)}</select>
                        </Field>
                        <Field label='Approval policy' hint='Posts awaiting approval never publish automatically.'>
                            <select className='input' value={w.approvalPolicy} onChange={(e) => setW({ ...w, approvalPolicy: e.target.value })}>
                                <option value='creators'>Only content creators need approval</option>
                                <option value='everyone'>Every post needs approval (Business and Agency)</option>
                            </select>
                        </Field>
                    </div>
                    <div className='mt-4'>
                        <span className='label'>Posting preferences</span>
                        <div className='grid gap-3 sm:grid-cols-2'>
                            <Field label='Posts per week'><input type='number' min={1} max={50} className='input' value={s.postingFrequency} onChange={(e) => setS({ ...s, postingFrequency: Number(e.target.value) })} /></Field>
                            <Field label='Preferred time slots (comma separated, 24h)'><input className='input' value={s.slots.join(', ')} onChange={(e) => setS({ ...s, slots: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
                        </div>
                        <div className='mt-3 flex flex-wrap gap-1.5'>
                            {DAYS.map((d, i) => <button key={d} onClick={() => toggleDay(i)} className={'rounded-lg border px-3 py-1.5 text-xs font-medium ' + (s.preferredDays.includes(i) ? 'border-brand bg-brand text-white' : 'border-line')}>{d}</button>)}
                        </div>
                    </div>
                    <div className='mt-4 flex justify-end'>
                        <Button loading={busy === 'w'} onClick={() => run('w', () => A.put('/api/w/' + ws.id, { ...w, settings: s }), 'Workspace saved')}>Save workspace</Button>
                    </div>
                </Card>
            )}

            <Card className='p-5'>
                <h3 className='mb-1 text-sm font-semibold'>Notifications</h3>
                <p className='mb-3 text-xs text-muted'>In-app alerts are live. Email delivery is not enabled yet; your email choices are saved for when it is. WhatsApp is planned for a later phase.</p>
                <table className='w-full text-sm'>
                    <thead className='text-left text-xs text-muted'><tr><th className='pb-2'>Event</th><th className='w-20'>In-app</th><th className='w-20'>Email</th></tr></thead>
                    <tbody className='divide-y divide-line'>
                        {NOTIF.map(([k, label]) => (
                            <tr key={k}>
                                <td className='py-2.5'>{label}</td>
                                {['inApp', 'email'].map((ch) => (
                                    <td key={ch}><Toggle label={label + ' ' + ch} on={prefs[ch][k] !== false} onChange={(v) => setPrefs({ ...prefs, [ch]: { ...prefs[ch], [k]: v } })} /></td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className='mt-3 flex justify-end'><Button loading={busy === 'n'} onClick={() => run('n', () => A.put('/api/profile', { prefs }), 'Notification preferences saved')}>Save preferences</Button></div>
            </Card>

            <Card className='border-bad/40 p-5'>
                <h3 className='mb-3 text-sm font-semibold text-bad'>Danger zone</h3>
                <div className='flex flex-wrap gap-2'>
                    {can('ws.delete') && (
                        <Button variant='danger' onClick={async () => { if (await ask('Delete the workspace ' + ws.name + '? Its scheduled posts will stop publishing.', 'Delete workspace')) { await A.del('/api/w/' + ws.id); await refresh(); window.location.hash = '#/overview'; } }}>Delete workspace</Button>
                    )}
                    <Button variant='secondary' onClick={async () => { if (await ask('Permanently delete your account and leave all workspaces?', 'Delete account')) { await A.del('/api/profile'); await signOut(); } }}>Delete my account</Button>
                </div>
            </Card>
        </div>
    );
}
