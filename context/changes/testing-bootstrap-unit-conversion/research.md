---
date: 2026-06-10T08:07:56Z
researcher: Claude Sonnet 4.6
git_commit: 98af1172ba4069fcea216be471bd914817efd47a
branch: main
repository: smart-pantry-tracker
topic: "Phase 1 grounding: unit-conversion correctness (Risk #1) and quantity/unit input validation (Risk #6)"
tags: [research, codebase, testing-bootstrap-unit-conversion, units, validation, vitest]
status: complete
last_updated: 2026-06-10
last_updated_by: Claude Sonnet 4.6
---

# Research: Unit-conversion correctness & quantity/unit input validation (Test-Plan Phase 1)

**Date**: 2026-06-10T08:07:56Z
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 98af1172ba4069fcea216be471bd914817efd47a
**Branch**: main
**Repository**: smart-pantry-tracker

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap test runner + unit-conversion correctness", Risks #1 and #6):

- **Risk #1**: Checking off a shopping-list item in a unit different from the pantry item's stored unit must update the stored quantity by the correct converted amount; an unsupported unit pair must be rejected without corrupting stored data.
- **Risk #6**: API routes accepting quantity/unit input (checkoff, product edit) must reject negative, zero, or non-numeric quantities and unrecognized units with a 4xx and no write.

For each risk: ground the real failure path in code, verify or correct the test-plan's response guidance, locate existing tests, identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence. Also confirm test-infra readiness (Vitest bootstrap).

## Summary

- **Risk #1 is well-grounded and the implementation is more mature than the test plan assumed.** A complete, pure conversion module already exists at [src/lib/units.ts](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts) (`convertUnit`, `unitsCompatible`), and **both** checkoff endpoints already call it, return **422** on incompatible/unknown units, and round to 4 decimals. **Zero tests exist anywhere in the repo.** Phase 1's job for Risk #1 is squarely "write unit tests for `convertUnit()`" — no production-code change needed.

- **Risk #6 is also grounded, but with an important correction**: the `isNaN(x) || x <= 0 → 400` quantity guard already exists on **4 of 7** routes that accept quantity (both checkoff endpoints, shopping-list PATCH, product-listing PATCH) — added in the prior `shopping-list-complete` rollout (impl-review finding F1, commit `da29929`). However, **the route risk #6 names explicitly — "product edit" (`src/pages/api/products/[id].ts` `PUT`) — has NO validation at all**, nor do the two POST-creation routes. This is a **confirmed, currently-live gap**, not a hypothetical: a negative/non-numeric quantity via PUT hits the DB `CHECK` constraint and returns a raw 500 (same bug class as pre-fix F1), and an unrecognized unit string is silently written and persists (true data corruption with downstream effect — every future checkoff against that product will then fail `convertUnit` with 422). **Phase 1 likely needs a small implementation sub-phase (replicate the existing guard pattern onto `products/[id].ts` PUT, and arguably the two POST routes) in addition to tests** — see "Risk Response Guidance — Verified / Corrections" below.

