# Checkoff Unit-Conversion Integration Tests — Implementation Plan

## Overview

Add integration-layer coverage for test-plan.md Risk #1's deferred half: prove that `src/pages/api/shopping-list-items/[id]/checkoff.ts` and `src/pages/api/products/[id]/checkoff.ts` correctly apply unit conversion to the **persisted** quantity (same-unit and cross-unit cases) and correctly **reject** an incompatible unit pair with a 422 and no write. This is test-only — both routes are already correct (confirmed in research.md); the work is building the first Astro-Container-API integration-test harness for this project and writing the 5 cases against it.

## Current State Analysis

- Both checkoff routes already call `convertUnit()` ([src/lib/units.ts:78-92](src/lib/units.ts#L78-L92)), round via `Math.round(x * 10000) / 10000`, and return `422` with the matching `Cannot convert ${from} to ${to}` message and **no further write** when `convertUnit()` returns `null`.
- `convertUnit()` itself is fully unit-tested ([src/lib/units.test.ts](src/lib/units.test.ts)) against real-world unit facts — Phase 1 of `testing-bootstrap-unit-conversion`. This plan treats `convertUnit()` as a trusted oracle and does not re-derive conversion factors.
- No API-route integration test exists anywhere in the project yet (`src/**/*.test.ts` is only `src/lib/units.test.ts` and `src/lib/validation.test.ts`). test-plan.md §6.2-6.4 (integration/e2e cookbook entries) are all "TBD".
- `vitest.config.ts` already uses `getViteConfig({ test: {} })`, which makes `astro:env/server` resolve without error under Vitest — but this plan mocks `@/lib/supabase` directly, so `astro:env/server` is never reached.

### Key Discoveries:

- `experimental_AstroContainer` from `astro/container` (Astro 6.3.1, confirmed against installed `.d.ts`) renders an endpoint module via `container.renderToResponse(EndpointModule, { routeType: "endpoint", request, params, locals })`. Middleware never runs — `locals.user` is set purely by the `locals` option passed in.
- `vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))` is fully compatible with the Container API — the container renders an already-imported module object, so the route's `createClient` binding is the mock.
- [`shopping-list-items/[id]/checkoff.ts`](src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts) touches **4 chained Supabase calls** on the success path: select `shopping_list_items` → select `products` (via `.ilike`) → update `products` → delete `shopping_list_items`. [`products/[id]/checkoff.ts`](src/pages/api/products/%5Bid%5D/checkoff.ts) touches 2: select `products` → update `products`.
- A minimal valid fake `User` (per `App.Locals` in [src/env.d.ts](src/env.d.ts)) needs only `id`, `app_metadata`, `user_metadata`, `aud`, `created_at` — all other `User` fields are optional.

## Desired End State

`npm run test` runs 35 tests total (30 existing + 5 new) and all pass. `npm run lint` and `npx astro check` remain clean. Two new co-located test files exist, each importing the real route module and driving it through `experimental_AstroContainer` against a shared in-memory fake-Supabase fixture — establishing the pattern future API-route integration tests in this project will follow (to be captured in test-plan.md §6.5 by `/10x-implement` after this change lands).

## What We're NOT Doing

- No production code changes — both routes are already correct.
- No real Postgres / Supabase CLI integration (Docker is unavailable on this machine; real-DB RLS coverage is test-plan.md §3 Phase 2's job for risks #2/#3/#5).
- No coverage of the "no matching product → insert new product" branch — out of Risk #1's framing (no existing quantity to corrupt).
- No coverage of 404 (`shopping_list_items`/`products` row not found) error paths — a general API-robustness concern, not a unit-conversion risk.
- No same-unit test for `products/[id]/checkoff.ts` — structurally identical to the same-unit case already covered for `shopping-list-items/[id]/checkoff.ts`.
- No E2E/browser tests — this work was explicitly redirected here from `/10x-e2e` because the risk is server-side API/DB logic.

## Implementation Approach

Build one shared fixture, `src/lib/test/fake-supabase.ts`, that creates an in-memory `{ products, shopping_list_items }` store plus a fake Supabase client implementing only the query-builder methods these two routes call (`from`, `select`, `eq`, `ilike`, `update`, `delete`, `maybeSingle`). Each test seeds the store, mocks `createClient()` to return the fake client, drives the real route handler through `AstroContainer.renderToResponse(...)`, and asserts on both the HTTP response and the resulting store state. Phase 1 builds the fixture and proves it against the primary Risk #1 route (3 cases); Phase 2 reuses it for the secondary route (2 cases) with no new infrastructure.

## Critical Implementation Details

### Fake Supabase query-builder must be "thenable"

Real `@supabase/postgrest-js` builders are chainable AND directly `await`-able at any point (`await supabase.from(t).update(p).eq(...).eq(...)` resolves without calling `.then()` explicitly). The fake must replicate this: each chain method (`select`, `eq`, `ilike`, `update`, `delete`, `maybeSingle`) returns the same builder object, and the builder itself implements `.then(onFulfilled, onRejected)` so `await` works regardless of which method was called last. The builder executes against the in-memory store only when `.then()` fires (i.e., when awaited) — filters/payload accumulate first, execution happens once.

### `.ilike("name", name)` matching

The routes call `.ilike("name", name)` with no `%` wildcards — Postgres treats this as a case-insensitive **exact** match. The fake should do `row.name.toLowerCase() === val.toLowerCase()`, not substring matching.

### Driving the route via the Container API

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import * as Endpoint from "./checkoff";

const body = new FormData();
body.append("qty_purchased", "0.5");

const container = await AstroContainer.create();
const response = await container.renderToResponse(Endpoint, {
  routeType: "endpoint",
  request: new Request("http://localhost/api/shopping-list-items/sli-2/checkoff", {
    method: "POST",
    body, // fetch sets multipart Content-Type + boundary automatically
  }),
  params: { id: "sli-2" },
  locals: { user: fakeUser },
});
```

`vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }))` at the top of the test file is hoisted by Vitest above the `import * as Endpoint from "./checkoff"` below it, so the route's `createClient` import is the mock by the time `Endpoint` is evaluated. Each test then calls `vi.mocked(createClient).mockReturnValue(fakeClient as unknown as ReturnType<typeof createClient>)` before invoking the route.

---

## Phase 1: Test harness + `shopping-list-items/[id]/checkoff.ts`

### Overview

Build the shared fake-Supabase fixture and write the 3 cases for the literal Risk #1 route: same-unit checkoff, cross-unit (kg→g) checkoff, and an incompatible (kg vs ml) checkoff that must be rejected with no write.

### Changes Required:

#### 1. Shared fake-Supabase fixture

**File**: `src/lib/test/fake-supabase.ts` (new)

**Intent**: Provide a small, in-memory, type-safe fake Supabase client + mutable store that the test files seed before each case and inspect afterward, so assertions read as "the stored quantity is correct" rather than asserting on raw mock-call arguments.

**Contract**: Export `createFakeSupabase(seed: { products?: FakeProduct[]; shopping_list_items?: FakeShoppingListItem[] })` returning `{ client, store }`. `client.from(table)` returns the thenable builder described in Critical Implementation Details, supporting `select`, `eq`, `ilike`, `update`, `delete`, `maybeSingle`. `store.products` / `store.shopping_list_items` are the live, mutated arrays — `update` does `Object.assign` on matched rows, `delete` filters matched rows out. Methods not needed by either route (`insert`, etc.) are intentionally not implemented — calling them should throw (e.g. via a `Proxy` or an explicit `throw new Error(...)` default), so a test that unexpectedly hits the insert branch fails loudly instead of silently returning `undefined`.

#### 2. Integration test for the primary Risk #1 route

**File**: `src/pages/api/shopping-list-items/[id]/checkoff.test.ts` (new)

**Intent**: Drive `POST /api/shopping-list-items/[id]/checkoff` through the real route handler for the 3 Risk #1 scenarios, asserting both the HTTP response and the resulting `store` state.

**Contract**: One `describe` block, 3 `it` cases, each following seed → `vi.mocked(createClient).mockReturnValue(...)` → call via `AstroContainer` → assert response + store. Local helper `callCheckoff(itemId, formFields)` builds the `FormData` + `Request` + container call shown in Critical Implementation Details, with `locals: { user: fakeUser }` (`fakeUser.id` matching seeded rows' `user_id: "user-1"`).

Test data (all exact at 2 decimals — no rounding-noise risk):

| Case | Seeded `shopping_list_items` | Seeded `products` | Form | Expected |
| --- | --- | --- | --- | --- |
| Same-unit | `{id:"sli-1", user_id:"user-1", name:"Flour", unit:"g"}` | `{id:"prod-1", user_id:"user-1", name:"Flour", quantity:100, unit:"g"}` | `qty_purchased=200` | 204; `prod-1.quantity === 300`; `shopping_list_items` empty |
| Cross-unit (kg→g) | `{id:"sli-2", user_id:"user-1", name:"Sugar", unit:"kg"}` | `{id:"prod-2", user_id:"user-1", name:"Sugar", quantity:100, unit:"g"}` | `qty_purchased=0.5` | 204; `prod-2.quantity === 600` (0.5kg→500g + 100); `shopping_list_items` empty |
| Incompatible (kg vs ml) | `{id:"sli-3", user_id:"user-1", name:"Oil", unit:"kg"}` | `{id:"prod-3", user_id:"user-1", name:"Oil", quantity:100, unit:"ml"}` | `qty_purchased=1` | 422, body `"Cannot convert kg to ml"`; `prod-3.quantity` unchanged at 100; `shopping_list_items` still contains `sli-3` |

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run src/pages/api/shopping-list-items/[id]/checkoff.test.ts` (3 tests pass)
- Full suite passes: `npm run test` (33 total)
- Lint passes: `npm run lint`
- Typecheck passes: `npx astro check`

