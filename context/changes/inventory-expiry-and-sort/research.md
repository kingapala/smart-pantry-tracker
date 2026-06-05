---
change_id: inventory-expiry-and-sort
type: research
created: 2026-06-04
---

# Research: inventory-expiry-and-sort

## Question

What libraries are available to implement S-03 (expiry highlighting + session-persistent sort) that are compatible with the project stack (Astro 6 SSR + React 19 + Tailwind CSS 4 + Supabase + Cloudflare Pages)?

## Method

- External web search via exa.ai (date libraries, Tailwind conditional class patterns, Astro SSR URL state)
- Cross-check against `package.json` (installed deps)

---

## Findings

### Verdict: zero new dependencies required

All three S-03 features are covered by libraries already in `package.json` plus native platform APIs.

| Feature | Tool | Source |
|---|---|---|
| Expired date detection | Native JS `<` + `nowUTC()` from `@/lib/date.ts` | Already in project |
| Conditional red class | `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 (`cn()` utility) | Already in project |
| Variant-based styling | `class-variance-authority` ^0.7.1 | Already in project |
| DB-side sort by expiry | `@supabase/supabase-js` `.order('expiry_date')` | Already in project |
| URL sort param read/write | Native `Astro.url.searchParams` | Confirmed working with `output: "server"` |

---

## Feature-by-feature breakdown

### FR-008: Expired products highlighted in red

**Approach:** Conditional Tailwind class via the `cn()` utility (`clsx` + `tailwind-merge`).

```tsx
cn("...", isExpired && "bg-red-50 text-red-600 border-red-200")
```

- `isExpired` = plain JS comparison: `new Date(product.expiry_date) < nowUTC()`
- `nowUTC()` is already mandated by CLAUDE.md / `@/lib/date.ts` — no bare `new Date()` calls.
- `clsx` and `tailwind-merge` are already installed; a `cn()` helper likely exists or is trivial to add.
- Tailwind JIT note: full class strings (`"bg-red-50 text-red-600"`) must appear as literals in source — do not build them from string concatenation.

**No new library needed.**

### FR-009: Sort by expiry date, session-persistent via URL

**DB layer:** Supabase `.order('expiry_date', { ascending: true, nullsFirst: false })` when `?sort=expiry` is present. Sort at the DB level on every request — consistent with the S-04 risk guidance (no client-side caching).

**URL state layer:** `Astro.url.searchParams.get("sort")` in the Astro page frontmatter. Confirmed working with `output: "server"` (already the project config). The roadmap explicitly calls for `?sort=expiry` as the mechanism — no cookie or server-session machinery needed.

Sort links in the UI are plain `<a href="?sort=expiry">` anchors — no client-side router, no state hook.

**No new library needed.**

---

## Libraries evaluated and ruled out

| Library | Why evaluated | Why ruled out |
|---|---|---|
| **date-fns v4** | Robust `isBefore()`, `parseISO()`, full timezone support | Overkill for a single `<` comparison; would be worth adding if "expiring soon" warning colour is ever needed |
| **astro-ssr-table** | Provides `SearchSortHelper` wrapping Astro URL state | Adds a Drizzle dependency; native `Astro.url.searchParams` is sufficient for single-column sort |
| **@ratio-hub/time** | Typed `hasExpired()` helper, branded seconds/ms types | Unnecessary abstraction over a plain date comparison |
| **react-expiry** | Hide components based on expiry date | Hides components, not the use case; session-storage based, not what we need |
| **better-tables** | Full table with URL-persisted filters/sort | Overkill; uses shadcn/ui adapter and Drizzle, not Supabase |

---

## Key constraints confirmed

- **Tailwind dynamic classes:** Class strings must appear as literals in source so Tailwind JIT keeps them. Use an object map or inline ternary — never build class names from string concatenation.
- **Date comparison:** Must use `nowUTC()` from `@/lib/date.ts`, never bare `new Date()` (CLAUDE.md mandate).
- **Sort is server-side:** URL param → Supabase `.order()` → rendered HTML. No client-side sort to avoid stale state.
- **Null expiry dates:** `nullsFirst: false` pushes products with no expiry date to the bottom when sorting ascending — safest UX default.
