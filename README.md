# Tiwa — plan any event, together

> MVP in Lagos, Nigeria. Mobile-first installable web app for hosts, planners, vendors and guests.

See `AGENTS.md` first, then `decision.md`, then `PRD.md`, `arc.md`, `user_flow.md`, `Backend.md`, `Frontend.md`, `BUILD_PLAN.md`.

## Prerequisites

- Node.js 22 (engines: `>=20 <24`; CI uses 22)
- pnpm 9 via corepack: `corepack enable && corepack prepare pnpm@9 --activate`
- Docker Desktop (or Docker Engine) running — local Postgres, Redis, S3 and Mailpit run as containers
- Ports free: 3000 (web), 5432 (postgres), 6379 (redis), 9090/9001 (s3), 8025/1025 (mailpit)

## First run (clean machine)

```sh
cp .env.example .env   # local defaults work as-is; fill secrets as needed
pnpm install
pnpm db:up             # Postgres + Redis + S3 buckets + Mailpit, waits until healthy
pnpm db:migrate        # apply Prisma migrations
pnpm db:seed           # stub until P2 (proves the DB is reachable)
pnpm dev               # web on http://localhost:3000 + worker
```

## Commands (wired fully from P0-T04 onwards; stubs in P0-T01)

| Command | Does |
|---------|------|
| `pnpm install` | Install everything |
| `pnpm dev` | Run web app (port 3000) and worker together |
| `pnpm db:up` | Local Postgres + Redis + S3 + Mailpit |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Demo data |
| `pnpm lint` | ESLint + Prettier |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit + integration |
| `pnpm e2e` | Playwright at 390px and 1280px |
| `pnpm gate <phase>` | Phase gate checks (`gates/<n>.json`) |

## Status

P0 foundation DONE (2026-10-28): monorepo, strict TS, lint/boundaries, Next.js app, worker, local infra, Prisma, typed env + flags, core money/ids/errors/time, Vitest + Playwright, Lighthouse + bundle budgets, Sentry + health, CI, gate runner. P1 (design system) is next — see `BUILD_PLAN.md` Status and `docs/PROGRESS.md`.
