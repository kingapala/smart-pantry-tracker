# Bootstrap Test Runner & Unit-Conversion Correctness — Plan Brief

> Full plan: `context/changes/testing-bootstrap-unit-conversion/plan.md`
> Research: `context/changes/testing-bootstrap-unit-conversion/research.md`

## What & Why

Rollout Phase 1 of `context/foundation/test-plan.md`: stand up Vitest (the
project's first test runner) and prove two risks are handled correctly —
unit-conversion math on shopping-list checkoff (Risk #1) and quantity/unit
input validation on the "product edit" API route (Risk #6). Research
confirmed Risk #1 is already correct (test-only), but found Risk #6's named
"product edit" route (`products/[id].ts` PUT) has zero validation — a
confirmed live bug, not a hypothetical.

## Starting Point

No test infrastructure exists anywhere in the repo (no Vitest, no test files,
no config). `src/lib/units.ts`'s `convertUnit()` is a correct, pure conversion
function already used by both checkoff endpoints (422 on bad units).
`products/[id].ts` PUT writes `quantity`/`unit`/`min_threshold` straight to
Supabase with no checks: negative/non-numeric quantity → raw 500 (DB `CHECK`
violation); unrecognized unit → silently persisted, permanently breaking
future cross-unit checkoffs on that product.

## Desired End State

Vitest runs via `npm run test`, locally and in CI, with zero env-var setup
needed (pure-function tests only). `convertUnit()` has full unit coverage
proving real-world conversion correctness and round-trip consistency.
`products/[id].ts` PUT rejects invalid quantity/min_threshold (`<= 0` → 400)
and unrecognized units (unless unchanged from the product's current unit) with
a 422 — before any database write — and a new `validateProductInput()` helper
has full unit coverage. The test-plan's §6.1 cookbook documents this pattern
for future phases.

## Key Decisions Made

| Decision                                                               | Choice                                                         | Why (1 sentence)                                                                                                 | Source |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| Unit validation on product-edit                                        | UNIT_MAP membership OR unchanged from current unit             | Closes the "garbage unit" corruption case without breaking existing products whose stored unit predates UNIT_MAP | Plan   |
| Quantity / min_threshold floor on edit                                 | `> 0` (zero rejected)                                          | Byte-identical to the existing checkoff guard (`da29929`) — simplest, most consistent rule                       | Plan   |
| POST creation routes (products/index.ts, shopping-list-items/index.ts) | Deferred to follow-up                                          | Not named in Risk #6; keeps this phase scoped to what §3 committed to                                            | Plan   |
| Risk #6 test layer                                                     | Extract `validateProductInput()` into `src/lib/`, unit-test it | Stays inside §3 Phase 1's "unit" scope — no Astro Container API / env-shim needed                                | Plan   |
| Risk #1 integration test (cross-unit checkoff)                         | Deferred to §3 Phase 2                                         | Phase 2 already builds the Supabase-backed integration harness; avoids building it twice                         | Plan   |
| Test file layout                                                       | Co-located `*.test.ts` next to source                          | Vitest's default convention via `getViteConfig()` — zero extra config                                            | Plan   |

## Scope

**In scope:**

- Vitest bootstrap (`vitest.config.ts`, `package.json` script, CI step)
- `src/lib/units.test.ts` — full `convertUnit()` coverage + new `isKnownUnit()`
  export and its tests
- `src/lib/validation.ts` + `validation.test.ts` — new `validateProductInput()`
  helper, fully tested
- `products/[id].ts` PUT — wired to validate before writing
- `test-plan.md` §6.1 / §6.5 cookbook updates

**Out of scope:**

- `products/index.ts` / `shopping-list-items/index.ts` POST validation
  (follow-up risk)
- Risk #1 integration tests (checkoff via Container API) — §3 Phase 2
- `unitsCompatible()` (dead code, unused)
- `products/[id].ts` PUT/DELETE auth redirect-vs-401 (Risk #4 / §3 Phase 3)
- Playwright/e2e (§3 Phase 4)

## Architecture / Approach

Two new pure modules in `src/lib/` (`units.ts` gains `isKnownUnit()`; new
`validation.ts` exports `validateProductInput()`) keep all of Phase 1's
testable logic dependency-free — no Astro context, no Supabase, no env vars.
`products/[id].ts` PUT gains one extra `SELECT` (current unit, by primary key)
before its existing `UPDATE`, then calls the validator and short-circuits on
failure. Vitest is wired via Astro's official `getViteConfig()` helper, which
automatically picks up the project's `@/` path alias and Vite config.

## Phases at a Glance

| Phase                               | What it delivers                                                         | Key risk                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1. Bootstrap Vitest + Risk #1 tests | Working `npm run test` (local + CI) and full `convertUnit()` coverage    | Vitest/vite-7 version compatibility (`overrides` in package.json)                                         |
| 2. Close Risk #6 product-edit gap   | `validateProductInput()` + `isKnownUnit()`, wired into PUT, fully tested | New SELECT changes PUT's query shape slightly; floor change blocks `quantity`/`min_threshold = 0` on edit |
| 3. Cookbook update                  | §6.1 / §6.5 of `test-plan.md` filled in                                  | None                                                                                                      |

**Prerequisites:** None — clean slate.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Setting `quantity` or `min_threshold` to exactly `0` via the product-edit
  form is now rejected (400) — previously allowed at the DB level. This is the
  chosen floor (`> 0`, matching the checkoff precedent); if a real user
  workflow relies on editing either to `0`, that would need a follow-up.
- The "unchanged unit" exemption assumes legacy non-`UNIT_MAP` units are rare;
  such products remain editable (other fields) but can't have their unit
  "fixed" to a recognized value via this exemption alone — they'd just pick
  any `UNIT_MAP` unit directly, which is allowed.
- `products/index.ts` / `shopping-list-items/index.ts` POST share Risk #6's
  validation gap but aren't tracked in `test-plan.md` §2 yet — worth raising
  as a new risk in a future `--refresh`.

## Success Criteria (Summary)

- `npm run test` passes locally and in CI with zero new env-var requirements.
- A negative/zero/non-numeric quantity or min_threshold, or an unrecognized
  unit (unless unchanged), submitted to `products/[id].ts` PUT returns a
  clean 4xx with no database write.
- `convertUnit()`'s correctness and round-trip behavior is proven against
  real-world unit-conversion facts, not implementation-derived values.
