# Backend.md — Tiwa Backend Specification

Covers the database, business rules, permissions, server actions, APIs, background jobs, payments, ledger, integrations and security. Read `arc.md` first for the stack and repo layout.

---

## 1. Principles

1. **Core holds the rules.** Every business rule is a function in `packages/core/<module>/`. Server Actions, route handlers and jobs are thin wrappers that call core.
2. **Commands and queries.** Each module exports `commands.ts` (writes) and `queries.ts` (reads). Each command: validate input (Zod) → `authorize()` → rules → one DB transaction → audit → outbox events.
3. **Typed errors.** Core throws `DomainError` subclasses (`NotFound`, `Forbidden`, `Conflict`, `ValidationFailed`, `InvalidTransition`, `LimitReached`). Wrappers map them to HTTP codes / form errors. Never leak stack traces to users.
4. **Idempotency.** Commands that create money movements, send messages or create bookings accept an `idempotencyKey` and store it in `IdempotencyKey` (unique).
5. **Time.** Store UTC. Convert with the event's `timezone` using `date-fns-tz`.
6. **Money.** `BigInt` minor units + `currency`. Helper `packages/core/shared/money.ts`: `add`, `sub`, `mulBps(amount, bps)` (rounds half-up to minor unit), `allocate(amount, ratios)` (largest-remainder, sums exactly), `format` is UI-only.
7. **IDs.** UUID v7 (`@default(uuid(7))`). Public slugs: `nanoid(10)` lowercase alphanumeric. Guest tokens: 32 random bytes base64url.

---

## 2. Core module map

| Module (`packages/core/…`) | Main commands | Main queries |
|---|---|---|
| `auth` | `authorize`, `createGuestSession` | `getPermissions` |
| `accounts` | `completeOnboarding`, `updateProfile`, `exportMyData`, `deleteMyAccount` | `getMe` |
| `orgs` | `createOrg`, `inviteMember`, `updateMemberRole`, `removeMember` | `getOrg`, `listMyOrgs` |
| `events` | `createEventDraft`, `updateEventStep`, `finalizeEvent`, `updateEvent`, `duplicateEvent`, `cancelEvent`, `closeEvent`, `addParticipant`, `updateParticipant`, `removeParticipant` | `getEventOverview`, `listMyEvents` |
| `tasks` | `createTask`, `updateTask`, `completeTask`, `addDependency` | `listTasks` |
| `guests` | `addGuests`, `importGuestsCsv`, `updateGuest`, `mergeGuests`, `deleteGuests`, `createTable`, `assignTable` | `listGuests`, `headcount` |
| `invites` | `enableInvites`, `createInviteBatch`, `sendInviteBatch`, `markSentManually`, `respondRsvp`, `sendUpdate`, `setReminderPolicy`, `revokeInvite`, `toggleSharedLink` | `listInvites`, `inviteStats`, `getInviteByToken` |
| `tickets` | `createTicketType`, `updateTicketType`, `createPromo`, `reserveTickets`, `confirmTicketOrder`, `expireReservations`, `joinWaitlist` | `getPublicEvent`, `ticketSales` |
| `checkin` | `checkIn`, `syncOfflineCheckins` | `checkinStats`, `offlineList` |
| `moments` | `createUpload`, `completeUpload`, `processMedia`, `moderateMedia`, `updateGallerySettings`, `deleteOwnMedia`, `requestRemoval`, `publishOfficialAlbum`, `requestZip`, `addGuestbookMessage` | `listGallery`, `slideshowFeed` |
| `marketplace` | `upsertBusinessProfile`, `upsertPackage`, `upsertVenueSpace`, `blockAvailability`, `unblockAvailability`, `publishProfile`, `submitVerification` | `searchVendors`, `searchVenues`, `searchPlanners`, `getBusinessProfile`, `spaceAvailability` |
| `quotes` | `requestQuotes`, `createQuote`, `sendQuote`, `declineQuote`, `acceptQuote`, `instantBook` (venues/vendors with instant booking) | `listQuotesForEvent`, `compareQuotes`, `listEnquiries` |
| `venues` | `requestSiteVisit`, `respondSiteVisit`, `completeSiteVisit` | `listSiteVisits` |
| `bookings` | `requestChange` (creates a PROPOSED version), `respondChange`, `markDelivered`, `signOffDelivery`, `cancelBooking`, `expireHolds`, `settleSecurityDeposit` | `getBooking`, `listVendorBookings` |
| `payments` | `startCheckout`, `handleWebhook`, `recordOfflinePayment`, `confirmOfflinePayment`, `refund`, `releaseDueMilestones`, `executePayout`, `setupBankAccount`, `reconcileDay` | `paymentStatus`, `bookingMoney` |
| `ledger` | `post(transaction)` (internal only) | `balance(account)`, `trialBalance()` |
| `budget` | `setAllocations`, `addExpense`, `addContribution`, `recordContributionReceived` | `budgetSummary`, `budgetExport` |
| `planner` | `createClient`, `moveLead`, `createProposal`, `createInvoice`, `addToVendorBook` | `plannerDashboard`, `listClients` |
| `day` | `createRunItem`, `updateRunItem`, `markLate`, `vendorCheckIn`, `logIncident`, `resolveIncident` | `runOfShow`, `dependants` |
| `chat` | `startThread`, `sendMessage`, `editMessage`, `deleteMessage`, `markRead`, `markDelivered`, `setTyping`, `muteThread`, `archiveThread`, `blockParty`, `unblockParty`, `reportMessage`, `markDecision` | `listInbox`, `getThread`, `listMessages`, `searchInbox`, `canMessage` |
| `messaging` | `notify`, `setPreferences` | `listNotifications` |
| `reviews` | `createReview`, `replyToReview`, `reportReview` | `vendorRating` |
| `disputes` | `openDispute`, `addEvidence`, `decideDispute` | `getDispute` |
| `ai` | `draftPlan`, `compareQuotes`, `draftMessage`, `captionMedia` | — |
| `admin` | `decideVerification`, `moderate`, `suspendUser`, `reinstateUser`, `resolvePaymentException`, `setFlagOverride` | `queues`, `auditLog` |
| `subscriptions` | `startSubscription`, `cancelSubscription`, `buyMomentsPlus` | `entitlements` |

---

## 3. Database schema

File: `packages/db/prisma/schema.prisma`. Write it as below, then run `pnpm prisma format` (it adds any missing back-relation fields) and create the first migration. Auth tables (`user`, `session`, `account`, `verification`) are generated by Better Auth's Prisma adapter; extend `User` as shown.

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma"
  previewFeatures = ["postgresqlExtensions"]
}

// Prisma 7+: connection URLs are NOT in this file. See prisma.config.ts and client.ts below.
datasource db {
  provider   = "postgresql"
  extensions = [pg_trgm, postgis, citext]
}

// ───────────── Accounts & organisations ─────────────

model User {
  id            String    @id @default(uuid(7))
  name          String
  email         String?   @unique @db.Citext
  emailVerified Boolean   @default(false)
  phone         String?   @unique           // E.164
  phoneVerified Boolean   @default(false)
  image         String?
  locale        String    @default("en")
  countryCode   String    @default("NG")
  isAdmin       Boolean   @default(false)
  adminRole     AdminRole?
  suspendedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?
  memberships   Membership[]
  participants  EventParticipant[]
}

enum AdminRole {
  SUPPORT
  TRUST_SAFETY
  FINANCE
  SUPER
}

model Organization {
  id           String   @id @default(uuid(7))
  kind         OrgKind
  name         String
  slug         String   @unique
  countryCode  String
  city         String?
  logoKey      String?
  verification VerificationStatus @default(NONE) // cache of the latest BusinessVerification decision (for fast search filters)
  verifiedUntil DateTime?                       // cache, same source
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
  members      Membership[]
  profile      BusinessProfile?
  bankAccounts BankAccount[]
}

enum OrgKind {
  PLANNER
  VENDOR
  HOST_ORG
}
enum VerificationStatus {
  NONE
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

model Membership {
  id     String  @id @default(uuid(7))
  orgId  String
  userId String
  role   OrgRole
  org    Organization @relation(fields: [orgId], references: [id])
  user   User         @relation(fields: [userId], references: [id])
  @@unique([orgId, userId])
}

enum OrgRole {
  OWNER
  ADMIN
  STAFF
}

// ───────────── Events ─────────────

model Event {
  id             String       @id @default(uuid(7))
  slug           String       @unique
  type           String                       // template key from packages/config
  format         EventFormat
  status         EventStatus  @default(DRAFT)
  name           String
  description    String?
  coverKey       String?
  themeColor     String?
  visibility     Visibility   @default(PRIVATE)
  countryCode    String
  currency       String
  timezone       String
  startsAt       DateTime?
  endsAt         DateTime?
  expectedGuests Int?
  plannedBudgetMinor BigInt   @default(0)   // total budget; "unallocated" = this − sum(BudgetCategory.plannedMinor)
  invitesEnabled Boolean      @default(false)
  ticketsEnabled Boolean      @default(false)
  momentsEnabled Boolean      @default(true)
  sharedLinkEnabled Boolean   @default(false)
  allowForwarding Boolean     @default(true)
  hostCanSeeVendorPrices Boolean @default(true)
  wizardStep     String?
  createdById    String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  cancelledAt    DateTime?
  closedAt       DateTime?
  deletedAt      DateTime?
  participants   EventParticipant[]
  days           EventDay[]
  tasks          Task[]
  guests         Guest[]
  bookings       Booking[]
  gallery        Gallery?
  @@index([status, startsAt])
}

enum EventFormat {
  PRIVATE_CELEBRATION
  CORPORATE
  PUBLIC_TICKETED
  COMMUNITY
}
enum EventStatus {
  DRAFT
  ACTIVE
  CANCELLED
  COMPLETED
}
enum Visibility {
  PRIVATE
  LINK_ONLY
  PUBLIC
}

model EventParticipant {
  id          String    @id @default(uuid(7))
  eventId     String
  userId      String?
  orgId       String?                       // planner or vendor org
  role        EventRole
  permissions Json      @default("{}")      // see §4.3
  invitedEmail String?
  invitedPhone String?
  acceptedAt  DateTime?
  removedAt   DateTime?
  event       Event @relation(fields: [eventId], references: [id])
  user        User? @relation(fields: [userId], references: [id])
  @@index([eventId, role])
  @@index([userId])
}

enum EventRole {
  HOST
  CO_HOST
  PLANNER
  PLANNER_STAFF
  VENDOR
  PHOTOGRAPHER
}

model EventDay {
  id        String   @id @default(uuid(7))
  eventId   String
  date      DateTime @db.Date
  title     String?
  venueName String?
  address   String?
  lat       Float?
  lng       Float?
  event     Event    @relation(fields: [eventId], references: [id])
  programme ProgrammeItem[]
}

// One model for the event's programme: ceremony segments, conference sessions, performances.
// Created from the event-type template. `isPublic` items appear on guest/public pages (the agenda);
// Moments groups photos by these items. Backstage work lives in RunItem (event day), not here.
model ProgrammeItem {
  id        String   @id @default(uuid(7))
  eventId   String
  dayId     String?
  key       String?                    // template key, e.g. "reception", "keynote"
  title     String
  startsAt  DateTime?
  endsAt    DateTime?
  room      String?
  speakers  String[]
  isPublic  Boolean  @default(true)
  sortOrder Int      @default(0)
  day       EventDay? @relation(fields: [dayId], references: [id])
  @@index([eventId, startsAt])
}

model Task {
  id          String     @id @default(uuid(7))
  eventId     String
  title       String
  notes       String?
  timeframe   String?                // template bucket e.g. "12w", "1w", "day", "after"
  dueAt       DateTime?
  ownerUserId String?
  ownerOrgId  String?
  priority    Priority   @default(NORMAL)
  status      TaskStatus @default(TODO)
  completedAt DateTime?
  sortOrder   Int        @default(0)
  event       Event      @relation(fields: [eventId], references: [id])
  @@index([eventId, status, dueAt])
}

enum Priority {
  LOW
  NORMAL
  HIGH
}
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
  BLOCKED
}

