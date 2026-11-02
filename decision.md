# decision.md — Tiwa Decision Record

This file records every important decision about Tiwa: what was decided, why, and who may change it. Every agent reads it at the start of a session (after `AGENTS.md`) and adds to the log at the bottom.

## How this file works

| Status | Meaning | Who can change it |
|--------|---------|-------------------|
| **LOCKED** | A core decision. The docs and the code are built on it. | Only a human. An agent that thinks it is wrong adds a `PROPOSED` entry to the log and keeps following the locked decision. |
| **OPEN** | Waiting for a human. | A human answers it; the agent records the answer and changes the status to LOCKED. |
| **AGENT** | A smaller choice an agent made while building. | Any agent, with a new log entry explaining the change. |

Rules for agents:

1. Never break a LOCKED decision, even if a task seems to need it. Write the conflict in `docs/QUESTIONS.md` and mark the task `- [?]`.
2. Log every AGENT decision that a future developer would ask "why?" about (a library choice, a data shape, a trade-off). Skip trivial ones.
3. One entry per decision, newest at the bottom, using the template in §7.

---

## 1. Product decisions

| ID | Decision | Why | Status |
|----|----------|-----|--------|
| D-P01 | The product is called **Tiwa** ("ours" in Yoruba). | Short, warm, works globally; an event belongs to everyone involved. Trademark and domain still to be checked (see D-O05). | LOCKED |
| D-P02 | Tiwa supports **any type of event** (private, corporate, public/ticketed, community). No wedding-only or event-specific logic in code; event types are templates in `packages/config`. | The market is every gathering, not only weddings. | LOCKED |
| D-P03 | **Built for the world, launched in Nigeria (Lagos first).** Country rules (currency, payments, tax, languages, templates, data rules) are configuration. | A second country should need settings and a payment adapter, not a rebuild. | LOCKED |
| D-P04 | The MVP is a **responsive, installable web app (PWA)**. Native iOS/Android apps come after launch on the same backend. | One codebase, fastest to market, no app-store friction for guests. | LOCKED |
| D-P05 | **Guests never need an account or an app.** They act through signed personal links, tickets or gallery sessions. | Guests are the largest group and the growth channel; any friction loses them. | LOCKED |
| D-P06 | **Invitations are optional per event** (off by default) and sending takes one click; replying takes one tap. Channels: link, QR, WhatsApp (free `wa.me` mode and paid Cloud API), email, SMS. | Small events need only a link; big events need bulk sending and tracking. | LOCKED |
| D-P07 | **Moments** has two albums per event: Official (hired photographer) and Guest (uploads by QR, no account). Every upload passes a safety scan. | Collecting every guest's photos is the feature that spreads Tiwa. | LOCKED |
| D-P08 | The **planner controls** whether the host sees vendor-level prices. | Planners often sell packages with a margin; forcing transparency would push them away. | LOCKED |
| D-P09 | Venues are vendors with **bookable spaces** (hall, garden, rooftop) sold **per date and slot**, with instant booking or quote, provisional holds and refundable security deposits. | A venue sells a space and a time, not a service package. | LOCKED |
| D-P10 | AI **drafts and suggests only**; it never changes data without the user pressing a confirm button, and it sees only what the user may see. | Trust and safety around money and agreements. | LOCKED |
| D-P12 | **Chat is a core MVP feature.** Clients chat with vendors, venues and planners before and after booking; planners chat with clients and vendors; every event has a team chat and every booking a thread. WhatsApp-level basics (real time, delivered/seen receipts, typing, voice notes, photos/files, quoted replies, cards). | Most event business happens in conversation; keeping it in Tiwa keeps agreements, evidence and bookings together. | LOCKED |
| D-P13 | **Guests may message a vendor or planner only after the event ends**, only businesses that worked on an event they attended, and only after verifying a phone number (OTP creates a basic account). Vendors reply but never message guests first. | Turns every event into new leads for vendors without spam; a phone number is needed so the vendor can reply. Does not change D-P05: RSVP and uploads still need no account. | LOCKED |
| D-P14 | **Contact details are masked in chat until a booking is confirmed** between the two parties, with a warning to the sender; unmasked after booking. Masking is a nudge, never an automatic penalty. | Keeps payments (and their protection) on Tiwa without blocking real conversation. | LOCKED |
| D-P11 | Out of scope for the MVP: native apps, face matching, AI highlight video, print sales, drag-and-drop seating, multi-track session builder, aso-ebi ordering, recommendations, sponsored listings, e-signature integrations. | Keep the MVP buildable; add after real usage. | LOCKED |

