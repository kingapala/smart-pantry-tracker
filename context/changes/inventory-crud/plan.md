# Inventory CRUD — Implementation Plan

## Overview

S-02: Full-featured inventory management (add, view, edit, delete) for authenticated users. The CRUD code is already in place and correct against all functional requirements. This plan covers the four gaps found during the re-review: missing Topbar navigation on inventory pages, a Dashboard dead-end, two WCAG 2.1 AA accessibility issues (dialog focus return, Edit link labelling), and closes S-02 with a full manual verification pass.

## Current State Analysis

All four FRs are implemented:
- `src/pages/inventory/index.astro` — product table, empty state, inline delete dialog
- `src/pages/inventory/new.astro` — add product form (all 6 fields, checkbox, error display)
- `src/pages/inventory/[id]/edit.astro` — pre-populated edit form, fetch-based PUT
- `src/pages/api/products/index.ts` — POST create with auth + null-check guards
- `src/pages/api/products/[id].ts` — PUT update + DELETE with user_id isolation

What's missing:
1. **Topbar** — none of the three inventory pages import `Topbar.astro`. Users inside `/inventory/*` have no way to sign out or see their account.
2. **Dashboard dead-end** — sign-in redirects to `/inventory`. The Dashboard page (reachable via Topbar's "Dashboard" link) has a sign-out button but no path back to `/inventory`.
3. **Focus return** — the delete dialog's vanilla JS `close` handler does not restore focus to the button that triggered it (WCAG 2.1 AA 2.4.3).
4. **Edit link labels** — `<a>Edit</a>` links provide no product context to screen readers. The sibling Delete button already carries `aria-label="Delete {product.name}"` — Edit needs parity.

## Desired End State

User can:
- Sign in and land on `/inventory` with a Topbar visible (email, Dashboard link, Sign out)
- Add, view, edit, and delete any product through the web UI, with all errors surfaced inline
- Use keyboard only to complete the full CRUD flow including the delete confirmation dialog (Escape returns focus to trigger)
- Navigate from Dashboard to their pantry and back

Verify by: running through the manual testing checklist in Phase 3 against a live Supabase-connected dev environment.

### Key Discoveries

- `src/components/DeleteConfirmDialog.tsx` exists and already handles focus return correctly (via `triggerRef`), but the inventory page uses a custom vanilla `<dialog>` implementation. The plan patches the vanilla implementation; migration to the React component is out of scope.
- `src/lib/date.ts` — `formatDateDisplay()` is already used for date display in the inventory list. The edit form correctly uses the raw `date` column string (YYYY-MM-DD) as the HTML date input value — no conversion needed.
- Middleware `PROTECTED_ROUTES` covers `/inventory` via `startsWith`, protecting all sub-routes automatically.
- All product queries include `.eq("user_id", user.id)` in addition to RLS — correct defence in depth.

## What We're NOT Doing

- Migrating the vanilla delete dialog to `DeleteConfirmDialog.tsx` (out of scope for speed; patch is smaller)
- Adding an inline quantity stepper (PRD explicitly deferred to v2)
- Search, grouping, or pagination of the inventory list (PRD: flat list sufficient for MVP scale)
- Full WCAG 2.1 AA audit beyond the two known gaps
- Adding `/api/products/*` to middleware `PROTECTED_ROUTES` (API routes handle auth themselves — no gap)

## Implementation Approach

Three small, targeted passes: Navigation (component import + one link addition), Accessibility (two JS/HTML tweaks in a single file), and Verification (manual walkthrough against every FR and NFR). No new files, no schema changes, no new API routes.

## Critical Implementation Details

**Layout restructuring for Topbar on form pages**: `new.astro`, `edit.astro`, and `dashboard.astro` all use `flex min-h-screen items-center justify-center` to centre their cards. Inserting a Topbar breaks the centering. Fix: change the outer `<div>` to `flex flex-col min-h-screen pt-4`; render `<Topbar />` directly as the first child (no extra wrapper — Topbar's own `px-4 py-2` controls its spacing); wrap the card in `<div class="flex flex-1 items-center justify-center p-4">`. `index.astro` does not centre vertically, so Topbar inserts without restructuring.

**Dialog focus return via `close` event**: The native `<dialog>` element fires a `close` event for every close path — Cancel button, Escape key, and programmatic `dialog.close()`. Restoring focus in the `close` handler covers all paths without touching individual button handlers. Track the trigger in a `pendingTrigger` variable set on each `.delete-trigger` click.

## Phase 1: Navigation

### Overview

Add the `Topbar.astro` component to all three inventory pages so users can always see their account identity and reach sign-out. Add an "Open Pantry" link to the Dashboard so the Topbar's "Dashboard" link is not a dead end.

### Changes Required

#### 1. Inventory list page — Topbar

**File**: `src/pages/inventory/index.astro`

**Intent**: Import and render `Topbar` at the top of the main content area so the user always sees their email and the sign-out option on the list page.

**Contract**: Add `import Topbar from "@/components/Topbar.astro";` in the frontmatter. Render `<Topbar />` immediately inside the `<div class="mx-auto max-w-4xl">` div, before the `<div class="mb-6 flex items-center justify-between">` heading row.

---

#### 2. Add product page — Topbar

**File**: `src/pages/inventory/new.astro`

**Intent**: Import and render `Topbar` at the top of the page. The current outer div vertically centres the form card; restructure so Topbar sits above the centred content.

**Contract**: Add `import Topbar from "@/components/Topbar.astro";` in the frontmatter. Change the outer `<div class="bg-cosmic flex min-h-screen items-center justify-center p-4">` to `<div class="bg-cosmic flex min-h-screen flex-col pt-4">`. Render `<Topbar />` as the first child directly — no extra wrapper; Topbar's own `px-4 py-2` controls its spacing. Wrap the existing form card in `<div class="flex flex-1 items-center justify-center p-4">` to restore vertical centering in the remaining space.

---

#### 3. Edit product page — Topbar

**File**: `src/pages/inventory/[id]/edit.astro`

**Intent**: Same as change 2 — Topbar above the vertically-centred edit form card.

**Contract**: Identical structural change to `new.astro`: outer div becomes `flex flex-col min-h-screen pt-4`, Topbar rendered directly as first child (no wrapper), existing card wrapped in `flex flex-1 items-center justify-center p-4`.

---

#### 4. Dashboard — Topbar + Pantry link

**File**: `src/pages/dashboard.astro`

**Intent**: Add Topbar and an "Open Pantry" link to the Dashboard page so it has consistent navigation with inventory pages and is not a dead end when reached from Topbar.

**Contract**: Add `import Topbar from "@/components/Topbar.astro";` in the frontmatter. Change the outer `<div class="bg-cosmic flex min-h-screen items-center justify-center p-4">` to `<div class="bg-cosmic flex min-h-screen flex-col">`. Render `<Topbar />` as the first child. Wrap the existing centered card in `<div class="flex flex-1 items-center justify-center p-4">`. Inside the card, add `<a href="/inventory">` alongside the existing sign-out `<form>`, styled with `rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium transition-colors hover:bg-purple-600` to match the primary button style.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes with no new errors
- `npx astro check` passes

#### Manual Verification

- Sign in → `/inventory` shows Topbar with user email, "Dashboard" link, and "Sign out" button
- "Sign out" button in Topbar signs out and redirects to `/`
- `/inventory/new` shows Topbar at top; form card is still visually centred in remaining page height
- `/inventory/[id]/edit` shows Topbar at top; form card centred below it
- Dashboard shows Topbar with user email and Sign out; form card centred below it
- Dashboard "Open Pantry" link navigates to `/inventory`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Accessibility

### Overview

Fix the two known WCAG 2.1 AA gaps in the inventory list page: delete dialog focus return and Edit link labelling. Both changes are in `src/pages/inventory/index.astro`.

### Changes Required

#### 1. Delete dialog — focus return on close

**File**: `src/pages/inventory/index.astro` (`<script>` block)

**Intent**: When the delete dialog closes by any path — Cancel button, Escape key, or backdrop click — focus must return to the Delete button that opened it. This satisfies WCAG 2.1 AA 2.4.3 (Focus Order).

**Contract**: Add `let pendingTrigger: HTMLButtonElement | null = null;` alongside the existing `let pendingId`. In each `.delete-trigger` click handler, set `pendingTrigger = btn`. In the existing `dialog.close` event listener, add `pendingTrigger?.focus(); pendingTrigger = null;` before the existing `pendingId = null;` line. The `close` event fires for every close path (Cancel, Escape, backdrop, confirm) so no changes are needed to individual button handlers.

---

#### 2. Edit links — contextual aria-label

**File**: `src/pages/inventory/index.astro`

**Intent**: Each Edit link renders as plain "Edit" text. Screen readers announce it without product context, making all Edit links in the table indistinguishable. Add `aria-label` to match the existing pattern on the Delete buttons.

**Contract**: Add `aria-label={`Edit ${p.name}`}` to the `<a href={`/inventory/${p.id}/edit`}>` element inside the `products.map()` callback.

---

### Success Criteria

#### Automated Verification

- `npm run lint` passes
- `npx astro check` passes

#### Manual Verification

- Open inventory list, Tab to a Delete button, press Enter/Space: dialog opens; Tab between Cancel and Delete; press Escape: dialog closes and focus returns to the Delete button that opened it
- Same focus-return behaviour when clicking Cancel in the dialog
- Browser accessibility tree (Chrome DevTools → Accessibility, or VoiceOver) shows Edit links announced as "Edit [product name]"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: Verification

### Overview

Full manual walkthrough against every FR and NFR in scope for S-02. Completing this phase gates marking the slice done.

### Changes Required

No code changes in this phase — pure verification. If any test step fails, treat it as a defect and fix before signing off.

> **Error paths**: server-side error display (URL-param error banner on add/edit/delete failure) is verified by code inspection — the redirect-with-error mechanism is present and consistent across all three API routes. Live error simulation (e.g., killing the Supabase connection) is not required.

### Success Criteria

#### Automated Verification

- `npm run lint` passes across the full project
- `npx astro check` passes

#### Manual Verification

**FR-004 — Add product**
- Fill add form with all fields including optional expiry date → product appears in list with correct values
- Add product with no expiry date → succeeds; expiry column shows "—" in list
- Submit add form with required field (name) missing → browser validation blocks submit

**FR-005 — View list**
- Empty pantry shows empty-state message and "Add your first product →" CTA link
- Non-empty pantry shows all products with correct name, qty+unit, threshold+unit, formatted expiry date, and add-to-list flag

**FR-006 — Update any field**
- Click Edit on a product → form pre-populated with all current values
- Change name, qty, unit, min threshold, expiry date, and add-to-list flag → save → all changes reflected in list
- Clear expiry date and save → expiry column shows "—"

**FR-007 — Delete with confirmation**
- Click Delete → dialog shows the exact product name in confirmation text
- Click Cancel → dialog closes, product remains in list, focus returns to Delete button
- Click Delete → Confirm → product removed from list

**Keyboard flow (NFR: WCAG 2.1 AA)**
- Tab through inventory list without mouse → Edit and Delete buttons are reachable in DOM order
- Enter on an Edit link → navigate to edit page
- Tab to a Delete button, Enter → open dialog; Tab between Cancel and Confirm; Escape → close + focus returns to trigger
- Tab through Add product form → all fields and submit button are reachable and operable

**Data isolation (NFR)**
- Sign in as user A, note a product ID, sign out; sign in as user B, navigate to `/inventory/{user-A-product-id}/edit` → redirected to `/inventory` (product not found guard)

**NFR — Feedback < 2 seconds**
- All create, edit, and delete operations complete and redirect visibly within 2 seconds

**Implementation Note**: After all manual checks pass, update `change.md` status to `done` and the `updated` date.

---

## Testing Strategy

### Manual Testing Steps

See Phase 3 Success Criteria — each bullet is a discrete test step.

### Unit Tests

None added. The CRUD logic is thin routing glue over Supabase; there is no business logic layer that warrants unit testing in isolation.

### Integration Tests

None added for this slice. The E2E acceptance test covering the full closed loop (inventory quantity → shopping list) is scoped to S-04 (shopping list core), per the PRD secondary success criterion.

## Migration Notes

No schema or data changes. No breaking API changes.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02, FR-004–FR-007, NFRs)
- PRD: `context/foundation/prd.md`
- Lessons: `context/foundation/lessons.md`
- Existing focus-return pattern: `src/components/DeleteConfirmDialog.tsx:10-29`
- Existing aria-label pattern (Delete button): `src/pages/inventory/index.astro:101`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Navigation

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npx astro check` passes

#### Manual

- [x] 1.3 `/inventory` shows Topbar with user email, Dashboard link, Sign out
- [x] 1.4 Sign out from Topbar redirects to `/`
- [x] 1.5 `/inventory/new` shows Topbar; form card centred below it
- [x] 1.6 `/inventory/[id]/edit` shows Topbar; form card centred below it
- [x] 1.7 Dashboard shows Topbar with user email and Sign out; form card centred
- [x] 1.8 Dashboard "Open Pantry" link navigates to `/inventory`

### Phase 2: Accessibility

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npx astro check` passes

#### Manual

- [ ] 2.3 Delete dialog Escape closes + focus returns to trigger Delete button
- [ ] 2.4 Delete dialog Cancel closes + focus returns to trigger Delete button
- [ ] 2.5 Edit links announced as "Edit [product name]" in accessibility tree

### Phase 3: Verification

#### Automated

- [ ] 3.1 `npm run lint` passes (full project)
- [ ] 3.2 `npx astro check` passes

#### Manual

- [ ] 3.3 FR-004: Add product with expiry date — appears in list correctly
- [ ] 3.4 FR-004: Add product without expiry date — expiry shows "—"
- [ ] 3.5 FR-004: Missing required field — browser blocks submit
- [ ] 3.6 FR-005: Empty state message and CTA visible
- [ ] 3.7 FR-005: Product list shows all fields correctly
- [ ] 3.8 FR-006: Edit form pre-populated; all field changes saved
- [ ] 3.9 FR-006: Clearing expiry date persists correctly
- [ ] 3.10 FR-007: Delete dialog shows product name; Cancel leaves product + focus returns
- [ ] 3.11 FR-007: Confirm deletes product
- [ ] 3.12 Keyboard: full add-product flow keyboard-only
- [ ] 3.13 Keyboard: delete dialog Tab + Escape + focus-return flow
- [ ] 3.14 Data isolation: cross-user edit URL redirects to /inventory
- [ ] 3.15 NFR feedback: all operations complete and redirect within 2 seconds
