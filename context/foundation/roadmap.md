---
project: "Smart Pantry Tracker"
version: 1
status: draft
created: 2026-05-26
updated: 2026-05-26
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: Smart Pantry Tracker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Smart Pantry Tracker addresses a structural problem: every existing tracking mechanism requires users to maintain two parallel lists — inventory and shopping — and the cost of that dual maintenance reliably causes the habit to collapse within weeks. The product's insight is that one source of truth (inventory state) can automatically derive the shopping list. The closed loop — inventory quantity falls below threshold → shopping list updates automatically, with no manual transfer needed — is the product's core value proposition, not the list itself. The MVP proves this mechanism works end-to-end for a single-household user.

## North star

**S-04: Shopping list core** — user can view the auto-generated shopping list and see it update when inventory quantities drop below their threshold.

> The north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis — that automatically deriving the shopping list from inventory state eliminates the dual-maintenance burden. It is placed as early as Prerequisites allow because everything else only matters if this closed loop works.

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                                     | Prerequisites | PRD refs                                      | Status   |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------- | ------------- | --------------------------------------------- | -------- |
| F-01 | db-schema-and-rls          | (foundation) Product schema migrated; RLS policies enforce per-user isolation            | —             | Access Control, NFR: data isolation           | ready    |
| S-01 | auth-completion            | sign out and request a password reset via email                                          | —             | FR-001, FR-002, FR-003, FR-013                | ready    |
| S-02 | inventory-crud             | add, view, edit, and delete products in their inventory                                  | F-01          | FR-004, FR-005, FR-006, FR-007, US-01         | proposed |
| S-04 | shopping-list-core         | view the auto-generated shopping list; list updates when qty drops below threshold       | F-01, S-02    | FR-010, FR-011, US-01                         | proposed |
| S-03 | inventory-expiry-and-sort  | see expired products highlighted in red and sort inventory by expiry date                | S-02          | FR-008, FR-009                                | proposed |
| S-05 | shopping-list-complete     | check off a shopping list item with qty purchased and manually add one-off items         | S-04          | FR-012, FR-014                                | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme             | Chain                                                                              | Note                                                                                          |
| ------ | ----------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A      | Closed loop core  | `F-01` → `S-02` → `S-04` → `S-05` (with `S-03` parallel with `S-04` after `S-02`) | Critical path to the north star; `speed` goal — reach `S-04` without detours.               |
| B      | Auth completion   | `S-01`                                                                             | Standalone; no prerequisites; run in parallel with `F-01` to close all auth must-haves early. |

## Baseline

What's already in place in the codebase as of 2026-05-26 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React configured (`astro.config.mjs`); components in `src/components/`; page routing in `src/pages/`
- **Backend / API:** present — Astro SSR `output: "server"` + Cloudflare adapter; API routes at `src/pages/api/auth/`; middleware at `src/middleware.ts`
- **Data:** partial — Supabase client at `src/lib/supabase.ts`; no schema files or migrations yet (`supabase/` contains only `config.toml`)
- **Auth:** present — Supabase Auth wired: `signUp`, `signInWithPassword`, `getUser()` in middleware; `/dashboard` protected
- **Deploy / infra:** present — `.github/workflows/ci.yml` + `wrangler.jsonc` (Cloudflare Pages / Workers)
- **Observability:** absent — no logging library, no error tracking, no metrics

## Foundations

### F-01: Database schema + RLS

