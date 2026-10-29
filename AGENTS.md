# AGENTS.md — Start here

This file is the entry point for any AI coding agent (or human developer) building **Tiwa**. It works with any agent: Claude Code, Codex, Cursor, Copilot, Gemini, Aider, Devin or others. Nothing here depends on one vendor's tools.

## 1. What you are building

Tiwa is a web app (mobile-first, installable, works on phones and desktops) where hosts, planners, vendors and guests plan, book, pay for, run and remember **any kind of event**: birthdays, weddings, burials, church programmes, school reunions, corporate parties, conferences, concerts and more. The MVP launches in Lagos, Nigeria, but nothing may be hard-coded to Nigeria or to weddings.

## 2. The documents, and the order to read them

| # | File | What it contains | Read when |
|---|------|------------------|-----------|
| 1 | `AGENTS.md` | Working rules, the build loop, definitions | First, every session |
| 1b | `decision.md` | Every core decision (LOCKED), open questions for humans, and the decision log | Second, every session; append to its log |
| 2 | `PRD.md` | What to build: features with requirement IDs (`EVT-01`, `PAY-07`…), roles, permissions, scope | Before any feature work |
| 3 | `arc.md` | Architecture: stack, repo layout, services, environments, env vars, integrations | Before Phase 0 and when adding infrastructure |
| 4 | `user_flow.md` | Every user journey step by step, with screens, edge cases and acceptance checks (`UF-01`…) | Before building any screen or action |
| 5 | `Backend.md` | Database schema, state machines, permission rules, server actions, APIs, jobs, payments, ledger | Before any backend work |
| 6 | `Frontend.md` | Design system, tokens, components, layouts, every page spec, performance rules | Before any UI work |
| 7 | `BUILD_PLAN.md` | Phases, tasks, milestone gates, progress tracking | Every session: it tells you what to do next |

**When documents disagree:** a LOCKED entry in `decision.md` wins over everything. Then `PRD.md` wins on product behaviour; `Backend.md` and `Frontend.md` win on implementation detail; `arc.md` wins on technology choices. Record any conflict you find in `decision.md` and continue with that rule.

## 3. The build loop (follow it every session)

```
0. Read decision.md (LOCKED decisions and the latest log entries).
1. Open BUILD_PLAN.md. Read the "Status" table at the top.
2. Find the current phase (the first phase not marked DONE).
3. Find the first unchecked task "- [ ]" in that phase.
4. Read every document section the task references (e.g. "Backend.md §4.2", "UF-07", "EVT-03").
5. Implement the task. Write tests with it, not after it.
6. Run the FAST checks for the packages you touched:
     pnpm lint && pnpm typecheck && pnpm test --filter <package>
   plus only the Playwright spec for that flow if the task touches one
   (pnpm e2e <spec-file>). Do NOT run the full build, the full e2e suite,
   Lighthouse or size checks per task: those belong to the batch check and the gate.
7. If checks pass: tick the task "- [x]" in BUILD_PLAN.md, add one line to docs/PROGRESS.md,
   and commit:  git commit -m "P<phase>-T<task>: <short description>"
8. If checks fail: fix them. Never tick a task with failing checks. Never skip or delete a test to pass.
9. When every task in the phase is ticked, run that phase's GATE (listed at the end of the phase).
   - Gate passes  -> mark the phase DONE in the Status table, add the gate result to docs/PROGRESS.md.
   - Gate fails   -> add the failures as new tasks in the same phase and continue the loop.
10. Never start a task in phase N+1 while phase N is not DONE.
```

### Batching (do this to save time)

- Work through **3–5 tasks per session**, in plan order. Read `decision.md` and the
  shared doc sections once at the start of the batch; for each later task read only
  the sections it adds.
- Still make **one commit per task** with the exact task ID from `BUILD_PLAN.md`
  (never renumber, merge or reorder tasks; if you build something early, note it
  under the task it belongs to).
