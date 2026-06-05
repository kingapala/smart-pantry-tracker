# Inventory Expiry Highlighting and Sort — Implementation Plan

## Overview

Add two features to the inventory list page: (1) highlight expired rows in red and rows expiring within 3 days in amber, and (2) one-click sort by expiry date (ascending, soonest first) with a reset link that restores default creation order. All changes are confined to `src/pages/inventory/index.astro` with zero new dependencies.

## Current State Analysis

The inventory list page renders a server-side table of products sorted by `created_at`. The expiry date column displays dates via `formatDateDisplay()` but applies no visual differentiation. The Supabase query ignores URL parameters — it always orders by `created_at`.

- `cn()` utility exists in `src/lib/utils.ts` — not yet imported by the inventory page
- `nowUTC()` is in `@/lib/date.ts` — not yet imported by the inventory page (only `formatDateDisplay` is)
- `Astro.url.searchParams` is already used to read `?error` — same pattern applies for `?sort`
- `expiry_date` stores date-only strings (`YYYY-MM-DD`) — ISO string prefix comparison is safe and correct for day-granularity

## Desired End State

Visiting `/inventory` renders the list sorted by creation date (default). Visiting `/inventory?sort=expiry` renders it sorted by expiry date ascending with null-expiry rows at the bottom. Rows with `expiry_date` on or before today appear with a red background and red date text; rows expiring within the next 3 days (but not today) appear with an amber background and amber date text. The Expiry column header shows a sort link when sort is inactive, and a `×` reset link alongside the header text when sort is active.

### Key Discoveries:

- `Astro.url.searchParams.get("sort")` follows the exact same pattern as the existing `rawError` read — place it in the same block
- `nowUTC()` returns a full ISO timestamp; `.slice(0, 10)` extracts the `YYYY-MM-DD` date portion
- "Expired or expiring today" uses `expiry_date <= todayStr` where `todayStr = nowUTC().slice(0, 10)`
- "Expiring soon" uses `expiry_date > todayStr && expiry_date <= soonStr` where `soonStr` is 3 UTC days ahead
- Tailwind JIT: full class strings (`"bg-red-500/10 border-red-500/20"`) must appear as literals — using `cn()` with literal string arguments satisfies this

## What We're NOT Doing

- Sort direction toggle (no descending sort)
- User-configurable "expiring soon" threshold
- Any new npm dependencies
- Modifications to API routes, data model, or any page other than `index.astro`

## Implementation Approach

Both features live entirely in the Astro page frontmatter and template. The sort is applied at the DB layer on every server render (URL param → Supabase `.order()`). Expiry state is computed from ISO date string comparison in the frontmatter and passed to `cn()` in the template for class application.

## Critical Implementation Details

**Date comparison via ISO prefix:** `expiry_date` is a date-only string (`YYYY-MM-DD`). Comparing it against `nowUTC().slice(0, 10)` via `<=` is correct because ISO date strings sort lexicographically. Avoid the research doc's pattern `new Date(expiry_date) < nowUTC()` — `nowUTC()` returns a string; comparing a Date to a string coerces the string to NaN and the comparison silently returns false always. ISO string comparison is simpler and unambiguous.

**Supabase query branch:** `.order()` in `@supabase/postgrest-js` mutates the builder's URL in-place and returns `this` — it is not immutable. Reusing a base variable after calling `.order()` on it taints the second query with the first sort. Write two complete parallel `await` chains inside a ternary to avoid shared mutation.

---

## Phase 1: Sort by Expiry Date

### Overview

Read the `?sort=expiry` URL param in the frontmatter, conditionally branch the Supabase query to order by `expiry_date` ascending (nulls last) when the param is set, and update the Expiry column header to show a sort link (inactive) or a `×` reset link (active).

### Changes Required:

#### 1. URL param read

**File**: `src/pages/inventory/index.astro`

**Intent**: Read `?sort=expiry` from the URL in the frontmatter so it can drive the query branch and control the column header rendering.

**Contract**: `const sortParam = Astro.url.searchParams.get("sort");` — place it immediately before the `const supabase = createClient(...)` line, following the same pattern as the existing `rawError` read.

