# PRD.md — Tiwa MVP Product Requirements

Every requirement has an ID (for example `EVT-03`). `BUILD_PLAN.md` tasks and `user_flow.md` checks refer to these IDs. **MVP** means it ships in the Lagos launch. **Flagged** means it ships in the MVP behind a feature flag that is off in production until the condition in brackets is met.

---

## 1. Product summary

**Tiwa** ("ours" in Yoruba) is a web platform where people plan, book, pay for, run and remember any event in one shared record.

- **Launch market:** Lagos, Nigeria. Currency NGN. Language English.
- **Built for:** any country (all country rules are configuration).
- **Platform:** one responsive web app, installable to the home screen (PWA). Guests never need an account or an app.

### Goals for the MVP (first 12 months)

| Goal | Target |
|------|--------|
| Events run end to end on Tiwa | 1,000 |
| Monthly active planners | 150 |
| Paid planner retention after 3 months | 70% |
| Guests uploading to Moments per event | 30% of attendees |
| Gallery visitors who sign up | 3% |
| Quote-to-booking conversion | 25% |
| Disputes per 100 bookings | under 2 |

---

## 2. Users and roles

| Role | Description | Needs an account? |
|------|-------------|-------------------|
| `HOST` | Owns an event (individual, family, company, church, school, association, promoter) | Yes |
| `CO_HOST` | Added by the host with set permissions | Yes |
| `PLANNER` | Professional hired on an event; member of a planner Organization | Yes |
| `PLANNER_STAFF` | Planner's team member, limited permissions | Yes |
| `VENDOR` | Service business; member of a vendor Organization | Yes |
| `PHOTOGRAPHER` | A vendor with permission to publish to the Official album of an event | Yes |
| `GUEST` | Invited or registered attendee, speaker or performer | **No** (identified by a signed link or ticket) |
| `ADMIN` | Tiwa staff (sub-roles: `SUPPORT`, `TRUST_SAFETY`, `FINANCE`, `SUPER`) | Yes |

One user can hold different roles on different events. Permissions come from the role **on that event** (or in that organisation), never from the account alone.

### 2.1 Permission matrix (on one event)

`✔` allowed · `○` only if the host grants it · `own` only their own records · `—` never

