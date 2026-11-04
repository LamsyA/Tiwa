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

- ID: D-X34
- Status: LOCKED (owner, 2026-11-02)
- Decision: A business can publish its public profile at any time, even with an empty profile; `publishProfile` no longer enforces profile + 6 photos + 1 package (replaces the UF-13-1 publish gate). The checklist stays as guidance ("finish these any time; complete profiles get more enquiries"). Sign-out is also in the marketplace top bar (avatar menu for signed-in users, "Sign in" link otherwise).
- Why: owner request so new vendors can go live straight away.
- Affects: packages/core marketplace/profile.ts (+ tests), apps/web business profile copy, marketplace-frame.

- ID: D-X35
- Status: LOCKED (owner, 2026-11-02)
- Decision: Orders are tracked as one list for both sides. `packages/core/src/orders/tracker.ts` folds quote requests, quotes and bookings into one row per order at its furthest stage (requested → quoted → booked (payment due) → confirmed → delivered → completed; cancelled/declined/expired = closed). Vendors see their clients (`vendorOrders`); hosts and planners see the businesses across their events (`myEventOrders`, `eventOrders`). Shown on /orders (new nav item for every role; vendor tab bar swaps Bookings for Orders), on every home dashboard, on the event vendors page and the event overview. Businesses are findable by name or @handle (slug) in marketplace search and in a new inbox "New chat" lookup (`findBusinesses`), so anyone can message a vendor without browsing the marketplace; ties in the default sort go to the newest business and a "Just joined" strip surfaces new listings.
- Why: owner request: vendors could not see who asked or booked them, booking status was hard to follow, and vendors were hard to find and message.
- Affects: packages/core orders + marketplace/search + shortlist, packages/ui shell nav, apps/web /orders, /home, /inbox, event vendors, compare, overview.

- ID: D-X36
- Status: LOCKED (owner, 2026-11-02)
- Decision: A guest added by hand must have a valid email; phone is optional. Anyone RSVPing through the shared link gives name + email (phone optional) and the email is stored on the guest. Bulk paste/CSV/contacts still import rows without email (with warnings) so long lists never drop people; the invites page flags guests with no email or phone. Locally (EMAIL_PROVIDER=fake) invite emails go to Mailpit and the invites page says so; real delivery needs EMAIL_PROVIDER=resend + RESEND_API_KEY.
- Why: owner request so invitations and updates can always reach guests.
- Affects: packages/core guests.ts + invites.ts (+ tests), add-guest dialog, public RSVP form, invites page, e2e guests/invites specs.

- ID: D-X37
- Status: LOCKED (owner, 2026-11-02)
- Decision: Chat works like WhatsApp. (1) Messages cannot be deleted (core `deleteMessage` refuses; the Delete action is gone); authors can still edit within 15 minutes. (2) Any message can be replied to: the reply carries `replyToId` and shows a quoted preview (author + text, masked the same way). (3) Presence: `User.lastSeenAt` is refreshed by the open chat every 20 s through `/api/chat/presence`; the header shows "typing…" (existing live signal), else "online" (seen in the last 60 s; a business is online when any team member is), else "last seen …". (4) Every new message (and the first message of a new conversation) creates a bell notification for each recipient via `notifyNewMessage` (push per preferences), one unread entry per conversation, skipped for muted chats, preview uses the masked text. (5) Contact masking no longer treats dates or clock times (2026-11-03, 03/11/2026, 14:30) as phone numbers.
- Why: owner report: dates were masked as "••••", deletion should not be possible, replies/online/typing wanted, notifications were not arriving.
- Affects: packages/core chat (masking, threads, inbox, presence, notify-message) + tests; packages/db User.lastSeenAt migration; apps/web chat components, inbox actions, /api/chat/presence.

