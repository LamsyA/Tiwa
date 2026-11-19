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
- Decision: The Plan page drops the template timeframe groups ("12+ weeks before" …). It is one list the host controls: quick-add with an optional date, edit, delete (`deleteTask`), check off. The summary shows Done, Left and Missed (a dated task past its date and not done) with filters for each, and a catch-up prompt when something was missed. The template "Pick from suggestions" sheet is replaced by "Plan with AI" (PRD AI-01 / UF-27, pulled forward from P15 by owner request): the host describes their event, `draftPlan` asks a `PlanDrafter`  nothing is saved until the host ticks suggestions and taps Add (`addDraftedTasks`, AI-06). The prompt context carries no personal data and includes the budget only for members with `money.view` (UF-27-2). Behind flag `ai.enabled` (OFF in production by default).
- Why: owner — the timeframes and template suggestions felt generic; hosts without a planner need real, tailored help and a clear view of what is done, left and missed.
- Affects: packages/ai (new), packages/core (events/ai-plan, tasks.deleteTask), /events/[id]/plan, BUILD_PLAN P15 (T01/T03 partly built early), e2e create-event / event-plan.

### 2026-11-02 — AI planning runs on Meta Muse Spark
- ID: D-X32
- Status: LOCKED (owner, 2026-11-02)
- Decision: "Plan with AI" uses Meta Muse Spark through the Meta Model API (OpenAI-compatible `POST https://api.meta.ai/v1/chat/completions`, Bearer key, JSON mode, `reasoning_effort: low`, 8,000-token limit to leave room for reasoning). Key in `TIWA_MUSE_API`; model `TIWA_MUSE_MODEL`, default `muse-spark-1.3-contributor` as the owner asked. Muse is chosen whenever `TIWA_MUSE_API` is set; Note: Meta lists the `-contributor` model as used to improve Meta's products (`muse-spark-1.3` is not); prompts carry no personal data and money only with `money.view`, but the host's free-text description is sent. Switching is one env var.
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
- Decision: (1) Meta Muse Spark (Meta Model API, `TIWA_MUSE_API`) is the only real AI model.  Without a Muse key every feature uses deterministic Fakes. (2) `packages/ai`: one `MuseClient` (JSON mode, per-feature `max_tokens`, 60 s timeout, phones/emails stripped from every prompt, usage callback); versioned prompts in `prompts/*.ts`; Zod-checked outputs. (3) Usage: one `AiUsage` row per call (no prompt text); daily caps per user and per event (`AI_DAILY_TOKENS_PER_USER` 300k, `AI_DAILY_TOKENS_PER_EVENT` 600k) checked before each call. (4) `aiEventContext` checks the flag and both permissions as the actor, and hides amounts from members without money access or when a planner hides vendor prices. (5) New features, all confirm-before-change (AI-06): budget split (Apply uses `setAllocations`), quote comparison (read-only), guest-count impact list (read-only), Moments alt text (10-minute worker sweep that only fills empty alt text).
- Why: owner request: finish P15 and use Muse.
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

### 2026-11-16 — Hire a planner: proposal requests and accept-to-hire
- ID: D-X64
- Date: 2026-11-16
- Status: LOCKED (owner, 2026-11-16)
- Decision: Hosts hire planners through the quote pipeline under one reserved category, `planning` (packages/config PLANNING_CATEGORY). A host requests a proposal from a planner profile ("Request a proposal": event, help needed — full, partial, day-of, consultation — note, fee budget) or from shortlisted planners; requests reach only published PLANNER orgs, other categories only VENDOR orgs. Planners get a Proposals inbox (/quotes) and write proposals with the quote builder in proposal wording (scope of work, payment plan, cancellation terms). The host reviews each proposal as a document (letterhead, planning fee, itemised scope, payment plan in real amounts with due dates, planner note, terms) and taps Accept & hire: a click-to-accept booking with milestones is created and, in the same transaction, the planner org owners/admins join the event as PLANNER (full preset, no member management). The event Vendors tab shows a "Hire a planner" panel: find planners, proposals waiting/ready, or "<planner> is planning this event" once hired. Implements PRD MKT-08 and the hire step of EVT-07.
- Why: owner asked for a seamless way for hosts to contract planners; before this, hiring was chat plus a manual member invite.
- Affects: packages/config vendor-categories; packages/core quotes/requests, quotes, overview, bookings/accept (+ planner-proposals.test 4/4); packages/ui shell (planner Proposals nav); apps/web planners/[slug], components/marketplace/proposal-request-dialog, events/[id]/vendors (panel), vendors/[category] (proposal-cards), quotes inbox and builder, messages/en.json; e2e planner-proposal (desktop + mobile), demo-booking made parallel-safe.

