# Database Schema + RLS — Plan Brief

> Full plan: `context/changes/db-schema-and-rls/plan.md`

## What & Why

Create the `products` table in Supabase with Row-Level Security policies that enforce per-user data isolation. This is roadmap foundation F-01 — the hardest PRD guardrail ("data isolation must hold unconditionally") is enforced at the database level here, and all 10 inventory + shopping list functional requirements are blocked until it lands.

## Starting Point

`supabase/` contains only `config.toml`; no migrations directory, no SQL files exist. The Supabase client and auth middleware are fully wired, so the auth `user_id` is available for RLS policy expressions from day one.

## Desired End State

The `products` table exists on the hosted Supabase project with 9 columns (including `NUMERIC(10,2)` quantity fields and a nullable `expiry_date`), RLS enabled, and four policies scoping every CRUD operation to the authenticated user's own rows. A `supabase/seed.sql` file is ready for local development use.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Tables in scope | `products` only | `shopping_list_items` requirements may shift before S-05 is built; keep slices self-contained | Plan |
| `quantity` / `min_threshold` type | `NUMERIC(10,2)` | Fractional values (0.5 L, 250.5 g) are real pantry use cases; truncation to integer erodes trust | Plan |
| Primary key | UUID (`gen_random_uuid()`) | Idiomatic Supabase choice; aligns with `auth.users.id` type; non-guessable | Plan |
| Migration workflow | Supabase CLI (`supabase db push`) | Version-controlled, reproducible, CI-compatible | Plan |
| Seed data | Include `supabase/seed.sql` | Lets developers verify shopping list logic before S-02 UI is built | Plan |
| RLS policy scope | 4 operations (SELECT/INSERT/UPDATE/DELETE) | Full CRUD coverage; no operation left unguarded | Roadmap |

## Scope

**In scope:**
- `products` table with all columns required by S-02 and S-04
- `user_id` index for query performance
- RLS enabled + 4 policies (all scoped to `auth.uid() = user_id`)
- `supabase/seed.sql` for local development

**Out of scope:**
- `shopping_list_items` table (S-05)
- `updated_at` column / trigger (no FR requires it)
- Enum for `unit` (free-text per FR-004)
- Seed data applied to hosted project (local dev only)

## Architecture / Approach

Single SQL migration file (`supabase/migrations/20260528000000_products_schema.sql`) that is version-controlled and applied to the hosted project via `supabase db push`. RLS policies use `auth.uid()` — the Supabase built-in that returns the authenticated user's UUID — so isolation is enforced at the database layer with no application code. A separate `supabase/seed.sql` is run locally via `supabase db reset` for development; it never touches the hosted project.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration SQL | `products` table + 4 RLS policies written to disk | SQL error in migration file; must be caught by manual review before applying |
| 2. Seed file | `supabase/seed.sql` covering all shopping list states | Placeholder `user_id` causes FK error if not replaced before `supabase db reset` |
| 3. Link + apply | Migration live on hosted Supabase project, verified in dashboard | `supabase link` requires project ref + DB password; CLI must be installed |

**Prerequisites:** Supabase CLI installed (`npm install -g supabase` or Homebrew); Supabase project ref ID (from dashboard URL); database password.  
**Estimated effort:** ~1 session, 3 short phases — mostly file writing + one CLI command.

## Open Risks & Assumptions

- If the migration is re-run on a non-empty database (e.g., after a failed partial apply), it will fail on `CREATE TABLE` — this is correct behavior; the fix is to roll back with a new `DROP TABLE` migration
- Seed requires a real `user_id` in `auth.users`; developer must sign up first before running `supabase db reset`

## Success Criteria (Summary)

- `supabase db push` exits 0 and the `products` table is visible in the Supabase dashboard with correct schema
- 4 RLS policies are active; an unauthenticated `SELECT * FROM products` query returns 0 rows
- F-01 complete unblocks `/10x-plan inventory-crud` (S-02) as the next change
