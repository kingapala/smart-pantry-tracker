<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Inventory Expiry Highlighting and Sort

- **Plan**: `context/changes/inventory-expiry-and-sort/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-05
- **Verdict**: REVISE
- **Findings**: 0 critical | 1 warning | 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Hover state washes out expiry row color on mouse-over

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Row expiry class (Changes Required §3)
- **Detail**: The plan preserves `hover:bg-white/5` in the base `<tr>` class string verbatim. When a row also has `bg-red-500/10` or `bg-amber-500/10`, hovering adds a semi-transparent white overlay on top of the colored background, diluting the urgency signal. `tailwind-merge` does NOT drop `hover:bg-white/5` when a non-hover `bg-*` class is present — they are different variants and both fire. Verified against the actual `<tr>` class at `src/pages/inventory/index.astro:90`.
- **Fix**: Remove `hover:bg-white/5` from the base string and make the hover variant conditional alongside the background. Update Phase 2 §3 Contract to specify this structure:

  ```
  cn(
    "border-b border-white/5 last:border-0",
    isExpired
      ? "bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
      : isExpiringSoon
        ? "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
        : "hover:bg-white/5"
  )
  ```
- **Decision**: FIXED

---

### F2 — Critical Implementation Details has two incorrect technical claims

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details (both bullet points)
- **Detail**:
  - **Date comparison claim**: "Do not use `new Date(expiry_date) <= new Date(nowUTC())` — this compares midnight-UTC against mid-day, giving wrong results depending on request time." This is factually incorrect: `new Date("YYYY-MM-DD")` parses as midnight UTC per ECMAScript spec, so `midnight <= any-time-today` is always `true` — the comparison is safe all day. The real bug is in the research doc (`research.md:46`): `new Date(product.expiry_date) < nowUTC()` passes a string as the right operand; JS coerces it via `ToNumber("2026-06-05T...")` → `NaN`; `number < NaN` always returns `false`. That snippet is a silent always-false bug. The plan correctly avoids this pattern, just with wrong stated reasoning.
  - **Supabase builder claim**: "The query builder is immutable — each chained method returns a new builder." Incorrect. Verified in `node_modules/@supabase/postgrest-js`: `.order()` mutates `this.url.searchParams` in-place and returns `this`. The danger is mutation — reusing a base variable after calling `.order()` on it taints the second query. The prescription (two full chains) is still correct.
- **Fix**: Replace both bullet points with accurate reasoning:
  - Date bullet: "Avoid the research doc's pattern `new Date(expiry_date) < nowUTC()` — `nowUTC()` returns a string; comparing a Date to a string coerces to NaN and silently returns false. ISO string comparison is simpler and unambiguous."
  - Supabase bullet: "`.order()` mutates the builder's URL in-place; reusing a base variable after calling `.order()` on it taints the second query with the first sort. Write two full chains to avoid shared mutation."
- **Decision**: FIXED

---

### F3 — `cn()` + `class={...}` introduces a new pattern to `.astro` files

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Row expiry class (Changes Required §3)
- **Detail**: No `.astro` file in this codebase currently uses `class={...}` or `cn()`. The only existing dynamic class binding in `.astro` files is `class:list` at `src/components/Banner.astro:11`. The plan introduces both together for the first time. `cn()` is the right choice (not `class:list`) because `tailwind-merge` semantics are needed to correctly resolve the conflicting `hover:` variants from F1. `class:list` would apply all listed classes without merging, producing the same hover bleed problem. This is a heads-up for the implementer, not a bug.
- **Fix**: Add one sentence to Phase 2 §3 Contract: "Use `class={cn(...)}` syntax — `class:list` is the Astro-native alternative but does not run `tailwind-merge` and would not resolve conflicting `hover:` variants correctly."
- **Decision**: FIXED
