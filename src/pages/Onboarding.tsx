import { useState } from 'react';
import { Check } from 'lucide-react';
import * as A from '../lib/api';
import { useApp } from '../lib/store';
import { Button, Field, Toggle, cx } from '../lib/ui';
import { DAYS, browserTz, timezones } from '../lib/format';

const TYPES: [string, string, string][] = [['creator', 'Content creator', 'Grow your own channels'], ['business', 'Business', 'Promote your company'], ['agency', 'Marketing agency', 'Manage several clients'], ['manager', 'Social media manager', 'Run accounts for others']];
const STEPS = ['Workspace', 'Account type', 'Accounts', 'Time zone', 'Frequency', 'Notifications', 'Finish'];

export default function Onboarding() {
    const { ws, meta, refresh, toast, profile } = useApp();
    const [step, setStep] = useState(ws ? 3 : 1);
    const [name, setName] = useState('');
    const [type, setType] = useState('creator');
    const [tz, setTz] = useState(browserTz());
    const [freq, setFreq] = useState(3);
    const [days, setDays] = useState<number[]>([1, 3, 5]);
    const [prefs, setPrefs] = useState<any>(profile.prefs);
    const [acc, setAcc] = useState({ platform: 'instagram', handle: '', mode: 'manual' });
    const [added, setAdded] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const P: Record<string, any> = meta.platforms;
    const w: any = ws;

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
                        <h2 className='text-xl font-semibold'>Add your social accounts</h2>
                        <p className='mb-4 mt-1 text-sm text-muted'>Optional. You can add or change these any time in Social Accounts.</p>
                        <div className='grid gap-3'>
                            <div className='grid grid-cols-2 gap-2'>
                                <select className='input' value={acc.platform} onChange={(e) => setAcc({ ...acc, platform: e.target.value })}>{Object.values<any>(P).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                                <input className='input' placeholder='@handle' value={acc.handle} onChange={(e) => setAcc({ ...acc, handle: e.target.value })} />
                            </div>
                            <select className='input' value={acc.mode} onChange={(e) => setAcc({ ...acc, mode: e.target.value })}>
                                <option value='manual'>Manual mode (you publish by hand)</option>
                                <option value='provider'>Automatic via publishing provider</option>
                            </select>
                            <Button variant='secondary' loading={busy} disabled={!acc.handle.trim()} onClick={() => wrap(async () => { await A.post('/api/w/' + w.id + '/accounts', acc); setAdded([...added, P[acc.platform].name + ' ' + acc.handle]); setAcc({ ...acc, handle: '' }); }, 3)}>Add account</Button>
                            {added.map((a) => <div key={a} className='flex items-center gap-2 text-sm'><Check size={14} className='text-ok' />{a}</div>)}
                        </div>
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
