# Frontend.md — Tiwa Frontend Specification

How every screen looks, behaves and performs. Read `PRD.md` and `user_flow.md` for what each screen must do; this file says how to build it.

---

## 1. Principles

1. **Phone first.** Design and build every screen at 390 px first, then add `md:` and `lg:` styles.
2. **Server first.** Pages are React Server Components. Add `"use client"` only to the smallest component that needs state, effects or browser APIs.
3. **Never blank.** Every route has `loading.tsx` (skeleton matching the final layout), an empty state and `error.tsx`.
4. **Instant feel.** Optimistic updates for small mutations; buttons show pressed/loading states within 100 ms.
5. **One primary action per screen.** Sticky bottom bar on mobile; top-right on desktop.
6. **Calm work, joyful moments.** Neutral surfaces for planning screens; photos and the accent colour on guest and Moments screens.
7. **Configuration, not copy.** Every string comes from `messages/en.json`; event-type words come from `packages/config`.

---

## 2. Design tokens

File: `packages/ui/src/tokens.css`. Hex values are a starting point: check each text/background pair reaches WCAG AA (4.5:1 for body text, 3:1 for large text and UI borders) and adjust.

```css
:root {
  --bg: #ffffff;
  --surface: #f7f7f8;
  --surface-2: #efeff2;
  --border: #e6e6ea;
  --text: #111118;
  --text-muted: #5f6170;
  --brand: #e5532d;          /* decorative, icons, large text */
  --brand-strong: #b83a17;   /* buttons, links */
  --brand-soft: #fdece6;     /* tinted backgrounds */
  --on-brand: #ffffff;
  --accent: #f2b705;         /* celebration highlights */
  --success: #15803d;  --success-soft: #e8f5ec;
  --warning: #b45309;  --warning-soft: #fdf3e2;
  --danger:  #b91c1c;  --danger-soft:  #fbe9e9;
  --focus: #2563eb;

  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-full: 9999px;
  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.06), 0 1px 1px rgb(0 0 0 / 0.04);
  --shadow-2: 0 8px 24px rgb(0 0 0 / 0.10);

  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-display: var(--font-jakarta), var(--font-inter), system-ui, sans-serif;

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast: 150ms; --dur: 200ms; --dur-slow: 280ms;

  --shell-sidebar: 240px; --shell-sidebar-collapsed: 72px;
  --shell-topbar: 56px; --shell-tabbar: 64px;
  --content-max: 1200px; --guest-max: 560px;
}

:root[data-theme="dark"] {
  --bg: #0b0b0f; --surface: #15151b; --surface-2: #1d1d25; --border: #2a2a33;
  --text: #f4f4f6; --text-muted: #a0a2b0;
  --brand: #ff6a43; --brand-strong: #ff8a69; --brand-soft: #2a1610; --on-brand: #140804;
  --accent: #f5c842;
  --success: #4ade80; --success-soft: #0f2416;
  --warning: #fbbf24; --warning-soft: #2a1f08;
  --danger: #f87171;  --danger-soft: #2b1111;
  --focus: #60a5fa;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* same values as [data-theme="dark"] */ }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

Theme: follow system by default; user can choose Light/Dark/System in settings (stored in a cookie so the server renders the right theme with no flash).

### Scales

| Scale | Values |
|-------|--------|
| Spacing (px) | 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Font size (px / line height) | 12/16, 14/20, 16/24, 18/26, 20/28, 24/32, 30/38, 36/44 |
| Font weight | 400 body, 500 labels, 600 headings & buttons, 700 display numbers |
| Icon size | 16 (inline), 20 (default), 24 (tab bar) — Lucide, stroke 1.75 |
| Touch target | ≥ 44 × 44 px |

---

## 3. Tailwind preset

`packages/ui/tailwind-preset.ts` maps tokens so components use semantic classes (`bg-surface`, `text-muted`, `bg-brand-strong`, `rounded-md`).

```ts
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)', border: 'var(--border)',
        text: 'var(--text)', muted: 'var(--text-muted)',
        brand: { DEFAULT: 'var(--brand)', strong: 'var(--brand-strong)', soft: 'var(--brand-soft)', on: 'var(--on-brand)' },
        accent: 'var(--accent)',
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger:  { DEFAULT: 'var(--danger)',  soft: 'var(--danger-soft)' },
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)' },
      fontFamily: { sans: 'var(--font-sans)', display: 'var(--font-display)' },
      boxShadow: { 1: 'var(--shadow-1)', 2: 'var(--shadow-2)' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
    },
  },
};
```

### Fonts (`apps/web/app/layout.tsx`)

```ts
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-jakarta', display: 'swap' });
```

`next/font` self-hosts the files at build time (no request to Google at runtime).

---

## 4. Components (`packages/ui`)

Build each once, show all variants on `/dev/ui` in light and dark at 390 and 1280 px. Base them on shadcn/ui + Radix and restyle with tokens.

| Component | Variants / props | Behaviour & accessibility |
|-----------|------------------|---------------------------|
| `Button` | `primary`, `secondary`, `ghost`, `destructive`, `link`; sizes `sm` 36px, `md` 44px, `lg` 52px; `loading`, `iconLeft/Right`, `fullWidth` | Press scale 0.98; loading keeps width and shows spinner; `aria-busy` |
| `IconButton` | same variants | Requires `aria-label` |
| `Input`, `Textarea` | `size`, `error`, `hint`, prefix/suffix | Label always visible above; error text below with `aria-describedby` |
| `PhoneInput` | default country from config | Formats as you type (libphonenumber-js `AsYouType`), outputs E.164 |
| `MoneyInput` | `currency` | Shows symbol from `Intl`; stores minor units as string → BigInt on server |
| `DateField`, `TimeField`, `DateRangeField` | | Native pickers on mobile (`type="date"`), popover calendar on desktop |
| `Select`, `Combobox` | searchable, async | Radix; keyboard support |
| `Checkbox`, `Radio`, `Switch`, `SegmentedControl` | | 44 px hit area |
| `Chip`, `ChipGroup` | selectable, removable | Used for channels, filters |
| `Badge`, `StatusPill` | `neutral`, `brand`, `success`, `warning`, `danger` | Status text always, never colour alone |
| `Avatar`, `AvatarGroup` | image, initials | `alt` = name |
| `Card` | `interactive` | Whole card clickable via stretched link |
| `StatCard` | label, value (Money/Number), delta, help | Numbers in `font-display` 700 |
| `ProgressBar`, `ProgressRing` | | `role="progressbar"` with values |
| `Tabs` | scrollable on mobile | URL-synced via search params |
| `DataTable` | sortable, selectable, sticky header | Below `md`, renders each row as a card (`renderCard` prop) |
| `List`, `ListItem` | leading/trailing slots, swipe actions on mobile | Swipe has visible button alternative |
| `EmptyState` | icon, title, one line, one action | |
| `Skeleton` | text, block, avatar, grid | Shimmer disabled with reduced motion |
| `Toast` | success, error, info; action button | `aria-live="polite"` |
| `Dialog` / `Sheet` → `ResponsiveDialog` | | Bottom sheet below `md` (drag to close), centred dialog above |
| `DropdownMenu`, `Popover`, `Tooltip` | | Tooltips never hold essential info |
| `CommandPalette` | Cmd/Ctrl+K | Desktop only; search events, guests, vendors, actions |
| `Stepper` | horizontal (desktop), compact "Step 2 of 5" (mobile) | Used by wizards |
| `Timeline` | vertical with now-line | Run-of-show, booking history |
| `FileDrop` | | Drag-and-drop on desktop, picker on mobile |
| `MediaGrid` | masonry/justified, virtualised | TanStack Virtual; tiles 1:1 on mobile, justified rows on desktop |
| `Lightbox` | swipe, pinch-zoom, keyboard arrows | Loads 1080 derivative; prefetches next/prev |
| `UploadQueue` | per-file progress, pause/resume, retry | Persists across navigation (context at app root) |
| `QRCode` | size, logo | SVG output |
| `QRScanner` | | Lazy-loaded; uses `BarcodeDetector` if available, else zxing |
| `ShareSheet` | | Web Share API, fallback copy link + WhatsApp + email |
| `MoneyText`, `DateText`, `RelativeTime` | | `Intl` with event locale/currency/timezone |
| `ConfirmDialog` | destructive variant | Type-to-confirm for irreversible actions (delete event) |
| `Banner` | info, warning, danger | Inline above content (e.g. "Send an update to guests?") |
| `ChatList` | rows: avatar, name, context line ("About: Ada's 40th"), last message preview, time, unread badge, muted icon | Virtualised; swipe to archive/mute on mobile |
| `ChatThread` | | Virtualised message list anchored to the bottom; loads older messages on scroll up; date separators; "New messages" divider; jumps to quoted message |
| `MessageBubble` | mine/theirs; text, image, file, voice, card, system; edited, deleted | Long-press (mobile) / hover menu (desktop): reply, copy, edit, delete, mark as decision, report |
| `Composer` | text area (auto-grow to 6 lines), attach `[+]` (photo, file, quote, booking, site visit, payment request), mic button | Enter sends on desktop, Shift+Enter new line; mobile send button; draft kept per thread |
| `VoiceRecorder` / `VoicePlayer` | | Hold to record, slide to cancel, lock for hands-free; player with waveform, speed 1×/1.5×/2× |
| `ReadReceipt`, `TypingIndicator` | | Ticks: clock (sending), one (sent), two (delivered), brand colour (seen) |
| `ChatCard` | quote, booking, site visit, profile, payment | Rendered from live data; primary action inside the card |
| `ContactWarningSheet` | | Shown when the sender types contact details before booking |

---

## 5. App frames and layouts

### 5.1 Breakpoints

| Name | Width | Frame |
|------|-------|-------|
| base | 360–639 | Mobile frame |
| `sm` | 640–767 | Mobile frame, wider grids |
| `md` | 768–1023 | Mobile frame with 2-column content where useful |
| `lg` | 1024–1279 | Desktop frame (sidebar) |
| `xl` | ≥ 1280 | Desktop frame + optional right detail panel (360 px) |

### 5.2 Mobile frame (`<AppShell>` below `lg`)

```
┌──────────────────────────┐
│ Top bar 56px: back · title · actions/avatar │
├──────────────────────────┤
│ (Event section tabs, scrollable, when inside an event) │
│                          │
│ Content (single column, 16px side padding)  │
│                          │
├──────────────────────────┤
│ Sticky primary action (when the screen has one)       │
├──────────────────────────┤
│ Bottom tab bar 64px + safe-area inset        │
└──────────────────────────┘
```

### 5.3 Desktop frame (`lg` and up)

```
┌────────────┬───────────────────────────────────────────┐
│            │ Top bar: breadcrumb · search (Cmd+K) · notifications · avatar │
│  Sidebar   ├───────────────────────────────┬───────────┤
│  240px     │ Content (max 1200px, 24-32px padding)       │ Detail    │
│ (72px when │ Page title + primary action top-right       │ panel     │
│ collapsed) │                               │ (xl only) │
└────────────┴───────────────────────────────┴───────────┘
```

### 5.4 Navigation by role

| Role | Mobile tabs (max 5) | Desktop sidebar |
|------|--------------------|-----------------|
| Host | Home · Events · Inbox · Money · More | Home, Events, Inbox, Money, Settings |
| Planner | Home · Events · Clients · Inbox · More | Home, Events, Clients, Pipeline, Calendar, Vendor book, Invoices, Inbox, Business, Billing, Settings |
| Vendor | Home · Inbox · Bookings · Calendar · More (enquiries are a filter in Inbox) | Home, Inbox, Quotes, Bookings, Calendar, Business profile, Payouts, Billing, Settings |
| Multi-role user | Role switcher at top of "More" / sidebar header | |

Event workspace sections (tabs on mobile, second-level nav on desktop): Overview · Plan · Vendors · Money · Guests · Invites* · Tickets* · Moments* · Event day · Settings. (*only when the feature is on.)

### 5.5 Guest frame

No app chrome. Max width 560 px centred; cover image header (16:9 on mobile, max 280 px tall); content; sticky bottom button with safe-area padding. Tiwa logo small in the footer only.

### 5.6 Safe areas and installed mode

Use `env(safe-area-inset-*)` on top bar, tab bar and sticky buttons. `display: standalone` in the manifest; `theme-color` meta follows the theme.

---

## 6. Page specifications

For every page: **Data** (query used), **Mobile** layout, **Desktop** differences, **Primary action**, **States**. Routes per `arc.md §3`. Render mode per the table in `user_flow.md`/`PRD.md` (Static, ISR, Dynamic, Live).

### 6.1 Public

**`/` Home (Static)** — Hero: headline "Plan any event, together", subline, two buttons (Start planning · Find vendors); event-type chips row (Birthday, Wedding, Burial, Conference, Church, Corporate…); "How it works" 4 steps; Moments showcase (static images); featured vendor categories; footer. Desktop: hero split text/image. LCP element: hero image (priority, AVIF, ≤ 120 KB).

**`/vendors` Search (Dynamic, cached 60 s per query)** — Mobile: search bar + filter button opens sheet (category, city, date, price range slider, rating, verified); results as cards (cover, name, category, city, starting price, rating or "New", Verified badge); infinite scroll (cursor). Desktop: filters in left column, 3-column grid, sort dropdown. States: no results → suggestions to widen filters.

**`/vendors/[slug]` Profile (ISR, revalidate on profile change)** — Cover/portfolio carousel; name, badges, rating breakdown; packages (cards with includes and price); availability mini-calendar; reviews list; sticky `[Request a quote]` (mobile bottom; desktop right sticky card). OG image generated with `next/og`.

**`/venues` Venue search (Dynamic, cached 60 s per query)** — Same frame as `/vendors`, with venue filters at the top: date, slot (Morning / Afternoon / Evening / Full day as a segmented control), guests + layout (seated / theatre / standing), area, price, indoor/outdoor, amenities chips (parking, power backup, AC…). Each result card shows the matching **space** (photo, name, venue name, capacity for the chosen layout, slot price, "Available" pill for the chosen date and slot). Desktop: optional map toggle (lazy-loaded map library, list stays the default).

**Venue profile (`/vendors/[slug]` when the business is a venue)** — Adds a **Spaces** section: one card per space (photo carousel, capacities by layout, size, amenities icons, house rules, slot prices, security deposit). Availability: per-space month view with slot pills per day (green free, grey taken, striped held). Sticky actions: `[Book now]` (instant book on) or `[Request a quote]`, plus `[Request a visit]`. Booking sheet: space → date → slot → layout → extra hours → summary (price, security deposit, schedule, hold length, house-rules checkbox) → payment mode → `[Book and hold]`.

**`/planners`, `/planners/[slug]`** — Same patterns as vendors.

**`/login`, `/signup`, `/onboarding/*`** — Single column, 400 px max; large inputs; OTP boxes (6 inputs, auto-advance, paste).

### 6.2 Guest pages (budgets: `§9`, strict)

**`/i/[token]` Invitation** — Cover image (blur-up), event name (display font 30px), host line, date/time card, venue card with map link (no embedded map — link only, to save weight), dress code chip, two buttons stacked full width: **I'm coming** (primary) · **Can't come** (secondary). After answering: inline confirmation + pass button. No client JS except the RSVP island (< 15 KB).

**`/i/[token]/pass`** — Big QR (SVG, server-rendered), guest name, plus-ones, `[Add to calendar]`, `[Directions]`, `[Share]` (if allowed), Moments link card. "Save to home screen" hint on iOS.

**`/e/[slug]` Public event (ISR)** — Cover, title, date, venue, about, agenda list, ticket selector (client island), organiser card, share button.

**`/e/[slug]/register`** — Order summary, buyer fields, questions, promo code, total, pay button; reservation countdown (10:00).

**`/t/[ticketId]`** — Ticket card with QR, event info, holder name, add to Apple/Google wallet (post-MVP; show calendar instead).

**`/m/[code]` Moments gallery (Live)** — Header (event name, date), tabs Official / Guests (+ counts), `MediaGrid` (3 columns on mobile, justified rows desktop), sticky `[Add photos]`. Tap → `Lightbox`. Filter "My uploads". Footer "Planned with Tiwa" + planner/vendor chips. New items fade in at top with "12 new photos" pill (no layout jump).

**`/m/[code]/upload`** — Could be a sheet over the gallery: first-time name field, `[Choose photos]` (input `accept="image/*,video/*" multiple`), then `UploadQueue`. The upload client is lazy-loaded when the user taps Add.

**`/m/[code]/slideshow`** — Full screen, black background, crossfade, small QR + "Add your photos" in the corner, hidden cursor; wake lock (`navigator.wakeLock`) to keep screen on.

### 6.3 Signed-in app

**`/home`** — Role dashboard (`user_flow.md` UF-21 for planners). Host: next event hero card with countdown and progress, "Needs you" list, quick actions. Vendor: new enquiries, upcoming bookings, payments status. Skeleton: 3 cards + list.

**`/events`** — Segmented control Upcoming / Past / Drafts; event cards (cover, name, date, type chip, progress ring). Primary: `[New event]`.

**`/events/new` Wizard** — `Stepper`; one step per screen on mobile, two-column (form + live preview card of the event) on desktop. Type step: grid of type cards with icon and label grouped by format with headings; search box filters instantly (client). Each step autosaves on `Next`.

**`/events/[id]` Overview** — Header (cover strip, name, date, countdown, role badge); cards: Progress (ring + counts), Next deadlines (5), Money summary (if permitted: Committed / Paid / Outstanding), Vendors (booked/needed), Guests (RSVP yes/no/pending) if invites on, Moments (latest 6 thumbs) if on, Team avatars. Desktop: 12-column grid, cards 4/8 columns.

**`/events/[id]/plan`** — Grouped task list by timeframe; filters as chips; `[Add task]` inline; task detail in `ResponsiveDialog`/right panel. Drag to reorder on desktop only.

**`/events/[id]/vendors`** — Category rows (Catering — 3 quotes · Photography — booked ✓ · DJ — needed); tap → category detail: quotes list, compare button, bookings. `[Find vendors]` per category.

**`/events/[id]/quotes/[quoteId]`** — Quote document view (items table → cards on mobile), totals, terms, schedule; actions Accept / Request changes / Decline. Compare view: columns per quote on desktop; on mobile, a swipeable card per quote with a pinned "differences" summary.

**`/events/[id]/bookings/[bookingId]`** — Header (vendor, status pill, total); tabs: Details (current version scope, version history), Payments (milestones timeline with Pay buttons and states: due, paid, held, released, paid out), Messages, Files. Banner for pending change requests.

**`/events/[id]/money`** — 5 `StatCard`s (2×2 + 1 on mobile, 5 in a row on desktop), stacked bar Planned vs Committed vs Paid; tabs Budget / Payments / Contributions / Expenses / Income; export button.

**`/events/[id]/guests`** — Counters row (Invited, Yes, No, No reply, Checked in); search; filter chips; `DataTable` (cards on mobile: name, group, RSVP pill, channel icons); bulk bar when selecting; `[Add guests]` primary; Tabs: Guests / Groups / Tables / Headcount.

**`/events/[id]/invites`** — If off: explainer card with switch "Turn on invitations" + quick share link/QR section. If on: batches list + live tracking table; composer as a full-screen sheet (mobile) / dialog (desktop) with 3 steps (Who · How · Message) and a final one-click Send. WhatsApp free-mode queue screen: big "Send to Ada (12 of 148)" card with `[Open WhatsApp]` and `[Skip]`.

**`/events/[id]/tickets`** — Sales summary (sold, revenue, capacity bar), ticket types list with inline edit, promo codes, registration questions, `[View public page]`.

**`/events/[id]/moments`** — Settings card, QR downloads, moderation queue (grid with approve/hide on hover/desktop, swipe on mobile), stats (items, uploaders), `[Open slideshow]`, `[Download all]`.

**`/events/[id]/day`** — Today's timeline with now-line and auto-scroll to now; item cards with owner and status; `[Mark late]` with minute picker; dependants highlighted in warning colour; tabs Timeline / My tasks / Incidents / Contacts; offline indicator in top bar.

**`/events/[id]/check-in`** — Big counter, `[Start scanning]`; scanner full-screen with result overlay colour (success/warning/danger) + haptic (`navigator.vibrate`) and sound; manual search; offline download button and sync status.

**`/events/[id]/settings`** — Sections: Details, Members & permissions, Features (invites, tickets, Moments), Visibility & sharing, Danger zone (cancel / close).

**`/inbox` Chat (Live)** — Mobile: `ChatList` with filter chips (All · Unread · Enquiries · Bookings · Team) and search → tapping a row opens `/inbox/[threadId]` full-screen with a header (avatar, name, context line "About: Ada's 40th", `[View booking]`/`[View quote]` shortcut, menu: mute, archive, block, report). Desktop (`lg`+): two panes — list (360 px) and thread; on `xl` a third pane shows context (event, quote/booking summary, shared files). Composer pinned to the bottom above the keyboard (use `visualViewport` to keep it visible on iOS). New messages, receipts and typing arrive over the single `/api/sse/inbox` stream. Sending is optimistic and survives going offline. Messages with masked contact details show "•••• (shared after booking)" with a tooltip.

**Chat entry points** — `[Message]` buttons on: vendor/venue/planner profiles (sticky next to "Request a quote"), quote requests, quotes, bookings, site visits, planner client pages, the vendor book, and (after the event) the Moments footer chips and the guest pass page. All open the existing thread if there is one.

**`/clients`, `/clients/[id]`** — Planner CRM: list with stage pills; Kanban pipeline on desktop (`/clients?view=pipeline`), list grouped by stage on mobile.

**`/enquiries`** — Vendor inbox of quote requests, statuses, `[Create quote]`. Quote builder: line items editor (add row, qty stepper, price `MoneyInput`), totals sticky at bottom on mobile.

**`/bookings`, `/calendar`** — Vendor bookings list with payment status pills; month calendar (desktop) / agenda list (mobile); tap a date to block/unblock availability.

**`/business/spaces`** (venues only) — List of spaces with `[Add space]`; space form: name, photos, indoor/outdoor, capacities by layout, size, amenities chips, rules, slot prices (`MoneyInput` per slot), setup/teardown minutes, security deposit; switch "Instant booking" and "Hold length" (hours). `/calendar` for venues shows a row per space with slot pills; tap a free slot → `[Block]` with reason.

**`/business/*`** — Profile completeness checklist card at top; forms per section; portfolio uploader (reuses `UploadQueue`); bank account form with name lookup result shown before saving.

**`/billing`, `/settings`** — Standard forms; theme switch; notification preferences matrix (types × channels) with quiet hours.

### 6.4 Admin

Desktop-first (still usable on tablet). Queue tables with filters; detail pages with evidence viewers; every decision button opens a dialog requiring a reason. `/admin/queues` embeds the BullMQ board (admin only).

---

## 7. Patterns and implementation details

### 7.1 Data fetching

- Server Components call core queries directly (`await getEventOverview(ctx, id)`), wrapped in `cache()` per request.
- Tag cached fetches: `unstable_cache(fn, key, { tags: ['event:'+id] })` (or the current Next.js caching API) and revalidate tags in actions.
- Live screens: initial data from the server, then a client hook `useLive(channel, initial)` that subscribes to SSE and merges updates into TanStack Query cache.

```ts
// apps/web/lib/use-live.ts (client)
export function useLive<T>(url: string, key: QueryKey, apply: (prev: T, evt: LiveEvent) => T) { /* EventSource with backoff; fallback to refetch every 10s after 3 failures */ }
```

### 7.2 Forms

- React Hook Form + `zodResolver(schema)` with the same schema the action uses (import from `packages/core/<module>/schemas.ts`).
- Submit via `useTransition` + server action; show field errors from `fieldErrors`; keep values on error.
- Long forms (wizard, quote builder, business profile) autosave drafts (debounced 800 ms) and show "Saved" status.

### 7.3 Optimistic updates

Use React `useOptimistic` for: task complete, RSVP buttons, approve/hide media, mark decision, check-in result. Roll back and toast on failure.

### 7.4 Uploads

- `UploadQueueProvider` at the app root (and on guest gallery pages) holds a queue that survives client navigation.
- Image pre-processing in a Web Worker: `createImageBitmap(file, { imageOrientation: 'from-image' })` → `OffscreenCanvas` → `convertToBlob({ type: 'image/webp', quality: 0.82 })` with longest side 2560 px. Fallback: upload original if unsupported (HEIC on some browsers → upload original; worker converts).
- Uppy with `@uppy/aws-s3` multipart against `/api/uploads/*`, `limit: 3`, retry delays `[1s, 3s, 5s, 10s, 20s]`.
- Persist pending uploads' metadata in IndexedDB so a reload can offer "Resume 5 uploads".

### 7.5 Images

- `next/image` with a custom loader pointing to `MEDIA_CDN_URL` derivatives (`_320`, `_1080`) — no on-the-fly optimisation cost.
- Always pass `width`, `height`, `sizes`, and `placeholder="blur"` with `blurDataUrl` from the DB.
- Only the LCP image gets `priority`.

### 7.6 PWA and offline (Serwist)

- `app/manifest.ts`: name "Tiwa", short_name "Tiwa", `display: standalone`, theme/background colours, icons 192/512/maskable.
- Service worker strategies: static assets cache-first; guest pages and gallery thumbnails stale-while-revalidate; API network-first.
- Offline pages: `/events/[id]/day` and `/events/[id]/check-in` pre-cache their data when the user taps "Make available offline" (and automatically on event day for members). Mutations queue in IndexedDB (Background Sync where supported; else retry on `online` event).
- Show an offline pill in the top bar when `navigator.onLine` is false.

### 7.7 Internationalisation and formatting

- `next-intl` with `messages/en.json` (keys by area: `events.new.title`). Plurals with ICU syntax.
- Format money with `new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 })` for NGN (no kobo shown unless non-zero).
- Dates with `Intl.DateTimeFormat` in the event's timezone; relative times with `Intl.RelativeTimeFormat`.

### 7.8 Motion

- Page transitions: none (speed first). Element transitions: opacity/transform only, 150–220 ms.
- Sheets slide up 280 ms; toasts slide in 200 ms; new gallery items fade 200 ms.
- Celebrate moments sparingly: RSVP "yes" and "event created" show a light confetti burst (canvas, lazy-loaded, ≤ 4 KB, disabled with reduced motion).

### 7.9 Feature flags in UI

`useFlag('payments.held')` (client) and `getFlag()` (server) read flags resolved on the server and passed via a context; hidden features render nothing (no disabled ghosts).

---

## 8. Accessibility (WCAG 2.2 AA)

- Semantic HTML first; one `<h1>` per page; landmarks (`header`, `nav`, `main`).
- Visible focus ring (`--focus`, 2 px, offset 2 px) on every interactive element.
- Colour is never the only signal (status pills include text; check-in result includes icon + text + sound).
- Forms: labels, `aria-invalid`, errors linked with `aria-describedby`; error summary at top on submit failure.
- Dialogs trap focus and restore it; Escape closes.
- Media: alt text required for portfolio images; Moments uses AI caption or "Photo by Ada" fallback.
- Minimum text 16 px for inputs on mobile (prevents iOS zoom).
- Test with axe in Playwright and manually with VoiceOver (iOS) and TalkBack (Android) once per phase.

---

## 9. Performance budgets (hard limits)

| Metric (mobile, Slow 4G, mid-range Android profile) | App pages | Guest pages | Marketing/profile pages |
|------------------------------------------------------|-----------|-------------|-------------------------|
| LCP | ≤ 2.0 s | ≤ 1.5 s | ≤ 1.8 s |
| INP (real users, p75) | ≤ 200 ms | ≤ 200 ms | ≤ 200 ms |
| CLS | ≤ 0.05 | ≤ 0.05 | ≤ 0.05 |
| TTFB from Lagos | ≤ 400 ms | ≤ 200 ms (edge cache) | ≤ 200 ms (ISR) |
| First-load JS (gzip) per route | ≤ 170 KB | ≤ 90 KB | ≤ 120 KB |
| Total transfer first view | ≤ 1.5 MB | ≤ 1 MB | ≤ 1.2 MB |
| Lighthouse Performance | ≥ 90 | ≥ 95 | ≥ 95 |

### How

- Server Components by default; client islands small and deep in the tree.
- `loading.tsx` + `<Suspense>` streaming; never block the shell on slow queries.
- ISR/static for marketing, profiles, public event pages; edge caching headers for guest page shells.
- `next/dynamic` for heavy pieces: QR scanner, charts, confetti, Uppy, lightbox zoom, rich text, CSV mapper.
- No third-party scripts on guest pages; analytics loaded after `requestIdleCallback` elsewhere.
- Virtualise long lists; cursor pagination (50).
- Images sized correctly, AVIF/WebP, lazy below the fold, blur placeholders.
- Prefetch likely routes with `<Link prefetch>`; warm event data on hover/touchstart of event cards.
- Avoid large date libraries on the client (use `Intl`); avoid lodash; check bundles with `@next/bundle-analyzer` each phase.

### Enforcement files

`lighthouserc.json` (key pages, run against the production build with seeded data):

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm --filter web start",
      "url": [
        "http://localhost:3000/",
        "http://localhost:3000/vendors",
        "http://localhost:3000/vendors/seed-caterer-1",
        "http://localhost:3000/e/seed-conference",
        "http://localhost:3000/i/seed-invite-token",
        "http://localhost:3000/m/seedgallery",
        "http://localhost:3000/home",
        "http://localhost:3000/events/seed-birthday",
        "http://localhost:3000/events/seed-birthday/guests",
        "http://localhost:3000/events/seed-birthday/money"
      ],
      "settings": { "preset": "perf", "formFactor": "mobile", "throttlingMethod": "simulate" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }]
      }
    }
  }
}
```

Signed-in pages use a Lighthouse CI puppeteer script that logs in as a seeded user. Guest pages get a stricter assertion block (`minScore 0.95`, LCP 1500).

`.size-limit.json` lists each key route's first-load JS from `.next` build stats with the limits above.

---

## 10. Frontend testing

- **Playwright projects:** `mobile` (390×844, iPhone-like UA, touch) and `desktop` (1280×800). Every `user_flow.md` check runs in both.
- **Extra viewport smoke test:** each key page renders without horizontal scroll at 360, 768 and 1440 px (`document.documentElement.scrollWidth <= innerWidth`).
- **Network throttling** tests for UF-10 (uploads) using Chrome DevTools Protocol `Network.emulateNetworkConditions` and offline toggles.
- **Accessibility:** `@axe-core/playwright` on every visited page; fail on serious/critical.
- **Visual regression (optional but recommended):** Playwright screenshots of `/dev/ui` and 10 key pages, light and dark, with a 0.2% pixel threshold.
- **Component tests:** Vitest + Testing Library for complex client components (UploadQueue, MoneyInput, QuoteBuilder totals, Stepper).
