# Database Schema + RLS Implementation Plan

## Overview

Create the `products` table in Supabase and enable Row-Level Security so each user can only access their own pantry records. This is foundation F-01 — every inventory and shopping list functional requirement depends on it.

## Current State Analysis

- `supabase/` contains only `config.toml`; no `migrations/` directory, no SQL files exist
- `src/lib/supabase.ts` uses `@supabase/ssr` server client; `createClient()` returns `null` when env vars are absent — all callers must null-check (enforced by lessons.md rule)
- Auth is fully wired: `supabase.auth.getUser()` in middleware, `user_id` available as `Astro.locals.user.id` in every protected page
- `seed.sql` is referenced in `supabase/config.toml` (line 65) but the file does not exist

## Desired End State

After this plan completes:
- `supabase/migrations/20260528000000_products_schema.sql` exists and has been applied to the hosted Supabase project
- The `products` table is visible in the Supabase dashboard Table Editor with all required columns and correct types
- RLS is enabled; a test query run as an unauthenticated or different-user session returns 0 rows
- `supabase/seed.sql` exists with 5 representative sample products (covering below-threshold, above-threshold, expired, and `add_to_list = false` states) and a comment explaining how to update the `user_id` placeholder

### Key Discoveries

- `auth.uid()` is the Supabase built-in that returns the authenticated user's UUID — this is the RLS policy expression throughout
- `gen_random_uuid()` is available natively in PostgreSQL 13+ (Supabase uses PG 17); no extension needed
- The `user_id` FK references `auth.users(id)` with `ON DELETE CASCADE` — deleting a Supabase auth user removes all their products
- PostgreSQL does **not** auto-index foreign keys; an explicit index on `user_id` is needed for query performance on the `WHERE user_id = auth.uid()` filter
- `seed.sql` is run by `supabase db reset` (local), NOT by `supabase db push` (hosted) — seed data is a local-dev convenience only; for the hosted project, data is added via the UI once S-02 is built
- The seed FK constraint requires the placeholder `user_id` to exist in `auth.users` before running `supabase db reset`; the user must sign up first

## What We're NOT Doing

- No `shopping_list_items` table — deferred to S-05 slice
- No `updated_at` column or trigger — not required by any FR; can be added in a later migration if needed
- No custom types or enums for `unit` — free-text per FR-004; enum deferred to v2
- No seed data applied to the hosted project — seed is local-dev only
- No service-role bypass of RLS — all user-facing queries use the anon/user key and go through RLS policies

## Implementation Approach

Write one timestamped SQL migration file that creates the table, adds the `user_id` index, enables RLS, and creates all four policies. Then write the seed file for local development. Then apply the migration to the hosted project with `supabase db push` and verify in the dashboard.

## Phase 1: Migration SQL

### Overview

Write the migration file that defines the `products` table and RLS policies.

### Changes Required

#### 1. Create migrations directory + migration file

**File**: `supabase/migrations/20260528000000_products_schema.sql`

**Intent**: Define the `products` table with all columns required by S-02 and S-04, add a `user_id` index for query performance, enable RLS, and create four policies scoping every operation to the authenticated user's own rows.

**Contract**: The migration must be idempotent-safe in the sense that running it twice on a blank DB produces the same schema (it will fail on re-run, which is correct — migrations are one-way). Column specification:

```sql
create table public.products (
  id            uuid          primary key default gen_random_uuid(),
  user_id       uuid          not null references auth.users(id) on delete cascade,
  name          text          not null,
  quantity      numeric(10,2) not null default 0 check (quantity >= 0),
  unit          text          not null,
  expiry_date   date,
  min_threshold numeric(10,2) not null default 0 check (min_threshold >= 0),
  add_to_list   boolean       not null default true,
  created_at    timestamptz   not null default now()
);

create index on public.products (user_id);

alter table public.products enable row level security;

create policy "products_select" on public.products
  for select using (auth.uid() = user_id);

create policy "products_insert" on public.products
  for insert with check (auth.uid() = user_id);

create policy "products_update" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "products_delete" on public.products
  for delete using (auth.uid() = user_id);
```

The snippet is the full intended SQL — it's the contract other phases and downstream slices (S-02, S-04) depend on for column names and types.

### Success Criteria

#### Automated Verification

- Migration file exists at `supabase/migrations/20260528000000_products_schema.sql`
- File passes syntax check: `supabase db lint` (if CLI is available locally) exits with no errors

#### Manual Verification

- Read the migration file and confirm all 9 columns are present with correct types and constraints
- Confirm 4 RLS policies are present (select, insert, update, delete)
- Confirm `add_to_list` defaults to `true` and `quantity`/`min_threshold` default to `0`

**Implementation Note**: After Phase 1, pause for manual review of the SQL before applying to the hosted database. Schema errors caught here cost nothing; caught after data is written they require a data-loss migration.

---

## Phase 2: Seed File

### Overview

Write `supabase/seed.sql` for local development use. Covers all states the shopping list logic must handle.

### Changes Required

#### 1. Create seed file

**File**: `supabase/seed.sql`

**Intent**: Provide a set of sample products that exercise every branch of the shopping list business rule — below threshold (appears on list), above threshold (does not appear), expired, and `add_to_list = false` (excluded regardless of quantity). A developer running `supabase db reset` gets a pre-populated database for manual testing without needing S-02 UI first.

**Contract**: Five INSERT rows using a placeholder UUID. A comment at the top of the file instructs the developer to replace the placeholder with their real auth user UUID (found in Supabase dashboard → Authentication → Users) and to run `supabase db reset` (not `supabase db push` — seed is local only). The file must not hard-code expiry dates as absolute values; use `current_date` offsets so the expired/fresh states are always relative to when the seed is run.