- ID: D-X38
- Status: LOCKED (owner, 2026-11-02)
- Decision: (1) Hosts can set a guest's reply by hand (Coming / Maybe / Not coming / No reply) from the guest list; plus-ones are capped at the allowance and cleared on decline. (2) The invite composer offers ready-written messages (three per kind) with each guest's name and personal link filled in automatically; editing is optional and placeholders are inserted with a tap. (3) Run-of-show items have `isPublic`; public items (or the public programme when none are marked) show to guests on `/e/{slug}/agenda`, which opens on the event's first day in its time zone and refreshes every 30 s; titles and times only. (4) The event overview drops the duplicate tab strip and shows every section as its own grid. (5) Public vendor profiles are cached with BigInt/Date tagging, since the data cache stores JSON.
- Why: owner report: the vendor profile crashed (BigInt in cached profile), tabs were repeated, hosts couldn't record replies, typing {name}/{link} per message was painful, and the event-day page wasn't usable by guests.
- Affects: packages/core guests (setGuestRsvp), day (isPublic, agenda.ts) + tests; packages/db RunItem.isPublic migration; apps/web guests, invites composer, day page/editor, /e/[slug]/agenda, overview, marketplace loader.

### 2026-11-02 — Ratings computed on read, no roll-up job
- ID: D-X39
- Status: AGENT (corrected: plan P14-T01 said "rating roll-up job" for a reason)
- Decision: Hourly `reviews/rollup-ratings` writes the cached profile columns (`ratingAvg` only at 5+ reviews per REV-05, plus `ratingCount`/`completedBookings`) that marketplace search sort/filter and the public score read; `vendorRating()` stays as the shared computation the job calls. On-read alone would have left search permanently unrated.
- Why: the search and public profile read cached columns, so the cache must be fed; hourly is fresh enough for reputation.
- Affects: packages/core/src/reviews, apps/worker rollup-ratings, marketplace search/profile, BUILD_PLAN P14-T01.

- ID: D-X39
- Status: LOCKED (owner, 2026-11-02)
- Decision: Booking starts from the vendor. (1) Every vendor profile has "Request a quote": pick the event (pre-selected when you came from an event), the service (the vendor's categories, or any category if they haven't set one), a note and an optional budget; the brief (date, venue, guests) is added on the server. The shortlist → category page path stays for asking several vendors at once. (2) `requestQuotes` accepts any category for a published vendor with no categories yet (D-X34 lets them publish early). (3) Vendors can decline a request from their quotes inbox; requests show readable service, date, venue, guests and the host's note. (4) The quotes inbox shows a warning when a section fails to load instead of hiding it. (5) Until card checkout (P8), the booking payments note says payment is made directly and confirmed by the vendor.
- Why: owner report: booking "doesn't work" on the frontend — the profile said "Quote requests open with bookings — check back soon", the only route was hidden behind shortlist + category page, and vendors without categories could never be asked.
- Affects: packages/core quotes/requests (+test); apps/web vendor profile page, public-profile, quote-request-dialog, marketplace actions, quotes inbox + decline-enquiry, payments note; e2e/quotes.spec.ts.

### 2026-11-02 — Change requests say what changed; vendors can ask for more money
- ID: D-X40
- Status: LOCKED (owner, 2026-11-02)
- Decision: (1) A change request is shown to whoever decides as a line-by-line summary (`describeChange`: items added / removed / "qty × price → qty × price", date, slot and note moves, old → new total and the difference) plus the asker's message, never a bare "v2 · Accept / Reject". (2) Vendors get their own booking page `/bookings/[id]` (scope with prices, paid / awaiting / still to pay, payments to confirm, version history, chat link) with "Request a change or extra payment" → "Add an extra charge"; it uses the same PROPOSED-version flow, so the host must accept before the total moves. (3) Accepted increases go on the next unpaid milestone (SCHEDULED or PENDING_PAYMENT) or a new "Change vN" milestone due now; decreases come off unpaid milestones, latest first, without creating empty rows. (4) `booking.change_requested` and `booking.change_declined` now notify the other side / the asker; booking notifications link to each side's own booking page. (5) One pending request at a time: the request button hides while one waits.
- Why: owner report: on the vendor side a host's change request showed only Approve/Reject with no detail, and vendors had no way to ask for more money.
- Affects: packages/core bookings/changes (+tests); apps/worker notify-topics/topics (+test); apps/web change-dialog, components/bookings/change-summary, app/bookings/[bookingId], quotes change cards, bookings list, orders board links, host booking page (versions, messages, files tabs); e2e/quotes.spec.ts.

