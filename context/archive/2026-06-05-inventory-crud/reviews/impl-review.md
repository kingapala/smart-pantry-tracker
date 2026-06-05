<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Inventory CRUD — Implementation Plan

- **Plan**: `context/changes/inventory-crud/plan.md`
- **Scope**: All phases (3 of 3)
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Grounding

Drift: 5/6 changes MATCH, 1 OBSERVATION (dashboard pt-4). Automated: lint 0 errors ✅, astro check 0 errors ✅. Manual: all 13 items confirmed [x] by human.

## Findings

### F1 — Duplicate sign-out button on Dashboard

- **Severity**: ⚠️ WARNING [introduced by this change]
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/dashboard.astro:27-34`
- **Detail**: Phase 1 added Topbar to dashboard.astro. Topbar already renders a sign-out `<form>`. The existing inline sign-out form in the dashboard card was left in place — two sign-out buttons on the same page. No other inventory page has this duplication.
- **Fix**: Remove the standalone sign-out `<form>` block from `dashboard.astro` (lines 27–34). Topbar covers it.
- **Decision**: FIXED — removed sign-out form from dashboard.astro (Topbar covers it)

### F2 — Inventory list query silently discards read errors

- **Severity**: ⚠️ WARNING [pre-existing]
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/inventory/index.astro:21`
- **Detail**: `const { data } = await supabase.from("products").select(...)` — the `error` field is destructured away. When the query fails, `data` is null and the page renders silently as empty with no user feedback.
- **Fix A ⭐ Recommended**: Destructure and redirect on read error — `const { data, error: listError } = await ...`; if listError, redirect to `/inventory?error=${encodeURIComponent(listError.message)}`.
  - Strength: Consistent with write-path error handling; user sees a real message.
  - Tradeoff: Redirects away from the page.
  - Confidence: HIGH — identical pattern used in API routes.
  - Blind spot: None significant.
- **Fix B**: Log and render gracefully — expose `listError` to the template, render the existing error banner inline without redirecting.
  - Strength: User stays on page; message visible inline.
  - Tradeoff: More template logic.
  - Confidence: MED — depends on banner rendering in this layout.
  - Blind spot: Visual verification of banner position not done.
- **Decision**: FIXED via Fix A — destructure listError, redirect on query failure

### F3 — Error URL param appended without re-encoding on client

- **Severity**: ⚠️ WARNING [pre-existing]
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/inventory/index.astro:184`, `src/pages/inventory/[id]/edit.astro:163`
- **Detail**: Client fetch handlers do `window.location.href = \`/inventory?error=${errorMsg}\`` without wrapping in `encodeURIComponent`. API returns an already-encoded string, so the current path works — but unencoded `&`/`#` in any error body would corrupt the URL. `decodeURIComponent` on the receiving page also throws a URIError on malformed percent-sequences.
- **Fix**: Wrap before appending: `encodeURIComponent(errorMsg)`. Add try/catch fallback to `decodeURIComponent(error)` on each receiving page.
- **Decision**: FIXED — safe try/catch decoder in all three page frontmatter; encodeURIComponent applied in both client fetch scripts

### F4 — Dashboard outer div has `pt-4` not in Phase 1 contract

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/dashboard.astro:9`
- **Detail**: Phase 1 Change 4 specified `flex flex-col min-h-screen`. Implementation applied `flex flex-col min-h-screen pt-4`, consistent with the Critical Implementation Details which added `pt-4` to all form pages. Functionally correct — minor internal plan inconsistency.
- **Fix**: None required. Accepted minor drift.
- **Decision**: FIXED — removed pt-4 from dashboard.astro outer div to match plan contract

### F5 — Topbar "Dashboard" link is self-referential on /dashboard

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/Topbar.astro:13`
- **Detail**: Adding Topbar to dashboard.astro means the "Dashboard" link points to the current page. Screen readers announce it as a nav link to the same page. Pre-existing Topbar design, surfaced by this addition.
- **Fix**: Out of scope for this slice — note for Topbar polish in a future change.
- **Decision**: SKIPPED — deferred to a future Topbar polish change
