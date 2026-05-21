---
project: "Smart Pantry Tracker"
version: 1
status: draft
created: 2026-05-20
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

A single adult managing their own household opens the fridge and finds yogurt that expired three days ago — money and a meal gone. The same person stands at the supermarket unsure whether they have pasta at home, so they buy a second pack. The underlying problem is not memory failure; it is that every existing tracking mechanism (mental model, notes app, fridge whiteboard) requires the user to maintain two parallel lists — inventory and shopping — and the cost of that dual maintenance reliably exceeds the perceived benefit, so the habit collapses within weeks.

The insight is structural: if the shopping list is derived automatically from inventory state — specifically when a product's quantity falls below a user-set minimum — the user only ever maintains one source of truth. The cognitive overhead of dual maintenance disappears. No mental-model app does this. No notes app does this. The product's value is the closed loop, not the list.

## User & Persona

### Primary persona

**Name/role:** A single adult running their own household.
**Context:** Lives alone or with a partner; cooks most meals at home; shops roughly once a week. Already tries to track what's in the kitchen but abandons the habit when the maintenance cost spikes.
**The moment they reach for this product:** Standing at the fridge, holding something that expired before they used it. Or standing at the checkout, not sure whether they already have the item in their hand.
**What they want:** One place where "what I have" automatically feeds "what I need to buy." They do not want to manage two systems.

## Success Criteria

### Primary
- A user can add 5 products to their inventory and verify the shopping list state in under 60 seconds from a standing start.
- 100% of products whose current quantity is at or below their minimum threshold are correctly shown on the shopping list. No false positives (above-threshold products do not appear); no false negatives (below-threshold products always appear).

### Secondary
- The core product flow ("user reduces a product's quantity below threshold → shopping list updates automatically") is covered by at least one E2E test that runs and passes on every CI/CD deploy.

### Guardrails
- **Data isolation must hold unconditionally.** User A must never be able to view, modify, or delete any pantry record belonging to user B. A breach here is a hard regression regardless of feature completeness elsewhere.

## User Stories

### US-01: Product consumption triggers shopping list update

- **Given** a logged-in user with a product "Milk" (quantity: 2 litres, minimum threshold: 1 litre)
- **When** the user updates the product quantity to 0 (used the last of it)
- **Then** "Milk" immediately appears on the user's shopping list

#### Acceptance Criteria
- The shopping list update happens without a page reload or manual action
- The product entry in the inventory remains visible (with quantity 0), not deleted
- No other product's shopping list status is affected by this update

## Functional Requirements

### Authentication
- FR-001: User can register an account with email and password. Priority: must-have
  > Socrates: Counter-argument considered: "email+password without a password-reset flow leaves users permanently locked out." Resolution: accepted — FR-013 added as must-have to cover password reset before MVP ships.

- FR-002: User can sign in with their registered email and password. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

- FR-003: User can sign out of their account. Priority: must-have
  > Socrates: No counter-argument; sign-out is a basic expectation for any app with per-user data.

- FR-013: User can request a password reset; the system sends a reset link to their registered email address. Priority: must-have
  > Socrates: Added as a result of FR-001 challenge. Without it, auth is incomplete UX.

### Inventory
- FR-004: User can add a product to their inventory (name, quantity, unit, **optional** expiry date, minimum threshold). Priority: must-have
  > Socrates: Counter-argument accepted: "expiry date mandatory for staples like salt/oil forces fake data and erodes trust in the red-highlight feature." Resolution: expiry date is now optional at product creation. Products without an expiry date are never shown in red.

- FR-005: User can view their full product inventory list. Priority: must-have
  > Socrates: Counter-argument noted: "a list of 30+ items becomes hard to scan without search or grouping." Resolution: acknowledged; flat list is sufficient for MVP scale. Search/grouping deferred to v2.

- FR-006: User can update any field of an existing product. Priority: must-have
  > Socrates: Counter-argument noted: "updating quantity is the 90% case; a full edit form adds friction." Resolution: kept as written for MVP; UX optimisation (inline quantity stepper) deferred to v2.

- FR-007: User can delete a product from their inventory. Priority: must-have
  > Socrates: Counter-argument accepted: "accidental deletion is irreversible without confirmation." Resolution: deletion requires an explicit user confirmation step. No soft-delete for MVP; confirmation dialog is sufficient.