## 2. Architecture decisions

| ID | Decision | Why | Status |
|----|----------|-----|--------|
| D-A01 | **Modular monolith**: one Next.js (App Router) app for all pages and server logic, plus **one worker** process (BullMQ) for background jobs. | Fewer moving parts for the MVP; can be split later. | LOCKED |
| D-A02 | **Business rules live in `packages/core`**, framework-free; pages, actions, route handlers and jobs are thin wrappers. | Testable in isolation; reusable by native apps later. | LOCKED |
| D-A03 | **TypeScript (strict)** everywhere; **PostgreSQL** with **Prisma**; **Redis** for queues, rate limits and pub/sub. | One language; strong transactions for money and bookings. | LOCKED |
| D-A04 | **Every third-party service sits behind an adapter interface with a Fake implementation** (payments, payouts, escrow, email, SMS, WhatsApp, push, moderation, LLM, storage). | Build and test without credentials; swap providers by configuration. | LOCKED |
| D-A05 | **Uploads go directly from the browser to object storage** (S3-compatible: Cloudflare R2 in production, MinIO locally) with pre-signed multipart URLs; the worker processes media. | Large events must not overload the app servers. | LOCKED |
| D-A06 | **Live updates use Server-Sent Events + Redis pub/sub**, falling back to polling. | Simple, works through CDNs, no extra vendor. | LOCKED |
| D-A07 | **Outbox pattern**: jobs are enqueued from rows written in the same transaction as the change. | No lost or phantom jobs. | LOCKED |
| D-A08 | **The server is authoritative** for permissions, booking states, payment states, ticket capacity, availability and review eligibility. One `authorize()` gate. | Clients and AI can't be trusted to enforce rules. | LOCKED |
| D-A09 | **Performance budgets are hard limits** (e.g. guest pages LCP ≤ 1.5 s on Slow 4G, ≤ 90 KB JS) enforced in CI. | Most users are on mid-range Android phones and mobile data. | LOCKED |
| D-A10 | Auth: **phone OTP first**, email magic link and Google as alternatives; sessions in the database, httpOnly cookies. | Phone numbers are universal in Nigeria; email is not. | LOCKED |
| D-A11 | IDs are **UUID v7**; public slugs are short random strings; guest tokens are ≥ 128-bit random values. | Sortable, non-guessable, no sequential exposure. | LOCKED |

## 3. Money decisions

| ID | Decision | Why | Status |
|----|----------|-----|--------|
| D-M01 | **Money is `BigInt` minor units + ISO currency code.** Never floats. Formatting only in the UI. | Correctness. | LOCKED |
| D-M02 | **Three payment modes per booking: DIRECT** (split at checkout straight to the vendor), **HELD** (held by a licensed partner, released at milestones), **OFFLINE** (cash/transfer recorded by hand). | Covers how Nigerians actually pay while enabling protection. | LOCKED |
| D-M03 | **Tiwa holds money only through a licensed partner**, and only after legal sign-off per country. HELD mode and payouts are behind flags (`payments.held`, `payments.payouts`) that stay OFF in production until then. | Holding customer money without a licence is illegal. | LOCKED |
| D-M04 | **Paystack and Flutterwave** are the payment providers for Nigeria (chosen by config); Stripe and mobile money come with new countries. | Best local coverage; a second provider reduces outage risk. | LOCKED |
| D-M05 | **Double-entry ledger** for every money movement; entries are append-only and each transaction sums to zero (database-enforced). Daily reconciliation pauses payouts on mismatch. | Required once Tiwa routes or holds money. | LOCKED |
| D-M06 | A booking or ticket becomes paid **only after a verified webhook + provider verification**, never from the browser callback. | Prevents fake payment confirmations. | LOCKED |
| D-M07 | No platform fee on refundable **security deposits**. | They are not Tiwa revenue and must be returned in full. | LOCKED |

## 4. Data model decisions

