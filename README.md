# Tiwa — plan any event, together

> MVP in Lagos, Nigeria. Mobile-first installable web app for hosts, planners, vendors and guests.

See `AGENTS.md` first, then `decision.md`, then `PRD.md`, `arc.md`, `user_flow.md`, `Backend.md`, `Frontend.md`, `BUILD_PLAN.md`.

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

P0-T01 scaffold. `apps/web`, `apps/worker`, `packages/*` fill in from P0-T03 onwards.
