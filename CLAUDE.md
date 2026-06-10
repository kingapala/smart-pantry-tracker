# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server (Astro SSR + Cloudflare adapter)
npm run build        # production build — requires SUPABASE_URL + SUPABASE_KEY env vars
npm run lint         # ESLint across .ts, .tsx, .astro
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier on all files
npx astro sync       # regenerate type declarations (run before build if types are stale)
```

Pre-commit hook (husky + lint-staged) runs ESLint on `.ts/.tsx/.astro` and Prettier on `.json/.css/.md` automatically.

## Architecture

**Stack**: Astro 6 (SSR) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages

All pages are server-rendered (`output: "server"` in [astro.config.mjs](astro.config.mjs)) — there is no static export mode.

**Directory layout**:

- `src/pages/` — Astro page routes (`.astro`) and API routes (`src/pages/api/**/*.ts`)
- `src/components/` — Astro components (`.astro`) and React components (`.tsx`)
- `src/layouts/` — Astro layout wrappers
- `src/lib/` — shared utilities; `supabase.ts` is the Supabase client factory

**Import alias**: `@/` maps to `src/` throughout the project.

## Key Conventions

**Env vars must use `astro:env/server`**, not `process.env` or `import.meta.env`. The schema is declared in `astro.config.mjs` under `env.schema`. Adding a new server secret requires adding it there first.

**Supabase client is per-request and nullable**. `createClient()` in [src/lib/supabase.ts](src/lib/supabase.ts) returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are not set. Every caller must null-check the result before use.

**Auth context flows through `Astro.locals.user`**. Middleware ([src/middleware.ts](src/middleware.ts)) calls `supabase.auth.getUser()` and stores the result in `context.locals.user` (typed in [src/env.d.ts](src/env.d.ts)). Page components read `Astro.locals.user` — they do not call Supabase directly for auth state.

**Route protection is declared in middleware**. Add protected paths to the `PROTECTED_ROUTES` array in [src/middleware.ts](src/middleware.ts); unauthenticated requests are redirected to `/auth/signin`.

**API routes communicate errors via URL query params**, not JSON. On error, routes redirect back to the form page with `?error=<encoded-message>` appended; pages read `Astro.url.searchParams.get("error")` to surface it. See [src/pages/api/auth/signin.ts](src/pages/api/auth/signin.ts) as the canonical example.

**Fetch-driven API routes return 401 on missing auth**, not a redirect. Routes called via `fetch()` (never navigated to directly) should return `new Response("Unauthorized", { status: 401 })` when `context.locals.user` is absent. Form-submission routes (navigated via `<form action="...">`) may redirect to `/auth/signin` instead. The distinction matters because `fetch()` treats any 2xx/3xx as `response.ok = true`, so a redirect would silently appear successful to the client script.

**All dates are UTC; use `formatDate()` / `nowUTC()` from `@/lib/date.ts`**, never bare `new Date().toISOString()`, `toLocaleDateString()`, or any implicit-timezone call. For UI display use `formatDateDisplay()` from the same module — it always passes `timeZone: "UTC"` to `Intl.DateTimeFormat` so the rendered date cannot shift based on the server's or user's locale.

## Business Logic

The shopping list is auto-derived from inventory state: a product appears on the shopping list when `current_quantity < min_threshold` **and** its `addToList` flag is `true` (default ON). The list is a live reflection — no manual curation. Data isolation per user is enforced by Supabase Row-Level Security; never bypass RLS with service-role key for user-facing queries.

---

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt | Use it when |
| --- | --- |
| `/10x-research` | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real). |
| `/10x-plan` | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches. |
| `/10x-implement` | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code. |
| `/10x-tdd` | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point. |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: *Can you name the first red test in one sentence?*

Good conditions for `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer | When to use | When NOT to use |
| --- | --- | --- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client) | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails). | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades. |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code *should* do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern | How it looks | What to do instead |
| --- | --- | --- |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only | Tests only pass valid inputs; edge cases absent. | Add at least one edge case per risk: `null`, empty, dependency error, invalid input. |
| Redundant copies | Six nearly identical tests checking the same absence of a sentinel. | One parameterised test (`it.each`) per property; each test catches a different regression. |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:
1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `.claude/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

<!-- END @przeprogramowani/10x-cli -->
