# Database Schema, RLS, and Inventory CRUD — Plan Brief

> Full plan: `context/changes/db-schema-and-rls/plan.md`

## What & Why

We're building the foundational data layer and full inventory management UI for Smart Pantry Tracker. The `products` table (with Row-Level Security) is the prerequisite for all inventory and shopping list features — without it, there is nothing to track. This combined delivery (F-01 + S-02) unblocks S-04, the north-star feature (auto-generated shopping list).

## Starting Point

Supabase is configured locally (PostgreSQL 17, seed support enabled). Auth middleware and the `?error=` redirect pattern are established. No `products` table, no inventory pages, and no CRUD API routes exist yet.

## Desired End State

A logged-in user can add products to their inventory, view the full list, edit any product's fields, and delete a product after confirming. All data is strictly isolated per user (RLS enforced at the DB layer). The foundation is in place for S-03 (expiry highlights) and S-04 (shopping list).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Quantity/threshold type | `numeric(10,2)` | Exact decimal avoids floating-point drift; handles fractional kitchen units (0.5 l). |
| Migration structure | Split: schema+RLS then index | Keeps required schema separate from optimization; index failure doesn't block core functionality. |
| Shopping list index | Partial `user_id WHERE add_to_list = true` | Directly targets the S-04 query; smaller index, faster scan on every list page load. |
| Dev seed data | 6 rows, all business logic states | Enables immediate testing of threshold logic without manual data entry. |
| Add/edit forms | Dedicated Astro SSR pages | Matches Astro-first pattern — no client state needed; consistent with established auth pages. |
| Delete confirmation | React modal with ARIA | Native `confirm()` is not WCAG 2.1 AA compliant (no focus management, no ARIA labels). |

## Scope

**In scope:**
- `products` table, RLS policies, indexes, dev seed (F-01)
- Inventory list page, add form page, edit form page (S-02)
- `DeleteConfirmDialog.tsx` React component
- API routes: `POST`, `PUT`, `DELETE` at `/api/products`
- Middleware update: add `/inventory` to `PROTECTED_ROUTES`

**Out of scope:**
- Inline quantity stepper (v2 per PRD)
- Expiry highlighting / sort-by-expiry (S-03)
- Shopping list UI (S-04)
- Soft delete, inventory search, or grouping

## Architecture / Approach

Standard Astro SSR CRUD flow. Phase 1 creates the DB layer; Phase 2 wires API routes following the established `?error=` redirect pattern (canonical: `src/pages/api/auth/signin.ts`); Phase 3 renders SSR pages reading auth state from `Astro.locals.user`. A single React island (`DeleteConfirmDialog.tsx`) handles the confirmation dialog for a11y compliance — the only client-side component in this slice.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database Foundation | `products` table + RLS + indexes + seed | Incorrect RLS policy could allow cross-user data access — must verify with two test users |
| 2. Inventory API Routes | CRUD endpoints following auth pattern | IDOR if `user_id` taken from request body instead of `Astro.locals.user` |
| 3. Inventory UI | List page + add/edit forms + delete dialog | a11y compliance in delete dialog; `expiry_date` timezone drift if passed through `new Date()` |

**Prerequisites:** Supabase project configured locally; sign-in auth flow working
**Estimated effort:** ~1–2 sessions across 3 phases

## Open Risks & Assumptions

- Seed file requires manual UUID substitution before first use — a dev setup step that could be missed
- `expiry_date` must be passed as a `YYYY-MM-DD` string directly to Supabase — routing it through `new Date()` would shift the date per the UTC lessons rule
- The `DELETE` handler approach for the React form island depends on whether Astro's routing supports a method override pattern (`_method=DELETE`) or requires a direct `DELETE` fetch

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly; two-user RLS isolation confirmed with two local test accounts
- Authenticated user can complete the full inventory CRUD loop (add → view → edit → delete) without errors
- Delete confirmation dialog is keyboard-navigable; all flows meet WCAG 2.1 AA tab/focus requirements
