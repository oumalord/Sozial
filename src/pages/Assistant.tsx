import { useEffect, useState } from 'react';
import { ArrowRight, Copy, Sparkles } from 'lucide-react';
import * as A from '../lib/api';
import { go, useWs } from '../lib/hooks';
import { Badge, Button, Card, Field, PageHeader } from '../lib/ui';

const TASKS: [string, string][] = [
    ['caption', 'Captions'],
    ['hashtags', 'Hashtags'],
    ['rewrite', 'Rewrite'],
    ['ideas', 'Ideas'],
    ['plan', 'Weekly plan'],
    ['campaign', 'Campaign'],
    ['adapt', 'Adapt caption'],
    ['insights', 'Workspace insights'],
];

const TONES = ['professional', 'conversational', 'entertaining', 'promotional', 'educational', 'inspirational'];

function outputText(result: any): string {
    if (result?.captions) return result.captions.join('\n\n');
    if (result?.hashtags) return result.hashtags.map((tag: string) => '#' + tag).join(' ');
    if (result?.text) return result.text;
    if (result?.ideas) return result.ideas.map((idea: any) => idea.title + ' (' + idea.format + '): ' + idea.hook).join('\n');
    if (result?.slots) return result.slots.map((slot: any) => slot.day + ' ' + slot.time + ' · ' + slot.platform + ' · ' + slot.idea + ' (' + slot.format + ')').join('\n');
    if (result?.posts) return result.name + '\n' + result.summary + '\n' + result.posts.map((post: any) => post.title + ' (' + post.platform + ', day ' + post.dayOffset + '): ' + post.caption).join('\n\n');
    if (result?.insights) return result.insights.join('\n');
    if (result?.versions) return result.versions.map((version: any) => version.platform + ': ' + version.caption + '\n' + (version.hashtags || []).map((tag: string) => '#' + tag).join(' ')).join('\n\n');
    return '';
}

