<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Expired product highlighting and session-persistent expiry sort

- **Plan**: context/changes/inventory-expiry-and-sort/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-06-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Supporting evidence

- All 7 planned changes (3 in Phase 1, 4 in Phase 2) verified present and correct against their literal contracts, including: independent ternary query chains (no shared-builder `.order()` mutation), `nullsFirst: false`, ISO-string date comparisons, and literal Tailwind class strings for JIT scanning.
- Security: `sortParam` is allowlisted with strict `=== "expiry"` before any use — no injection/XSS surface; never interpolated into HTML/attributes/query strings.
- Data safety: confirmed `expiry_date` write paths (`src/pages/api/products/index.ts:19`, `[id].ts:28`) normalize empty strings to `null`, so the `!== null` checks can never be bypassed by `""`.
- Lessons compliance ([[lessons]]): `createClient()` null-check intact; all date math uses UTC-safe methods (`nowUTC`, `setUTCDate`/`getUTCDate`, `toISOString`) — no `getDate()`/`toLocaleDateString()` drift.
- Performance: `todayStr`/`soonStr` computed once outside the row-mapping loop, reused per row. No N+1 patterns.
- `npm run lint` and `npx astro sync` both pass with no new errors (only pre-existing repo-wide CRLF noise and the two `astro/prefer-class-list-directive` warnings the plan explicitly anticipated by mandating `cn()` over `class:list`).
- All Manual Progress checkboxes (1.3–1.8, 2.3–2.9) are checked with commit SHAs and have observable evidence in the diff; user separately confirmed manual testing passed ("it works OK").

## Findings

### F1 — Row base-class string reorganized vs. plan's literal text

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/inventory/index.astro:102
- **Detail**: Plan specified base classes `"border-b border-white/5 last:border-0"` applied unconditionally, with branches layering border-color overrides via twMerge dedup. Actual code uses base `"border-b last:border-0"` and places `border-white/5` only in the "neither" branch. Rendered output is byte-identical per row (twMerge would have deduped `border-white/5` against `border-red-500/20` / `border-amber-500/20` anyway) — a behaviorally-neutral restructuring, not a bug.
- **Fix**: No action needed — output matches spec; arguably cleaner this way (avoids relying on twMerge dedup to resolve a redundant declaration).
- **Decision**: ACCEPTED — no action needed (verified behaviorally equivalent)

### F2 — Cosmetic styling on header link beyond plan's literal text contract

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/inventory/index.astro:90-94
- **Detail**: Plan specified link text only ("Expiry ↑" / "×" with `aria-label`). Implementation adds `hover:underline` to the sort link and `ml-1 opacity-60 hover:opacity-100` to the reset link — presentational polish giving the reset "×" a distinct hover affordance, consistent with the page's existing hover-state conventions.
- **Fix**: No action needed — beneficial UX polish within the spirit of the plan; not scope creep in any functional sense.
- **Decision**: ACCEPTED — no action needed (beneficial polish, not scope creep)
