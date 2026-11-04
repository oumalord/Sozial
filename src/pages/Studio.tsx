import { useState } from 'react';
import { Copy, Plus, Search, Trash2 } from 'lucide-react';
import * as A from '../lib/api';
import { useLoad, useWs, go } from '../lib/hooks';
import { Button, Card, Empty, PageHeader, PlatformChip, Spinner, StatusBadge, Tabs } from '../lib/ui';
import { timeAgo } from '../lib/format';
import Composer from './Composer';
import Bulk from './Bulk';

const GROUPS: Record<string, string[]> = {
    draft: ['draft'],
    scheduled: ['scheduled', 'pending_approval', 'paused', 'publishing'],
    published: ['published', 'partial'],
    failed: ['failed', 'needs_manual'],
};

function List() {
    const { ws, meta, can, toast, ask } = useWs();
    const P: Record<string, any> = meta.platforms;
    const [tab, setTab] = useState('all');
    const [q, setQ] = useState('');
    const isTpl = tab === 'templates';
    const { data, loading, reload } = useLoad(() => (tab === 'bulk' ? Promise.resolve({ posts: [] }) : A.get('/api/w/' + ws.id + '/posts' + (isTpl ? '?templates=1' : ''))), [ws.id, tab]);
    const posts: any[] = (data?.posts || []).filter((p: any) => (isTpl || tab === 'all' || (GROUPS[tab] || []).includes(p.status)) && (p.title + ' ' + p.caption).toLowerCase().includes(q.toLowerCase()));
    const dup = async (p: any) => {
        try {
            const r = await A.post('/api/w/' + ws.id + '/posts/' + p.id + '/duplicate');
            go('studio/' + r.post.id);
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    const remove = async (p: any) => {
        if (!(await ask('Delete this ' + (isTpl ? 'template' : 'post') + '? Scheduled publications are cancelled.', 'Delete'))) return;
        try {
            await A.del('/api/w/' + ws.id + '/posts/' + p.id);
            reload();
        } catch (e: any) {
            toast(e.message, 'err');
        }
    };
    return (
        <div className='fade-in'>
            <PageHeader title='Content Studio' subtitle='Drafts, scheduled content, templates and bulk imports' actions={can('post.write') && <Button onClick={() => go('studio/new')}><Plus size={16} />New post</Button>} />
            <div className='mb-4 flex flex-wrap items-center gap-2'>
                <Tabs tabs={[['all', 'All'], ['draft', 'Drafts'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['failed', 'Needs attention'], ['templates', 'Templates'], ['bulk', 'Bulk import']]} value={tab} onChange={setTab} />
                {tab !== 'bulk' && <div className='relative ml-auto'><Search size={14} className='absolute left-3 top-3 text-muted' /><input className='input !pl-8' placeholder='Search posts' value={q} onChange={(e) => setQ(e.target.value)} /></div>}
            </div>
            {tab === 'bulk' ? <Bulk /> : loading && !data ? <Spinner /> : posts.length === 0 ? (
                <Card><Empty title={isTpl ? 'No templates yet' : 'No posts here'} text={isTpl ? 'Open the composer and choose Save as template to reuse a layout.' : 'Create your first post. One caption, every platform.'} action={can('post.write') ? <Button onClick={() => go('studio/new')}>Create a post</Button> : undefined} /></Card>
            ) : (
                <Card className='divide-y divide-line'>
                    {posts.map((p) => {
                        const plats: string[] = Array.from(new Set<string>((p.targets || []).filter((t: any) => t.status !== 'cancelled').map((t: any) => t.platform)));
                        return (
                            <div key={p.id} className='flex items-center gap-3 p-3 hover:bg-surface2'>
                                <button className='flex min-w-0 flex-1 items-center gap-3 text-left' onClick={() => (isTpl ? dup(p) : go('studio/' + p.id))}>
                                    <div className='min-w-0 flex-1'>
                                        <div className='truncate text-sm font-medium'>{p.title || String(p.caption || '').slice(0, 70) || 'Untitled'}</div>
                                        <div className='truncate text-xs text-muted'>{p.title ? String(p.caption || '').slice(0, 90) : ''} Updated {timeAgo(p.updatedAt)}{p.createdByName ? ' by ' + p.createdByName : ''}</div>
                                    </div>
                                    <div className='hidden gap-1 sm:flex'>{plats.map((k) => P[k] && <PlatformChip key={k} p={P[k]} size={22} />)}</div>
                                    {!isTpl && <StatusBadge status={p.status} />}
                                </button>
                                {isTpl && can('post.write') && <Button size='sm' variant='secondary' onClick={() => dup(p)}>Use template</Button>}
                                {!isTpl && can('post.write') && <button aria-label='Duplicate' className='rounded-lg p-2 text-muted hover:bg-line' onClick={() => dup(p)}><Copy size={15} /></button>}
                                {can('post.delete') && <button aria-label='Delete' className='rounded-lg p-2 text-muted hover:bg-line hover:text-bad' onClick={() => remove(p)}><Trash2 size={15} /></button>}
                            </div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
}

export default function Studio({ id, query }: { id: string; query: Record<string, string> }) {
    return id ? <Composer key={id} id={id} query={query} /> : <List />;
}
