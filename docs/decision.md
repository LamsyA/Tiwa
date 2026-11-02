# decision.md — Tiwa Decision Record

This file records every important decision about Tiwa: what was decided, why, and who may change it. Every agent reads it at the start of a session (after `AGENTS.md`) and adds to the log at the bottom.

## How this file works

| Status     | Meaning                                                 | Who can change it                                                                                                          |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **LOCKED** | A core decision. The docs and the code are built on it. | Only a human. An agent that thinks it is wrong adds a `PROPOSED` entry to the log and keeps following the locked decision. |
| **OPEN**   | Waiting for a human.                                    | A human answers it; the agent records the answer and changes the status to LOCKED.                                         |
| **AGENT**  | A smaller choice an agent made while building.          | Any agent, with a new log entry explaining the change.                                                                     |

Rules for agents:

1. Never break a LOCKED decision, even if a task seems to need it. Write the conflict in `docs/QUESTIONS.md` and mark the task `- [?]`.
2. Log every AGENT decision that a future developer would ask "why?" about (a library choice, a data shape, a trade-off). Skip trivial ones.
3. One entry per decision, newest at the bottom, using the template in §7.

---

## 1. Product decisions

| ID    | Decision                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                         | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-P01 | The product is called **Tiwa** ("ours" in Yoruba).                                                                                                                                                                                                                                                                             | Short, warm, works globally; an event belongs to everyone involved. Trademark and domain still to be checked (see D-O05).                                                   | LOCKED |
| D-P02 | Tiwa supports **any type of event** (private, corporate, public/ticketed, community). No wedding-only or event-specific logic in code; event types are templates in `packages/config`.                                                                                                                                         | The market is every gathering, not only weddings.                                                                                                                           | LOCKED |
| D-P03 | **Built for the world, launched in Nigeria (Lagos first).** Country rules (currency, payments, tax, languages, templates, data rules) are configuration.                                                                                                                                                                       | A second country should need settings and a payment adapter, not a rebuild.                                                                                                 | LOCKED |
| D-P04 | The MVP is a **responsive, installable web app (PWA)**. Native iOS/Android apps come after launch on the same backend.                                                                                                                                                                                                         | One codebase, fastest to market, no app-store friction for guests.                                                                                                          | LOCKED |
| D-P05 | **Guests never need an account or an app.** They act through signed personal links, tickets or gallery sessions.                                                                                                                                                                                                               | Guests are the largest group and the growth channel; any friction loses them.                                                                                               | LOCKED |
| D-P06 | **Invitations are optional per event** (off by default) and sending takes one click; replying takes one tap. Channels: link, QR, WhatsApp (free `wa.me` mode and paid Cloud API), email, SMS.                                                                                                                                  | Small events need only a link; big events need bulk sending and tracking.                                                                                                   | LOCKED |
| D-P07 | **Moments** has two albums per event: Official (hired photographer) and Guest (uploads by QR, no account). Every upload passes a safety scan.                                                                                                                                                                                  | Collecting every guest's photos is the feature that spreads Tiwa.                                                                                                           | LOCKED |
| D-P08 | The **planner controls** whether the host sees vendor-level prices.                                                                                                                                                                                                                                                            | Planners often sell packages with a margin; forcing transparency would push them away.                                                                                      | LOCKED |
| D-P09 | Venues are vendors with **bookable spaces** (hall, garden, rooftop) sold **per date and slot**, with instant booking or quote, provisional holds and refundable security deposits.                                                                                                                                             | A venue sells a space and a time, not a service package.                                                                                                                    | LOCKED |
| D-P10 | AI **drafts and suggests only**; it never changes data without the user pressing a confirm button, and it sees only what the user may see.                                                                                                                                                                                     | Trust and safety around money and agreements.                                                                                                                               | LOCKED |
| D-P12 | **Chat is a core MVP feature.** Clients chat with vendors, venues and planners before and after booking; planners chat with clients and vendors; every event has a team chat and every booking a thread. WhatsApp-level basics (real time, delivered/seen receipts, typing, voice notes, photos/files, quoted replies, cards). | Most event business happens in conversation; keeping it in Tiwa keeps agreements, evidence and bookings together.                                                           | LOCKED |
| D-P13 | **Guests may message a vendor or planner only after the event ends**, only businesses that worked on an event they attended, and only after verifying a phone number (OTP creates a basic account). Vendors reply but never message guests first.                                                                              | Turns every event into new leads for vendors without spam; a phone number is needed so the vendor can reply. Does not change D-P05: RSVP and uploads still need no account. | LOCKED |
| D-P14 | **Contact details are masked in chat until a booking is confirmed** between the two parties, with a warning to the sender; unmasked after booking. Masking is a nudge, never an automatic penalty.                                                                                                                             | Keeps payments (and their protection) on Tiwa without blocking real conversation.                                                                                           | LOCKED |
| D-P11 | Out of scope for the MVP: native apps, face matching, AI highlight video, print sales, drag-and-drop seating, multi-track session builder, aso-ebi ordering, recommendations, sponsored listings, e-signature integrations.                                                                                                    | Keep the MVP buildable; add after real usage.                                                                                                                               | LOCKED |