---

#### 2. Conditional Supabase query

**File**: `src/pages/inventory/index.astro`

**Intent**: Replace the fixed `.order("created_at", ...)` with a conditional that orders by `expiry_date` ascending (nulls last) when `sortParam === "expiry"`, and by `created_at` ascending otherwise.

**Contract**: Replace the current `.order("created_at", { ascending: true })` call with a ternary `await` that writes two complete query chains. When sort is active: `.order("expiry_date", { ascending: true, nullsFirst: false })`. The `nullsFirst: false` is required — products without an expiry date must appear at the bottom, not the top.

---

#### 3. Expiry column header: sort / reset link

**File**: `src/pages/inventory/index.astro`

**Intent**: Replace the plain `Expiry` text in the `<th>` with an `<a href="?sort=expiry">` link when sort is inactive, and with plain text plus an `<a href="/inventory" aria-label="Clear expiry sort">×</a>` reset link when sort is active.

**Contract**: The sort link uses `Expiry ↑` as link text. When active, the `×` is a separate inline anchor carrying `aria-label="Clear expiry sort"`. The `<th>` element's existing class (`px-4 py-3 font-medium`) does not change. Use `{sortParam === "expiry" ? (...) : (...)}` inline in the template.

---

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npx astro sync` completes without type errors

#### Manual Verification:

- `/inventory` shows the Expiry column header as a clickable "Expiry ↑" link; URL has no `?sort=expiry`
- Clicking the sort link navigates to `?sort=expiry` and rows are ordered by expiry date ascending
- Products with no expiry date appear at the bottom when sort is active
- A `×` reset link (with accessible label) appears next to "Expiry ↑" in the header when sort is active
- Clicking `×` returns to `/inventory` with default creation-date order
- Navigating to edit a product from the sorted view and pressing browser Back preserves `?sort=expiry` in the URL

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Expiry Highlighting

### Overview

Import `cn` and `nowUTC` into the frontmatter, compute today's date string and the 3-day threshold string once, then apply conditional Tailwind classes to each product row and expiry cell to render expired rows in red and expiring-soon rows in amber.

### Changes Required:

#### 1. Additional imports

**File**: `src/pages/inventory/index.astro`

**Intent**: Add `cn` from `@/lib/utils` and `nowUTC` from `@/lib/date` to the existing import block so both are available in the template.

**Contract**: Extend the existing `import { formatDateDisplay } from "@/lib/date"` to also import `nowUTC`. Add a new import line `import { cn } from "@/lib/utils"`.

---

#### 2. Expiry threshold computation

**File**: `src/pages/inventory/index.astro`

**Intent**: Compute `todayStr` and `soonStr` once in the frontmatter so every row can perform expiry comparisons without repeating date arithmetic.

**Contract**:
- `todayStr`: `nowUTC().slice(0, 10)` — first 10 characters of an ISO timestamp are always `YYYY-MM-DD`
- `soonStr`: construct a Date from `nowUTC()`, add 3 UTC days via `setUTCDate(getUTCDate() + 3)`, then call `.toISOString().slice(0, 10)`
- Place both constants outside the `if (user && supabase)` block — they don't depend on Supabase data and are needed in the template regardless of auth state

---

#### 3. Row expiry class

**File**: `src/pages/inventory/index.astro`

**Intent**: Replace the hardcoded `class` string on the inventory `<tr>` with a `cn()` call that adds a red background for expired rows and amber for expiring-soon rows, preserving all existing base classes.

**Contract**: The `hover:` variant must be conditional alongside the background — tailwind-merge does not strip `hover:bg-white/5` when a non-hover `bg-*` is also present; both variants fire independently. Structure the `cn()` call as three branches, each with its own hover override. Base classes (always applied): `"border-b border-white/5 last:border-0"`. Conditional branches (all four strings must appear as literals for Tailwind JIT):
- Expired (`p.expiry_date !== null && p.expiry_date <= todayStr`): `"bg-red-500/10 border-red-500/20 hover:bg-red-500/20"`
- Expiring soon (`p.expiry_date !== null && p.expiry_date > todayStr && p.expiry_date <= soonStr`): `"bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"`
- Neither: `"hover:bg-white/5"`

Use `class={cn(...)}` syntax — `class:list` is the Astro-native alternative but does not run `tailwind-merge` and would not resolve conflicting `hover:` variants correctly.

---

#### 4. Expiry cell text color

**File**: `src/pages/inventory/index.astro`

**Intent**: Change the text color of the expiry `<td>` to red for expired rows and amber for expiring-soon rows, while preserving the existing `text-blue-100/80` for normal rows.

**Contract**: Replace the static `class="px-4 py-3 text-blue-100/80"` on the expiry `<td>` with `class={cn("px-4 py-3", ...)}`. The same condition flags from change 3 above drive the color choice:
- Expired → `"text-red-400 font-medium"`
- Expiring soon → `"text-amber-400 font-medium"`
- Neither → `"text-blue-100/80"`

---

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npx astro sync` completes without type errors

