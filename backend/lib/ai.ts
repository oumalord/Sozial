import { ai } from './runtime';
import type { Rec } from './core';
import { PLATFORMS } from './platforms';

const SYSTEM = 'You are SocialFlow, a social media copywriting assistant. Be concrete and concise. Never invent statistics, audience facts, or details of a video or image you were not given. Respect platform character limits exactly. Write hashtags without the # symbol.';

const obj = (props: Rec, required: string[]): Rec => ({ type: 'object', properties: props, required });
const arr = (items: Rec): Rec => ({ type: 'array', items });
const S: Rec = { type: 'string' };

function plat(id: unknown): string {
  const p = PLATFORMS[String(id)];
  return p ? p.name + ' (limit ' + p.captionMax + ' characters)' : 'a general social network';
}

export async function runAi(b: Rec, stats: Rec | null): Promise<Rec> {
  const task = String(b.task || '');
  const tone = String(b.tone || 'conversational');
  const topic = String(b.topic || '').slice(0, 1500);
  const audience = String(b.audience || 'a general audience').slice(0, 300);
  let prompt = '';
  let schema: Rec;
  switch (task) {
    case 'caption':
      prompt = 'Write 3 caption options for ' + plat(b.platform) + '. Topic: ' + topic + '. Audience: ' + audience + '. Tone: ' + tone + '. Do not include hashtags in the captions.';
      schema = obj({ captions: arr(S) }, ['captions']);
      break;
    case 'hashtags':
      prompt = 'Suggest 12 relevant hashtags for ' + plat(b.platform) + '. Topic: ' + topic + '. Audience: ' + audience + '. Mix broad and niche tags.';
      schema = obj({ hashtags: arr(S) }, ['hashtags']);
      break;
    case 'rewrite':
      prompt = 'Rewrite this text in a ' + tone + ' tone, keeping the meaning and any links:' + String.fromCharCode(10) + String(b.text || '').slice(0, 3000);
      schema = obj({ text: S }, ['text']);
      break;
    case 'ideas':
      prompt = 'Give ' + Math.min(Number(b.count) || 8, 15) + ' content ideas for the ' + String(b.industry || 'general') + ' industry' + (b.niche ? ', niche: ' + String(b.niche) : '') + '. Each idea has a title, a format (for example reel, carousel, text post) and a one-line hook.';
      schema = obj({ ideas: arr(obj({ title: S, format: S, hook: S }, ['title', 'format', 'hook'])) }, ['ideas']);
      break;
    case 'plan': {
      const list = Array.isArray(b.platforms) ? b.platforms.map(plat).join(', ') : 'any platform';
      prompt = 'Create a one week content publishing plan. Goal: ' + topic + '. Platforms: ' + list + '. Target posts per week: ' + (Number(b.postsPerWeek) || 4) + '. Use weekday names and 24h times. These are suggestions, not measured best times.';
      schema = obj({ slots: arr(obj({ day: S, time: S, platform: S, idea: S, format: S }, ['day', 'time', 'platform', 'idea', 'format'])) }, ['slots']);
      break;
    }
    case 'campaign': {
      const list = Array.isArray(b.platforms) ? b.platforms.join(', ') : 'instagram';
      prompt = 'Plan a social media campaign. Brief: ' + topic + '. Audience: ' + audience + '. Platform ids to use: ' + list + ' (use these exact ids). Create ' + Math.min(Number(b.count) || 6, 12) + ' posts spread over ' + (Number(b.days) || 14) + ' days. Each post has a short title, a ready to publish caption within the platform limit, a platform id, and a dayOffset from the campaign start.';
      schema = obj({ name: S, summary: S, posts: arr(obj({ title: S, caption: S, platform: S, dayOffset: { type: 'number' } }, ['title', 'caption', 'platform', 'dayOffset'])) }, ['name', 'summary', 'posts']);
      break;
    }
    case 'adapt': {
      const ids: string[] = Array.isArray(b.platforms) ? b.platforms.map(String).filter((x: string) => PLATFORMS[x]) : [];
      prompt = 'Adapt this caption for each platform, respecting the limits and conventions: ' + ids.map(plat).join('; ') + '. Platform ids to return: ' + ids.join(', ') + '. Original:' + String.fromCharCode(10) + String(b.text || '').slice(0, 3000);
      schema = obj({ versions: arr(obj({ platform: S, caption: S, hashtags: arr(S) }, ['platform', 'caption', 'hashtags'])) }, ['versions']);
      break;
    }
    case 'insights':
      prompt = 'Here are the real publishing statistics of this workspace as JSON: ' + JSON.stringify(stats || {}) + '. Give 3 to 5 practical recommendations that are supported by this data only. If the data is too thin to support a recommendation, say so plainly. Do not mention impressions or engagement because they are not available.';
      schema = obj({ insights: arr(S) }, ['insights']);
      break;
    default:
      throw new Error('Unknown AI task');
  }
  const res = await ai.generate({ system: SYSTEM, prompt, schema, thinkingMode: 'NONE', maxTokens: 2500 });
  let data: Rec;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error('The AI returned an unreadable answer. Please try again.');
  }
  return data;
}