## 2. Architecture decisions

| ID    | Decision                                                                                                                                                                           | Why                                                                  | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| D-A01 | **Modular monolith**: one Next.js (App Router) app for all pages and server logic, plus **one worker** process (BullMQ) for background jobs.                                       | Fewer moving parts for the MVP; can be split later.                  | LOCKED |
| D-A02 | **Business rules live in `packages/core`**, framework-free; pages, actions, route handlers and jobs are thin wrappers.                                                             | Testable in isolation; reusable by native apps later.                | LOCKED |
| D-A03 | **TypeScript (strict)** everywhere; **PostgreSQL** with **Prisma**; **Redis** for queues, rate limits and pub/sub.                                                                 | One language; strong transactions for money and bookings.            | LOCKED |
| D-A04 | **Every third-party service sits behind an adapter interface with a Fake implementation** (payments, payouts, escrow, email, SMS, WhatsApp, push, moderation, LLM, storage).       | Build and test without credentials; swap providers by configuration. | LOCKED |
| D-A05 | **Uploads go directly from the browser to object storage** (S3-compatible: Cloudflare R2 in production, MinIO locally) with pre-signed multipart URLs; the worker processes media. | Large events must not overload the app servers.                      | LOCKED |
| D-A06 | **Live updates use Server-Sent Events + Redis pub/sub**, falling back to polling.                                                                                                  | Simple, works through CDNs, no extra vendor.                         | LOCKED |
| D-A07 | **Outbox pattern**: jobs are enqueued from rows written in the same transaction as the change.                                                                                     | No lost or phantom jobs.                                             | LOCKED |
| D-A08 | **The server is authoritative** for permissions, booking states, payment states, ticket capacity, availability and review eligibility. One `authorize()` gate.                     | Clients and AI can't be trusted to enforce rules.                    | LOCKED |
| D-A09 | **Performance budgets are hard limits** (e.g. guest pages LCP ≤ 1.5 s on Slow 4G, ≤ 90 KB JS) enforced in CI.                                                                      | Most users are on mid-range Android phones and mobile data.          | LOCKED |
| D-A10 | Auth: **phone OTP first**, email magic link and Google as alternatives; sessions in the database, httpOnly cookies.                                                                | Phone numbers are universal in Nigeria; email is not.                | LOCKED |
| D-A11 | IDs are **UUID v7**; public slugs are short random strings; guest tokens are ≥ 128-bit random values.                                                                              | Sortable, non-guessable, no sequential exposure.                     | LOCKED |

## 3. Money decisions

