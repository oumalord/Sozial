export type Rec = Record<string, any>;

export interface FieldDef {
  key: string;
  label: string;
  type: 'select' | 'toggle' | 'text';
  options?: { value: string; label: string }[];
  default?: string | boolean;
  help?: string;
}

export interface FormatDef {
  value: string;
  label: string;
  needs: 'any' | 'video' | 'none';
  single: boolean;
}

export interface PlatformDef {
  id: string;
  name: string;
  short: string;
  color: string;
  captionMax: number;
  captionLabel: string;
  hashtagMax?: number;
  hasTitle: boolean;
  titleRequired: boolean;
  titleMax: number;
  hasLink: boolean;
  maxImages: number;
  maxVideos: number;
  mixedMedia: boolean;
  formats: FormatDef[];
  fields: FieldDef[];
  aspect: string;
  nativeApi: string;
  nativeApproval: string;
  notes: string[];
}

export interface MediaInfo {
  id: string;
  type: 'image' | 'video';
  name: string;
  width?: number;
  height?: number;
  duration?: number;
  url?: string;
  path?: string;
}

export interface Issue {
  level: 'error' | 'warn';
  message: string;
}

const vis = (opts: string[][]): { value: string; label: string }[] => opts.map((o) => ({ value: o[0], label: o[1] }));

