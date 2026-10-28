# Preview deployments (P0-T15)

PRs get a live URL with production build + seeded demo data behind it, and
Lighthouse/size-limit run against that URL before merge.

## 1. Vercel project (needs a human — see `docs/QUESTIONS.md` Q-001)

1. Import the repo into Vercel. **Root Directory: `apps/web`**.
2. Framework preset: Next.js. Install command (repo root): `pnpm install --frozen-lockfile`.
   Build command: `pnpm --filter @tiwa/web build`. Output: `.next`.
3. Environment variables per environment (`APP_ENV=preview` on previews):
   copy the keys from `.env.example`. Minimum for a preview to boot:
   `APP_URL` (the preview URL), `APP_ENV=preview`, `DATABASE_URL` (Neon branch,
   below), `REDIS_URL` (Upstash), `AUTH_SECRET`, S3 endpoint/buckets/keys
   (R2 or the branch-safe fake), `NEXT_PUBLIC_SENTRY_DSN` (optional).
   Never copy production secrets into previews.
4. Every PR then gets `https://tiwa-web-<hash>.vercel.app` automatically.

## 2. Neon branch database (needs a human — see Q-002)

1. Create the Neon project in the EU region (see the latency note in
   `decision.md`: EU ≈ US − 50 ms from Lagos; Frankfurt/Ireland tied).
2. Install the Neon–GitHub integration: it creates a database branch per PR
   and exposes `DATABASE_URL` for preview env (branch-per-PR).
3. Run migrations against the branch on preview builds:
   `pnpm --filter @tiwa/db migrate:deploy`, then `pnpm db:seed`.
4. Monthly: `pg_dump` restore test (arc.md backups rule).

## 3. Running the budgets against a preview URL

```sh
PREVIEW_URL=https://tiwa-web-<hash>.vercel.app
npx lhci autorun --collect.url=$PREVIEW_URL --collect.startServerCommand=""
```

(`startServerCommand=""` skips the local server; assertions come from
`lighthouserc.json`. Add the route to `.size-limit.json` first if the PR
adds a page, then `pnpm size` after `pnpm build` — size runs on the local
production build, not the URL.)

## 4. Confirming the Lagos numbers (needs a human — see Q-003)

The P0 measurement below was taken from a WAT machine. Confirm from real
user devices in Lagos at the P17 gate: open a preview URL on 4G, record
LCP + API p95 in the decision log, and pin Vercel functions + Neon to the
winning region.
