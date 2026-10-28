# PROGRESS.md — build log

Format per `AGENTS.md §3`: `## YYYY-MM-DD` + `- P<-T<>: done` lines and gate results.

## 2026-10-28
- P0-T01 done: repo layout with pnpm workspaces + Turborepo, root docs, docs stubs — `pnpm install/lint/typecheck/test` pass (turbo, 0 tasks).
- P0-T02 done: `tsconfig.base.json` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, `@tiwa/*` aliases) + root `tsconfig.json`; root `typecheck` runs `tsc --noEmit`; `@types/node` added.
- P0-T03 done: ESLint flat config (TS recommended, `no-restricted-imports` boundary matrix per arc.md §3 — probe-verified) + Prettier (120/singleQuote); root `lint` runs eslint + prettier --check + turbo. Next.js rules deferred to P0-T04 with apps/web.
- P0-T04 done: `@tiwa/web` (Next 15.2 + React 19 + Tailwind v4, App Router, placeholder `/`); per-package lint/typecheck/test wired to turbo; React flat-native lint rules (eslint 9 — eslint-config-next dropped: FlatCompat circular-config crash); root tsconfig excludes self-checked apps/web; `next build` static OK (101 kB first load), dev serves 200.
- P0-T05 done: `@tiwa/worker` (BullMQ + ioredis, `ping` job, SIGTERM/SIGINT graceful close verified, console log until pino lands in P0-T12); Dockerfile (node:22 + ffmpeg 5.1.9, image builds); live ping round-trip deferred to P0-T06 (needs Redis).
- P0-T06 done: compose (postgis:16-3.4, redis:7-alpine, s3mock + aws-cli bucket init for `tiwa-media`/`tiwa-exports`, mailpit); all healthy via `pnpm db:up --wait`; PG16.4+PostGIS3.4, Redis PONG, both buckets listed, Mailpit API OK; worker live `ping` round-trip verified (completed + clean shutdown). AGENT decision D-X01: S3Mock locally (MinIO images unavailable), prod stays MinIO/R2.
