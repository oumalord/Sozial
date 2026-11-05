import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import * as A from '../lib/api';
import { useWs, go } from '../lib/hooks';
import { Badge, Button, Card, Empty } from '../lib/ui';

const COLS = ['title', 'caption', 'media', 'platform', 'account', 'date', 'time', 'timezone', 'hashtags'];
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(34);

const cell = (v: unknown): string => {
    const s = v === undefined || v === null ? '' : String(v);
    return s.includes(',') || s.includes(Q) || s.includes(NL) ? Q + s.split(Q).join(Q + Q) + Q : s;
};

export default function Bulk() {
    const { ws, tz, toast, meta } = useWs();
    const [rows, setRows] = useState<any[]>([]);
    const [busy, setBusy] = useState('');
    const [done, setDone] = useState(0);
    const ref = useRef<HTMLInputElement>(null);
    const blocked = !ws.plan.features.bulk;

    const toCsv = (list: any[]) => [COLS.join(',')].concat(list.map((r) => COLS.map((c) => cell(r[c])).join(','))).join(NL);
    const check = async (csv: string) => {
        setBusy('check');
        try {
            const r = await A.post('/api/w/' + ws.id + '/bulk/preview', { csv });
            setRows(r.rows);
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const template = () => {
        const sample = [COLS.join(','), 'Launch teaser,Our new range is here,,instagram,@yourbrand,' + new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) + ',09:00,' + tz + ',#launch #new'].join(NL);
        const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sozial-bulk-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };
    const edit = (i: number, k: string, v: string) => setRows(rows.map((r, x) => (x === i ? { ...r, [k]: v } : r)));
    const valid = rows.filter((r) => !r.errors.length);
    const commit = async () => {
        setBusy('commit');
        try {
            const r = await A.post('/api/w/' + ws.id + '/bulk/commit', { rows: valid });
            const next: any[] = [];
            let ok = 0;
            r.results.forEach((res: any, i: number) => {
                if (res.ok) ok++;
                else next.push({ ...valid[i], errors: res.errors });
            });
            setDone(done + ok);
            setRows(rows.filter((x) => x.errors.length).concat(next));
            toast(ok + ' post' + (ok === 1 ? '' : 's') + ' scheduled');
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };

    if (blocked) return <Card><Empty title='Bulk scheduling is a Pro feature' text='Upgrade to import a CSV and schedule many posts at once.' action={<Button onClick={() => go('billing')}>View plans</Button>} /></Card>;
    return (
        <div className='space-y-4'>
            <Card className='p-5'>
                <h3 className='text-sm font-semibold'>Import a CSV</h3>
                <p className='mt-1 text-xs text-muted'>Columns: {COLS.join(', ')}. Platform values: {Object.keys(meta.platforms).join(', ')}. The account must already be connected. Media is matched by file name from your library. Dates are YYYY-MM-DD and times HH:MM.</p>
                <div className='mt-3 flex flex-wrap gap-2'>
                    <Button variant='secondary' onClick={template}><Download size={14} />Download template</Button>
                    <Button loading={busy === 'check'} onClick={() => ref.current?.click()}><Upload size={14} />Choose CSV file</Button>
                    <input ref={ref} hidden type='file' accept='.csv,text/csv' onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setDone(0); await check(await f.text()); } e.target.value = ''; }} />
                </div>
            </Card>
            {done > 0 && <Card className='border-ok/50 bg-ok/5 p-4 text-sm'>{done} post{done === 1 ? '' : 's'} scheduled so far. Find them in the calendar.</Card>}
            {rows.length > 0 && (
                <Card className='p-5'>
                    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
                        <div className='text-sm'><b>{valid.length}</b> ready, <b className={rows.length - valid.length ? 'text-bad' : ''}>{rows.length - valid.length}</b> with problems</div>
                        <div className='flex gap-2'>
                            <Button variant='secondary' loading={busy === 'check'} onClick={() => check(toCsv(rows))}>Re-validate</Button>
                            <Button loading={busy === 'commit'} disabled={!valid.length} onClick={commit}>Schedule {valid.length} valid post{valid.length === 1 ? '' : 's'}</Button>
                        </div>
                    </div>
                    <div className='overflow-x-auto'>
                        <table className='w-full min-w-[900px] text-xs'>
                            <thead className='text-left text-muted'><tr><th className='pb-2'>Status</th>{COLS.map((c) => <th key={c} className='pb-2'>{c}</th>)}</tr></thead>
                            <tbody className='divide-y divide-line align-top'>
                                {rows.map((r, i) => (
                                    <tr key={i}>
                                        <td className='py-2 pr-2'>{r.errors.length ? <Badge tone='bad'>Fix</Badge> : <Badge tone='ok'>Ready</Badge>}</td>
                                        {COLS.map((c) => <td key={c} className='py-1.5 pr-1.5'><input className='input !py-1 !text-xs' value={r[c] || ''} onChange={(e) => edit(i, c, e.target.value)} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {rows.some((r) => r.errors.length) && (
                        <ul className='mt-3 space-y-1 text-xs text-bad'>{rows.map((r, i) => r.errors.map((m: string, k: number) => <li key={i + '-' + k}>Row {i + 1}: {m}</li>))}</ul>
                    )}
                </Card>
            )}
        </div>
    );
}
