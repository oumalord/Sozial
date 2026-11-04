import { useRef, useState } from 'react';
import { Film, FolderPlus, Link2, Search, Trash2, Upload, Check } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs } from '../lib/hooks';
import { Badge, Button, Card, Empty, Field, Meter, Modal, PageHeader, Spinner, cx } from '../lib/ui';
import { ACCEPT, prepareFile } from '../lib/upload';
import { bytes } from '../lib/format';

export function useUploader(wsId: string, folderId: string | null, onDone: () => void) {
    const { toast } = useWs();
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const upload = async (files: FileList | File[]) => {
        const list = Array.from(files);
        if (!list.length) return;
        setProgress({ done: 0, total: list.length });
        let ok = 0;
        for (const f of list) {
            try {
                const prepared = await prepareFile(f);
                await A.post('/api/w/' + wsId + '/media', { ...prepared, folderId });
                ok++;
            } catch (e: any) {
                toast(e.message, 'err');
            }
            setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
        setProgress(null);
        if (ok) toast(ok + ' file' + (ok > 1 ? 's' : '') + ' uploaded');
        onDone();
    };
    return { upload, progress };
}

function Thumb({ m, className }: { m: any; className?: string }) {
    if (m.kind === 'video')
        return m.url ? <video src={m.url} className={cx('h-full w-full object-cover', className)} muted preload='metadata' /> : <div className='flex h-full w-full items-center justify-center bg-surface2 text-muted'><Film size={28} /></div>;
    return <img src={m.url} alt={m.name} className={cx('h-full w-full object-cover', className)} loading='lazy' />;
}

export function MediaPicker({ selected, onChange, onClose, kind }: { selected: string[]; onChange: (ids: string[]) => void; onClose: () => void; kind?: 'image' | 'video' }) {
    const { ws, can } = useWs();
    const { data, loading, reload } = useLoad(() => A.get('/api/w/' + ws.id + '/media'), [ws.id]);
    const [sel, setSel] = useState<string[]>(selected);
    const [q, setQ] = useState('');
    const { upload, progress } = useUploader(ws.id, null, reload);
    const ref = useRef<HTMLInputElement>(null);
    const items: any[] = (data?.items || []).filter((m: any) => (!kind || m.kind === kind) && m.name.toLowerCase().includes(q.toLowerCase()));
    return (
        <Modal title='Choose media' onClose={onClose} size='lg'>
            <div className='mb-3 flex flex-wrap items-center gap-2'>
                <input className='input max-w-xs' placeholder='Search files' value={q} onChange={(e) => setQ(e.target.value)} />
                {can('media.write') && <Button variant='secondary' size='sm' loading={!!progress} onClick={() => ref.current?.click()}><Upload size={14} />Upload</Button>}
                <input ref={ref} type='file' hidden multiple accept={ACCEPT} onChange={(e) => e.target.files && upload(e.target.files)} />
            </div>
            {loading && !data ? <Spinner /> : items.length === 0 ? <Empty title='No media found' text='Upload images or videos to reuse them in any post.' /> : (
                <div className='grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5'>
                    {items.map((m) => {
                        const on = sel.includes(m.id);
                        return (
                            <button key={m.id} onClick={() => setSel(on ? sel.filter((x) => x !== m.id) : [...sel, m.id])} className={cx('relative aspect-square overflow-hidden rounded-xl border-2', on ? 'border-brand' : 'border-transparent')}>
                                <Thumb m={m} />
                                {on && <span className='absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white'><Check size={12} /></span>}
                            </button>
                        );
                    })}
                </div>
            )}
            <div className='mt-4 flex items-center justify-between'>
                <span className='text-xs text-muted'>{sel.length} selected</span>
                <div className='flex gap-2'><Button variant='secondary' onClick={onClose}>Cancel</Button><Button onClick={() => { onChange(sel); onClose(); }}>Use selected</Button></div>
            </div>
        </Modal>
    );
}

export default function Media() {
    const { ws, can, toast, ask } = useWs();
    const { data, loading, reload } = useLoad(() => A.get('/api/w/' + ws.id + '/media'), [ws.id]);
    const [folder, setFolder] = useState('');
    const [q, setQ] = useState('');
    const [type, setType] = useState('all');
    const [sort, setSort] = useState('new');
    const [drag, setDrag] = useState(false);
    const [view, setView] = useState<any>(null);
    const [linking, setLinking] = useState(false);
    const [link, setLink] = useState({ url: '', name: '', kind: 'image' });
    const ref = useRef<HTMLInputElement>(null);
    const write = can('media.write');
    const { upload, progress } = useUploader(ws.id, folder || null, reload);

    if (loading && !data) return <Spinner />;
    const folders: any[] = data?.folders || [];
    let items: any[] = (data?.items || []).filter((m: any) => (!folder || m.folderId === folder) && (type === 'all' || m.kind === type) && m.name.toLowerCase().includes(q.toLowerCase()));
    items = [...items].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? (b.size || 0) - (a.size || 0) : String(b.createdAt).localeCompare(String(a.createdAt))));
    const newFolder = async () => {
        const name = window.prompt('Folder name');
        if (!name) return;
        try {
            await A.post('/api/w/' + ws.id + '/folders', { name });
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    const saveLink = async () => {
        try {
            await A.post('/api/w/' + ws.id + '/media/link', { ...link, folderId: folder || null });
            setLinking(false);
            setLink({ url: '', name: '', kind: 'image' });
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    const update = async (m: any, patch: any) => {
        await A.put('/api/w/' + ws.id + '/media/' + m.id, patch);
        setView({ ...m, ...patch });
        reload();
    };
    const remove = async (m: any) => {
        if (!(await ask('Delete ' + m.name + '? Posts that use it will lose this file.', 'Delete'))) return;
        try {
            await A.del('/api/w/' + ws.id + '/media/' + m.id);
            setView(null);
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };

    return (
        <div className='fade-in' onDragOver={(e) => { if (write) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (write) upload(e.dataTransfer.files); }}>
            <PageHeader
                title='Media Library'
                subtitle='Upload once, reuse in every post'
                actions={write && (
                    <>
                        <Button variant='secondary' onClick={newFolder}><FolderPlus size={16} />Folder</Button>
                        <Button variant='secondary' onClick={() => setLinking(true)}><Link2 size={16} />Add by URL</Button>
                        <Button loading={!!progress} onClick={() => ref.current?.click()}><Upload size={16} />{progress ? progress.done + ' / ' + progress.total : 'Upload'}</Button>
                        <input ref={ref} type='file' hidden multiple accept={ACCEPT} onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }} />
                    </>
                )}
            />
            <Card className='mb-4 p-4'><Meter label='Storage used' value={Math.round((data.usedBytes / 1048576) * 10) / 10} max={Math.round(data.limitBytes / 1048576)} /><div className='mt-1 text-right text-[11px] text-muted'>MB on the {ws.plan.name} plan</div></Card>
            <div className='mb-4 flex flex-wrap items-center gap-2'>
                <div className='relative'><Search size={14} className='absolute left-3 top-3 text-muted' /><input className='input !pl-8' placeholder='Search' value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <select className='input !w-auto' value={type} onChange={(e) => setType(e.target.value)}><option value='all'>All types</option><option value='image'>Images</option><option value='video'>Videos</option></select>
                <select className='input !w-auto' value={sort} onChange={(e) => setSort(e.target.value)}><option value='new'>Newest</option><option value='name'>Name</option><option value='size'>Size</option></select>
            </div>
            <div className='mb-4 flex flex-wrap gap-1.5'>
                {[{ id: '', name: 'All files' }, ...folders].map((f) => (
                    <button key={f.id} onClick={() => setFolder(f.id)} className={cx('flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium', folder === f.id ? 'border-brand bg-brand text-white' : 'border-line')}>{f.name}</button>
                ))}
                {folder && write && <button className='text-xs text-bad' onClick={async () => { if (await ask('Delete this folder? Files stay in the library.', 'Delete folder')) { await A.del('/api/w/' + ws.id + '/folders/' + folder); setFolder(''); reload(); } }}>Delete folder</button>}
            </div>
            {drag && <div className='mb-4 rounded-2xl border-2 border-dashed border-brand bg-brand/5 p-8 text-center text-sm text-brand'>Drop files to upload</div>}
            {items.length === 0 ? (
                <Card><Empty title='No media yet' text='Drag files here or use Upload. JPEG, PNG, WebP, MP4 and MOV up to 3.5 MB each. For bigger videos use Add by URL.' icon={<Upload size={22} />} /></Card>
            ) : (
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
                    {items.map((m) => (
                        <button key={m.id} onClick={() => setView(m)} className='card overflow-hidden text-left transition hover:border-brand'>
                            <div className='aspect-square bg-surface2'><Thumb m={m} /></div>
                            <div className='p-2.5'><div className='truncate text-xs font-medium'>{m.name}</div><div className='mt-1 flex items-center gap-1.5 text-[10px] text-muted'><Badge>{m.kind}</Badge>{m.size ? bytes(m.size) : 'linked'}</div></div>
                        </button>
                    ))}
                </div>
            )}

            {view && (
                <Modal title={view.name} onClose={() => setView(null)} size='lg'>
                    <div className='grid gap-4 md:grid-cols-2'>
                        <div className='overflow-hidden rounded-xl bg-surface2'>{view.kind === 'video' ? <video src={view.url} controls className='w-full' /> : <img src={view.url} alt={view.name} className='w-full' />}</div>
                        <div className='space-y-3 text-sm'>
                            <Field label='File name'><input className='input' defaultValue={view.name} disabled={!write} onBlur={(e) => e.target.value !== view.name && update(view, { name: e.target.value })} /></Field>
                            <Field label='Folder'><select className='input' disabled={!write} value={view.folderId || ''} onChange={(e) => update(view, { folderId: e.target.value })}><option value=''>No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
                            <Field label='Tags (comma separated)'><input className='input' disabled={!write} defaultValue={(view.tags || []).join(', ')} onBlur={(e) => update(view, { tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
                            <dl className='grid grid-cols-2 gap-2 text-xs text-muted'>
                                <dt>Type</dt><dd>{view.mime}</dd>
                                <dt>Size</dt><dd>{view.size ? bytes(view.size) : 'Linked file'}</dd>
                                {view.width && <><dt>Dimensions</dt><dd>{view.width} x {view.height}</dd></>}
                                {view.duration && <><dt>Duration</dt><dd>{view.duration}s</dd></>}
                            </dl>
                            {can('post.delete') && <Button variant='danger' size='sm' onClick={() => remove(view)}><Trash2 size={14} />Delete</Button>}
                        </div>
                    </div>
                </Modal>
            )}
            {linking && (
                <Modal title='Add media by URL' onClose={() => setLinking(false)} size='sm'>
                    <div className='space-y-3'>
                        <Field label='Public https link'><input className='input' value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} placeholder='https://...' /></Field>
                        <Field label='Name'><input className='input' value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} /></Field>
                        <Field label='Type'><select className='input' value={link.kind} onChange={(e) => setLink({ ...link, kind: e.target.value })}><option value='image'>Image</option><option value='video'>Video</option></select></Field>
                        <div className='flex justify-end gap-2'><Button variant='secondary' onClick={() => setLinking(false)}>Cancel</Button><Button onClick={saveLink} disabled={!link.url}>Add</Button></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