### 2026-11-03 — P15: one-prompt AI invites and updates
- ID: D-X41
- Status: LOCKED (owner, 2026-11-03)
- Decision: P15-T05 becomes "one-prompt AI invites and updates". The host or planner types one prompt; AI drafts the message (with `{name}`/`{link}` placed automatically), proposes the audience (all / not replied / coming / group / selected) and the invite-or-update type, and shows one review card. A single **Send to N guests** tap sends it through the existing batch sender. Rewrite options: shorter, formal, Pidgin. AI-06 still holds: nothing is sent without that tap. Gated by `ai.enabled` and `guests.manage`; the prompt context excludes contact details.
- Why: owner request: hosts with many guests should not write or send invites and updates by hand.
- Affects: BUILD_PLAN P15-T05, PRD AI-04, user_flow UF-27 (steps 3, checks 4–6).

### 2026-11-03 — AI runs on Meta Muse only; P15 completed
- ID: D-X42
- Status: LOCKED (owner, 2026-11-03)
- Decision: (1) Meta Muse Spark (Meta Model API, `TIWA_MUSE_API`) is the only real AI model. The Claude adapter and `@anthropic-ai/sdk` are removed, and `LLM_PROVIDER`/`LLM_API_KEY` are gone. Without a Muse key every feature uses deterministic Fakes. (2) `packages/ai`: one `MuseClient` (JSON mode, per-feature `max_tokens`, 60 s timeout, phones/emails stripped from every prompt, usage callback); versioned prompts in `prompts/*.ts`; Zod-checked outputs. (3) Usage: one `AiUsage` row per call (no prompt text); daily caps per user and per event (`AI_DAILY_TOKENS_PER_USER` 300k, `AI_DAILY_TOKENS_PER_EVENT` 600k) checked before each call. (4) `aiEventContext` checks the flag and both permissions as the actor, and hides amounts from members without money access or when a planner hides vendor prices. (5) New features, all confirm-before-change (AI-06): budget split (Apply uses `setAllocations`), quote comparison (read-only), guest-count impact list (read-only), Moments alt text (10-minute worker sweep that only fills empty alt text).
- Why: owner request: finish P15 and use Muse, not Claude.
- Affects: packages/ai, packages/core/src/ai (+tests), packages/db AiUsage migration, packages/config env, apps/worker ai-captions job, apps/web money/vendors/guests/plan/invites AI UI, arc.md.

### 2026-11-03 — Live listings, vendor calendars, planner pipeline and invoices, premium pass
- ID: D-X43
- Status: LOCKED (owner, 2026-11-03)
- Decision: (1) Business onboarding creates a published BusinessProfile, so a new planner or vendor is findable by name at once (D-X34 already allowed publishing an incomplete profile); existing businesses without a profile were backfilled only for the owner's "Temmy". (2) Accepting a quote blocks the vendor's calendar on the service date (the quote's date, else the event's start date in its time zone) for venues and for one-event-a-day services (`DATE_EXCLUSIVE_CATEGORIES` in config: venue, photography, videography, DJ, live band, MC, makeup, sound and lighting, AV, speakers, kids entertainment); a second booking that day is refused; caterers and similar stay open. Cancelling an event frees its vendors' dates. (3) Vendor profiles show a six-month availability calendar and tell a host coming from an event whether the vendor is free on that date; the quote-request dialog shows the same. (4) Venues show photos: the venue's own space photos first, else the four stock venue pictures (with a note). (5) Planner `/pipeline` is a working board (drag between stages on desktop, "Move to" menu on phones and keyboards; closed leads reopen as New first). Invoices are rebuilt: client picker, multiple lines entered in money, not kobo, errors shown, a printable invoice page. (6) Notifications accept Better Auth's non-UUID user ids (they were silently failing for real users), and email templates declare the automatic JSX runtime so worker emails render in dev. (7) UI: slimmer iOS-style Switch app-wide; premium guest invite page (still zero client JS); event overview in a two-column layout with uniform cards; money chart and guest filters tidied. (8) Web unit tests force fake email/SMS/WhatsApp whatever `.env` selects.
- Why: owner report: Temmy not in search, calendars not blocked by bookings, planner invoices/pipeline not working, venues without photos, toggles and several host pages looked unpolished.
- Affects: packages/core onboarding, bookings/accept (+calendar test), events/commands, marketplace/venues, messaging/notify; packages/config vendor-categories; packages/messaging templates; packages/ui Switch; apps/web pipeline, clients, invoices, venues, vendor profile, availability calendar, invite page, event overview, money, guests.