#### Manual Verification:

- A product with `expiry_date` = today shows a red-tinted row and red date text
- A product with `expiry_date` = yesterday (or earlier) shows a red-tinted row and red date text
- A product with `expiry_date` = tomorrow, day+2, or day+3 shows an amber-tinted row and amber date text
- A product with `expiry_date` = day+4 or later shows a neutral (unchanged) row
- A product with no expiry date shows a neutral (unchanged) row
- Highlighting renders correctly in both default order and `?sort=expiry` order
- No regression: add, edit, and delete flows still function correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Manual Testing Steps:

1. Add a product with `expiry_date` = today → verify red row and red expiry date text
2. Add a product with `expiry_date` = yesterday → verify red row and red expiry date text
3. Add a product with `expiry_date` = today + 1 day → verify amber row and amber expiry date text
4. Add a product with `expiry_date` = today + 3 days → verify amber row and amber expiry date text
5. Add a product with `expiry_date` = today + 4 days → verify neutral row
6. Add a product with no expiry date → verify neutral row
7. Click "Expiry ↑" column header → verify URL changes to `?sort=expiry` and rows are sorted ascending
8. Verify null-expiry products appear at the bottom of sorted list
9. Click `×` reset link → verify return to `/inventory` with creation-date order
10. Navigate to edit a product from the sorted view → press browser Back → verify `?sort=expiry` is preserved

## References

- Research: `context/changes/inventory-expiry-and-sort/research.md`
- Inventory page: `src/pages/inventory/index.astro`
- cn() utility: `src/lib/utils.ts`
- Date utilities: `src/lib/date.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Sort by Expiry Date

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors
- [x] 1.2 `npx astro sync` completes without type errors

#### Manual

- [ ] 1.3 `/inventory` shows Expiry column header as a clickable "Expiry ↑" sort link
- [ ] 1.4 Clicking the sort link navigates to `?sort=expiry` and rows are ordered by expiry date ascending
- [ ] 1.5 Products with no expiry date appear at the bottom when sort is active
- [ ] 1.6 A `×` reset link appears next to "Expiry ↑" when `?sort=expiry` is in the URL
- [ ] 1.7 Clicking `×` returns to `/inventory` with default creation-date order
- [ ] 1.8 Browser Back from edit page preserves `?sort=expiry`

### Phase 2: Expiry Highlighting

#### Automated

- [ ] 2.1 `npm run lint` passes with no new errors
- [ ] 2.2 `npx astro sync` completes without type errors

#### Manual

- [ ] 2.3 Product with `expiry_date` = today shows red row and red date text
- [ ] 2.4 Product with `expiry_date` = yesterday shows red row and red date text
- [ ] 2.5 Product with `expiry_date` = today+1 to today+3 shows amber row and amber date text
- [ ] 2.6 Product with `expiry_date` = today+4 or later shows neutral row
- [ ] 2.7 Product with no expiry date shows neutral row
- [ ] 2.8 Highlighting works correctly in both default and `?sort=expiry` order
- [ ] 2.9 No regression in add, edit, and delete flows