model TaskDependency {
  taskId      String
  dependsOnId String
  @@id([taskId, dependsOnId])
}

model Document {
  id          String   @id @default(uuid(7))
  eventId     String?
  bookingId   String?
  uploadedById String
  name        String
  storageKey  String
  mime        String
  sizeBytes   Int
  createdAt   DateTime @default(now())
}

// ───────────── Guests & invites ─────────────

model Guest {
  id          String   @id @default(uuid(7))
  eventId     String
  name        String
  phone       String?
  email       String?  @db.Citext
  groupIds    String[]
  plusOnesAllowed Int  @default(0)
  plusOnes    Int      @default(0)
  meal        String?
  dietary     String?
  answers     Json     @default("{}")
  tableId     String?
  source      GuestSource @default(MANUAL)
  rsvp        RsvpStatus  @default(NONE)
  respondedAt DateTime?
  checkedInAt DateTime?        // cache of the first OK CheckIn row (CheckIn keeps the full log)
  // Invitation (one per guest, so it lives on the guest)
  inviteToken     String?   @unique   // personal link /i/{token}; created on first send
  inviteRevokedAt DateTime?
  inviteOpenedAt  DateTime?
  remindersSent   Int       @default(0)
  createdAt   DateTime @default(now())
  deletedAt   DateTime?
  event       Event    @relation(fields: [eventId], references: [id])
  deliveries  InviteDelivery[]
  @@index([eventId, rsvp])
  @@index([eventId, phone])
}

enum GuestSource {
  MANUAL
  PASTE
  CSV
  CONTACTS
  SHARED_LINK
  TICKET
}
enum RsvpStatus {
  NONE
  YES
  NO
  MAYBE
}

model GuestGroup {
  id      String @id @default(uuid(7))
  eventId String
  name    String
  color   String?
}

model SeatingTable {
  id       String @id @default(uuid(7))
  eventId  String
  name     String
  capacity Int
}

model InviteBatch {
  id          String   @id @default(uuid(7))
  eventId     String
  createdById String
  channels    InviteChannel[]
  smart       Boolean  @default(true)
  message     String
  kind        BatchKind @default(INVITE)    // INVITE | UPDATE | REMINDER
  audience    Json                          // {type: "all"|"group"|"ids"|"attending", ...}
  status      BatchStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  sentAt      DateTime?
}

enum BatchKind {
  INVITE
  UPDATE
  REMINDER
}
enum BatchStatus {
  DRAFT
  QUEUED
  SENDING
  DONE
  CANCELLED
}

model InviteDelivery {
  id           String        @id @default(uuid(7))
  guestId      String
  batchId      String
  channel      InviteChannel
  status       DeliveryStatus @default(QUEUED)
  providerRef  String?
  error        String?
  updatedAt    DateTime      @updatedAt
  guest        Guest         @relation(fields: [guestId], references: [id])
  @@index([batchId, status])
  @@index([guestId])
}

enum InviteChannel {
  LINK
  QR
  WHATSAPP_FREE
  WHATSAPP_API
  EMAIL
  SMS
}
enum DeliveryStatus {
  QUEUED
  SENT
  DELIVERED
  OPENED
  FAILED
  SENT_MANUALLY
}

// ───────────── Tickets & check-in ─────────────

model TicketType {
  id          String   @id @default(uuid(7))
  eventId     String
  name        String
  priceMinor  BigInt   @default(0)
  currency    String
  quantity    Int
  sold        Int      @default(0)
  reserved    Int      @default(0)
  maxPerOrder Int      @default(10)
  salesStart  DateTime?
  salesEnd    DateTime?
  sortOrder   Int      @default(0)
}

model PromoCode {
  id          String  @id @default(uuid(7))
  eventId     String
  code        String
  percentOff  Int?
  amountOffMinor BigInt?
  maxUses     Int?
  used        Int     @default(0)
  expiresAt   DateTime?
  @@unique([eventId, code])
}

model TicketOrder {
  id          String   @id @default(uuid(7))
  eventId     String
  buyerName   String
  buyerEmail  String   @db.Citext
  buyerPhone  String?
  items       Json                        // [{ticketTypeId, qty, unitMinor}]
  subtotalMinor BigInt
  discountMinor BigInt  @default(0)
  feeMinor    BigInt    @default(0)
  totalMinor  BigInt
  currency    String
  status      TicketOrderStatus @default(RESERVED)
  reservedUntil DateTime
  paymentId   String?
  answers     Json      @default("{}")
  createdAt   DateTime  @default(now())
  tickets     Ticket[]
  @@index([status, reservedUntil])
}

enum TicketOrderStatus {
  RESERVED
  PAID
  EXPIRED
  CANCELLED
  REFUNDED
}

model Ticket {
  id          String   @id @default(uuid(7))
  orderId     String
  ticketTypeId String
  holderName  String
  qrToken     String   @unique
  checkedInAt DateTime?        // cache of the first OK CheckIn row
  order       TicketOrder @relation(fields: [orderId], references: [id])
}

model CheckIn {
  id         String   @id @default(uuid(7))
  eventId    String
  ticketId   String?
  guestId    String?
  deviceId   String
  scannedAt  DateTime
  byUserId   String
  result     CheckInResult
  @@index([eventId, scannedAt])
}

enum CheckInResult {
  OK
  DUPLICATE
  INVALID
}
// The public agenda is ProgrammeItem (isPublic = true); there is no separate agenda model.

// ───────────── Moments ─────────────

model Gallery {
  id            String   @id @default(uuid(7))
  eventId       String   @unique
  code          String   @unique             // short public code for /m/{code}
  accessCode    String?                      // printed on cards for guests-only galleries
  privacy       GalleryPrivacy @default(LINK)
  moderation    ModerationMode @default(INSTANT)
  slideshowDelaySec Int @default(30)
  guestDownloads Boolean @default(true)
  showFooter    Boolean  @default(true)
  plan          GalleryPlan @default(FREE)
  itemLimit     Int      @default(500)
  expiresAt     DateTime?
  event         Event    @relation(fields: [eventId], references: [id])
  items         MediaItem[]
}

enum GalleryPrivacy {
  GUESTS_ONLY
  LINK
  PUBLIC
}
enum ModerationMode {
  INSTANT
  APPROVE_FIRST
}
enum GalleryPlan {
  FREE
  PLUS
}

model GuestSession {
  id         String   @id @default(uuid(7))
  galleryId  String
  name       String?
  blockedAt  DateTime?
  createdAt  DateTime @default(now())
}

model MediaItem {
  id           String     @id @default(uuid(7))
  galleryId    String
  album        Album
  uploaderUserId    String?
  uploaderSessionId String?
  kind         MediaKind
  state        MediaState @default(UPLOADING)
  originalKey  String
  thumbKey     String?
  largeKey     String?
  posterKey    String?           // video
  blurDataUrl  String?
  width        Int?
  height       Int?
  durationSec  Int?
  sizeBytes    Int
  sha256       String?
  takenAt      DateTime?
  caption      String?
  altText      String?
  featured     Boolean    @default(false)
  watermarked  Boolean    @default(false)
  moderationLabels Json?
  createdAt    DateTime   @default(now())
  deletedAt    DateTime?
  gallery      Gallery    @relation(fields: [galleryId], references: [id])
  @@index([galleryId, state, album, createdAt])
  @@index([galleryId, sha256])
}

enum Album {
  OFFICIAL
  GUEST
}
enum MediaKind {
  PHOTO
  VIDEO
}
enum MediaState {
  UPLOADING
  PROCESSING
  PENDING_REVIEW
  PUBLISHED
  HIDDEN
  BLOCKED
  FAILED
}

model GuestbookMessage {
  id        String   @id @default(uuid(7))
  galleryId String
  name      String?
  body      String
  hidden    Boolean  @default(false)
  createdAt DateTime @default(now())
}

// ───────────── Marketplace ─────────────

// One public profile per business. Organization.kind (PLANNER | VENDOR) says which kind it is.
// For vendors `categories` are vendor-category keys (caterer, venue, dj…); for planners they are specialisms.
model BusinessProfile {
  id           String   @id @default(uuid(7))
  orgId        String   @unique
  categories   String[]                       // keys from packages/config
  bio          String?
  city         String
  serviceAreaKm Int     @default(50)
  lat          Float?
  lng          Float?
  startingPriceMinor BigInt?
  currency     String
  travelFeeNote String?
  instantBook  Boolean  @default(false)       // venues/vendors that accept bookings without a quote step
  holdHours    Int      @default(72)          // provisional hold length before the deposit is due
  allowGuestEnquiries Boolean @default(true)  // guests of events this business worked on may message it after the event
  published    Boolean  @default(false)
  availabilityConfirmedAt DateTime?
  ratingAvg    Float?                         // cache, recomputed by marketplace/rating-rollup
  ratingCount  Int      @default(0)           // cache
  completedBookings Int @default(0)           // cache
  searchText   String?                        // denormalised for trigram search
  org          Organization @relation(fields: [orgId], references: [id])
  spaces       VenueSpace[]
  @@index([city])
}

