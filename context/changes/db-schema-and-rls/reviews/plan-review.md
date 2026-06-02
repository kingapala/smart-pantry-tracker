<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Database Schema, RLS, and Inventory CRUD

- **Plan**: `context/changes/db-schema-and-rls/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-02
- **Verdict**: REVISE → SOUND (after triage fixes)
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| End-State Alignment  | PASS    |
| Lean Execution       | PASS    |
| Architectural Fitness| FAIL    |
| Blind Spots          | WARNING |
| Plan Completeness    | WARNING |

## Grounding

6/6 existing paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — HTML forms can only GET/POST; edit PUT and delete POST→DELETE were unresolved

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 (API contracts) + Phase 3 (edit form + delete dialog)
- **Detail**: `<form method="put">` is treated as GET by browsers; `[id].ts` had no POST handler for the delete form submission. Both would silently fail.
- **Fix A ⭐ Applied**: Use fetch() for both — DeleteConfirmDialog calls `fetch(DELETE)`, edit form uses an inline `<script>` to intercept submit and issue `fetch(PUT)`. Keeps REST handlers clean.
- **Decision**: FIXED via Fix A

### F2 — formatDate() returns ISO 8601, not YYYY-MM-DD; date input renders blank

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Change #3 — edit product page
- **Detail**: `formatDate()` returns `2026-05-28T00:00:00.000Z`, not `YYYY-MM-DD`. HTML `<input type="date">` requires exactly `YYYY-MM-DD`.
- **Fix**: Use the raw Supabase value directly (already `YYYY-MM-DD` for a `date` column). Resolved as a side-effect of the F1 fix.
- **Decision**: FIXED (side-effect of F1 fix)

### F3 — createClient() calling convention absent from API route contracts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Changes #1 and #2
- **Detail**: `createClient()` requires `(context.request.headers, context.cookies)`. Contracts only said "null-checks createClient()".
- **Fix**: Added `createClient(context.request.headers, context.cookies)` to both API route contracts.
- **Decision**: FIXED

### F4 — Error redirects missing encodeURIComponent()

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Changes #1 and #2
- **Detail**: Canonical `signin.ts` uses `encodeURIComponent()`. Plan showed `?error=<message>` without encoding — breaks on spaces/special chars.
- **Fix**: Added `encodeURIComponent(error.message)` to both API route error redirect contracts.
- **Decision**: FIXED
