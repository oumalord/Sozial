import { useState } from 'react';
import { Plus, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs } from '../lib/hooks';
import { Badge, Button, Card, ConnBadge, Empty, Field, Modal, PageHeader, PlatformChip, Spinner } from '../lib/ui';

function AddAccount({ onClose, onDone, brands }: { onClose: () => void; onDone: () => void; brands: any[] }) {
    const { ws, meta, toast } = useWs();
    const P: Record<string, any> = meta.platforms;
    const [f, setF] = useState({ platform: 'instagram', handle: '', displayName: '', mode: 'manual', brandId: brands[0]?.id || 'main' });
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        try {
            await A.post('/api/w/' + ws.id + '/accounts', f);
            toast('Account added');
            onDone();
            onClose();
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal title='Add a social account' onClose={onClose}>
            <div className='space-y-3'>
                <Field label='Platform'>
                    <select className='input' value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
                        {Object.values<any>(P).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field label='Handle or page name'><input className='input' value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder='@yourbrand' /></Field>
                <Field label='Display name (optional)'><input className='input' value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></Field>
                <Field label='Brand'>
                    <select className='input' value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })}>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </Field>
                <div>
                    <span className='label'>How should posts be published?</span>
                    <div className='grid gap-2'>
                        {[['manual', 'Manual mode', 'SocialFlow schedules and reminds you. You publish by hand and confirm.'], ['provider', 'Automatic via publishing provider', 'Requires an Ayrshare key set by an administrator and this network linked there.']].map(([v, t, d]) => (
                            <label key={v} className={'flex cursor-pointer gap-3 rounded-xl border p-3 ' + (f.mode === v ? 'border-brand bg-brand/5' : 'border-line')}>
                                <input type='radio' checked={f.mode === v} onChange={() => setF({ ...f, mode: v })} />
                                <span><span className='block text-sm font-medium'>{t}</span><span className='text-xs text-muted'>{d}</span></span>
                            </label>
                        ))}
                    </div>
                </div>
                <p className='text-[11px] text-muted'>Direct OAuth sign-in to each network needs each platform's developer approval. Until then, accounts are linked through the publishing provider.</p>
                <div className='flex justify-end gap-2 pt-2'>
                    <Button variant='secondary' onClick={onClose}>Cancel</Button>
                    <Button loading={busy} onClick={save} disabled={!f.handle.trim()}>Add account</Button>
                </div>
            </div>
        </Modal>
    );
}

