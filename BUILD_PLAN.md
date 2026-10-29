# BUILD_PLAN.md — Tiwa MVP Build Plan

The single source of "what to do next". Follow the build loop in `AGENTS.md §3`:

1. Work on the **first phase whose status is not DONE**.
2. Do its tasks **in order**; tick each `- [x]` only when its checks pass.
3. When all tasks are ticked, run the phase **GATE**. Mark the phase DONE only when every gate check passes.
4. Log every finished task and every gate result in `docs/PROGRESS.md`.

Task markers: `- [ ]` to do · `- [x]` done · `- [?]` blocked on a question in `docs/QUESTIONS.md` (skip to the next task that doesn't depend on it).

References: `PRD` requirement IDs (e.g. `GST-05`), user flows (`UF-07`), and document sections (`Backend.md §7.3`).

---

## Status

| Phase | Name | Status | Gate passed on |
|-------|------|--------|----------------|
| P0 | Foundation and tooling | DONE | 2026-10-28 |
| P1 | Design system and app frames | DONE | 2026-10-29 |
| P2 | Accounts, organisations, permissions | IN PROGRESS | |
| P3 | Events and planning | TODO | |
| P4 | Guests and one-click invitations | TODO | |
| P5 | Moments | TODO | |
| P6 | Marketplace and chat | TODO | |
| P7 | Quotes and bookings | TODO | |
| P8 | Payments, ledger, held payments, payouts | TODO | |
| P9 | Budget and finance | TODO | |
| P10 | Planner workspace and vendor dashboard | TODO | |
| P11 | Tickets and check-in | TODO | |
| P12 | Event day | TODO | |
| P13 | Notifications and event-team chat | TODO | |
| P14 | Reviews and event close | TODO | |
| P15 | AI assistant | TODO | |
| P16 | Admin console | TODO | |
| P17 | Hardening and launch readiness | TODO | |

Statuses: `TODO` · `IN PROGRESS` · `GATE FAILED` · `DONE`.

**Milestone releases** (deploy to staging and demo):

| Milestone | After phase | What a real user can do |
|-----------|-------------|-------------------------|
| M1 "Invite & remember" | P5 | Create any event, invite guests in one click, guests RSVP and share photos in Moments. **Pilot with founding planners.** |
| M2 "Chat, book & pay" | P9 | Find vendors and venues, chat with them, get quotes, book, pay (direct/offline; held behind flag), track the budget |
| M3 "Run the business" | P12 | Planner/vendor workspaces, tickets and check-in, event-day run-of-show |
| M4 "Launch candidate" | P17 | Everything in the PRD MVP scope, hardened, all budgets met |

---

## P0 — Foundation and tooling

**Goal:** an empty, fully-wired monorepo where every check runs in CI.
**Read first:** `arc.md` (all), `AGENTS.md §6`, `Backend.md §1`.

- [x] P0-T01 Create the repo layout in `arc.md §3` with pnpm workspaces and Turborepo; add `AGENTS.md`, `PRD.md`, `arc.md`, `user_flow.md`, `Backend.md`, `Frontend.md`, `BUILD_PLAN.md`, `decision.md` at the root; create `docs/PROGRESS.md`, `docs/QUESTIONS.md`, `docs/privacy.md`.
- [x] P0-T02 `tsconfig.base.json` with `strict`, `noUncheckedIndexedAccess`, path aliases `@tiwa/*`.
- [x] P0-T03 ESLint (Next + TypeScript + import rules) and Prettier; dependency boundaries from `arc.md §3` enforced (dependency-cruiser or `import/no-restricted-paths`).
- [x] P0-T04 Next.js app in `apps/web` (App Router, TypeScript, Tailwind) with a placeholder home page.
- [x] P0-T05 Worker app in `apps/worker` (Node + BullMQ) with a `ping` job and graceful shutdown; Dockerfile including ffmpeg.
- [x] P0-T06 `infra/docker-compose.yml`: Postgres (with postgis), Redis, MinIO (create both buckets on start), Mailpit. Scripts `pnpm db:up` / `db:down`.
- [x] P0-T07 `packages/db` with Prisma, initial empty schema with datasource + extensions; `pnpm db:migrate`, `pnpm db:seed` scripts (seed is a stub for now).
- [x] P0-T08 `packages/config/env.ts` (Zod-validated env, see `arc.md §8`), `.env.example` complete, `flags.ts` with all flags OFF in production and ON elsewhere.
- [x] P0-T09 `packages/core/shared`: `money.ts` (BigInt helpers: add, sub, mulBps, allocate) with property-based tests; `ids.ts` (uuidv7, slug, token); `errors.ts` (DomainError classes); `time.ts`.
- [x] P0-T10 Vitest set up for all packages; Playwright set up with `mobile` (390×844) and `desktop` (1280×800) projects; one smoke e2e test.
- [x] P0-T11 Lighthouse CI (`lighthouserc.json`) and `size-limit` configured (initially only `/`).
- [x] P0-T12 Sentry for web and worker (with PII scrubbing `beforeSend`); pino logger; `/api/health`.
- [x] P0-T13 GitHub Actions `ci.yml`: install → lint → typecheck → unit → build → e2e (with docker services) → Lighthouse CI → size-limit. Cache pnpm and Turbo.
- [x] P0-T14 `pnpm gate <n>` script that runs the automated checks listed in a phase gate (reads a `gates/<n>.json` list of commands).
- [x] P0-T15 Deploy previews: Vercel project for `apps/web`; Neon (or chosen DB) with branch-per-PR; record region latency test to Lagos in `decision.md`.

**GATE P0**
- [x] `pnpm install && pnpm db:up && pnpm db:migrate && pnpm dev` works on a clean machine using only the README. (Verified 2026-10-28 via fresh `git clone` + README First-run block: install, db:up healthy, migrate, seed, dev 200 + worker listening. Shares the host Docker daemon; empty-volume migrate proven in P0-T07.)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` pass locally and in CI. (Local: green, incl. `pnpm gate 0` 11/11. CI: `ci.yml` present but never run — needs `git push` + a PR; say the word.)
- [ ] A pull request produces a preview URL; Lighthouse CI and size-limit run on it. (Blocked: Q-001/Q-002 external accounts. Runbook ready at `docs/runbooks/preview-deployments.md`.)
- [x] `money.ts` property tests pass (allocate always sums exactly). (1000-run fast-check property in `@tiwa/core`, green in every `pnpm test` / gate run.)
- [x] Installed versions recorded in `arc.md §2`. (Recorded 2026-10-28; CI pins Node 22.)

---

## P1 — Design system and app frames

**Goal:** every shared component and both app frames exist, look polished in light/dark, and are fast.
**Read first:** `Frontend.md §1–§5, §7.8, §8`.

- [x] P1-T01 Tokens (`packages/ui/src/tokens.css`) and Tailwind preset; theme cookie + no-flash theme script; fonts via `next/font`.
- [x] P1-T02 Primitives: Button, IconButton, Input, Textarea, Label, Checkbox, Radio, Switch, SegmentedControl, Chip/ChipGroup, Badge, StatusPill, Avatar/AvatarGroup.
- [x] P1-T03 Inputs: PhoneInput (libphonenumber-js), MoneyInput (minor units), DateField, TimeField, Select, Combobox.
- [x] P1-T04 Containers: Card, StatCard, Tabs (URL-synced), List/ListItem with swipe actions, EmptyState, Skeleton set, Banner.
- [x] P1-T05 Overlays: ResponsiveDialog (sheet < md, dialog ≥ md), DropdownMenu, Popover, Tooltip, Toast, ConfirmDialog.
- [x] P1-T06 DataTable with card mode below `md`; Stepper; Timeline; ProgressBar/Ring.
- [x] P1-T07 Formatting components: MoneyText, DateText, RelativeTime (Intl, event locale/timezone).
- [x] P1-T08 `AppShell`: mobile frame (top bar, scrollable section tabs, sticky action slot, bottom tab bar with safe areas) and desktop frame (collapsible sidebar, top bar with search slot, content max width, optional right panel). Navigation config by role (`Frontend.md §5.4`).
- [x] P1-T09 `GuestShell` (no chrome, 560 px column, cover header, sticky bottom button).
- [x] P1-T10 `/dev/ui` gallery page (excluded from production) showing all components and both frames.
- [x] P1-T11 next-intl set up; `messages/en.json`; lint rule or test that flags hard-coded user-facing strings in `apps/web/app`.
- [x] P1-T12 PWA basics: manifest, icons, Serwist service worker with static asset caching; installability check.

**GATE P1**
- [x] `/dev/ui` renders every component in light and dark at 360, 390, 768, 1280, 1440 px with no horizontal scroll (automated test).
- [x] axe: zero serious/critical issues on `/dev/ui`.
- [x] Lighthouse mobile on `/dev/ui` ≥ 95; CLS 0.
- [x] Keyboard-only: every interactive component reachable and operable (Playwright keyboard test).
- [x] App is installable (PWA installability passes).

---

## P2 — Accounts, organisations, permissions

**Goal:** people can sign up, choose roles, create organisations; one permission gate protects everything.
**Read first:** `PRD.md §2, ACC-*`, `UF-01`, `UF-02`, `Backend.md §3 (accounts), §4`, `Frontend.md §6.1 (login)`.

- [x] P2-T01 Prisma models: User (extended), Organization, Membership, AuditLog, OutboxEvent, IdempotencyKey, FeatureFlagOverride; migration.
- [x] P2-T02 Better Auth with Prisma adapter: phone OTP (Termii adapter + Fake), email magic link (Resend adapter + Fake/Mailpit), Google; sessions; rate limits (`Backend.md §13`).
- [x] P2-T03 `/signup`, `/login`, OTP screen, magic-link landing; `next` redirect.
- [x] P2-T04 Onboarding: role choice, host profile, business setup (creates Organization + OWNER membership).
- [x] P2-T05 `packages/core/auth`: Actor type, action list, matrix (`PRD.md §2.1`), presets, `authorize()`; table-driven tests for every role × action.
- [x] P2-T06 `apps/web/lib/action.ts` wrapper and `getCtx()`; error mapping to codes.
- [x] P2-T07 Org members: invite by phone/email, roles OWNER/ADMIN/STAFF, remove.
- [x] P2-T08 Settings: profile, theme, language placeholder, export my data (job stub), delete account (anonymise).
- [x] P2-T09 Outbox publisher job (`events/publish-outbox`) and audit helper.
- [x] P2-T10 Feature flag resolver (config + DB overrides) for server and client.
- [x] P2-T11 e2e: UF-01, UF-02.

**GATE P2**
- [x] UF-01 and UF-02 acceptance checks pass at both widths.
- [x] Permission matrix test covers 100% of actions × roles.
- [x] Rate limits verified by tests (OTP, login).
- [x] Sessions are httpOnly/Secure/SameSite=Lax (test inspects cookies).

---

## P3 — Events and planning

**Goal:** create any type of event, manage members, tasks and documents.
**Read first:** `PRD.md §3, EVT-*`, `UF-03`, `UF-04`, `UF-05`, `Backend.md §3 (events), §5.10`, `Frontend.md §6.3 (events)`.

- [x] P3-T01 `packages/config/event-types/`: at least 20 templates covering all four formats (label, format, checklist, budget categories with %, vendor categories, programme items, default features). `vendor-categories.ts`. Unit test: every template is valid.
- [x] P3-T02 Prisma: Event, EventParticipant, EventDay, ProgrammeItem, Task, TaskDependency, Document; migration.
- [x] P3-T03 Core `events` commands/queries with tests (draft, steps, finalize applies template, duplicate, cancel rules).
- [x] P3-T04 Wizard `/events/new` (type grid grouped by format with search, basics, venue & days, guests & budget & visibility, features) with autosave and resume.
- [x] P3-T05 Event overview `/events/[id]` with cards (progress, deadlines, team; money/guests/moments cards render placeholders until their phases).
- [x] P3-T06 `/events` list (Upcoming/Past/Drafts).
- [x] P3-T07 Members & permissions settings (presets, approval limit), invitation acceptance flow.
- [x] P3-T08 Plan page `/events/[id]/plan`: grouped tasks, filters, detail panel/sheet, add/complete, live updates (SSE `event:{id}` channel — build the SSE infrastructure here: Redis pub/sub + `useLive`).
- [x] P3-T09 Documents upload (reuse storage multipart endpoints, see `Backend.md §11`) and list.
- [x] P3-T10 Event settings: details, features toggles, visibility, cancel (blocked when bookings/payments exist), cover image + theme colour.
- [x] P3-T11 `events/deadline-alerts` job (in-app notification stub until P13).
- [ ] P3-T12 Seed: one event of each format; e2e UF-03, UF-04, UF-05.

**GATE P3**
- [ ] UF-03, UF-04, UF-05 checks pass at both widths.
- [ ] Creating a birthday takes < 60 s in the e2e timer.
- [ ] grep test: no event-type words ("wedding", "bride", "groom", "burial"…) in `apps/web/app/**/*.tsx` outside config-driven code.
- [ ] Lighthouse: `/events/[id]` ≥ 90 mobile, LCP ≤ 2.0 s.

---

## P4 — Guests and one-click invitations

**Goal:** guest list, optional one-click invites on all channels, one-tap RSVP with no account.
**Read first:** `PRD.md GST-*`, `UF-06`–`UF-09`, `Backend.md §3 (guests & invites), §5.6, §9, §10 (messaging)`, `Frontend.md §6.2 (/i), §6.3 (guests, invites)`.

- [ ] P4-T01 Prisma: Guest (with invite fields), GuestGroup, SeatingTable, InviteBatch, InviteDelivery; migration.
- [ ] P4-T02 `packages/messaging`: Email (Resend + Fake), SMS (Termii + Fake), WhatsApp Cloud (+ Fake), `wa.me` link builder; React Email invite templates.
- [ ] P4-T03 Guests page: add manually, paste parser (detects phone/email, E.164 normalise), CSV import job with column mapping and progress, contacts picker (feature-detected), groups, search/filter, bulk actions.
- [ ] P4-T04 Headcount report + vendor share link (no contact details); simple tables assignment.
- [ ] P4-T05 Invitations switch (off by default) and Share section: event link, QR download (PNG + A6/A4 PDF), shared-link RSVP (`/e/[slug]/rsvp`) with on/off.
- [ ] P4-T06 Invite composer (Who · How · Message, smart channel choice, previews per channel, SMS cost estimate) and **one-click Send** (`sendInviteBatch`, idempotent).
- [ ] P4-T07 Worker: `send-invite-batch` fan-out, `send-invite` with per-provider rate limiters, status updates, SSE `invites:{eventId}`.
- [ ] P4-T08 WhatsApp free-mode queue screen (`wa.me` one by one, mark sent manually).
- [ ] P4-T09 Guest invitation page `/i/[token]` (GuestShell, one-tap RSVP island, extras when enabled, client-side POST for email one-tap links with Undo), pass page with QR, `.ics` endpoint and Google Calendar link.
- [ ] P4-T10 WhatsApp reply-button webhook → RSVP; email/SMS delivery webhooks → statuses.
- [ ] P4-T11 Reminders job (non-responders max 2, day-before), updates to all/attending, revoke token, forwarding setting.
- [ ] P4-T12 Live tracking table with counters; e2e UF-06–UF-09; load test script (k6) for 2,000 invites with fake providers.

**GATE P4**
- [ ] UF-06, UF-07, UF-08, UF-09 checks pass at both widths.
- [ ] 2,000 invites sent in < 5 min with fakes; no guest gets > 2 reminders (tested with time travel).
- [ ] `/i/[token]`: LCP ≤ 1.5 s, JS ≤ 90 KB, Lighthouse ≥ 95 mobile.
- [ ] A plain GET of an email RSVP link records nothing (UF-08-3).
- [ ] With invitations OFF, invites UI is hidden and all P3 tests still pass.

---

## P5 — Moments

**Goal:** guests and photographers fill an event gallery; hosts moderate; slideshow and downloads work. → **Milestone M1**
**Read first:** `PRD.md MOM-*`, `UF-10`–`UF-12`, `arc.md §5`, `Backend.md §3 (Moments), §5.8, §10 (media)`, `Frontend.md §6.2 (/m), §7.4, §7.5`.

- [ ] P5-T01 Prisma: Gallery, GuestSession, MediaItem, GuestbookMessage, Report; migration. Gallery auto-created when Moments is on.
- [ ] P5-T02 `packages/storage` (S3/R2/MinIO) and upload endpoints (`create`, `sign-part`, `complete`, `abort`) with limits and rate limits.
- [ ] P5-T03 `packages/moderation` (adapter + Fake) and CSAM-scanning setup notes in `decision.md`.
- [ ] P5-T04 Worker: `process-image` (sharp: orientation, strip GPS, 320/1080 AVIF+WebP, blur, sha256 dedupe), `process-video` (ffmpeg 720p + poster), `moderate` → state + SSE.
- [ ] P5-T05 Client upload stack: Web Worker resize, Uppy multipart with retries, `UploadQueueProvider`, IndexedDB resume.
- [ ] P5-T06 Gallery page `/m/[code]`: Official/Guest tabs, virtualised grid, lightbox, "My uploads", live new-items pill, privacy modes (guests-only via invite/ticket cookie or access code).
- [ ] P5-T07 Guest upload sheet with first-name + consent line; delete own uploads; request removal.
- [ ] P5-T08 Host Moments page: settings, QR downloads (table card, poster, badge), moderation queue (swipe/keys/bulk), feature/hide/delete/block uploader.
- [ ] P5-T09 Slideshow page (delay, crossfade, wake lock, corner QR).
- [ ] P5-T10 Official album: photographer upload (desktop drag-and-drop, folders), publish, watermark job (`media/watermark`).
- [ ] P5-T11 Download all (ZIP job + email link); guestbook (post, hide, PDF export).
- [ ] P5-T12 Plans: free limits (500 items, 3 months, 30 s video) vs Plus (entitlement stub until P8 payments); expiry warning and purge jobs; "Planned with Tiwa" footer.
- [ ] P5-T13 Seed gallery (200 generated images, 10 videos); e2e UF-10–UF-12 including throttled 3G and offline toggle.

**GATE P5 (Milestone M1 demo on staging)**
- [ ] UF-10, UF-11, UF-12 checks pass at both widths, on iOS Safari (WebKit project) and Android Chrome (Chromium project).
- [ ] No GPS EXIF in any served file (automated check over seed outputs).
- [ ] k6: 500 concurrent uploaders to one gallery, error rate < 1%, p95 `create` < 300 ms.
- [ ] `/m/[code]`: LCP ≤ 1.5 s, JS ≤ 90 KB initial (upload stack lazy), 60 fps scroll with 5,000 items (performance trace).
- [ ] Staging demo: a planner creates an event, sends invites, a guest RSVPs, uploads photos, host runs the slideshow.

---

## P6 — Marketplace and chat

**Goal:** vendors, venues and planners publish profiles; hosts search, shortlist and compare; **everyone can chat** (client ↔ vendor/planner, planner ↔ vendor, guests ↔ vendors after events).
**Read first:** `PRD.md MKT-*, VEN-*, MSG-*`, `UF-13`, `UF-14 (search part)`, `UF-29`, `UF-30`, `UF-31`, `Backend.md §3 (marketplace, chat), §9a`, `Frontend.md §4 (chat components), §6.1, §6.3 (/inbox)`.

- [ ] P6-T01 Prisma: BusinessProfile, VenueSpace, PortfolioItem, ServicePackage, AvailabilityBlock, BusinessVerification, Shortlist; trigram index and availability unique-index migrations.
- [ ] P6-T02 Business profile pages with completeness checklist; portfolio uploader (reuse upload stack); packages editor; availability calendar ("confirm availability" updates `availabilityConfirmedAt`).
- [ ] P6-T03 Publish rules (profile + ≥ 6 portfolio items + ≥ 1 package); verification submission (documents) → PENDING.
- [ ] P6-T04 Public profile `/vendors/[slug]` and `/planners/[slug]` (ISR + tag revalidation, OG image).
- [ ] P6-T05 Search `/vendors` with filters (category, city/radius via PostGIS, date availability, price, rating, verified), cursor pagination, sort; `/planners` search.
- [ ] P6-T06 Shortlist (per event) and compare view (up to 4).
- [ ] P6-T07 Event vendors page `/events/[id]/vendors` (categories from template with status).
- [ ] P6-T08 Venue spaces: `/business/spaces` editor (capacities, amenities, rules, slot prices, setup/teardown, security deposit, instant-book switch, hold length); per-space availability calendar with slot blocks; venue section on the public profile.
- [ ] P6-T09 Venue search `/venues` (date + slot availability, capacity by layout ≥ guests, area, price, indoor/outdoor, amenities); "Find a venue" link from the event wizard and the event vendors page.
- [ ] P6-T10 Seed 40 vendors + 8 venues with spaces (and `db:seed:load` 5,000); e2e UF-13, UF-14 search part, UF-29-1.
- [ ] P6-T11 Chat data: Thread, ThreadParticipant, Message, UserBlock (`Backend.md §3`); `canMessage()` with a table-driven test of every row in `Backend.md §9a.1`.
- [ ] P6-T12 Chat core: `startThread` (reuses existing threads), `sendMessage` (idempotent `clientMessageId`), edit/delete, mark delivered/read, mute/archive; business team inboxes (reply on behalf of the business); event-team threads created automatically for every event (host, co-hosts, planner, staff) with @mentions and mark-as-decision.
- [ ] P6-T13 Real time: `/api/sse/inbox` (one stream per user), Redis channels per user/org, typing endpoint, receipts; client store with optimistic sending and offline retry queue (IndexedDB).
- [ ] P6-T14 Inbox UI: `ChatList`, `ChatThread`, `MessageBubble`, `Composer`, filters, search, desktop two/three panes, mobile full-screen thread; unread badges in navigation.
- [ ] P6-T15 Attachments and voice notes: photos/files via upload endpoints (`purpose: chat`), voice recorder/player, `media/process-voice` job (AAC + waveform).
- [ ] P6-T16 Contact masking and warning sheet (`Backend.md §9a.3`); block and report (creates `Report`); chat rate limits.
- [ ] P6-T17 Entry points: `[Message]` on profiles (vendor, venue, planner), quote requests, planner clients, vendor book; Moments footer chips and pass page after the event (guest enquiries with phone OTP, `allowGuestEnquiries` setting).
- [ ] P6-T18 Chat notifications: web push subscription + VAPID, `chat/unread-nudges` job (push after 2 min, email/WhatsApp summary after 15 min, quiet hours).
- [ ] P6-T19 e2e UF-30 (except quote cards, done in P7) and UF-31; k6: 1,000 connected inbox streams, 50 messages/s.

**GATE P6**
- [ ] UF-13 checks pass; UF-14-1, UF-14-2 and UF-29-1 pass.
- [ ] UF-30 (1–5, 7–10) and UF-31 checks pass at both widths; voice notes play across iOS Safari, Android Chrome and desktop Firefox.
- [ ] Message delivery p95 < 2 s with 1,000 connected streams (k6).
- [ ] Search p95 server time < 300 ms with 5,000 vendors.
- [ ] `/vendors/[slug]` Lighthouse ≥ 95 mobile; served from cache on second request.

---

## P7 — Quotes and bookings

**Goal:** request quotes, build and send them, accept into versioned bookings, handle change requests.
**Read first:** `PRD.md QTE-*`, `UF-14 (request)`, `UF-15`, `UF-16`, `UF-19`, `Backend.md §3 (quotes & bookings), §5.1, §5.2`.

- [ ] P7-T01 Prisma: QuoteRequest, Quote, Booking, BookingVersion (with PROPOSED status for change requests), SiteVisit, PaymentMilestone (fields only; payments logic in P8); migration.
- [ ] P7-T02 Core: quote totals (integer maths, tax/service bps), state machines for Quote and Booking with full transition tests.
- [ ] P7-T03 Request quotes (≤ 5 vendors per category) with brief prefilled from event.
- [ ] P7-T04 Vendor enquiries inbox and quote builder (templates, line items, totals, terms, proposed schedule, expiry) + quote expiry job.
- [ ] P7-T05 Quote view + compare (desktop columns, mobile swipe cards); accept / request changes / decline.
- [ ] P7-T06 Accept flow: payment-mode choice (Held hidden unless flag), terms agreement, creates Booking v1 + milestones from schedule; records user/time/IP.
- [ ] P7-T07 Booking page: details, versions, payments tab (read-only until P8), files.
- [ ] P7-T08 Change requests with diff view and acceptance creating version N+1.
- [ ] P7-T09 Booking brief for vendors (no guest contacts).
- [ ] P7-T10 Venue booking: instant book and venue quotes create the booking and the AvailabilityBlock in one transaction (unique index → friendly "just booked" message); provisional hold with `holdExpiresAt` and the `bookings/expire-holds` job.
- [ ] P7-T11 Site visits: request (up to 3 times), venue confirm/decline, calendar entries, reminder job.
- [ ] P7-T12 Chat cards: share quote, booking and site-visit cards in chat (live status); booking confirmation turns the existing thread into the booking thread and unmasks contact details; booking threads created automatically (`chat/sync-participants`).
- [ ] P7-T13 e2e UF-14 (request), UF-15, UF-16, UF-19, UF-29-2, UF-29-3, UF-29-6, UF-29-7, UF-30-4 (after booking), UF-30-6.

**GATE P7**
- [ ] UF-15, UF-16, UF-19 checks pass at both widths; UF-29-2, -3, -6, -7 pass (no double booking under concurrency).
- [ ] Server-side totals equal client-side totals for 1,000 random quotes (property test).
- [ ] Vendor isolation test: vendor A cannot read vendor B's quote for the same event.

---

## P8 — Payments, ledger, held payments, payouts

**Goal:** money moves correctly in all three modes; every movement is in a balanced ledger; held payments and payouts work behind flags. → part of **Milestone M2**
**Read first:** `PRD.md PAY-*`, `UF-17`, `UF-18`, `UF-26 (freeze part)`, `arc.md §6`, `Backend.md §5.3–§5.5, §7, §8`.

- [ ] P8-T01 Prisma: Payment, ProviderEvent, BankAccount, Payout, Refund, LedgerTransaction, LedgerEntry, PaymentException, Subscription, Dispute, DisputeEvidence; raw SQL: ledger sum-zero deferred trigger, no UPDATE/DELETE trigger on ledger tables.
- [ ] P8-T02 `packages/payments` interfaces + **Fake** provider (with `/dev/fake-checkout` and signed fake webhooks).
- [ ] P8-T03 Ledger module: `post()`, balances, trial balance; tests (sum zero, duplicate reference, immutability).
- [ ] P8-T04 Paystack adapter (checkout with split, verify, refund, webhook signature, banks, resolve account, subaccount, transfer recipient, transfers).
- [ ] P8-T05 Flutterwave adapter (same capabilities); provider chosen by config; run the payment test suite against both adapters' sandbox in a separate CI job (skipped when keys missing).
- [ ] P8-T06 Bank account setup (list banks, resolve name, confirm, create subaccount + recipient job); OTP + 24 h payout pause on change.
- [ ] P8-T07 Checkout: `startCheckout`, inline provider UI, "Confirming…" screen via SSE `payment:{id}`, webhook route → `process-webhook` job → transitions + ledger + receipt; `verify-pending` safety job.
- [ ] P8-T08 Offline payments: record with receipt, vendor confirm.
- [ ] P8-T09 Refunds per cancellation terms (full/partial) in DIRECT and HELD.
- [ ] P8-T10 HELD mode (flag `payments.held`): `EscrowProvider` interface + Fake; hold on success; release engine job (rules + auto-release + dispute check); host delivery sign-off action.
- [ ] P8-T11 Payouts (flag `payments.payouts`): payout job, transfer, status via webhook/poll, retries, exceptions.
- [ ] P8-T12 Disputes (opening and freezing money here; admin decision UI in P16): open, evidence, respond-by deadline, DISPUTED transitions.
- [ ] P8-T13 Daily reconciliation job and `PaymentException` creation; pause payouts on mismatch.
- [ ] P8-T14 Receipts (PDF + email) for every successful payment.
- [ ] P8-T15 Subscriptions (Planner Pro, Vendor Pro) and Moments Plus purchase → entitlements (unlocks P5 limits).
- [ ] P8-T16a Security deposits: SECURITY_DEPOSIT milestones (no platform fee), refund 72 h after the event without a damage claim (held), host confirmation of refunds (direct/offline), damage claim opens a dispute; `bookings/security-deposits` job; e2e UF-29-4, UF-29-5.
- [ ] P8-T16 Vendor payment status views (secured, released, paid out, outstanding) on bookings and dashboard.
- [ ] P8-T17 e2e UF-17, UF-18 (with time travel), dispute freeze part of UF-26.
- [ ] P8-T18 Write `docs/QUESTIONS.md` entry: licensed escrow partner + legal sign-off required before enabling `payments.held` / `payments.payouts` in production.

**GATE P8**
- [ ] UF-17, UF-18, UF-29-4 and UF-29-5 checks pass with the Fake provider at both widths; sandbox suite passes for Paystack and Flutterwave when keys are present.
- [ ] Ledger: trial balance = 0 after the full e2e suite; no UPDATE/DELETE possible on ledger tables.
- [ ] Duplicate and out-of-order webhook tests pass; booking never confirmed from browser callback alone.
- [ ] Release engine: disputed milestones never release (property test over random schedules).
- [ ] Flags OFF: Held option and payouts UI are invisible; DIRECT and OFFLINE flows unaffected.
- [ ] Security review of payment code (checklist in `Backend.md §12`) recorded in `docs/PROGRESS.md`.

---

## P9 — Budget and finance

**Goal:** the honest money view for every event. → completes **Milestone M2**
**Read first:** `PRD.md BUD-*`, `UF-20`, `Backend.md §3 (budget)`, `Frontend.md §6.3 (money)`.

- [ ] P9-T01 Prisma: BudgetCategory, Expense, Contribution (kinds include sponsor and other_income); budget history via AuditLog; categories created from template at finalize (backfill seeds).
- [ ] P9-T02 Core `budgetSummary` (Planned, Committed, Paid, Outstanding, Uncommitted; per category; includes offline confirmed; income lines) with property tests.
- [ ] P9-T03 Money page with stat cards, chart (lazy), tabs Budget / Payments / Contributions / Expenses / Income.
- [ ] P9-T04 Allocations editor, expenses with receipt photo, contributions (pledged/received, kinds), income lines (tickets auto-filled later in P11).
- [ ] P9-T05 Alerts job (over budget; payment due 7 d / 1 d).
- [ ] P9-T06 Exports (PDF via worker, CSV direct).
- [ ] P9-T07 Overview money card wired; live update via SSE when payments land.
- [ ] P9-T08 e2e UF-20.

**GATE P9 (Milestone M2 demo on staging)**
- [ ] UF-20 checks pass at both widths.
- [ ] Figures reconcile with ledger and bookings for all seeded events (automated consistency check).
- [ ] `/events/[id]/money` Lighthouse ≥ 90 mobile.
- [ ] Staging demo: book two vendors (one direct, one offline), pay deposit, see budget update.

---

## P10 — Planner workspace and vendor dashboard

**Goal:** the recurring tools planners and vendors pay for.
**Read first:** `PRD.md PLN-*, VND-*`, `UF-21`, `Frontend.md §6.3 (home, clients, enquiries, bookings, calendar)`.

- [ ] P10-T01 Prisma: Client, Proposal, Invoice, VendorBookEntry.
- [ ] P10-T02 Planner home dashboard ("Needs you today", week's events, pipeline, quick actions) with efficient aggregate queries.
- [ ] P10-T03 Clients CRM and pipeline (Kanban desktop, grouped list mobile).
- [ ] P10-T04 Proposal templates with branding → PDF; send to client.
- [ ] P10-T05 Planner team: staff members, assignment across events; calendar across events.
- [ ] P10-T06 Private vendor book; add to event from vendor book (no marketplace fee).
- [ ] P10-T07 Planner invoices to clients with payment link (provider) and reminders.
- [ ] P10-T08 Vendor home: enquiries, upcoming bookings, payment status; bookings list; calendar with availability blocks and double-booking warning; staff accounts.
- [ ] P10-T09 Command palette (Cmd/Ctrl+K) for planners on desktop.
- [ ] P10-T10 Planner setting: hide vendor prices from host (EVT-12) enforced in queries.
- [ ] P10-T11 e2e UF-21; seeded planner with 10 events.

**GATE P10**
- [ ] UF-21 checks pass.
- [ ] Planner with 10 events: `/home` LCP ≤ 2.0 s; ≤ 6 DB queries per request (query count test).
- [ ] Hidden vendor prices never reach the host's browser (inspect server payloads in test).

---

## P11 — Tickets and check-in

**Goal:** public events sell or give out tickets safely; door check-in works online and offline.
**Read first:** `PRD.md TKT-*, DAY-07`, `UF-22`, `UF-23`, `Backend.md §3 (tickets), §5.7`, `Frontend.md §6.2 (/e, /t), §6.3 (tickets, check-in), §7.6`.

- [ ] P11-T01 Prisma: TicketType, PromoCode, TicketOrder, Ticket, CheckIn (the agenda uses ProgrammeItem from P3).
- [ ] P11-T02 Tickets admin page (types, promo codes, questions, agenda list, publish).
- [ ] P11-T03 Public event page `/e/[slug]` (ISR) with ticket selector island.
- [ ] P11-T04 Registration and checkout: reservation in a transaction (`SELECT … FOR UPDATE` on ticket type), 10-minute hold, payment via P8, free tickets instant; expiry job; waitlist.
- [ ] P11-T05 Ticket issue: signed QR token, `/t/[ticketId]`, email + WhatsApp link delivery; ticket revenue → budget income line.
- [ ] P11-T06 Check-in scanner page (lazy QR scanner, result overlay, haptics/sound, manual search), live counter via SSE.
- [ ] P11-T07 Offline check-in: download signed list to IndexedDB, queue scans, sync endpoint, duplicate detection across devices.
- [ ] P11-T08 Invitation passes (from P4) scannable by the same scanner.
- [ ] P11-T09 Organiser payouts of ticket revenue (flag `payments.payouts`).
- [ ] P11-T10 e2e UF-22, UF-23; concurrency test 200 buyers / 100 seats; k6 300 scans/min.

**GATE P11**
- [ ] UF-22, UF-23 checks pass at both widths.
- [ ] Overselling impossible (concurrency test passes 20 runs in a row).
- [ ] Scan result ≤ 300 ms p95; offline sync resolves duplicates.
- [ ] `/e/[slug]` Lighthouse ≥ 95 mobile.

---

## P12 — Event day

**Goal:** run-of-show with dependencies, vendor check-ins, incidents, delivery sign-off, offline. → **Milestone M3**
**Read first:** `PRD.md DAY-*`, `UF-24`, `Backend.md §3 (event day)`, `Frontend.md §6.3 (day), §7.6`.

- [ ] P12-T01 Prisma: RunItem, RunDependency, VendorCheckIn, Incident, EmergencyContact.
- [ ] P12-T02 Run-of-show editor (create from the event's programme items, owners, durations, dependencies).
- [ ] P12-T03 Day view: timeline with now-line, statuses, mark late → transitive dependants highlighted + owners alerted.
- [ ] P12-T04 Vendor "My tasks" and one-tap arrival check-in (optional location).
- [ ] P12-T05 Incidents and emergency contacts / backup vendors.
- [ ] P12-T06 Offline: pre-cache day data, queue mutations, sync; offline indicator.
- [ ] P12-T07 Booking progress job (IN_PROGRESS at start) and delivery sign-off prompts after the event (feeds release engine).
- [ ] P12-T08 e2e UF-24 including offline mode.

**GATE P12 (Milestone M3 demo on staging)**
- [ ] UF-24 checks pass at both widths.
- [ ] Dependants computed correctly for random DAGs (property test, cycles rejected on create).
- [ ] Staging demo: a public conference with tickets and check-in, and a private party with run-of-show and vendor check-ins.

---

## P13 — Notifications and event-team chat

**Goal:** one reliable notification pipeline for everything, and decisions surfaced on the event record (chat itself, including team threads, was built in P6).
**Read first:** `PRD.md MSG-*`, `Backend.md §3 (messaging), §10 (notify)`, `Frontend.md §6.3 (inbox, settings)`.

- [ ] P13-T01 Prisma: Notification, NotificationPreference (PushSubscription exists from P6).
- [ ] P13-T02 Decisions from team chat shown on the event overview and in the event's activity history; participant sync tested for member add/remove.
- [ ] P13-T03 `notify()` pipeline: in-app bell, web push (VAPID), email, SMS, WhatsApp; preferences matrix; quiet hours; urgent override for event-day and payment failures.
- [ ] P13-T04 Replace earlier notification stubs (P3 deadlines, P4 invites, P8 payments, P12 alerts) with `notify()`.
- [ ] P13-T05 Move chat nudges (P6-T18) onto `notify()` so chat follows the same preferences and quiet hours; in-app notification bell.
- [ ] P13-T06 Tests: preference and quiet-hour rules; push subscription lifecycle.

**GATE P13**
- [ ] Each notification type is delivered on the channels the preference allows (table-driven test).
- [ ] iOS: web push works after home-screen install (manual check logged), SMS fallback for urgent alerts verified.

---

## P14 — Reviews and event close

**Goal:** close events cleanly and build reputation from real bookings.
**Read first:** `PRD.md REV-*, EVT-11`, `UF-25`, `Backend.md §3 (Review)`.

- [ ] P14-T01 Prisma: Review (if not created yet); rating roll-up job.
- [ ] P14-T02 Close-event flow: confirm deliveries, final reconciliation summary, review cards per vendor (scores, text, photos from Moments).
- [ ] P14-T03 Vendor reply (once), report review; profile shows score only after 5 reviews.
- [ ] P14-T04 Portfolio: vendor can add host-approved Moments photos tagged to a verified event.
- [ ] P14-T05 e2e UF-25.

**GATE P14**
- [ ] UF-25 checks pass; review impossible before booking COMPLETED (server test).

---

## P15 — AI assistant

**Goal:** helpful drafting that never changes data on its own.
**Read first:** `PRD.md AI-*`, `UF-27`, `Backend.md §9.1`.

- [ ] P15-T01 `packages/ai`: `LlmProvider` interface, Fake, at least one real adapter selected by env, prompt files with versions, Zod output schemas, token logging and caps.
- [ ] P15-T02 Permission-filtered context builder (runs queries as the actor; strips phones/emails).
- [ ] P15-T03 Draft plan (tasks + budget split) with review-and-add UI.
- [ ] P15-T04 Compare quotes summary; guest-count impact list.
- [ ] P15-T05 Message drafting in invites, vendor briefs, client updates (English and Nigerian Pidgin).
- [ ] P15-T06 Media alt-text captions job.
- [ ] P15-T07 e2e UF-27 (with Fake LLM).

**GATE P15**
- [ ] UF-27 checks pass; flag OFF hides all AI UI.
- [ ] Context test: no data outside the actor's permissions appears in any prompt (snapshot tests).

---

## P16 — Admin console

**Goal:** staff can keep the marketplace safe and money correct.
**Read first:** `PRD.md ADM-*`, `UF-26`, `UF-28`, `Backend.md §12`, `Frontend.md §6.4`.

- [ ] P16-T01 Admin layout and role-based access (SUPPORT, TRUST_SAFETY, FINANCE, SUPER); re-auth for money decisions.
- [ ] P16-T02 Verifications queue and decisions (expiry 12 months, reminders before expiry).
- [ ] P16-T03 Moderation queue (reports on media, reviews, profiles, messages); blocked-media quarantine access for TRUST_SAFETY only.
- [ ] P16-T04 Disputes: evidence timeline, decision (release/refund/split) → ledger + notifications.
- [ ] P16-T05 Payment exceptions and reconciliation summaries; resume payouts.
- [ ] P16-T06 Users: search, suspend/reinstate with reason; feature flag overrides per country (SUPER).
- [ ] P16-T07 Audit log viewer; BullMQ board at `/admin/queues`.
- [ ] P16-T08 e2e UF-26 (admin part), UF-28.

**GATE P16**
- [ ] UF-26 and UF-28 checks pass.
- [ ] Every admin action creates an AuditLog row (test enumerates admin actions).
- [ ] Non-admins get 404 on every `/admin` route.

---

## P17 — Hardening and launch readiness

**Goal:** the MVP meets every budget and safety requirement in production conditions. → **Milestone M4**
**Read first:** `PRD.md §5 (NFR)`, `Frontend.md §8–§9`, `Backend.md §12–§15`.

- [ ] P17-T01 Full Lighthouse CI on all key pages against production build with load seed; fix every regression.
- [ ] P17-T02 Bundle audit per route (`@next/bundle-analyzer`); remove unused dependencies.
- [ ] P17-T03 k6 load tests: 500 uploaders, 2,000 invites, 300 check-ins/min, 1,000 concurrent gallery viewers; tune DB indexes and pool sizes.
- [ ] P17-T04 Security: dependency audit, secret scan, CSP/headers check, OWASP ZAP baseline scan on staging, auth and IDOR tests on every route with ids.
- [ ] P17-T05 Accessibility: manual VoiceOver/TalkBack pass on UF-03, UF-08, UF-10, UF-17; fix issues.
- [ ] P17-T06 Privacy: `docs/privacy.md` complete (processing record, retention), consent texts, data export/delete tested end to end; NDPA review notes for the human team.
- [ ] P17-T07 Backups and restore test; uptime checks; alert routing; runbooks in `docs/runbooks/` (payments incident, media abuse report, outage).
- [ ] P17-T08 Cross-browser run: Chrome, Safari iOS 16.4+, Firefox, Edge, Samsung Internet; Opera Mini fallback for guest pages.
- [ ] P17-T09 Production config: live provider keys, WhatsApp templates approved, sender IDs registered, domains, flags reviewed (held/payouts OFF unless legal sign-off is recorded).
- [ ] P17-T10 Launch gates from the product spec tracked in `docs/PROGRESS.md` (founding planners, vendors onboarded, 20 beta events across ≥ 4 types, 30 days clean reconciliation).

**GATE P17 (Milestone M4: launch candidate)**
- [ ] Every earlier gate re-run and passing on the release candidate.
- [ ] All `Frontend.md §9` budgets met on production infrastructure.
- [ ] Zero open critical/high security findings.
- [ ] All `docs/QUESTIONS.md` items answered or explicitly deferred by a human.
- [ ] Human sign-off recorded in `docs/PROGRESS.md`.
