# PROGRESS.md — build log

Format per `AGENTS.md §3`: `## YYYY-MM-DD` + `- P<-T<>: done` lines and gate results.

## 2026-10-28
- P0-T01 done: repo layout with pnpm workspaces + Turborepo, root docs, docs stubs — `pnpm install/lint/typecheck/test` pass (turbo, 0 tasks).
- P0-T02 done: `tsconfig.base.json` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, `@tiwa/*` aliases) + root `tsconfig.json`; root `typecheck` runs `tsc --noEmit`; `@types/node` added.
- P0-T03 done: ESLint flat config (TS recommended, `no-restricted-imports` boundary matrix per arc.md §3 — probe-verified) + Prettier (120/singleQuote); root `lint` runs eslint + prettier --check + turbo. Next.js rules deferred to P0-T04 with apps/web.
- P0-T04 done: `@tiwa/web` (Next 15.2 + React 19 + Tailwind v4, App Router, placeholder `/`); per-package lint/typecheck/test wired to turbo; React flat-native lint rules (eslint 9 — eslint-config-next dropped: FlatCompat circular-config crash); root tsconfig excludes self-checked apps/web; `next build` static OK (101 kB first load), dev serves 200.