export const PLATFORMS: Record<string, PlatformDef> = {
  instagram: {
    id: 'instagram', name: 'Instagram', short: 'IG', color: '#E1306C',
    captionMax: 2200, captionLabel: 'Caption', hashtagMax: 5, hasTitle: false, titleRequired: false, titleMax: 0, hasLink: false,
    maxImages: 10, maxVideos: 10, mixedMedia: true,
    formats: [
      { value: 'feed', label: 'Feed post / carousel', needs: 'any', single: false },
      { value: 'reel', label: 'Reel', needs: 'video', single: true },
      { value: 'story', label: 'Story', needs: 'any', single: true },
    ],
    fields: [],
    aspect: 'Feed 4:5 to 1.91:1, Reels and Stories 9:16',
    nativeApi: 'Instagram Graph API (content publishing)',
    nativeApproval: 'Meta app review plus an Instagram Professional account linked to a Facebook Page',
    notes: ['Personal accounts cannot publish through the API.', 'Up to 30 hashtags per post.'],
  },
  facebook: {
    id: 'facebook', name: 'Facebook', short: 'FB', color: '#1877F2',
    captionMax: 63206, captionLabel: 'Post text', hasTitle: false, titleRequired: false, titleMax: 0, hasLink: true,
    maxImages: 10, maxVideos: 1, mixedMedia: false,
    formats: [
      { value: 'post', label: 'Page post', needs: 'none', single: false },
      { value: 'reel', label: 'Reel', needs: 'video', single: true },
    ],
    fields: [],
    aspect: 'Reels 9:16',
    nativeApi: 'Facebook Graph API (Pages)',
    nativeApproval: 'Meta app review with pages_manage_posts permission',
    notes: ['Publishing is to Facebook Pages, not personal profiles.'],
  },
  tiktok: {
    id: 'tiktok', name: 'TikTok', short: 'TT', color: '#111827',
    captionMax: 2200, captionLabel: 'Caption', hashtagMax: 30, hasTitle: false, titleRequired: false, titleMax: 0, hasLink: false,
    maxImages: 0, maxVideos: 1, mixedMedia: false,
    formats: [{ value: 'video', label: 'Video', needs: 'video', single: true }],
    fields: [
      { key: 'privacy', label: 'Who can view', type: 'select', default: 'SELF_ONLY', options: vis([['PUBLIC_TO_EVERYONE', 'Everyone'], ['MUTUAL_FOLLOW_FRIENDS', 'Friends'], ['FOLLOWER_OF_CREATOR', 'Followers'], ['SELF_ONLY', 'Only me']]) },
      { key: 'allowComment', label: 'Allow comments', type: 'toggle', default: true },
      { key: 'allowDuet', label: 'Allow duets', type: 'toggle', default: false },
      { key: 'allowStitch', label: 'Allow stitches', type: 'toggle', default: false },
      { key: 'branded', label: 'Promotes a brand or product', type: 'toggle', default: false },
    ],
    aspect: '9:16 vertical video',
    nativeApi: 'TikTok Content Posting API',
    nativeApproval: 'TikTok developer app approval and an audit; unaudited apps can only post privately',
    notes: ['Until the publishing app is audited TikTok limits posts to private visibility.'],
  },
  youtube: {
    id: 'youtube', name: 'YouTube', short: 'YT', color: '#FF0000',
    captionMax: 5000, captionLabel: 'Description', hashtagMax: 15, hasTitle: true, titleRequired: true, titleMax: 100, hasLink: false,
    maxImages: 0, maxVideos: 1, mixedMedia: false,
    formats: [
      { value: 'video', label: 'Video', needs: 'video', single: true },
      { value: 'short', label: 'Short', needs: 'video', single: true },
    ],
    fields: [
      { key: 'visibility', label: 'Visibility', type: 'select', default: 'private', options: vis([['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']]) },
      { key: 'madeForKids', label: 'Audience', type: 'select', default: 'no', options: vis([['no', 'Not made for kids'], ['yes', 'Made for kids']]) },
      { key: 'tags', label: 'Tags (comma separated)', type: 'text' },
    ],
    aspect: 'Shorts 9:16, up to 3 minutes',
    nativeApi: 'YouTube Data API v3 (videos.insert)',
    nativeApproval: 'Google OAuth verification and an API compliance audit for public uploads',
    notes: ['Unverified API projects have their uploads locked to private.'],
  },
  linkedin: {
    id: 'linkedin', name: 'LinkedIn', short: 'IN', color: '#0A66C2',
    captionMax: 3000, captionLabel: 'Post text', hasTitle: false, titleRequired: false, titleMax: 0, hasLink: true,
    maxImages: 9, maxVideos: 1, mixedMedia: false,
    formats: [{ value: 'post', label: 'Post', needs: 'none', single: false }],
    fields: [{ key: 'visibility', label: 'Visibility', type: 'select', default: 'PUBLIC', options: vis([['PUBLIC', 'Anyone'], ['CONNECTIONS', 'Connections only']]) }],
    aspect: '1.91:1 link previews, 1:1 or 4:5 images',
    nativeApi: 'LinkedIn Marketing and Community Management APIs',
    nativeApproval: 'LinkedIn partner program access for organization pages; personal posting via Share on LinkedIn',
    notes: ['Organization posting needs admin rights on the page.'],
  },
  x: {
    id: 'x', name: 'X (Twitter)', short: 'X', color: '#0F1419',
    captionMax: 280, captionLabel: 'Post text', hasTitle: false, titleRequired: false, titleMax: 0, hasLink: false,
    maxImages: 4, maxVideos: 1, mixedMedia: false,
    formats: [{ value: 'post', label: 'Post', needs: 'none', single: false }],
    fields: [],
    aspect: '16:9 or 1:1',
    nativeApi: 'X API v2 (paid access tiers)',
    nativeApproval: 'An X developer project with write access on a paid tier',
    notes: ['Character count is approximate: X counts every link as 23 characters.'],
  },
  pinterest: {
    id: 'pinterest', name: 'Pinterest', short: 'PI', color: '#E60023',
    captionMax: 800, captionLabel: 'Pin description', hasTitle: true, titleRequired: true, titleMax: 100, hasLink: true,
    maxImages: 1, maxVideos: 1, mixedMedia: false,
    formats: [{ value: 'pin', label: 'Pin', needs: 'any', single: true }],
    fields: [{ key: 'boardId', label: 'Board name or ID', type: 'text', help: 'The board the pin is saved to.' }],
    aspect: '2:3 vertical',
    nativeApi: 'Pinterest API v5',
    nativeApproval: 'Pinterest app approval for the pins:write scope',
    notes: ['A pin needs an image or video and a destination board.'],
  },
  threads: {
    id: 'threads', name: 'Threads', short: 'TH', color: '#000000',
    captionMax: 500, captionLabel: 'Post text', hasTitle: false, titleRequired: false, titleMax: 0, hasLink: true,
    maxImages: 20, maxVideos: 20, mixedMedia: true,
    formats: [{ value: 'post', label: 'Post', needs: 'none', single: false }],
    fields: [],
    aspect: '9:16 or 1:1',
    nativeApi: 'Threads API',
    nativeApproval: 'Meta app review with threads_content_publish',
    notes: ['Text limit is 500 characters.'],
  },
};