- **Test infra is a clean slate**: no `vitest`, no `playwright`, no test files, no `vitest.config.*` anywhere in the repo. `package.json`, `astro.config.mjs`, and `tsconfig.json` are all straightforward to extend for Vitest (path alias already configured; `astro:env/server` vars are both `optional: true` so they won't throw outside the Astro runtime, but still need a Vitest-side env shim/mock for `SUPABASE_URL`/`SUPABASE_KEY` if endpoint-level tests construct a `createClient()`).

- **One adjacent finding, out of scope for Risk #1/#6 but discovered while reading the exact file Risk #6 names**: `products/[id].ts` `PUT`/`DELETE` redirect to `/auth/signin` on missing auth (a 3xx) despite the file's own header comment stating these are "called via fetch() from client-side components" — which contradicts this project's `fetch()`-routes-return-401 convention (CLAUDE.md). This is Risk #4 / Phase 3 territory (auth/route-protection) — flagged here for that phase, not actioned in Phase 1.

## Detailed Findings

### Risk #1 — Unit conversion (`src/lib/units.ts` + both checkoff endpoints)

**Conversion module** — [src/lib/units.ts](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts):

- `UNIT_MAP` ([units.ts:8-71](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L8-L71)) — three categories, all factors relative to a base unit:
  - **mass** (base `g`): `mg`(0.001), `g`(1), `dag`(10), `kg`(1000), `oz`(28.3495), `lb`(453.592) + plural/long-form aliases (19 keys total).
  - **volume** (base `ml`): `ml`(1), `cl`(10), `dl`(100), `l`(1000), `fl oz`(29.5735), `cup`(236.588), `pt`(473.176), `qt`(946.353), `gal`(3785.41) + aliases (30 keys total, including two-word keys like `"fl oz"`, `"fluid ounce"`).
  - **count** (factor 1, no real conversion): `pcs`, `pc`, `piece(s)`, `szt`, `sztuka`, `sztuki`, `item(s)` (9 keys).
- `convertUnit(value, fromUnit, toUnit)` ([units.ts:78-92](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L78-L92)):
  ```ts
  export function convertUnit(value: number, fromUnit: string, toUnit: string): number | null {
    const from = fromUnit.toLowerCase().trim();
    const to = toUnit.toLowerCase().trim();
    if (from === to) return value;
    const fromInfo = UNIT_MAP[from];
    const toInfo = UNIT_MAP[to];
    if (!fromInfo || !toInfo) return null;
    if (fromInfo.category !== toInfo.category) return null;
    if (fromInfo.category === "count") return value;
    return (value * fromInfo.factor) / toInfo.factor;
  }
  ```

  - Returns `null` for: unknown unit on either side, or category mismatch (e.g. mass ↔ volume).
  - **Pure function, zero I/O** — ideal unit-test target, no Astro/Supabase context needed.
  - Same-unit (`from === to`) short-circuits before any map lookup — works even for units NOT in `UNIT_MAP` (e.g. `convertUnit(5, "bunch", "bunch")` returns `5`).
- `unitsCompatible(unitA, unitB)` ([units.ts:95-103](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L95-L103)) — **dead code**, not imported anywhere (confirmed via impl-review F5, see Historical Context). Exists but unused; a unit test for it is optional/low-value unless a future phase wires it up.

**Checkoff endpoints — both already call `convertUnit` and handle the `null` case**:

- [src/pages/api/products/[id]/checkoff.ts:44-51](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D/checkoff.ts#L44-L51):
  ```ts
  let addedQuantity = qtyPurchased;
  if (qtyUnit && qtyUnit.toLowerCase() !== productUnit.toLowerCase()) {
    const converted = convertUnit(qtyPurchased, qtyUnit, productUnit);
    if (converted === null) {
      return new Response(`Cannot convert ${qtyUnit} to ${productUnit}`, { status: 422 });
    }
    addedQuantity = Math.round(converted * 10000) / 10000;
  }
  ```
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:59-66](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L59-L66) — identical pattern, used when a manual shopping-list item matches an existing pantry product (case-insensitive `.ilike("name", ...)` match).
  - **Edge case**: if NO matching product exists, a new product is **inserted with the entered unit and unconverted quantity** ([shopping-list-items/[id]/checkoff.ts:86-101](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L86-L101)) — conversion is correctly skipped because there is no target unit yet. Not a bug, just worth a "don't write a test expecting conversion here" note for `/10x-plan`.

**DB schema** — quantity is `numeric(10,2)`, unit is free-text with no enum/check:

- [supabase/migrations/20260528000000_products_schema.sql:5-6](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/supabase/migrations/20260528000000_products_schema.sql#L5-L6):
  ```sql
  quantity      numeric(10,2) not null default 0 check (quantity >= 0),
  unit          text          not null,
  ```

**Tests**: none. No `*.test.*`, `*.spec.*`, `__tests__/`, or `vitest.config.*` anywhere in the project (`node_modules` excluded).

---

### Risk #6 — Input validation on quantity/unit API routes

Full sweep of every route under `src/pages/api/` that accepts a `quantity`/`unit`/`min_threshold` value:

| Route                                                                                                                                                                                                             | Method | Quantity guard                                             | Unit guard               | min_threshold guard | Auth on missing user              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- | ------------------------ | ------------------- | --------------------------------- |
| [products/[id]/checkoff.ts:19-21](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D/checkoff.ts#L19-L21)                            | POST   | ✅ `isNaN‖<=0 → 400`                                       | ✅ via `convertUnit`→422 | ❌ none             | 401                               |
| [shopping-list-items/[id]/checkoff.ts:19-21](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L19-L21)      | POST   | ✅ `isNaN‖<=0 → 400`                                       | ✅ via `convertUnit`→422 | ❌ none             | 401                               |
| `shopping-list-items/[id].ts` (PATCH)                                                                                                                                                                             | PATCH  | ✅ `isNaN‖<=0 → 400` (combined with name/unit empty check) | ⚠️ non-empty only        | n/a                 | 401                               |
| `products/[id]/listing.ts` (PATCH)                                                                                                                                                                                | PATCH  | ✅ `isNaN‖<=0 → 400`                                       | ⚠️ non-empty only        | n/a                 | 401                               |
| **[products/[id].ts:26-43](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D.ts#L26-L43) (PUT) — "product edit", named in Risk #6** | PUT    | ❌ **none**                                                | ❌ **none**              | ❌ **none**         | 3xx redirect (see Open Questions) |
| `products/index.ts` (POST create)                                                                                                                                                                                 | POST   | ❌ none                                                    | ❌ none                  | ❌ none             | 3xx redirect (legit form route)   |
| `shopping-list-items/index.ts` (POST create)                                                                                                                                                                      | POST   | ❌ none                                                    | n/a                      | n/a                 | 3xx redirect (legit form route)   |

**The critical gap — `products/[id].ts` `PUT`** ([full file](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D.ts)):

```ts
// lines 26-43
const quantity = parseFloat((form.get("quantity") ?? "0") as string);
const unit = (form.get("unit") ?? "") as string;
const expiryDate = ((form.get("expiry_date") ?? "") as string) || null;
const minThreshold = parseFloat((form.get("min_threshold") ?? "0") as string);
const addToList = form.has("add_to_list");

const { error } = await supabase
  .from("products")
  .update({ name, quantity, unit, expiry_date: expiryDate, min_threshold: minThreshold, add_to_list: addToList })
  .eq("id", id)
  .eq("user_id", user.id);

if (error) {
  return new Response(encodeURIComponent(error.message), { status: 500 });
}
return new Response(null, { status: 204 });
```

Traced behavior **today**, against the DB constraints `quantity numeric(10,2) not null default 0 check (quantity >= 0)` and `min_threshold numeric(10,2) not null default 0 check (min_threshold >= 0)` ([20260528000000_products_schema.sql:5,8](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/supabase/migrations/20260528000000_products_schema.sql#L5)):

- **Negative quantity** (`"-5"`) → `parseFloat` succeeds → DB `CHECK (quantity >= 0)` violation → `error` set → **raw `500`**, not a clean `400`. This is the _exact same bug class_ as pre-fix impl-review F1, just in an endpoint F1's fix never touched.
- **Zero quantity** → passes the `>= 0` constraint → **succeeds (204)**. Arguably a legitimate "out of stock" state, not corruption — `/10x-plan` should decide whether 0 should be allowed on edit (it already is on the DB level and is a normal business state, unlike checkoff's `> 0` requirement for a _purchase_).
- **Non-numeric quantity** (`"abc"`) → `parseFloat("abc")` = `NaN` → when supabase-js serializes the update body to JSON, `NaN` → `null` → DB `not null` constraint violation → **raw `500`**.
- **Unrecognized/garbage unit** (e.g. `"banana"`, or empty string) → `unit text not null` has **no format constraint** → write **succeeds (204)**, garbage persists in `products.unit`. This is **true silent corruption**: every subsequent checkoff against this product will call `convertUnit(qty, enteredUnit, "banana")` → `null` (unless entered unit is also `"banana"`) → `422 "Cannot convert ... to banana"`, permanently blocking cross-unit checkoff for that product until manually fixed.
- Same three gaps apply to `min_threshold` (shares the `>= 0` constraint pattern).

**Existing fix pattern to replicate** (from the prior rollout, [impl-review.md:33-41](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/archive/2026-06-04-shopping-list-complete/reviews/impl-review.md#L33-L41), fix commit `da29929`):

```ts
if (isNaN(qtyPurchased) || qtyPurchased <= 0) {
  return new Response("qty_purchased must be > 0", { status: 400 });
}
```

The same `isNaN(x) || x < 0` shape (note: `< 0` not `<= 0` for product-edit, since `0` is a valid edited quantity unlike a checkoff purchase) would close the quantity/min_threshold gaps on `products/[id].ts` PUT. **Unit validation has no existing precedent to replicate** — today, "unit validity" is only ever checked indirectly via `convertUnit` returning non-null, which requires a _second_ unit to compare against. For a standalone edit, the simplest check that matches Risk #6's "unrecognized unit" framing is membership in `UNIT_MAP` (the same map `convertUnit` already uses) OR equality with the product's current unit (no-op edit) — `/10x-plan` should pick one and `/10x-research` (already done here) confirms `UNIT_MAP` is exported-shape-compatible (it's `Partial<Record<string, UnitInfo>>`, keys are lowercase).

**Supabase client / auth conventions** — all 7 routes correctly null-check `createClient()` → `503` if null ([src/lib/supabase.ts:5-8](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/supabase.ts#L5-L8)), consistent with the project's lesson "Always null-check `createClient()` before use."

**Tests**: none, anywhere.

---

### Stack & Test-Infra Readiness

- **package.json** ([full](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/package.json)): no `test` script, no `vitest`/`playwright`/`@testing-library/*` in `dependencies` or `devDependencies`. Notable: `"overrides": { "vite": "^7.3.2" }` ([package.json:57-59](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/package.json#L57-L59)) — any Vitest version installed must have a `vite` peer range compatible with `^7.3.2`.
- **astro.config.mjs** ([full](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/astro.config.mjs)): `output: "server"`, `vite: { plugins: [tailwindcss()] }` (no `test:` block yet — line 13-15), `env.schema` declares `SUPABASE_URL` / `SUPABASE_KEY` both as `envField.string({ context: "server", access: "secret", optional: true })` ([astro.config.mjs:21-22](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/astro.config.mjs#L21-L22)) — both optional, so `astro:env/server` won't throw at import time even with no `.env`, but `createClient()` will return `null` (per [src/lib/supabase.ts:6-8](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/supabase.ts#L6-L8)) unless a Vitest env shim provides values.
- **tsconfig.json** ([full](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/tsconfig.json)): `@/* -> ./src/*` path alias confirmed ([tsconfig.json:9-11](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/tsconfig.json#L9-L11)) — a Vitest config will need to mirror this (e.g. `vite-tsconfig-paths` or explicit `resolve.alias`) so `@/lib/units` resolves in tests.
- **No existing test config of any kind** — confirmed by repo-wide search excluding `node_modules`/`dist`/`.astro`.
- For **Risk #1**, a unit test on `convertUnit()` needs _only_ the path alias (or a relative import) — no Astro/Vite env concerns at all, since `src/lib/units.ts` has zero imports.
- For **Risk #6**, if `/10x-plan` chooses integration tests over the Astro Container API for the API routes, the env-shim concern above applies (routes import `createClient` → `astro:env/server`).

## Code References

- [src/lib/units.ts:8-71](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L8-L71) — `UNIT_MAP`, 58 keys across mass/volume/count.
- [src/lib/units.ts:78-92](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L78-L92) — `convertUnit()`, the Risk #1 unit-test target.
- [src/lib/units.ts:95-103](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L95-L103) — `unitsCompatible()`, dead code (impl-review F5).
- [src/pages/api/products/[id]/checkoff.ts:19-21,44-51](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D/checkoff.ts#L19-L51) — pantry checkoff: qty guard + conversion + 422.
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:19-21,59-101](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L19-L101) — manual-item checkoff: same pattern + insert-new-product branch.
- [src/pages/api/products/[id].ts:8-50](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/%5Bid%5D.ts#L8-L50) — **PUT "product edit": no quantity/unit/min_threshold validation** (Risk #6 gap).
- [src/pages/api/products/index.ts](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/products/index.ts) and [src/pages/api/shopping-list-items/index.ts](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/pages/api/shopping-list-items/index.ts) — POST creation routes, same gap, lower-priority (not named in Risk #6).
- [supabase/migrations/20260528000000_products_schema.sql:1-11](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/supabase/migrations/20260528000000_products_schema.sql#L1-L11) — `quantity`/`min_threshold` `CHECK (>= 0)`, `unit text not null` (no format check).
- [src/lib/supabase.ts:5-8](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/supabase.ts#L5-L8) — `createClient()` null-return contract.
- [package.json](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/package.json), [astro.config.mjs](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/astro.config.mjs), [tsconfig.json](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/tsconfig.json) — Vitest bootstrap targets.

## Architecture Insights

- **`convertUnit()` is a pure, dependency-free function** — the cheapest possible test target. No Astro context, no Supabase, no env vars. This should be the very first test written once Vitest is wired up (smoke-tests the whole bootstrap).
- **Conversion factors are internally consistent by construction**: every category uses a single base-unit factor table and the formula `(value * fromFactor) / toFactor`, which is algebraically self-inverse. A→B→A round-trips are guaranteed correct _up to floating-point + the production code's 4-decimal rounding_ (`Math.round(x * 10000) / 10000`). Round-trip tests should assert `closeTo(original, 1e-4)`, not exact equality — exact equality would make the test brittle for factors like `28.3495` (oz) or `453.592` (lb) that don't divide cleanly.
- **"count" category is an identity pass-through** (`factor: 1`, line 89 returns `value` unchanged for any same-category count pair). Round-trip and cross-unit tests within `count` (e.g. `pcs` ↔ `szt`) are trivially `value === value` — useful as a "this category needs no arithmetic" test case, not as a math test.
- **`.toLowerCase().trim()` does not collapse internal whitespace.** Two-word keys exist (`"fl oz"`, `"fluid ounce"`, etc.) — a value like `"Fl  Oz"` (double internal space) would fail the `UNIT_MAP` lookup and `convertUnit` would return `null` even though a human would read it as the same unit. Worth one explicit test case to document this as **current, accepted behavior** (not a bug to fix in Phase 1) — i.e. assert `convertUnit(1, "Fl  Oz", "ml") === null`, so a future change to whitespace-handling doesn't silently alter behavior unnoticed.
- **The `isNaN(x) || x <= 0 → 400` guard is an established, repeated pattern** (4 of 7 routes) — extending it to `products/[id].ts` PUT (with `< 0` instead of `<= 0`, since 0 is valid on edit) is a pattern-following change, not a new design decision.
- **Same-unit short-circuit** (`from === to` returns `value` immediately, [units.ts:82](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/src/lib/units.ts#L82)) means `convertUnit(5, "banana", "banana")` returns `5` even though `"banana"` is in neither map — i.e. **`convertUnit` alone cannot validate "is this a real unit"** for the same-unit case. This is precisely why `products/[id].ts` PUT (single-unit edit, no second unit to compare) needs its own unit check (membership in `UNIT_MAP`) rather than relying on `convertUnit`.

## Historical Context (from prior changes)

- [context/archive/2026-06-04-shopping-list-complete/change.md:13-26](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/archive/2026-06-04-shopping-list-complete/change.md#L13-L26) — "Post-plan additions" table confirms unit conversion (`src/lib/units.ts`, commit `a573a70`) and the checkoff conversion-preview UI were added **after** the plan closed, on direct user request — not derived from `plan.md` or the PRD. This matches and confirms test-plan §2 Risk #1's evidence citation ("unit conversion was post-plan scope creep on FR-012").
- [context/archive/2026-06-04-shopping-list-complete/reviews/impl-review.md:33-41](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/archive/2026-06-04-shopping-list-complete/reviews/impl-review.md#L33-L41) — F1, the exact bug class (negative qty → DB CHECK violation → raw 500) that still exists, unfixed, on `products/[id].ts` PUT today. The fix was applied only to the two checkoff endpoints (commit `da29929`).
- [context/archive/2026-06-04-shopping-list-complete/reviews/impl-review.md] F5 (referenced by sub-agent, not re-quoted here) — confirms `unitsCompatible` is exported-but-unused dead code, "kept for potential future use."
- [context/foundation/prd.md:99-100](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/foundation/prd.md#L99-L100) — FR-012 ("check off ... product's inventory quantity increases by that amount") **does not mention units or conversion at all** — confirms unit conversion is implementation scope beyond the literal PRD.
- [context/foundation/prd.md:74](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/foundation/prd.md#L74) — FR-004 establishes every product has a free-text `unit` field but specifies no validation/allow-list.
- [context/foundation/roadmap.md:133-143](https://github.com/kingapala/smart-pantry-tracker/blob/98af1172ba4069fcea216be471bd914817efd47a/context/foundation/roadmap.md#L133-L143) — S-05 risk register is entirely about the manual-vs-auto-derived shopping-list item data model (Risk #5 territory), **not** units or validation. Confirms the roadmap provides no direct evidence for Risk #1/#6 — both trace to the archive's post-plan-additions + impl-review, as the test plan already cites.

## Risk Response Guidance — Verified / Corrections

| Risk                                                                                                                                          | Test-plan said                                                                                                                                                                                                                                                                                                              | Research finding                                                                                                                                                                                                                                                                                                                                                                                                 | Correction?                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 "What would prove protection"                                                                                                              | Cross-unit checkoff applies correct converted amount; unsupported pair rejected without corruption                                                                                                                                                                                                                          | **Confirmed as-implemented** in both checkoff endpoints via `convertUnit` + 422. Nothing to fix in production code; write unit tests against `convertUnit()` directly (pure function) plus 1-2 integration-style assertions on the 422 path.                                                                                                                                                                     | None — guidance stands.                                                                                                                                                                      |
| #1 "Must challenge" — conversion table symmetric/complete, A→B→A round-trips                                                                  | UNIT_MAP factors are single-direction but mathematically self-inverse via the `(value*from)/to` formula                                                                                                                                                                                                                     | **Confirmed.** Round-trip tests should use `closeTo(original, 1e-4)` (4-decimal production rounding), not exact equality. "count" category round-trips are trivial identity.                                                                                                                                                                                                                                     | None — guidance stands, with the tolerance note added above for `/10x-plan`.                                                                                                                 |
| #1 "Likely cheapest layer" — unit + integration                                                                                               | unit (pure `convertUnit`) + integration (one same-unit, one cross-unit checkoff)                                                                                                                                                                                                                                            | **Confirmed feasible.** `convertUnit` needs zero setup. The integration case would need the Astro Container API + a Supabase client (real or mocked) — `/10x-plan` should decide whether Phase 1's "integration" slice for Risk #1 is worth it now vs. folding into Phase 2 (which is already integration-focused).                                                                                              | Minor — `/10x-plan` may choose to defer the integration half of Risk #1 to Phase 2 without weakening Phase 1's goal, since the unit-test layer alone fully covers `convertUnit` correctness. |
| #6 "What would prove protection" — checkoff + **product edit** reject negative/zero/non-numeric qty and unrecognized units with 4xx, no write | Checkoff endpoints: **already implemented** (qty guard) for negative/zero/non-numeric; unit guard via `convertUnit`/422. **Product edit (`products/[id].ts` PUT): NO guard exists for qty, unit, or min_threshold** — negative/non-numeric qty → raw 500 (not 4xx); unrecognized unit → 204 + silent persistent corruption. | **Correction**: for "product edit," the protection described **does not exist yet**. Phase 1 needs an implementation sub-phase (add `isNaN(x)                                                                                                                                                                                                                                                                    |                                                                                                                                                                                              | x < 0 → 400`for quantity & min_threshold, and a`UNIT_MAP`-membership check for unit, on `products/[id].ts` PUT) _before_ a test can pass — otherwise the new test would be a correctly-failing (red) test documenting a real bug, which is valid but should be a **deliberate** choice, not an oversight. |
| #6 "Must challenge" — client form already validates, `fetch()` bypasses it                                                                    | `products/[id].ts` PUT is confirmed `fetch()`-only (file's own header comment)                                                                                                                                                                                                                                              | **Confirmed and sharpened** — this is not hypothetical, it's the literal calling convention of the one route that has zero validation.                                                                                                                                                                                                                                                                           | None — guidance stands, now with a concrete target.                                                                                                                                          |
| #6 "Likely cheapest layer" — integration (POST malformed payloads, assert 4xx + no write)                                                     | Confirmed — Astro Container API can render `products/[id].ts` PUT with a crafted `Request` + `locals.user`, no live Supabase needed for the _validation-rejects-before-write_ assertions (the write path is never reached on 4xx).                                                                                          | **Confirmed**, and notably **cheaper than expected for the rejection cases** — a 4xx-before-write assertion doesn't need a real Supabase client at all, only the `createClient()` null-check path or a stub. The "no write occurs" half of the assertion for _valid_ requests would need either a real/mocked Supabase client or can be deferred to Phase 2 (which already covers `products` table integration). | Minor — `/10x-plan` can scope Phase 1's integration slice to "rejection path only" (no Supabase needed) and let Phase 2 cover the persisted-write assertions.                                |

## Open Questions

1. **Scope decision for `/10x-plan`**: should Phase 1 include the implementation fix for `products/[id].ts` PUT (add the missing quantity/unit/min_threshold guards), or should this be split into its own sub-phase / follow-up change so "Bootstrap test runner" doesn't get entangled with a production bug fix? Either is defensible; the test-plan's Phase 1 goal text ("...prove unit-conversion math and input validation **are correct and non-corrupting**") leans toward including the fix, since today it is _not_ correct for this route.
2. **Auth redirect-vs-401 on `products/[id].ts` PUT/DELETE** (lines 10-11, 54-55): contradicts CLAUDE.md's "fetch-driven routes return 401" rule and the file's own header comment. Out of scope for Risk #1/#6 (this is Risk #4 / Phase 3 territory) — flagging here so Phase 3's `/10x-research` doesn't have to rediscover it, and so Phase 1's integration tests (if any) for this route don't accidentally assert the _current_ (likely-buggy) redirect behavior as correct.
3. **POST creation routes** (`products/index.ts`, `shopping-list-items/index.ts`) share the same missing-validation gap as `products/[id].ts` PUT but are not named in Risk #6's wording and are classic form-submission routes (redirect-on-error is correct for them per CLAUDE.md). `/10x-plan` may choose to leave these for a follow-up risk rather than Phase 1.

## Related Research

- `context/foundation/test-plan.md` — §2 Risk #1, #6 and Risk Response Guidance (this document verifies/corrects those rows).
- `context/archive/2026-06-04-shopping-list-complete/change.md` — post-plan additions table (units.ts provenance).
- `context/archive/2026-06-04-shopping-list-complete/reviews/impl-review.md` — F1 (qty validation precedent), F5 (unitsCompatible dead code).
- `context/archive/2026-06-04-shopping-list-complete/plan.md:139-145` — prior confirmation that no test infra existed as of that change.
