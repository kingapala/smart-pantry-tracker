# Database Schema, RLS, and Inventory CRUD Implementation Plan

## Overview

Build the foundational data layer and full inventory management UI for Smart Pantry Tracker. Phase 1 creates the `products` table with per-user Row-Level Security (F-01). Phases 2–3 add the inventory CRUD API routes and web interface so users can add, view, edit, and delete products (S-02). Together these unblock the north-star feature S-04 (auto-generated shopping list).

## Current State Analysis

- Supabase is configured and running locally (`supabase/config.toml`, PostgreSQL 17, seed enabled via `supabase/seed.sql`)
- Supabase client factory at `src/lib/supabase.ts` returns `null` when env vars are absent — every caller must null-check before use
- Auth middleware at `src/middleware.ts` populates `Astro.locals.user` and enforces `PROTECTED_ROUTES` redirects
- Error feedback pattern established: API routes redirect to the form page with `?error=<message>`; canonical example at `src/pages/api/auth/signin.ts`
- No `products` table exists; no inventory pages or API routes exist

Lessons in effect: null-check `createClient()`; always use `formatDate()` / `nowUTC()` / `formatDateDisplay()` from `@/lib/date.ts` — never bare `new Date()` or locale-specific calls.

## Desired End State

- A `products` table exists in Supabase; RLS policies ensure every user can only read and write their own rows — no cross-user access is possible even with a direct SQL query
- A logged-in user can add products to their inventory, view the full list, edit any product's fields, and delete a product after confirming in a dialog
- All CRUD operations produce visible feedback within 2 seconds (success redirect or `?error=` message)
- All inventory routes require authentication and redirect to `/auth/signin` when unauthenticated

### Key Discoveries:

- `src/pages/api/auth/signin.ts` — canonical `?error=<message>` redirect pattern to follow for all new API routes
- `src/middleware.ts` — `PROTECTED_ROUTES` array; add `/inventory` prefix here
- `src/lib/supabase.ts` — nullable client; null-check on every API route before any query
- `src/lib/date.ts` — `formatDate()` for DB writes, `formatDateDisplay()` for UI rendering, `nowUTC()` for timestamps

## What We're NOT Doing

- Inline quantity stepper — PRD FR-006 explicitly deferred to v2; only the full edit form ships here
- Expiry highlighting or sort-by-expiry — that is S-03, depends on S-02
- Shopping list UI — that is S-04, depends on S-02
- Soft delete — PRD FR-007: confirmation dialog + hard delete is sufficient for MVP
- Inventory search or grouping — PRD deferred to v2
- Service-role key bypass for RLS — never bypass RLS for user-facing queries (PRD guardrail)

## Implementation Approach

Schema first, then API routes, then UI — the standard "database changes → API → clients" progression. Each phase is independently deployable and verifiable. The DB phase is the prerequisite for everything; API routes follow the established auth pattern exactly; UI uses dedicated Astro SSR pages for add/edit (no client-side state needed) and a single React island only for the delete confirmation dialog (required for WCAG 2.1 AA focus management).

## Critical Implementation Details

**IDOR prevention**: `user_id` in INSERT must come from `Astro.locals.user.id` — never from the request body. For UPDATE and DELETE, include `.eq('user_id', user.id)` in the Supabase query even though RLS already enforces it. Defense in depth.

**expiry_date handling**: HTML date inputs produce `YYYY-MM-DD` strings. Pass this string directly to Supabase as a `date` value — do not round-trip through `new Date()`, which would apply the server's local timezone and shift the stored date. An empty string from the optional field must map to `null`.

**add_to_list checkbox**: Unchecked HTML checkboxes are absent from `FormData`. Treat a missing `add_to_list` key as `false`, not as an error.

---

## Phase 1: Database Foundation

### Overview

Create the `products` table with all required columns, enable Row-Level Security with four policies scoped to `auth.uid() = user_id`, add the `user_id` index for per-user query performance, add a second partial index for the shopping list query, and wire up a development seed file with six named rows covering all distinct business logic states.

