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

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