export default function Assistant() {
    const { ws, meta, can, toast } = useWs();
    const [task, setTask] = useState('caption');
    const [topic, setTopic] = useState('');
    const [text, setText] = useState('');
    const [tone, setTone] = useState('conversational');
    const [audience, setAudience] = useState('');
    const [platform, setPlatform] = useState('instagram');
    const [platforms, setPlatforms] = useState<string[]>(['instagram']);
    const [industry, setIndustry] = useState('');
    const [niche, setNiche] = useState('');
    const [count, setCount] = useState(8);
    const [postsPerWeek, setPostsPerWeek] = useState(4);
    const [days, setDays] = useState(14);
    const [result, setResult] = useState<any>(null);
    const [creditsLeft, setCreditsLeft] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const provider = (meta.providers || []).find((item: any) => item.id === 'openai');
    const platformList = Object.values<any>(meta.platforms || {});

    useEffect(() => {
        if (!platformList.some((item) => item.id === platform)) setPlatform(platformList[0]?.id || 'instagram');
        if (!platforms.length && platformList.length) setPlatforms([platformList[0].id]);
        A.get('/api/w/' + ws.id + '/billing').then((billing) => {
            const limit = ws.plan.limits?.aiCredits;
            if (limit != null) setCreditsLeft(Math.max(0, limit - (billing.usage?.aiCalls || 0)));
        }).catch(() => undefined);
    }, [ws.id]);

    const needsTopic = ['caption', 'hashtags', 'plan', 'campaign'].includes(task);
    const needsText = ['rewrite', 'adapt'].includes(task);
    const canGenerate = (!needsTopic || !!topic.trim()) && (!needsText || !!text.trim())
        && (!['adapt', 'campaign', 'plan'].includes(task) || platforms.length > 0)
        && (task !== 'ideas' || !!industry.trim());

    const togglePlatform = (id: string) => setPlatforms((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const generate = async () => {
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const response = await A.post('/api/w/' + ws.id + '/ai', { task, topic, text, tone, audience, platform, platforms, industry, niche, count, postsPerWeek, days });
            setResult(response.result);
            setCreditsLeft(response.creditsLeft);
        } catch (e: any) {
            setError(e.message || 'The assistant could not generate a response.');
        } finally {
            setBusy(false);
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast('Copied to clipboard');
        } catch {
            toast('Clipboard access is unavailable in this browser.', 'err');
        }
    };

    const useInPost = (caption: string, hashtags: string[] = []) => {
        try {
            sessionStorage.setItem('sf_ai_draft', JSON.stringify({ caption, hashtags: hashtags.join(' ') }));
            go('studio/new');
        } catch {
            toast('Could not pass this result to the composer.', 'err');
        }
    };

    if (!ws.plan.features?.ai) return <div className='fade-in'>
        <PageHeader title='AI Assistant' subtitle='Draft and refine social content with workspace-aware tools' />
        <Card className='p-5'><h2 className='text-sm font-semibold'>AI tools are not included in this plan</h2><p className='mt-1 text-sm text-muted'>Upgrade to a plan with AI credits to generate captions, ideas, campaign drafts, and publishing insights.</p><Button className='mt-4' onClick={() => go('billing')}>View plans<ArrowRight size={14} /></Button></Card>
    </div>;

    if (!can('ai.use')) return <div className='fade-in'><PageHeader title='AI Assistant' /><Card className='p-5 text-sm text-muted'>Your workspace role does not have permission to use AI tools.</Card></div>;

    return <div className='fade-in'>
        <PageHeader title='AI Assistant' subtitle='Create, adapt, and plan content for your connected channels' actions={creditsLeft !== null && <Badge tone={creditsLeft ? 'info' : 'warn'}>{creditsLeft} AI credits left</Badge>} />
        {provider && !provider.configured && <Card className='mb-4 border-warn/50 bg-warn/5 p-4 text-sm'><div className='font-semibold'>AI provider is not configured</div><p className='mt-1 text-muted'>An administrator must add OPENAI_API_KEY to the server environment before generation can run.</p></Card>}
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
            <Card className='space-y-4 p-5'>
                <Field label='Tool'><select className='input' value={task} onChange={(event) => { setTask(event.target.value); setResult(null); setError(''); }}>
                    {TASKS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
                </select></Field>
                {needsTopic && <Field label={task === 'plan' ? 'Goal for this week' : task === 'campaign' ? 'Campaign brief' : 'Topic'}><textarea className='input' rows={3} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder='Add the context the assistant should use.' /></Field>}
                {needsText && <Field label={task === 'rewrite' ? 'Text to rewrite' : 'Caption to adapt'}><textarea className='input' rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder='Paste the copy you want to work with.' /></Field>}
                {['caption', 'hashtags'].includes(task) && <Field label='Platform'><select className='input' value={platform} onChange={(event) => setPlatform(event.target.value)}>{platformList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
                {['adapt', 'campaign', 'plan'].includes(task) && <div><span className='label'>Platforms</span><div className='flex flex-wrap gap-2'>{platformList.map((item) => <label key={item.id} className='inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs'><input type='checkbox' checked={platforms.includes(item.id)} onChange={() => togglePlatform(item.id)} />{item.name}</label>)}</div></div>}
                {['caption', 'rewrite', 'campaign'].includes(task) && <Field label='Tone'><select className='input' value={tone} onChange={(event) => setTone(event.target.value)}>{TONES.map((value) => <option key={value}>{value}</option>)}</select></Field>}
                {['caption', 'campaign'].includes(task) && <Field label='Audience'><input className='input' value={audience} onChange={(event) => setAudience(event.target.value)} placeholder='Who is this for?' /></Field>}
                {task === 'ideas' && <div className='grid gap-3 sm:grid-cols-2'><Field label='Industry'><input className='input' value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder='e.g. beauty' /></Field><Field label='Niche (optional)'><input className='input' value={niche} onChange={(event) => setNiche(event.target.value)} placeholder='e.g. natural hair' /></Field></div>}
                {['ideas', 'campaign'].includes(task) && <Field label={task === 'ideas' ? 'Number of ideas' : 'Number of campaign posts'}><input className='input' type='number' min={1} max={task === 'ideas' ? 15 : 12} value={count} onChange={(event) => setCount(Number(event.target.value))} /></Field>}
                {task === 'plan' && <Field label='Posts per week'><input className='input' type='number' min={1} max={15} value={postsPerWeek} onChange={(event) => setPostsPerWeek(Number(event.target.value))} /></Field>}
                {task === 'campaign' && <Field label='Campaign length in days'><input className='input' type='number' min={1} max={90} value={days} onChange={(event) => setDays(Number(event.target.value))} /></Field>}
                {task === 'insights' && <p className='text-sm text-muted'>Recommendations use this workspace’s recent publishing counts only. Unavailable engagement metrics are never estimated.</p>}
                {error && <p role='alert' className='text-sm text-bad'>{error}</p>}
                <Button loading={busy} disabled={!canGenerate || provider?.configured === false} onClick={generate}><Sparkles size={15} />Generate</Button>
            </Card>
            <Card className='min-h-[320px] p-5'>
                <div className='mb-4 flex items-center justify-between gap-3'><h2 className='text-sm font-semibold'>Results</h2>{result && <Button size='sm' variant='secondary' onClick={() => copy(outputText(result))}><Copy size={13} />Copy results</Button>}</div>
                {!result ? <p className='py-16 text-center text-sm text-muted'>Your generated content will appear here.</p> : <div className='space-y-4'>
                    {result.captions && result.captions.map((caption: string, index: number) => <div key={index} className='border-b border-line pb-4 last:border-0'><p className='whitespace-pre-wrap text-sm'>{caption}</p><Button className='mt-3' size='sm' variant='secondary' onClick={() => useInPost(caption)}>Use in a post</Button></div>)}
                    {result.hashtags && <div className='flex flex-wrap gap-2'>{result.hashtags.map((tag: string, index: number) => <Badge key={tag + index} tone='info'>#{tag}</Badge>)}<Button size='sm' variant='secondary' onClick={() => useInPost('', result.hashtags)}>Add to a post</Button></div>}
                    {result.text && <div><p className='whitespace-pre-wrap text-sm'>{result.text}</p><Button className='mt-3' size='sm' variant='secondary' onClick={() => useInPost(result.text)}>Use in a post</Button></div>}
                    {result.ideas && <ul className='space-y-3'>{result.ideas.map((idea: any, index: number) => <li className='border-b border-line pb-3 last:border-0' key={index}><div className='text-sm font-semibold'>{idea.title}</div><div className='mt-1 text-xs text-muted'>{idea.format} · {idea.hook}</div></li>)}</ul>}
                    {result.slots && <ul className='space-y-2'>{result.slots.map((slot: any, index: number) => <li className='flex flex-wrap gap-x-2 text-sm' key={index}><b>{slot.day} {slot.time}</b><span className='text-muted'>{slot.platform} · {slot.format} · {slot.idea}</span></li>)}</ul>}
                    {result.posts && <div><div className='mb-3'><h3 className='font-semibold'>{result.name}</h3><p className='mt-1 text-sm text-muted'>{result.summary}</p></div><ul className='space-y-3'>{result.posts.map((post: any, index: number) => <li className='border-b border-line pb-3 last:border-0' key={index}><div className='text-sm font-semibold'>{post.title} · {post.platform} · day {post.dayOffset}</div><p className='mt-1 whitespace-pre-wrap text-sm text-muted'>{post.caption}</p></li>)}</ul></div>}
                    {result.versions && <ul className='space-y-3'>{result.versions.map((version: any, index: number) => <li className='border-b border-line pb-3 last:border-0' key={index}><div className='text-sm font-semibold'>{meta.platforms[version.platform]?.name || version.platform}</div><p className='mt-1 whitespace-pre-wrap text-sm'>{version.caption}</p>{version.hashtags?.length > 0 && <p className='mt-1 text-xs text-muted'>{version.hashtags.map((tag: string) => '#' + tag).join(' ')}</p>}<Button className='mt-2' size='sm' variant='secondary' onClick={() => useInPost(version.caption, version.hashtags)}>Use in a post</Button></li>)}</ul>}
                    {result.insights && <ul className='list-disc space-y-2 pl-5 text-sm'>{result.insights.map((insight: string, index: number) => <li key={index}>{insight}</li>)}</ul>}
                </div>}
            </Card>
        </div>
    </div>;
}