| Action | Host | Co-host | Planner | Planner staff | Vendor | Photographer | Guest |
|--------|------|---------|---------|---------------|--------|--------------|-------|
| View event overview | ✔ | ✔ | ✔ | ✔ | own booking brief | own booking brief | public info only |
| Edit event details | ✔ | ○ | ✔ | ○ | — | — | — |
| Manage members and permissions | ✔ | — | ○ | — | — | — | — |
| View budget and payments | ✔ | ○ | ✔ | ○ | own booking | own booking | — |
| Edit budget, record expenses | ✔ | ○ | ✔ | ○ | — | — | — |
| Approve quotes / accept bookings | ✔ | ○ (up to amount) | ○ | — | — | — | — |
| Pay vendors | ✔ | ○ | ○ | — | — | — | — |
| See planner's vendor prices & margin | ○ (planner decides) | — | ✔ | ○ | — | — | — |
| Manage guest list and invites | ✔ | ○ | ✔ | ✔ | — | — | — |
| View guest contact details | ✔ | ○ | ✔ | ✔ | — (counts and dietary needs only) | — | — |
| Manage tickets | ✔ | ○ | ✔ | ○ | — | — | — |
| Check in guests | ✔ | ○ | ✔ | ✔ | — | — | — |
| Run-of-show: edit | ✔ | ○ | ✔ | ✔ | own tasks status | own tasks status | — |
| Moments: moderate | ✔ | ○ | ✔ | ○ | — | — | own uploads |
| Moments: upload Guest album | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Moments: upload Official album | — | — | ○ | — | — | ✔ | — |
| Write a review of a vendor | ✔ (after completion) | — | ✔ (after completion) | — | — | — | — |
| Open a dispute | ✔ | — | ✔ | — | own booking | own booking | — |
| Chat with vendors/planners | ✔ | ○ | ✔ | ✔ (planner's threads) | reply + own threads | reply + own threads | after the event, with businesses of events attended (phone verified) |
| Close or cancel event | ✔ | — | — | — | — | — | — |

The planner controls whether the host can see vendor prices (`EVT-12`). Planners often charge a package price and must not be forced to expose margins.

---

## 3. Event formats and types

| Format | Example types (template keys) | Features usually on |
|--------|-------------------------------|---------------------|
| `PRIVATE_CELEBRATION` | `birthday`, `wedding_white`, `wedding_traditional`, `naming`, `anniversary`, `burial`, `memorial`, `housewarming`, `graduation_party` | Invites, contributions, Moments |
| `CORPORATE` | `meeting`, `retreat`, `product_launch`, `end_of_year_party`, `award_night`, `training` | Approvals, invoices, branded gallery |
| `PUBLIC_TICKETED` | `conference`, `concert`, `festival`, `exhibition`, `fashion_show`, `sports_event` | Registration, tickets, agenda, check-in |
| `COMMUNITY` | `church_programme`, `mosque_programme`, `alumni_reunion`, `school_event`, `fundraiser`, `association_meeting` | Member contributions, donations, Moments |

Each type is a template in `packages/config/event-types/*.ts` with: label, format, default checklist, default budget categories and percentages, suggested vendor categories, default features, default programme items (ceremony segments, sessions, performances).

---

## 4. Requirements by module

### 4.1 Events and planning — `EVT`

| ID | Requirement | Scope |
|----|-------------|-------|
| EVT-01 | Create an event with a wizard: type, name, dates/times, venues, expected guests, budget, currency (from country), visibility (`PRIVATE`, `LINK_ONLY`, `PUBLIC`) | MVP |
| EVT-02 | Choose optional features per event: Invitations, Tickets (public only), Moments, Planner | MVP |
| EVT-03 | Generate a checklist from the event-type template; each task has title, owner, due date, priority, status (`TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`) | MVP |
| EVT-04 | Multi-day and multi-venue schedules (event days with programme items) | MVP |
| EVT-05 | Overview page: progress (done/outstanding/overdue/blocked), next 5 deadlines, money summary, team | MVP |
| EVT-06 | Invite co-hosts by phone or email with a permission set | MVP |
| EVT-07 | Hire/attach a planner to an event; planner gets the workspace | MVP |
| EVT-08 | Document storage per event (PDF, images, max 25 MB each) | MVP |
| EVT-09 | Duplicate an event as a new draft | MVP |
| EVT-10 | Cancel an event (blocked delete when bookings or payments exist) | MVP |
| EVT-11 | Close an event: mark complete, trigger review requests and final reconciliation | MVP |
| EVT-12 | Planner setting: show/hide vendor-level prices to the host | MVP |
| EVT-13 | Event cover image and theme colour used on guest pages | MVP |

### 4.2 Guests, invitations and RSVP — `GST`

| ID | Requirement | Scope |
|----|-------------|-------|
| GST-01 | Guest list with name, phone, email, group, custom fields, plus-ones, dietary needs | MVP |
| GST-02 | Add guests manually, paste a list, import CSV, or pick from phone contacts (Contact Picker API where supported) | MVP |
| GST-03 | Groups (family, friends, VIP, colleagues, members, speakers, performers, press, sponsors) — user-defined | MVP |
| GST-04 | **Invitations are optional.** Off by default. Host turns them on per event | MVP |
| GST-05 | **One-click send:** host selects guests + channels (link, QR, WhatsApp, email, SMS) and presses one button | MVP |
| GST-06 | Small-event mode: copy one shared event link or download one QR code; anyone with it can RSVP with a name | MVP |
| GST-07 | Personal invite link per guest (`/i/{token}`) — guest RSVPs with one tap, no account | MVP |
| GST-08 | Email invites contain one-tap Yes/No buttons | MVP |
| GST-09 | WhatsApp free mode: open `wa.me` share link prefilled with message + personal link (host sends from own WhatsApp) | MVP |
| GST-10 | WhatsApp bulk mode via Cloud API with approved templates and reply buttons | Flagged (`whatsapp.bulk`; needs approved Meta templates) |
| GST-11 | SMS invites via Termii with short personal link | MVP |
| GST-12 | Live delivery tracking: queued, sent, delivered, opened (where reported), yes, no, no reply, checked in | MVP |
| GST-13 | Automatic reminders to non-responders (max 2) and a day-before reminder to attendees | MVP |
| GST-14 | Send updates to all guests or only to attendees | MVP |
| GST-15 | After "yes": personal pass with QR code, add to calendar (.ics + Google link), directions, Moments link | MVP |
| GST-16 | Optional RSVP extras: plus-ones, meal choice, custom question — shown only if enabled | MVP |
| GST-17 | Headcount report (by RSVP, by meal, by group) shareable with caterer/venue without contact details | MVP |
| GST-18 | Host can allow or forbid forwarding of invites | MVP |
| GST-19 | Simple seating: assign guests to named tables (list, not drag-and-drop) | MVP |

### 4.3 Tickets and registration — `TKT`

| ID | Requirement | Scope |
|----|-------------|-------|
| TKT-01 | Public event page `/e/{slug}` with details, agenda list, ticket types | MVP |
| TKT-02 | Ticket types: name, free or paid, price, quantity, sale start/end, max per order | MVP |
| TKT-03 | Promo codes: % or fixed discount, usage limit, expiry | MVP |
| TKT-04 | Registration form with configurable questions | MVP |
| TKT-05 | Checkout through payment provider; tickets issued only after confirmed payment | MVP |
| TKT-06 | No overselling: capacity checked in a database transaction | MVP |
| TKT-07 | Ticket delivered by email and WhatsApp link with QR code; viewable at `/t/{id}` | MVP |
| TKT-08 | Waitlist when sold out; notify when tickets free up | MVP |
| TKT-09 | Simple agenda: sessions with title, time, room, speaker | MVP |
| TKT-10 | Organiser payout of ticket revenue (after event or rolling) | Flagged (`payments.payouts`) |

### 4.4 Moments (event gallery) — `MOM`

| ID | Requirement | Scope |
|----|-------------|-------|
| MOM-01 | Each event has a gallery with two albums: Official and Guest | MVP |
| MOM-02 | Guest upload page via QR/link, no account; optional first name | MVP |
| MOM-03 | Upload up to 50 files per batch; images resized on device; resumable, parallel (3) uploads directly to storage | MVP |
| MOM-04 | Video upload up to 30 s on free plan, 3 min on Plus; max 200 MB | MVP |
| MOM-05 | Processing: thumbnails (320, 1080), blur placeholder, EXIF GPS removal, duplicate detection | MVP |
| MOM-06 | Safety scan on every upload; blocked items never shown | MVP |
| MOM-07 | Moderation mode per event: post instantly or approve first | MVP |
| MOM-08 | Host can hide, delete, feature items, and block an uploader | MVP |
| MOM-09 | Photographer uploads full-resolution files to the Official album; optional watermark until booking balance is paid | MVP |
| MOM-10 | Live gallery updates (new items within 10 s) | MVP |
| MOM-11 | Venue slideshow page with configurable delay (default 30 s) | MVP |
| MOM-12 | Download all as ZIP (generated by worker, emailed link) | MVP |
| MOM-13 | Gallery privacy: guests only (invite/ticket holders), link holders, public | MVP |
| MOM-14 | Guestbook: text messages to hosts, exportable as PDF | MVP |
| MOM-15 | "Planned with Tiwa" footer linking the event's planner and vendors (host can hide on Plus) | MVP |
| MOM-16 | Free plan: 500 items, kept 3 months. Moments Plus: unlimited, 2 years | MVP |
| MOM-17 | Guests can delete their own uploads; anyone can request removal of a photo of themselves | MVP |
| MOM-18 | Face matching, highlight video, print sales | Out of scope |

### 4.5 Marketplace — `MKT`

| ID | Requirement | Scope |
|----|-------------|-------|
| MKT-01 | Vendor profile: name, categories, city/service area, bio, portfolio (images/videos), packages, starting price, travel fee, contact via Tiwa | MVP |
| MKT-02 | Planner profile: specialisms, packages (full, partial, day-of, consultation), portfolio | MVP |
| MKT-03 | Search vendors by category, city, date availability, price range, rating, verified | MVP |
| MKT-04 | Availability calendar (blocked dates) with "last confirmed" date; older than 14 days shows "unconfirmed" | MVP |
| MKT-05 | Shortlist and compare vendors side by side | MVP |
| MKT-06 | Verified badge (identity + business) separate from rating | MVP |
| MKT-07 | Shareable profile URL with Open Graph preview | MVP |
| MKT-08 | Request for proposal to up to 5 planners | MVP |

### 4.5a Venues — `VEN`

Venues are vendors in the `venue` category with extra structure, because a venue sells **a space on a date and time slot**, not a service package.

| ID | Requirement | Scope |
|----|-------------|-------|
| VEN-01 | A venue business lists one or more spaces (hall, garden, rooftop, conference room) with photos, indoor/outdoor, size, capacity by layout (seated banquet, theatre, standing), amenities (parking, power backup, air conditioning, stage, kitchen, changing room, sound system, wheelchair access) and house rules (curfew, outside caterer policy, decor limits) | MVP |
| VEN-02 | Prices per slot: morning, afternoon, evening, full day, and optional hourly extra; included setup and teardown time | MVP |
| VEN-03 | Refundable security (caution) deposit per space, collected as its own payment milestone with no platform fee | MVP |
| VEN-04 | Availability per space, per date and slot; venue can block dates booked outside Tiwa in two taps; a full-day block blocks all slots | MVP |
| VEN-05 | Venue search: date + slot, guest count (capacity for the chosen layout ≥ guests), area, price range, indoor/outdoor, amenities | MVP |
| VEN-06 | Two ways to book: **request a quote** (venue replies with a quote) or **instant book** (if the venue turns it on and has slot prices) | MVP |
| VEN-07 | Provisional hold: an accepted booking holds the space until the deposit is due (default 72 h, venue can change); unpaid → hold expires and the slot is freed | MVP |
| VEN-08 | Double booking is impossible: one confirmed or held booking per space, date and slot (database-enforced) | MVP |
| VEN-09 | Site visit requests: client proposes up to 3 times, venue confirms one; reminders to both | MVP |
| VEN-10 | Security deposit settlement: refunded after the event unless the venue files a damage claim (dispute with evidence) within 72 h; in Direct/Offline mode the venue refunds and the host confirms | MVP (held part flagged with PAY-04) |
| VEN-11 | Both hosts and planners can search, request, visit and book venues for an event; a co-host needs approval permission to book | MVP |

### 4.6 Quotes and bookings — `QTE`

| ID | Requirement | Scope |
|----|-------------|-------|
| QTE-01 | Request quotes from up to 5 vendors at once with a brief | MVP |
| QTE-02 | Vendor quote builder: line items (name, qty, unit price), tax, service charge, travel fee, notes, expiry | MVP |
| QTE-03 | Compare quotes side by side | MVP |
| QTE-04 | Accept, decline, or request changes | MVP |
| QTE-05 | Accepting creates a Booking (version 1) with scope, terms, cancellation policy, payment schedule and payment mode | MVP |
| QTE-06 | Booking statuses per `Backend.md §5.1`, changed only by server | MVP |
| QTE-07 | Change requests create a new version both sides must accept; old versions read-only | MVP |
| QTE-08 | Booking brief for vendor: date, venue, times, headcount, contact on the day | MVP |
| QTE-09 | Click-to-accept with timestamp, IP and user recorded | MVP |

### 4.7 Payments — `PAY`

| ID | Requirement | Scope |
|----|-------------|-------|
| PAY-01 | Checkout inside Tiwa via Paystack or Flutterwave (card, transfer, USSD); provider chosen by config | MVP |
| PAY-02 | Payment modes per booking: `DIRECT`, `HELD`, `OFFLINE` | MVP (HELD flagged) |
| PAY-03 | DIRECT: split payment to vendor subaccount with Tiwa fee | MVP |
| PAY-04 | HELD: money held via licensed partner, released per milestone rule | Flagged (`payments.held`; needs licensed partner + legal sign-off) |
| PAY-05 | Milestone release rules: `ON_PAYMENT`, `ON_DATE`, `ON_VENDOR_CHECK_IN`, `ON_HOST_SIGNOFF`; auto-release after N hours (default 72 h after event) unless disputed | Flagged with PAY-04 |
| PAY-06 | Payouts to verified bank accounts via provider transfers | Flagged (`payments.payouts`) |
| PAY-07 | OFFLINE: record cash/transfer payment with optional receipt; both parties can confirm | MVP |
| PAY-08 | Webhooks verified, idempotent; booking/ticket state changes only after verified webhook | MVP |
| PAY-09 | Refunds (full/partial) per cancellation terms | MVP |
| PAY-10 | Disputes freeze held money until staff decide | MVP |
| PAY-11 | Double-entry ledger for all money movements | MVP |
| PAY-12 | Daily reconciliation; differences open admin exceptions and pause payouts | MVP |
| PAY-13 | Receipts for every payment (PDF + email) | MVP |
| PAY-14 | Subscriptions (Planner Pro, Vendor Pro) and one-off Moments Plus purchases | MVP |

### 4.8 Budget and finance — `BUD`

| ID | Requirement | Scope |
|----|-------------|-------|
| BUD-01 | Budget with categories from template; editable allocations | MVP |
| BUD-02 | Show Planned, Committed, Paid, Outstanding (= Committed − Paid), Uncommitted (= Planned − Committed) | MVP |
| BUD-03 | Income lines for ticket sales and sponsorship | MVP |
| BUD-04 | Contributions: who pledged, how much, received amount (from family, committee, members, sponsors) | MVP |
| BUD-05 | Expenses outside bookings with receipt photos | MVP |
| BUD-06 | Alerts: category over budget; payment due in 7 days and 1 day | MVP |
| BUD-07 | Change log of budget changes | MVP |
| BUD-08 | Export PDF and CSV | MVP |

### 4.9 Planner workspace — `PLN`

| ID | Requirement | Scope |
|----|-------------|-------|
| PLN-01 | Multi-event dashboard: approvals waiting, balances due, deadlines at risk, clients needing updates | MVP |
| PLN-02 | Client CRM: contacts, notes, events | MVP |
| PLN-03 | Lead pipeline: enquiry → proposal sent → won / lost | MVP |
| PLN-04 | Proposal and package templates with branding | MVP |
| PLN-05 | Team members with roles; task assignment | MVP |
| PLN-06 | Private vendor book (trusted vendors, notes, rates) | MVP |
| PLN-07 | Calendar across events | MVP |
| PLN-08 | Invoices to clients and payment reminders | MVP |
| PLN-09 | Profit per event | Out of scope |

### 4.10 Vendor dashboard — `VND`

| ID | Requirement | Scope |
|----|-------------|-------|
| VND-01 | Enquiry inbox with status | MVP |
| VND-02 | Quote templates | MVP |
| VND-03 | Booking calendar; blocks double booking (warning when a date already has a confirmed booking) | MVP |
| VND-04 | Payment status per booking (secured, released, paid out, outstanding) | MVP |
| VND-05 | Staff accounts and assignment | MVP |
| VND-06 | Bank account setup for split payments and payouts (verified by name) | MVP |
| VND-07 | Analytics | Out of scope |

### 4.11 Event day — `DAY`

| ID | Requirement | Scope |
|----|-------------|-------|
| DAY-01 | Run-of-show items: time, title, owner (participant or vendor), duration, status | MVP |
| DAY-02 | Dependencies between items; marking an item late flags all dependants and alerts their owners | MVP |
| DAY-03 | Vendor check-in with one tap (time + optional location) | MVP |
| DAY-04 | Incident log: time, description, owner, resolution | MVP |
| DAY-05 | Emergency contacts and backup vendors list | MVP |
| DAY-06 | Works offline after first load; syncs when online | MVP |
| DAY-07 | Door check-in scanner for invites and tickets; offline list; duplicate detection | MVP |
| DAY-08 | Host sign-off of each booking's delivery (feeds PAY-05) | MVP |

### 4.12 Chat and notifications — `MSG`

Chat is a core MVP feature: clients, planners, vendors and guests talk inside Tiwa, and important messages stay attached to the event and booking. Rules in `Backend.md §9a`.

| ID | Requirement | Scope |
|----|-------------|-------|
| MSG-01 | One inbox for every conversation, with unread counts in the navigation, search by name and text, and filters (All, Unread, Enquiries, Bookings, Team) | MVP |
| MSG-02 | **Start a chat from anywhere it makes sense:** a vendor, venue or planner profile ("Message"), a quote request, a quote, a booking, a site visit, a planner's client/lead, and the event team | MVP |
| MSG-03 | **Client ↔ vendor/venue/planner chat before any booking** (questions, availability, negotiation) | MVP |
| MSG-04 | **Planner ↔ client** chat (including leads in the CRM) and **planner ↔ vendor** chat outside bookings | MVP |
| MSG-05 | Event-team thread (host, co-hosts, planner, staff) and one thread per booking, created and kept up to date automatically | MVP |
| MSG-06 | **Guests can message a vendor or planner after the event ends**, if that business worked on an event the guest attended and allows guest enquiries; the guest verifies a phone number first. Vendors can reply but never message guests first | MVP |
| MSG-07 | Real-time delivery, **delivered and seen receipts**, **typing indicator**, quoted replies, edit within 15 minutes, delete | MVP |
| MSG-08 | Photos, files (up to 25 MB) and **voice notes** (up to 2 minutes, playable on every browser) | MVP |
| MSG-09 | Share live **cards** in chat: quote, booking, site visit, profile, payment request | MVP |
| MSG-10 | Business inboxes are shared by the team: any member with access can reply on behalf of the business; the other side sees the business name and the member's first name | MVP |
| MSG-11 | Before a booking is confirmed, phone numbers, emails and WhatsApp links are hidden from the other side with a friendly warning to the sender; shown freely after booking | MVP |
| MSG-12 | Mark a message as a decision (pinned to the event record); @mentions in team threads | MVP |
| MSG-13 | Block a person or business; report a message; spam limits for new accounts | MVP |
| MSG-14 | Mute and archive conversations | MVP |
| MSG-15 | Notifications: in-app, web push, email, SMS, WhatsApp (where enabled), with per-user preferences and quiet hours; unread chat messages trigger push after 2 minutes and one email/WhatsApp summary after 15 minutes | MVP |
| MSG-16 | Urgent alerts (event-day, payment failures) use SMS/WhatsApp because iOS web push needs home-screen install | MVP |

### 4.13 Reviews — `REV`

| ID | Requirement | Scope |
|----|-------------|-------|
| REV-01 | Only the host or planner of a COMPLETED booking can review that vendor, once per booking | MVP |
| REV-02 | Scores 1–5: quality, communication, punctuality, value, kept to scope; overall = mean | MVP |
| REV-03 | Text and optional photos (can pick from event Moments) | MVP |
| REV-04 | Vendor can reply once publicly | MVP |
| REV-05 | Show score only after 5 reviews; below that show "New on Tiwa · N reviews" | MVP |
| REV-06 | Vendor can report a review; staff decide | MVP |

### 4.14 AI assistant — `AI`

| ID | Requirement | Scope |
|----|-------------|-------|
| AI-01 | Draft checklist and budget split from event details | MVP (flag `ai.enabled`) |
| AI-02 | Compare quotes: highlight missing items, unclear terms, extra fees | MVP (flag) |
| AI-03 | Guest-count change impact list | MVP (flag) |
| AI-04 | Draft messages (invites, vendor briefs, client updates) in English and Nigerian Pidgin | MVP (flag) |
| AI-05 | Auto alt-text captions for Moments | MVP (flag) |
| AI-06 | AI never changes data without the user pressing a confirm button | MVP |

### 4.15 Admin — `ADM`

| ID | Requirement | Scope |
|----|-------------|-------|
| ADM-01 | Verify vendors/planners: ID, CAC registration, bank account name match; expiry | MVP |
| ADM-02 | Moderation queue: reported media, listings, reviews | MVP |
| ADM-03 | Disputes: evidence from both sides; decide release / refund / split | MVP |
| ADM-04 | Payment exceptions from reconciliation | MVP |
| ADM-05 | User search, suspend, reinstate (with reason) | MVP |
| ADM-06 | Audit log of all staff actions | MVP |
| ADM-07 | Feature flag overrides per country | MVP |

### 4.16 Accounts and settings — `ACC`

| ID | Requirement | Scope |
|----|-------------|-------|
| ACC-01 | Sign up / log in with phone OTP, email magic link, or Google | MVP |
| ACC-02 | Choose starting role: host, planner, vendor (can add more later) | MVP |
| ACC-03 | Create or join an Organization (planner or vendor business) | MVP |
| ACC-04 | Profile, language, theme, notification preferences | MVP |
| ACC-05 | Export my data; delete my account | MVP |

---

## 5. Non-functional requirements — `NFR`

| ID | Requirement |
|----|-------------|
| NFR-01 | Performance budgets in `Frontend.md §9` (e.g. guest pages LCP ≤ 1.5 s on Slow 4G, JS ≤ 90 KB) |
| NFR-02 | Responsive 360–1440 px; installable PWA; offline event-day and check-in |
| NFR-03 | WCAG 2.2 AA |
| NFR-04 | Availability 99.5% monthly for web and API |
| NFR-05 | Nigeria Data Protection Act 2023 compliance; GDPR-ready design |
| NFR-06 | All money in BigInt minor units; ledger balances to zero |
| NFR-07 | Every staff action and every money movement is audit-logged |
| NFR-08 | 500 concurrent uploaders per event; 2,000 invites sent in < 5 min; 300 check-ins/min |
| NFR-09 | Browser support: last 2 versions of Chrome, Safari (iOS 16.4+), Firefox, Edge, Samsung Internet; Opera Mini shows a basic fallback for guest pages |

---

## 6. Pricing (configuration, not code)

| Product | Price (NGN, hypothesis) |
|---------|------------------------|
| Planner Pro | ₦15,000–₦35,000 / month |
| Vendor Pro | ₦5,000–₦15,000 / month |
| Moments Plus | ₦15,000–₦30,000 / event |
| Ticketing fee | 3–5% per paid ticket |
| Booking fee (marketplace bookings paid through Tiwa) | 3–7% |

All prices live in `packages/config/pricing.ts` per country.
