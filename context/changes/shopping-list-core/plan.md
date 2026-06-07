# Shopping List Core Implementation Plan

## Overview

Implement the auto-derived shopping list page (S-04 — the project's north star slice). The page shows every product whose `quantity < min_threshold AND add_to_list = true`, sorted alphabetically. It also exposes the same product actions available in the inventory: add a new product, edit an existing one, and delete. No new database tables or API routes are required — the schema is ready and all mutations reuse existing endpoints.

## Current State Analysis

The `products` table already has `quantity`, `min_threshold`, and `add_to_list` columns. A partial index `(user_id) WHERE add_to_list = true` exists in `supabase/migrations/20260602000000_products_add_to_list_index.sql`, optimised for exactly this query. There is no `/shopping-list` page, no navigation link to it, and it is not in `PROTECTED_ROUTES`.

The Topbar currently shows: email | Dashboard | Sign out — no links to the two main feature areas (pantry, shopping list).

## Desired End State

A `/shopping-list` page is accessible from the Topbar for any authenticated user. It lists every product currently below its threshold, showing the product name, how much to buy (`min_threshold − quantity`), the unit, and an Edit + Delete action per row. A "+ Add product" button leads to `/inventory/new`. An empty state with a positive message appears when no products are below threshold. Route is protected and errors surface via `?error=` query param.

### Key Discoveries

- `src/pages/inventory/index.astro` is the canonical pattern for SSR data pages — frontmatter query → null-check → client-side array operation → Astro template. Follow it exactly.
- PostgREST `.lt()` compares a column to a **literal value**, not to another column. Column-to-column comparison (`quantity < min_threshold`) must be done client-side after fetching. Dataset is small (personal pantry), so this is the right trade-off.
- Delete flow: native `<dialog>` + vanilla JS + `DELETE /api/products/:id` (HTTP 204 on success). Pattern is already implemented in `inventory/index.astro:135–208`. Copy it exactly.
- Lessons mandate: null-check `createClient()` before any Supabase call; use `formatDateDisplay()` (not bare Date methods) if dates are ever displayed.

## What We're NOT Doing

- Check-off with quantity-purchased update (S-05)
- Manual one-off shopping list items not linked to a pantry product (S-05)
- Real-time / reactive updates — list is a live snapshot on each page load, per roadmap decision
- Inline quantity editing — edit goes to `/inventory/:id/edit`
- "Remove from list" (setting `add_to_list = false`) — delete removes the product entirely, same as inventory

## Implementation Approach

Two-phase delivery. Phase 1 wires the route and navigation so the page is reachable and protected before any page content exists. Phase 2 creates the page itself, following `inventory/index.astro` line-for-line as the structural template.

## Critical Implementation Details

- **Column-to-column filter**: Supabase JS `.eq("add_to_list", true)` uses the partial index on the DB side. The `quantity < min_threshold` predicate must be applied as a JavaScript `.filter()` on the returned array — do NOT pass it to PostgREST.
- **Alphabetical order preserved**: `.order("name", { ascending: true })` is applied in Supabase before the client-side filter, so the result array is already sorted; the filter does not disturb order.

---

## Phase 1: Route protection + navigation

### Overview

Register `/shopping-list` in middleware so unauthenticated users are redirected to sign-in. Add "My Pantry" and "Shopping List" nav links to the Topbar so both feature areas are reachable from any protected page.

### Changes Required

#### 1. Register protected route

**File**: `src/middleware.ts`

**Intent**: Add `/shopping-list` to the `PROTECTED_ROUTES` array so the middleware redirects unauthenticated requests to `/auth/signin`. This must be done before the page exists, because without it a deployed route is open to the public.

**Contract**: The existing array is `["/dashboard", "/inventory", "/auth/update-password", "/api/auth/update-password"]`. Append `"/shopping-list"` to it.

#### 2. Add navigation links to Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Insert "My Pantry" and "Shopping List" links into the authenticated nav row so users can switch between the two main feature areas without going through the dashboard. Dashboard link remains; the two feature links are added between the email span and Dashboard.

**Contract**: The authenticated branch currently renders `email | Dashboard | Sign out`. After this change it renders `email | My Pantry | Shopping List | Dashboard | Sign out`. Both new links use the same `text-purple-300 transition-colors hover:text-purple-100 hover:underline` class as the existing Dashboard link. Href: `/inventory` for My Pantry, `/shopping-list` for Shopping List.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification

- Navigating to `/shopping-list` while signed out redirects to `/auth/signin`
- Topbar shows My Pantry + Shopping List links when signed in
- Both links navigate to the correct pages

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Shopping list page with full actions

### Overview

Create the SSR Astro shopping list page. It queries products with `add_to_list = true`, filters client-side for `quantity < min_threshold`, sorts alphabetically by name, computes the "need to buy" gap, and renders a table with Name / Buy / actions columns. Includes an empty state, `+ Add product` button, Edit link per row, and Delete button per row (with the same native `<dialog>` pattern as the inventory page).

### Changes Required

#### 1. Shopping list page

**File**: `src/pages/shopping-list.astro`

**Intent**: Render the auto-derived shopping list. Data is fetched server-side in the frontmatter, following the `inventory/index.astro` pattern exactly: create client → null-check → Supabase query → client-side filter → template render.

**Contract**:

Interface (only the columns needed for this page — no `expiry_date`):
```ts
interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  min_threshold: number;
}
```

Frontmatter query + filter:
```ts
const { data, error: listError } = await supabase
  .from("products")
  .select("id, name, quantity, unit, min_threshold")
  .eq("add_to_list", true)
  .order("name", { ascending: true });

const items = (data as ShoppingItem[] ?? []).filter(
  (p) => p.quantity < p.min_threshold
);
```

"Need to buy" per row (computed inline in template, no helper needed):
```ts
p.min_threshold - p.quantity  // numeric(10,2) − numeric(10,2) = at most 2 decimal places
```

Table columns: **Name** | **Buy** (`{gap} {unit}`) | actions (Edit link + Delete button). No expiry, no threshold, no current-quantity column — the gap alone is the actionable output.

Empty state (when `items.length === 0`): centred card matching `inventory/index.astro:68–73` style, text "Your pantry is fully stocked.", link "Go to My Pantry →" pointing to `/inventory`.

`+ Add product` button in the page header (right-aligned, matching the style of the equivalent button in `inventory/index.astro:51–57`): links to `/inventory/new`.

Error handling: `Astro.url.searchParams.get("error")` with `decodeURIComponent` fallback, same block as `inventory/index.astro:31–40`.

Delete dialog: copy the native `<dialog>` markup and `<script>` block from `inventory/index.astro:135–208`, then adapt two redirects in the script — success path to `/shopping-list`, failure path to `/shopping-list?error=…`. Do not copy verbatim: both `window.location.href` assignments in the `confirmBtn` click handler must point to `/shopping-list`, not `/inventory`.

Edit link: `href="/inventory/{p.id}/edit"`, same style as `inventory/index.astro:108–114`.

Page title (browser tab): `"Shopping List"`. H1 gradient: `"Shopping List"` using same `bg-gradient-to-r from-blue-200 to-purple-200` class.

### Success Criteria

#### Automated Verification

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification

- Signed-in user sees the shopping list at `/shopping-list`
- Products with `quantity < min_threshold AND add_to_list = true` appear, sorted A–Z
- Products with `quantity >= min_threshold` or `add_to_list = false` do not appear
- "Need to buy" column shows `min_threshold − quantity` with correct unit
- Empty state shows when no products are below threshold
- "+ Add product" button navigates to `/inventory/new`
- Edit link navigates to `/inventory/:id/edit` pre-filled
- Delete button opens confirmation dialog with product name
- Confirming delete removes the product and refreshes the page
- Cancelling delete closes dialog and returns focus to the trigger button
- Updating a product's quantity above its threshold (via Edit) removes it from the list on next page load
- Error banner renders when `?error=` is present in the URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before marking the change complete.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in and navigate to Shopping List via Topbar link
2. Verify items below threshold appear; items above do not
3. Update a product quantity above threshold (Edit) → confirm it disappears from list
4. Update a product quantity below threshold → confirm it appears on list
5. Delete a product from the shopping list → confirm it's gone from inventory too
6. Add a new product with low quantity → confirm it appears on list immediately
7. Set `add_to_list = false` on a product (via Edit) → confirm it no longer appears even if below threshold
8. Trigger an error state by navigating to `/shopping-list?error=Test%20error` → confirm banner renders

## References

- Canonical SSR page pattern: `src/pages/inventory/index.astro`
- Delete dialog + script pattern: `src/pages/inventory/index.astro:135–208`
- Route protection: `src/middleware.ts`
- API routes reused: `src/pages/api/products/[id].ts` (PUT, DELETE)
- Partial index for query: `supabase/migrations/20260602000000_products_add_to_list_index.sql`
- Roadmap context: `context/foundation/roadmap.md` (S-04 north star)
- S-05 research (next slice): `context/changes/shopping-list-complete/research.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Route protection + navigation

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 5058930
- [x] 1.2 Type check passes: `npx astro check` — 5058930

#### Manual

- [x] 1.3 Navigating to `/shopping-list` while signed out redirects to `/auth/signin` — 5058930
- [x] 1.4 Topbar shows My Pantry + Shopping List links when signed in — 5058930
- [x] 1.5 Both links navigate to the correct pages — 5058930

### Phase 2: Shopping list page with full actions

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — e1dbbdf
- [x] 2.2 Type check passes: `npx astro check` — e1dbbdf

#### Manual

- [x] 2.3 Signed-in user sees the shopping list at `/shopping-list` — e1dbbdf
- [x] 2.4 Products with `quantity < min_threshold AND add_to_list = true` appear, sorted A–Z — e1dbbdf
- [x] 2.5 Products with `quantity >= min_threshold` or `add_to_list = false` do not appear — e1dbbdf
- [x] 2.6 "Need to buy" column shows `min_threshold − quantity` with correct unit — e1dbbdf
- [x] 2.7 Empty state shows when no products are below threshold — e1dbbdf
- [x] 2.8 "+ Add product" button navigates to `/inventory/new` — e1dbbdf
- [x] 2.9 Edit link navigates to `/inventory/:id/edit` pre-filled — e1dbbdf
- [x] 2.10 Delete button opens confirmation dialog with product name — e1dbbdf
- [x] 2.11 Confirming delete removes the product and refreshes the page — e1dbbdf
- [x] 2.12 Cancelling delete closes dialog and returns focus to the trigger button — e1dbbdf
- [x] 2.13 Updating a product's quantity above its threshold removes it from the list on next page load — e1dbbdf
- [x] 2.14 Error banner renders when `?error=` is present in the URL — e1dbbdf
