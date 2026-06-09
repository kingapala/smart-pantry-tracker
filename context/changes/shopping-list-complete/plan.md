# Shopping List Check-Off Implementation Plan

## Overview

Add FR-012 ("check off a shopping list item by entering the quantity purchased; the product's inventory quantity increases by that amount") to the `/shopping-list` page. Pantry-linked items get a "Check off" action that prompts for the quantity purchased and atomically increments the linked product's inventory `quantity`. Manual one-off items (already shipped in S-04 / FR-014) get an equivalent "Check off" action that simply removes them from the list — replacing their now-redundant "Delete" button with consistent, purpose-fitting wording.

## Current State Analysis

S-04 (`shopping-list-core`, archived at `context/archive/2026-06-05-shopping-list-core/`) shipped more than its own roadmap outcome named: it built the entire merged shopping-list view **and** the full FR-014 manual-item flow (add, view, delete). What remains for this change is narrower than the roadmap's S-05 description implies — just the check-off mechanic itself.

- [src/pages/shopping-list/index.astro](src/pages/shopping-list/index.astro) merges pantry products (`quantity < min_threshold AND add_to_list = true`, computed client-side per `context/archive/2026-06-05-shopping-list-core/plan.md:38`) and `shopping_list_items` rows into one alphabetically-sorted table (lines 50-68), rendering Name / Buy / actions. Pantry rows show Edit (→ `/inventory/:id/edit`) + Delete; manual rows show Delete only (lines 134-151).
- A single shared native `<dialog id="delete-dialog">` (lines 164-188) plus vanilla `<script>` (lines 191-241) handles both delete flows today, branching on `data-item-type` to call either `DELETE /api/products/:id` (pantry — deletes the whole product, intentionally matching inventory behavior per `context/archive/2026-06-05-shopping-list-core/plan.md:30`) or `DELETE /api/shopping-list-items/:id` (manual). On success it does `window.location.href = "/shopping-list"`; on failure, `window.location.href = "/shopping-list?error=..."`.
- [src/pages/api/products/[id].ts:8-50](src/pages/api/products/%5Bid%5D.ts#L8-L50) is the canonical fetch-driven API route: auth check → `createClient()` null-check → `formData()` parse → `.update()/.delete()` scoped by `.eq("id", id).eq("user_id", user.id)` → raw `Response` with HTTP status (204 success, 4xx/5xx + error text on failure). No redirects — the calling client script handles navigation.
- `products.quantity` is `numeric(10,2) not null default 0 check (quantity >= 0)` ([supabase/migrations/20260528000000_products_schema.sql](supabase/migrations/20260528000000_products_schema.sql)). No RPC/DB functions exist anywhere in `supabase/migrations/` — every quantity write in the codebase is a plain `.update()` after parsing a float from form data (`parseFloat(form.get("quantity") ?? "0")`, mirrored in `src/pages/api/products/index.ts:16` and `[id].ts:27`).
- `/inventory` ([src/pages/inventory/index.astro](src/pages/inventory/index.astro)) already exposes full product deletion via the same dialog pattern — so removing "Delete" from the shopping-list view does not remove any user capability; it only stops duplicating it.
- The shopping list is a **live, auto-derived reflection** (CLAUDE.md Business Logic: "no manual curation"). Checking off a pantry item must not force-remove it from the list — it stays if the new quantity is still below `min_threshold` (now showing a smaller "Buy" gap), and disappears naturally on the next page load once it's not.

### Key Discoveries:

- The upstream research (`context/changes/shopping-list-complete/docs-radix-checkbox.md`, written before S-04 landed) recommended a Radix `Checkbox` + React island. The actual `/shopping-list` page S-04 shipped — and every interactive page in this app except the two auth forms — uses pure Astro + vanilla `<script>` + native `<dialog>`, with zero React islands and zero Radix dependencies. This plan follows the established, lived-in pattern rather than the pre-S-04 recommendation (confirmed decision, not an open question).
- No atomic increment exists anywhere (`GREATEST`, `.rpc()`, DB triggers — none found). The increment must be done as fetch-current → add → write-back, exactly mirroring how every other quantity write in this codebase already works.

## Desired End State

A user viewing `/shopping-list` can click "Check off" on any row:
- **Pantry row**: a dialog asks "How much did you buy?" (number input, empty, placeholder showing the suggested "Buy" amount and unit). On confirm, the product's `quantity` increases by the entered amount and the page refreshes — the row disappears if the new quantity now meets/exceeds `min_threshold`, or remains with a recomputed (smaller) "Buy" gap if it doesn't.
- **Manual row**: a dialog asks "Mark <name> as bought?" (yes/no). On confirm, the row is removed from `shopping_list_items` and the page refreshes.

Verification: check off a pantry item for the full gap amount → it disappears and `/inventory` shows the increased quantity; check off for a partial amount → it remains with a smaller gap and inventory reflects the partial increase; check off a manual item → it's gone from both the list and able to be re-confirmed absent via a fresh page load.

## What We're NOT Doing

- Not introducing Radix UI, `@radix-ui/react-checkbox`, or any new npm dependency — the native `<dialog>` + vanilla JS pattern already established on this exact page covers the requirement with zero new architecture.
- Not introducing a React island on `/shopping-list` — it stays pure Astro, consistent with every page except the auth forms.
- Not changing "Delete" behavior on `/inventory` — full product deletion remains there, untouched, exactly as S-04 left it.
- Not adding any database migration, RPC function, or trigger — `products.quantity` already supports the write; the increment is computed in the API route exactly like every other quantity write in the codebase.
- Not handling concurrent-edit race conditions on the increment beyond what the rest of the codebase already does (RLS-isolated, single user per account — no optimistic locking exists anywhere to mirror).
- Not adding an "undo check-off" capability — not in FR-012, and no precedent for reversible mutations exists in the app.

## Implementation Approach

Two phases, each delivering a complete, independently-testable slice of the "Check off" capability on the same file:

1. **Phase 1** ships the new mechanic — a dedicated checkoff endpoint plus a new qty-purchased dialog wired to pantry rows, replacing their "Delete" button. This is the substantial new capability (FR-012's actual requirement).
2. **Phase 2** completes the row-action consistency — manual rows get "Check off" too, repurposing the existing delete-confirmation dialog with new wording, reusing the existing `DELETE /api/shopping-list-items/:id` endpoint untouched.

Splitting this way means Phase 1 is fully manually verifiable end-to-end (new endpoint + new UI) before Phase 2's smaller, purely cosmetic/UX change lands on top of it.

## Critical Implementation Details

**Dialog restructuring**: The page currently has *one* shared `<dialog id="delete-dialog">` serving both item types via a single confirm button. This plan splits it into *two* purpose-built dialogs — a number-input dialog for pantry check-off (Phase 1) and a relabeled yes/no confirm dialog for manual check-off (Phase 2, repurposing the existing markup/script rather than adding a third dialog). The implementer should remove the old shared dialog's pantry-branch wiring in Phase 1 and finish converting its manual-branch wiring to "check off" semantics in Phase 2 — by the end of Phase 2 there should be no `data-item-type === "pantry"` branch left pointing at `/api/products/:id` DELETE from this page.

**Increment is fetch-then-write, not atomic**: Supabase's JS client has no `quantity = quantity + x` expression support and the codebase has no RPC functions to lean on. The checkoff endpoint must `.select("quantity")` the current row (scoped by `.eq("id", id).eq("user_id", user.id)`), compute `current + qty_purchased` in JS, then `.update({ quantity: newValue })` with the same scoping — mirroring exactly how `src/pages/api/products/[id].ts` already reads-then-writes other fields.

## Phase 1: Pantry Item Check-Off

### Overview

Ship the core FR-012 mechanic: a new API endpoint that increments a product's inventory quantity, and a UI dialog that collects "quantity purchased" from the user and wires it to that endpoint — replacing the "Delete" button on pantry rows.

### Changes Required:

#### 1. Check-off API endpoint

**File**: `src/pages/api/products/[id]/checkoff.ts` (new)

**Intent**: Accept a `qty_purchased` form value, add it to the product's current `quantity`, and persist the result — scoped to the authenticated user's own row. This is the only write path for FR-012's inventory update.

**Contract**: `POST` handler exporting `APIRoute`, mirroring `src/pages/api/shopping-list-items/[id].ts:6-22` exactly for the auth check, `createClient()` null-check, and response shape (raw `Response` with HTTP status — 204 on success, 401/503/404/500 + error text on failure — never a redirect, since this is `fetch()`-driven). Body: parse `qty_purchased` via `parseFloat(form.get("qty_purchased") ?? "0")`; `.select("quantity")` the row scoped by `.eq("id", id).eq("user_id", user.id)` (404 if not found or not owned); compute `newQuantity = currentQuantity + qtyPurchased`; `.update({ quantity: newQuantity })` with the same `.eq("id", ...).eq("user_id", ...)` scoping.

#### 2. Shopping list page — pantry check-off UI

**File**: `src/pages/shopping-list/index.astro`

**Intent**: Replace the "Delete" button on pantry rows with "Check off", add a new qty-purchased dialog, and wire its confirm action to the new endpoint with the established redirect-on-completion flow.

**Contract**: In the actions cell for `item.type === "pantry"` (currently lines 134-151), replace the `delete-trigger` button with a `checkoff-trigger` button carrying `data-item-id`, `data-item-name`, `data-buy-amount` (the computed `item.buy`), and `data-unit`. Add a new `<dialog id="checkoff-dialog">` (sibling to the existing delete dialog, lines 164-188) containing a number input (empty value, `placeholder` interpolating the suggested amount + unit, e.g. `"Suggested: {buy} {unit}"`, `min="0.01" step="any"` matching the validation pattern in `src/pages/shopping-list/new.astro:50-59`) plus Cancel/Confirm buttons. Extend the page's `<script>` (lines 191-241) with a click handler on `.checkoff-trigger` that opens this dialog pre-populated with the row's data, and a confirm handler that builds a `FormData` with `qty_purchased`, `fetch`es `POST /api/products/${id}/checkoff`, and on `response.ok` does `window.location.href = "/shopping-list"`, else `window.location.href = "/shopping-list?error=" + encodeURIComponent(await response.text())` — identical completion flow to the existing delete handler (lines 233-239). Remove the pantry branch (`type === "pantry" → /api/products/${id}` DELETE) from the old shared dialog's confirm handler; the old dialog now serves only manual items (finished in Phase 2).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npx astro sync` completes without type errors

#### Manual Verification:

- `/shopping-list` shows a "Check off" button (not "Delete") on every pantry-linked row; "Edit" remains
- Clicking "Check off" on a pantry row opens a dialog showing the item name and a placeholder hint with the suggested "Buy" amount and unit, with an empty input
- Entering a quantity equal to (or greater than) the "Buy" gap and confirming: the row disappears from `/shopping-list`, and `/inventory` shows the product's quantity increased by the entered amount
- Entering a quantity smaller than the "Buy" gap and confirming: the row remains on `/shopping-list` with a recomputed (smaller) "Buy" gap, and `/inventory` shows the partial increase
- Cancelling the dialog closes it without changing inventory and returns focus to the trigger button
- A failed submission (e.g. simulate by editing the request) surfaces the error via the `?error=` banner on `/shopping-list`, matching the existing error-display pattern
- No regression in Edit, in manual-item Delete (still functioning as before until Phase 2), or in the auto-derivation of the list itself

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Manual Item Check-Off

### Overview

Complete the row-action consistency: manual one-off items get "Check off" instead of "Delete", repurposing the existing shared confirmation dialog with check-off-appropriate wording. No backend changes — the existing `DELETE /api/shopping-list-items/:id` endpoint is reused as-is, since "checking off" a manual item and "removing" it are the same operation.

### Changes Required:

#### 1. Shopping list page — manual check-off UI

**File**: `src/pages/shopping-list/index.astro`

**Intent**: Relabel the manual-row action and the now-pantry-free shared dialog from "Delete / Remove from list?" to "Check off / Mark as bought?", without touching the underlying delete request.

**Contract**: In the actions cell for `item.type === "manual"`, rename the `delete-trigger` button (and its class, e.g. to `checkoff-trigger` with `data-item-type="manual"` so it can share wiring with — or be cleanly distinguished from — the Phase 1 trigger) to read "Check off". Update the remaining shared dialog's heading/copy (currently "Remove from list?" / "Remove `<name>` from your shopping list?", lines 170-173) to check-off wording (e.g. "Mark as bought?" / "Mark `<name>` as bought and remove it from your list?") and its confirm button label (currently "Remove", lines 181-186) to something like "Got it". The confirm handler keeps calling `DELETE /api/shopping-list-items/${id}` for `type === "manual"` and follows the same `response.ok` → redirect-to-`/shopping-list` / redirect-with-`?error=` completion flow, unchanged from today.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npx astro sync` completes without type errors

#### Manual Verification:

- `/shopping-list` shows "Check off" (not "Delete") on every manual-item row
- Clicking "Check off" on a manual row opens a dialog with "Mark as bought?"-style wording naming the item
- Confirming removes the item from `/shopping-list` and it does not reappear on reload (verifying it's gone from `shopping_list_items`, not just hidden)
- Cancelling closes the dialog without removing the item and returns focus to the trigger button
- A failed removal surfaces the error via the `?error=` banner, matching the existing pattern
- Pantry-row "Check off" (Phase 1) continues to work correctly alongside the relabeled manual-row "Check off" — both dialogs are independently reachable and don't interfere with each other
- No regression in adding manual items via `/shopping-list/new`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit test infrastructure exists in this codebase for API routes or Astro pages (confirmed: no test runner config found); this plan does not introduce one, consistent with how S-04 and prior changes shipped.

### Integration Tests:

- None — the codebase relies on manual verification against a live Supabase instance, as established by every prior change in `context/archive/`.

### Manual Testing Steps:

1. Seed a pantry product with `quantity` below `min_threshold` and `add_to_list = true`; confirm it appears on `/shopping-list` with a "Check off" button.
2. Check it off for the exact "Buy" amount → confirm it disappears from the list and `/inventory` reflects the new quantity.
3. Repeat with a partial amount → confirm it remains on the list with a smaller "Buy" gap and inventory reflects the partial increase.
4. Add a manual item via `/shopping-list/new`; confirm it shows "Check off" (not "Delete"); check it off and confirm it's permanently gone after a reload.
5. Cancel both dialog types mid-flow; confirm no side effects and correct focus return.
6. Confirm `/inventory`'s own Delete still fully removes a product (no regression from removing Delete off the shopping-list view).

## Performance Considerations

None beyond the existing page's two parallel Supabase queries (`Promise.all` at `shopping-list/index.astro:34-41`, untouched by this plan). The new endpoint adds one extra `select` before the `update` — negligible for a single-row, RLS-scoped lookup.

## Migration Notes

None — no schema changes. `products.quantity` already supports the write this plan performs.

## References

- Related research: `context/changes/shopping-list-complete/research.md`, `context/changes/shopping-list-complete/docs-radix-checkbox.md`
- Canonical fetch-driven API route pattern: `src/pages/api/products/[id].ts:8-50`
- Existing dialog + vanilla-JS completion flow to mirror: `src/pages/shopping-list/index.astro:164-241`
- Manual-item form validation pattern (`min`/`step` on number input): `src/pages/shopping-list/new.astro:50-59`
- S-04 plan documenting the intentional "Delete deletes the whole product" behavior: `context/archive/2026-06-05-shopping-list-core/plan.md:30`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pantry Item Check-Off

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors — a962154
- [x] 1.2 `npx astro sync` completes without type errors — a962154

#### Manual

- [x] 1.3 `/shopping-list` shows a "Check off" button (not "Delete") on every pantry-linked row; "Edit" remains — a962154
- [x] 1.4 Clicking "Check off" on a pantry row opens a dialog showing the item name and a placeholder hint with the suggested "Buy" amount and unit, with an empty input — a962154
- [x] 1.5 Entering a quantity equal to (or greater than) the "Buy" gap and confirming: the row disappears from `/shopping-list`, and `/inventory` shows the product's quantity increased by the entered amount — a962154
- [x] 1.6 Entering a quantity smaller than the "Buy" gap and confirming: the row remains on `/shopping-list` with a recomputed (smaller) "Buy" gap, and `/inventory` shows the partial increase — a962154
- [x] 1.7 Cancelling the dialog closes it without changing inventory and returns focus to the trigger button — a962154
- [x] 1.8 A failed submission surfaces the error via the `?error=` banner on `/shopping-list`, matching the existing error-display pattern — a962154
- [x] 1.9 No regression in Edit, in manual-item Delete (still functioning as before until Phase 2), or in the auto-derivation of the list itself — a962154

### Phase 2: Manual Item Check-Off

#### Automated

- [x] 2.1 `npm run lint` passes with no new errors
- [x] 2.2 `npx astro sync` completes without type errors

#### Manual

- [x] 2.3 `/shopping-list` shows "Check off" (not "Delete") on every manual-item row
- [x] 2.4 Clicking "Check off" on a manual row opens a dialog with "Mark as bought?"-style wording naming the item
- [x] 2.5 Confirming removes the item from `/shopping-list` and it does not reappear on reload
- [x] 2.6 Cancelling closes the dialog without removing the item and returns focus to the trigger button
- [x] 2.7 A failed removal surfaces the error via the `?error=` banner, matching the existing pattern
- [x] 2.8 Pantry-row "Check off" continues to work correctly alongside the relabeled manual-row "Check off" — both dialogs are independently reachable and don't interfere with each other
- [x] 2.9 No regression in adding manual items via `/shopping-list/new`