| ID | Decision | Why | Status |
|----|----------|-----|--------|
| D-D01 | One **BusinessProfile** for both vendors and planners (`Organization.kind` tells them apart). | The two profiles had the same fields; one model means one search and one profile page. | LOCKED |
| D-D02 | **Invitation data lives on the Guest** (`inviteToken`, `inviteRevokedAt`, `inviteOpenedAt`, `remindersSent`); each send is an `InviteDelivery`. | There is exactly one invitation per guest, so a separate table only added joins. | LOCKED |
| D-D03 | **Change requests are BookingVersions with status PROPOSED.** | A change request is a proposed new version of the agreement; one model keeps the history in one place. | LOCKED |
| D-D04 | **One ProgrammeItem model** for ceremony segments, conference sessions and the public agenda (`isPublic`). Backstage work is RunItem. | Avoids three overlapping ways to store an event's schedule. | LOCKED |
| D-D05 | **Income** = paid ticket orders + Contributions of kind `sponsor` / `other_income`. **Budget history** = AuditLog entries. No IncomeLine or BudgetChange models. | Both duplicated data that already exists. | LOCKED |
| D-D06 | Vendor verification model is named **BusinessVerification**. | Avoids a name clash with the auth library's own `verification` table. | LOCKED |
| D-D07 | **Availability** is one model (AvailabilityBlock) with optional venue space and slot; a database unique index (NULLS NOT DISTINCT) plus a trigger prevents double booking. | Venues need slot-level availability; other vendors use whole days. | LOCKED |
| D-D08 | Some fields are deliberate **caches** of data stored elsewhere (Organization.verification, BusinessProfile rating fields, Guest/Ticket `checkedInAt`, Booking.totalMinor, TicketType sold/reserved). Each is marked in the schema; the source of truth is named in its comment. | Fast search, lists and capacity locking. | LOCKED |
| D-D10 | Chat uses **Thread + ThreadParticipant + Message**; a participant is a person or a whole business (team inbox); messages carry a device-generated `clientMessageId` (unique per thread) so retries never duplicate; typing is never stored. | One model for all conversation types; idempotent sending; shared business inboxes. | LOCKED |
| D-D09 | Prisma 7 configuration: connection URLs live in `prisma.config.ts` (migrations) and the runtime client uses `@prisma/adapter-pg`; the schema file has no URLs. | Required by Prisma 7. | AGENT |

## 5. Open decisions (waiting for a human)

