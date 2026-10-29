# arc.md — Tiwa Architecture

This file fixes the technology choices and the shape of the system. Do not swap a technology without writing the reason in `decision.md`.

---

## 1. System overview

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    A["Web app: hosts, planners, vendors"]
    B["Guest pages: invites, tickets, Moments"]
    C["Admin console"]
  end
  subgraph WebApp["Next.js app - apps/web, on Vercel"]
    D["Server Components and Server Actions"]
    E["Route Handlers: webhooks, uploads, SSE"]
  end
  F[("PostgreSQL")]
  G[("Redis")]
  H["Worker - apps/worker, BullMQ jobs"]
  I[("Object storage: R2 and CDN")]
  subgraph External["External services"]
    J["Paystack / Flutterwave"]
    K["Resend email"]
    L["Termii SMS"]
    M["WhatsApp Cloud API"]
    N["Moderation API"]
    O["LLM API"]
  end
  A --> D
  B --> D
  C --> D
  B -- "direct multipart upload" --> I
  A -- "direct multipart upload" --> I
  D --> F
  E --> F
  D -- "enqueue" --> G
  G --> H
  H --> F
  H --> I
  H --> K
  H --> L
  H --> M
  H --> N
  H --> O
  D --> J
  J -- "webhooks" --> E
```

**Key ideas**

1. **One Next.js app** serves every page and all server logic (a modular monolith). No separate API service in the MVP.
2. **One worker process** runs background jobs (media processing, messages, reminders, payment release, reconciliation).
3. **Uploads skip the app servers**: browsers upload straight to object storage with pre-signed multipart URLs.
4. **Business logic lives in `packages/core`**, framework-free, so it can be tested alone and reused later by native apps.
5. **Every external service sits behind an adapter interface** with a `Fake` implementation for local work and tests.

---

## 2. Technology stack

Use the latest **stable** version of each tool at project start and pin exact versions in `pnpm-lock.yaml`. Record the versions you installed in the table at the end of this section.

| Concern | Choice | Why / notes |
|---------|--------|-------------|
| Runtime | Node.js active LTS | Same runtime for web and worker |
| Package manager | pnpm (workspaces) | Fast, strict |
| Monorepo tasks | Turborepo | Cached `build`, `lint`, `test` |
| Language | TypeScript `strict` | Shared types end to end |
| Web framework | Next.js, App Router | Server Components, streaming, Server Actions, edge caching |
| UI library | React (version bundled with Next.js) | |
| Styling | Tailwind CSS + CSS variables (tokens) | No runtime CSS-in-JS |
| Components | shadcn/ui (Radix primitives), copied into `packages/ui` | Accessible, owned code |
| Icons | lucide-react | Tree-shakable |
| Forms | React Hook Form + Zod (`@hookform/resolvers`) | One schema for client and server |
| Client data (live screens only) | TanStack Query | Gallery, invite tracking, check-in |
| Lists | TanStack Virtual | Galleries, long tables |
| i18n | next-intl | `messages/en.json` |
| Database | PostgreSQL 16+ (Neon or Supabase in prod; Docker locally) | Extensions: `pg_trgm`, `postgis`, `citext` |
| ORM | Prisma | Migrations committed |
| Cache / queues | Redis 7 + BullMQ | Upstash or managed Redis in prod |
| Auth | Better Auth (phone-number OTP, magic link, Google) | Sessions in Postgres |
| Object storage | Cloudflare R2 (S3 API); MinIO locally | Private bucket + public CDN bucket for thumbnails. "S3" here is only the name of the standard storage protocol R2 speaks; no AWS account is used. The code talks to R2 with the S3-compatible SDK (@aws-sdk/client-s3, endpoint set to R2). |
| Uploads (browser) | Uppy (`@uppy/aws-s3` multipart) | Resumable, parallel |
| Image processing | sharp (worker) | AVIF/WebP, sizes 320 and 1080 |
| Video processing | ffmpeg (worker container) | H.264 720p + poster frame |
| Payments | Paystack + Flutterwave adapters | `PaymentProvider`, `PayoutProvider`, `EscrowProvider` |
| Email | Resend + React Email | |
| SMS | Termii | |
| WhatsApp | Meta WhatsApp Cloud API; `wa.me` links as free mode | |
| Content moderation | `ModerationProvider` adapter (e.g. AWS Rekognition, Google Vision SafeSearch, or Hive) + Cloudflare CSAM Scanning Tool on the media domain | |
| LLM | `LlmProvider` adapter (any provider: Anthropic, OpenAI, Google, open models) | Default model set by env var |
| PWA | Serwist (service worker) + web manifest | Offline event day and check-in |
| QR | `qrcode` (generate), `@zxing/browser` or `BarcodeDetector` API (scan) | Scanner loaded on demand |
| PDF | `@react-pdf/renderer` in worker | Receipts, guestbook, budget export |
| Testing | Vitest, Playwright, axe-core, Lighthouse CI, size-limit, k6 | |
| Errors | Sentry (web + worker) | |
| Product analytics | PostHog (after consent) | |
| Hosting | Vercel (web), Fly.io or Railway (worker), Neon/Supabase (DB), Upstash (Redis), Cloudflare (R2 + DNS + CDN) | |
| CI | GitHub Actions | |

### Installed versions (fill in during Phase 0)

Recorded 2026-10-28 at the P0 gate; upgraded 2026-10-28 (Next 16.4.3, React 19.3.1, Sentry 11.10.0, next-intl 4.14.9). Webpack pinned for builds (`--webpack`) — Turbopack cannot express the NodeNext `.js`→`.ts` extension mapping yet. (pinned in `pnpm-lock.yaml`; CI runs Node 22):

| Tool | Version |
|------|---------|
| Node.js | 22 (CI) — local dev 23.11.0, engines `>=20 <24` |
| pnpm | 9.15.9 |
| Next.js | 16.4.3 (webpack build; Turbopack can't map NodeNext `.js` imports yet) |
| React | 19.3.1 |
| Prisma | 6.19.3 (+ @prisma/client 6.19.3) |
| Tailwind CSS | 4.1.3 |
| Better Auth | — (P2) |
| BullMQ | 5.15.0 (+ ioredis 5.4.2) |
| TypeScript | 5.9.3 |
| ESLint | 9.39.5 |
| Vitest | 3.2.7 (+ fast-check 3.23.2) |
| Playwright | 1.64.1 (chromium + webkit) |
| Zod | 3.23.8 |
| Pino | 9.6.0 |
| Sentry SDKs | @sentry/nextjs + @sentry/node 11.10.0 (`withSentryConfig` now under `@sentry/nextjs/config`) |
| Serwist | 9.5.13 (injectManifest, precache + runtime cache static assets) |

---

## 3. Repository layout

```
tiwa/
├─ AGENTS.md  PRD.md  arc.md  user_flow.md  Backend.md  Frontend.md  BUILD_PLAN.md  decision.md
├─ docs/
│  ├─ PROGRESS.md        # one line per finished task, gate results
│  ├─ QUESTIONS.md       # open questions for humans
│  └─ privacy.md         # record of processing activities
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (marketing)/           # /, /vendors, /venues, /planners, /pricing, /help, /legal
│  │  │  ├─ (auth)/                # /login, /signup, /onboarding
│  │  │  ├─ (app)/                 # signed-in app with AppShell layout
│  │  │  │  ├─ home/
│  │  │  │  ├─ events/
│  │  │  │  │  ├─ new/
│  │  │  │  │  └─ [eventId]/        # overview, plan, vendors, quotes, bookings, money,
│  │  │  │  │                       # guests, invites, tickets, moments, day, check-in, settings
│  │  │  │  ├─ inbox/  clients/  enquiries/  bookings/  calendar/
│  │  │  │  ├─ business/  billing/  settings/
│  │  │  ├─ (guest)/               # /i/[token], /e/[slug], /t/[ticketId], /m/[code]
│  │  │  ├─ admin/
│  │  │  ├─ api/                   # route handlers: webhooks, uploads, sse, ics, rsvp
│  │  │  └─ dev/ui/                # component gallery (not in production build)
│  │  ├─ components/               # app-specific composed components
│  │  ├─ lib/                      # server helpers: session, authorize wrapper, action wrapper
│  │  ├─ messages/en.json
│  │  ├─ public/                   # icons, manifest
│  │  ├─ e2e/                      # Playwright tests
│  │  └─ next.config.ts
│  └─ worker/
│     ├─ src/
│     │  ├─ queues.ts              # queue names + connection
│     │  ├─ jobs/                  # one file per job
│     │  ├─ schedules.ts           # repeatable jobs (cron)
│     │  └─ index.ts
│     └─ Dockerfile                # includes ffmpeg
├─ packages/
│  ├─ db/          # prisma/schema.prisma, migrations, seed/, client export
│  ├─ core/        # domain modules: events, guests, invites, tickets, moments, marketplace,
│  │               # quotes, bookings, payments, ledger, budget, planner, vendor, day,
│  │               # messaging, reviews, ai, admin, auth (authorize), shared (money, time, ids)
│  ├─ ui/          # tokens.css, tailwind preset, components
│  ├─ config/      # env.ts, flags.ts, countries/, event-types/, pricing.ts, vendor-categories.ts
│  ├─ payments/    # interfaces + paystack/, flutterwave/, fake/
│  ├─ messaging/   # email/, sms/, whatsapp/, push/ adapters + fake/
│  ├─ storage/     # S3/R2 client, signed URLs
│  ├─ moderation/  # ModerationProvider + fake
│  ├─ ai/          # LlmProvider + prompts + permission filter + fake
│  └─ testing/     # factories, test DB helpers
├─ infra/
│  ├─ docker-compose.yml   # postgres, redis, minio, mailpit
│  └─ k6/                  # load tests
├─ .github/workflows/ci.yml
├─ .env.example
├─ turbo.json  pnpm-workspace.yaml  package.json  tsconfig.base.json
└─ lighthouserc.json  .size-limit.json
```

### Dependency rules (enforced with ESLint `import/no-restricted-paths` or dependency-cruiser)

| Package | May import | Must not import |
|---------|------------|-----------------|
| `core` | `db`, `config`, adapter **interfaces** | `next`, `react`, `apps/*`, adapter implementations |
| `ui` | `react`, Radix, Tailwind | `db`, `core`, `next/server` |
| `apps/web` | everything | — |
| `apps/worker` | `core`, `db`, `config`, adapters | `next`, `react`, `ui` |
| adapters (`payments`, `messaging`…) | `config` | `core`, `db` |

---

## 4. Request lifecycle

### Read (page load)

1. Request hits Vercel edge. Static/ISR pages are served from cache.
2. Dynamic page: Server Component calls `getSession()` then a **query function** in `packages/core/<module>/queries.ts`.
3. Query function calls `authorize(user, 'event.view', { eventId })`, then Prisma.
4. HTML streams to the browser; `loading.tsx` skeleton shows first.

### Write (mutation)

1. Client form calls a Server Action (`apps/web/app/.../actions.ts`) wrapped by `action()` from `apps/web/lib/action.ts`.
2. The wrapper: parses input with Zod → loads session → calls the **command** in `packages/core/<module>/commands.ts` → maps known errors to user messages → revalidates tags.
3. The command calls `authorize()`, runs business rules, writes in a transaction, writes `AuditLog` where required, and enqueues jobs **after commit** (outbox pattern: insert into `OutboxEvent`, a worker job publishes to BullMQ).
4. UI updates optimistically; on error it rolls back and shows a toast.

### Live updates

Server-Sent Events from `app/api/sse/...` route handlers. The handler subscribes to a Redis pub/sub channel (`gallery:{id}`, `invites:{eventId}`, `checkin:{eventId}`, `day:{eventId}`, and for chat one stream per user: `inbox:user:{id}` + `inbox:org:{orgId}` for each business they belong to). Commands publish to the channel after commit. Client falls back to polling every 10 s if SSE disconnects 3 times.

---

## 5. Uploads (Moments, documents, portfolio)

```mermaid
sequenceDiagram
  participant B as Browser (Uppy)
  participant W as Next.js /api/uploads
  participant S as R2
  participant Q as Redis/Worker
  B->>W: POST /api/uploads/create {galleryCode, fileName, size, type}
  W->>W: validate limits, rate limit, create MediaItem(UPLOADING)
  W-->>B: uploadId + key
  loop each part (5 MB)
    B->>W: POST /api/uploads/sign-part
    W-->>B: pre-signed part URL
    B->>S: PUT part
  end
  B->>W: POST /api/uploads/complete {parts}
  W->>S: CompleteMultipartUpload
  W->>Q: enqueue media.process(mediaItemId)
  Q->>S: read original, write 320/1080/blur, strip EXIF GPS
  Q->>Q: moderation.scan → PUBLISHED | PENDING_REVIEW | BLOCKED
  Q-->>B: SSE gallery:{id} new item
```

- Originals in private bucket `tiwa-media-private`; derived sizes in `tiwa-media-public` behind CDN with unguessable keys (`/{galleryId}/{uuid}_1080.webp`). Private galleries use signed CDN URLs (expiry 1 h).
- Before upload, the browser resizes images (longest side 2560 px, quality 0.82) using `createImageBitmap` + `OffscreenCanvas` in a Web Worker.

---

## 6. Payments architecture

```mermaid
flowchart LR
  subgraph CorePayments["packages/core/payments"]
    P["PaymentService"]
    L["Ledger"]
    R["ReleaseEngine"]
  end
  P --> PP["PaymentProvider: Paystack, Flutterwave or Fake"]
  R --> PO["PayoutProvider: Paystack, Flutterwave or Fake"]
  R --> EP["EscrowProvider: licensed partner or Fake"]
  P --> L
  R --> L
```

- **DIRECT** mode: checkout with the vendor's provider subaccount as split recipient; Tiwa fee as the platform share. Ledger: `clearing → vendor:external` and `clearing → revenue:fees`.
- **HELD** mode (flag `payments.held`): money lands in the partner escrow account; ledger `clearing → held:booking:{id}`; release moves `held → payable:org:{id}` and `held → revenue:fees`; payout moves `payable → clearing:payout`.
- **OFFLINE** mode: no provider; ledger entries with account `offline:booking:{id}` for reporting only (not real balances).
- Details, state machines and rules: `Backend.md §7–§8`.

---

## 7. Environments

| Env | URL | Database | Payments | Messaging | Flags |
|-----|-----|----------|----------|-----------|-------|
| local | http://localhost:3000 | Docker Postgres | Fake providers | Fake (Mailpit for email) | all ON |
| preview | per pull request on Vercel | Neon branch per PR | Paystack/Flutterwave test keys | Fake | all ON |
| staging | staging.tiwa.app | Neon `staging` | Test keys | Real, sandbox numbers only | all ON |
| production | tiwa.app | Neon `main` | Live keys | Real | per `packages/config/flags.ts` + admin overrides |

Domains are placeholders until the trademark and domain check in the product spec is done.

---

## 8. Environment variables (`.env.example`)

Validated at start-up by `packages/config/env.ts` (Zod). The app refuses to start if a required variable is missing.

```
# App
APP_URL=http://localhost:3000
APP_ENV=local                      # local | preview | staging | production
DEFAULT_COUNTRY=NG

# Database & cache
DATABASE_URL=postgresql://tiwa:tiwa@localhost:5432/tiwa
DIRECT_DATABASE_URL=               # for migrations when using a pooler
REDIS_URL=redis://localhost:6379

# Auth
AUTH_SECRET=                       # 32+ random bytes
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Storage
S3_ENDPOINT=http://localhost:9090
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_PRIVATE=tiwa-media-private
S3_BUCKET_PUBLIC=tiwa-media-public
MEDIA_CDN_URL=http://localhost:9090/tiwa-media-public
MEDIA_URL_SIGNING_KEY=

# Payments
PAYMENT_PROVIDER=fake              # fake | paystack | flutterwave
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_WEBHOOK_HASH=
ESCROW_PROVIDER=fake               # fake | <partner>
PLATFORM_FEE_BPS=500               # 5.00%

# Messaging
EMAIL_PROVIDER=fake                # fake | resend
RESEND_API_KEY=
EMAIL_FROM="Tiwa <hello@tiwa.app>"
SMS_PROVIDER=fake                  # fake | termii
TERMII_API_KEY=
TERMII_SENDER_ID=Tiwa
WHATSAPP_PROVIDER=fake             # fake | cloud
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=

# Moderation & AI
MODERATION_PROVIDER=fake
MODERATION_API_KEY=
LLM_PROVIDER=fake                  # fake | anthropic | openai | google | ...
LLM_API_KEY=
LLM_MODEL_DRAFT=                   # larger model for drafting
LLM_MODEL_FAST=                    # small model for captions/classification

# Observability
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
```

---

## 9. Background jobs (overview)

Full list with payloads in `Backend.md §10`.

| Queue | Jobs |
|-------|------|
| `media` | `process-image`, `process-video`, `moderate`, `build-zip`, `purge-expired-galleries` |
| `messaging` | `send-invite`, `send-reminder`, `send-notification`, `send-ticket`, `send-receipt` |
| `payments` | `process-webhook`, `release-check` (every 5 min), `execute-payout`, `reconcile-daily` (02:00 WAT), `create-subaccount` |
| `events` | `deadline-alerts` (hourly), `close-event-followups`, `publish-outbox` (every 2 s) |
| `ai` | `caption-media`, `draft-plan` |
| `maintenance` | `retention-purge` (daily), `refresh-search-index` |

---

## 10. Observability and operations

- **Sentry** in web (client + server) and worker; tag `eventId`, `orgId`, never names/phones/emails.
- **Structured logs** (pino) with request id; worker logs job id and attempts.
- **Uptime checks**: `/api/health` (DB + Redis) every minute; alert to the team's chat/email.
- **Dashboards**: queue depth and failure rate (BullMQ board at `/admin/queues`, admin only), Core Web Vitals (Vercel Speed Insights), payment exceptions count.
- **Backups**: provider point-in-time recovery + daily logical dump to R2; monthly restore test.
- **Region**: choose the database region with the lowest measured latency to Lagos and pin Vercel functions to the same region. Record the measurement in `decision.md`.

---

## 11. Architecture decisions (summary)

| # | Decision | Reason |
|---|----------|--------|
| AD-1 | Modular monolith in Next.js + one worker | Fewer moving parts for the MVP; can split later |
| AD-2 | Business logic in `packages/core` | Testable, reusable by native apps later |
| AD-3 | Adapters + Fake implementations for all third parties | Build and test without credentials; swap providers |
| AD-4 | Direct-to-storage uploads | Large events don't overload the app |
| AD-5 | Double-entry ledger | Required once Tiwa holds or routes money |
| AD-6 | SSE + Redis pub/sub for live updates | Simple, works through CDNs, no extra vendor |
| AD-7 | Outbox pattern for jobs | No lost jobs when a transaction commits |
| AD-8 | Guest identity by signed tokens | No accounts for guests; revocable |