### 2026-11-16 — Planner workspace polish, host planner entry points, venue later
- ID: D-X65
- Date: 2026-11-16
- Status: LOCKED (owner, 2026-11-16)
- Decision: (1) Proposals inbox lists new requests first, each with the client budget; bookings and payments follow. (2) Quote/proposal builder redesigned: form + sticky live summary (total, fees, client budget with over/within amount, payment plan in real amounts); percentages typed as % (was raw basis points, e.g. 5000 for 50%), tax and service as %, due dates in words (was on_accept / days_before codes), default plan 50% deposit + 50% balance, default validity 14 days, message-to-client field, remove-line buttons, send disabled until valid. Brief shows the client budget and a readable date. (3) Host sidebar gains Find a planner and Find vendors; the event overview shows a Hire a planner card until a planner is on the event. (4) Event wizard: venue labelled optional with a note that booking a venue later fills it in. (5) A venue booked through Tiwa (quote accept or instant book) now fills that day of the event (venue · space, city) where empty; the date was already blocked on the venue calendar in the same transaction.
- Why: owner reported the planner could not see the host budget, totals and percentages looked wrong, the host could not find planners, and the venue felt mandatory at creation.
- Affects: apps/web quotes inbox, builder page + quote-builder, events/[id] overview, events/new wizard, messages/en.json; packages/ui shell; packages/core bookings/venue (attachVenueToEvent) + accept, venue.test.

### 2026-11-17 — Change requests reach the vendor or planner, full revise loop
- ID: D-X66
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: "Request changes" now completes its lifecycle. The host message is stored on the quote (Quote.changeRequest, changeRequestedAt; migration 20261117090000). The vendor/planner inbox brings a sent-back request back to the top with a "Changes requested" pill, the client message and a Revise button (before, an answered request left the inbox, so the change was invisible). The builder opens on the sent-back quote pre-filled with the message on top and updates it in place (updateQuote), then "Send revised …" re-sends it; each resend after a change request increments Quote.revision. While waiting, the host card shows "You asked for changes" with the message and only Decline; the revision arrives with a "Revised · vN" badge and the original request shown. Worker notifications added for quote.changes_requested (with the message, links to the builder) and quote.declined; quote.sent says "Revised quote received" for revisions. Lifecycle covered: request → send → request changes → revise → resend → accept & hire, or decline at any undecided step.
- Why: owner reported that requested changes never reached the planner.
- Affects: packages/db schema + migration; packages/core quotes/decisions, quotes (listEnquiries, getEnquiry, sendQuote) + planner-proposals.test; apps/worker notify-topics, topics; apps/web quotes inbox, builder page, quote-builder, vendors/[category] proposal-cards, quote-cards, page, messages/en.json; e2e planner-proposal (change loop), demo-booking.

