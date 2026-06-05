# Inventory CRUD — Plan Brief

> Full plan: `context/changes/inventory-crud/plan.md`

## What & Why

S-02 delivers the full inventory management UI: add, view, edit, and delete products. The CRUD implementation already exists in the codebase and is functionally correct against all four FRs. The work remaining is a targeted gap-fill: adding navigation (Topbar) to inventory pages, a Dashboard link back to the pantry, and two WCAG 2.1 AA accessibility fixes.

## Starting Point

Five files are fully implemented — three Astro pages (`inventory/index.astro`, `inventory/new.astro`, `inventory/[id]/edit.astro`) and two API routes (`api/products/index.ts`, `api/products/[id].ts`). Auth guards, user_id isolation, null-checks, and error handling are all in place and follow project conventions. The Topbar component exists but is not wired to any inventory page.

## Desired End State

After this plan: any authenticated user landing on `/inventory` sees the Topbar (email + Dashboard link + Sign out), can add/view/edit/delete products entirely by keyboard, and reaches a Dashboard page that links back to the pantry. Delete confirmation dialog focus returns to the triggering button on close. All PRD FRs for S-02 are verified manually against a live environment.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Verify + patch, not rebuild | All FRs are implemented correctly; effort goes to the 4 identified gaps. | Plan |
| Topbar placement | All 3 inventory pages | Users must always have sign-out access; parity with other app pages. | Plan |
| Form page layout | Restructure outer div to flex-col | Topbar breaks vertical centering of form cards — wrapper preserves centred feel. | Plan |
| Dashboard | Add "Open Pantry" link | Dashboard is reachable from Topbar; without a pantry link it's a dead end. | Plan |
| Delete dialog fix | Patch vanilla JS, not migrate to React component | `DeleteConfirmDialog.tsx` exists and handles focus correctly, but migration is heavier than a 3-line JS fix given the `speed` goal. | Plan |
| A11y scope | Known gaps only (focus return + Edit aria-labels) | Full audit expands scope beyond MVP need; two gaps are confirmed and actionable. | Plan |

## Scope

**In scope:**
- Topbar added to `inventory/index.astro`, `inventory/new.astro`, `inventory/[id]/edit.astro`
- "Open Pantry" link added to `dashboard.astro`
- Delete dialog focus return fix in `inventory/index.astro` script block
- `aria-label` added to Edit links in inventory table
- Full manual verification pass against FR-004–FR-007 and NFRs

**Out of scope:**
- Migrating vanilla delete dialog to `DeleteConfirmDialog.tsx`
- Inline quantity stepper (PRD v2)
- List search, grouping, or pagination (PRD v2)
- Full WCAG 2.1 AA audit beyond two known gaps
- Integration or E2E tests (carried by S-04)

## Architecture / Approach

No new files, no schema changes, no new API routes. Three phases: patch navigation (component import + link), patch accessibility (JS var + HTML attribute), then a full manual verification checklist. All changes are in existing files already on the critical path.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Navigation | Topbar on all inventory pages; Dashboard → Pantry link | Layout restructuring on form pages could break vertical centring if wrapper is mis-applied |
| 2. Accessibility | Dialog focus return; Edit aria-labels | `close` event approach covers all close paths — confirm Escape path specifically during testing |
| 3. Verification | Manual sign-off on every FR and NFR for S-02 | If any gap surfaces, fix before marking done (no code changes are pre-planned for this phase) |

**Prerequisites:** F-01 (done), S-01 (done), live Supabase connection for manual testing.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Manual testing assumes a configured local dev environment with a live Supabase project (`SUPABASE_URL` + `SUPABASE_KEY` set).
- The data-isolation test requires two separate user accounts to verify cross-user redirect behaviour.

## Success Criteria (Summary)

- All three inventory pages display the Topbar and the Dashboard links back to `/inventory`
- Delete dialog Escape/Cancel restores keyboard focus to the triggering Delete button
- FR-004 through FR-007 pass manual testing against a live environment with no defects
