import { defineConfig } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handler } from './backend';

const MAX_BODY_BYTES = 4_500_000;

function localApi(): Plugin {
	return {
		name: 'socialflow-local-api',
		configureServer(server: ViteDevServer) {
			server.middlewares.use(async (request, response, next) => {
				if (!request.url?.startsWith('/api/')) return next();
				try {
					const chunks: Buffer[] = [];
					let size = 0;
					for await (const chunk of request) {
						const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
						size += buffer.length;
						if (size > MAX_BODY_BYTES) {
							response.statusCode = 413;
							response.setHeader('Content-Type', 'application/json');
							response.end(JSON.stringify({ error: 'Request body is too large.' }));
							return;
						}
						chunks.push(buffer);
					}
					const rawBody = Buffer.concat(chunks).toString('utf8');
					(request as VercelRequest).body = rawBody && request.headers['content-type']?.includes('application/json') ? JSON.parse(rawBody) : {};
					const vercelResponse = {
						setHeader: (name: string, value: string) => response.setHeader(name, value),
						status: (code: number) => {
							response.statusCode = code;
							return vercelResponse;
						},
						json: (body: unknown) => {
							response.setHeader('Content-Type', 'application/json');
							response.end(JSON.stringify(body));
							return vercelResponse;
						},
					};
					await handler(request as VercelRequest, vercelResponse as unknown as VercelResponse);
				} catch (error) {
					console.error('local API request failed', error);
					response.statusCode = 400;
					response.setHeader('Content-Type', 'application/json');
					response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid API request.' }));
				}
			});
		},
	};
}

export default defineConfig(({ mode }) => {
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
		if (process.env[key] === undefined) process.env[key] = value;
	}
	return { plugins: [react(), localApi()], base: './' };
});
