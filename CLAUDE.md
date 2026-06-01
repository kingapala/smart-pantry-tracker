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

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