#### Manual Verification:

- Deliberate-break check: temporarily change the cross-unit case's route logic (e.g., comment out the `Math.round(converted * 10000) / 10000` line so `addedQuantity` uses the raw `qtyPurchased` instead) and confirm the cross-unit test fails with the wrong `prod-2.quantity` — then revert. This proves the test has real signal on the conversion-application path, not just on HTTP status codes.

---

## Phase 2: `products/[id]/checkoff.ts`

### Overview

Reuse Phase 1's fixture for the secondary route: cross-unit (kg→g) checkoff and an incompatible (kg vs ml) checkoff rejected with no write.

### Changes Required:

#### 1. Integration test for the secondary route

**File**: `src/pages/api/products/[id]/checkoff.test.ts` (new)

**Intent**: Drive `POST /api/products/[id]/checkoff` through the real route handler for the 2 conversion-outcome scenarios this route shares with Risk #1, reusing `src/lib/test/fake-supabase.ts`.

**Contract**: Same structure as Phase 1's test file — `describe` block, local `callCheckoff(productId, formFields)` helper (URL `/api/products/${productId}/checkoff`, `params: { id: productId }`), `vi.mock("@/lib/supabase", ...)`.

Test data:

| Case | Seeded `products` | Form | Expected |
| --- | --- | --- | --- |
| Cross-unit (kg→g) | `{id:"prod-4", user_id:"user-1", quantity:100, unit:"g"}` | `qty_purchased=0.5`, `qty_unit=kg` | 204; `prod-4.quantity === 600` |
| Incompatible (kg vs ml) | `{id:"prod-5", user_id:"user-1", quantity:100, unit:"ml"}` | `qty_purchased=1`, `qty_unit=kg` | 422, body `"Cannot convert kg to ml"`; `prod-5.quantity` unchanged at 100 |

