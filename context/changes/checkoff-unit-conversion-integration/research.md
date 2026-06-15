---
date: 2026-06-12T18:39:04Z
researcher: Claude Sonnet 4.6
git_commit: 461719c16d301d326eac65de3a84689dbf13a092
branch: main
repository: smart-pantry-tracker
topic: "Integration-layer test harness for cross-unit checkoff conversion (Risk #1)"
tags: [research, codebase, checkoff-unit-conversion-integration, units, supabase, astro-container-api, vitest]
status: complete
last_updated: 2026-06-12
last_updated_by: Claude Sonnet 4.6
---

# Research: Integration-layer test harness for cross-unit checkoff conversion (Risk #1)

**Date**: 2026-06-12T18:39:04Z
**Researcher**: Claude Sonnet 4.6
**Git Commit**: 461719c16d301d326eac65de3a84689dbf13a092
**Branch**: main
**Repository**: smart-pantry-tracker

## Research Question

Ground the `checkoff-unit-conversion-integration` change — the integration-layer half of test-plan.md Risk #1, deferred by the `testing-bootstrap-unit-conversion` (Phase 1) plan:

> Using the Astro Container API against `src/pages/api/shopping-list-items/[id]/checkoff.ts` and `src/pages/api/products/[id]/checkoff.ts`, prove:
> 1. A same-unit checkoff updates the stored quantity by the exact amount.
> 2. A cross-unit checkoff (e.g. shopping-list item in "kg", pantry product in "g") updates the stored quantity by the correctly converted amount.
> 3. An unsupported/incompatible unit pair is rejected (422) with no DB write.

Specifically: confirm the exact, current (Astro 6.3.1) Container API mechanics for rendering these endpoint modules, how `context.locals.user` and `@/lib/supabase`'s `createClient()` can be supplied/mocked in a Vitest test, and what "cheapest layer with real signal" looks like for this risk given the project's actual state.

## Summary