### Success Criteria

#### Automated Verification

- File exists at `supabase/seed.sql`

#### Manual Verification

- File contains 5 rows covering: below-threshold+on-list, above-threshold+on-list, expired+below-threshold, zero-quantity+on-list, above-threshold+`add_to_list=false`
- Comment clearly explains the `user_id` replacement step and the `supabase db reset` command
- No hard-coded absolute dates — expiry offsets use `current_date`

---

## Phase 3: Link Project + Apply Migration

### Overview

Link the local Supabase CLI to the hosted project, apply the migration with `supabase db push`, and verify the schema and RLS are correct in the dashboard.

### Changes Required

#### 0. Pre-check: confirm .supabase/ is gitignored

**File**: `.gitignore`

**Intent**: `supabase link` writes a `.supabase/` directory locally. Confirm it is excluded from version control before running the command, so local project config is never accidentally committed.

**Contract**: Open `.gitignore` and verify `.supabase/` (or `.supabase`) appears. If absent, add it before proceeding.

#### 1. Link Supabase project

**File**: n/a (CLI operation)

**Intent**: Connect the local Supabase CLI to the hosted project so `supabase db push` knows which project to target. Requires the project reference ID from the Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`).

**Contract**: `supabase link --project-ref <ref>` — the CLI will prompt for the database password. This writes a `.supabase/` config file locally (gitignored per step 0).

#### 2. Apply migration

**File**: n/a (CLI operation)

**Intent**: Push the migration file to the hosted Supabase project, creating the `products` table and RLS policies.

**Contract**: `supabase db push` — applies all unapplied migrations from `supabase/migrations/` to the linked project. Exits 0 on success.

### Success Criteria

#### Automated Verification

- `supabase db push` exits with code 0 and reports the migration as applied

#### Manual Verification

- Supabase dashboard → Table Editor: `products` table is visible with all 9 columns
- Supabase dashboard → Authentication → Policies: 4 policies are listed for the `products` table
- Supabase dashboard → SQL Editor: verify RLS isolation by inserting one test row first (Table Editor, using your real `user_id`), then run:
  ```sql
  -- Simulate an unauthenticated/anon session — bypasses nothing by default, SET ROLE does
  SET ROLE anon;
  SELECT * FROM public.products LIMIT 10;
  -- Expected: 0 rows (RLS filters anon session even though data exists)
  RESET ROLE;
  ```
  This proves RLS is filtering, not that the table is empty. Clean up the test row after (or it will be removed on `supabase db reset`).
- Supabase dashboard → SQL Editor: run `\d public.products` equivalent — confirm `add_to_list` default is `true`, `quantity` and `min_threshold` have `CHECK (value >= 0)` constraints

**Implementation Note**: After Phase 3 completes and manual verification passes, the roadmap status for F-01 can be updated to `done` and `/10x-archive db-schema-and-rls` can be run to close this change.

---

## Testing Strategy

### Automated Tests

None for this slice — the migration is a schema change with no application code. The success criteria for Phase 3 (exit code 0 + dashboard verification) are the test.

### Manual Testing Steps

1. Sign into the hosted Supabase project as user A; note the user UUID
2. In the dashboard SQL Editor, run: `select * from public.products` — verify 0 rows returned (empty pantry, no auth)
3. Via S-02 UI (once built): add a product as user A; verify it appears under user A's session only
4. Use a second account (user B) and confirm user A's products are not visible

---

## Migration Notes

- Migration filename timestamp `20260528000000` is derived from today's date (2026-05-28); if the migration file is created on a different day, adjust the timestamp prefix accordingly
- `supabase db push` tracks applied migrations in a `supabase_migrations` metadata table on the hosted project — do not delete or rename the migration file after it has been applied
- If schema changes are needed after data has been written, create a new migration file rather than editing this one

## References

- Roadmap: `context/foundation/roadmap.md` — F-01 entry (lines 62–73)
- PRD: `context/foundation/prd.md` — FR-004–FR-014, Access Control section, Business Logic section
- Supabase client: `src/lib/supabase.ts`
- Middleware (auth context): `src/middleware.ts`
- Lessons: `context/foundation/lessons.md` — null-check rule, date UTC rule

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Migration SQL

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/20260528000000_products_schema.sql`
- [x] 1.2 `supabase db lint` exits with no errors (if CLI available)

#### Manual

- [x] 1.3 All 9 columns present with correct types and constraints
- [x] 1.4 4 RLS policies present (select, insert, update, delete)
- [x] 1.5 `add_to_list` defaults to `true`; `quantity`/`min_threshold` default to `0`

### Phase 2: Seed File

#### Automated

- [ ] 2.1 File exists at `supabase/seed.sql`

#### Manual

- [ ] 2.2 5 rows covering all shopping list states (below-threshold, above-threshold, expired, zero-qty, add_to_list=false)
- [ ] 2.3 Comment explains user_id replacement step and `supabase db reset` command
- [ ] 2.4 No hard-coded absolute dates — expiry uses `current_date` offsets

### Phase 3: Link Project + Apply Migration

#### Automated

- [ ] 3.1 `supabase db push` exits with code 0

#### Manual

- [ ] 3.2 `products` table visible in dashboard Table Editor with all 9 columns
- [ ] 3.3 4 RLS policies listed in dashboard Authentication → Policies
- [ ] 3.4 RLS isolation verified: test row inserted, SET ROLE anon returns 0 rows in SQL Editor
- [ ] 3.5 `add_to_list` default and `CHECK` constraints confirmed in dashboard
