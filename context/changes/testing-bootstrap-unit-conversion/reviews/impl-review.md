<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Bootstrap Test Runner + Unit-Conversion Correctness

- **Plan**: context/changes/testing-bootstrap-unit-conversion/plan.md
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-06-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Phase 3 commit bundles unrelated 10x-toolkit framework changes

- **Severity**: WARNING
- **Impact**: LOW — quick decision; already committed at your explicit choice
- **Dimension**: Scope Discipline
- **Location**: commits `3eeb786`, `d441383` (15 files total beyond the planned 2)
- **Detail**: The Phase 3 commit (`3eeb786`) and epilogue commit (`d441383`) bundle the planned `context/foundation/test-plan.md` / `plan.md` edits together with 13 unrelated pre-existing dirty/untracked files: `.claude/.10x-cli-manifest.json`, 8 `.claude/skills/*/SKILL.md` updates, 2 new skill folders (`10x-tdd`, `10x-test-plan`), `CLAUDE.md`, and `.claude/prompts/m3l2-ad-hoc-testing.md`. These are 10x-toolkit framework files unrelated to "update test-plan cookbook" — they were dirty from session start and got swept in via the "Stage all" choice in the dirty-paths prompt.
- **Fix**: No action needed — already committed at your explicit choice. For future phases, prefer "stage only the planned set" so toolkit/framework upgrades land in their own descriptively-named commit, keeping this change's history bisectable.
- **Decision**: FIXED (acknowledged — no code/history change; user confirmed "Stage all" was intentional)

### F2 — New validation gate changes phantom-success behavior for a non-existent product ID + unrecognized unit

- **Severity**: OBSERVATION
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Safety & Quality
- **Location**: src/pages/api/products/[id].ts:33-53
- **Detail**: When `id` doesn't match any row owned by the user, `currentResult.data` is `null`, so `currentUnit` defaults to `""`. If the submitted `unit` is non-empty but unrecognized, `validateProductInput` now returns `422` instead of falling through to the pre-existing "phantom success" `204` (0 rows updated). The plan explicitly deferred adding a 404 for non-existent/foreign product IDs ("pre-existing phantom success ... unrelated to Risk #6"), but this narrow side effect of the new validation gate on that same edge case wasn't called out.
- **Fix**: No action needed for this phase — narrow edge case (forged/stale product ID + unrecognized unit), no security or data-corruption impact, and consistent with the plan's explicit decision to leave 404 handling out of scope. Worth a one-line note in a future 404-handling pass.
- **Decision**: FIXED (acknowledged — no code change; consistent with plan's deferred-404 decision, flagged for a future 404-handling pass)

## Supporting evidence

**Plan Adherence (Agent 1)**: All 11 file-level contracts across Phases 1-3 verified MATCH — `vitest.config.ts`, `package.json` (vitest `^3.2.4` devDep + `test`/`test:watch` scripts, compatible with `vite ^7.3.2` override), `.github/workflows/ci.yml` (`npm run test` step correctly placed between lint and build), `src/lib/units.test.ts` (all required cases incl. round-trips, incompatible/unknown units, count passthrough, whitespace edge case, case-insensitivity), `src/lib/units.ts` (`isKnownUnit`), `src/lib/validation.ts` (`validateProductInput` with exact contract signature/status codes), `src/pages/api/products/[id].ts` PUT (SELECT-then-validate-then-UPDATE wired as specified), `src/lib/validation.test.ts` (all 6 required branches), `units.test.ts` `isKnownUnit` cases, and both `test-plan.md` §6.1/§6.5 cookbook edits. "What We're NOT Doing" list fully respected — no changes to `products/index.ts`, `shopping-list-items/index.ts`, `unitsCompatible`, name/expiry/add_to_list validation, or Playwright/Container API.

**Safety & Pattern (Agent 2)**: No CRITICAL or blocking findings. Auth/RLS boundaries (`.eq("user_id", user.id)`) intact around the new SELECT and UPDATE. `validation.ts`/`units.ts` and their tests are pure, dependency-free, and follow §6.1's documented pattern. `vitest.config.ts` and the CI step match documented Astro conventions with no env-var additions. Two pre-existing items noted but explicitly out of scope per the plan: the `redirect("/auth/signin")` vs. 401 inconsistency on this route (deferred to Risk #4 / §3 Phase 3), and the missing-product 404 (deferred, see F2 above).

**Success Criteria**: All automated checks pass —

- `npm run test`: 30/30 tests pass (`units.test.ts` 20, `validation.test.ts` 10)
- `npm run lint`: 0 errors (2 pre-existing warnings in `inventory/index.astro`, untouched by this change)
- `npx astro build` (with `SUPABASE_URL`/`SUPABASE_KEY`): builds and typechecks cleanly (pre-existing CSS-minify and sitemap warnings, unrelated to this change)
- `npx prettier --check context/foundation/test-plan.md`: formatted, no diff

All Manual Progress rows (1.5-1.6, 2.4-2.8, 3.2) are `[x]` and confirmed by the user across sessions — no rubber-stamping detected.