- **Outcome:** (foundation) Product schema migrated to Supabase; row-level security policies enforce that each user can only access their own pantry records.
- **Change ID:** db-schema-and-rls
- **PRD refs:** Access Control section (per-user pantry scoping), NFR: data isolation (no record belonging to one account returned in another account's session)
- **Unlocks:** S-02 (inventory CRUD requires a `products` table with `name`, `quantity`, `unit`, `expiry_date`, `min_threshold`, `add_to_list` columns); S-04 (shopping list logic requires `min_threshold` and `add_to_list` columns plus correct RLS so the threshold query only returns the current user's rows)
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** All 10 inventory and shopping list FRs (FR-004–FR-009, FR-010–FR-012, FR-014) fail without this foundation; sequenced first as the fastest path to unblocking S-02 and the north star S-04. Schema errors — missing columns, wrong types, incomplete RLS policies — require a migration re-run and possible data loss if caught after data has been written.
- **Status:** ready

## Slices

### S-01: Auth completion

- **Outcome:** User can sign out and request a password reset via email.
- **Change ID:** auth-completion
- **PRD refs:** FR-001 (sign-up — already present in baseline), FR-002 (sign-in — already present in baseline), FR-003 (sign-out), FR-013 (password reset)
- **Prerequisites:** — (sign-up and sign-in already wired in baseline; this slice adds the missing must-have auth flows)
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-013 (password reset) relies on Supabase email delivery; hosted Supabase defaults work out of the box, but the reset-link callback route must be implemented in Astro to complete the flow. Without it, accounts are permanently inaccessible on password loss — a must-have gap, not a nice-to-have.
- **Status:** ready

---

### S-02: Inventory CRUD

- **Outcome:** User can add, view, edit, and delete products in their inventory.
- **Change ID:** inventory-crud
- **PRD refs:** FR-004 (add product), FR-005 (view list), FR-006 (update any field), FR-007 (delete with confirmation), US-01 (add + update quantity steps)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-006 specifies "update any field" as a full edit form — the PRD explicitly deferred an inline quantity stepper to v2. Pressure to improve UX here conflicts with the `speed` goal; keep the edit form as-is per PRD decision.
- **Status:** proposed

---

### S-04: Shopping list core ★ north star

- **Outcome:** User can view the auto-generated shopping list and see it update when inventory quantities drop below their threshold.
- **Change ID:** shopping-list-core
- **PRD refs:** FR-010 (auto-include below-threshold products with `addToList=ON`), FR-011 (view shopping list), US-01 (shopping list update acceptance criteria)
- **Prerequisites:** F-01, S-02
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-010 business logic (`current_quantity < min_threshold AND addToList=ON`) must be evaluated server-side on every page load to guarantee the list is always a live reflection; client-side caching could introduce stale state. Derive the list via a single DB query per request rather than caching between inventory updates.
- **Status:** proposed

---

### S-03: Inventory enrichment (expiry + sort)

- **Outcome:** User can see expired products highlighted in red and sort their inventory by expiry date; the sort order persists across navigation within the session.
- **Change ID:** inventory-expiry-and-sort
- **PRD refs:** FR-008 (expired products in red), FR-009 (sort by expiry, session-persistent)
- **Prerequisites:** S-02
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-009 requires session-persistent sort state; in Astro SSR the simplest mechanism is a URL query parameter (`?sort=expiry`), which survives navigation without additional machinery. Cookie or server-session approaches would work but add complexity inconsistent with the `speed` goal.
- **Status:** proposed

---

### S-05: Shopping list completion (check-off + manual items)

- **Outcome:** User can check off a shopping list item by entering the quantity purchased (inventory updates by that amount) and manually add arbitrary one-off items to the shopping list.
- **Change ID:** shopping-list-complete
- **PRD refs:** FR-012 (check off + qty update), FR-014 (manual list items not linked to a pantry product)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** FR-014 (manual items not linked to a pantry product) requires a data model separate from auto-derived items. Manual items are not cleared by the threshold logic — the rule that they disappear only when checked off (never auto-removed) must be implemented and tested explicitly to avoid confusion with auto-derived items.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                    | Ready for `/10x-plan` | Notes                              |
| ---------- | -------------------------- | -------------------------------------------------------- | --------------------- | ---------------------------------- |
| F-01       | db-schema-and-rls          | Define Supabase product schema + RLS policies            | yes                   | Run `/10x-plan db-schema-and-rls`  |
| S-01       | auth-completion            | Complete auth: sign-out + password reset flow            | yes                   | Run `/10x-plan auth-completion`    |
| S-02       | inventory-crud             | Inventory CRUD: add, view, edit, delete products         | no                    | Needs F-01 first                   |
| S-04       | shopping-list-core         | Shopping list: auto-derived from inventory state         | no                    | Needs F-01 + S-02 first            |
| S-03       | inventory-expiry-and-sort  | Expiry highlighting + session-persistent sort-by-expiry  | no                    | Needs S-02 first                   |
| S-05       | shopping-list-complete     | Shopping list: check-off with qty + manual items         | no                    | Needs S-04 first                   |

## Open Roadmap Questions

None. All PRD questions were resolved inline during the shaping and Socrates rounds (PRD v1 closed with 0 open questions).

## Parked

- **Recipe integration / meal suggestions** — Why parked: PRD §Non-Goals: core MVP is the stock→shopping-list closed loop; meal planning belongs in v2 once the core habit is established.
- **Household sharing / multi-user pantry** — Why parked: PRD §Non-Goals: each account is strictly isolated; no invite flow, shared view, or household concept in scope for MVP.
- **Push / email notifications** — Why parked: PRD §Non-Goals: low-stock and expiry signals surfaced only within the app UI; external notifications out of scope for MVP.
- **Native mobile app** — Why parked: PRD §Non-Goals: responsive web design covers mobile browsers; a dedicated iOS / Android app is not required.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)
