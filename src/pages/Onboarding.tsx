import { useState } from 'react';
import * as A from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field, Toggle, cx } from '../lib/ui';
import { DAYS, browserTz, timezones } from '../lib/format';

const TYPES: [string, string, string][] = [['creator', 'Content creator', 'Grow your own channels'], ['business', 'Business', 'Promote your company'], ['agency', 'Marketing agency', 'Manage several clients'], ['manager', 'Social media manager', 'Run accounts for others']];
const STEPS = ['Workspace', 'Account type', 'Accounts', 'Time zone', 'Frequency', 'Notifications', 'Finish'];

export default function Onboarding() {
    const { ws, refresh, toast, profile, isAdmin, user, signOut } = useApp();
    const [step, setStep] = useState(ws ? 3 : 1);
    const [name, setName] = useState('');
    const [type, setType] = useState('creator');
    const [tz, setTz] = useState(browserTz());
    const [freq, setFreq] = useState(3);
    const [days, setDays] = useState<number[]>([1, 3, 5]);
    const [prefs, setPrefs] = useState<any>(profile.prefs);
    const [busy, setBusy] = useState(false);
    const w: any = ws;

    if (!ws && !isAdmin) return (
        <div className='auth-screen flex min-h-full items-center justify-center p-5'>
            <div className='auth-panel w-full max-w-md p-6 text-center sm:p-8'>
                <div className='mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-lg font-extrabold text-white'>S<span className='text-accent'>.</span></div>
                <h1 className='font-[Manrope] text-xl font-bold'>You’re waiting for organization access</h1>
                <p className='mt-3 text-sm leading-relaxed text-muted'>Your Sozial account is signed in, but it is not attached to an organization yet. Ask your organization admin or Sozial superadmin to invite this email.</p>
                <p className='mt-3 rounded-lg bg-surface2 p-3 text-xs font-medium'>{user.email}</p>
                <Button variant='secondary' className='mt-5 !rounded-lg' onClick={signOut}>Sign out</Button>
            </div>
        </div>
    );

    const wrap = async (fn: () => Promise<any>, next = step + 1) => {
        setBusy(true);
        try {
            await fn();
            setStep(next);
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    const create = () => wrap(async () => {
        await A.post('/api/workspaces', { name, type, timezone: tz });
        await refresh();
    }, 3);
    const finish = () => wrap(async () => {
        await A.put('/api/w/' + w.id, { onboardingDone: true });
        await refresh();
    }, 7);
    const skipAll = async () => {
        if (!w) return;
        try {
            await A.put('/api/w/' + w.id, { onboardingDone: true });
            await refresh();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };

    return (
        <div className='fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-navy p-4'>
            <div className='fade-in w-full max-w-xl rounded-3xl border border-line bg-surface p-6 shadow-2xl sm:p-8'>
                {isAdmin && !ws && <div className='mb-4 flex justify-end'><a href='#/admin' className='text-xs font-semibold text-brand hover:underline'>Open superadmin console</a></div>}
                <div className='mb-6 flex items-center gap-1.5'>
                    {STEPS.slice(0, 6).map((s, i) => <div key={s} className={cx('h-1.5 flex-1 rounded-full', i + 1 <= step ? 'bg-brand' : 'bg-surface2')} />)}
                </div>

                {step === 1 && (
                    <>
                        <h2 className='text-xl font-semibold'>Create your workspace</h2>
                        <p className='mb-5 mt-1 text-sm text-muted'>A workspace holds your brands, accounts, content and team.</p>
                        <Field label='Workspace name'><input autoFocus className='input' value={name} onChange={(e) => setName(e.target.value)} placeholder='Acme Studio' /></Field>
                        <div className='mt-6 flex justify-end'><Button disabled={!name.trim()} onClick={() => setStep(2)}>Continue</Button></div>
                    </>
                )}
                {step === 2 && (
                    <>
                        <h2 className='text-xl font-semibold'>What best describes you?</h2>
                        <div className='mt-5 grid gap-2 sm:grid-cols-2'>
                            {TYPES.map(([v, t, d]) => (
                                <button key={v} onClick={() => setType(v)} className={cx('rounded-2xl border p-4 text-left transition', type === v ? 'border-brand bg-brand/5' : 'border-line hover:bg-surface2')}>
                                    <div className='text-sm font-semibold'>{t}</div><div className='text-xs text-muted'>{d}</div>
                                </button>
                            ))}
                        </div>
                        <Field label='Time zone'><select className='input mt-4' value={tz} onChange={(e) => setTz(e.target.value)}>{timezones().map((t) => <option key={t}>{t}</option>)}</select></Field>
                        <div className='mt-6 flex justify-between'><Button variant='ghost' onClick={() => setStep(1)}>Back</Button><Button loading={busy} onClick={create}>Create workspace</Button></div>
                    </>
                )}
                {step === 3 && (
                    <>
                        <h2 className='text-xl font-semibold'>Social channels</h2>
                        <p className='mt-1 text-sm text-muted'>SocialFlow administrators connect accounts in Postiz and assign the channels your workspace can publish to.</p>
                        <div className='mt-4 rounded-xl border border-line bg-surface2/60 p-4 text-sm leading-relaxed text-muted'>{isAdmin ? 'Finish setup first. Then connect channels in Postiz and assign them to each customer from Social Accounts.' : 'Your assigned channels will appear in the composer as soon as a Sozial administrator connects and assigns them. You do not need a Postiz account.'}</div>
                        <div className='mt-6 flex justify-between'><Button variant='ghost' onClick={() => setStep(4)}>Skip for now</Button><Button onClick={() => setStep(4)}>Continue</Button></div>
                    </>
                )}
                {step === 4 && (
                    <>
                        <h2 className='text-xl font-semibold'>Confirm your time zone</h2>
                        <p className='mb-4 mt-1 text-sm text-muted'>Posts are stored in UTC and shown in this time zone.</p>
                        <select className='input' value={tz} onChange={(e) => setTz(e.target.value)}>{timezones().map((t) => <option key={t}>{t}</option>)}</select>
                        <div className='mt-6 flex justify-between'><Button variant='ghost' onClick={() => setStep(5)}>Skip</Button><Button loading={busy} onClick={() => wrap(() => A.put('/api/w/' + w.id, { timezone: tz }))}>Continue</Button></div>
                    </>
                )}
                {step === 5 && (
                    <>
                        <h2 className='text-xl font-semibold'>How often do you want to post?</h2>
                        <Field label='Posts per week'><input type='number' min={1} max={50} className='input' value={freq} onChange={(e) => setFreq(Number(e.target.value))} /></Field>
                        <span className='label mt-4'>Preferred days</span>
                        <div className='flex flex-wrap gap-1.5'>{DAYS.map((d, i) => <button key={d} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())} className={cx('rounded-lg border px-3 py-1.5 text-xs font-medium', days.includes(i) ? 'border-brand bg-brand text-white' : 'border-line')}>{d}</button>)}</div>
                        <div className='mt-6 flex justify-between'><Button variant='ghost' onClick={() => setStep(6)}>Skip</Button><Button loading={busy} onClick={() => wrap(() => A.put('/api/w/' + w.id, { settings: { postingFrequency: freq, preferredDays: days } }))}>Continue</Button></div>
                    </>
                )}
                {step === 6 && (
                    <>
                        <h2 className='text-xl font-semibold'>Notifications</h2>
                        <p className='mb-4 mt-1 text-sm text-muted'>Choose which alerts you want. Failures and expired connections are recommended.</p>
                        {[['failed', 'Failed publications'], ['expired', 'Expired connections'], ['published', 'Successful publications'], ['approval', 'Approvals']].map(([k, l]) => (
                            <div key={k} className='flex items-center justify-between py-2 text-sm'>{l}<Toggle label={l} on={prefs.inApp[k] !== false} onChange={(v) => setPrefs({ ...prefs, inApp: { ...prefs.inApp, [k]: v } })} /></div>
                        ))}
                        <div className='mt-6 flex justify-between'><Button variant='ghost' onClick={finish}>Skip</Button><Button loading={busy} onClick={() => wrap(async () => { await A.put('/api/profile', { prefs }); await A.put('/api/w/' + w.id, { onboardingDone: true }); await refresh(); }, 7)}>Enter dashboard</Button></div>
                    </>
                )}
                {ws && step < 7 && <button className='mt-5 block w-full text-center text-xs text-muted hover:text-ink' onClick={skipAll}>Skip setup and finish later</button>}
            </div>
        </div>
    );
}
