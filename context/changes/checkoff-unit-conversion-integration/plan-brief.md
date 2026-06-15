# Checkoff Unit-Conversion Integration Tests — Plan Brief

> Full plan: `context/changes/checkoff-unit-conversion-integration/plan.md`
> Research: `context/changes/checkoff-unit-conversion-integration/research.md`

## What & Why

Close the integration-layer gap in test-plan.md Risk #1: prove that checking off a shopping-list item in a different unit than the matched pantry product applies the correct conversion to the **stored** quantity, and that an unsupported unit pair is rejected (422) without corrupting anything. Phase 1 of `testing-bootstrap-unit-conversion` already proved `convertUnit()` itself is correct at the unit level; this closes the loop by proving the routes wire that result into persistence correctly.

## Starting Point

Both `src/pages/api/shopping-list-items/[id]/checkoff.ts` and `src/pages/api/products/[id]/checkoff.ts` already call `convertUnit()`, round to 4 decimals, and return 422-with-no-write on incompatible units — confirmed correct, unchanged. No API-route integration test exists anywhere in the project yet.

## Desired End State

`npm run test` runs 35 tests (30 existing + 5 new), all passing. Two new co-located `checkoff.test.ts` files drive the real route handlers via the Astro Container API against a shared in-memory fake-Supabase fixture, asserting both the HTTP response and the resulting stored quantity. This establishes the pattern for future API-route integration tests in the project.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Mocking strategy | `vi.mock("@/lib/supabase")` + `experimental_AstroContainer`, no real DB | Cheapest layer with real signal; local Supabase/Docker is unavailable on this machine | Research |
| Routes/cases | Both routes, asymmetric (3 + 2 = 5 cases) | Matches change.md's stated scope without duplicating the structurally-identical same-unit case | Plan |
| Test harness | Shared in-memory fake-Supabase helper (`src/lib/test/fake-supabase.ts`) | Avoids 5x duplicated 2-4-table mock chains; assertions read as "stored quantity is correct" | Plan |
| File location | Co-located `checkoff.test.ts` per route | Extends test-plan.md §6.1's existing co-location convention (`units.test.ts`) to API routes | Plan |
| Insert-new-product branch | Excluded | Out of Risk #1's framing — no existing quantity to corrupt | Plan |
| 404 error paths | Excluded | General API-robustness concern, not a unit-conversion risk | Plan |
| Unit pairs | kg→g (cross-unit), kg vs ml (incompatible) | Exact at 2-decimal precision; cleanest mass-vs-volume incompatible case | Plan |

## Scope

**In scope:**
- `src/lib/test/fake-supabase.ts` — new shared in-memory fake Supabase client + store
- `src/pages/api/shopping-list-items/[id]/checkoff.test.ts` — same-unit, cross-unit (kg→g), incompatible (kg vs ml) cases
- `src/pages/api/products/[id]/checkoff.test.ts` — cross-unit (kg→g), incompatible (kg vs ml) cases

**Out of scope:**
- Any production code changes (routes are already correct)
- Real Postgres / Supabase CLI / RLS integration (test-plan.md §3 Phase 2's job)
- Insert-new-product branch, 404 error paths, same-unit case for `products/[id]/checkoff.ts`
- E2E/browser tests (redirected here from `/10x-e2e`)

## Architecture / Approach

A shared fixture (`createFakeSupabase(seed)`) returns `{ client, store }`: `client` is a fake Supabase client whose query builder is "thenable" (chainable AND directly `await`-able, matching real `@supabase/postgrest-js`), and `store` is the live, mutated `{ products, shopping_list_items }` arrays. Each test seeds the store, mocks `createClient()` to return `client`, drives the real route via `AstroContainer.renderToResponse(Endpoint, { routeType: "endpoint", request, params, locals: { user: fakeUser } })`, and asserts on the response + `store`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Test harness + shopping-list-items/[id]/checkoff.ts | `fake-supabase.ts` fixture + 3 cases (same-unit, cross-unit, incompatible) for the literal Risk #1 route | Getting the thenable builder contract right — both phases depend on it |
| 2. products/[id]/checkoff.ts | 2 cases (cross-unit, incompatible) reusing Phase 1's fixture with zero changes | Low — pure reuse, simpler route |

**Prerequisites:** None — Vitest + `astro/container` are already installed (`astro@^6.3.1`, `vitest@^3.2.4`).
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes `experimental_AstroContainer`'s `renderToResponse` behaves as documented in the installed `astro@6.3.1` type declarations (research cross-checked this against the actual `.d.ts`, not just docs).
- Assumes Node's global `FormData`/`Request` (used by Vitest) set the multipart `Content-Type` header automatically when a `FormData` body is passed — standard Fetch API behavior, not project-specific.

## Success Criteria (Summary)

- `npm run test` passes with 35 tests (30 existing + 5 new), `npm run lint` and `npx astro check` clean.
- The cross-unit case's deliberate-break check (Phase 1 manual verification) confirms the test fails when conversion application is broken — proving real signal.
