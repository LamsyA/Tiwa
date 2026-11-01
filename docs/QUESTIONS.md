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

## 2026-10-30 — P5-T03 — Q-004: Moderation provider (+ CSAM hash matching) for Moments

- Question: Which provider scans guest uploads (e.g. AWS Rekognition, Google Vision, Sightengine), who owns the billing key, and separately: who arranges CSAM hash-matching (PhotoDNA via NCMEC or equivalent)? Fake approves everything and must not ship to production.
- Why: D-P07 requires a safety scan on every upload; without a real provider BLOCK/REVIEW never triggers and illegal content would publish. Needs a partnership/contract no agent can sign.
- Status: OPEN

## 2026-11-01 — P8-T18 — Q-005: Licensed escrow partner and legal sign-off before held payments or payouts

- Question: Which licensed partner will hold customer money for Held mode (an escrow/trust provider or the payment provider's own escrow product), and who gives legal sign-off (CBN payment-service rules, consumer-protection terms, refund and dispute policy) before `payments.held` or `payments.payouts` is enabled in production? Separately: who opens the Paystack and/or Flutterwave business accounts (KYC, settlement bank, split/subaccount access) needed for online checkout?
- Why: D-M03 / D-O01 require a licensed partner and human sign-off; Tiwa must never hold funds itself. Lean P8 (D-X27) ships offline recording only, so nothing is blocked today, but the deferred tasks P8-T02–T07 and T09–T15 cannot start without these answers. Both flags stay OFF in production until this is closed.
- Status: OPEN