### 2026-11-03 — Planners publish when ready; planner profile details
- ID: D-X44
- Status: LOCKED (owner, 2026-11-03)
- Decision: Supersedes D-X43 (1). Sign-up creates a **draft** (unpublished) business profile; planners and vendors publish or unpublish from Business profile, where the Publish button now sits at the top and is never gated by completeness. Planners get "Business profile" in their menu and a planner version of the details form: specialties (`PLANNER_SPECIALTIES` in config: weddings, traditional, birthdays, corporate, conferences, funerals, religious, reunions, concerts, kids, destination), about you and your team, fees from, and how you charge. Only the city is required; vendors still need at least one service category. `DateText` formats date and time separately and joins them itself, because the combined ICU joiner differs between server and browser ("at" vs ",") and caused hydration errors.
- Why: owner request: planners decide when to go live, need a place to fill their details, and a hydration error on dates.
- Affects: packages/config vendor-categories; packages/core onboarding, marketplace/profile + public (+tests); packages/ui format (DateText), shell nav; apps/web business/profile.

### 2026-11-03 — Host next steps and side-by-side quote compare
- ID: D-X45
- Status: LOCKED (owner, 2026-11-03)
- Decision: The event overview shows a "Your next steps" checklist (budget, plan, vendors, guests, invites when the event uses them, plan the day) read from real data by `eventReadiness`, so steps tick themselves; it hides once everything is done or the event is closed/cancelled. Each vendor category with two or more live quotes gets a compare table: totals (lowest crowned), first payment, number of payments, every item any vendor lists (gaps shown), cancellation terms and expiry. Hosts pin the quotes they like and can narrow to pinned only; pins are a per-device convenience in browser storage, accepting still happens on the quote card. Automatic invite reminders, event close with reviews, and the day/check-in e2e specs already existed (remindersEnabled defaults on), so nothing new was built for those.
- Why: owner request to make the host side guide first-time hosts and compare vendors before booking.
- Affects: packages/core events/readiness (+test); apps/web event overview, vendors/[category] page + compare table, messages.

### 2026-11-03 — Vendor earnings, payout account, quotes from packages
- ID: D-X46
- Status: LOCKED (owner, 2026-11-03)
- Decision: (1) Vendor Bookings opens with an earnings panel: earned this month (vs last month), upcoming and overdue amounts, and a six-month bar trend, read from milestone states per currency (never summed across currencies) until the ledger exists. (2) Payout bank account per Backend.md `BankAccount`: org OWNER only (`org.bank.manage`), bank picked from `BANKS` in config (NG list with NIBSS codes, 10-digit NUBAN check), and only the last 4 digits are stored; with the fake provider the account stays "not yet verified" until a real provider's name lookup. The business checklist's bank step is now live. Migration `20261103130000_bank_account` was applied with `db execute` + `migrate resolve` because an older migration's checksum differs locally and `migrate dev` wanted a full reset; its auto-generated DROP INDEX lines for the hand-written trigram/availability indexes were removed. (3) The quote builder offers the vendor's saved packages (same currency): picking one fills the price line and itemises what it includes. Existing quotes on that page show money and translated status instead of raw kobo/status codes. Manual date blocking, verification upload and review replies already existed.
- Why: owner request for vendor earnings, payouts setup and faster quoting.
- Affects: packages/config banks; packages/db schema + migration; packages/core payments/earnings + bank (+tests), marketplace/profile checklist, orgs/members listMyOrgs; apps/web bookings, business/profile, quotes/[requestId], messages.

### 2026-11-03 — Planner: client to event, fee agreement, Today, branded documents
- ID: D-X47
- Status: LOCKED (owner, 2026-11-03)
- Decision: (1) A planner's own events now belong to their planner org: `createEventDraft` sets the planner org on the creator's HOST row, and migration `20261103140000_planner_engagement` backfills existing ones (before this the planner dashboard, Today and team views missed events the planner created). (2) "Start their event" on a client creates a draft event named after the client, links it (`Event.clientId`), marks the lead Won and opens the wizard; the client page lists their events. (3) Planning fee on the event's Money page: a share of the budget (bps) and/or a fixed fee with terms (`Event.plannerFeeBps/plannerFeeMinor/plannerFeeNote`); the host sees it, only the event's planner edits it; the total is computed from the planned budget. (4) `/today` for planners (in the menu): tasks due by tonight or overdue, today's run-of-show, and payments due within 7 days across every event, in four queries regardless of event count. (5) Business logo upload (ADMIN+, image bytes checked, public redirect route) and branded proposals and invoices with logo or monogram; "Download PDF" opens a chrome-free print view that uses the browser's Save as PDF (no PDF library or worker, as for the budget). The proposal page was rebuilt: it passed an onClick from a server component and showed raw kobo. (6) Vendor "Payouts" menu link pointed at a non-existent /payouts and now opens the payout section. Per-event staff assignment already existed (`assignStaffToEvent`, /team); the 10-event home speed target is still unmeasured.
- Why: owner request for the planner side.
- Affects: packages/db schema + migration; packages/core events/commands, planner/engagement (+test), orgs/logo (+test); packages/ui shell nav; apps/web clients, today, invoices, proposals, business/profile, events/[id]/money, components/documents, api/org-logo, messages.