- At the **end of each batch**, run the full suite once:
  `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
  Fix anything it finds before starting the next batch.

### What runs when

| When | Checks |
|------|--------|
| Every task | lint, typecheck, unit/integration tests for touched packages, the flow's own e2e spec |
| End of each batch (3–5 tasks) | full lint, typecheck, test, build, all e2e |
| Phase gate | `pnpm gate <n>` (full build, all e2e, Lighthouse, size), plus manual checks: 360/390/768/1280/1440 px, light and dark, axe, keyboard-only |

### Progress log format (`docs/PROGRESS.md`)

```
## 2026-11-04
- P3-T05 done: create-event wizard step 2 (venues) — UF-03 steps 4–6 passing
- P3 GATE: passed (12/12 checks). Lighthouse /events/new mobile 94.
```

### Commit convention

- One task per commit where possible: `P4-T07: send invites over WhatsApp Cloud API`.
- Branch per phase: `phase/04-guests-invites`. Merge to `main` after the gate passes.
- Never commit secrets, `.env` files, or generated build output.

## 4. Non-negotiable rules

1. **Fast.** Every page meets the performance budgets in `Frontend.md §9`, checked at each phase gate. JS-size budgets are warnings until P17, then hard limits.
2. **Responsive.** Every page works from 360 px to 1440 px wide. Build the phone layout first.
3. **Polished.** Only use components from `packages/ui`. Every page has loading (skeleton), empty and error states.
4. **Server decides.** Permissions, booking states, payment states, ticket capacity and review eligibility are enforced on the server.
5. **Money is integers.** `BigInt` minor units (kobo) plus an ISO currency code. Never floats.
6. **Any event, any country.** Event types, labels, currencies, taxes and payment providers come from `packages/config`. Never write "wedding", "bride", "₦" or "Nigeria" in component code.
7. **Tested.** Business logic in `packages/core` has unit tests; every server action has an integration test; every user flow has a Playwright test.
8. **Secure and private by default.** Follow `Backend.md §12`. Guests can do everything they need without an account.
9. **Feature flags** guard risky features (held payments, payouts, bulk WhatsApp, AI). Flags default to OFF in production.

## 5. When you are unsure

- **Small or cosmetic choice:** pick the simplest option that fits the docs and continue. If someone would later ask "why?", add an AGENT entry to the log in `decision.md` (template in its §7).
- **A task seems to need breaking a LOCKED decision:** don't. Add a PROPOSED entry to `decision.md`, a question to `docs/QUESTIONS.md`, mark the task `- [?]`, move on.
- **Money, legal, security, data deletion, or anything hard to undo:** write the question in `docs/QUESTIONS.md`, mark the task `- [?]` in `BUILD_PLAN.md`, and move to the next task that does not depend on it.
- **Missing external credential** (API key, partner account): build against the adapter's `Fake` implementation (see `Backend.md §9`), add the variable to `.env.example`, list it in `docs/QUESTIONS.md`, and continue.

## 6. Commands (created in Phase 0)

| Command | Does |
|---------|------|
| `pnpm install` | Install everything |
| `pnpm dev` | Run web app (port 3000) and worker together |
| `pnpm db:up` | Start local Postgres + Redis + MinIO with Docker Compose |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:seed` | Load demo data (all event formats, 40 vendors, sample gallery) |
| `pnpm lint` | ESLint + Prettier check |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Vitest unit + integration tests |
| `pnpm e2e` | Playwright end-to-end tests at 390 px and 1280 px |
| `pnpm perf` | Lighthouse CI against the 10 key pages |
| `pnpm size` | `size-limit` JavaScript budgets |
| `pnpm gate <phase>` | Runs every automated check of a phase gate (e.g. `pnpm gate 4`) |

## 7. Definition of done

Every task:

- [ ] Matches the PRD requirement IDs and the `user_flow.md` acceptance checks it references.
- [ ] Built phone-first (390 px) using responsive classes; has skeleton, empty and error states.
- [ ] Permissions enforced on the server and covered by a test.
- [ ] Fast checks pass (lint, typecheck, tests for touched packages, the flow's e2e spec).
- [ ] Strings in `messages/en.json`; nothing event-type- or country-specific hard-coded.
- [ ] Errors go to Sentry with context and without personal data.

Every phase gate (in addition):

- [ ] Works and looks right at 360, 390, 768, 1280 and 1440 px, in light and dark themes.
- [ ] No serious accessibility issues (axe), works with keyboard only.
- [ ] `pnpm gate <n>` passes: full build, all e2e, Lighthouse, size (size = warnings until P17).

## 8. Glossary

| Term | Meaning |
|------|---------|
| Host | The person or organisation that owns an event |
| Co-host | Someone the host adds with limited permissions (family member, committee, colleague) |
| Planner | A professional or agency hired to run an event; belongs to a planner Organization |
| Vendor | A service business (caterer, DJ, venue, photographer…); belongs to a vendor Organization |
| Guest | Anyone invited or registered; never needs an account |
| Event format | One of `PRIVATE_CELEBRATION`, `CORPORATE`, `PUBLIC_TICKETED`, `COMMUNITY` |
| Event type | A template key such as `birthday`, `wedding_traditional`, `burial`, `conference` |
| Quote | A vendor's itemised price offer for an event |
| Booking | An accepted quote; has versions, a payment schedule and a status |
| Milestone | One scheduled part of a booking's payment (e.g. 30% deposit) with a release rule |
| Payment mode | `DIRECT` (split at checkout), `HELD` (held then released), `OFFLINE` (recorded by hand) |
| Payout | A transfer from Tiwa (via provider) to a vendor's or organiser's bank account |
| Ledger | Double-entry record of every money movement |
| Moments | The event gallery: Official album (hired photographer) + Guest album (guest uploads) |
| Run-of-show | The event-day timeline with tasks and dependencies |
| Minor units | The smallest currency unit (kobo for NGN, cents for USD) |

## 9. Out of scope for the MVP (do not build)

- Native iOS/Android apps (the web app is installable instead).
- Face matching ("find my photos"), AI highlight video, print sales.
- Payment providers beyond Paystack and Flutterwave; currencies other than NGN in production (but keep it configurable).
- Drag-and-drop seating editor, multi-track conference session builder (a simple agenda list is in scope), aso-ebi ordering.
- Personalised recommendations, sponsored listings, ML fraud models, e-signature integrations.

If a task seems to need one of these, build the smallest version that keeps the flow working and log it in `decision.md`.
