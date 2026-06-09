# Shopping List Check-Off — Plan Brief

> Full plan: `context/changes/shopping-list-complete/plan.md`
> Research: `context/changes/shopping-list-complete/research.md`

## What & Why

Add FR-012 to the shopping list: a "Check off" action that lets users record how much of an item they actually bought. For pantry-linked items, entering a quantity purchased atomically increases the product's inventory `quantity`. For manual one-off items (already shipped in S-04), "checking off" simply removes them from the list — replacing their now-redundant "Delete" with action-appropriate wording.

## Starting Point

S-04 (`shopping-list-core`, archived) shipped more than its name implied: the merged `/shopping-list` view **and** the entire FR-014 manual-item flow (add/view/delete) already exist and work. What's missing is narrower than the roadmap suggested — just the check-off mechanic itself. Today, pantry rows show Edit + Delete (Delete removes the *whole product*, intentionally matching `/inventory`); manual rows show Delete only. A single shared native `<dialog>` + vanilla JS handles both.

## Desired End State

Every row on `/shopping-list` shows a "Check off" button. Clicking it on a pantry row opens a dialog asking how much was bought (empty input, suggested amount shown as a hint); confirming increments the product's inventory and the row disappears or shrinks its "Buy" gap depending on whether enough was bought. Clicking it on a manual row asks "Mark as bought?"; confirming removes it from the list permanently.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| UI architecture | Native `<dialog>` + vanilla JS, no Radix/React island | Matches the page S-04 just shipped and every page in the app except auth forms — zero new deps, copies a pattern three lines away | Plan (overrides pre-S-04 research recommendation) |
| Manual item check-off | Replaces "Delete" (not added alongside it) | Avoids the exact redundancy the chosen option's own tradeoff named — one consistent action per row, no capability lost (`/inventory` still has full delete) | Plan (resolves an ambiguity left open by the question answer) |
| Pantry row action layout | "Check off" replaces "Delete" | Delete-the-whole-product is still reachable via `/inventory`; duplicating it here just adds risk next to the new everyday action | User |
| Post check-off UX | Full redirect/refresh, same as existing delete flow | Identical to the pattern already on this exact page; SSR re-derivation naturally keeps the list a "live reflection" per CLAUDE.md (no manual curation) | User |
| Quantity input default | Empty, with "Buy" gap shown as a placeholder hint | A number that writes directly to inventory shouldn't be silently pre-filled and blindly confirmed — matches the existing manual-item form's placeholder-not-prefill pattern | User |
| Increment mechanism | Fetch current `quantity`, add, write back (no RPC) | No RPC/atomic-update functions exist anywhere in the codebase; every quantity write already follows this exact read-then-write shape | Plan (codebase research) |

## Scope

**In scope:**
- New `POST /api/products/:id/checkoff` endpoint (increments `products.quantity`)
- New qty-purchased dialog on pantry rows, replacing "Delete"
- Relabeled "Check off" control + dialog on manual rows, reusing the existing `DELETE /api/shopping-list-items/:id` endpoint untouched

**Out of scope:**
- Any new npm dependency, React island, or Radix component
- Changes to `/inventory`'s product-deletion behavior
- Database migrations, RPC functions, or triggers
- Concurrency/locking beyond what already exists (none, anywhere)
- "Undo check-off"

## Architecture / Approach

Both phases edit the same file, `src/pages/shopping-list/index.astro`, splitting its single shared delete-confirmation `<dialog>` into two purpose-built dialogs: a number-input dialog for pantry check-off (Phase 1, backed by the new endpoint) and a relabeled yes/no confirm dialog for manual check-off (Phase 2, backed by the existing endpoint). Both follow the established fetch → status-code → client-redirect completion flow already proven on this page.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pantry item check-off | New checkoff endpoint + qty dialog; "Check off" replaces "Delete" on pantry rows | Splitting the shared dialog cleanly — must fully remove the pantry branch from the old dialog's script so two dialogs don't fight over the same trigger class |
| 2. Manual item check-off | "Check off" replaces "Delete" on manual rows; dialog copy updated; same backend endpoint | Purely cosmetic but easy to under-test — must verify the relabeled dialog still actually deletes the row (not just looks different) |

**Prerequisites:** S-04 (`shopping-list-core`) implemented and archived — confirmed done at `context/archive/2026-06-05-shopping-list-core/`.
**Estimated effort:** ~1 session across 2 phases; both touch one file with no schema changes.

## Open Risks & Assumptions

- Assumes no concurrent-purchase scenario needs handling — consistent with the rest of the app (single user per account, RLS-isolated, no optimistic locking anywhere to mirror).
- Assumes `numeric(10,2)` has enough headroom for any realistic `quantity + qty_purchased` sum — same assumption every existing quantity write already makes.

## Success Criteria (Summary)

- A user can check off a pantry item, enter what they actually bought, and see their inventory quantity update accordingly — with the list staying a true "live reflection" (items needing more remain, with a smaller gap).
- A user can check off a manual item and have it permanently leave their list.
- Neither action duplicates or regresses the full product-deletion capability that remains on `/inventory`.