- **The production code is unchanged since Phase 1's research and is already correct.** Both checkoff endpoints call the Phase-1-proven `convertUnit()`, round to 4 decimals (`Math.round(x * 10000) / 10000`), and return `422` with no write on an incompatible/unknown unit pair. Nothing to fix; this change is test-only.
- **`experimental_AstroContainer` (from `astro/container`) is the correct, current API** for Astro 6.3.1 — confirmed against the installed package's `.d.ts`, not just docs. It is still experimental-flagged (no stable alias exists in 6.3.1).
- **Middleware does NOT run inside the container** — `src/middleware.ts` is never invoked. `context.locals` is whatever object is passed as `locals` in `ContainerRenderOptions`, so `locals: { user: fakeUser | null }` (matching `App.Locals` from `src/env.d.ts`) is the correct and only way to set the auth context.
- **`vi.mock("@/lib/supabase", ...)` is fully compatible with the Container API.** The container renders an already-imported module object; Vitest's normal hoisted `vi.mock` resolves before the route module is imported, so the route's `createClient` binding is the mock. This is the simplest, cheapest harness — **no real Postgres/Docker needed**, which matters because **local Supabase is not currently runnable on this machine** (`npx supabase status` fails — Docker Desktop's pipe is unavailable).
- **This mocked approach does not trigger either anti-pattern test-plan.md warns about for this area**:
  - The "oracle problem" (Risk #1's "Must challenge") is about deriving *expected conversion values* from the implementation — that's already solved by Phase 1's `units.test.ts`, which asserts `convertUnit()` against real-world unit facts. This change's job is to prove the **route correctly applies** that already-proven function's result to the DB write — a wiring/orchestration risk, not a math-correctness risk.
  - The "mocking Supabase proves the mock, not the policy" anti-pattern (test-plan.md §2 Risk #2 guidance) is about **RLS** — Risk #1 has nothing to do with RLS; mocking `createClient()` here doesn't claim to prove anything about row-level security.
- **`astro:env/server` is a non-issue** once `@/lib/supabase` is mocked — the real `createClient()` (and its `SUPABASE_URL`/`SUPABASE_KEY` env lookup) never runs.
- **Recommended harness shape**: a small shared in-memory fake Supabase client (seeded rows per test + call recording) rather than ad-hoc `vi.fn().mockReturnThis()` chains per test — the success path of `shopping-list-items/[id]/checkoff.ts` alone touches **three** different `.from()` chains (`shopping_list_items` select, `products` select, `products` update, `shopping_list_items` delete).
- **`shopping-list-items/[id]/checkoff.ts` is the literal Risk #1 route** ("checking off a shopping-list item in a different unit than the pantry item"). `products/[id]/checkoff.ts` shares the identical conversion-application pattern but is simpler (single table, no insert-new-product branch) — a good second/lighter test target, per the change's stated scope of covering both.

## Detailed Findings

### A. The conversion-application code paths (re-confirmed at current HEAD)

- [`src/pages/api/shopping-list-items/[id]/checkoff.ts:27-66`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L27-L66) — the Risk #1 route:
  1. `SELECT name, unit FROM shopping_list_items WHERE id=:id AND user_id=:user.id` → 404 if missing.
  2. `enteredUnit = qty_unit (form) || shopping_list_items.unit`.
  3. `SELECT id, quantity, unit FROM products WHERE name ILIKE :name AND user_id=:user.id` (case-insensitive match).
  4. If a matching product exists:
     - If `enteredUnit !== productUnit` (case-insensitive): `convertUnit(qtyPurchased, enteredUnit, productUnit)`. If `null` → **422 `Cannot convert ${enteredUnit} to ${productUnit}`**, function returns immediately — no `update`/`insert`/`delete` reached.
     - Else `addedQuantity = qtyPurchased` (same-unit case).
     - `addedQuantity = Math.round(converted * 10000) / 10000` for the converted case.
     - `UPDATE products SET quantity = existingQuantity + addedQuantity, ... WHERE id=:existingId AND user_id=:user.id`.
  5. If no matching product: `INSERT INTO products (..., quantity: qtyPurchased, unit: enteredUnit, ...)` — **no conversion is applied** (there's no target unit yet). This is correct, pre-existing behavior, not a Risk #1 case.
  6. `DELETE FROM shopping_list_items WHERE id=:id AND user_id=:user.id` — only reached if steps 4/5 succeeded.

- [`src/pages/api/products/[id]/checkoff.ts:27-51`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/pages/api/products/%5Bid%5D/checkoff.ts#L27-L51) — simpler "restock this pantry item directly" route:
  1. `SELECT quantity, unit FROM products WHERE id=:id AND user_id=:user.id` → 404 if missing.
  2. If `qty_unit (form)` is non-empty and differs from `productUnit`: `convertUnit(qtyPurchased, qtyUnit, productUnit)`. `null` → **422**, no further write.
  3. `addedQuantity` rounded the same way (`Math.round(x * 10000) / 10000`).
  4. `UPDATE products SET quantity = currentQuantity + addedQuantity, ... WHERE id=:id AND user_id=:user.id`.

- [`src/lib/units.ts:78-92`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/units.ts#L78-L92) — `convertUnit(value, from, to)`, already fully unit-tested in Phase 1 ([`src/lib/units.test.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/units.test.ts)). For this change, treat it as a **trusted oracle** — call the real function in test setup to compute expected values, don't hand-derive conversion factors again.

### B. Astro Container API mechanics (Astro 6.3.1, ground-truthed against the installed package)

- Import: `import { experimental_AstroContainer as AstroContainer } from "astro/container"` (`node_modules/astro/dist/container/index.d.ts:149`) — **still experimental-flagged**, no stable alias in 6.3.1.
- Create + render:
  ```ts
  const container = await AstroContainer.create();
  const response = await container.renderToResponse(EndpointModule, {
    routeType: "endpoint",                 // required for API routes
    request: new Request(url, { method: "POST", body, headers }),
    params: { id: "..." },                 // Record<string, string | undefined>
    locals: { user: fakeUser | null },     // App.Locals
  });
  ```
  `EndpointModule` is the `import * as Endpoint from "./checkoff"` module object (the route's `POST` export).
- `ContainerRenderOptions` = `{ slots?, request?, params?, locals?: App.Locals, routeType?, props?, partial? }`.

### C. Middleware / locals injection

- `AstroContainer.create()` (no manifest) wires `middleware: () => ({ onRequest: NOOP_MIDDLEWARE_FN })` (`node_modules/astro/dist/container/index.js`, `node_modules/astro/dist/core/middleware/noop-middleware.js`). **`src/middleware.ts` never runs.**
- `renderToResponse` sets `state.locals = options?.locals ?? {}` directly — so `locals: { user: fakeUser }` / `locals: { user: null }` is exactly how to set `context.locals.user` for the 401 vs. authenticated paths.
- [`src/env.d.ts:1-5`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/env.d.ts) — `App.Locals = { user: import("@supabase/supabase-js").User | null }`.
- `User`'s **non-optional** fields (`node_modules/@supabase/auth-js/dist/main/lib/types.d.ts:360-387`): `id`, `app_metadata`, `user_metadata`, `aud`, `created_at`. A minimal fake: `{ id: "user-1", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() }`.

### D. `astro:env/server` under Vitest — moot once `@/lib/supabase` is mocked

- `getViteConfig({ test: {} })` (current `vitest.config.ts`) makes `astro:env/server` resolve without throwing (it only throws in a `"client"`-named Vite environment; Vitest's isn't). With `SUPABASE_URL`/`SUPABASE_KEY` unset, both resolve to `undefined` and the *real* `createClient()` would return `null` per [`src/lib/supabase.ts:6-8`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/supabase.ts#L6-L8).
- Since the recommended harness mocks `@/lib/supabase` directly (see E), the real `createClient()`/`astro:env/server` path is never exercised — **no env shim, `.env.test`, or `process.env` setup needed** for this change.

### E. Mocking strategy: `vi.mock("@/lib/supabase")` + Container API

- The container takes an *already-imported* module object; it does no separate module resolution/caching of the route. A hoisted `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))` at the top of the test file resolves before `checkoff.ts` is imported, so `checkoff.ts`'s `createClient` binding is the mock — confirmed compatible, no caveats found.
- **Chain shape needed** (from section A), per route:
  - `shopping-list-items/[id]/checkoff.ts` success path: `.from("shopping_list_items").select("name, unit").eq().eq().maybeSingle()` → `.from("products").select("id, quantity, unit").ilike().eq().maybeSingle()` → `.from("products").update({...}).eq().eq()` → `.from("shopping_list_items").delete().eq().eq()`.
  - 422 path: only the first two `.from()` calls happen; assert `update`/`insert`/`delete` are **never called**.
  - `products/[id]/checkoff.ts` success path: `.from("products").select("quantity, unit").eq().eq().maybeSingle()` → `.from("products").update({...}).eq().eq()`. 422 path: only the select.
- **Recommendation**: a small shared fake-Supabase test helper (e.g. `src/lib/test/fake-supabase.ts` or co-located in a `test-utils` file) that holds an in-memory `{ products: [...], shopping_list_items: [...] }` store, implements just the methods these two routes call (`select`/`ilike`/`eq`/`maybeSingle`/`update`/`insert`/`delete`), mutates the store on `update`/`insert`/`delete`, and exposes the store afterward for assertions (`expect(store.products[0].quantity).toBe(600)`) — this avoids asserting on raw mock-call argument shapes and reads closer to "the stored quantity is correct" (the literal risk wording), while still being a pure-JS fake with zero I/O.

### F. DB schema constraints (context only — not exercised by the mocked approach)

- [`supabase/migrations/20260528000000_products_schema.sql:1-11`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/supabase/migrations/20260528000000_products_schema.sql) — `products.quantity numeric(10,2) not null default 0 check (quantity >= 0)`, `unit text not null`, full RLS (select/insert/update/delete, `auth.uid() = user_id`).
- [`supabase/migrations/20260605000001_shopping_list_items.sql:1-23`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/supabase/migrations/20260605000001_shopping_list_items.sql) — `shopping_list_items.quantity numeric(10,2) not null check (quantity > 0)`, RLS covers select/insert/delete (**no update policy** — consistent with the route never updating this table, only deleting it).
- `numeric(10,2)` means the DB itself rounds/truncates to 2 decimals on write, while the route rounds to 4 (`Math.round(x*10000)/10000`) before sending. A real-Postgres test would observe the DB's 2-decimal storage; the mocked fake will not. **Not a concern for this change** (no real DB), but worth a one-line note if a future Phase-2 real-DB test reuses these scenarios — pick test values that are exact at 2 decimals to avoid a false mismatch (e.g. avoid `convertUnit` results with >2 significant decimal digits).

### G. Local Supabase / real-DB path — confirmed not viable right now

- `npx supabase status` fails: `failed to inspect container health ... open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` — Docker Desktop isn't running/available in this environment.
- `supabase/seed.sql` is now empty ("Seed data removed. Products require a real user_id from auth.users... sign up at local Supabase, copy your UUID...") — a real-DB test would also need to create an `auth.users` row (via signup or admin API) before seeding `products`/`shopping_list_items`, which reference `auth.users(id)`.
- `context/changes/db-schema-and-rls/plan.md` (RLS foundation) used **manual** two-user testing via the sign-in UI, not automated — there is no existing automated real-Postgres test pattern to follow even if Docker were available.
- CI (`.github/workflows/ci.yml`) runs `npm run test` (Vitest) with no Supabase service container; `.github/workflows/playwright.yml` runs Playwright with no Supabase setup either. Adding a real-Postgres path would be new CI infrastructure — squarely the "Supabase CLI local stack" Phase 2 of test-plan.md already earmarks for risks #2/#3/#5.

## Code References

- [`src/pages/api/shopping-list-items/[id]/checkoff.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts) — Risk #1 primary route.
- [`src/pages/api/products/[id]/checkoff.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/pages/api/products/%5Bid%5D/checkoff.ts) — secondary route, same pattern.
- [`src/lib/units.ts:78-92`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/units.ts#L78-L92) — `convertUnit()`, trusted oracle (Phase 1-proven).
- [`src/lib/units.test.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/units.test.ts) — existing Vitest conventions (`describe`/`it`, `toBeCloseTo` for rounding).
- [`src/env.d.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/env.d.ts) — `App.Locals.user` shape.
- [`src/lib/supabase.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/lib/supabase.ts) — `createClient()`, the mock target.
- [`vitest.config.ts`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/vitest.config.ts) — existing `getViteConfig({ test: {} })` setup, no changes needed.
- [`supabase/migrations/20260528000000_products_schema.sql`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/supabase/migrations/20260528000000_products_schema.sql) / [`20260605000001_shopping_list_items.sql`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/supabase/migrations/20260605000001_shopping_list_items.sql) — schema/RLS context.
- `node_modules/astro/dist/container/index.d.ts:149` — `experimental_AstroContainer` signature (installed package, ground truth for Astro 6.3.1).
- `node_modules/astro/dist/container/index.js` + `node_modules/astro/dist/core/middleware/noop-middleware.js` — confirms middleware is a no-op inside the container.
- `node_modules/@supabase/auth-js/dist/main/lib/types.d.ts:360-387` — `User` type, non-optional fields.

## Architecture Insights

- **Two-tier conversion proof is now complete by construction**: Phase 1 proved `convertUnit()` against real-world unit facts (unit layer); this change proves the **route** correctly feeds `convertUnit()`'s already-trusted output into the persisted write, and correctly *skips* the write when `convertUnit()` returns `null`. Together they cover Risk #1's full "what would prove protection" statement without ever needing a live database.
- **The Container API + `vi.mock` combination is a clean, repeatable pattern** for any future `src/pages/api/**` route test in this project that doesn't need real RLS — likely the template `test-plan.md` §6.2 (RLS integration cookbook) should explicitly contrast with, since §3 Phase 2 *will* need real Postgres for RLS itself.
- **`shopping_list_items` has no `update` RLS policy** — by design, the table is select/insert/delete only; checkoff always ends in a `delete`, never an `update`, on this table. A fake/mock that only implements `update` for `products` (not `shopping_list_items`) is sufficient and matches production.
- **The "insert new product" branch** ([`shopping-list-items/[id]/checkoff.ts:86-101`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts#L86-L101)) is reachable in the same route but represents a *different* scenario (no existing product to corrupt) — out of scope for Risk #1's "corrupting the stored quantity" framing, which presupposes an existing pantry item.

## Historical Context (from prior changes)

- [`context/changes/testing-bootstrap-unit-conversion/research.md`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/context/changes/testing-bootstrap-unit-conversion/research.md) — Phase 1's research; this document's "Risk Response Guidance — Verified/Corrections" row for Risk #1 explicitly left the integration half open for "`/10x-plan` to decide whether Phase 1's 'integration' slice for Risk #1 is worth it now vs. folding into Phase 2." This change is that follow-up.
- [`context/changes/testing-bootstrap-unit-conversion/plan.md`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/context/changes/testing-bootstrap-unit-conversion/plan.md) — "Not Doing" list explicitly deferred Container API + Risk #1 integration cases to here.
- [`context/changes/db-schema-and-rls/plan.md`](https://github.com/kingapala/smart-pantry-tracker/blob/461719c16d301d326eac65de3a84689dbf13a092/context/changes/db-schema-and-rls/plan.md) — confirms no automated RLS/real-Postgres test pattern exists yet anywhere in the project (manual two-user UI testing only); reinforces that a real-DB harness is genuinely new infrastructure, not something to casually pull in for this change.

## Related Research

- `context/foundation/test-plan.md` — §2 Risk #1 + Risk Response Guidance (the requirement this change satisfies).
- `context/changes/testing-bootstrap-unit-conversion/research.md` and `plan.md` — Phase 1 (unit layer), direct predecessor.

## Open Questions

1. **Scope: one route or both?** The change's stated scope covers both `shopping-list-items/[id]/checkoff.ts` (literal Risk #1 route) and `products/[id]/checkoff.ts` (shares the pattern). Recommend covering both but with an asymmetric test count — e.g. 3 cases for the shopping-list route (same-unit, cross-unit, incompatible-422) and 2 for the products route (cross-unit, incompatible-422), since same-unit is structurally identical between the two and doesn't need repeating.
2. **Shared fake-Supabase helper location/shape**: `/10x-plan` should pick a concrete file path and minimal interface for the in-memory fake described in §E — e.g. `src/lib/test/fake-supabase.ts` exporting `createFakeSupabase(seed: { products?: ...; shopping_list_items?: ... })`. Keeping it minimal (only the methods these two routes call) avoids building a general Supabase mock.
3. **Real-Postgres stretch goal**: a real local-Supabase round-trip test (proving the `numeric(10,2)` DB-level rounding interacts correctly with the route's 4-decimal rounding) is **blocked right now** (Docker unavailable) and arguably belongs with Phase 2's RLS harness (§3 Phase 2, "not started"). Recommend explicitly marking this as NOT in this change's scope rather than leaving it ambiguous.
4. **Concrete test values**: pick conversion pairs that are exact at the DB's 2-decimal precision to keep numbers readable and avoid float-noise assertions, e.g. shopping-list item `unit: "kg"`, matched product `unit: "g"`, `qty_purchased: "0.5"` → `convertUnit(0.5, "kg", "g") === 500` (exact), existing product `quantity: 100` → expected new `quantity: 600`. For incompatible pairs, a mass/volume mismatch (e.g. shopping-list item `unit: "kg"`, product `unit: "ml"`) is the cleanest `convertUnit → null` case already covered by Phase 1's unit tests.