### 2026-11-17 — Every proposal version on record, sent pop-up
- ID: D-X67
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: New QuoteRevision table (migration 20261117120000, backfilled from every quote ever sent): each send freezes that version (items, fees, totals, payment plan, terms, message, sender, time); the host change request is stored on the version it was about. quoteHistory() returns one shared record to the vendor/planner team and the host side of that event only (vendor-role participants and other events get NOT_FOUND; planner-hidden prices stay hidden). UI: a history timeline on host proposal and quote cards and on the planner builder page — version N sent (total, +/- change, lines added/removed/re-priced, expandable full version), changes requested (message, time), and how it ended (accepted with agreement link, declined, withdrawn, expired, or waiting). Sending closes the builder and returns to the inbox with a "Proposal sent" / "Revised proposal sent" pop-up (ToastProvider now mounted app-wide); the inbox gains a Sent list (status, version, total) linking to each history; a quote with the client shows as read-only with its history instead of an empty form.
- Why: owner wants every proposal change tracked, saved and visible to both parties later, and a clear confirmation after sending.
- Affects: packages/db schema + migration; packages/core quotes/history (new), quotes (sendQuote snapshot), decisions (change request on revision) + planner-proposals.test; apps/web layout (ToastProvider), components/quotes (proposal-history, sent-toast), quotes inbox, builder page, quote-builder, vendors/[category] page, proposal-cards, quote-cards, messages/en.json; e2e planner-proposal, quotes, demo-booking.

### 2026-11-17 — Price hiding never covers the host’s own planner
- ID: D-X68
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: The planner’s "hide vendor prices from the host" switch (EVT-12) now applies to vendor quotes only. The planner’s own planning proposal (category `planning`) always shows its amounts to the host, in proposal cards (compareQuotes) and in its history (quoteHistory).
- Why: once hired, a planner could switch prices off and the host would lose sight of the fee they agreed to pay that planner.
- Affects: packages/core quotes/decisions (compareQuotes), quotes/history + planner-proposals.test.

### 2026-11-17 — Proposals drive the planner pipeline; events cards; compact empty inbox
- ID: D-X69
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: Planner CRM clients are now linked to Tiwa hosts (Client.userId, unique per planner org) and planning requests to clients (QuoteRequest.clientId); migration 20261117150000 backfills clients and stages from existing requests. Pipeline stage follows the proposal automatically: request → ENQUIRY (creates the client, or reopens a LOST one), sent → PROPOSAL_SENT, host accepts → WON, host declines / planner declines the request / another planner is hired → LOST; WON is sticky. Pipeline cards and the Clients list show the event and a View proposal link; the client page lists every Tiwa proposal with status, version and total. Events list cards redesigned (cover photo or theme-colour gradient, date tile, countdown, type, role, progress bar). Planner inbox empty state is a compact "You’re all caught up" card with a profile prompt.
- Why: owner reported the pipeline did not move to Won on acceptance, was not linked to proposals, clients were not synced, and the events cards and empty inbox looked unpolished.
- Affects: packages/db schema + migration; packages/core planner/pipeline-sync (new), planner/clients, quotes/requests, quotes/quotes, quotes/decisions, bookings/accept + planner-proposals.test; apps/web events list, pipeline, clients list and detail, quotes inbox, messages/en.json; e2e planner.spec (exact link names).

### 2026-11-17 — Planner workspace design pass, third colour (teal)
- ID: D-X70
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: A third brand colour, deep teal (--teal / --teal-strong / --teal-soft, light and dark; Tailwind `teal`), complements terracotta and gold for planning, progress and info accents. Shared StatCard and EmptyState are compact app-wide (smaller padding and type, truncation instead of overflow; StatCard gains optional icon and tone). Role banner (host, vendor, planner homes) is slim with optional quick actions. Planner Home rebuilt: banner with New event / Add client, three compact tappable tiles (overdue tasks, payments due, open enquiries — three across on phones), This week with date tiles and countdown pills, pipeline as a four-colour bar with a legend, compact empty vendor orders. Calendar is a month-grouped agenda (shared Agenda component) with date tiles, countdowns and past items dimmed. Today banner smaller with a teal glow. Clients stage tiles four across on phones; invoice totals three across; Get listed checklist two per row on phones. Team page shows member names, contacts and role pills instead of raw user ids (bug), with assignments as rows with staff-count pills; the assign form lists names.
- Why: owner asked for a premium, compact, interactive planner UI with a third colour, no oversized or overflowing cards, arranged correctly on phone and desktop.
- Affects: packages/ui tokens.css, tailwind-preset, card (StatCard), states (EmptyState); apps/web home, today, calendar (+components/agenda), clients, invoices, team (+assign-form), business/profile, components/orders/orders-board, messages/en.json; e2e planner.spec.