| ID | Question | Needed before | Default the agent uses meanwhile | Status |
|----|----------|---------------|----------------------------------|--------|
| D-O01 | Which **licensed partner** holds HELD-mode money (a bank or a payment company's escrow service), and what does the legal review require? | Turning on `payments.held` / `payments.payouts` in production (P17) | Fake EscrowProvider; flags OFF in production | OPEN |
| D-O02 | **Platform fee** rates (bookings, tickets) and subscription prices. | P8 (fees), P17 (launch) | Values in `PRD.md §6`, `PLATFORM_FEE_BPS=500` | OPEN |
| D-O03 | **Hosting region** for database and functions (lowest latency to Lagos). | P0-T15 | Agent measures candidates and records the result here | OPEN |
| D-O04 | **Moderation provider** for image safety and the CSAM hash-matching setup. | P5 | Fake moderation provider | OPEN |
| D-O05 | **Trademark and domain** for "Tiwa" (e.g. tiwa.app / tiwa.events) in Nigeria, UK, US. | P17 (production config) | Placeholder domains in `arc.md §7` | OPEN |
| D-O06 | **LLM provider and models.** | P15 | Fake LLM; adapter accepts any provider | OPEN |
| D-O07 | **WhatsApp Business** account verification and template approval; **SMS sender ID** registration with Termii. | Enabling `whatsapp.bulk` and live SMS (P17) | Free `wa.me` mode; Fake SMS | OPEN |
| D-O08 | When do **native apps** follow the web MVP? | After launch | Not built | OPEN |

## 6. Rejected options (do not re-propose without new facts)

| Option | Rejected because |
|--------|------------------|
| Microservices from day one | Too much operational work for an MVP team |
| Native apps first | Slower to ship; guests would need installs |
| Building our own escrow/wallet | Requires a licence; partner instead (D-M03) |
| Guest accounts for RSVP/upload | Friction kills participation (D-P05) |
| WebSockets service for live updates | SSE is enough and simpler (D-A06) |
| Storing money as decimals/floats | Rounding errors (D-M01) |

## 7. Decision log (agents append here)

Template:

```
### YYYY-MM-DD — <short title>
- ID: D-<area><number>   (area: P product, A architecture, M money, D data, X other)
- Status: AGENT | PROPOSED (needs human) | LOCKED (human approved)
- Decision: <one or two sentences>
- Why: <one or two sentences>
- Affects: <files, models, phases>
```

### 2026-10-28 — Data model consolidation before Phase 0
- ID: D-D01 to D-D08
- Status: LOCKED
- Decision: Merged VendorProfile + PlannerProfile into BusinessProfile; moved Invitation onto Guest; replaced ChangeRequest with PROPOSED BookingVersions; replaced AgendaItem and EventDay.segments with ProgrammeItem; removed IncomeLine and BudgetChange; renamed Verification to BusinessVerification; added VenueSpace, SiteVisit, slot-level availability, booking holds and security deposits. Schema went from 74 to 71 models and passes `prisma validate`.
- Why: Remove duplicated data and overlapping models; support venue booking; avoid an auth table name clash.
- Affects: Backend.md §3, PRD.md (VEN), user_flow.md (UF-29), Frontend.md (venues), BUILD_PLAN.md (P3, P4, P6, P7, P8, P9, P11).

### 2026-10-28 — Chat as a core MVP feature
- ID: D-P12, D-P13, D-P14, D-D10
- Status: LOCKED
- Decision: Full chat (client ↔ vendor/venue/planner, planner ↔ client/vendor, event team, booking threads, guest → vendor after the event) with receipts, typing, voice notes, cards, team inboxes, contact masking before booking, block/report. Built in P6 (with the marketplace) instead of P13.
- Why: Conversations drive bookings; users need chat as soon as they can find vendors.
- Affects: PRD.md MSG-*, Backend.md §3 (chat models) and §9a, user_flow.md UF-30 and UF-31, Frontend.md (chat components, /inbox), BUILD_PLAN.md P6, P7, P13.

### 2026-10-28 — Local S3 via S3Mock instead of MinIO image
- ID: D-X01
- Status: AGENT
- Decision: `infra/docker-compose.yml` runs adobe/s3mock (service `s3`, port 9090) plus an aws-cli `s3-init` that creates the arc.md §8 buckets (`tiwa-media-private`, `tiwa-media-public`); production stays on Cloudflare R2 and `packages/storage` targets the generic S3 API.
- Why: MinIO's images left Docker Hub and quay.io is unreachable from this environment; S3Mock is S3 API-compatible including multipart uploads.
- Affects: infra/docker-compose.yml, packages/storage (P5), arc.md §5 (note when recording versions in the P0 gate).

### 2026-10-28 — Region latency from Nigeria (preliminary)
- ID: D-X02
- Status: AGENT
- Decision: Provision production data + functions in the EU (Neon EU region, Vercel functions pinned to `fra1`); confirm from Lagos 4G devices before P17 (see Q-003).
- Why: TCP-connect samples from a WAT machine, 2026-10-28: eu-west-1 ≈ 133–281 ms, eu-central-1 ≈ 128–275 ms (tied within link variance), us-east-1 ≈ 330 ms, Cloudflare edge ≈ 25 ms. EU beats US by ~50–150 ms; the CDN edge is local-fast either way.
- Affects: docs/runbooks/preview-deployments.md, P0-T15 (Q-001/Q-002), P17 production config.

### 2026-10-28 — Extensions in SQL, not the Prisma preview feature
- ID: D-X03
- Status: AGENT
- Decision: `citext`/`pg_trgm`/`postgis` live in migration SQL only; the datasource `extensions` block and `postgresqlExtensions` preview flag are removed. CI migrates with `migrate deploy` (`pnpm db:migrate:deploy`); local iteration keeps `migrate dev`. A real-query waiter (`scripts/wait-for-db.mjs`) gates both on fresh volumes.
- Why: the postgis image pre-installs postgis + companions into every fresh database, so the preview tracker can never attribute them to a migration and `migrate dev` demands a reset — this failed CI deterministically on first run. Fresh TCP-open ≠ PG-ready, so the waiter handshakes instead of port-probing.
- Affects: packages/db (schema + migrations), package.json scripts, ci.yml, Backend.md §4 (when models land).

### 2026-10-28 — Next.js 16 upgrade: webpack pinned, bundle honest
- ID: D-X04
- Status: AGENT
- Decision: Next 15.2.4 → 16.4.3 (+ React 19.3.1, Sentry 11, next-intl 4.14.9). Dev and builds pin webpack (`--webpack`): Turbopack (the 16 default) has no equivalent of webpack's `resolve.extensionAlias`, which our NodeNext `.js`→`.ts` sources require — verified by failed build, kept the hook + a revisit note. `withSentryConfig` import moved to `@sentry/nextjs/config` (v11 path change). Deep `@tiwa/ui/theme` imports + `sideEffects:false` keep Radix out of route bundles. The served-HTML bundle checker replaces manifest parsing (Next 16 dropped `app-build-manifest.json`); it excludes legacy nomodule polyfills and error-boundary chunks.
- Why: latest-stable rule (arc.md §2). Turbopack can't resolve our authoring convention; webpack stays fully supported in 16.
- Affects: apps/web (config, scripts, layout imports), scripts/check-bundle.mjs, arc.md §2.

### 2026-11-01 — Vendor inbox lives at /quotes
- ID: D-X25
- Status: AGENT
- Decision: The vendor quote inbox (open enquiries + quote builder) lives at `/quotes`, matching the vendor sidebar nav that already points there; Frontend.md §6.3 names it `/enquiries`.
- Why: The shipped P1/P2 navigation config already routes vendor Quotes → `/quotes`; a second `/enquiries` route would split one inbox in two. Revisit if Frontend is revised.
- Affects: BUILD_PLAN P7-T04, apps/web/app/quotes, packages/ui shell nav.

### 2026-10-31 — Public profiles: data cache, not route ISR
- ID: D-X18
- Status: AGENT
- Decision: `/vendors/[slug]` and `/planners/[slug]` cache profile data with `unstable_cache` tagged `vendor:{orgId}` (instant invalidation via `updateTag` on edit); portfolio photos resolve through `/api/profile-photo/[itemId]` (fresh signed redirect) so no expiring URLs sit in HTML. Route-level ISR is not claimed: the root layout reads the theme cookie, so every page (including `/`) renders dynamically.
- Why: Full-route static caching would need public pages moved out of the themed root layout; the expensive reads are cached and edits invalidate instantly, which is the behaviour UF-13-3 needs. Revisit in P17 if profile-page budgets demand it.
- Affects: apps/web (vendors, planners, profile-photo route, business actions), packages/core/src/marketplace/public.ts, P6-T04.

### 2026-11-01 — Milestone createdAt + migration checksum repair
- ID: D-X26
- Status: AGENT
- Decision: Added `PaymentMilestone.createdAt` (Backend.md §3 omits it) for stable payments-timeline ordering; backfilled `NOT NULL DEFAULT CURRENT_TIMESTAMP`. Repaired `migrate dev` drift detection (caused by removing applied DROP INDEX lines in P7-T01) via `_prisma_migrations` checksum update + manual index restore instead of `migrate reset`, which would have wiped the shared dev database.
- Why: Timelines need deterministic order; a reset would destroy another agent's in-flight P5 work in this checkout.
- Affects: packages/db (schema, migrations 20261101132729, 20261101141148), packages/core/src/bookings.

### 2026-11-01 — Lean P8: offline payments only
- ID: D-X27
- Status: LOCKED (owner, 2026-11-01)
- Decision: For the $0 test deployment Tiwa moves no real money. P8 builds only: a `Payment` table (provider `offline`, with method, paid-on date, optional receipt photo, recorded-by and confirmed-by), `recordOfflinePayment` (host side, "I paid outside Tiwa") and `confirmOfflinePayment` (booking's vendor team, "Confirm received"), payment status on bookings and the vendor inbox, the UF-17 step 5 e2e, and the escrow/legal question in QUESTIONS.md. Recording moves a milestone SCHEDULED → RECORDED_OFFLINE (Payment PENDING); confirming → CONFIRMED_OFFLINE (Payment SUCCEEDED) and, for the first milestone of a DEPOSIT_DUE booking, the booking → CONFIRMED with its hold cleared. A booking accepted in DIRECT mode can still be paid offline. The accept sheet offers DIRECT only when a real provider is configured (`PAYMENT_PROVIDER` ≠ `fake`), so it defaults to Offline. Deferred (`[-]`): provider adapters, Fake checkout, webhooks, the ledger (offline memo postings will be backfilled from `Payment` rows when T03 lands), held payments, payouts, refunds, disputes, reconciliation, receipts, subscriptions, security deposits. P9 reads paid/outstanding from milestone states until the ledger exists.
- Why: owner — P8 is the largest and riskiest phase and needs provider accounts and escrow/legal sign-off; offline recording keeps bookings flowing to CONFIRMED without any of it.
- Affects: BUILD_PLAN P8 (and its gate), packages/db (Payment), packages/core/src/payments, booking page, vendor /quotes inbox, accept sheet, P9 budget sources.

### 2026-11-01 — P9 on the lean P8 and worker-free rules
- ID: D-X28
- Status: AGENT (follows owner decisions D-X20, D-X27)
- Decision: The money view reads bookings, milestones and expenses directly; there is no ledger yet. **Committed** = totals of non-cancelled bookings + all expenses; **Paid** = milestones in PAID_DIRECT/HELD/RELEASED/CONFIRMED_OFFLINE + expenses with `paidAt`; **Outstanding** = Committed − Paid; **Uncommitted** = Planned − Committed (may go negative = over budget). Bookings map to budget categories by key: exact key, else `VENDOR_BUDGET_KEYS` in config (e.g. photography → media, dj → entertainment), else `misc`, else an "Other" line. Alerts (over budget, payment due ≤ 7 d / ≤ 1 d) are computed on read and shown on the money page and overview; sending them as notifications waits for P13 and the worker. Exports: CSV straight from a route; PDF is a print-ready page (browser "Save as PDF") instead of a worker job. Live update: the money page refreshes every 5 s while visible (UF-20-2) instead of SSE, so it works without Redis. Contributions are offline only (no provider payment link). The P9 gate checks figures against bookings and milestones instead of the ledger; the staging demo books two vendors paid offline.
- Why: no worker, no Redis guarantee and no payment provider on the $0 test deployment; the figures stay honest because offline payments only count once the vendor confirms.
- Affects: BUILD_PLAN P9 (T05, T06, T07, gate), packages/config (VENDOR_BUDGET_KEYS), packages/core/src/budget, /events/[id]/money.

### 2026-11-02 — Marketplace categories trimmed
- ID: D-X29
- Status: LOCKED (owner, 2026-11-02)
- Decision: The vendor categories `funeral_services`, `clergy` (officiant or clergy) and `cleaning` are removed from `VENDOR_CATEGORIES` and from every event template (wedding, burial, church and community templates no longer suggest them). Local seed data no longer creates `cleaning` vendors; the 577 local test businesses that only had these categories were unpublished, not deleted.
- Why: owner — not services Tiwa will list at launch.
- Affects: packages/config (vendor categories, templates), packages/db seed, marketplace filters.

### 2026-11-02 — Lean P11: tickets on offline confirmation, public page dynamic
- ID: D-X31
- Status: AGENT (follows D-X27, D-X18)
- Decision: Tickets ship without a payment provider: free orders (total 0) issue instantly; paid orders reserve seats for 10 minutes and the organiser confirms with `confirmTicketOrderOffline` ("Mark as paid") once paid outside Tiwa; only PAID orders count as ticket income in the budget. `/e/[slug]` renders dynamically, not ISR (same root-layout theme-cookie limit as D-X18, and availability must never be stale). Organiser payouts (P11-T09) stay behind `payments.payouts` as a note only. Ticket delivery is the `/t/[ticketId]` page plus an inline email for free orders; WhatsApp delivery arrives with the messaging providers.
- Why: D-X27 keeps Tiwa moving no real money on the $0 deployment; Q-005 (escrow/legal + provider accounts) is still open.
- Affects: BUILD_PLAN P11 (T04, T05, T09), packages/core/src/tickets, /e/[slug], /events/[id]/tickets, P9 ticket income.

### 2026-11-02 — The host owns the plan and the budget split
- ID: D-X30
- Status: LOCKED (owner, 2026-11-02)
- Decision: Creating an event no longer applies the template's checklist or splits the total budget into template categories (supersedes UF-03 step 6 / UF-03-3 and Backend.md's `finalizeEvent` "creates tasks, budget categories"). It still creates day 1 and the programme outline. The host builds their own plan (add tasks per timeframe) and their own budget lines (name + amount, rename, delete — `addBudgetCategory`, `renameBudgetCategory`, `removeBudgetCategory`, plus `setAllocations` for amounts and the total). Template suggestions stay available as an explicit opt-in: "Pick from suggestions" adds only the ticked checklist tasks (`applySuggestedTasks`, skips ones already on the plan) and "Start from a suggested split" creates categories from the template percentages only while the budget is empty (`applySuggestedBudget`). Every change is audited.
- Why: owner — the auto-generated plan and the unexplained split did not match what hosts wanted; the creator must decide what goes on the plan and how much goes where.
- Affects: packages/core (events/commands, budget/edit), /events/[id]/plan, /events/[id]/money, event wizard copy, e2e create-event / event-plan / money.

### 2026-11-02 — Plan page: no timeframes, done / left / missed, AI planner pulled forward
- ID: D-X31
- Status: LOCKED (owner, 2026-11-02)
- Decision: The Plan page drops the template timeframe groups ("12+ weeks before" …). It is one list the host controls: quick-add with an optional date, edit, delete (`deleteTask`), check off. The summary shows Done, Left and Missed (a dated task past its date and not done) with filters for each, and a catch-up prompt when something was missed. The template "Pick from suggestions" sheet is replaced by "Plan with AI" (PRD AI-01 / UF-27, pulled forward from P15 by owner request): the host describes their event, `draftPlan` asks a `PlanDrafter` (packages/ai: `ClaudePlanDrafter` via the official Anthropic SDK with structured JSON output, default model `claude-opus-5-5`; `FakePlanDrafter` when `LLM_PROVIDER` is not `anthropic` or no key) and returns suggestions with due dates; nothing is saved until the host ticks suggestions and taps Add (`addDraftedTasks`, AI-06). The prompt context carries no personal data and includes the budget only for members with `money.view` (UF-27-2). Behind flag `ai.enabled` (OFF in production by default).
- Why: owner — the timeframes and template suggestions felt generic; hosts without a planner need real, tailored help and a clear view of what is done, left and missed.
- Affects: packages/ai (new), packages/core (events/ai-plan, tasks.deleteTask), /events/[id]/plan, BUILD_PLAN P15 (T01/T03 partly built early), e2e create-event / event-plan.

### 2026-11-02 — AI planning runs on Meta Muse Spark
- ID: D-X32
- Status: LOCKED (owner, 2026-11-02)
- Decision: "Plan with AI" uses Meta Muse Spark through the Meta Model API (OpenAI-compatible `POST https://api.meta.ai/v1/chat/completions`, Bearer key, JSON mode, `reasoning_effort: low`, 8,000-token limit to leave room for reasoning). Key in `TIWA_MUSE_API`; model `TIWA_MUSE_MODEL`, default `muse-spark-1.3-contributor` as the owner asked. Muse is chosen whenever `TIWA_MUSE_API` is set; otherwise Claude (`LLM_PROVIDER=anthropic`) or the Fake. Note: Meta lists the `-contributor` model as used to improve Meta's products (`muse-spark-1.3` is not); prompts carry no personal data and money only with `money.view`, but the host's free-text description is sent. Switching is one env var.
- Why: owner choice of provider and model.
- Affects: packages/ai (MusePlanDrafter, planDrafterFromEnv), packages/config env, .env.example.

- ID: D-X33
- Status: LOCKED (owner, 2026-11-02)
- Decision: Hosts can create any kind of event. When a type is not listed, "Something else" asks for a name (2–60 chars) and a format; the event uses that format's hidden `custom_*` template (generic checklist, budget split and vendor categories) and stores the name in the new `Event.typeLabel` column. `eventTypeLabel()` in packages/config is the single place that resolves what to call an event's type (custom name, else template label), and Plan with AI uses it too. Event creation is a focused full-screen flow (no app navigation; X returns to /events). Roles are shown everywhere in the app frame: colour-coded role badge (host = brand, planner = accent, vendor = warning), "Planner workspace" / "Vendor workspace" under the wordmark, an account menu with Settings and Sign out (sidebar footer on desktop, avatar in the mobile top bar), a role-coloured welcome header on /home, and a new /more page (the mobile "More" tab previously 404ed) with every section and a Sign out button.
- Why: owner request: event types must not be limited to the list; vendors and planners could not tell their dashboards apart; there was no way to sign out.
- Affects: packages/config (custom templates, eventTypeLabel, customEventType), packages/db (Event.typeLabel + migration), packages/core (createEventDraft customLabel/format), packages/ui AppShell (account, accountCompact, roleLabel), apps/web onboarding, /events/new, /home, /more, app-frame, account-menu.
