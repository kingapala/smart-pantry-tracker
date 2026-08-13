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

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
