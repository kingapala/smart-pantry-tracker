# Shopping List Core — Plan Brief

> Full plan: `context/changes/shopping-list-core/plan.md`

## What & Why

Implement S-04: the project's north star slice. The auto-derived shopping list is the core product hypothesis — one source of truth (inventory state) automatically produces the shopping list, eliminating the dual-maintenance burden that causes other tracking habits to collapse. This slice makes that closed loop visible to the user for the first time.

## Starting Point

The `products` table already has `quantity`, `min_threshold`, and `add_to_list` columns, and a partial index optimised for the shopping list query exists. There is no `/shopping-list` page, no navigation to it, and it is not in `PROTECTED_ROUTES`.

## Desired End State

An authenticated user can navigate to `/shopping-list` from the Topbar and see every product currently below its minimum threshold, sorted alphabetically. Each row shows the product name, how much to buy (the gap), and the unit. From this page they can add a new product, edit an existing one, or delete it — the same actions available in the inventory. An empty state with a positive message appears when nothing is below threshold.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Row content | Name + "Need to buy" gap + unit | Directly answers "how much do I need" without mental arithmetic | Plan |
| Sort order | Alphabetical by name (A–Z) | Predictable and scannable while physically shopping | Plan |
| Column-to-column filter | Client-side `.filter()` after Supabase fetch | PostgREST `.lt()` compares to a literal — column-to-column requires client filter | Plan |
| Delete behaviour | Full product delete (reuses DELETE /api/products/:id) | No new API, consistent with inventory; S-05 check-off handles softer "remove" | Plan |
| Add product entry point | Button linking to `/inventory/new` | No new form needed; product auto-appears on list when quantity < threshold | Plan |
| Empty state framing | "Your pantry is fully stocked" + link to My Pantry | Positive framing — an empty list is the success state for this product | Plan |
| Navigation | Add My Pantry + Shopping List links to Topbar | Current Topbar only has Dashboard; feature areas need first-class nav | Plan |

## Scope

**In scope:**
- `/shopping-list` SSR Astro page (auto-derived list, A–Z sort, "need to buy" gap)
- Route protection (`/shopping-list` added to `PROTECTED_ROUTES`)
- Topbar navigation links (My Pantry, Shopping List)
- Add product button (→ `/inventory/new`)
- Edit link per row (→ `/inventory/:id/edit`)
- Delete per row with confirmation dialog
- Empty state + error handling

**Out of scope:**
- Check-off with quantity-purchased update (S-05)
- Manual one-off items not linked to a pantry product (S-05)
- "Remove from list" without deleting the product
- Real-time / reactive list updates

## Architecture / Approach

Pure SSR — no React islands. The Astro page frontmatter queries `products WHERE add_to_list = true ORDER BY name`, then filters client-side for `quantity < min_threshold`. The "need to buy" gap (`min_threshold − quantity`) is computed inline in the template. Delete reuses the native `<dialog>` + vanilla JS + `DELETE /api/products/:id` pattern copied from `inventory/index.astro`. No new API routes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Route + navigation | `/shopping-list` is protected; Topbar has My Pantry + Shopping List links | None — pure config |
| 2. Shopping list page | Full page: auto-derived list, gap column, add/edit/delete actions, empty state | Client-side filter must be correct — wrong predicate direction silently shows wrong items |

**Prerequisites:** F-01 (schema + RLS done), S-02 (inventory CRUD done) — both complete.  
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- The column-to-column filter is done client-side; a very large pantry (hundreds of products) would fetch more rows than needed, but this is not a concern for a single-household MVP.
- Delete from the shopping list removes the product from the entire pantry — the user must understand this. The confirmation dialog text (copied from inventory) is the only guard.

## Success Criteria (Summary)

- Products with `quantity < min_threshold AND add_to_list = true` appear on the list, sorted A–Z, with correct "need to buy" values
- Products above threshold or with `add_to_list = false` are absent from the list
- Add, edit, and delete actions work correctly from the shopping list page
