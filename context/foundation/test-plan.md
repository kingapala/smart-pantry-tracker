# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-10

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface in a specific part of
   the codebase" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excludes `node_modules`, `dist`, build output) — 30 commits in the last
30 days, sufficient signal.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                             | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Checking off a shopping-list item in a different unit than the pantry item applies the wrong conversion factor, corrupting the stored quantity                                      | High   | High       | interview Q3 (user's lowest-confidence area); hot-spot file `src/pages/shopping-list/` (10 commits/30d, top-churned dir); roadmap S-05 risk register + archived `shopping-list-complete` plan (unit conversion was post-plan scope creep on FR-012) |
| 2   | A second authenticated user can read, modify, or delete another user's products or shopping-list items                                                                              | High   | Medium     | interview Q1 (user's #1 stated worry); PRD Guardrails ("data isolation must hold unconditionally"); PRD NFR (no record accessible cross-account)                                                                                                    |
| 3   | The auto-derived shopping list (`qty < threshold AND addToList=ON`) goes stale in either direction — an item fails to appear when due, or lingers after restock                     | High   | Medium     | PRD Success Criteria (primary metric + secondary E2E gate); FR-010, US-01; hot-spot dirs `src/pages/shopping-list/` (10 commits/30d) + `src/pages/inventory/` (10 commits/30d)                                                                      |
| 4   | A protected route (page or API) is reachable without a valid session, or the redirect-vs-401 split regresses after a middleware change                                              | High   | Medium     | hot-spot dirs `src/pages/auth/` (11 commits/30d, top churn) + `src/middleware.ts` (single top-churned file); PRD Access Control + NFR (no pantry data accessible unauthenticated)                                                                   |
| 5   | A manually-added one-off shopping-list item is auto-removed by threshold-derivation logic, or conflated with an auto-derived entry, instead of persisting until checked off         | Medium | High       | roadmap S-05 risk register (explicit "must be implemented and tested explicitly to avoid confusion with auto-derived items"); archived `shopping-list-complete` plan                                                                                |
| 6   | An API route accepting quantity/unit input (checkoff, product edit) is sent invalid data directly (negative qty, unrecognized unit) and writes corrupted state instead of rejecting | Medium | Medium     | abuse lens — untrusted input / server-side validation parity; FR-012; same hot-spot area as risk #1                                                                                                                                                 |

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                                                                                               | Must challenge                                                                                                                                     | Context `/10x-research` must ground                                                                                                                                          | Likely cheapest layer                                                                                                                                       | Anti-pattern to avoid                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | Checking off in a unit different from the pantry item's stored unit updates the stored quantity by the correct converted amount; an unsupported unit pair is rejected without corrupting stored data                                                                                                                                                      | "The conversion table is symmetric/complete" — every UI-offered unit pair must have a factor, and A→B→A must round-trip within acceptable rounding | Conversion factors in use; how the checkoff endpoint applies conversion before writing; rounding rules                                                                       | unit (pure conversion functions) + integration (one same-unit and one cross-unit checkoff case)                                                             | oracle problem — asserting expected conversion values by reading them out of the implementation itself instead of real-world unit definitions |
| #2   | User B cannot read, update, or delete any product or shopping-list row owned by User A, via page routes or direct API calls using another user's resource ID                                                                                                                                                                                              | "RLS is enabled, so the API doesn't need its own check" — if any route uses a service-role client, RLS gives zero protection                       | which Supabase client each products/shopping-list-items API route uses; RLS policy coverage for SELECT/UPDATE/DELETE/INSERT; how the authenticated-user context is populated | integration (two seeded users against a real Postgres + RLS instance)                                                                                       | mocking the Supabase client to "return empty for other users" — proves the mock, not the policy                                               |
| #3   | After any change to current quantity, minimum threshold, or the add-to-list flag, the shopping list immediately reflects correct membership in both directions, with no stale entries after reload                                                                                                                                                        | "If correct on first render, it stays correct" — the PRD warns client-side caching could introduce stale state                                     | the query/view that derives the shopping list; confirmation it re-evaluates live values per request, not a cached value                                                      | integration (seed → assert absence → drop below threshold → assert presence → restock → assert removal); one e2e for the PRD-mandated core flow             | testing only the "below threshold → appears" direction and skipping "restock → disappears"                                                    |
| #4   | An unauthenticated request to any protected route (page or API) gets the correct redirect or 401, and this holds after any middleware change                                                                                                                                                                                                              | "My middleware change only affects the routes I edited" — the middleware file is the single highest-churn file and applies globally                | the current protected-routes list; the redirect-vs-401 split; how the authenticated-user context is set/cleared across sign-in/out/expiry                                    | integration (route-level, hit each protected route group without a session); one e2e: sign-in → access → sign-out → denied                                  | a single happy-path "logged-in user reaches dashboard" test that never exercises the unauthenticated/expired branch                           |
| #5   | A manually-added item survives unrelated inventory updates and reloads, and is removed only on explicit checkoff — never auto-removed or merged with an auto-derived entry of the same name                                                                                                                                                               | "Manual and auto-derived items are just rows, so the same removal logic applies to both"                                                           | the data model distinguishing manual vs auto-derived entries; behavior when a manual item's name matches a product that later drops below threshold                          | integration (add manual item, run an unrelated inventory update that triggers re-derivation, assert manual item unchanged; assert removal only on checkoff) | testing manual-item creation/checkoff in isolation, never running an auto-derivation pass in between                                          |
| #6   | API routes accepting quantity/unit (checkoff, product edit) reject negative, zero, or non-numeric quantities and unrecognized units with a 4xx and no write. Phase 1 research confirmed the checkoff routes already do this; the product-edit route does not yet — Phase 1 includes adding this guard to product edit, not just testing existing behavior | "The client form already validates this" — a `fetch()` call can bypass the form entirely                                                           | existing validation (if any) on checkoff/update routes; current behavior on malformed payloads                                                                               | integration (POST malformed payloads directly to API routes, assert 4xx + no write)                                                                         | testing validation only at the React form layer                                                                                               |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                                     | Goal (one line)                                                                                                                                              | Risks covered         | Test types  | Status       | Change folder                                        |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | ----------- | ------------ | ---------------------------------------------------- |
| 1   | Bootstrap test runner + unit-conversion correctness            | Stand up Vitest and prove unit-conversion math and input validation are correct and non-corrupting                                                           | #1, #6                | unit        | implementing | `context/changes/testing-bootstrap-unit-conversion/` |
| 2   | Data-isolation + shopping-list-derivation integration coverage | Prove RLS/ownership holds across users, the auto-derived list reflects threshold/add-to-list changes both ways, and manual items follow their own lifecycle  | #2, #3, #5            | integration | not started  | —                                                    |
| 3   | Auth/route-protection regression coverage                      | Prove every protected route correctly redirects/401s without a session, and middleware changes can't silently regress this                                   | #4                    | integration | not started  | —                                                    |
| 4   | E2E critical path + CI quality-gates wiring                    | Add the PRD-mandated E2E test for the core "qty drops below threshold → shopping list updates" flow and wire lint/typecheck/unit/integration/e2e as CI gates | #3 (e2e confirmation) | e2e + gates | not started  | —                                                    |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. Recommendations are grounded in
local manifests/configs plus the MCP/tools exposed in the current session.

| Layer                     | Tool                                                                                                 | Version                           | Notes                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| unit + integration runner | Vitest (via `getViteConfig()` from `astro/config`)                                                   | none yet — see Phase 1            | official Astro-recommended runner; Vite-native, ESM/TS support out of the box                         |
| API/endpoint integration  | Astro Container API (`experimental_AstroContainer`, `renderToResponse` with `routeType: "endpoint"`) | bundled with `astro` ^6.3.1       | renders `src/pages/api/**` handlers with custom `Request` + `locals`, no running server needed        |
| RLS / DB integration      | Supabase CLI local stack (`supabase start`)                                                          | ^2.101.0 (existing devDependency) | only layer that can prove RLS policies against real Postgres, not mocks — needed for risks #2, #3, #5 |
| e2e                       | Playwright (`npm init playwright@latest`)                                                            | none yet — see Phase 4            | official Astro-recommended e2e tool; covers the PRD-mandated core-flow test                           |

**Stack grounding tools (current session):**

- Docs: Context7 (`/withastro/docs`) — checked Vitest setup (`getViteConfig()`), Container API endpoint testing (`experimental_AstroContainer`, `routeType: "endpoint"`, `locals` injection), Playwright setup; checked: 2026-06-10
- Search: Exa — not used (Context7 sufficient for this stack)
- Runtime/browser: no Playwright MCP exposed in this session; Playwright will be a project devDependency driven via CLI/CI; checked: 2026-06-10
- Provider/platform: no Supabase/Cloudflare/GitHub MCP exposed in this session; local Supabase CLI (`supabase` devDependency, already present) covers RLS-backed integration testing; checked: 2026-06-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that numbered
rollout phase lands; before that, the gate is `planned`.

| Gate                          | Where      | Required?                 | Catches                                                                                                                                                    |
| ----------------------------- | ---------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lint + typecheck              | local + CI | required                  | lint via `npm run lint` (wired in `ci.yml`); typecheck via `astro build`'s compilation step (wired in `ci.yml`)                                            |
| unit tests                    | local + CI | required after §3 Phase 1 | unit-conversion and input-validation regressions (risks #1, #6)                                                                                            |
| integration tests (incl. RLS) | local + CI | required after §3 Phase 2 | cross-user data leakage, shopping-list derivation drift, manual-item lifecycle (risks #2, #3, #5); extended in Phase 3 for auth/route-protection (risk #4) |
| e2e on critical flow          | CI on PR   | required after §3 Phase 4 | broken "qty drops below threshold → shopping list updates" core flow (risk #3 / PRD success criterion)                                                     |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test

- Co-locate `*.test.ts` next to the source file it covers (e.g.
  `src/lib/units.test.ts`, `src/lib/validation.test.ts`).
- Run via `npm run test` (`vitest run`).
- Prefer pure, dependency-free modules under `src/lib/` for unit-testable
  logic. When a route's validation/business logic needs testing without
  Astro/Supabase context, extract it into `src/lib/` first — the pattern §3
  Phase 1 used to pull `validateProductInput()` out of
  `src/pages/api/products/[id].ts` into `src/lib/validation.ts`.

### 6.2 Adding an RLS / data-isolation integration test

- TBD — see §3 Phase 2 (two-user, real-Postgres pattern for risks #2/#3/#5).

### 6.3 Adding a route-protection / auth integration test

- TBD — see §3 Phase 3 (unauthenticated-request redirect/401 pattern).

### 6.4 Adding an e2e test

- TBD — see §3 Phase 4 (core-flow Playwright pattern).

### 6.5 Per-rollout-phase notes

(After each phase lands, `/10x-implement` appends a 2-3 line note here
capturing anything surprising the rollout phase taught.)

**§3 Phase 1 (`testing-bootstrap-unit-conversion`)**: Extracting the pure
validation/conversion logic into `src/lib/` (`units.ts`, `validation.ts`)
kept this entire phase within "unit" scope — no Astro Container API or
`astro:env/server` env-shim was needed. That setup cost is deferred to §3
Phase 2, which already requires a Supabase-backed integration harness for
risks #2/#3/#5.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Astro layout/shell components** (e.g. `Topbar`, layouts) — low business
  risk, high churn from styling tweaks. Re-evaluate if a layout component
  starts carrying business logic (e.g. conditional rendering driven by
  auth/data state beyond simple show/hide). (Source: Phase 2 interview Q5.)
- **Visual/snapshot tests for Tailwind styling** — brittle on every
  class-order change, low signal. Re-evaluate if a deterministic visual-diff
  tool is introduced for a specific high-risk screen. (Source: Phase 2
  interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-10
- Stack versions last verified: 2026-06-10
- AI-native tool references last verified: n/a — no AI-native phase in this rollout

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