// A bookable space inside a venue business: a hall, garden, rooftop, conference room.
// Only vendors with the "venue" category have spaces.
model VenueSpace {
  id            String   @id @default(uuid(7))
  profileId     String
  name          String                        // "Grand Hall", "Garden"
  indoor        Boolean  @default(true)
  capacitySeated   Int?                       // banquet / round tables
  capacityTheatre  Int?                       // rows of chairs
  capacityStanding Int?
  sizeSqm       Int?
  amenities     String[]                      // keys: parking, power_backup, air_conditioning, stage, changing_room, kitchen, sound_system, wheelchair_access
  rules         String?                       // e.g. curfew, decor limits, outside caterer policy
  slotPrices    Json                          // {"MORNING": "15000000", "EVENING": "25000000", "FULL_DAY": "40000000", "HOURLY": "3000000"} minor units as strings
  setupMinutes    Int    @default(120)        // included setup time before the slot
  teardownMinutes Int    @default(60)
  securityDepositMinor BigInt?                // refundable caution fee
  photoKeys     String[]
  active        Boolean  @default(true)
  profile       BusinessProfile @relation(fields: [profileId], references: [id])
}

enum DaySlot {
  MORNING
  AFTERNOON
  EVENING
  FULL_DAY
}

model PortfolioItem {
  id        String  @id @default(uuid(7))
  orgId     String
  kind      MediaKind
  key       String
  thumbKey  String?
  caption   String?
  eventId   String?            // verified Tiwa event (if from Moments)
  sortOrder Int     @default(0)
}

model ServicePackage {
  id          String  @id @default(uuid(7))
  orgId       String
  name        String
  description String?
  priceMinor  BigInt?
  currency    String
  includes    String[]
  addOns      Json    @default("[]")
  active      Boolean @default(true)
}

// A date (and optionally a venue space and slot) the business is not available.
// spaceId null = whole business unavailable. slot FULL_DAY blocks every slot that day.
// Unique index with NULLS NOT DISTINCT is added in a raw SQL migration (see "Migrations").
model AvailabilityBlock {
  id        String   @id @default(uuid(7))
  orgId     String
  spaceId   String?
  date      DateTime @db.Date
  slot      DaySlot  @default(FULL_DAY)
  bookingId String?                            // set when the block comes from a Tiwa booking or hold
  reason    String?                            // "Booked outside Tiwa", "Maintenance"
  @@index([orgId, date])
}

// Named BusinessVerification to avoid clashing with Better Auth's own `verification` table.
model BusinessVerification {
  id         String   @id @default(uuid(7))
  orgId      String
  status     VerificationStatus @default(PENDING)
  documents  Json                         // [{type, storageKey}]
  decidedBy  String?
  decidedAt  DateTime?
  reason     String?
  createdAt  DateTime @default(now())
}

model Shortlist {
  id      String @id @default(uuid(7))
  eventId String
  orgId   String
  @@unique([eventId, orgId])
}

// ───────────── Quotes & bookings ─────────────

model QuoteRequest {
  id          String   @id @default(uuid(7))
  eventId     String
  category    String
  vendorOrgId String
  brief       Json
  status      QuoteRequestStatus @default(OPEN)
  createdById String
  createdAt   DateTime @default(now())
  @@unique([eventId, category, vendorOrgId])
}

enum QuoteRequestStatus {
  OPEN
  QUOTED
  DECLINED_BY_VENDOR
  CLOSED
}

model Quote {
  id            String   @id @default(uuid(7))
  requestId     String?
  eventId       String
  vendorOrgId   String
  spaceId       String?                     // venue quotes: the space, date and slot offered
  serviceDate   DateTime? @db.Date
  slot          DaySlot?
  status        QuoteStatus @default(DRAFT)
  items         Json                        // [{name, qty, unitMinor}]
  taxBps        Int      @default(0)
  serviceBps    Int      @default(0)
  travelFeeMinor BigInt  @default(0)
  subtotalMinor BigInt
  totalMinor    BigInt
  currency      String
  notes         String?
  cancellationTerms String
  proposedSchedule Json                     // [{label, percentBps | amountMinor, due: "on_accept"|"days_before:N"|"date:YYYY-MM-DD"}]
  expiresAt     DateTime
  sentAt        DateTime?
  createdAt     DateTime @default(now())
}

enum QuoteStatus {
  DRAFT
  SENT
  CHANGES_REQUESTED
  ACCEPTED
  DECLINED
  EXPIRED
  WITHDRAWN
}

model Booking {
  id             String        @id @default(uuid(7))
  eventId        String
  vendorOrgId    String
  quoteId        String        @unique
  category       String
  spaceId        String?                     // venue bookings
  serviceDate    DateTime?     @db.Date
  slot           DaySlot?
  status         BookingStatus @default(ACCEPTED)
  paymentMode    PaymentMode
  holdExpiresAt  DateTime?                   // provisional hold: unpaid deposit by this time → CANCELLED, date freed
  currentVersion Int           @default(1)   // number of the ACCEPTED BookingVersion in force
  totalMinor     BigInt                      // cache of the current version's total
  currency       String
  deliveredAt    DateTime?
  signedOffAt    DateTime?
  completedAt    DateTime?
  cancelledAt    DateTime?
  createdAt      DateTime      @default(now())
  event          Event         @relation(fields: [eventId], references: [id])
  versions       BookingVersion[]
  milestones     PaymentMilestone[]
  @@index([vendorOrgId, status])
}

enum BookingStatus {
  ACCEPTED
  DEPOSIT_DUE
  CONFIRMED
  IN_PROGRESS
  DELIVERED
  COMPLETED
  CANCELLED
  DISPUTED
}
enum PaymentMode {
  DIRECT
  HELD
  OFFLINE
}

// Every version of a booking's agreed scope. A change request is simply a PROPOSED version:
// accepting it makes it ACCEPTED (and the previous one SUPERSEDED); declining keeps the old one in force.
model BookingVersion {
  id          String   @id @default(uuid(7))
  bookingId   String
  version     Int
  status      VersionStatus @default(PROPOSED)
  scope       Json                         // items, notes, deliverables, date/slot changes
  totalMinor  BigInt
  terms       String
  proposedById String
  reason      String?                      // why the change was requested (null for version 1)
  decidedAt   DateTime?
  acceptedByHostId   String?
  acceptedByHostAt   DateTime?
  acceptedByHostIp   String?
  acceptedByVendorId String?
  acceptedByVendorAt DateTime?
  createdAt   DateTime @default(now())
  booking     Booking  @relation(fields: [bookingId], references: [id])
  @@unique([bookingId, version])
}

enum VersionStatus {
  PROPOSED
  ACCEPTED
  DECLINED
  WITHDRAWN
  SUPERSEDED
}

model SiteVisit {
  id          String   @id @default(uuid(7))
  eventId     String?
  vendorOrgId String                          // the venue
  spaceId     String?
  requestedById String
  proposedTimes DateTime[]                    // up to 3 options
  confirmedAt DateTime?                       // the time the venue accepted
  status      String   @default("REQUESTED")  // REQUESTED | CONFIRMED | DECLINED | DONE | CANCELLED
  notes       String?
  createdAt   DateTime @default(now())
}

// ───────────── Money ─────────────

model PaymentMilestone {
  id            String   @id @default(uuid(7))
  bookingId     String
  kind          MilestoneKind @default(PAYMENT)
  label         String
  amountMinor   BigInt
  currency      String
  dueAt         DateTime?
  releaseRule   ReleaseRule @default(ON_PAYMENT)
  releaseAt     DateTime?                  // for ON_DATE
  autoReleaseAfterHours Int?
  state         MilestoneState @default(SCHEDULED)
  paidAt        DateTime?
  releasedAt    DateTime?
  booking       Booking  @relation(fields: [bookingId], references: [id])
  @@index([state, releaseAt])
}

enum MilestoneKind {  // SECURITY_DEPOSIT = refundable caution fee (venues, rentals)
  PAYMENT
  SECURITY_DEPOSIT
}
enum ReleaseRule {
  ON_PAYMENT
  ON_DATE
  ON_VENDOR_CHECK_IN
  ON_HOST_SIGNOFF
}
enum MilestoneState {
  SCHEDULED
  PENDING_PAYMENT
  PAID_DIRECT
  HELD
  RELEASED
  REFUNDED
  PARTLY_REFUNDED
  DISPUTED
  RECORDED_OFFLINE
  CONFIRMED_OFFLINE
}

model Payment {
  id           String   @id @default(uuid(7))
  purpose      PaymentPurpose
  milestoneId  String?
  ticketOrderId String?
  contributionId String?
  subscriptionId String?
  payerUserId  String?
  payerEmail   String?
  amountMinor  BigInt
  feeMinor     BigInt   @default(0)        // Tiwa platform fee
  currency     String
  provider     String
  providerRef  String   @unique            // our reference sent to provider
  providerTxnId String?
  status       PaymentStatus @default(PENDING)
  mode         PaymentMode
  expiresAt    DateTime
  paidAt       DateTime?
  createdAt    DateTime @default(now())
  @@index([status, createdAt])
}

enum PaymentPurpose {
  BOOKING_MILESTONE
  TICKET_ORDER
  CONTRIBUTION
  SUBSCRIPTION
  MOMENTS_PLUS
}
enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  EXPIRED
  REFUNDED
  PARTLY_REFUNDED
}

model ProviderEvent {
  id          String   @id @default(uuid(7))
  provider    String
  eventKey    String                       // provider event id or hash of body
  type        String
  payload     Json
  processedAt DateTime?
  error       String?
  receivedAt  DateTime @default(now())
  @@unique([provider, eventKey])
}

model BankAccount {
  id            String   @id @default(uuid(7))
  orgId         String?
  userId        String?                    // hosts receiving contributions
  bankCode      String
  accountNumberLast4 String
  accountName   String
  provider      String
  subaccountCode String?                   // provider split recipient
  recipientCode  String?                   // provider transfer recipient
  verifiedAt    DateTime?
  payoutsPausedUntil DateTime?
  isDefault     Boolean  @default(true)
  createdAt     DateTime @default(now())
  org           Organization? @relation(fields: [orgId], references: [id])
}

model Payout {
  id          String   @id @default(uuid(7))
  orgId       String
  bankAccountId String
  amountMinor BigInt
  currency    String
  provider    String
  providerRef String   @unique
  status      PayoutStatus @default(QUEUED)
  attempts    Int      @default(0)
  lastError   String?
  milestoneIds String[]
  createdAt   DateTime @default(now())
  paidAt      DateTime?
}

enum PayoutStatus {
  QUEUED
  PROCESSING
  PAID
  FAILED
  REVERSED
}

model Refund {
  id          String   @id @default(uuid(7))
  paymentId   String
  amountMinor BigInt
  reason      String
  providerRef String?  @unique
  status      PaymentStatus @default(PENDING)
  createdAt   DateTime @default(now())
}

model LedgerTransaction {
  id         String   @id @default(uuid(7))
  kind       String                       // "payment.direct", "payment.held", "release", "fee", "payout", "refund", "offline"
  reference  String   @unique             // idempotency: e.g. "payment:{id}"
  memo       String?
  createdAt  DateTime @default(now())
  entries    LedgerEntry[]
}