### 2026-11-03 — Phone and Google sign-in shown as "Coming soon"
- ID: D-X48
- Status: LOCKED (owner, 2026-11-03)
- Decision: Email magic link is the only live sign-in for now. Phone codes and Google stay on the login/signup page but are disabled with a "Coming soon" label, and email is the default. The server decides (`/api/auth/providers` via `authMethods`): phone needs `AUTH_PHONE_ENABLED=1`, Google needs `AUTH_GOOGLE_ENABLED=1` plus its credentials; `/api/auth/otp/send` refuses with FEATURE_DISABLED while phone is off. The e2e server (fake providers + test hooks) keeps phone on so the suites still sign in. Termii was tightened for later: `TERMII_CHANNEL` (default `dnd`, reaches DND numbers) and Termii's own refusal reason is surfaced; the account has ₦30 and no sender ID, so it stays off. WhatsApp Cloud API codes are the chosen next step once a real number and business verification are ready.
- Why: owner request; no OTP channel with enough credit or a public-capable sender yet.
- Affects: packages/config env; packages/messaging sms (+test); apps/worker providers; apps/web auth-form, lib/auth-methods (+test), lib/senders, api/auth/providers, api/auth/otp/send, messages; .env.example.

### 2026-11-03 — Branded sign-in email
- ID: D-X49
- Status: LOCKED (owner, 2026-11-03)
- Decision: The magic-link email is a react-email template (`SignInEmail` in packages/messaging): Tiwa wordmark, brand gradient bar, one large button, expiry ("15 minutes, works once"), the raw link as a fallback, a "Didn't ask for this?" note, and a footer saying why it was sent. New addresses get "Welcome to Tiwa" / "Create my account"; existing ones get "Your sign-in link". Both HTML and plain-text parts are sent (better inbox placement). Table layout, inline styles and system/Georgia fonts only, so it renders the same in Gmail, Outlook and Apple Mail. Resend errors now include Resend's reason. Until a domain is verified in Resend, `onboarding@resend.dev` only delivers to the Resend account owner (olamide.adetula.1@gmail.com).
- Why: owner request for a premium, trustworthy login email.
- Affects: packages/messaging templates/sign-in (+test), index; apps/web lib/auth, lib/senders.

### 2026-11-03 — Username and password sign-in; Google ready to switch on
- ID: D-X50
- Status: LOCKED (owner, 2026-11-03)
- Decision: Supersedes D-X48 for the default method. "Username & password" is the first and default option on login and signup (Better Auth `emailAndPassword` + `username` plugin, passwords hashed with scrypt, 8–128 characters). Signup asks for name, username (3–30: letters, numbers, dots, underscores; unique, case-insensitive) and password; email is optional, and without one a private placeholder (`<username>@user.tiwa.local`) satisfies Better Auth's unique-email rule. Login takes a username or an email. No email verification until a sending domain exists. Better Auth's error codes are shown in our own words (taken username, wrong password, short password…). Email magic link stays; phone stays "Coming soon". Google is registered only when `AUTH_GOOGLE_ENABLED=1` and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set; callback `{APP_URL}/api/auth/callback/google`. Migration `20261103160000_username_password` adds `User.username` (unique) and `displayUsername`. Password reset is not built yet (needs a verified email domain).
- Why: owner request so anyone can use the app without SMS/email delivery limits.
- Affects: packages/db schema + migration; apps/web lib/auth, lib/auth-client, components/auth-form, messages; e2e/password-auth.spec.ts.

