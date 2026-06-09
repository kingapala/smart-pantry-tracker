<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Shopping List Check-Off

- **Plan**: context/changes/shopping-list-complete/plan.md
- **Scope**: Full (Phases 1 + 2, plus user-requested additions in commits a573a70–c468e70)
- **Date**: 2026-06-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Automated Verification

- `npm run lint` — ✅ PASS (all 8 changed files clean)
- `npx astro sync` — ✅ PASS (types generated without errors)

## Manual Verification

All Phase 1 (1.3–1.9) and Phase 2 (2.3–2.9) manual criteria confirmed by user during implementation.

## Findings

### F1 — No lower-bound validation on qty_purchased in both checkoff endpoints

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/products/[id]/checkoff.ts:18 and src/pages/api/shopping-list-items/[id]/checkoff.ts:18
- **Detail**: Both endpoints parse `qty_purchased` with `parseFloat()` and proceed without validating it is > 0. A negative value drives `newQuantity` below 0, hitting the DB `CHECK (quantity >= 0)` constraint and returning a raw 500 instead of a clean 400. The UI's `min="0.01"` attribute cannot be trusted at the API boundary.
- **Fix**: Add after line 18 in both files: `if (isNaN(qtyPurchased) || qtyPurchased <= 0) return new Response("qty_purchased must be > 0", { status: 400 });`
- **Decision**: FIXED — added `if (isNaN(qtyPurchased) || qtyPurchased <= 0)` guard in both checkoff endpoints (da29929)

### F2 — Case-sensitive name match can create duplicate pantry products

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/shopping-list-items/[id]/checkoff.ts:42–47
- **Detail**: Manual item checkoff looks up a pantry product with `.eq("name", name)` — a case-sensitive match. "Milk" vs "milk" will miss the existing product and insert a duplicate instead of incrementing.
- **Fix A ⭐ Recommended**: Use `.ilike("name", name)` in the product lookup.
  - Strength: Prevents duplicates; single-call change; no migration needed.
  - Tradeoff: Slightly slower; not needed at pantry-list scale.
  - Confidence: HIGH — Supabase JS supports `.ilike()` directly.
  - Blind spot: None significant.
- **Fix B**: Add a unique DB constraint on `(user_id, lower(name))`.
  - Strength: Enforces deduplication at the DB level permanently.
  - Tradeoff: Requires a migration; existing duplicate rows would block creation.
  - Confidence: MEDIUM — migration path not explored.
  - Blind spot: Existing data may already have case variants.
- **Decision**: FIXED via Fix A — replaced `.eq("name", name)` with `.ilike("name", name)` (da29929)

### F3 — Plan.md no longer reflects what was built

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: context/changes/shopping-list-complete/plan.md
- **Detail**: The plan covers 2 phases (check-off only). Seven additional files were added via user requests after the plan closed: unit conversion, manual-item → pantry checkoff, delete/unlist buttons, edit dialog with PATCH endpoints, split qty+unit fields, expiry/add-to-list/threshold fields. "What We're NOT Doing" now misrepresents reality.
- **Fix**: Add a "Post-plan additions" section to plan.md (or change.md Notes) documenting the extra features, their motivation, and the relevant commit SHAs.
- **Decision**: FIXED — Post-plan additions section added to change.md Notes (da29929)

### F4 — Confirm button re-enabled while fetch is still in flight

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/shopping-list/index.astro (checkoff dialog close handler)
- **Detail**: The confirm handler calls `checkoffDialog.close()` before the fetch resolves. The `close` event fires immediately and the handler unconditionally sets `checkoffConfirmBtn.disabled = false`, creating a window where a second item's checkoff could be triggered before the page redirects.
- **Fix**: Remove `if (checkoffConfirmBtn) checkoffConfirmBtn.disabled = false;` from the close handler. The button resets naturally on the next page load.
- **Decision**: FIXED — line removed from close handler (da29929)

### F5 — unitsCompatible export is dead code

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/units.ts:95
- **Detail**: `unitsCompatible` is exported but not imported anywhere in the codebase.
- **Fix**: Remove or mark as intentionally reserved.
- **Decision**: SKIPPED — kept for potential future use

### F6 — PATCH /api/shopping-list-items/[id] silently succeeds on nonexistent row

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/shopping-list-items/[id].ts (PATCH handler)
- **Detail**: Supabase `.update()` on a nonexistent row matches 0 rows and returns no error. API returns 204; no user-visible harm (RLS enforces isolation) but inconsistent with the products checkoff pattern that does a prior SELECT and returns 404.
- **Fix**: Add a SELECT before the UPDATE and return 404 if no row found.
- **Decision**: FIXED — SELECT + 404 guard added before UPDATE (da29929)

### F7 — Shopping list page omits user_id filter on products server query

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/shopping-list/index.astro:37–38
- **Detail**: The server-side products query has no `.eq("user_id", user.id)`. RLS guarantees isolation so no leak, but it deviates from the defensive pattern used everywhere else.
- **Fix**: Add `.eq("user_id", user.id)` to the products query chain.
- **Decision**: FIXED — filter added to products query in index.astro (da29929)

### F8 — New routes return 401; canonical route redirects to /auth/signin

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: All new API routes (checkoff, unlist, listing, PATCH)
- **Detail**: The canonical `src/pages/api/products/[id].ts:10` redirects to `/auth/signin` on missing user. New fetch-driven routes return `new Response("Unauthorized", { status: 401 })`. The 401 behaviour is actually more correct for fetch-called APIs, but the inconsistency should be documented.
- **Fix**: No immediate action; document the preferred pattern for fetch-driven API routes in CLAUDE.md.
- **Decision**: FIXED — fetch-driven 401 pattern documented in CLAUDE.md (da29929)
