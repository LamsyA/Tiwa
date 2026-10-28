# PROGRESS.md — build log

Format per `AGENTS.md §3`: `## YYYY-MM-DD` + `- P<-T<>: done` lines and gate results.

## 2026-10-28
- P0-T01 done: repo layout with pnpm workspaces + Turborepo, root docs, docs stubs — `pnpm install/lint/typecheck/test` pass (turbo, 0 tasks).
- P0-T02 done: `tsconfig.base.json` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, `@tiwa/*` aliases) + root `tsconfig.json`; root `typecheck` runs `tsc --noEmit`; `@types/node` added.