- FR-008: User can see expired products visually highlighted (red) in their inventory. Priority: must-have
  > Socrates: Counter-argument noted: "the highlight is invisible if the user doesn't open the app." Resolution: acknowledged limitation — push notifications are an explicit MVP non-goal. Red highlight is the MVP approach; passive signalling is accepted.

- FR-009: User can sort their inventory by expiry date. Priority: must-have
  > Socrates: Counter-argument accepted: "sort state that resets on every navigation feels broken." Resolution: the chosen sort order must persist across navigation within the session.

### Shopping list
- FR-010: System automatically includes any product whose current quantity is below its minimum threshold **and whose `addToList` flag is ON** on the user's shopping list. Priority: must-have
  > Socrates: Counter-argument triggered a rule clarification: the original `current_quantity < min_threshold` rule fires even for products the user no longer wants to restock. Resolution: each product carries an explicit `addToList` boolean (default ON). Products with `addToList = OFF` are excluded from the shopping list regardless of quantity. This also resolves the "permanently polluted list" problem in FR-011.

- FR-011: User can view their shopping list. Priority: must-have
  > Socrates: Counter-argument accepted: "a purely auto-generated list can't include one-off items not tracked in the pantry — users need a parallel manual list." Resolution: FR-014 added as must-have.

- FR-012: User can check off a shopping list item and enter the quantity purchased; the product's inventory quantity increases by that amount. Priority: must-have
  > Socrates: No counter-argument; it stands as written.

- FR-014: User can manually add an arbitrary item to their shopping list (not linked to a pantry product). Priority: must-have
  > Socrates: Added as a result of FR-011 challenge. Resolves the gap where one-off items (a spice, a household item) cannot be captured in the auto-generated list.

## Non-Functional Requirements

- Any user-initiated action (adding a product, updating a quantity, checking off a shopping list item, signing in) produces visible feedback within 2 seconds of the user's input.
- No pantry data — product records, quantities, expiry dates, shopping list items — is accessible to an unauthenticated request. No record belonging to one account is ever returned in the context of another account's session.
- The product functions correctly on the latest two major versions of Chrome, Firefox, Safari, and Edge (desktop). The layout is usable on current iOS Safari and Android Chrome (mobile browsers). No native mobile app is required.
- The core user flows — sign-in, add product, view inventory, view shopping list, check off an item — are fully keyboard-navigable and carry screen-reader labels that meet WCAG 2.1 AA minimum.

## Business Logic

The app decides a product needs restocking when its current quantity falls below the user-set minimum threshold and the product's `addToList` flag is ON.

The rule consumes three user-facing inputs per product: the current quantity (updated by the user whenever they use or restock a product), a minimum threshold (set by the user at the level below which they consider themselves "running low"), and an opt-in flag (default ON, which the user can turn OFF for products they never want on the shopping list). When current quantity drops below the threshold and the flag is ON, the product becomes a restocking candidate. When current quantity is at or above the threshold — or the flag is OFF — the product is not a restocking candidate.

The user encounters the rule's output through the shopping list view: the list is always a live reflection of which products are currently below threshold and opted in. The user does not need to manually move items to the list; the list updates whenever any relevant product field changes. The rule produces no score, ranking, or recommendation — it is a binary gate (needs restocking / does not need restocking) applied independently to each product.

## Access Control

Single user model. Each account holds its own isolated pantry — no cross-user data access.

- **Sign-up / sign-in:** Email + password only. No social login, no passwordless, no magic link for MVP.
- **Roles:** None. Every authenticated user has identical capabilities within their own account.
- **Unauthenticated access:** No pantry data is accessible without a valid session. All routes except sign-up and sign-in require authentication.
- **Data isolation:** All pantry records, products, and shopping list entries are scoped to the authenticated user's account. No sharing, no household view, no guest access.

## Non-Goals

- **No recipe integration / meal suggestions.** The pantry→shopping-list closed loop is the MVP value proposition; meal planning belongs in v2 once the core habit is established.
- **No household sharing / multi-user pantry.** Each account is strictly isolated. No invite flow, no shared view, no "household members" concept.
- **No push or email notifications.** Low-stock and expiry signals are surfaced only within the app UI. External notifications (browser push, email digest) are out of scope for MVP.
- **No native mobile app.** The web app uses responsive design so it is usable on mobile browsers. A dedicated iOS or Android app is not in scope.

## Open Questions

No open questions. All signals were present at shaping time (quality check: accepted, 4/4 heuristic). The Socrates round surfaced and resolved every challenged FR inline.