model LedgerEntry {
  id            String   @id @default(uuid(7))
  transactionId String
  account       String
  amountMinor   BigInt                    // + debit, − credit
  currency      String
  createdAt     DateTime @default(now())
  transaction   LedgerTransaction @relation(fields: [transactionId], references: [id])
  @@index([account, currency])
}

model PaymentException {
  id         String   @id @default(uuid(7))
  kind       String                       // "reconcile_mismatch", "payout_failed", "orphan_webhook"
  details    Json
  status     String   @default("OPEN")    // OPEN | RESOLVED
  resolvedBy String?
  createdAt  DateTime @default(now())
}

// ───────────── Budget ─────────────

model BudgetCategory {
  id            String  @id @default(uuid(7))
  eventId       String
  key           String
  label         String
  plannedMinor  BigInt  @default(0)
  sortOrder     Int     @default(0)
  @@unique([eventId, key])
}

model Expense {
  id           String   @id @default(uuid(7))
  eventId      String
  categoryKey  String
  description  String
  amountMinor  BigInt
  currency     String
  paidAt       DateTime?
  receiptKey   String?
  createdById  String
  createdAt    DateTime @default(now())
}

model Contribution {
  id            String   @id @default(uuid(7))
  eventId       String
  contributorName String
  contributorPhone String?
  kind          String   @default("family")   // family | committee | member | sponsor | other_income
  pledgedMinor  BigInt   @default(0)          // for sponsors and other income: the expected amount
  receivedMinor BigInt   @default(0)
  currency      String
  notes         String?
  createdAt     DateTime @default(now())
}
// Income: ticket income is computed from paid TicketOrders; sponsorship and other income are
// Contributions with kind "sponsor" / "other_income". No separate income model.
// Budget change history: AuditLog rows with action "budget.*" and the diff in `data`. No separate model.

// ───────────── Planner workspace ─────────────

model Client {
  id        String   @id @default(uuid(7))
  orgId     String
  name      String
  phone     String?
  email     String?  @db.Citext
  notes     String?
  stage     LeadStage @default(ENQUIRY)
  createdAt DateTime @default(now())
}

enum LeadStage {
  ENQUIRY
  PROPOSAL_SENT
  WON
  LOST
}

model Proposal {
  id        String   @id @default(uuid(7))
  orgId     String
  clientId  String
  eventId   String?
  title     String
  body      Json
  totalMinor BigInt
  currency  String
  status    String   @default("DRAFT")
  createdAt DateTime @default(now())
}

model Invoice {
  id         String   @id @default(uuid(7))
  orgId      String
  clientId   String?
  eventId    String?
  number     String
  items      Json
  totalMinor BigInt
  currency   String
  dueAt      DateTime
  status     String   @default("DRAFT")   // DRAFT | SENT | PAID | VOID
  createdAt  DateTime @default(now())
  @@unique([orgId, number])
}

model VendorBookEntry {
  id          String  @id @default(uuid(7))
  plannerOrgId String
  vendorOrgId String?
  name        String
  phone       String?
  category    String
  notes       String?
  rateNote    String?
}

// ───────────── Event day ─────────────

model RunItem {
  id          String   @id @default(uuid(7))
  eventId     String
  dayId       String?
  title       String
  startsAt    DateTime
  durationMin Int      @default(15)
  ownerUserId String?
  ownerOrgId  String?
  status      RunStatus @default(PLANNED)
  lateByMin   Int      @default(0)
  sortOrder   Int      @default(0)
  @@index([eventId, startsAt])
}

enum RunStatus {
  PLANNED
  STARTED
  DONE
  LATE
  SKIPPED
}

model RunDependency {
  itemId      String
  dependsOnId String
  @@id([itemId, dependsOnId])
}

model VendorCheckIn {
  id        String   @id @default(uuid(7))
  eventId   String
  bookingId String
  userId    String
  at        DateTime @default(now())
  lat       Float?
  lng       Float?
}

model Incident {
  id         String   @id @default(uuid(7))
  eventId    String
  title      String
  details    String?
  severity   String   @default("normal")   // low | normal | high
  ownerUserId String?
  resolvedAt DateTime?
  resolution String?
  createdAt  DateTime @default(now())
}

model EmergencyContact {
  id      String @id @default(uuid(7))
  eventId String
  name    String
  role    String
  phone   String
  isBackupVendor Boolean @default(false)
}

// ───────────── Messaging & notifications ─────────────

// Chat. One Thread model for every conversation; ThreadParticipant says who is in it.
// A participant is a user, or a whole business (orgId) so every team member with access can read and reply.
model Thread {
  id            String      @id @default(uuid(7))
  kind          ThreadKind
  context       ChatContext                 // where the chat was started
  contextId     String?                     // id of the profile/quote/booking/lead/site visit/event it came from
  eventId       String?                     // the event it is about (null for pre-event profile enquiries)
  bookingId     String?
  createdById   String
  lastMessageAt DateTime?
  createdAt     DateTime    @default(now())
  participants  ThreadParticipant[]
  messages      Message[]
  @@index([eventId])
  @@index([bookingId])
  @@index([lastMessageAt])
}

enum ThreadKind {
  EVENT          // the event team: host, co-hosts, planner (and staff)
  BOOKING        // one booking: host side + planner + that vendor
  DIRECT         // two parties (person or business) talking 1:1
}

enum ChatContext {
  EVENT_TEAM
  BOOKING
  PROFILE        // "Message" on a vendor/planner/venue profile (before any quote)
  QUOTE_REQUEST
  QUOTE
  SITE_VISIT
  PLANNER_CLIENT // planner and a CRM client or lead
  PLANNER_VENDOR // planner and a vendor, outside a booking
  GUEST_ENQUIRY  // a guest contacting a vendor/planner of an event they attended, after the event
}

model ThreadParticipant {
  id            String    @id @default(uuid(7))
  threadId      String
  userId        String?                      // a person
  orgId         String?                      // or a whole business (planner/vendor team)
  side          ChatSide
  lastReadAt    DateTime?                    // read receipts: messages up to here are "seen"
  lastDeliveredAt DateTime?                  // delivered receipts
  mutedUntil    DateTime?
  archivedAt    DateTime?
  joinedAt      DateTime  @default(now())
  leftAt        DateTime?
  thread        Thread    @relation(fields: [threadId], references: [id])
  @@index([userId])
  @@index([orgId])
  @@index([threadId])
}

enum ChatSide {
  CLIENT
  PLANNER
  VENDOR
  GUEST
  TEAM
}

model Message {
  id              String      @id @default(uuid(7))
  threadId        String
  authorUserId    String
  authorOrgId     String?                    // set when sending on behalf of a business
  clientMessageId String                     // generated by the sender's device; makes sending idempotent
  kind            MessageKind @default(TEXT)
  body            String?                    // original text (staff and the author always see this)
  maskedBody      String?                    // body with phone numbers/emails/links hidden (shown to the other side while contact sharing is locked)
  hasContactInfo  Boolean     @default(false)
  attachments     Json        @default("[]") // [{key, mime, sizeBytes, width?, height?, durationSec?, name}]
  card            Json?                      // shared object: {type: "quote"|"booking"|"site_visit"|"profile"|"payment", id}
  replyToId       String?                    // quoted reply
  mentions        String[]
  isDecision      Boolean     @default(false)
  createdAt       DateTime    @default(now())
  editedAt        DateTime?                  // editable for 15 minutes
  deletedAt       DateTime?                  // "This message was deleted"
  thread          Thread      @relation(fields: [threadId], references: [id])
  @@unique([threadId, clientMessageId])
  @@index([threadId, createdAt])
}

enum MessageKind {
  TEXT
  IMAGE
  FILE
  VOICE
  CARD
  SYSTEM
}

model UserBlock {
  id             String   @id @default(uuid(7))
  blockerUserId  String?
  blockerOrgId   String?
  blockedUserId  String?
  blockedOrgId   String?
  reason         String?
  createdAt      DateTime @default(now())
  @@index([blockerUserId])
  @@index([blockerOrgId])
}

model Notification {
  id        String   @id @default(uuid(7))
  userId    String
  type      String
  title     String
  body      String
  url       String
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([userId, readAt])
}

model NotificationPreference {
  userId     String  @id
  channels   Json    // {type: {inApp, push, email, sms, whatsapp}}
  quietStart Int?    // minutes from midnight local
  quietEnd   Int?
}

model PushSubscription {
  id        String @id @default(uuid(7))
  userId    String
  endpoint  String @unique
  keys      Json
  createdAt DateTime @default(now())
}

// ───────────── Trust ─────────────

model Review {
  id          String   @id @default(uuid(7))
  bookingId   String   @unique
  vendorOrgId String
  authorId    String
  quality     Int
  communication Int
  punctuality Int
  value       Int
  scope       Int
  overall     Float
  body        String?
  photoIds    String[]
  reply       String?
  repliedAt   DateTime?
  hidden      Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model Dispute {
  id          String   @id @default(uuid(7))
  bookingId   String
  openedById  String
  reason      String
  description String
  status      DisputeStatus @default(OPEN)
  respondBy   DateTime
  decision    Json?                        // {outcome: release|refund|split, vendorMinor, refundMinor, reason}
  decidedBy   String?
  decidedAt   DateTime?
  createdAt   DateTime @default(now())
}

enum DisputeStatus {
  OPEN
  AWAITING_RESPONSE
  UNDER_REVIEW
  DECIDED
  WITHDRAWN
}

model DisputeEvidence {
  id         String   @id @default(uuid(7))
  disputeId  String
  byUserId   String
  text       String?
  fileKeys   String[]
  createdAt  DateTime @default(now())
}

model Report {
  id         String   @id @default(uuid(7))
  targetType String                       // media | review | profile | message
  targetId   String
  reason     String
  reporterUserId String?
  reporterSessionId String?
  status     String   @default("OPEN")
  createdAt  DateTime @default(now())
}

// ───────────── Platform ─────────────

model Subscription {
  id         String   @id @default(uuid(7))
  orgId      String
  plan       String                       // planner_pro | vendor_pro
  status     String                       // ACTIVE | PAST_DUE | CANCELLED
  provider   String
  providerRef String  @unique
  currentPeriodEnd DateTime
}

model FeatureFlagOverride {
  key         String
  countryCode String
  enabled     Boolean
  updatedBy   String
  updatedAt   DateTime @updatedAt
  @@id([key, countryCode])
}

model AuditLog {
  id         String   @id @default(uuid(7))
  actorId    String?
  actorType  String                       // user | admin | system | guest
  action     String                       // e.g. "booking.accept"
  targetType String
  targetId   String
  data       Json?
  ip         String?
  createdAt  DateTime @default(now())
  @@index([targetType, targetId])
  @@index([actorId, createdAt])
}

model OutboxEvent {
  id          String   @id @default(uuid(7))
  topic       String                       // e.g. "invite.batch.queued"
  payload     Json
  publishedAt DateTime?
  createdAt   DateTime @default(now())
  @@index([publishedAt])
}

model IdempotencyKey {
  key       String   @id
  scope     String
  response  Json?
  createdAt DateTime @default(now())
}
```

This schema was checked with `prisma validate` on Prisma 7.10 (the stable release at the time of writing). If you install a newer major version, run `pnpm prisma validate` first and follow its upgrade notes.

### Prisma 7 configuration

```ts
// packages/db/prisma.config.ts — used by the Prisma CLI (migrate, studio)
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed/index.ts' },
  datasource: { url: env('DIRECT_DATABASE_URL') }, // direct (non-pooled) URL for migrations
});
```

```ts
// packages/db/src/client.ts — used by the app and worker at runtime
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! }); // pooled URL
export const db = globalThis.__tiwaDb ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') globalThis.__tiwaDb = db;
```

Install `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`, `tsx` in `packages/db`.

### Migrations

- Every schema change = one migration with a descriptive name (`pnpm prisma migrate dev --name add_ticket_types`).
- Add raw-SQL migrations for:
  - trigram index: `CREATE INDEX business_search_trgm ON "BusinessProfile" USING gin ("searchText" gin_trgm_ops);`
  - no double booking of a venue space (or a whole business) for the same date and slot:
    `CREATE UNIQUE INDEX availability_unique ON "AvailabilityBlock" ("orgId", "spaceId", "date", "slot") NULLS NOT DISTINCT;`
    plus a trigger that rejects a non-FULL_DAY block when a FULL_DAY block exists for the same org/space/date (and the reverse);
  - a CHECK that ledger entries per transaction sum to zero (deferred constraint trigger, see §8.4).

---

## 4. Authorization

### 4.1 One gate

```ts
// packages/core/auth/authorize.ts
export type Actor =
  | { kind: 'user'; userId: string; isAdmin: boolean; adminRole?: AdminRole }
  | { kind: 'guest'; guestId?: string; ticketId?: string; guestSessionId?: string; eventId: string }  // guestId comes from Guest.inviteToken
  | { kind: 'system' };

