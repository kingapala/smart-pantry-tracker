# Inventory Expiry Highlighting and Sort — Plan Brief

> Full plan: `context/changes/inventory-expiry-and-sort/plan.md`
> Research: `context/changes/inventory-expiry-and-sort/research.md`

## What & Why

Add two user-facing enhancements to the inventory list: expired and expiring-soon rows are highlighted in red/amber so users spot at-risk items at a glance, and the Expiry column header becomes a one-click sort link (ascending, soonest first) with a reset link to return to default order. These are FR-008 and FR-009 from the PRD — the last two enrichment features before S-04 (shopping list) becomes the focus.

## Starting Point

The inventory list page (`src/pages/inventory/index.astro`) is a single server-rendered Astro file that fetches products and renders them in a table sorted by `created_at`. The expiry column shows dates but applies no styling. The Supabase query ignores URL parameters.

## Desired End State

Visiting `/inventory` shows the default creation-date order. Visiting `/inventory?sort=expiry` sorts by expiry date ascending, null-expiry rows at the bottom. Each row with an expiry date on or before today appears with a red background and red date text; rows expiring within the next 3 days (but not yet today) appear in amber. The Expiry column header toggles between a "Expiry ↑" sort link and a "Expiry ↑ ×" reset state depending on whether `?sort=expiry` is in the URL.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Expiry threshold for red | Today and past (`expiry_date <= today`) | User wants maximum urgency signal on the day of expiry | Plan |
| Expiring-soon threshold | 3 days, amber/yellow highlight | Advance warning without extra library; PRD only mandates red for expired | Plan |
| Sort direction | Always ascending (soonest first), no toggle | Single sort direction keeps UI simple and avoids a second URL param value | Plan |
| Sort reset | `×` link next to active header | Discoverable escape hatch without editing the URL | Plan |
| Date comparison method | ISO string prefix comparison (`<= todayStr`) | Comparing `YYYY-MM-DD` strings lexicographically is correct and avoids timezone errors from `new Date()` coercion | Research |
| Sort mechanism | Supabase `.order("expiry_date", { nullsFirst: false })` on every request | Server-side sort ensures consistency; consistent with S-04 guidance against client-side caching | Research |
| New dependencies | None | All needed tools (`cn`, `nowUTC`, Supabase `.order`) are already in `package.json` | Research |

## Scope

**In scope:**
- Read `?sort=expiry` URL param and branch Supabase query
- Sort link + reset link in the Expiry column header
- Red row + red date text for `expiry_date <= today`
- Amber row + amber date text for `expiry_date` within 3 days

**Out of scope:**
- Sort direction toggle (no descending sort)
- User-configurable "expiring soon" window
- Any page other than `src/pages/inventory/index.astro`
- Any new npm dependencies

## Architecture / Approach

All logic is server-side in the Astro frontmatter: read `sortParam` from `Astro.url.searchParams`, branch the Supabase query, compute `todayStr` and `soonStr` as ISO date strings, then use `cn()` with literal class strings in the template for row and cell styling. No React state, no client-side JavaScript, no new components.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Sort by Expiry Date | URL param → DB sort + column header link/reset | Supabase immutable builder requires two full chains, not a shared base variable |
| 2. Expiry Highlighting | Red/amber row + cell classes via `cn()` | Tailwind JIT requires literal class strings — no dynamic concatenation |

**Prerequisites:** S-02 (inventory CRUD) — done.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- `expiry_date` is always stored as `YYYY-MM-DD` (date-only) — if it ever includes a time component, the string comparison still works correctly because ISO dates sort lexicographically
- The `×` reset link uses `/inventory` (strips all params) — if other URL params are ever added to this page, this link would strip them too

## Success Criteria (Summary)

- Expired and expiring-soon rows are visually distinct from normal rows in both default and sorted view
- Clicking the Expiry sort link sorts correctly; clicking `×` restores default order
- No regression in add, edit, or delete product flows