### Changes Required:

#### 1. Products schema migration

**File**: `supabase/migrations/20260528000000_products_schema.sql`

**Intent**: Create the `products` table and enforce per-user data isolation through RLS. This migration is the prerequisite for all inventory and shopping list features.

**Contract**: Table `public.products` with columns: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `name text NOT NULL`, `quantity numeric(10,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0)`, `unit text NOT NULL`, `expiry_date date` (nullable), `min_threshold numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_threshold >= 0)`, `add_to_list boolean NOT NULL DEFAULT true`, `created_at timestamptz NOT NULL DEFAULT now()`. RLS enabled; four named policies (`products_select`, `products_insert`, `products_update`, `products_delete`) all binding to `auth.uid() = user_id`. Plain `CREATE INDEX ON public.products (user_id)`.

#### 2. Shopping list query index migration

**File**: `supabase/migrations/20260602000000_products_add_to_list_index.sql`

**Intent**: Add a partial index to speed up the S-04 shopping list query (`WHERE user_id = $1 AND add_to_list = true AND quantity < min_threshold`). Kept as a separate migration so schema and optimization have independent apply/rollback histories.

**Contract**: `CREATE INDEX ON public.products (user_id) WHERE add_to_list = true;`

#### 3. Development seed file

**File**: `supabase/seed.sql`

**Intent**: Provide six named test rows covering all distinct business logic states so S-02 and S-04 development can be verified immediately after `supabase db reset` without manual data entry.