export async function authorize(actor: Actor, action: Action, resource: Resource): Promise<void>;
// throws Forbidden; never returns false
```

- `Action` is a string union defined in `packages/core/auth/actions.ts`, e.g. `'event.view' | 'event.edit' | 'event.members.manage' | 'money.view' | 'money.edit' | 'quote.accept' | 'payment.make' | 'guests.manage' | 'guests.contacts.view' | 'tickets.manage' | 'checkin.scan' | 'runofshow.edit' | 'runofshow.updateOwn' | 'moments.moderate' | 'moments.upload.guest' | 'moments.upload.official' | 'review.create' | 'dispute.open' | 'event.close' | 'org.manage' | 'admin.*'`.
- The function loads the actor's `EventParticipant` rows for the event (cached per request) and evaluates the matrix in `PRD.md §2.1`, encoded in `packages/core/auth/matrix.ts`.
- `quote.accept` and `payment.make` also check the amount against `permissions.approveUpToMinor`.

### 4.2 Server action wrapper

```ts
// apps/web/lib/action.ts
export const action = <I extends z.ZodTypeAny, O>(schema: I, fn: (input: z.infer<I>, ctx: Ctx) => Promise<O>) =>
  async (raw: unknown): Promise<ActionResult<O>> => {
    const input = schema.safeParse(raw);
    if (!input.success) return { ok: false, fieldErrors: input.error.flatten().fieldErrors };
    const ctx = await getCtx();            // session, actor, requestId, ip
    try { return { ok: true, data: await fn(input.data, ctx) }; }
    catch (e) { return mapDomainError(e); } // Forbidden → {ok:false, code:'FORBIDDEN'} etc.
  };
```

### 4.3 Participant permissions JSON

```json
{
  "preset": "finance",
  "eventEdit": false,
  "money": "view",            // "none" | "view" | "edit"
  "approveUpToMinor": "10000000",
  "guests": "edit",           // "none" | "view" | "edit"
  "guestContacts": true,
  "tickets": "none",
  "moments": "moderate",      // "none" | "upload" | "moderate"
  "runOfShow": "edit"
}
```

Presets in `packages/core/auth/presets.ts`: `view_only`, `contributor`, `finance`, `full`.

### 4.4 Guest access

- Invite token (`Guest.inviteToken`) → `Actor{kind:'guest', guestId}`; may: view event public info, RSVP, view own pass, upload to Guest album, view gallery (per privacy).
- Ticket QR token → same for ticket holders.
- Gallery guest session: httpOnly cookie `tiwa_gs_{galleryId}` with signed `GuestSession.id`.
- Tokens can be revoked (`Guest.inviteRevokedAt`; a new token can be issued); revoked tokens return 410.

---

## 5. State machines

Implement each in `packages/core/<module>/state.ts` as a transition table plus `assertTransition(from, to)`. Every transition writes an `AuditLog`.

### 5.1 Booking

| From | To | Trigger |
|------|----|---------|
| — | ACCEPTED | `acceptQuote` / `instantBook` with no deposit milestone |
| — | DEPOSIT_DUE | `acceptQuote` / `instantBook` with a deposit milestone; sets `holdExpiresAt` (default 72 h, venue can change) and creates AvailabilityBlock(s) for the space/date/slot |
| DEPOSIT_DUE | CANCELLED | `expireHolds` job: deposit unpaid when `holdExpiresAt` passes; availability blocks removed, both sides notified |
| DEPOSIT_DUE | CONFIRMED | deposit milestone → PAID_DIRECT / HELD / CONFIRMED_OFFLINE |
| ACCEPTED | CONFIRMED | vendor confirms (no deposit required) |
| CONFIRMED | IN_PROGRESS | event start time reached (job) or vendor check-in |
| IN_PROGRESS | DELIVERED | vendor `markDelivered` |
| DELIVERED | COMPLETED | host `signOffDelivery` or auto 72 h after event end with no dispute |
| ACCEPTED, DEPOSIT_DUE, CONFIRMED | CANCELLED | `cancelBooking` (refunds per terms) |
| CONFIRMED, IN_PROGRESS, DELIVERED | DISPUTED | `openDispute` |
| DISPUTED | COMPLETED / CANCELLED | `decideDispute` |

### 5.2 Quote

`DRAFT → SENT → (CHANGES_REQUESTED → SENT)* → ACCEPTED | DECLINED | EXPIRED | WITHDRAWN`. `EXPIRED` set by job when `expiresAt < now()`.

### 5.3 Payment milestone

| From | To | Trigger |
|------|----|---------|
| SCHEDULED | PENDING_PAYMENT | `startCheckout` |
| PENDING_PAYMENT | SCHEDULED | payment expired/failed |
| PENDING_PAYMENT | PAID_DIRECT | webhook success, mode DIRECT |
| PENDING_PAYMENT | HELD | webhook success, mode HELD |
| SCHEDULED | RECORDED_OFFLINE | `recordOfflinePayment` |
| RECORDED_OFFLINE | CONFIRMED_OFFLINE | vendor confirms |
| HELD | RELEASED | release engine, rule met, no dispute |
| HELD | DISPUTED | dispute opened |
| DISPUTED | RELEASED / REFUNDED / PARTLY_REFUNDED | dispute decision |
| PAID_DIRECT, HELD | REFUNDED / PARTLY_REFUNDED | `refund` |
| HELD (kind SECURITY_DEPOSIT) | REFUNDED | `settleSecurityDeposit`: no damage claim within 72 h after the event → refunded to payer |
| HELD (kind SECURITY_DEPOSIT) | DISPUTED | venue files a damage claim (opens a dispute with evidence) |
| PAID_DIRECT / CONFIRMED_OFFLINE (kind SECURITY_DEPOSIT) | REFUNDED | host confirms the venue returned the deposit outside Tiwa (DIRECT and OFFLINE modes: the venue holds the money, Tiwa only records it) |

### 5.4 Payment

`PENDING → SUCCEEDED | FAILED | EXPIRED`; `SUCCEEDED → REFUNDED | PARTLY_REFUNDED`.

### 5.5 Payout

`QUEUED → PROCESSING → PAID | FAILED`; `FAILED → QUEUED` (retry, max 3) ; `PAID → REVERSED` (provider reversal webhook → PaymentException).

### 5.6 Invite delivery

`QUEUED → SENT → DELIVERED → OPENED`; any → `FAILED`; `QUEUED → SENT_MANUALLY` (WhatsApp free mode). RSVP is stored on `Guest.rsvp`, independent of delivery.

### 5.7 Ticket order

`RESERVED → PAID | EXPIRED | CANCELLED`; `PAID → REFUNDED`. Reservation expiry job runs every minute.

### 5.8 Media item

`UPLOADING → PROCESSING → (PUBLISHED | PENDING_REVIEW | BLOCKED | FAILED)`; `PENDING_REVIEW → PUBLISHED | HIDDEN`; `PUBLISHED ↔ HIDDEN`; any → deleted (`deletedAt`).

### 5.9 Dispute

`OPEN → AWAITING_RESPONSE → UNDER_REVIEW → DECIDED`; `OPEN | AWAITING_RESPONSE → WITHDRAWN`.

### 5.10 Event

`DRAFT → ACTIVE` (`finalizeEvent`) → `COMPLETED` (`closeEvent`) ; `DRAFT | ACTIVE → CANCELLED`.

---

## 6. Server actions catalogue

Location: `apps/web/app/**/actions.ts`. Each is `action(schema, fn)` calling one core command. Revalidate with `revalidateTag()` using tags `event:{id}`, `event:{id}:guests`, `vendor:{orgId}`, `gallery:{id}`.

| Action | Input (Zod) | Permission | Core command | Notes |
|--------|-------------|-----------|--------------|-------|
| `createEventDraft` | `{type}` | logged in | `events.createEventDraft` | returns `{eventId}` |
| `saveEventStep` | `{eventId, step, data}` | `event.edit` | `events.updateEventStep` | per-step schemas |
| `finalizeEvent` | `{eventId}` | HOST | `events.finalizeEvent` | creates tasks, budget categories, gallery |
| `addMember` | `{eventId, phone?, email?, role, preset}` | `event.members.manage` | `events.addParticipant` | sends invite |
| `updateTask` / `createTask` / `completeTask` | task fields | `event.edit` or task owner | `tasks.*` | |
| `addGuests` | `{eventId, guests:[{name, phone?, email?, groupIds?}]}` (max 500/call) | `guests.manage` | `guests.addGuests` | normalises phones (libphonenumber-js) |
| `importGuestsCsv` | `{eventId, fileKey, mapping}` | `guests.manage` | enqueue `guests.import` | |
| `enableInvites` | `{eventId, enabled}` | `guests.manage` | `invites.enableInvites` | |
| `createInviteBatch` | `{eventId, audience, channels, smart, message, kind}` | `guests.manage` | `invites.createInviteBatch` | returns counts per channel + SMS cost estimate |
| `sendInviteBatch` | `{batchId, idempotencyKey}` | `guests.manage` | `invites.sendInviteBatch` | **the one click** — enqueues |
| `markSentManually` | `{deliveryId}` | `guests.manage` | `invites.markSentManually` | WhatsApp free mode |
| `respondRsvp` | `{token, response, extras?}` | guest token | `invites.respondRsvp` | rate-limited per token |
| `sharedLinkRsvp` | `{eventSlug, name, phone?}` | public (shared link on) | `invites.respondRsvp` | creates Guest |
| `createTicketType` / `createPromo` | fields | `tickets.manage` | `tickets.*` | |
| `reserveTickets` | `{eventSlug, items, buyer, answers, promo?}` | public | `tickets.reserveTickets` | transaction + capacity check |
| `checkIn` | `{eventId, qrToken, deviceId, scannedAt}` | `checkin.scan` | `checkin.checkIn` | |
| `updateGallerySettings` / `moderateMedia` | fields | `moments.moderate` | `moments.*` | |
| `requestZip` | `{galleryId}` | `moments.moderate` | enqueue `media.build-zip` | |
| `upsertBusinessProfile` / `upsertPackage` / `upsertVenueSpace` / `blockAvailability` / `publishProfile` | fields | org ADMIN+ | `marketplace.*` | venues: spaces, slot prices, capacities |
| `setupBankAccount` | `{orgId, bankCode, accountNumber}` | org OWNER | `payments.setupBankAccount` | name lookup → confirm |
| `requestQuotes` | `{eventId, category, vendorOrgIds (≤5), brief}` | `event.edit` | `quotes.requestQuotes` | |
| `saveQuote` / `sendQuote` | quote fields | vendor org member | `quotes.createQuote/sendQuote` | totals recomputed on server |
| `acceptQuote` | `{quoteId, paymentMode, agree:true, declineOthers}` | `quote.accept` | `quotes.acceptQuote` | creates Booking v1 + milestones; venue quotes also block the space/date/slot in the same transaction (unique index → `CONFLICT` if taken) |
| `instantBook` | `{eventId, spaceId, date, slot, paymentMode, agree:true, idempotencyKey}` | `quote.accept` | `quotes.instantBook` | only when `BusinessProfile.instantBook` and a slot price exist; builds the quote from `slotPrices` + security deposit, then same as `acceptQuote` |
| `requestSiteVisit` / `respondSiteVisit` | `{vendorOrgId, spaceId?, eventId?, proposedTimes (1–3), notes}` / `{siteVisitId, accept, time?}` | logged in / venue org member | `venues.*` | notifications both ways; adds to both calendars |
| `requestChange` / `respondChange` | fields | booking party | `bookings.*` | |
| `startCheckout` | `{milestoneId \| ticketOrderId \| contributionId, idempotencyKey}` | `payment.make` or public for tickets | `payments.startCheckout` | returns provider init data |
| `recordOfflinePayment` / `confirmOfflinePayment` | fields | host / vendor | `payments.*` | |
| `signOffDelivery` | `{bookingId}` | HOST/PLANNER | `bookings.signOffDelivery` | triggers release check |
| `openDispute` / `addEvidence` | fields | booking party | `disputes.*` | |
| `setAllocations` / `addExpense` / `addContribution` / `recordContributionReceived` | fields | `money.edit` | `budget.*` | |
| `createRunItem` / `markLate` / `vendorCheckIn` / `logIncident` | fields | `runofshow.*` | `day.*` | |
| `startThread` | `{context, contextId?, toUserId? \| toOrgId?, eventId?, firstMessage}` | `canMessage()` (§9a.1) | `chat.startThread` | reuses an existing DIRECT thread between the same parties and event instead of creating a duplicate |
| `sendMessage` | `{threadId, clientMessageId, kind, body?, attachments?, card?, replyToId?}` | thread participant, not blocked | `chat.sendMessage` | idempotent on `clientMessageId`; contact masking (§9a.3); rate limits |
| `editMessage` / `deleteMessage` | `{messageId, body?}` | author, edit within 15 min | `chat.*` | |
| `markRead` | `{threadId, upToMessageId}` | participant | `chat.markRead` | updates `lastReadAt`, publishes receipt |
| `muteThread` / `archiveThread` | `{threadId, until?}` | participant | `chat.*` | |
| `blockParty` / `reportMessage` | `{userId? \| orgId?, reason}` / `{messageId, reason}` | participant | `chat.*` | report creates a `Report` for admin moderation |
| `markDecision` | `{messageId}` | event team member | `chat.markDecision` | pins to the event overview |
| `createReview` / `replyToReview` | fields | per REV rules | `reviews.*` | |
| `aiDraftPlan` / `aiCompareQuotes` / `aiDraftMessage` | ids | same as underlying view | `ai.*` | flag `ai.enabled` |
| admin actions | fields | `admin.*` by adminRole | `admin.*` | audit-logged |

---

## 7. Payments

### 7.1 Provider interfaces (`packages/payments/src/types.ts`)

```ts
export interface PaymentProvider {
  name: 'paystack' | 'flutterwave' | 'fake';
  initCheckout(input: {
    reference: string; amountMinor: bigint; currency: string; email: string;
    split?: { subaccountCode: string; platformFeeMinor: bigint };   // DIRECT mode
    metadata: Record<string, string>; callbackUrl: string;
  }): Promise<{ checkoutUrl?: string; inlineConfig: Record<string, unknown> }>;
  verify(reference: string): Promise<{ status: 'success' | 'failed' | 'pending'; amountMinor: bigint; currency: string; providerTxnId: string }>;
  refund(input: { providerTxnId: string; amountMinor: bigint }): Promise<{ providerRef: string }>;
  parseWebhook(headers: Headers, rawBody: string): { valid: boolean; eventKey: string; type: string; reference?: string; data: unknown };
  listBanks(countryCode: string): Promise<{ code: string; name: string }[]>;
  resolveAccount(bankCode: string, accountNumber: string): Promise<{ accountName: string }>;
  createSubaccount(input: { businessName: string; bankCode: string; accountNumber: string; percentageCharge: number }): Promise<{ subaccountCode: string }>;
}