### 2026-11-03 — Onboarding role fix; forgot password
- ID: D-X51
- Status: LOCKED (owner, 2026-11-03)
- Decision: (1) Onboarding is "done" only when `User.onboardedAt` is set (picking host, or creating a planner/vendor business) or the user is already in an org or on an event. Having a name no longer counts: Google and password sign-ups arrive with one and were skipping "What brings you to Tiwa?" and landing as hosts. Migration `20261103170000_user_onboarded_at` backfills users who own/joined a business, are on an event or created one. The host step pre-fills the name they already gave. (2) Forgot password: "Forgot password?" on login → `/forgot-password` takes a username or email (rate-limited like login, same reply whether or not it matches, accounts without a real email can't receive a link) → branded reset email (the sign-in template's `purpose: 'reset'`), link valid 1 hour and single-use → `/reset-password` sets the new password and signs the account out everywhere.
- Why: owner bug report and request.
- Affects: packages/db schema + migration; packages/core accounts/onboarding (+test); packages/messaging sign-in template (+test); apps/web onboarding, lib/auth, lib/otp, api/account/forgot-password, forgot-password, reset-password, components/password-reset-forms, auth-form, messages; e2e/password-auth.spec.ts.

### 2026-11-03 — SMTP email (Gmail) via Nodemailer
- ID: D-X52
- Status: LOCKED (owner, 2026-11-03)
- Decision: `EMAIL_PROVIDER=smtp` sends all app email (sign-in, password reset, invites, notifications) through Nodemailer with `SMTP_HOST/PORT/USER/PASSWORD` (Gmail + app password: tiwa.app.mail@gmail.com). It is a bridge until a domain is verified in Resend (free tier: 3 domains, 3,000/month, 100/day); switching back is an `.env` change. Same react-email templates, pooled connection (3), HTML + plain text. `EMAIL_FROM` must be the Gmail address (Gmail rewrites other senders). Limits: about 500 emails a day, sender shows as @gmail.com.
- Why: Resend's test sender only reaches the account owner; owner wants every user to receive mail now.
- Affects: packages/messaging smtp (+nodemailer 7.0.9); packages/config env; apps/web lib/senders, lib/auth; apps/worker providers; .env.example.

### 2026-11-03 — Reset links last 10 minutes; reset errors are explicit; SMTP hardening
- ID: D-X53
- Status: LOCKED (owner, 2026-11-03)
- Decision: Supersedes parts of D-X51. (1) Reset links expire after 10 minutes (token, email copy, page text). (2) Forgot password now says plainly when no account matches (404), when the account has no email (400), and when the email could not be sent (502); the owner chose clarity over hiding which accounts exist. Better Auth swallows errors from `sendResetPassword`, so the hook records each send's outcome (`lib/reset-outcome`) and the route reads it. The page aborts after 25 s with a message instead of spinning. (3) SMTP: connection/greeting/socket timeouts, and one retry on a fresh connection for connection-level errors (a pooled Gmail socket went stale after the machine changed networks: EADDRNOTAVAIL). Mail now carries Reply-To, a unique X-Entity-Ref-ID and Auto-Submitted headers. Spam placement is mainly from the new Gmail sender and localhost links; it improves with "Not spam" marks and goes away with a real https domain.
- Why: owner report (spam, endless spinner, long expiry).
- Affects: packages/messaging smtp; apps/web lib/auth, lib/otp, lib/reset-outcome, api/account/forgot-password, components/password-reset-forms, messages; e2e/password-auth.spec.ts.

### 2026-11-03 — App-wide styling pass
- ID: D-X54
- Status: LOCKED (owner, 2026-11-03)
- Decision: The 68 screens and components still on the early plain look were converted to the premium patterns in one consistent pass: section headings use the display face (bold, tight tracking); `<Card className="p-4">` drops its extra padding (Card already pads itself, so those cards were cramped and uneven); plain underlined links become brand-coloured links with hover underline; small `rounded-md`/`rounded-lg` boxes become `rounded-xl`/`rounded-2xl` with softer borders. Class-only changes, so labels and roles are untouched. The "next steps" card now says "steps complete" so it no longer reads like the task counter. Two plan e2e assertions written before D-X31 were updated (exact task-button name, dialog-scoped due date, "Missed · date" wording).
- Why: owner request — not every page had the premium styling.
- Affects: 68 files under apps/web/app and apps/web/components; messages; e2e/event-plan.spec.ts.