### Success Criteria:

#### Automated Verification:

- New test file passes: `npx vitest run src/pages/api/products/[id]/checkoff.test.ts` (2 tests pass)
- Full suite passes: `npm run test` (35 total)
- Lint passes: `npm run lint`
- Typecheck passes: `npx astro check`

#### Manual Verification:

- Spot-check that `src/lib/test/fake-supabase.ts` required zero changes to support this route (confirms the fixture's contract is genuinely shared, not Phase-1-specific).

---

## Testing Strategy

### Unit Tests:

- None added — `convertUnit()` is already fully covered by `src/lib/units.test.ts` (Phase 1 of `testing-bootstrap-unit-conversion`).

### Integration Tests:

- The 5 cases described above (3 + 2), covering same-unit, cross-unit, and incompatible-unit checkoff against both routes.

### Manual Testing Steps:

1. After Phase 1, run the deliberate-break check described in Phase 1's Manual Verification.
2. After Phase 2, confirm `npm run test` shows 35 passing tests with no changes to existing test files.

## Performance Considerations

None — in-memory fixture, no network/DB calls, ~5 fast Vitest cases.

## Migration Notes

None — test-only change, no schema or data migrations.

## References

- Related research: `context/changes/checkoff-unit-conversion-integration/research.md`
- Conversion logic: [src/lib/units.ts:78-92](src/lib/units.ts#L78-L92)
- Primary route: [src/pages/api/shopping-list-items/[id]/checkoff.ts](src/pages/api/shopping-list-items/%5Bid%5D/checkoff.ts)
- Secondary route: [src/pages/api/products/[id]/checkoff.ts](src/pages/api/products/%5Bid%5D/checkoff.ts)
- Existing unit-test conventions: [src/lib/units.test.ts](src/lib/units.test.ts)
- Test plan / Risk #1: `context/foundation/test-plan.md` §2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test harness + shopping-list-items/[id]/checkoff.ts

#### Automated

- [x] 1.1 New test file passes: `npx vitest run src/pages/api/shopping-list-items/[id]/checkoff.test.ts` (3 tests pass) — 2001f6c
- [x] 1.2 Full suite passes: `npm run test` (33 total) — 2001f6c
- [x] 1.3 Lint passes: `npm run lint` — 2001f6c
- [x] 1.4 Typecheck passes: `npx astro check` — 2001f6c

#### Manual

- [x] 1.5 Deliberate-break check on the cross-unit case confirms the test fails when conversion application is broken, then revert — 2001f6c

### Phase 2: products/[id]/checkoff.ts

#### Automated

- [x] 2.1 New test file passes: `npx vitest run src/pages/api/products/[id]/checkoff.test.ts` (2 tests pass)
- [x] 2.2 Full suite passes: `npm run test` (35 total)
- [x] 2.3 Lint passes: `npm run lint`
- [x] 2.4 Typecheck passes: `npx astro check`

#### Manual

- [x] 2.5 Confirm `src/lib/test/fake-supabase.ts` required zero changes to support this route
