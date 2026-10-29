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

### 2026-10-29 — Faster build loop and looser JS budgets
- ID: D-X05
- Status: AGENT (requested by the project owner)
- Decision: Per task, agents run only fast checks (lint, typecheck, tests for touched packages, the flow's own e2e spec). The full suite runs once per batch of 3–5 tasks; build, all e2e, Lighthouse, size and the 5-width / 2-theme / axe / keyboard checks run at the phase gate. First-load JS budgets raised to 180 / 130 / 140 KB (app / guest / marketing) and are warnings until P17 (`SIZE_STRICT=1` makes them hard). LCP, CLS, INP, TTFB and Lighthouse targets are unchanged.
- Why: tasks averaged ~20 min, mostly spent re-running the full build/e2e/Lighthouse; the 120 KB marketing budget already failed at 131 KB from framework weight alone (Next 16 + Sentry 11) before any features.
- Affects: AGENTS.md §3, §4, §7; Frontend.md §9; .size-limit.json; scripts/check-bundle.mjs; gates/1.json; BUILD_PLAN.md P17-T02.

### 2026-10-29 — Onboarding collects only what it persists
- ID: D-X06
- Status: AGENT
- Decision: `/onboarding/business` asks for business name and city (plus the owner's name for phone sign-ups); categories, business phone and logo (UF-01 step 5) move to the BusinessProfile step in P6, and the host photo (step 4) to P5 storage. Onboarding logic lives in `packages/core/src/accounts`; validation errors are message keys; `next` is sanitised by `safeNextPath` (same-origin only).
- Why: those fields have no model to land in until P5/P6; asking for them now would silently drop answers. Core placement follows D-A02.
- Affects: packages/core/src/accounts, apps/web/app/onboarding, UF-01 steps 4–5, P5, P6.

### 2026-10-29 — Team invites create placeholder accounts
- ID: D-X07
- Status: AGENT
- Decision: Inviting an org member by phone/email adds an existing account directly, or creates a placeholder User carrying only that contact (unverified, empty name) plus the Membership. The person signs in to that account with OTP or a magic link (Better Auth finds it by `phoneNumber`/`email`), and onboarding triage sends members straight to their destination (UF-01 step 6). No separate invite table. Roles are ranked OWNER > ADMIN > STAFF: you act on and grant only roles below yours; OWNER is never granted; the last OWNER cannot leave. The team page lives at `/settings/team`; a simple invite SMS/email goes out via the P2 senders until P4 templates.
- Why: no model is needed for a pending state that the account itself already represents; works for both channels without extra tokens.
- Affects: packages/core/src/orgs, apps/web/app/settings/team, apps/web/lib/invite-notify.ts, P4 (messaging templates).

### 2026-10-29 — E2E outbox hook, one-tree AppShell, 30-day sessions
- ID: D-X08
- Status: AGENT
- Decision: (1) E2E tests read OTP codes and magic links from `/api/test/outbox`, which exists only when `E2E_TEST_HOOKS=1`, `APP_ENV` is not production and both SMS and email providers are Fake (else 404); Playwright's webServer sets the flag. (2) `AppShell` renders page content, section tabs and actions once; only the chrome switches by breakpoint (it used to render `children` twice, duplicating forms and ids). (3) Sessions are 30-day sliding (Backend §12), not 7 days. (4) `buttonClasses()` lives in a server-safe module so server pages can style links as buttons.
- Why: (1) deterministic flow tests without reading the database or exposing codes; (2) duplicate forms broke label lookups, ids and screen readers; (3) spec alignment; (4) client-module functions cannot be called from server components.
- Affects: apps/web/lib/test-hooks.ts, apps/web/app/api/test/outbox, playwright.config.ts, packages/ui (shell, button), apps/web/lib/auth.ts.

### 2026-10-29 — Local e2e runs against the production build
- ID: D-X09
- Status: AGENT
- Decision: Playwright serves the production build locally as well as in CI. `scripts/e2e-server.mjs` rebuilds `apps/web` only when sources are newer than `.next/BUILD_ID`, then runs `next start`; Playwright never reuses a server it didn't start.
- Why: under `next dev`, routes compile mid-test and Fast Refresh remounts forms or interrupts navigations — the P2 flow specs failed there and passed 48/48 against a production build. Matching CI also makes local results trustworthy.
- Affects: playwright.config.ts, scripts/e2e-server.mjs, AGENTS.md §3 step 6 (flow specs).

### 2026-10-29 — Member presets match UF-04 wording
- ID: D-X10
- Status: AGENT
- Decision: `view_only` has no money access (was `money: view`) so a View only co-host cannot open Money (UF-04-1). `contributor` ("tasks, guests") gets `eventEdit` (tasks need `event.edit`, Backend §6), guests edit + contacts and run-of-show edit, no money. `finance` and `full` take the host's approval cap (empty = no limit). Event invites reuse the placeholder-account approach (D-X07) through a shared `findOrCreateContactUser`; onboarding triage treats an event invitation like a team membership, so invitees land on the event (UF-01-5).
- Why: the P2 presets contradicted UF-04's acceptance checks; one helper keeps team and event invites identical.
- Affects: packages/core/src/auth/presets.ts, packages/core/src/events/members.ts, apps/web/app/onboarding/page.tsx.