| ID    | Decision                                                                                                                                                                                                              | Why                                                          | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| D-M01 | **Money is `BigInt` minor units + ISO currency code.** Never floats. Formatting only in the UI.                                                                                                                       | Correctness.                                                 | LOCKED |
| D-M02 | **Three payment modes per booking: DIRECT** (split at checkout straight to the vendor), **HELD** (held by a licensed partner, released at milestones), **OFFLINE** (cash/transfer recorded by hand).                  | Covers how Nigerians actually pay while enabling protection. | LOCKED |
| D-M03 | **Tiwa holds money only through a licensed partner**, and only after legal sign-off per country. HELD mode and payouts are behind flags (`payments.held`, `payments.payouts`) that stay OFF in production until then. | Holding customer money without a licence is illegal.         | LOCKED |
| D-M04 | **Paystack and Flutterwave** are the payment providers for Nigeria (chosen by config); Stripe and mobile money come with new countries.                                                                               | Best local coverage; a second provider reduces outage risk.  | LOCKED |
| D-M05 | **Double-entry ledger** for every money movement; entries are append-only and each transaction sums to zero (database-enforced). Daily reconciliation pauses payouts on mismatch.                                     | Required once Tiwa routes or holds money.                    | LOCKED |
| D-M06 | A booking or ticket becomes paid **only after a verified webhook + provider verification**, never from the browser callback.                                                                                          | Prevents fake payment confirmations.                         | LOCKED |
| D-M07 | No platform fee on refundable **security deposits**.                                                                                                                                                                  | They are not Tiwa revenue and must be returned in full.      | LOCKED |

## 4. Data model decisions

| ID    | Decision                                                                                                                                                                                                                                                                        | Why                                                                                                    | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| D-D01 | One **BusinessProfile** for both vendors and planners (`Organization.kind` tells them apart).                                                                                                                                                                                   | The two profiles had the same fields; one model means one search and one profile page.                 | LOCKED |
| D-D02 | **Invitation data lives on the Guest** (`inviteToken`, `inviteRevokedAt`, `inviteOpenedAt`, `remindersSent`); each send is an `InviteDelivery`.                                                                                                                                 | There is exactly one invitation per guest, so a separate table only added joins.                       | LOCKED |
| D-D03 | **Change requests are BookingVersions with status PROPOSED.**                                                                                                                                                                                                                   | A change request is a proposed new version of the agreement; one model keeps the history in one place. | LOCKED |
| D-D04 | **One ProgrammeItem model** for ceremony segments, conference sessions and the public agenda (`isPublic`). Backstage work is RunItem.                                                                                                                                           | Avoids three overlapping ways to store an event's schedule.                                            | LOCKED |
| D-D05 | **Income** = paid ticket orders + Contributions of kind `sponsor` / `other_income`. **Budget history** = AuditLog entries. No IncomeLine or BudgetChange models.                                                                                                                | Both duplicated data that already exists.                                                              | LOCKED |
| D-D06 | Vendor verification model is named **BusinessVerification**.                                                                                                                                                                                                                    | Avoids a name clash with the auth library's own `verification` table.                                  | LOCKED |
| D-D07 | **Availability** is one model (AvailabilityBlock) with optional venue space and slot; a database unique index (NULLS NOT DISTINCT) plus a trigger prevents double booking.                                                                                                      | Venues need slot-level availability; other vendors use whole days.                                     | LOCKED |
| D-D08 | Some fields are deliberate **caches** of data stored elsewhere (Organization.verification, BusinessProfile rating fields, Guest/Ticket `checkedInAt`, Booking.totalMinor, TicketType sold/reserved). Each is marked in the schema; the source of truth is named in its comment. | Fast search, lists and capacity locking.                                                               | LOCKED |
| D-D10 | Chat uses **Thread + ThreadParticipant + Message**; a participant is a person or a whole business (team inbox); messages carry a device-generated `clientMessageId` (unique per thread) so retries never duplicate; typing is never stored.                                     | One model for all conversation types; idempotent sending; shared business inboxes.                     | LOCKED |
| D-D09 | Prisma 7 configuration: connection URLs live in `prisma.config.ts` (migrations) and the runtime client uses `@prisma/adapter-pg`; the schema file has no URLs.                                                                                                                  | Required by Prisma 7.                                                                                  | AGENT  |

## 5. Open decisions (waiting for a human)