### 2026-11-03 — Free hosting stack
- ID: D-X55
- Status: PROPOSED (owner chose the services; goes LOCKED once deployed)
- Decision: Web on Vercel Hobby (`apps/web/vercel.json` builds the monorepo with turbo); worker on a Render free web service from `render.yaml` (Docker image with ffmpeg; the Dockerfile now builds the worker's workspace packages in order, `.dockerignore` keeps secrets and build output out); a `/health` page (only when `PORT` is set) that answers 200 while Redis responds, pinged by cron-job.org every 10 minutes so Render never sleeps it, which also keeps the Layerbase free Redis (Valkey) out of hibernation; Postgres on Neon free; files on Cloudflare R2; email via Gmail SMTP. Settings live in `.env.production.local` (git-ignored) and each host's dashboard. Runbook: docs/runbooks/deploy-free-stack.md. Limits accepted: Vercel Hobby is non-commercial; Layerbase free caps 20 connections; keep-awake pings may breach free-host fair use; the free worker is slow for video.
- Why: owner request for a $0 stack.
- Affects: apps/worker health + index + Dockerfile; .dockerignore; render.yaml; apps/web/vercel.json; docs/runbooks/deploy-free-stack.md.

### 2026-11-03 — Never email placeholder or reserved addresses
- ID: D-X56
- Status: LOCKED (owner, 2026-11-03)
- Decision: Every real email sender (Gmail SMTP and Resend, web and worker) skips addresses that cannot receive mail: the auth placeholders `@phone.tiwa.local` / `@user.tiwa.local` and reserved test names (`.test`, `.example`, `.invalid`, `.localhost`, `.local`, example.com/net/org). They return a "skipped-placeholder" id instead of sending, so nothing bounces. Helper `isPlaceholderEmail` / `isDeliverableEmail` lives in packages/messaging (packages/config validates env on import, which broke messaging's tests). No data is deleted: placeholder accounts are valid; only sending to them was wrong. The 7 bounces came from running the worker container locally with the real `.env` during D-X55 testing, which drained queued notifications to test accounts through Gmail.
- Why: owner saw "Address not found" bounces; bounces hurt the sending account's reputation.
- Affects: packages/messaging email-address (+test), email, smtp (+test); apps/web lib/senders, lib/otp.

### 2026-11-04 — Redis TLS servername (SNI); production database ready
- ID: D-X57
- Status: LOCKED (owner, 2026-11-04)
- Decision: Every Redis client (10: web live/chat/rate-limit/health, worker queue/media/invites/CSV) now spreads `redisTls(url)` from packages/config, which sets `tls.servername` to the URL's host for `rediss://`. Layerbase routes connections by TLS servername and refuses them without it ("ERR TLS SNI required"); ioredis does not set it from a URL by itself. Production checks from this machine: Neon PostgreSQL 18.6 reachable through the pooled URL; all 34 migrations applied over the direct URL (74 tables, both hand-written indexes, citext + pg_trgm); Layerbase Redis 7.2.15 with `maxmemory-policy noeviction` (what BullMQ needs), first connect ~7.7 s while waking from hibernation.
- Why: the first live test against Layerbase failed.
- Affects: packages/config redis (+test); apps/web lib/live, lib/chat-live, lib/rate-store, api/health; apps/worker index, jobs/media, jobs/send-invite, jobs/csv-import.

### 2026-11-04 — 1 MB upload cap; live deploy (Render worker, Vercel web)
- ID: D-X58
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: One app-wide upload ceiling, `UPLOAD_MAX_BYTES` = 1 MB in `@tiwa/core/shared/upload-limit` (client-safe). Every per-feature limit (Moments photo/video, chat, documents, cover, logo, portfolio, space photos, verification, receipts, expense receipts, guest CSV) is wrapped in `capUpload()`, so the server rejects anything larger; the browser checks the same value. Photos are resized first (now 2048 px, WebP q0.78) and checked after resizing, so ordinary phone photos still fit. Hint and error strings say 1 MB. R2 set up from the CLI (both buckets, public r2.dev URL, CORS) and tested: put/get/delete on both buckets, public URL 200.
- Why: owner asked to keep free-tier storage small for now (500 KB–1 MB per file).
- Affects: packages/core shared/upload-limit (+test) and the 11 limit constants; apps/web gallery-uploader, resize-image, settings-forms, guest-dialogs, messages/en.json.
- Deploy: Render Blueprint `tiwa` → service tiwa-worker-cy5y (https://tiwa-worker-cy5y.onrender.com, /health 200, scheduled jobs running on Neon + Layerbase). Vercel project `tiwa`, root apps/web, address https://tiwa-events.vercel.app (tiwa and tiwa-app were taken), 28 env vars, GitHub connected. All set from the CLI; secrets never printed.

### 2026-11-04 — One production address (fixes Google state_mismatch)
- ID: D-X59
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: In production the proxy sends every other host (deployment URLs, tiwa-xi.vercel.app) to the APP_URL host with a 308, keeping path and query. The proxy now runs on all non-static paths; the signed-out redirect still covers only app pages.
- Why: Google sign-in started on another Vercel address set its state cookie there, then Google returned to tiwa-events.vercel.app without it: ?error=state_mismatch.
- Affects: apps/web proxy.ts, lib/proxy.test.ts.

### 2026-11-04 — Sign-in screens fit one screen
- ID: D-X60
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: Auth layout is exactly one viewport tall (h-dvh); the form column scrolls inside itself only when the screen is too short. Sign-in methods are a 2×2 grid with short labels (full "Continue with …" kept as the accessible name). Name and username sit side by side from sm up; hints shortened. New photo: the terracotta table setting (public/landing/auth.jpg). Fits with no scrolling at 390×844 and 1280×720 (login and signup); login also at 360×640. Password reset now refuses only accounts with no real email (placeholder domains); reserved test domains are skipped by the senders instead.
- Why: owner asked for a new image and everything on the login page to fit the screen.
- Affects: apps/web components/auth-layout, auth-form, messages/en.json, lib/otp.ts, public/landing/auth.jpg, e2e (exact Username label).

### 2026-11-04 — 20 demo businesses that book end to end
- ID: D-X61
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: `pnpm db:seed:demo` (apps/web/scripts/seed-demo-businesses.mts) creates 12 vendors (catering, small chops, cake, decor, photography, videography, DJ, live band, MC, makeup, sound and lighting, rentals), 5 venues with priced spaces (Lagos, Abuja, Ibadan, Port Harcourt) and 3 planners. Fictional but realistic names, bios, packages and naira prices; verified, published, availability confirmed, portfolio photos uploaded to object storage. Each has an OWNER who signs in with a username and the demo password (DEMO_BUSINESS_PASSWORD, default TiwaDemo2026!) so quotes can be answered. Idempotent on `demo-` slugs; re-runs keep any bookings made against them.
- Why: owner asked for 20 demo businesses that make booking work correctly on the live app.
- Affects: apps/web scripts/seed-demo-businesses.mts, package.json (db:seed:demo), e2e/demo-booking.spec.ts.

### 2026-11-04 — Sign-in photo cross-fade
- ID: D-X62
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: The desktop sign-in panel cross-fades three photos (table setting, lit hall, guests in gele) on an 18 s CSS loop, 6 s each. CSS opacity only (composited, no JS, no layout shift); only the first photo is priority, the other two load lazily. Phones keep one static photo to save data; reduced-motion users see the first photo only.
- Why: owner asked for a changing image without making the site slower.
- Affects: apps/web components/auth-layout.tsx, app/globals.css.

### 2026-11-04 — Host Money page; sign-in back to one sharp gele photo
- ID: D-X63
- Date: 2026-11-04
- Status: LOCKED (owner, 2026-11-04)
- Decision: (1) New `/money` page for the host sidebar item, which pointed at a route that never existed (404). It lists every upcoming and past event the person can see money on (budgetSummary enforces money.view), with planned, committed, paid and outstanding per event, totals grouped by currency, and a link to each event Money tab; empty, loading and error states included. (2) Sign-in panel returns to the single gele photo (replaces D-X62 cross-fade at owner request), now the full-resolution portrait original (Pexels #36808366, 2000×3000) served at quality 90 (images.qualities [75, 90]); Next resizes per screen so phones still get a small file.
- Why: owner reported the host Money page not working and did not like two of the three slideshow photos.
- Affects: apps/web app/money/*, messages/en.json (moneyHub), components/auth-layout.tsx, app/globals.css, next.config.ts, public/landing/auth-gele.jpg.