export interface PayoutProvider {
  createRecipient(input: { name: string; bankCode: string; accountNumber: string; currency: string }): Promise<{ recipientCode: string }>;
  transfer(input: { reference: string; amountMinor: bigint; currency: string; recipientCode: string; reason: string }): Promise<{ providerRef: string; status: 'pending' | 'success' | 'failed' }>;
  getTransfer(providerRef: string): Promise<{ status: 'pending' | 'success' | 'failed' | 'reversed' }>;
}

export interface EscrowProvider {
  // Implemented by the licensed partner adapter. Fake implementation keeps balances in memory/DB for tests.
  hold(input: { reference: string; amountMinor: bigint; currency: string; bookingId: string }): Promise<void>;
  release(input: { reference: string; amountMinor: bigint; currency: string; toRecipientCode: string }): Promise<{ providerRef: string }>;
  refund(input: { reference: string; amountMinor: bigint; currency: string }): Promise<{ providerRef: string }>;
  balance(bookingId: string): Promise<bigint>;
}
```

Adapters: `packages/payments/src/paystack/*`, `flutterwave/*`, `fake/*`. Choose with `PAYMENT_PROVIDER`. The **Fake** provider simulates checkout success/failure through a local page `/dev/fake-checkout` and sends signed webhooks to the app, so every flow is testable without keys.

### 7.2 Fee calculation

- `feeMinor = mulBps(amountMinor, PLATFORM_FEE_BPS)` for marketplace bookings; `0` for bookings created from a planner's private vendor book (configurable in `pricing.ts`).
- Ticket fee from `pricing.ts` per country (default 400 bps), charged to buyer or absorbed by organiser (setting).
- Show fee breakdown before checkout.

- No platform fee on SECURITY_DEPOSIT milestones (they are refundable).

### 7.3 Checkout flow (all modes that use a provider)

1. `startCheckout` → create `Payment(PENDING, expiresAt = now + 1h, providerRef = "tiwa_" + uuid)`; milestone → `PENDING_PAYMENT`.
2. DIRECT: pass `split` with vendor's `subaccountCode` and Tiwa fee. HELD: no split; funds settle to the partner escrow account (configured in the provider dashboard / partner); call `EscrowProvider.hold` after success.
3. Browser opens provider inline checkout. On callback, browser shows "Confirming…" and listens on SSE `payment:{id}`.
4. Webhook `/api/webhooks/{provider}` → verify signature → insert `ProviderEvent` (unique `provider+eventKey`; duplicate → 200 OK, no-op) → enqueue `payments.process-webhook`.
5. Job: `provider.verify(reference)` (never trust the webhook body alone) → in one transaction: Payment → SUCCEEDED, milestone transition, booking transition, ledger post, outbox (`receipt.send`, `notify`) → publish SSE.
6. Safety net: `payments.verify-pending` job every 10 min verifies PENDING payments older than 10 min with the provider.

### 7.4 Release engine (flag `payments.held`)

Job `payments.release-check` every 5 minutes:

```
for each milestone in state HELD:
  booking = milestone.booking
  if open dispute on booking: skip
  ruleMet =
    ON_PAYMENT          → true
    ON_DATE             → now ≥ milestone.releaseAt
    ON_VENDOR_CHECK_IN  → exists VendorCheckIn for booking
    ON_HOST_SIGNOFF     → booking.signedOffAt != null
  autoRelease = milestone.autoReleaseAfterHours != null and now ≥ event.endsAt + hours
  if ruleMet or autoRelease:
     transaction: milestone → RELEASED; ledger post (held → payable + fee); outbox payout.request
```

Each release uses ledger reference `release:{milestoneId}` (unique) so it can't happen twice.

### 7.5 Payouts (flag `payments.payouts`)

- Job `payments.execute-payout` groups RELEASED, unpaid amounts per org (or per milestone, setting) → creates `Payout(QUEUED)` → `PayoutProvider.transfer` with reference `payout:{id}` → PROCESSING → webhook/poll → PAID or FAILED.
- Preconditions: org has verified `BankAccount`, `payoutsPausedUntil` is past, org not suspended, no open PaymentException for the org.
- FAILED: retry up to 3 times with backoff (1 h, 6 h, 24 h), then PaymentException.

### 7.6 Refunds

`refund(paymentId, amountMinor, reason)` → DIRECT: provider refund; HELD: `EscrowProvider.refund`; ledger post; milestone and booking transitions; notify both parties.

### 7.7 Offline payments

`recordOfflinePayment` writes milestone `RECORDED_OFFLINE` and a ledger transaction on `offline:*` accounts (memo only, excluded from reconciliation). Vendor confirmation → `CONFIRMED_OFFLINE`; counts as paid in the budget.

---

## 8. Ledger

### 8.1 Accounts

| Account | Meaning |
|---------|---------|
| `clearing:{provider}` | Money at the payment provider not yet assigned |
| `held:booking:{bookingId}` | Money held for a booking (HELD mode) |
| `payable:org:{orgId}` | Released money owed to a vendor/organiser |
| `payout:inflight:{provider}` | Payout sent, not yet confirmed |
| `vendor:external:{orgId}` | Money that went straight to the vendor via split (DIRECT) — tracking only |
| `revenue:fees` | Tiwa fees |
| `bank:tiwa` | Money settled into Tiwa's own bank account |
| `revenue:subscriptions` | Subscription and Moments Plus income |
| `refunds:{provider}` | Refunds paid out |
| `offline:booking:{bookingId}` | Offline payments (memo, not real money) |

### 8.2 Postings (debit +, credit −; each transaction sums to 0 per currency)

| Event | Entries |
|-------|---------|
| DIRECT payment ₦100,000, fee ₦5,000 (provider splits and settles both parts itself) | `clearing +100,000` · `vendor:external −95,000` · `revenue:fees −5,000` |
| DIRECT settlement (from the provider's settlement report) | Tiwa's share: `bank:tiwa +5,000` · `clearing −5,000`. Vendor's share settled straight to the vendor: `vendor:external +95,000` · `clearing −95,000`. After settlement `clearing` for that payment is zero; reconciliation checks this. Reports of "paid to vendors" read the `payment.direct` transactions. |
| HELD payment ₦100,000 | `clearing +100,000` · `held:booking −100,000` → when partner confirms hold: no extra entry |
| Release ₦100,000, fee ₦5,000 | `held:booking +100,000` · `payable:org −95,000` · `revenue:fees −5,000` |
| Payout ₦95,000 sent | `payable:org +95,000` · `payout:inflight −95,000` |
| Payout confirmed | `payout:inflight +95,000` · `clearing −95,000` |
| Refund ₦20,000 from held | `held:booking +20,000` · `refunds −20,000` |

Implement `ledger.post({kind, reference, entries})` that: checks the sum is zero per currency, inserts the transaction with unique `reference` (duplicate → returns existing), inserts entries. Never update or delete ledger rows (enforce with a DB trigger that rejects UPDATE/DELETE on `LedgerEntry` and `LedgerTransaction`).

### 8.3 Reconciliation (`payments.reconcile-daily`, 02:00 Africa/Lagos)

1. Pull the provider's transactions, transfers and refunds for the previous day.
2. Match each to `Payment`, `Payout`, `Refund` by reference. Unmatched → `PaymentException(orphan)`.
3. Compare amounts and statuses. Mismatch → `PaymentException(reconcile_mismatch)` and set flag `payouts.paused` for that provider.
4. For HELD: compare `sum(held:booking:*)` with `EscrowProvider` balances.
5. Write a summary row to `docs`-visible admin page `/admin/payments`.

### 8.4 Database guard

Deferred constraint trigger on `LedgerEntry` that, at commit, checks `SUM(amountMinor) GROUP BY transactionId, currency = 0`. Add in a raw SQL migration.

---

## 9. Other adapters (all with `Fake` implementations)

```ts
// packages/messaging
interface EmailProvider    { send(m: { to: string; subject: string; react: ReactElement; tags?: string[] }): Promise<{ id: string }>; }
interface SmsProvider      { send(m: { to: string; text: string }): Promise<{ id: string; costMinor?: bigint }>; }
interface WhatsAppProvider { sendTemplate(m: { to: string; template: string; lang: string; params: string[]; buttons?: { payload: string }[] }): Promise<{ id: string }>; parseWebhook(h: Headers, body: string): WaEvent[]; }
interface PushProvider     { send(sub: PushSubscription, payload: { title: string; body: string; url: string }): Promise<void>; }
// packages/storage
interface Storage { createMultipart(key, mime): Promise<{uploadId}>; signPart(key, uploadId, part): Promise<string>; complete(key, uploadId, parts): Promise<void>; getSignedUrl(key, ttlSec): Promise<string>; put(key, body, mime): Promise<void>; get(key): Promise<Readable>; delete(key): Promise<void>; }
// packages/moderation
interface ModerationProvider { scanImage(bytes: Buffer): Promise<{ verdict: 'allow' | 'review' | 'block'; labels: string[] }>; }
// packages/ai
interface LlmProvider { complete(input: { model: string; system: string; messages: Msg[]; jsonSchema?: object; maxTokens: number }): Promise<{ text: string; json?: unknown }>; }
```

- `FakeEmail` writes to Mailpit locally and to an in-memory outbox in tests.
- `FakeModeration` blocks any image whose file name contains `unsafe` (for tests).
- `FakeLlm` returns deterministic JSON fixtures.
- WhatsApp free mode needs no provider: build `https://wa.me/{e164WithoutPlus}?text={encodeURIComponent(message)}`.

### 9.1 AI gateway rules

- `packages/ai/context.ts` builds context only from queries run **as the actor** (so permissions apply). Strip phone numbers and emails from prompts.
- Prompts live in `packages/ai/prompts/*.ts` with a version string; outputs validated with Zod; invalid output → friendly error, no partial save.
- Log token usage per org; daily cap per org in config.

---

## 9a. Chat rules

Chat is part of the MVP and is the main way clients, planners, vendors and guests talk inside Tiwa. It must feel as quick as WhatsApp.

### 9a.1 Who can message whom (`canMessage(actor, target, context)`)

| From → To | Allowed when |
|-----------|--------------|
| Client (host/co-host with permission) → vendor, venue or planner business | Always, from their profile, a quote request, a quote, a booking or a site visit |
| Planner → own client or lead | The client is in the planner's CRM or on an event the planner is hired on |
| Planner → vendor or venue business | Always (business to business) |
| Vendor/venue → client or planner | Only to reply, or when they share a quote request, quote, booking or site visit |
| Vendor ↔ vendor | Only inside an event or booking thread they are both in |
| Guest → vendor or planner | Only **after the event has ended**, only for businesses that worked on an event the guest attended (RSVP yes, checked in, or uploaded to Moments), and only if the business allows guest enquiries (`BusinessProfile` setting, on by default). The guest must verify a phone number with OTP first (this creates a basic account). |
| Vendor or planner → guest | Reply only; never the first message |
| Guest ↔ guest, guest → host via chat | Not allowed (hosts and guests use invites and Moments) |
| Anyone → someone who blocked them | Not allowed |

Event-team threads (`EVENT`) and booking threads (`BOOKING`) are created automatically with the right participants when the event or booking is created; participants update when members are added or removed.

### 9a.2 Real time, receipts and typing

- New messages, receipts and typing are pushed over SSE `GET /api/sse/inbox` (one stream per user, all their threads), using Redis pub/sub channels `inbox:user:{id}` and `inbox:org:{id}`.
- **Delivered** = the recipient's device received it (client calls `markDelivered`); **Seen** = `markRead`. For business participants, the receipt shows when any team member has read it.
- **Typing** is ephemeral: `POST /api/chat/typing` publishes to Redis with a 5-second expiry; nothing is stored.
- Message order is by `createdAt` (UUID v7 ids are also time-ordered). Pagination: cursor, 50 messages per page, newest first.
- Sending is **optimistic**: the client shows the message immediately with a clock icon, retries with the same `clientMessageId` until it succeeds, then shows a tick.

### 9a.3 Contact details and staying on Tiwa

- While there is **no confirmed booking** between the two parties, messages in `PROFILE`, `QUOTE_REQUEST`, `QUOTE`, `SITE_VISIT` and `GUEST_ENQUIRY` threads are scanned for phone numbers (libphonenumber-js `findNumbers` for the country, plus long digit runs), email addresses, WhatsApp links (`wa.me`, `chat.whatsapp.com`) and social handles.
- If found, the **sender sees a warning** before sending ("Payments made outside Tiwa aren't protected. Contact details are shared automatically once you book."). If they still send, the other side sees `maskedBody` with details replaced by "•••• (shared after booking)". Staff and the sender always see the original.
- Once a booking between the parties is CONFIRMED, masking stops for that thread and the booking contact card shows both sides' phone numbers.
- Planner ↔ own CRM client, event-team and booking threads are never masked.
- Masking is a nudge, not a wall: no account is punished automatically; repeated attempts are counted for trust & safety review.

### 9a.4 Attachments and voice notes

- Images, PDFs and documents up to 25 MB through the normal upload endpoints (§11) with `purpose: "chat"`; images get 320/1080 derivatives; every image passes the moderation scan.
- **Voice notes**: recorded in the browser with `MediaRecorder` (Opus/WebM, or MP4/AAC on Safari), max 2 minutes; the worker job `media/process-voice` transcodes to AAC (`.m4a`) so every browser can play it, stores the duration and a waveform (64 values) for the player.
- **Cards**: a message can carry a quote, booking, site visit, profile or payment card. Cards are rendered from live data (so a card always shows the current status) and respect permissions.

### 9a.5 Notifications for chat

- If the recipient has no open SSE connection, or hasn't read the message within 2 minutes: web push (if subscribed).
- Still unread after 15 minutes: one email or WhatsApp summary per thread ("Ada sent you 3 messages") with a link back, respecting quiet hours. Never more than one summary per thread per hour.
- Business participants: notify the members who have chat notifications on (default: owners and admins).

### 9a.6 Safety and limits

- Block: blocked parties can't start threads or send messages to the blocker; existing threads show "You can't reply to this conversation".
- Report a message → `Report` + admin moderation queue; reported messages stay visible to staff.
- New accounts (younger than 7 days with no completed booking): at most 10 new threads per day. Everyone: at most 30 messages per minute. First messages containing links are held for a quick automated check.
- Messages are kept for the life of the event + 2 years (configurable per country), then deleted by `maintenance/retention-purge`; booking threads follow payment-record retention because they can be dispute evidence.

## 10. Background jobs

`apps/worker/src/jobs/*.ts`. All jobs are idempotent (safe to run twice). Default retry: 5 attempts, exponential backoff from 10 s. Dead-lettered jobs appear in `/admin/queues`.

| Queue / job | Trigger | Payload | Does |
|-------------|---------|---------|------|
| `events/publish-outbox` | every 2 s | — | Publishes unpublished `OutboxEvent` rows to queues |
| `events/deadline-alerts` | hourly | — | Tasks due in 24 h / overdue → notifications |
| `events/booking-progress` | every 15 min | — | CONFIRMED → IN_PROGRESS at event start; DELIVERED → COMPLETED after 72 h |
| `bookings/expire-holds` | every 15 min | — | DEPOSIT_DUE bookings past `holdExpiresAt` → CANCELLED; free availability blocks |
| `bookings/security-deposits` | hourly | — | 72 h after event: refund HELD security deposits with no open damage claim; remind hosts to confirm offline refunds |
| `venues/site-visit-reminders` | hourly | — | Reminders 24 h and 2 h before confirmed site visits |
| `guests/import` | action | `{eventId, fileKey, mapping}` | Parse CSV (papaparse), validate, insert in chunks of 500, progress via SSE |
| `messaging/send-invite-batch` | outbox `invite.batch.queued` | `{batchId}` | Fan out one `send-invite` job per delivery |
| `messaging/send-invite` | fan-out | `{deliveryId}` | Render per channel, send, set SENT/FAILED; limiter per provider (e.g. SMS 20/s, WA 50/s, email 10/s) |
| `messaging/reminders` | every 30 min | — | Non-responders per policy (max 2), day-before reminders |
| `messaging/notify` | outbox | `{userId, type, data}` | Applies preferences + quiet hours, sends in-app/push/email/SMS/WA |
| `chat/unread-nudges` | every 1 min | — | §9a.5: push after 2 min unread, email/WhatsApp summary after 15 min (max 1 per thread per hour) |
| `chat/sync-participants` | outbox `event.members.changed`, `booking.created` | ids | Keeps EVENT and BOOKING thread participants in step with members |
| `media/process-voice` | upload complete (`purpose: chat`, audio) | `{attachmentKey}` | ffmpeg → AAC `.m4a`, duration, 64-point waveform |
| `messaging/send-ticket`, `send-receipt` | outbox | ids | Email + WhatsApp link |
| `tickets/expire-reservations` | every 1 min | — | RESERVED past `reservedUntil` → EXPIRED; release seats |
| `media/process-image` | upload complete | `{mediaItemId}` | sharp: rotate, strip metadata (keep `takenAt`), 320 + 1080 AVIF/WebP, blur (16 px base64), sha256 dedupe → `media/moderate` |
| `media/process-video` | upload complete | `{mediaItemId}` | ffmpeg: H.264 720p, poster; reject > limit duration |
| `media/moderate` | after process | `{mediaItemId}` | ModerationProvider → PUBLISHED / PENDING_REVIEW / BLOCKED; SSE publish |
| `media/watermark` | publish album / balance paid | `{galleryId}` | Apply/remove watermark on 1080 derivatives |
| `media/build-zip` | action | `{galleryId, requestedBy}` | Stream zip to R2 (archiver), email link (7 days) |
| `media/purge-expired-galleries` | daily | — | After warning emails at −14 and −3 days |
| `payments/process-webhook` | webhook | `{providerEventId}` | §7.3 step 5 |
| `payments/verify-pending` | every 10 min | — | Verify stale PENDING payments |
| `payments/release-check` | every 5 min | — | §7.4 (flag) |
| `payments/execute-payout` | outbox `payout.request` | `{orgId}` | §7.5 (flag) |
| `payments/reconcile-daily` | 02:00 WAT | — | §8.3 |
| `payments/create-subaccount` | bank setup | `{bankAccountId}` | Provider subaccount + transfer recipient |
| `ai/caption-media` | after publish (flag) | `{mediaItemId}` | Alt text with small model |
| `maintenance/retention-purge` | daily | — | Hard-delete soft-deleted data past retention |
| `marketplace/rating-rollup` | on review + nightly | `{orgId}` | Recompute ratingAvg/ratingCount/completedBookings |

---

## 11. Route handlers (HTTP API)

| Method & path | Auth | Purpose |
|---------------|------|---------|
| `GET /api/health` | none | DB + Redis check |
| `POST /api/uploads/create` | user or guest session | Validate limits, create MediaItem/Document, start multipart |
| `POST /api/uploads/sign-part` | same | Pre-signed URL for a part (5 MB) |
| `POST /api/uploads/complete` | same | Complete multipart, enqueue processing |
| `POST /api/uploads/abort` | same | Abort and mark FAILED |
| `POST /api/webhooks/paystack` | signature (`x-paystack-signature` HMAC SHA512) | Store + enqueue |
| `POST /api/webhooks/flutterwave` | `verif-hash` header | Store + enqueue |
| `GET/POST /api/webhooks/whatsapp` | verify token / `X-Hub-Signature-256` | Delivery + reply-button events → RSVP |
| `POST /api/webhooks/resend` | signature | Email delivered/opened |
| `POST /api/webhooks/termii` | shared secret | SMS delivery |
| `GET /api/sse/gallery/{galleryId}` | gallery access | New/updated items |
| `GET /api/sse/invites/{eventId}` | `guests.manage` | Delivery + RSVP updates |
| `GET /api/sse/checkin/{eventId}` | `checkin.scan` | Counts |
| `GET /api/sse/day/{eventId}` | event member | Run-of-show updates |
| `GET /api/sse/inbox` | logged in | All of the user's chat events: new messages, edits, receipts, typing |
| `POST /api/chat/typing` | thread participant | Ephemeral typing signal (Redis, 5 s) |
| `GET /api/sse/payment/{paymentId}` | payer | Payment confirmation |
| `GET /api/ics/{token}` | invite token | Calendar file |
| `POST /api/rsvp` | invite token | JSON RSVP (used by the invite page's on-load POST) |
| `GET /api/checkin/{eventId}/offline-list` | `checkin.scan` | Signed list for offline scanning |
| `POST /api/checkin/{eventId}/sync` | `checkin.scan` | Upload queued offline scans |
| `GET /api/media/{id}/original` | per gallery rules | Redirect to signed URL (download) |
| `GET /dev/fake-checkout` | local/preview only | Fake provider checkout page |

All handlers: Zod-validate input, rate-limit (§13), return JSON `{ ok, data | error: { code, message } }`.

---

## 12. Security and privacy

- **Sessions:** httpOnly, Secure, SameSite=Lax cookies; rotate on login; 30-day sliding expiry; admin sessions 12 h + re-auth for money actions.
- **CSRF:** Server Actions include origin checks; route handlers verify `Origin` for state-changing requests (except signed webhooks).
- **Headers:** CSP with nonces, HSTS, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy (camera only on check-in and upload pages).
- **Uploads:** check magic bytes (file-type), allow-list MIME (jpeg, png, webp, heic, mp4, mov, pdf, webm/ogg/mp4 audio for voice notes, common office documents for chat), size limits, per-session and per-IP rate limits.
- **Tokens:** invitation, ticket and gallery tokens are random (≥ 128 bits) and stored hashed where only verification is needed (ticket QR uses HMAC-signed payload `ticketId.exp.sig`).
- **PII:** never log names, phones, emails, addresses; Sentry `beforeSend` scrubs them.
- **Admin:** every admin action → AuditLog; FINANCE role required for money decisions; SUPER for flag overrides.
- **Data rights:** `exportMyData` builds a ZIP (JSON + media links); `deleteMyAccount` anonymises the user, keeps ledger/audit references (legal retention), deletes media they uploaded unless part of a booking deliverable.
- **Retention:** free galleries 3 months after event, Plus 2 years; guest data 12 months after event; payment records 6 years (configurable per country).
- **Child safety:** CSAM hash-matching on the media domain + moderation API; blocked items quarantined and reported per law; no admin can download blocked items except TRUST_SAFETY.

---

## 13. Validation, errors and rate limits

| Endpoint group | Limit (Redis sliding window) |
|----------------|------------------------------|
| OTP send | 3 per phone per 10 min; 20 per IP per hour |
| Login attempts | 10 per IP per 10 min |
| RSVP | 10 per token per hour |
| Upload create | 100 per guest session per hour; 2,000 per gallery per 10 min |
| Search | 60 per IP per minute |
| Checkout start | 10 per user per 10 min |
| AI | 30 per user per hour; org daily token cap |
| Chat | 30 messages per user per minute; new accounts: 10 new threads per day |

Error codes (stable, used by UI): `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `LIMIT_REACHED`, `RATE_LIMITED`, `PAYMENT_FAILED`, `PROVIDER_UNAVAILABLE`, `FEATURE_DISABLED`, `INTERNAL`.

---

## 14. Seed data (`pnpm db:seed`)

- Countries: NG (NGN, Africa/Lagos, Paystack/Flutterwave, VAT 7.5%), plus GB and US config stubs (not active).
- Users: 1 admin (`admin@tiwa.test`), 3 hosts, 3 planner orgs (one with 10 events), 40 vendor orgs across 10 categories in Lagos with portfolios (placeholder images), packages, availability and 0–30 reviews.
- Venues: 8 venue businesses with 1–3 spaces each (halls, garden, rooftop, conference room), capacities, slot prices, security deposits, 2 with instant booking on, some blocked dates.
- Events: one of each format: a birthday (private, invites on, 80 guests), a wedding (2 days, 400 guests, bookings with HELD and DIRECT milestones), a burial (committee contributions), a corporate end-of-year party, a conference (public, 3 ticket types, agenda), a church programme.
- Gallery with 200 sample photos (generated gradients via sharp so no copyrighted images) and 10 videos.
- Large-data seed `pnpm db:seed:load`: 5,000 vendors, 5,000 guests, 5,000 media items for performance tests.

---

## 15. Backend testing

| Area | Required tests |
|------|----------------|
| `core/auth` | Full permission matrix table-driven test (every role × action) |
| State machines | Every allowed and a sample of forbidden transitions |
| Money | Property-based tests (fast-check) for `allocate`, `mulBps`, budget figures |
| Ledger | Every posting sums to zero; duplicate reference returns existing; UPDATE/DELETE rejected |
| Payments | Webhook duplicate, out-of-order webhooks, verify mismatch, expired payment, refund, release with/without dispute, payout failure → retry → exception |
| Tickets | Concurrency test: 200 parallel reservations for 100 seats |
| Venues | 50 parallel bookings of one space/date/slot → exactly one succeeds; a FULL_DAY block rejects an EVENING booking and the reverse; an expired hold frees the slot; security deposit refunded only without a damage claim |
| Invites | Batch fan-out counts, rate limiting, reminder cap, RSVP via WhatsApp button webhook |
| Moments | Upload limits, GPS stripped (read EXIF of outputs), moderation fake blocks |
| Tenant isolation | Planner org B cannot read org A's clients, events, prices |
| Jobs | Each job idempotent (run twice → same state) |
| Chat | `canMessage` table-driven test for every row of §9a.1 (including guest before/after event end); duplicate `clientMessageId` stores one message; masking on/off around booking confirmation; block stops sending; receipts update for business participants |

Integration tests run against a real Postgres (Docker or Testcontainers) with a fresh schema per test file; Redis via Testcontainers or `ioredis-mock` for unit tests.