**Contract**: Six `INSERT INTO public.products` rows with a UUID placeholder for `user_id` (developer substitutes their local user UUID before first use, per instructions at top of file). States covered: below-threshold + on-list (→ appears on shopping list), above-threshold + on-list (→ does not appear), expired + below-threshold (→ appears + expired highlight), zero-quantity + on-list (→ appears), above-threshold + off-list (→ excluded by flag), below-threshold + off-list (→ excluded by flag). Each row is annotated with its expected shopping list state.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset` exits 0
- Lint passes: `npm run lint`

#### Manual Verification:

- Sign in as two different local test users; insert a product as User A; confirm User B's inventory is empty — cross-user isolation holds
- Insert a product with `expiry_date` left blank — confirms the column is nullable as required by PRD FR-004
- After `supabase db reset`, all six seed rows are present in the `products` table

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Inventory API Routes

### Overview

Add the three API endpoints that back the inventory CRUD UI: POST (add product), PUT (edit product), DELETE (delete product). All routes follow the established auth and error-redirect pattern.

### Changes Required:

#### 1. Add product endpoint

**File**: `src/pages/api/products/index.ts`

**Intent**: Accept a POST with product form data, insert a new row scoped to the authenticated user, and redirect to the inventory list on success.

**Contract**: Exports `POST` handler. Reads user from `Astro.locals.user`; redirects to `/auth/signin` if absent. Calls `createClient(context.request.headers, context.cookies)` and null-checks the result; redirects with `?error=Unavailable` if null. Parses `name`, `quantity` (parseFloat), `unit`, `expiry_date` (empty string → null), `min_threshold` (parseFloat), `add_to_list` (absent key → false) from `request.formData()`. Inserts into `products` with `user_id = locals.user.id`. On Supabase error, redirects to `/inventory/new?error=${encodeURIComponent(error.message)}`. On success, redirects to `/inventory`.

#### 2. Edit and delete product endpoints

**File**: `src/pages/api/products/[id].ts`

**Intent**: Handle PUT (update all fields) and DELETE (remove product) for a specific product. Both operations scope to the authenticated user via an explicit `.eq('user_id', user.id)` filter in addition to RLS.

**Contract**: Exports `PUT` and `DELETE` handlers. Both read `params.id` and `Astro.locals.user`; redirect to signin if user absent. Call `createClient(context.request.headers, context.cookies)` and null-check; redirect with `?error=Unavailable` if null. `PUT` parses the same fields as the add endpoint and calls `.update(fields).eq('id', id).eq('user_id', user.id)`. `DELETE` calls `.delete().eq('id', id).eq('user_id', user.id)`. Both redirect to `/inventory` on success and to `/inventory?error=${encodeURIComponent(error.message)}` on failure.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Lint passes: `npm run lint`

#### Manual Verification:

- POST `/api/products` with valid data creates a product and redirects to `/inventory`
- PUT `/api/products/[id]` updates all fields and redirects to `/inventory`
- DELETE `/api/products/[id]` removes the product and redirects to `/inventory`
- PUT or DELETE with another user's product ID produces no change (RLS + explicit user filter)
- POST with a missing required field shows a `?error=` message on the add form page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 3.

---

## Phase 3: Inventory UI

### Overview

Add the inventory list page, add form page, edit form page, and the delete confirmation React component. All pages are SSR-rendered, protected by adding `/inventory` to `PROTECTED_ROUTES`, and follow the `?error=` feedback pattern.

### Changes Required:

#### 1. Inventory list page

**File**: `src/pages/inventory/index.astro`

**Intent**: Display all products for the authenticated user in a readable list with Edit and Delete actions per row. Serves as the landing destination after add/edit/delete operations.

**Contract**: SSR Astro page. Reads `Astro.locals.user`; redirects to `/auth/signin` if absent. Queries `products` via null-checked `createClient()`, ordered by `created_at`. Renders each product row: name, quantity + unit, expiry date via `formatDateDisplay()` from `@/lib/date.ts`, min_threshold, add_to_list state, Edit link to `/inventory/[id]/edit`, Delete button rendering `<DeleteConfirmDialog client:load productId={id} productName={name} />`. Displays `Astro.url.searchParams.get("error")` alert if present. Displays empty-state message when no products. Includes link to `/inventory/new`.

#### 2. Add product page

**File**: `src/pages/inventory/new.astro`

**Intent**: Render the form for creating a new product.

**Contract**: SSR Astro page. Form POSTs to `/api/products` with fields: `name` (required text), `quantity` (required number, min 0), `unit` (required text), `expiry_date` (optional date), `min_threshold` (required number, min 0), `add_to_list` (checkbox, `defaultChecked`). Displays `?error=` message from `Astro.url.searchParams` if present.

#### 3. Edit product page

**File**: `src/pages/inventory/[id]/edit.astro`

**Intent**: Render the edit form pre-populated with the existing product's current values.

**Contract**: SSR Astro page. Reads `params.id` and `Astro.locals.user`. Fetches product by `id` and `user_id`; returns 404 if not found or not owned by the current user. Pre-populates all form fields. `expiry_date` input value is set from the raw Supabase value directly — it is already `YYYY-MM-DD` for a `date` column; do not pass through `formatDate()`, which returns ISO 8601 and will render the input blank. The form renders with `method="post"` for HTML validity; an inline `<script>` intercepts the `submit` event, prevents default, and issues `fetch('/api/products/${params.id}', { method: 'PUT', body: new FormData(form) })`. On a 2xx response the script redirects to `/inventory`; on error it appends `?error=` to the current URL. Displays `?error=` from search params on page load.

#### 4. Delete confirmation dialog component

**File**: `src/components/DeleteConfirmDialog.tsx`

**Intent**: React island providing an accessible confirmation dialog before deleting a product. Native `confirm()` is not WCAG 2.1 AA-compliant — no ARIA labeling, no focus management.

**Contract**: React component rendered with `client:load`. Props: `productId: string`, `productName: string`. Renders a trigger button ("Delete"). On click, opens a modal dialog with `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to a heading containing the product name. "Confirm" button calls `fetch('/api/products/${productId}', { method: 'DELETE' })` and, on a 2xx response, sets `window.location.href = '/inventory'`. "Cancel" closes the dialog and returns focus to the trigger button. `Escape` key also closes the dialog. No HTML form — fetch is required because HTML forms cannot issue DELETE requests.

#### 5. Protect inventory routes in middleware

