# Bootstrap Test Runner + Unit-Conversion Correctness Implementation Plan

## Overview

Stand up Vitest as this project's first test runner, then use it to (1) prove
`src/lib/units.ts`'s `convertUnit()` is mathematically correct and
non-corrupting (Risk #1), and (2) close a confirmed live validation gap on
`src/pages/api/products/[id].ts` PUT — the "product edit" route Risk #6 names
— where negative/non-numeric quantities raise raw 500s and unrecognized units
are silently persisted, permanently corrupting future cross-unit checkoffs.

## Current State Analysis

- **No test infrastructure exists anywhere**: no Vitest, no Playwright, no
  `*.test.*`/`*.spec.*` files, no test config. `package.json` has no `test`
  script.
- **Risk #1 is already correctly implemented**: `convertUnit()`
  (`src/lib/units.ts:78-92`) is a pure, dependency-free function. Both
  checkoff endpoints already call it and return `422` on incompatible/unknown
  units, rounding to 4 decimals. Nothing to fix in production code.
- **Risk #6 has a confirmed, currently-live gap**: 4 of 7 quantity-accepting
  routes already have an `isNaN(x) || x <= 0 → 400` guard (added in the prior
  `da29929` fix). `products/[id].ts` PUT (`src/pages/api/products/[id].ts:24-49`)
  has none — negative/non-numeric `quantity`/`min_threshold` hit the DB
  `CHECK (... >= 0)` constraint and return a raw `500`; an unrecognized `unit`
  string is written as-is (the column is `text not null`, no format check),
  permanently breaking `convertUnit` for every future checkoff on that
  product (`422 "Cannot convert ... to <garbage>"`).
- **`UNIT_MAP` is module-private** (`src/lib/units.ts:8`, no `export`) — only
  `convertUnit` and `unitsCompatible` are exported. A new validator needs a
  dedicated exported predicate, not direct map access.
- **`products/[id].ts` PUT does not currently read the row before writing** —
  it goes straight from parsed form data to `.update(...)`. The chosen
  unit-validation rule (recognized unit OR unchanged from current) requires
  one new `SELECT` of the current `unit`.

## Desired End State

- `npm run test` (Vitest) runs locally and in CI with zero new environment
  variables, since Phase 1's tests are pure functions.
- `src/lib/units.test.ts` proves `convertUnit()`'s real-world correctness,
  round-trip consistency, and rejection of incompatible/unknown unit pairs.
- `src/pages/api/products/[id].ts` PUT rejects `quantity`/`min_threshold <= 0`
  or non-numeric values with `400`, and rejects an unrecognized `unit` (unless
  it's unchanged from the product's current unit) with `422` — in both cases
  with **no database write**.
- `src/lib/validation.ts`'s `validateProductInput()` has full unit coverage of
  every branch above.
- `context/foundation/test-plan.md` §6.1 documents the unit-test pattern this
  phase establishes; §6.5 records what the phase taught.

### Key Discoveries:

- `src/lib/units.ts:78-92` (`convertUnit`) — pure, zero imports, ideal first
  test target; smoke-tests the Vitest bootstrap itself.
- `src/pages/api/products/[id]/checkoff.ts:19-21` — the `isNaN(x) || x <= 0 →
400` pattern to generalize into a shared validator.
- `src/pages/api/products/[id].ts:32-43` — the `.update(...)` call that needs
  a validation gate in front of it, plus a new pre-read of the current `unit`.
- `astro.config.mjs` + `tsconfig.json` (`@/* -> ./src/*`) — Vitest via
  `getViteConfig()` from `astro/config` (confirmed current via Context7
  `/withastro/docs`) picks up both automatically; no separate alias config
  needed.
- `package.json:57-59` — `"overrides": { "vite": "^7.3.2" }` — the chosen
  `vitest` version must be compatible with Vite 7.

## What We're NOT Doing

- Not adding validation to `products/index.ts` POST or
  `shopping-list-items/index.ts` POST — same gap class as Risk #6, but not
  named by it; deferred to a follow-up risk.
- Not writing integration tests for Risk #1's cross-unit checkoff cases
  (Astro Container API) — deferred to `test-plan.md` §3 Phase 2, which already
  builds a Supabase-backed integration harness for the same area.
- Not testing `unitsCompatible()` — confirmed dead code (impl-review F5),
  unused, no signal to gain.
- Not touching `products/[id].ts` PUT/DELETE's redirect-vs-401 auth behavior
  — that's Risk #4 / §3 Phase 3 territory (research Open Question 2).
- Not adding a 404 for edits to a non-existent/foreign product ID — pre-existing
  "phantom success" (0 rows updated, still 204), unrelated to Risk #6.
- Not changing validation for `name`, `expiry_date`, or `add_to_list` — none
  of these have DB constraints that produce the 500/corruption failure modes
  Risk #6 describes.
- Not introducing Playwright/e2e or Astro Container API — that's §3 Phase 4
  and (for Risk #1) §3 Phase 2 respectively.

## Implementation Approach

Phase 1 stands up Vitest using Astro's official `getViteConfig()` helper,
wires a `test` npm script and a CI step, and immediately exercises the
bootstrap with a complete unit-test suite for `convertUnit()` — proving Risk
#1's "what would prove protection" criterion with zero production changes.

Phase 2 closes the confirmed Risk #6 gap on `products/[id].ts` PUT by
extracting the codebase's existing `isNaN(x) || x <= 0 → 400` pattern into a
new pure `validateProductInput()` helper, adding a companion `isKnownUnit()`
export to `units.ts`, and wiring the route to fetch the product's current unit
and validate before writing — turning today's raw-500/silent-corruption
failure modes into clean `400`/`422` responses with no write.

Phase 3 updates the test-plan cookbook so future rollout phases (and
`/10x-tdd`) have a concrete, working example of "add a unit test in this
project."

## Critical Implementation Details

**Oracle tolerance for imperial-unit conversions** (Phase 1): `UNIT_MAP`'s
imperial factors are rounded approximations of precise real-world constants
(e.g. `lb: 453.592` vs. the exact `453.59237` g/lb). A direct-conversion test
asserting against the precise textbook constant with a tight `1e-4` tolerance
can spuriously fail against `UNIT_MAP`'s intentionally-rounded value. Use
exact equality only for power-of-10 metric conversions (kg/g/mg, l/ml/cl/dl);
for imperial units, assert round-trip self-consistency with `closeTo(original,
1e-4)` (an internal property, independent of the specific factor values) or
use a looser tolerance (~`1e-3`) when comparing directly against a real-world
imperial constant.

**Quantity/min_threshold floor changes edit-time behavior** (Phase 2): with
the chosen `> 0` floor (matching the checkoff guard exactly), submitting
`quantity = 0` or `min_threshold = 0` via the product-edit form will now be
rejected with `400` — previously both succeeded at the DB level (`>= 0`). This
is a deliberate consequence of the chosen rule, not a bug to work around.

## Phase 1: Bootstrap Vitest and prove unit-conversion correctness (Risk #1)

### Overview

Add Vitest to the project (config, npm script, CI step) and write a full unit
test suite for `convertUnit()`. This phase has no application-behavior changes
— it proves the test runner works and that Risk #1's conversion math is
correct.

### Changes Required:

#### 1. Vitest configuration

**File**: `vitest.config.ts` (new, project root)

**Intent**: Wire Vitest into the existing Astro/Vite setup so tests resolve
the `@/` path alias and the project's TS config without duplicating
configuration.

**Contract**: Export `getViteConfig({ test: {} })` from `astro/config`, per
the current official Astro pattern:

```ts
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {},
});
```

#### 2. package.json — devDependency + scripts

**File**: `package.json`

**Intent**: Add `vitest` as a devDependency and expose a one-shot test command
for local use and CI.

**Contract**: Add `vitest` under `devDependencies` (a version compatible with
the existing `"overrides": { "vite": "^7.3.2" }`). Add a `"test": "vitest
run"` script for one-shot CI runs; optionally a `"test:watch": "vitest"`
script for local development.

#### 3. CI — wire the unit-test gate

**File**: `.github/workflows/ci.yml`

**Intent**: Enforce `npm run test` in CI, per `test-plan.md` §5 ("unit tests
... required after §3 Phase 1").

**Contract**: Add `- run: npm run test` as a new step immediately after the
existing `- run: npm run lint` step and before `- run: npm run build`. No new
env vars — Phase 1's tests are pure functions.

#### 4. Unit tests for `convertUnit()`

**File**: `src/lib/units.test.ts` (new)

**Intent**: Prove Risk #1's "what would prove protection" criterion —
cross-unit checkoff conversions are correct and round-trip, and
incompatible/unknown unit pairs are rejected (`null`) without corrupting data.
The oracle is real-world unit-conversion facts (e.g. 1 kg = 1000 g, 1 l = 1000
ml), not values copied out of `UNIT_MAP`.

**Contract**: Cover, at minimum:

- Direct conversions against real-world metric facts using exact equality
  (power-of-10 SI relationships, e.g. `convertUnit(2, "kg", "g") === 2000`).
- A→B→A round-trips for at least one mass pair and one volume pair, asserting
  `closeTo(original, 1e-4)` (matches production's `Math.round(x * 10000) /
10000` rounding) — see Critical Implementation Details for why this tolerance
  matters for imperial pairs.
- Incompatible categories return `null` (e.g. mass vs. volume).
- An unknown unit on either side (not a same-unit comparison) returns `null`.
- "count" category pairs (e.g. `pcs` ↔ `szt`) return the input value unchanged
  (identity passthrough).
- Same-unit short-circuit works even for units not in `UNIT_MAP` (e.g.
  `convertUnit(5, "bunch", "bunch") === 5`).
- The documented whitespace edge case: `convertUnit(1, "Fl  Oz", "ml") ===
null` — double internal space is current, accepted behavior, not a bug to fix
  here.
- Case-insensitivity (e.g. `convertUnit(1, "KG", "g") === 1000`).

### Success Criteria:

#### Automated Verification:

- [ ] `npx vitest run` passes, including all `src/lib/units.test.ts` cases
- [ ] `npm run test` (new script) runs the suite successfully
- [ ] `npm run lint` passes
- [ ] `npx astro build` typechecks and builds cleanly (with
      `SUPABASE_URL`/`SUPABASE_KEY` set per `CLAUDE.md`)

#### Manual Verification:

- [ ] A CI run (after push) shows the new `npm run test` step passing
- [ ] `npx vitest run --reporter=verbose` output reviewed to confirm test
      names clearly describe each conversion scenario

---

## Phase 2: Close the Risk #6 product-edit validation gap

### Overview

`products/[id].ts` PUT currently performs zero validation on `quantity`,
`unit`, or `min_threshold` before writing. This phase extracts the codebase's
existing `isNaN(x) || x <= 0 → 400` pattern into a reusable validator, adds
unit-recognition support, and wires the route to validate before writing.

### Changes Required:

#### 1. Export a unit-recognition helper

**File**: `src/lib/units.ts`

**Intent**: Give `validateProductInput()` a way to check "is this a unit
`convertUnit` knows about" without exporting `UNIT_MAP` itself
(module-private, `units.ts:8`).

**Contract**: Add `export function isKnownUnit(unit: string): boolean`,
normalizing via `.toLowerCase().trim()` exactly like `convertUnit` /
`unitsCompatible` do, then checking membership in `UNIT_MAP`.

#### 2. New shared product-input validator

**File**: `src/lib/validation.ts` (new)

**Intent**: Pure, dependency-free validator for the fields `products/[id].ts`
PUT writes. Encodes this phase's chosen rules: `quantity` and `min_threshold`
must be `> 0`; `unit` must either be recognized (`isKnownUnit`) or unchanged
from the product's current unit (case/whitespace-normalized), so existing
products with a legacy unrecognized unit aren't broken by unrelated edits.

**Contract**: `export function validateProductInput(input: { quantity:
number; unit: string; minThreshold: number; currentUnit: string }): { ok:
true } | { ok: false; status: number; message: string }`. Quantity /
`min_threshold` failures return `status: 400`; unit failures return `status:
422` (matching `convertUnit`'s existing 422 convention for unit problems).

#### 3. Wire the validator into `products/[id].ts` PUT

**File**: `src/pages/api/products/[id].ts`

**Intent**: Look up the product's current unit, validate the parsed form
input before writing, and short-circuit with the validator's status/message on
failure — so invalid input never reaches `.update(...)`.

**Contract**: Before the existing `.update(...)` call (currently lines
32-43), add a `.select("unit").eq("id", id).eq("user_id", user.id)
.maybeSingle()` query (on a Supabase `error`, return `500` with
`error.message`, matching the existing update-error pattern). Call
`validateProductInput({ quantity, unit, minThreshold, currentUnit: data?.unit
?? "" })`; on `!result.ok`, `return new Response(result.message, { status:
result.status })`. The existing `.update(...)` call and its error/204 handling
are otherwise unchanged.

#### 4. Unit tests for the validator

**File**: `src/lib/validation.test.ts` (new)

**Intent**: Prove every branch of `validateProductInput()` — the test that
would have caught the original gap, and the regression guard going forward.

**Contract**: Cover, at minimum:

- Valid input (positive quantity/min_threshold, recognized unit) → `{ ok:
true }`.
- `quantity` of `0`, a negative number, and `NaN` (simulating
  `parseFloat("abc")`) → each `{ ok: false, status: 400 }`.
- `min_threshold` of `0`, a negative number, and `NaN` → each `{ ok: false,
status: 400 }`.
- An unrecognized `unit` that differs from `currentUnit` → `{ ok: false,
status: 422 }`.
- An unrecognized `unit` that **equals** `currentUnit` (legacy-data exemption)
  → `{ ok: true }` (given otherwise-valid quantity/min_threshold).
- A recognized `unit` that differs from `currentUnit` (a real unit change) →
  `{ ok: true }`.

#### 5. Add `isKnownUnit()` cases to `units.test.ts`

**File**: `src/lib/units.test.ts`

**Intent**: Cover the new export alongside the Phase 1 `convertUnit()` suite.

**Contract**: A recognized unit, including case/whitespace variants (e.g.
`"kg"`, `"KG"`, `" g "`) → `true`; an unrecognized unit (e.g. `"banana"`) →
`false`.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test` passes, including new `validation.test.ts` and updated
      `units.test.ts`
- [ ] `npm run lint` passes
- [ ] `npx astro build` typechecks and builds cleanly

#### Manual Verification:

- [ ] In the running app, edit a product and submit a negative quantity → 400,
      no DB write, error surfaced (not a raw crash)
- [ ] Edit a product and submit `quantity = 0` or `min_threshold = 0` → 400
      (confirms the new floor)
- [ ] Edit a product and submit an unrecognized unit (e.g. `"banana"`) while
      also changing other fields → 422, no DB write
- [ ] Edit a product without changing its unit, where the stored unit predates
      `UNIT_MAP` (or use any product whose unit is already valid) → succeeds
      (204), confirming the "unchanged unit" exemption doesn't block routine
      edits
- [ ] Edit a product changing its unit to a different, recognized unit (e.g.
      `g` → `kg`) → succeeds (204)

---

## Phase 3: Update the test-plan cookbook

### Overview

Document the unit-test pattern this phase established so future rollout
phases — and `/10x-tdd` — have a concrete example to follow, per
`test-plan.md` §6's "fill in as phases ship" convention.

### Changes Required:

#### 1. §6.1 "Adding a unit test"

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholder with the concrete
pattern this phase established.

**Contract**: Document: co-located `*.test.ts` next to the source file (e.g.
`src/lib/units.test.ts`, `src/lib/validation.test.ts`); run via `npm run test`
(`vitest run`); prefer pure, dependency-free modules in `src/lib/` for
unit-testable logic, extracting from API routes when route logic needs testing
without Astro/Supabase context (the pattern Phase 2 used for
`validateProductInput`).

#### 2. §6.5 "Per-rollout-phase notes"

**File**: `context/foundation/test-plan.md`

**Intent**: Record a short note per the section's existing convention.

**Contract**: Note that extracting pure validation/conversion logic into
`src/lib/` kept this entire phase within "unit" scope — no Astro Container API
or `astro:env/server` env-shim was needed, deferring that setup cost to §3
Phase 2 (which already requires a Supabase-backed integration harness for
risks #2/#3/#5).

### Success Criteria:

#### Automated Verification:

- [ ] `npx prettier --write context/foundation/test-plan.md` produces no diff
      beyond the intended §6.1/§6.5 edits

#### Manual Verification:

- [ ] §6.1 and §6.5 read coherently alongside §6's remaining "TBD" placeholders
      for later phases

---

## Testing Strategy

### Unit Tests:

- `src/lib/units.test.ts` — `convertUnit()` (Risk #1) and `isKnownUnit()`
  (Risk #6 support)
- `src/lib/validation.test.ts` — `validateProductInput()` (Risk #6)

### Integration Tests:

- None in this phase. Risk #1's cross-unit checkoff integration cases and
  Risk #6's POST-route follow-up are deferred to `test-plan.md` §3 Phase 2 and
  a future risk respectively.

### Manual Testing Steps:

1. Edit a product with a negative quantity → 400, no write.
2. Edit a product with `quantity = 0` or `min_threshold = 0` → 400 (new
   floor).
3. Edit a product with an unrecognized unit plus another field change → 422,
   no write.
4. Edit a product without changing an already-non-`UNIT_MAP` unit → succeeds.
5. Edit a product changing its unit to a recognized different unit →
   succeeds.
6. Confirm the CI run shows `npm run test` passing.

## Performance Considerations

One additional `SELECT` (by primary key + `user_id`, both indexed) per PUT
request — negligible.

## Migration Notes

None — no schema changes.

## References

- Related research: `context/changes/testing-bootstrap-unit-conversion/research.md`
- Existing validation precedent: `src/pages/api/products/[id]/checkoff.ts:19-21`
  (`isNaN(x) || x <= 0 → 400`, commit `da29929`)
- Conversion module: `src/lib/units.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap Vitest and prove unit-conversion correctness (Risk #1)

#### Automated

- [x] 1.1 `npx vitest run` passes, including all `src/lib/units.test.ts` cases — b3968fa
- [x] 1.2 `npm run test` (new script) runs the suite successfully — b3968fa
- [x] 1.3 `npm run lint` passes — b3968fa
- [x] 1.4 `npx astro build` typechecks and builds cleanly (with
      `SUPABASE_URL`/`SUPABASE_KEY` set per `CLAUDE.md`) — b3968fa

#### Manual

- [x] 1.5 A CI run (after push) shows the new `npm run test` step passing — b3968fa
- [x] 1.6 `npx vitest run --reporter=verbose` output reviewed to confirm test
      names clearly describe each conversion scenario — b3968fa

### Phase 2: Close the Risk #6 product-edit validation gap

#### Automated

- [x] 2.1 `npm run test` passes, including new `validation.test.ts` and
      updated `units.test.ts` — c654dc1
- [x] 2.2 `npm run lint` passes — c654dc1
- [x] 2.3 `npx astro build` typechecks and builds cleanly — c654dc1

#### Manual

- [x] 2.4 Edit a product and submit a negative quantity → 400, no DB write,
      error surfaced
- [x] 2.5 Edit a product and submit `quantity = 0` or `min_threshold = 0` →
      400
- [x] 2.6 Edit a product and submit an unrecognized unit while also changing
      another field → 422, no DB write
- [x] 2.7 Edit a product without changing an already-non-`UNIT_MAP` unit →
      succeeds (204)
- [x] 2.8 Edit a product changing its unit to a recognized different unit →
      succeeds (204)

### Phase 3: Update the test-plan cookbook

#### Automated

- [x] 3.1 `npx prettier --write context/foundation/test-plan.md` produces no
      diff beyond the intended §6.1/§6.5 edits — 3eeb786

#### Manual

- [x] 3.2 §6.1 and §6.5 read coherently alongside §6's remaining "TBD"
      placeholders for later phases — 3eeb786