| ID    | Question                                                                                                                                 | Needed before                                                       | Default the agent uses meanwhile                      | Status |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| D-O01 | Which **licensed partner** holds HELD-mode money (a bank or a payment company's escrow service), and what does the legal review require? | Turning on `payments.held` / `payments.payouts` in production (P17) | Fake EscrowProvider; flags OFF in production          | OPEN   |
| D-O02 | **Platform fee** rates (bookings, tickets) and subscription prices.                                                                      | P8 (fees), P17 (launch)                                             | Values in `PRD.md §6`, `PLATFORM_FEE_BPS=500`         | OPEN   |
| D-O03 | **Hosting region** for database and functions (lowest latency to Lagos).                                                                 | P0-T15                                                              | Agent measures candidates and records the result here | OPEN   |
| D-O04 | **Moderation provider** for image safety and the CSAM hash-matching setup.                                                               | P5                                                                  | Fake moderation provider                              | OPEN   |
| D-O05 | **Trademark and domain** for "Tiwa" (e.g. tiwa.app / tiwa.events) in Nigeria, UK, US.                                                    | P17 (production config)                                             | Placeholder domains in `arc.md §7`                    | OPEN   |
| D-O06 | **LLM provider and models.**                                                                                                             | P15                                                                 | Fake LLM; adapter accepts any provider                | OPEN   |
| D-O07 | **WhatsApp Business** account verification and template approval; **SMS sender ID** registration with Termii.                            | Enabling `whatsapp.bulk` and live SMS (P17)                         | Free `wa.me` mode; Fake SMS                           | OPEN   |
| D-O08 | When do **native apps** follow the web MVP?                                                                                              | After launch                                                        | Not built                                             | OPEN   |

## 6. Rejected options (do not re-propose without new facts)

| Option                              | Rejected because                            |
| ----------------------------------- | ------------------------------------------- |
| Microservices from day one          | Too much operational work for an MVP team   |
| Native apps first                   | Slower to ship; guests would need installs  |
| Building our own escrow/wallet      | Requires a licence; partner instead (D-M03) |
| Guest accounts for RSVP/upload      | Friction kills participation (D-P05)        |
| WebSockets service for live updates | SSE is enough and simpler (D-A06)           |
| Storing money as decimals/floats    | Rounding errors (D-M01)                     |

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

### 2026-10-29 — Documents upload with one signed PUT

- ID: D-X11
- Status: AGENT
- Decision: `packages/storage` (built here; P3-T09 assumed P5's endpoints already existed) exposes `Storage` with an S3 implementation and a Fake. Event documents (≤ 25 MB) upload straight from the browser with a single pre-signed PUT bound to the exact content type and length (D-A05 kept); the server then checks size and magic bytes and deletes mismatches. Storage keys never contain file names. Multipart upload (5 MB parts) arrives with Moments (P5) for large media. Downloads go through `/api/documents/{event}/{doc}`, which checks membership and redirects to a 5-minute signed URL.
- Why: S3 accepts single PUTs far beyond 25 MB, so multipart adds client complexity for no gain on documents; verifying after upload enforces Backend §12 without proxying bytes.
- Affects: packages/storage, packages/core/src/events/documents.ts, apps/web documents page + route, ci.yml (S3 mock env), P5.

### 2026-10-29 — Display font ships 700-only, optional, unpreloaded (LCP)

- ID: D-X12
- Status: AGENT
- Decision: Plus Jakarta Sans (the `font-display` face) ships weight 700 only (every display use is `font-bold`), with `display: optional` and `preload: false`. Body (Inter 400/500/600) keeps `swap`.
- Why: P3-T13: the event title is the mobile LCP node; a late webfont swap repainting it measured 3.2 s simulated. Optional never swaps late (slow loads keep the fallback, cached/fast loads still get Jakarta), and dropping the dead 600 weight plus its preload takes bytes off the critical path. Tried and reverted: `experimental.optimizePackageImports: ['lucide-react']` (shared chunks byte-identical — the 95 KB "unused" JS is framework, not icons).
- Affects: apps/web/app/layout.tsx, P3-T13 (open: sim still 3.2 s — localhost artifacts, see PROGRESS).

### 2026-10-29 — Service worker never caches dynamic requests

- ID: D-X13
- Status: AGENT
- Decision: The Serwist worker runs NetworkOnly for RSC payloads, page navigations and `/api/*`; only static hashed assets (JS/CSS/fonts/images) use the default cache strategies. Offline event pages get targeted caching when they land (P12), not via catch-all page caching.
- Why: Serwist's defaultCache applies header-less NetworkFirst to RSC/navigation/API requests. Replaying streamed RSC from cache intermittently wedged client-side navigations (URL changed, content never arrived — reproduced 1-in-~12 tab clicks, 0/30 after the fix) and stored per-user pages on-device for 24 h (Backend §12). Navigation speed also suffered through the SW.
- Affects: apps/web/app/sw.ts, e2e/sw-navigation.spec.ts.

### 2026-10-30 — Phone formatter loads on demand; one React version workspace-wide

- ID: D-X14
- Status: AGENT
- Decision: `PhoneInput` dynamic-imports `libphonenumber-js` on mount (reformatting + re-emitting on arrival) instead of statically bundling every country's metadata into the shared chunk. `packages/ui` devDeps now pin react/react-dom 19.3.1, matching `apps/web`, so the workspace resolves a single React DOM.
- Why: libphonenumber was ~80 KB gzip of the 258 KB first-load JS on `/events/[id]` although most pages never edit a phone (P3-T13; first-load JS 258→221 KB). Two React DOM copies (19.0.0 via ui, 19.3.1 via web) were one bad import away from dual-React hydration bugs.
- Affects: packages/ui (phone-money, inputs tests, package.json), pnpm-lock.yaml.

### 2026-10-30 — GATE P3 closed with an LCP-simulation waiver

- ID: D-X15
- Status: LOCKED (human directed in session)
- Decision: Phase 3 closes although Lighthouse _simulated_ LCP on `/events/[id]` measures ~2.5 s against the ≤ 2.0 s bar. Perf score (0.94–0.99), CLS (0) and every other gate check pass; devtools-throttled LCP is 1.8 s and observed LCP 0.39 s. P3-T13 stays open as `- [?]` and carries to the P17 production Lighthouse pass (P17-T01) and the preview/prod re-measure blocked on Q-001/Q-002.
- Why: after the D-X12/D-X13/D-X14 fixes (JS 258→221 KB, SW navigation wedge fixed, access-load dedupe), the residual simulated gap is simulated TLS/RTT plus React/Next framework CPU on a loaded dev host — not app code. Blocking the phase on the local simulator would stall P4+ for an environment artifact.
- Affects: BUILD_PLAN.md GATE P3, P3-T13, P17-T01.

### 2026-10-30 — P5 starts with P4 GATE FAILED (T12 open)

- ID: D-X16
- Status: AGENT
- Decision: Begin Phase 5 on explicit human direction while Phase 4 remains GATE FAILED with P4-T12 open (carrying the `/i` localhost-sim LCP/JS budget item). No P4 code is being changed; P4-T12 work (load run, e2e, perf evidence) is already committed and pushed.
- Why: human explicitly directed the next P5 batch; the carried item needs preview/prod to resolve and must not stall Moments.
- Affects: BUILD_PLAN.md Phase 4/5.

### 2026-10-30 — Moderation ships Fake-only; real provider + CSAM is a launch decision

- ID: D-X17
- Status: AGENT
- Decision: `packages/moderation` ships the adapter interface plus `FakeModeration` only. No vendor SDK is wired: CSAM hash-matching (PhotoDNA/NCMEC) needs a partnership and legal sign-off, and every commercial vision API needs a billing key — both are human calls (Q-004).
- Why: Per AGENTS §5, missing external credentials ship as Fake + `.env.example` entry + a QUESTIONS.md item. Fake approves everything, so it must never reach production unnoticed: `MODERATION_PROVIDER` defaults to `fake` and any other value already throws `unsupported moderation provider` until a real adapter lands.
- Affects: packages/moderation, docs/QUESTIONS.md (Q-004), P4-T07 send path already renders via templates (unaffected).

### 2026-11-01 — Chat permission rules and protected indexes
- ID: D-X19
- Status: AGENT
- Decision: `canMessage(from, to, facts)` is a pure function over loaded facts (blocks, shared objects, shared event/booking, attendance, …), one branch per row of Backend §9a.1; blocks always win. Rows the spec leaves open: client ↔ client and planner ↔ planner are allowed only inside a shared event or booking thread (same rule as vendor ↔ vendor); host ↔ guest chat is refused (they use invites and Moments). The planner CRM condition is a fact the P10 CRM will supply. Separately: `prisma migrate dev` emits `DROP INDEX` for the hand-written `availability_unique` and `business_search_trgm` indexes on every new migration — a db test now fails if any migration drops them, and they were restored after the P6-T11 migration first dropped them.
- Why: table-testable rules without a database; the index trap silently removes the double-booking guard (D-D07).
- Affects: packages/core/src/chat, packages/db (chat models, migrations guard test).

### 2026-11-01 — Lean P6 for a $0 test deployment
- ID: D-X20
- Status: LOCKED (owner, 2026-11-01)
- Decision: For the MVP test stage the deployment runs **without the worker** and with a small free Redis (Upstash or Layerbase), so P6 ships lean: chat attachments are photos and files only (direct signed PUT, size + magic-byte check, moderation scan by key — no worker needed); **voice notes** (ffmpeg transcoding in the worker) and **chat notifications** (web push, unread email/WhatsApp summaries — P6-T18) move to P13. A new P6-T20 adds an `INLINE_JOBS=1` mode that runs critical outbox topics (event-team chat sync) inline after the action, and a polling fallback so chat keeps working when the live stream (Redis) is unavailable. Features that truly need the worker (bulk invite sending, CSV import, reminders, Moments media processing) stay off on such a deployment until the worker is added (~$5/month) before public launch.
- Why: owner's cost constraint; free Redis tiers can't absorb the worker's 24/7 job traffic (Upstash meters commands; Layerbase free databases sleep), but can serve rate limits and chat pub/sub for a handful of testers.
- Affects: BUILD_PLAN P6-T15/T18/T20, P13; apps/web inline jobs; chat client.

### 2026-11-01 — Chat masking token and new-account link rule
- ID: D-X21
- Status: AGENT
- Decision: `maskedBody` stores a neutral `••••` token; the UI adds the translated "(shared after booking)" hint, so no English lands in data. Masking applies in PROFILE/QUOTE_REQUEST/QUOTE/SITE_VISIT/GUEST_ENQUIRY threads until a confirmed booking between the parties (`hasConfirmedBooking` returns false until P7 bookings exist); event-team, booking and planner-client threads are never masked. The first send with contact details returns `contactWarning`; the client holds the message in its outbox and asks "Send anyway?"; acknowledged sends are audited (`chat.contact_shared`) for trust & safety. Backend §9a.6 says a new account's first message with a link is "held for a quick automated check": until the P16 review queue exists, such messages are refused with a clear message instead. Chat rate limits (30 messages/min; new accounts 10 new threads/day) live in the web actions on the shared Redis limiter and fail open if Redis is down.
- Why: keep translations out of stored text; a refuse-now rule is safer than silently passing links with no reviewer.
- Affects: packages/core/src/chat (masking, threads, safety), apps/web inbox actions + thread UI, P7 (booking lifts masking), P16 (link review queue).

### 2026-11-01 — No rate limits on chat
- ID: D-X22
- Status: LOCKED (owner, 2026-11-01)
- Decision: Chat has no message or new-thread rate limits (replaces the "30 messages/min" and "new accounts ≤ 10 new threads/day" rules in Backend.md §9a.6 and D-X21). Spam is handled by blocking, reporting, `canMessage` (vendors can't cold-message clients or guests), masking, and refusing links in a new account's first message.
- Why: owner — chat must feel like WhatsApp, where people never hit a visible limit.
- Affects: apps/web/app/inbox/actions.ts, packages/core/src/auth/rate-limit.ts, Backend.md §9a.6 (superseded on this point).

### 2026-11-01 — Better Auth ids follow D-A11; user-id validation
- ID: D-X23
- Status: AGENT
- Decision: Better Auth now generates UUID v7 ids (`advanced.database.generateId`), restoring LOCKED D-A11 for users, sessions and accounts. Accounts created earlier keep Better Auth's 32-character ids, so user ids are validated with a shared `userIdSchema` (opaque 8–64 char id) instead of `.uuid()`. Other entity ids stay `.uuid()`.
- Why: found by the chat e2e — `.uuid()` on user ids rejected every real signed-up user: changing or removing an org member (P2), assigning a task owner (P3), and chat block/mentions/direct messages (P6). Unit tests had only used database-created users, which do get UUIDs.
- Affects: apps/web/lib/auth.ts, packages/core (orgs/members, events/tasks, chat/threads, chat/safety, shared/schemas).

### 2026-11-01 — Chat load test in Node, not k6
- ID: D-X24
- Status: AGENT
- Decision: The GATE P6 stream test (`scripts/load-chat.mjs`) is a Node script: it creates 1,000 users with real signed Better Auth sessions, opens 1,000 `GET /api/sse/inbox` streams against a running server, publishes 50 chat events/s on the app's Redis channels, and reports publish → received latency (p50/p95/p99), drops and failures; it cleans up its users. k6 can't hold SSE streams without a custom xk6 extension. The message write itself (`sendMessage`) is covered by integration tests; this measures the fan-out/delivery path the gate is about.
- Why: a stock tool that can't read SSE would test nothing; Node's fetch streams read real SSE frames.
- Affects: scripts/load-chat.mjs, gates/6.json.

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

### 2026-11-02 — The host owns the plan and the budget split
- ID: D-X30
- Status: LOCKED (owner, 2026-11-02)
- Decision: Creating an event no longer applies the template's checklist or splits the total budget into template categories (supersedes UF-03 step 6 / UF-03-3 and Backend.md's `finalizeEvent` "creates tasks, budget categories"). It still creates day 1 and the programme outline. The host builds their own plan (add tasks per timeframe) and their own budget lines (name + amount, rename, delete — `addBudgetCategory`, `renameBudgetCategory`, `removeBudgetCategory`, plus `setAllocations` for amounts and the total). Template suggestions stay available as an explicit opt-in: "Pick from suggestions" adds only the ticked checklist tasks (`applySuggestedTasks`, skips ones already on the plan) and "Start from a suggested split" creates categories from the template percentages only while the budget is empty (`applySuggestedBudget`). Every change is audited.
- Why: owner — the auto-generated plan and the unexplained split did not match what hosts wanted; the creator must decide what goes on the plan and how much goes where.
- Affects: packages/core (events/commands, budget/edit), /events/[id]/plan, /events/[id]/money, event wizard copy, e2e create-event / event-plan / money.

### 2026-11-02 — Lean P11: tickets on offline confirmation, public page dynamic
- ID: D-X31
- Status: AGENT (follows D-X27, D-X18)
- Decision: Tickets ship without a payment provider: free orders (total 0) issue instantly; paid orders reserve seats for 10 minutes and the organiser confirms with `confirmTicketOrderOffline` ("Mark as paid") once paid outside Tiwa; only PAID orders count as ticket income in the budget. `/e/[slug]` renders dynamically, not ISR (same root-layout theme-cookie limit as D-X18, and availability must never be stale). Organiser payouts (P11-T09) stay behind `payments.payouts` as a note only. Ticket delivery is the `/t/[ticketId]` page plus an inline email for free orders; WhatsApp delivery arrives with the messaging providers.
- Why: D-X27 keeps Tiwa moving no real money on the $0 deployment; Q-005 (escrow/legal + provider accounts) is still open.
- Affects: BUILD_PLAN P11 (T04, T05, T09), packages/core/src/tickets, /e/[slug], /events/[id]/tickets, P9 ticket income.

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