export default function Accounts() {
    const { ws, meta, can, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const { data, loading, reload } = useLoad(async () => ({ acc: await A.get('/api/w/' + ws.id + '/accounts'), brands: await A.get('/api/w/' + ws.id + '/brands') }), [ws.id]);
    const [adding, setAdding] = useState(false);
    const [guide, setGuide] = useState(false);
    const [brandName, setBrandName] = useState('');
    const [busy, setBusy] = useState('');
    const manage = can('accounts.manage');
    const provider = (meta.providers || []).find((p: any) => p.id === 'ayrshare');
    const verify = async (id: string) => {
        setBusy(id);
        try {
            const r = await A.post('/api/w/' + ws.id + '/accounts/' + id + '/verify');
            toast(r.connection.message);
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy('');
        }
    };
    const remove = async (a: any) => {
        if (!(await ask('Remove ' + a.handle + '? Scheduled posts for it will fail.', 'Remove'))) return;
        await A.del('/api/w/' + ws.id + '/accounts/' + a.id);
        reload();
    };
    const addBrand = async () => {
        if (!brandName.trim()) return;
        try {
            await A.post('/api/w/' + ws.id + '/brands', { name: brandName });
            setBrandName('');
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    if (loading && !data) return <Spinner />;
    const accounts: any[] = data?.acc.accounts || [];
    const brands: any[] = data?.brands.brands || [];
    return (
        <div className='fade-in'>
            <PageHeader title='Social Accounts' subtitle={accounts.length + ' of ' + (data?.acc.limit ?? '-') + ' accounts used on the ' + ws.plan.name + ' plan'} actions={manage && <Button onClick={() => setAdding(true)}><Plus size={16} />Add account</Button>} />
            {provider && !provider.configured && (
                <Card className='mb-4 border-warn/50 bg-warn/5 p-4 text-sm'>
                    <div className='font-semibold'>Automatic publishing is not active</div>
                    <p className='mt-1 text-muted'>No publishing provider key is configured, so accounts cannot publish on their own. Posts for manual accounts will be queued and flagged for manual publishing. The administrator can add the AYRSHARE_API_KEY secret to turn automation on.</p>
                </Card>
            )}
            {accounts.length === 0 ? (
                <Card><Empty title='No accounts yet' text='Add the pages and profiles you publish to. Each is listed with its true connection state.' action={manage ? <Button onClick={() => setAdding(true)}>Add your first account</Button> : undefined} /></Card>
            ) : (
                <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                    {accounts.map((a) => (
                        <Card key={a.id} className='p-4'>
                            <div className='flex items-start gap-3'>
                                {P[a.platform] && <PlatformChip p={P[a.platform]} size={38} />}
                                <div className='min-w-0 flex-1'>
                                    <div className='truncate text-sm font-semibold'>{a.displayName || a.handle}</div>
                                    <div className='truncate text-xs text-muted'>{P[a.platform]?.name} · {a.handle}</div>
                                    <div className='mt-2 flex flex-wrap gap-1.5'>
                                        <ConnBadge state={a.connection.state} />
                                        <Badge>{brands.find((b) => b.id === a.brandId)?.name || 'Main brand'}</Badge>
                                    </div>
                                    <p className='mt-2 text-[11px] text-muted'>{a.connection.message}</p>
                                </div>
                            </div>
                            {manage && (
                                <div className='mt-3 flex justify-end gap-2'>
                                    {a.mode === 'provider' && <Button size='sm' variant='secondary' loading={busy === a.id} onClick={() => verify(a.id)}><RefreshCw size={13} />Verify</Button>}
                                    <Button size='sm' variant='ghost' onClick={() => remove(a)}><Trash2 size={13} />Remove</Button>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            <Card className='mt-6 p-5'>
                <h3 className='mb-3 text-sm font-semibold'>Brands</h3>
                <div className='mb-3 flex flex-wrap gap-2'>
                    {brands.map((b) => (
                        <Badge key={b.id} tone='info'>
                            {b.name}
                            {manage && b.id !== 'main' && <button className='ml-1 opacity-70 hover:opacity-100' aria-label={'Delete ' + b.name} onClick={async () => { await A.del('/api/w/' + ws.id + '/brands/' + b.id); reload(); }}>×</button>}
                        </Badge>
                    ))}
                </div>
                {manage && (
                    <div className='flex gap-2'>
                        <input className='input max-w-xs' placeholder='New brand or client name' value={brandName} onChange={(e) => setBrandName(e.target.value)} />
                        <Button variant='secondary' onClick={addBrand}>Add brand</Button>
                    </div>
                )}
            </Card>

            <Card className='mt-4 p-5'>
                <button className='flex w-full items-center justify-between text-left' onClick={() => setGuide(!guide)}>
                    <span className='text-sm font-semibold'>Platform capabilities and approvals</span>
                    <ChevronDown size={16} className={guide ? 'rotate-180' : ''} />
                </button>
                {guide && (
                    <div className='mt-4 overflow-x-auto'>
                        <table className='w-full min-w-[640px] text-left text-xs'>
                            <thead className='text-muted'><tr><th className='pb-2'>Network</th><th>Official API</th><th>What is required</th><th>Limits</th></tr></thead>
                            <tbody className='divide-y divide-line'>
                                {Object.values<any>(P).map((p) => (
                                    <tr key={p.id} className='align-top'>
                                        <td className='py-2 font-medium'>{p.name}</td>
                                        <td className='py-2 pr-3'>{p.nativeApi}</td>
                                        <td className='py-2 pr-3'>{p.nativeApproval}</td>
                                        <td className='py-2'>{p.captionMax.toLocaleString()} chars · {p.aspect}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
            {adding && <AddAccount brands={brands} onClose={() => setAdding(false)} onDone={reload} />}
        </div>
    );
}
