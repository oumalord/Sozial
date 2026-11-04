# SocialFlow

Multi-tenant social media management and scheduling app built with React, Vite, Vercel Functions, Neon Postgres, and Vercel Blob.

## Deploy

1. Import this repository into Vercel and select the `socialflow` project directory.
2. Create a Neon database, set `DATABASE_URL` to its pooled connection string, then run [migrations/001_neon_schema.sql](migrations/001_neon_schema.sql) in the Neon SQL Editor. The API also creates the same schema automatically when needed.
3. Create and connect a Vercel Blob store so `BLOB_READ_WRITE_TOKEN` is available to Functions.
4. Set `CRON_SECRET` to a long random value. Vercel uses it to authorize the scheduled publishing and evergreen functions.
5. Add any integrations you use, such as `AYRSHARE_API_KEY` and `OPENAI_API_KEY`, then deploy.

The Vercel configuration builds the Vite frontend and schedules publishing every five minutes and evergreen processing hourly. Optional variables are listed in [.env.example](.env.example). For local development, copy `.env.example` to `.env.local`, set `DATABASE_URL` to your rotated Neon pooled connection string, then run `npm install` and `npm run dev`. The Vite dev server forwards `/api/*` requests to the same backend router used by Vercel, so local sign-in does not require the Vercel CLI. Without `DATABASE_URL`, authentication endpoints return a configuration error and sign-in cannot work. Never put live credentials in `.env.example` or commit `.env.local`.

Run `npm run typecheck` and `npm run build` before deploying.

## Runtime Notes

The existing document-oriented backend is preserved on Neon through the `socialflow_records` JSONB table. Each app collection (`profiles`, `workspaces`, `posts`, `accounts`, `plans`, sessions, and others) is a logical `table_name`; records retain their current IDs and payload shape, with optimistic conditional updates for post/job mutations. The API writes these records during registration, workspace setup, and normal app use. Default plan rows are seeded automatically on the first bootstrap.

This does not import data from the former AppDeploy database; the Neon database starts empty. Export and transform the old records separately if existing workspaces need to be retained.

Uploaded media is stored in Vercel Blob with public URLs so publishing providers can retrieve it. Do not upload private files. Direct browser uploads are limited to 3.2 MB to fit Vercel function request limits; larger media can be added by public URL.

Authentication now uses email/password accounts and hashed passwords, with opaque sessions stored in Neon and delivered in HttpOnly cookies. Email verification and password recovery are not configured, so add an email delivery and recovery flow before opening registration to a broad public audience. Restrict signups at the edge or through an identity provider if the app should be invite-only.

The five-minute publishing schedule must be supported by the selected Vercel plan; adjust the schedule or plan if Vercel rejects that cadence.

Payment environment variables are surfaced in integration status, but checkout is not implemented. Existing app pages and APIs remain otherwise unchanged.

## Project Layout

- `src/`: React + Vite + Tailwind frontend
- `backend/`: API routes, Neon-backed persistence, publishing engine, AI, billing, and admin logic
- `api/`: Vercel Functions for the API and scheduled jobs
- `vercel.json`: Vercel build and cron configuration