export function composeText(v: Rec): string {
  const tags = ((v.hashtags || []) as string[]).map((t) => '#' + String(t).split('#').join('')).join(' ');
  const nl = String.fromCharCode(10);
  return [v.caption || '', tags].filter(Boolean).join(nl + nl);
}

const isUrl = (s: string): boolean => s.startsWith('http://') || s.startsWith('https://');

export function mergeVariant(post: Rec, platformId: string): Rec {
  const base: Rec = { caption: post.caption || '', hashtags: post.hashtags || [], title: post.title || '', link: post.link || '', description: '', tags: '', format: '', opts: {} };
  const own: Rec = (post.variants && post.variants[platformId]) || {};
  const out: Rec = { ...base };
  for (const k of Object.keys(own)) {
    if (own[k] === undefined || own[k] === null || own[k] === '') continue;
    out[k] = own[k];
  }
  const p = PLATFORMS[platformId];
  if (p && !out.format) out.format = p.formats[0].value;
  return out;
}

export function validateVariant(p: PlatformDef, v: Rec, media: MediaInfo[]): Issue[] {
  const issues: Issue[] = [];
  const err = (m: string) => issues.push({ level: 'error', message: m });
  const warn = (m: string) => issues.push({ level: 'warn', message: m });
  const fmt = p.formats.find((f) => f.value === v.format) || p.formats[0];
  const text = composeText(v);
  if (text.length > p.captionMax) err(p.name + ': text is ' + text.length + ' characters but the limit is ' + p.captionMax + '.');
  const tagCount = (v.hashtags || []).length;
  if (p.hashtagMax && tagCount > p.hashtagMax) err(p.name + ': ' + tagCount + ' hashtags exceeds the limit of ' + p.hashtagMax + '.');
  if (p.hasTitle && p.titleRequired && !String(v.title || '').trim()) err(p.name + ': a title is required.');
  if (p.titleMax && String(v.title || '').length > p.titleMax) err(p.name + ': title is longer than ' + p.titleMax + ' characters.');
  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  if (fmt.needs === 'video' && videos.length === 0) err(p.name + ' ' + fmt.label + ' needs a video.');
  if (fmt.needs === 'video' && images.length > 0) err(p.name + ' ' + fmt.label + ' accepts video only.');
  if (fmt.needs === 'any' && media.length === 0) err(p.name + ' ' + fmt.label + ' needs at least one image or video.');
  if (fmt.single && media.length > 1) err(p.name + ' ' + fmt.label + ' accepts exactly one media file.');
  if (!p.mixedMedia && images.length > 0 && videos.length > 0) err(p.name + ' cannot mix images and videos in one post.');
  if (images.length > p.maxImages) err(p.name + ' accepts at most ' + p.maxImages + ' images.');
  if (videos.length > p.maxVideos) err(p.name + ' accepts at most ' + p.maxVideos + ' videos.');
  if (!text.trim() && media.length === 0) err(p.name + ': add text or media.');
  if (v.link && !isUrl(String(v.link))) err(p.name + ': the link must start with http:// or https://.');
  const vertical = fmt.value === 'reel' || fmt.value === 'story' || fmt.value === 'short' || p.id === 'tiktok';
  for (const m of media) {
    if (!m.width || !m.height) continue;
    const ratio = m.width / m.height;
    if (vertical && ratio > 0.75) warn(p.name + ': ' + m.name + ' is not vertical (9:16 recommended). Automatic cropping is not available yet.');
    if (p.id === 'instagram' && fmt.value === 'feed' && (ratio < 0.8 || ratio > 1.91)) warn('Instagram feed expects an aspect ratio between 4:5 and 1.91:1 for ' + m.name + '.');
    if (fmt.value === 'short' && m.duration && m.duration > 180) warn('YouTube Shorts can be at most 3 minutes; ' + m.name + ' is longer.');
  }
  if (p.id === 'tiktok' && ((v.opts && v.opts.privacy) || 'SELF_ONLY') !== 'SELF_ONLY') warn('TikTok forces posts to private until the publishing app has passed TikTok audit.');
  return issues;
}
