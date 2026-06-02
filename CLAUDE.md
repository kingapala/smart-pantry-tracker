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

**All dates are UTC; use `formatDate()` / `nowUTC()` from `@/lib/date.ts`**, never bare `new Date().toISOString()`, `toLocaleDateString()`, or any implicit-timezone call. For UI display use `formatDateDisplay()` from the same module — it always passes `timeZone: "UTC"` to `Intl.DateTimeFormat` so the rendered date cannot shift based on the server's or user's locale.

## Business Logic

The shopping list is auto-derived from inventory state: a product appears on the shopping list when `current_quantity < min_threshold` **and** its `addToList` flag is `true` (default ON). The list is a live reflection — no manual curation. Data isolation per user is enforced by Supabase Row-Level Security; never bypass RLS with service-role key for user-facing queries.

---

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
