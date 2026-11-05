# Sozial

Multi-tenant social media management and scheduling app built with React, Vite, Vercel Functions, Neon Postgres, and Vercel Blob.

## Deploy

1. Import this repository into Vercel and select the `socialflow` project directory.
2. Create a Neon database, set `DATABASE_URL` to its pooled connection string, then run [migrations/001_neon_schema.sql](migrations/001_neon_schema.sql) in the Neon SQL Editor. The API also creates the same schema automatically when needed.
3. Create a Cloudflare R2 bucket for SozialFlow media. Create bucket-scoped S3 credentials, configure a public HTTPS custom domain for the bucket, and set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and `R2_PUBLIC_BASE_URL` in Vercel. Postiz must be able to fetch media from that public URL.
4. Set `CRON_SECRET` to a long random value in Vercel. In the GitHub repository, add `APP_BASE_URL` as an Actions variable (for example, `https://your-app.vercel.app`) and add the same `CRON_SECRET` as an Actions secret. The included workflow calls publishing every five minutes and evergreen processing hourly, avoiding Vercel Hobby's once-daily Cron limit.
5. Run [Postiz on your VPS/server](https://docs.postiz.com/self-host/installation/docker-compose), which includes Temporal for durable publishing workflows. Configure its provider credentials and its own R2 storage using the [Postiz R2 guide](https://docs.postiz.com/self-host/configuration/uploads). Set `POSTIZ_API_URL` to its public API base (for example, `https://postiz.example.com/api/public/v1`) and `POSTIZ_API_KEY` in SozialFlow's server environment, then deploy.

Vercel builds and serves the app; GitHub Actions runs the authenticated background jobs. Optional variables are listed in [.env.example](.env.example). For local development, copy `.env.example` to `.env.local`, set `DATABASE_URL` to your rotated Neon pooled connection string, then run `npm install` and `npm run dev`. The Vite dev server forwards `/api/*` requests to the same backend router used by Vercel, so local sign-in does not require the Vercel CLI. Without `DATABASE_URL`, authentication endpoints return a configuration error and sign-in cannot work. Never put live credentials in `.env.example` or commit `.env.local`.

SozialFlow administrators connect and manage social accounts in the private Postiz dashboard, then assign each Postiz channel to its SozialFlow customer workspace from **Social Accounts**. Customers only see their assigned channels in SozialFlow; they do not need Postiz credentials or dashboard access. Keep the Postiz API key exclusively in the SozialFlow server environment. Scheduled posts are sent by the authenticated GitHub Actions worker, which checks the queue every five minutes; immediate posts are sent as soon as the app accepts them. Delivery also depends on Postiz and the social network accepting the content.

AI generation requires a plan with AI enabled and credits remaining, plus `OPENAI_API_KEY` in the server environment. For local development, set it in `.env.local` and restart Vite. The AI Assistant page reports whether provider configuration or plan access is missing.

Run `npm run typecheck` and `npm run build` before deploying.

## Runtime Notes

The existing document-oriented backend is preserved on Neon through the `socialflow_records` JSONB table. Each app collection (`profiles`, `workspaces`, `posts`, `accounts`, `plans`, sessions, and others) is a logical `table_name`; records retain their current IDs and payload shape, with optimistic conditional updates for post/job mutations. The API writes these records during registration, workspace setup, and normal app use. Default plan rows are seeded automatically on the first bootstrap.

This does not import data from the former AppDeploy database; the Neon database starts empty. Export and transform the old records separately if existing workspaces need to be retained.

Uploaded media is stored in Cloudflare R2 with public HTTPS URLs so Postiz can retrieve it. Do not upload private files. Direct browser uploads are limited to 3.2 MB to fit Vercel function request limits; larger media can be added by public URL.

Authentication now uses email/password accounts and hashed passwords, with opaque sessions stored in Neon and delivered in HttpOnly cookies. Email verification and password recovery are not configured, so add an email delivery and recovery flow before opening registration to a broad public audience. Restrict signups at the edge or through an identity provider if the app should be invite-only.

## Tenant Provisioning

Each business, agency, creator, or client organization is a separate workspace in the shared SozialFlow system. Superadmins can open **Admin console** to provision a workspace and designate its single primary organization admin. Existing users receive access immediately; new admins claim the workspace by registering with the designated email. Email delivery is not configured, so share the app URL with them.

The organization admin controls only their workspace and can add unlimited staff accounts with distinct `admin`, `manager`, `creator`, `editor`, `approver`, or `viewer` responsibilities. The superadmin remains the only role with cross-organization system authority. Team data and content stay scoped to each workspace.

The product walkthrough is available at `/demo.html` in local development and after deployment.

GitHub Actions scheduled workflows can be delayed during high load. For tighter publishing guarantees, use a dedicated external scheduler or a Vercel plan with Cron cadence suitable for the application.

Payment environment variables are surfaced in integration status, but checkout is not implemented. Existing app pages and APIs remain otherwise unchanged.

## Project Layout

- `src/`: React + Vite + Tailwind frontend
- `backend/`: API routes, Neon-backed persistence, publishing engine, AI, billing, and admin logic
- `api/`: Vercel Functions for the API and scheduled jobs
- `vercel.json`: Vercel build and cron configuration
