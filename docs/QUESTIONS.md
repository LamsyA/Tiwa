# QUESTIONS.md — human decisions needed

Format: `## YYYY-MM-DD — P<-T<>` + question + options + status (`OPEN` / `ANSWERED`).
AGENTS.md §5: money, legal, security, deletion, or hard-to-undo work stops here.

## 2026-10-28 — P0-T15 — Q-001: Vercel account and project for previews
- Question: Which Vercel account/org hosts `apps/web`, and who creates the project (Root Directory `apps/web`, preview URLs per PR)?
- Why: P0-T15 and the P0 gate ("a pull request produces a preview URL") need it. No code can substitute an account.
- Status: OPEN

## 2026-10-28 — P0-T15 — Q-002: Neon project + branch-per-PR integration
- Question: Who creates the Neon project (EU region per the latency note in `decision.md`), installs the Neon–GitHub integration, and wires branch `DATABASE_URL`s into Vercel previews?
- Why: Previews need a branch database with migrations + seed. Local Postgres cannot serve public preview URLs.
- Status: OPEN

## 2026-10-28 — P0-T15 — Q-003: Confirm region choice from Lagos devices
- Question: Can someone on a Lagos 4G connection open a preview URL and report LCP + API p95, to confirm the EU-region choice before P17 production config?
- Why: P0 measured TCP connect from a WAT machine (EU ≈ 130–280 ms, US ≈ 330 ms, Cloudflare edge ≈ 25 ms). Real-device confirmation closes the loop.
- Status: OPEN