### 2026-11-17 — Hired planner continues the host’s event; host keeps the plan; premium light mode
- ID: D-X71
- Date: 2026-11-17
- Status: LOCKED (owner, 2026-11-17)
- Decision: (1) Hosts keep full plan rights after hiring a planner (PRD 2.1); the Plan page shows "<planner> is planning this event with you" so the shared ownership is clear. (2) Accepting a planner proposal links the host’s event to that planner’s CRM client (Event.clientId; migration 20261117180000 backfills accepted hires). The client page now offers "Continue <event>" for the client’s existing events; "Start their event" only leads when there is none, otherwise it is a quiet "Plan a different event". (3) Light mode: warm ivory page (--bg #f8f6f2), white cards (--surface), warm hairlines, deeper warm shadows, a faint fixed terracotta/teal glow at the top of every page, translucent white sidebar. Dark mode unchanged. All WCAG contrast pairs still pass.
- Why: owner asked whether hosts should still edit the checklist after hiring, reported duplicate events from "Start their event", and found light mode flat.
- Affects: packages/core bookings/accept + planner-proposals.test; packages/db migration; packages/ui tokens.css, shell; apps/web globals.css, clients/[id] page + start-event, events/[id]/plan page, messages/en.json.

- **D-X72 (AGENT, 2026-11-17):** Compact cards everywhere. Card is one box (no double padding, page classes apply); StatCard tighter; event overview, readiness steps (min-w-0, no phone overflow), home tiles and order rows slimmed; money totals merged into one divided summary strip with small export pills; global spacing sweep (p-8→p-6, py-14→py-8, gap-8→gap-5).

- **D-X73 (AGENT, 2026-11-17):** The guest list is the host's. New `Event.plannerManagesGuests` (default off); PLANNER and PLANNER_STAFF `guests.manage` is now a tier grant, set from that switch in loadEventAccess (planners still view guests and scan check-in). Host-only toggle in event Settings. Plan tab: task rows show status, priority, due and owner chips with an edit button; compact summary.

- **D-X74 (AGENT, 2026-11-17):** Client page shows one Continue (live event before a draft). The payee (vendor, or a hired planner on their own booking) can confirm or reject an offline payment from the event booking Payments tab, not only from /bookings. Upload queue resumes on reconnect and its backoff no longer resets. Stale e2e markers updated (plans start empty; Money heading). Open: guest uploads stall after the first 3 on throttled 3G (moments UF-10).

- **D-X75 (AGENT, 2026-11-17):** Event Money drops the Income tab (sponsor or other income can still be logged as a contribution). Inbox and Chat are separate: the nav item for conversations is now "Chat" (route /inbox kept); "Inbox" is the bell's notifications page for requests, proposals and payments.

- **D-X76 (AGENT, 2026-11-17):** From the wedding story test: hired-planner card links to the planner agreement and payments; a planner proposal notifies as "Proposal received" and opens the proposal; planning bookings read "Planner" in order lists; overview panel titles no longer truncate; unallocated spend is no longer flagged "Over budget".

- **D-X77 (AGENT, 2026-11-17, replaces D-X36 for manual adds):** A guest added by hand needs an email OR a phone (shared-link RSVP still asks for email, where the pass is sent). Accepting a quote for a date the vendor is already booked now says so plainly (action results carry the domain `reason`), and the vendor sees a warning while quoting a booked or blocked day. Activity feed reads as sentences with the person's business. Bookings with no matching budget line get a line of their own service (Venue, Photography, Planner) instead of "Other"; "Over budget" only shows on lines with a budget. Upload signing requests time out after 20 s. Open: guest uploads can still stall when the connection drops mid-request (Uppy S3 requests have no timeout in signRequest mode).

- **D-X78 (AGENT, 2026-11-17):** Moments uploads go up as one signed PUT per file (every file is at most 1 MB) through @uppy/xhr-upload with a 30 s no-progress timeout, replacing @uppy/aws-s3 multipart whose requests had no timeout and hung the queue when the connection dropped. Serwist reloadOnOnline is off (it reloaded the page on reconnect and wiped uploads). A sweep restarts files a browser dropped silently (WebKit). A refused upload stays listed with its reason (e.g. gallery full) instead of vanishing; one failed file no longer blocks the batch; the success line shows only when every file is done. The live pill refreshes album counts. Stale moments e2e assumptions fixed. Open: MOM-14 host guestbook list showed stale content once on mobile WebKit.

- **D-X79 (AGENT, 2026-11-17):** Vendor side aligned with the planner workspace. Event Vendors page: compact status rows per service (Quote waiting · name → Review, Booked/Confirmed · name, N shortlisted, Not started) replace 15 photo tiles that said "Nothing shortlisted yet" while a quote waited. Vendor home: hero actions, "Coming up" and funnel panels. Bookings: one row per booking; day-of controls only on the day for a confirmed booking (was on every booking, twice). Quotes: duplicate bookings money list removed; Sent shows the latest 8 with a link to Orders; rows no longer collapse on phones. Calendar agenda sorted by date, no fake "1:00 AM" for date-only jobs, far countdowns in months/years. Packages editor fits phones.

- **D-X80 (AGENT, 2026-11-17):** No stock pictures for businesses: search, venue search, compare and public profiles show the business's own photos (portfolio, else venue space) or a branded "No photos yet" placeholder with its initials. Requests are laid out per kind of service (venue booking, coverage, food order, performance, styling, planning proposal, other service): own icon, accent, key facts (hours and capacity for venues, portions and serving time for food…), a "before you quote, confirm" checklist, inbox cards worded for the kind, and one-tap suggested quote lines (per-guest lines start at the guest count).

- **D-X81 (AGENT, 2026-11-17):** Every image upload in the app ends at or under 800 KB: the browser re-encodes anything larger at 95% quality (at most a 5% reduction) and, if still too big, steps down only the pixel size; files already under 800 KB go up untouched; Safari falls back to JPEG at the same quality. The server refuses images over 800 KB (image-only uploads via capImage; mixed uploads via refineImageSize), documents keep the 1 MB cap. Business logos now show on public profiles, search and venue cards. Worker handlers added for site_visit.requested/confirmed (were "unknown job", so nobody was notified). Open: moments P5-T12 expiry banner absent on the long-lived demo gallery.

- **D-X82 (AGENT, 2026-11-17):** engines.node pinned to "22.x". Vercel ignored the ">=20 <24" range and built on Node 26; with a cached build the Prisma client was not regenerated and @tiwa/core failed with "Cannot find module @tiwa/db" (two failed production deploys). Local Node 23 only warns.

- **D-X83 (AGENT, 2026-11-17):** Server fallback for photos a browser cannot read (iPhone HEIC on Chrome/Android): /api/uploads/convert (HEIF only by magic bytes, ≤ 4 MB, rate-limited, nothing stored) returns a 95%-quality JPEG via heic-convert (sharp builds do not decode HEVC), then the on-device compressor takes it under 800 KB. Tested: 1.5 MB HEIC on Chrome stored at 593 KB.

- **D-X84 (AGENT, 2026-11-17):** Guest-count change, the planner showcase workflow. "Guest count changed" (Guests and Vendors pages, event.edit only) previews every booked line whose quantity equals the current count (portions, chairs…), with the price difference and new balance per vendor; sending updates the event count and raises a booking change request per picked vendor (reason "Guest count changed from X to Y"). Each vendor gets a stateless HMAC approve link (/c/<token>, 14 days, decides only that version, refused once decided) shared via a WhatsApp deep link or copied text; the signed-out phone page shows what changes, new total, paid and new balance, and Approve/Decline. Approval runs the normal acceptChange as the vendor owner, so milestones re-balance for both sides. Real WhatsApp delivery still needs Meta Cloud API templates; the deep link works today.

- **D-X85 (AGENT, 2026-11-17):** "Send all on WhatsApp" step-through after a guest-count change: one big button opens the next vendor's chat with the message ready (browsers only open WhatsApp from a tap); returning to Tiwa marks that vendor sent and offers the next, with Skip, a progress bar and progress kept per batch in localStorage. Free wa.me links, no WhatsApp Business API.

- **D-X86 (AGENT, 2026-11-17):** Venue search redesigned: one search bar (City · Guests · Date · Time of day · Search) with amenity and Indoor chips that apply at once and a Filters disclosure for max price; slot names readable. Venue cards shorter (16:10) with name, logo, verified and city on the photo, capacity/spaces/amenities as small chips, price and rating row. Covers and logos fall back to the branded placeholder when an image fails to load; "1 matching space" pluralised.
- **D-X87 (AGENT, 2026-11-18):** Notification emails and SMS now carry full links (APP_URL + path); stored paths like "/quotes" opened nothing from a mail client. All emails share a branded shell (wordmark, gradient bar, rounded card, footer) and the notification email gets a bold button plus the raw link as a fallback. Booking chats started with only the event creator: the host, co-hosts and planner team now join the booking chat the first time they open it (someone who left stays out), so "Open the chat" no longer 404s for the other side. Quote and booking cards in chat stay by design (QTE-06).
- **D-X88 (AGENT, 2026-11-18):** Planner staff: assigning staff to an event sends a `team.assigned` notification (in-app, push, email) linking to the event; the Assign form says "Assigned", "already on this event" or "couldn't assign" instead of failing silently, and staff with no name show their phone/email. Team invites use a branded email (role-aware copy) and the SMS/email link lands on Home. Staff (org role STAFF) see only events they are assigned to across Home, Today, Calendar, Team and Clients (clients behind their events; other client pages 404); Today and Home hide payment figures for them; their menu drops Vendor orders, Pipeline, Proposals, Invoices and Business profile. Owners and admins are unchanged.
- **D-X89 (AGENT, 2026-11-18):** Guest count is host-only (they pay and know the number): preview and send require the HOST role and the button only shows for hosts. A change request is decided by the other side only — host and planner are both the client side, so neither can decide the other's request; the vendor must. When every vendor declines a guest-count change, the event count goes back (unless the host moved it again). The planner is told (in-app, push, email) and gets a WhatsApp row after the affected vendors; vendor WhatsApp numbers fall back from owner to any member with a phone, and rows with no number say so. Task deadline alerts are one digest per person per day to the task owner (or creator) and the event planners; a due-soon task is mentioned once, an overdue one on days 0, 1, 3 and 7, then never again.
- **D-X90 (AGENT, 2026-11-18):** Planner and vendor businesses must have a business phone (WhatsApp) and email, stored on the Organization (`contactPhone`, `contactEmail`; the sign-in phone/email stay login-only). Business sign-up asks for both (prefilled from the account), validated and normalised (E.164, lower-case email). Owners and admins of a business missing either see a "Add your business phone and email" step in place of every app page until saved; staff are never blocked. Editable on Business profile. Migration backfills from the owner's phone/email; `pnpm --filter @tiwa/db demo:contacts` gives demo/test businesses stand-in contacts (also run by the seed). Guest-count WhatsApp uses the business number first.
- **D-X91 (AGENT, 2026-11-18):** Gate check-in made real. Pass QRs (invite, guest pass, ticket) now encode a link `<APP_URL>/k/<signed code>` so any phone camera opens it: door staff signed in with `checkin.scan` for that event are checked in on the spot (big green "X is in" / amber "already in at HH:MM" / red "not valid", live "N of M in", Open the scanner); anyone else sees "Your entry pass, show it at the gate". The in-app scanner reads the code inside a link, falls back to jsQR where BarcodeDetector is missing (iPhone Safari), keeps scanning guest after guest (same pass ignored for 4 s), and has a Stop camera button. checkIn accepts links or bare codes; old bare-code QRs still scan.
- **D-X92 (AGENT, 2026-11-18):** Guest programme instead of printed programmes. New Programme tab (`/events/[id]/programme`) where the host (or anyone with event.edit) adds anything: arrival, speech, prayer, music, dance, meal, toast, ceremony, entertainment, photos, break, other — with time, optional end, who leads it and a note; items edited/removed in a sheet. ProgrammeItem gains `kind` and `description` (migration). The guest page `/e/[slug]/agenda` is now the programme: viewable any time once the event is published (team can preview drafts), grouped by day, kind icons, who and notes; on the day it goes live (now / next / done, auto-refresh). The programme is preferred over public run-of-show items, which only stand in when there is none. Share card: copy guest link, preview, and a printable "Scan for the programme" QR for tables/entrance. Invite page link reads "See the programme".
- **D-X93 (AGENT, 2026-11-18):** The programme is customisable beyond the presets: the host renames its heading (Event.programmeTitle, e.g. "Order of Service", empty = default) inline on the Programme tab, and adds their own item types ("Your own" → e.g. "Chairman's remarks"), stored as `custom:<label>` (≤40 chars), reused as chips once used, shown as a small label above the title on both the editor and the guest page.
- **D-X94 (AGENT, 2026-11-18):** The AI is Tiwa-specific. Every feature prompt (plan, budget, compare, guest impact, guest message) now starts with one shared briefing (`packages/ai/src/prompts/tiwa.ts`, tiwa-context@1): what Tiwa is, the roles, what each tab does (so answers say where to act: Vendors → Catering, Money, Invites, Programme…), how events run where Tiwa launched (lead times, quantities, burial/wedding/corporate specifics, practical extras) and house rules (only this event, use real numbers, never invent prices/names/dates, no contacts). The planner (plan-draft@4) now gets the event's real state: name, weekday date and time, venue, duration, guest count and RSVPs, booked vs only-quoting categories, typical vendors and the type's template checklist, committed money (only with money.view), switched-on features, whether a programme exists, and who is asking; it plans what is not done yet, times every task from the real days left (clamped server-side), sizes quantities from guests, and ends each "why" with where to do it in Tiwa. Host requests are contact-masked before the model. Budget@2, compare@2, impact@2, message@3 sharpened the same way.
- **D-X95 (AGENT, 2026-11-18):** "Plan with AI" shows its work: a live panel with a pulsing badge, five named steps (reading the event, checking bookings, sizing for guests/budget, timing from the date, finishing), a progress bar easing to 92%, a seconds counter, reassurance after 20 s and Cancel (a cancelled draft's late answer is ignored); the request box and ideas lock while it works, and "Add selected" shows "Adding to your plan…". The AI never talks about Moments / the photo gallery: removed from the Tiwa briefing (tiwa-context@2) and plan prompt (plan-draft@5), an explicit rule forbids it, and core drops any suggestion that mentions it. "Record a payment made outside Tiwa" redesigned: amount card, method tiles with icons, receipt drop zone with preview and remove, a vendor-confirms note, and a button that says "Uploading receipt…" / "Recording…".
- **D-X96 (AGENT, 2026-11-18):** Mobile polish across host, planner and vendor screens (checked at 390 px on every main page): the app shell no longer leaves a ~60 px empty band under the header on phones (desktop title row takes no space) and clips decorative glows so no page scrolls sideways; Today and the event Vendors status list use single-column grids so long rows fit; Event day tabs are one scrollable row of pills ("My tasks · 0" no longer wraps); Guests shows three equal action buttons and one five-up summary strip instead of cramped cards, with the AI/guest-count tools in a scrollable row; the event overview Team list shows six people then "+N more" and falls back to the role when a name is blank.
- **D-X97 (AGENT, 2026-11-18):** When anyone on the event team (usually the planner) records a payment to a vendor, the rest of the team (host, co-hosts, planner) is notified at once — "Tola paid Jollof Co NGN 1,500 · waiting for the vendor to confirm", linking to Money → Payments — not only after the vendor confirms. The person who paid is not notified about their own payment; when the planner hides vendor prices, host-side members get the same note without the amount. Money → Payments shows under each line who paid (name and role, or "you"), how (bank transfer, cash, POS, online) and when.
- **D-X98 (AGENT, 2026-11-19):** Removed the planner's "hide vendor prices from the host" feature (EVT-12, D-P08). The host pays, so the host (and co-hosts) always see every vendor quote, line item, booking total, milestone and payment amount, plus who paid. `pricesHiddenFor` now always returns false and `priceVisibilityFor` no longer reads the database, so every read path shows full figures even for events where the old flag was left off; the planner's Settings switch, its action and `setVendorPriceVisibility` are gone; payment notifications always include the amount. The `hostCanSeeVendorPrices` column stays (no migration) but nothing reads it. Supersedes the price-hiding part of D-X97.
- **D-X99 (AGENT, 2026-11-19):** New logo, concept C2 "the canopy, one line": one even stroke draws the party canopy every celebration gathers under, its pole curls forward like a hand held out, and a gold four-point star is the spark of the day; the wordmark is lowercase "tiwa" in Fraunces 600 (loaded once via next/font as --font-brand, swap, not preloaded; Georgia fallback). Shared `TiwaMark` / `TiwaLogo` in packages/ui (stroke = currentColor, star stays gold, thicker line and no star at ≤20 px) now used in the app sidebar (mark alone when collapsed), guest pages, login/sign-up, onboarding, marketplace and landing headers/footers, public vendor and planner pages, the vendor approve link (/c) and pass link (/k). New icon set generated from the same artwork: app/icon.svg (browser tab; old favicon.ico removed), PWA 192/512/maskable and Apple touch icons, and a hosted logo-email.png used in the email header (inline SVG is dropped by mail clients). Concept board: https://claude.ai/artifact/N8KkNdQyQ455MRQPUGRhmd
- **D-X100 (AGENT, 2026-11-19):** Three booking/payment fixes. (1) One venue per event day: accepting a venue quote or instant-booking a venue is refused when another active venue booking covers that day ("venueAlreadyBooked"), and the booked venue becomes the event day's venue (space + business name, city) so booking pages, invites and passes show the place actually booked; a data migration (20261119120000_event_venue_from_booking) points existing event days at their active venue booking. (2) On a planner-run event (active PLANNER seat) the host and co-hosts can no longer record payments to vendors — the planner pays and the host sees every payment; the host still pays the planner's own booking. (3) When a vendor marks a payment "not received", host and planner see a red "Vendor says not received" on the booking's Payments tab and "Not received" with the date on Money → Payments, and the "Paid by …" line disappears.
- **D-X101 (AGENT, 2026-11-19):** Hiring a planner is chat first. On a planner's page the main button is "Chat about your event" (the chat is tied to the host's chosen event), with a line explaining that the planner sends a proposal shaped to the conversation; "Request a proposal" is secondary and no longer forces a fixed scope (full / partial / day-of / consultation are optional hints). In a 1:1 chat about an event, the planner sees "Send a proposal": Tiwa opens (or reuses) the planning request on the host's behalf (`proposalFromChat`, linked to the planner's client pipeline) and drops the planner into the proposal editor with no preset scope; when sent, the proposal also appears as a card in that chat with "Review and accept" for the host.

- **D-X102 (AGENT, 2026-11-19):** Chat no longer notifies per message: one nudge (bell, push, email) once a message sits unread 7 minutes, once per unanswered stretch (keyed by the oldest unread message). A declined quote or proposal request notifies the host and leaves their list. The public profile sidebar (chat button) sits above the content on phones.

- **D-X103 (AGENT, 2026-11-19):** Payout accounts: the account name comes from a NUBAN lookup (Paystack /bank/resolve when PAYSTACK_SECRET_KEY is set, a labelled demo name otherwise), never typed. The full account number is now stored (migration 20261119140000_bank_account_number) and shown in a "Pay to" card on the booking payments tab to whoever pays (host, or the planner on a planner-run event); vendors and photographers on the event never see it. Adding, changing or removing the account alerts every owner and admin (in-app, push, email). Email chosen over 2FA for the MVP.

- **D-X104 (AGENT, 2026-11-19):** Account-name lookup uses Monnify first (login with API key + secret for a cached bearer token, then GET /api/v1/disbursements/account/validate), Paystack second, demo name last. New env: MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_BASE_URL (sandbox by default). Chosen because Monnify keys are free and quick to get.