**File**: `src/middleware.ts`

**Intent**: Ensure all `/inventory/*` paths require authentication, consistent with the existing `PROTECTED_ROUTES` pattern.

**Contract**: Add `/inventory` to the `PROTECTED_ROUTES` array so any request with a path starting with `/inventory` that lacks a valid session is redirected to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build` (requires `SUPABASE_URL` + `SUPABASE_KEY` env vars)

#### Manual Verification:

- Unauthenticated visit to `/inventory` redirects to `/auth/signin`
- Authenticated user sees empty state, adds a product, and sees it in the list
- Edit form pre-populates all fields correctly; saving updates the product in the list
- Delete confirmation dialog opens showing the product name; Cancel closes without deleting; Confirm removes the product from the list
- All flows are keyboard-navigable: Tab through form fields, Enter to submit, Escape to close dialog, Tab to reach Delete button, Enter to open dialog
- Error messages display correctly on failed add/edit/delete operations
- No regressions on auth pages or dashboard after adding the inventory routes

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npx supabase db reset` — confirm six seed rows appear for the placeholder user UUID
2. Sign up two test accounts; add products as User A; sign in as User B — confirm empty list (RLS isolation)
3. Add product without expiry date — verify it saves and displays without errors
4. Add product with an expiry date — verify `formatDateDisplay()` renders the correct UTC date in the list
5. Edit a product, change all fields including toggling `add_to_list` — verify all changes persist
6. Delete a product via confirmation dialog — verify it disappears from the list
7. Keyboard-only run: Tab to Add link → Tab through form → Enter to submit → Tab to Edit link → Tab to Delete button → Enter → Escape to close → Enter to confirm delete
8. Trigger an error (submit with empty name field) — verify `?error=` message appears on the form page

## References

- PRD: `context/foundation/prd.md` — FR-004–FR-007, Business Logic, Access Control, NFR
- Roadmap: `context/foundation/roadmap.md` — F-01, S-02
- Canonical error pattern: `src/pages/api/auth/signin.ts`
- Protected routes: `src/middleware.ts`
- Date utilities: `src/lib/date.ts`
- Supabase client: `src/lib/supabase.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Foundation

#### Automated

- [ ] 1.1 Migrations apply cleanly: `npx supabase db reset` exits 0
- [x] 1.2 Lint passes: `npm run lint` — c397500

#### Manual

- [ ] 1.3 Two-user isolation verified: User A's products not visible to User B
- [ ] 1.4 Nullable expiry_date confirmed: product without expiry date saves without error
- [ ] 1.5 Seed rows present after `supabase db reset`

### Phase 2: Inventory API Routes

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — 38bc9b6
- [x] 2.2 Lint passes: `npm run lint` — 38bc9b6

#### Manual

- [x] 2.3 POST creates product and redirects to `/inventory` — 960c08a
- [x] 2.4 PUT updates all fields and redirects to `/inventory` — 960c08a
- [x] 2.5 DELETE removes product and redirects to `/inventory` — 960c08a
- [ ] 2.6 Cross-user PUT/DELETE produces no change
- [x] 2.7 Missing required field shows `?error=` on form page — 960c08a

### Phase 3: Inventory UI

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — 8ba43cb
- [x] 3.2 Lint passes: `npm run lint` — 8ba43cb
- [x] 3.3 Build succeeds: `npm run build` — 8ba43cb

#### Manual

- [x] 3.4 Unauthenticated visit to `/inventory` redirects to `/auth/signin` — 960c08a
- [x] 3.5 Empty state shown; added product appears in list — 960c08a
- [x] 3.6 Edit form pre-populates correctly; save updates product — 960c08a
- [x] 3.7 Delete dialog shows product name; Cancel closes; Confirm deletes — 960c08a
- [x] 3.8 Keyboard navigation works end-to-end (Tab, Enter, Escape) — 960c08a
- [x] 3.9 Error messages display on failed operations — 960c08a
- [x] 3.10 No regressions on auth pages or dashboard — 960c08a
