import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handler } from '../../backend';

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } };

export default function authApi(request: VercelRequest, response: VercelResponse): Promise<void> {
  return handler(request, response);
}
