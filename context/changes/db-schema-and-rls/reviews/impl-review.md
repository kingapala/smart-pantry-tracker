<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Database Schema + RLS

- **Plan**: context/changes/db-schema-and-rls/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  1 warning  2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Seed missing add_to_list=false + below-threshold scenario

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql:24
- **Detail**: The plan's row 5 ("above-threshold + add_to_list=false") is correctly implemented: Olive Oil has quantity=0.80 > min_threshold=0.50. However, the CLAUDE.md business rule is: "a product appears on the shopping list when current_quantity < min_threshold AND addToList = true". The flag is a HARD GATE — not just a filter on top of a quantity check. The seed has no row where add_to_list=false AND quantity < min_threshold. A future implementation bug that treats the flag as merely advisory when stock is critically low would pass all local testing undetected.
- **Fix**: Add a 6th seed row (e.g. "Salt", quantity=0, min_threshold=1, add_to_list=false) with a comment "Below threshold but excluded — add_to_list is the hard gate regardless of stock level."
  - Strength: Directly encodes the CLAUDE.md business rule as a testable row; protects S-02 and S-04 implementors from silently shipping a regression.
  - Tradeoff: Minor — one extra INSERT, ~4 lines. Harmless at runtime.
  - Confidence: HIGH — the CLAUDE.md rule is unambiguous; this row is the canonical test for it.
  - Blind spot: None significant.
- **Decision**: FIXED — added Salt row (quantity=0, min_threshold=200, add_to_list=false) to supabase/seed.sql

### F2 — Partial index opportunity for shopping list query

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260528000000_products_schema.sql:13
- **Detail**: The user_id index is present and correct for RLS row-scoping. The primary read path (shopping list) filters: `WHERE user_id = auth.uid() AND add_to_list = true AND quantity < min_threshold`. A single-column index on user_id fetches all of a user's products and filters in memory. Per-user datasets will be small (pantry items), so this is not a problem now, but the opportunity exists to narrow scans further with a partial index.
- **Fix**: No action now. If query profiling later shows slow list loads, add: `create index on public.products (user_id) where add_to_list = true`
- **Decision**: FIXED — created supabase/migrations/20260602000000_products_add_to_list_index.sql

### F3 — supabase/.temp/ not gitignored

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .gitignore
- **Detail**: `.supabase/` is correctly gitignored (line 31). The Supabase CLI also creates `supabase/.temp/` during local operations. No `supabase/.gitignore` file exists in this repo. If `.temp/` materialises locally (e.g. during `supabase start`), it could be accidentally committed.
- **Fix**: Add `supabase/.temp/` to `.gitignore` alongside the `.supabase/` entry.
- **Decision**: SKIPPED
