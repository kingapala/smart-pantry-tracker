# Shopping List — Plan Brief

> Full plan: `context/changes/shopping-list/plan.md`
> Research: `context/changes/shopping-list/research.md`

## What & Why

The Shopping List feature has well-architected data flow but significant gaps: missing test coverage for CRUD operations (~31 LOC untested) and E2E flow, duplicated checkoff logic across 2 endpoints (~95% similar, no duplication), and incomplete RLS security (UPDATE policy missing). These gaps create maintenance risk and data integrity exposure. This plan adds tests, refactors duplication, and hardens security.

## Starting Point

The Shopping List feature is production-ready for checkoff (core use case) with 11 unit tests + 2 integration tests for unit conversion. However, E2E flow is untested, CRUD operations lack integration tests, and checkoff logic is duplicated across `shopping-list-items/[id]/checkoff.ts` and `products/[id]/checkoff.ts` with a subtle null-check difference. The UPDATE RLS policy is missing from the schema.

## Desired End State

After this plan, Shopping List feature is fully tested (E2E + CRUD) and maintainable:
- **Unified checkoff logic** in `src/lib/checkoff.ts`; both endpoints import and use it
- **E2E tests** for checkoff flow (no conversion, with conversion, error cases, pantry items)
- **CRUD integration tests** for create/update/delete manual items
- **Complete RLS** with UPDATE policy added; schema aligns with app-level checks
- **Clean codebase**: dead code (unitsCompatible, roundTo2) removed; precision policy documented

## Key Decisions Made

| Decision                       | Choice                            | Why (1 sentence)                           | Source           |
| ------------------------------ | --------------------------------- | ------------------------------------------ | ---------------- |
| Test coverage priority         | E2E first, then CRUD              | Validates entire feature; CRUD protects data integrity | Plan |
| Duplicated checkoff logic      | Refactor into shared utility      | Single source of truth; fixes apply to both endpoints immediately | Plan |
| Unused functions (unitsCompatible, roundTo2) | Remove                | Verified unused via grep; reduces cognitive load | Plan |
| Missing UPDATE RLS policy      | Add now                           | Defense-in-depth; closes auth gap | Plan |
| Precision tolerance            | Document ±0.0001 policy           | Clarifies rounding behavior; prevents future surprises | Plan |
| E2E test scope                 | All scenarios (happy + error)      | Full coverage: no conversion, with conversion, error cases | Plan |

## Scope

**In scope:**
- Extract checkoff logic to `src/lib/checkoff.ts`; refactor both endpoints to use it
- Remove dead code (unitsCompatible, roundTo2)
- Document precision tolerance in convertUnit()
- Add E2E Playwright tests for checkoff flow (4 test cases)
- Add CRUD integration tests (7 test cases)
- Add UPDATE RLS policy via migration

**Out of scope:**
- Adding monitoring/alerting for precision loss (post-release task)
- Property-based testing for unit conversion (Phase 2 future work)
- Refactoring auth context into service layer (separate initiative)
- Performance benchmarking (no evidence of bottleneck)
- Changing checkoff UX or adding confirmation dialogs

## Architecture / Approach

**Layered Testing Strategy**: Refactor first (clean foundation) → E2E tests (highest-risk path) → CRUD tests (data integrity) → RLS policy (defense-in-depth).

**Code Organization**:
- Extract checkoff business logic to `src/lib/checkoff.ts` (utility pattern, similar to units.ts)
- Keep API route handlers thin; delegate to utilities
- Test utilities in isolation (unit tests) + via API (integration tests)

**Security**: Add UPDATE RLS policy to shopping_list_items for defense-in-depth; permissive (matches app-level checks), non-breaking.

## Phases at a Glance

| Phase     | What it delivers       | Key risk                  |
| --------- | ---------------------- | ------------------------- |
| 1. Refactoring & Tech Debt | Shared checkoff utility, dead code removal, precision docs | Refactoring might miss null-check edge case if not careful |
| 2. E2E Tests | Playwright tests for checkoff (4 scenarios) | Test maintenance if UI changes; selector brittleness |
| 3. CRUD Tests | Integration tests for create/update/delete (7 cases) | Test setup complexity with multiple test users |
| 4. Security | UPDATE RLS policy added | Migration risk if not tested locally first |

**Prerequisites:** 
- Checkoff feature functional in dev environment
- Playwright configured for E2E tests (already present: e2e/seed.spec.ts)
- Supabase local dev environment for migration testing

**Estimated effort:** ~8-10 hours across 4 phases (2-3 per phase), can be spread across 2-3 development sessions

## Open Risks & Assumptions

- **Playwright selector brittleness**: If shopping list UI changes, E2E test selectors may break. Mitigation: use role-based selectors (getByRole, getByLabel) per Playwright best practices.
- **Test data cleanup**: Concurrent E2E tests need unique IDs to avoid collisions. Mitigation: use timestamp + random suffix; verify afterEach() cleanup runs.
- **Null-check difference in checkoff logic**: shopping-list version assumes `enteredUnit` exists; products version has guard. Refactoring unifies this but must verify both pathways work after extraction.
- **Supabase migration ordering**: UPDATE policy must be applied after code is deployed (non-breaking, but verify locally first).
- **Precision tolerance acceptance**: Document says ±0.0001 is acceptable; if users report precision loss, may need higher-precision rounding (Phase 2 future work).

## Success Criteria (Summary)

- All tests pass (automated + manual): E2E flow validates checkoff, CRUD tests pass, RLS policy applied
- Checkoff logic unified: Both endpoints import from `src/lib/checkoff.ts`, no duplication
- Codebase clean: Dead code removed, precision policy documented, no TypeScript errors
- Manual flow tested: Browser test matches E2E scenarios (add item → checkoff → verify inventory)
