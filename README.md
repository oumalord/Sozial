# SocialFlow

Multi-tenant social media management and scheduling app built with React, Vite, Vercel Functions, Neon Postgres, and Vercel Blob.

## Deploy

1. Import this repository into Vercel and select the `socialflow` project directory.
2. Create a Neon database, set `DATABASE_URL` to its pooled connection string, then run [migrations/001_neon_schema.sql](migrations/001_neon_schema.sql) in the Neon SQL Editor. The API also creates the same schema automatically when needed.
3. Create and connect a Vercel Blob store so `BLOB_READ_WRITE_TOKEN` is available to Functions.
4. Set `CRON_SECRET` to a long random value in Vercel. In the GitHub repository, add `APP_BASE_URL` as an Actions variable (for example, `https://your-app.vercel.app`) and add the same `CRON_SECRET` as an Actions secret. The included workflow calls publishing every five minutes and evergreen processing hourly, avoiding Vercel Hobby's once-daily Cron limit.
5. Add any integrations you use, such as `AYRSHARE_API_KEY` and `OPENAI_API_KEY`, then deploy.

Vercel builds and serves the app; GitHub Actions runs the authenticated background jobs. Optional variables are listed in [.env.example](.env.example). For local development, copy `.env.example` to `.env.local`, set `DATABASE_URL` to your rotated Neon pooled connection string, then run `npm install` and `npm run dev`. The Vite dev server forwards `/api/*` requests to the same backend router used by Vercel, so local sign-in does not require the Vercel CLI. Without `DATABASE_URL`, authentication endpoints return a configuration error and sign-in cannot work. Never put live credentials in `.env.example` or commit `.env.local`.

Run `npm run typecheck` and `npm run build` before deploying.

## Runtime Notes

The existing document-oriented backend is preserved on Neon through the `socialflow_records` JSONB table. Each app collection (`profiles`, `workspaces`, `posts`, `accounts`, `plans`, sessions, and others) is a logical `table_name`; records retain their current IDs and payload shape, with optimistic conditional updates for post/job mutations. The API writes these records during registration, workspace setup, and normal app use. Default plan rows are seeded automatically on the first bootstrap.

This does not import data from the former AppDeploy database; the Neon database starts empty. Export and transform the old records separately if existing workspaces need to be retained.

Uploaded media is stored in Vercel Blob with public URLs so publishing providers can retrieve it. Do not upload private files. Direct browser uploads are limited to 3.2 MB to fit Vercel function request limits; larger media can be added by public URL.

Authentication now uses email/password accounts and hashed passwords, with opaque sessions stored in Neon and delivered in HttpOnly cookies. Email verification and password recovery are not configured, so add an email delivery and recovery flow before opening registration to a broad public audience. Restrict signups at the edge or through an identity provider if the app should be invite-only.

## Tenant Provisioning

Superadmins can open **Admin console** from the no-workspace onboarding screen or use the Administration navigation item. Provision an organization with its type, owner email, and plan. Existing users receive owner membership immediately; new owners claim the workspace by registering with the invited email. Email delivery is not configured, so the admin console provides the app link to share with the owner. Owners then complete onboarding and set up their studio, channels, and team.

The product walkthrough is available at `/demo.html` in local development and after deployment.

GitHub Actions scheduled workflows can be delayed during high load. For tighter publishing guarantees, use a dedicated external scheduler or a Vercel plan with Cron cadence suitable for the application.

Payment environment variables are surfaced in integration status, but checkout is not implemented. Existing app pages and APIs remain otherwise unchanged.

## Project Layout

- `src/`: React + Vite + Tailwind frontend
- `backend/`: API routes, Neon-backed persistence, publishing engine, AI, billing, and admin logic
- `api/`: Vercel Functions for the API and scheduled jobs
- `vercel.json`: Vercel build and cron configuration
