import { useState } from 'react';
import { Plus, RefreshCw, Trash2, ChevronDown, ExternalLink } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs } from '../lib/hooks';
import { Badge, Button, Card, ConnBadge, Empty, Field, Modal, PageHeader, PlatformChip, Spinner } from '../lib/ui';

function AddAccount({ onClose, onDone, brands, integrations }: { onClose: () => void; onDone: () => void; brands: any[]; integrations: any[] }) {
    const { ws, toast } = useWs();
    const available = integrations.filter((integration) => !integration.assigned && !integration.disabled);
    const [f, setF] = useState({ postizIntegrationId: available[0]?.id || '', brandId: brands[0]?.id || 'main' });
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        try {
            await A.post('/api/w/' + ws.id + '/accounts', f);
            toast('Postiz channel assigned to this workspace');
            onDone();
            onClose();
        } catch (e: any) {
            toast(e.message, 'err');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal title='Assign a Postiz channel' onClose={onClose}>
            <div className='space-y-3'>
                <Field label='Connected channel'>
                    <select className='input' value={f.postizIntegrationId} onChange={(e) => setF({ ...f, postizIntegrationId: e.target.value })}>
                        {available.map((integration) => <option key={integration.id} value={integration.id}>{integration.name} · {integration.platform}{integration.profile ? ' · ' + integration.profile : ''}</option>)}
                    </select>
                </Field>
                <Field label='Brand'>
                    <select className='input' value={f.brandId} onChange={(e) => setF({ ...f, brandId: e.target.value })}>
                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </Field>
                <p className='text-[11px] text-muted'>SocialFlow customers will see this channel in their workspace but will not have access to Postiz.</p>
                <div className='flex justify-end gap-2 pt-2'>
                    <Button variant='secondary' onClick={onClose}>Cancel</Button>
                    <Button loading={busy} onClick={save} disabled={!f.postizIntegrationId}>Assign channel</Button>
                </div>
            </div>
        </Modal>
    );
}

export default function Accounts() {
    const { ws, meta, isAdmin, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const { data, loading, reload } = useLoad(async () => {
        const [acc, brandData, postiz] = await Promise.all([
            A.get('/api/w/' + ws.id + '/accounts'),
            A.get('/api/w/' + ws.id + '/brands'),
            isAdmin ? A.get('/api/admin/postiz/integrations?workspace=' + encodeURIComponent(ws.id)).catch((error: any) => ({ integrations: [], dashboardUrl: '', error: error.message })) : Promise.resolve({ integrations: [], dashboardUrl: '' }),
        ]);
        return { acc, brands: brandData, postiz };
    }, [ws.id, isAdmin]);
    const [adding, setAdding] = useState(false);
    const [guide, setGuide] = useState(false);
    const [brandName, setBrandName] = useState('');
    const [busy, setBusy] = useState('');
    const manage = isAdmin;
    const provider = (meta.providers || []).find((p: any) => p.id === 'postiz');
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
    const integrations: any[] = data?.postiz.integrations || [];
    return (
        <div className='fade-in'>
            <PageHeader title='Social Accounts' subtitle={accounts.length + ' channel' + (accounts.length === 1 ? '' : 's') + ' assigned to this workspace'} actions={manage && <div className='flex flex-wrap gap-2'>{data?.postiz.dashboardUrl && <a className='inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface2' href={data.postiz.dashboardUrl} target='_blank' rel='noreferrer'><ExternalLink size={14} />Open Postiz</a>}<Button variant='secondary' onClick={reload}><RefreshCw size={14} />Refresh channels</Button><Button onClick={() => setAdding(true)} disabled={!provider?.configured || !integrations.some((integration) => !integration.assigned && !integration.disabled)}><Plus size={16} />Assign channel</Button></div>} />
            {provider && !provider.configured && (
                <Card className='mb-4 border-warn/50 bg-warn/5 p-4 text-sm'>
                    <div className='font-semibold'>Postiz is not connected</div>
                    <p className='mt-1 text-muted'>A Sozial administrator must configure POSTIZ_API_URL and POSTIZ_API_KEY on the server. Customers can schedule content after a channel is assigned to this workspace.</p>
                </Card>
            )}
            {manage && provider?.configured && <Card className='mb-4 border-brand/20 bg-brand/5 p-4 text-sm'><div className='font-semibold'>Administrator channel setup</div><p className='mt-1 text-muted'>Connect channels in the private Postiz dashboard, then refresh this list and assign each channel to its customer workspace. A Postiz channel can be assigned to only one workspace.</p></Card>}
            {accounts.length === 0 ? (
                <Card><Empty title='No channels assigned' text={manage ? 'Connect a social account in Postiz, refresh this page, then assign it to this workspace.' : 'A Sozial administrator will assign your connected social channels here.'} action={manage && provider?.configured && integrations.some((integration) => !integration.assigned && !integration.disabled) ? <Button onClick={() => setAdding(true)}>Assign a channel</Button> : undefined} /></Card>
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
                                    {a.postizAssigned && <Button size='sm' variant='secondary' loading={busy === a.id} onClick={() => verify(a.id)}><RefreshCw size={13} />Verify Postiz channel</Button>}
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
            {adding && <AddAccount brands={brands} integrations={integrations} onClose={() => setAdding(false)} onDone={reload} />}
        </div>
    );
}
