# Deploy Tiwa on the free stack (D-X55)

| Piece | Service |
|---|---|
| Web app | Vercel Hobby (`apps/web`, settings in `apps/web/vercel.json`) |
| Worker | Render free web service from `render.yaml` (Docker, ffmpeg, `/health`) |
| Keep-awake | cron-job.org → `GET https://<worker>.onrender.com/health` every 10 min |
| Postgres | Neon free (pooled `DATABASE_URL`, direct `DIRECT_DATABASE_URL` for migrations) |
| Redis | Layerbase free, Valkey, `rediss://` URL (max 20 connections) |
| Files | Cloudflare R2: `tiwa-media-private`, `tiwa-media-public` (public r2.dev URL = `MEDIA_CDN_URL`) |
| Email | Gmail SMTP (`EMAIL_PROVIDER=smtp`) until a Resend domain is verified |

## 1. Fill the settings
Copy every value into `.env.production.local` (git-ignored). `AUTH_SECRET` must be a new
long random string for production: `openssl rand -base64 32`.

## 2. Database
```
pnpm --filter @tiwa/db exec dotenv -e ../../.env.production.local -- prisma migrate deploy
```
Hand-written indexes live in the migrations, so `migrate deploy` (never `db push`).

## 3. Web on Vercel
1. Vercel → Add New → Project → import `LamsyA/Tiwa`.
2. **Root Directory: `apps/web`.** Framework, install and build commands come from `apps/web/vercel.json`.
3. Environment Variables: paste everything from `.env.production.local`, plus the app's
   other keys from `.env` (AUTH_SECRET, Google, SMTP, Muse, VAPID, flags).
4. Deploy. Then set `APP_URL` to the final `https://….vercel.app` address and redeploy.

## 4. Worker on Render
1. Render → New → Blueprint → `LamsyA/Tiwa` → it reads `render.yaml`.
2. Fill the variables marked "sync: false" with the same values as Vercel.
3. Deploy, then open `https://tiwa-worker.onrender.com/health` → `{"ok":true,…}`.

## 5. Keep the worker awake
cron-job.org → Create cronjob → URL `https://tiwa-worker.onrender.com/health`,
every 10 minutes. This also keeps the Layerbase database out of hibernation.

## 6. Google sign-in
Google Cloud → Credentials → your OAuth client:
- Authorized JavaScript origins: `https://<app>.vercel.app`
- Authorized redirect URIs: `https://<app>.vercel.app/api/auth/callback/google`

## 7. Check
- `/login` → sign up with a username → onboarding role step.
- Forgot password → email arrives with an `https://` link.
- Upload a Moments photo → thumbnail appears (worker + R2).
