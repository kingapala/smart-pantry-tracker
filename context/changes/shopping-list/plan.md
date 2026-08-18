# Shopping List — Test Coverage & Technical Debt Implementation Plan

## Overview

This plan addresses critical gaps in the Shopping List feature: missing test coverage for CRUD operations and E2E flow, duplicated checkoff logic across two endpoints, and incomplete RLS security. Work is organized in four phases: refactoring for maintainability, E2E test coverage, CRUD integration tests, and security hardening via RLS policy.

## Current State Analysis

The Shopping List feature has **well-architected data flow** (clean layer separation, proper auth integration) but **significant technical debt**:

- ✅ Unit conversion logic thoroughly tested (11 test cases)
- ✅ Checkoff operations have integration tests (3 + 2 cases)
- ✅ Auth integration works (middleware + RLS for SELECT/INSERT/DELETE)
- 🔴 Shopping list CRUD operations lack integration test coverage (~31 LOC per operation untested)
- 🔴 E2E checkoff flow untested (add item → convert unit → verify in inventory)
- 🔴 Checkoff logic duplicated across 2 endpoints (~95% similar; null-check differs in one)
- 🟡 Missing UPDATE RLS policy on shopping_list_items (mitigated by app-level checks, but violates defense-in-depth)

**Test Coverage Status:**
- convertUnit() + isKnownUnit(): 15/15 cases ✅
- validateProductInput(): 14/14 cases ✅
- Checkoff endpoints (both): 5 cases ✅
- CRUD (create/update/delete): 0 cases 🔴
- E2E flow: 0 cases 🔴
- unitsCompatible() + roundTo2(): 0 cases (unused code, safe to remove)

**Blast Radius:** Changes to core components require coordinated updates:
- supabase.ts change → 19 files (verified via ast-grep)
- shopping_list_items.quantity schema change → 9 files
- products.add_to_list schema change → 11 files
- Checkoff logic change → 4+ files (2 endpoints, client preview, tests)

## Desired End State

After this plan completes:

1. **Unified Checkoff Logic** — Single implementation in `src/lib/checkoff.ts`, imported by both endpoints; no duplication risk
2. **Full Test Coverage** — E2E flow validates checkoff with/without unit conversion + error cases; CRUD integration tests protect create/update/delete
3. **Clean Codebase** — Dead code (unitsCompatible, roundTo2) removed; precision policy documented
4. **Defense-in-Depth Security** — UPDATE RLS policy added to shopping_list_items; schema aligns with application-level checks

**Verification:** All automated tests pass + manual E2E flow tested in browser.

### Key Discoveries:

- **Checkoff null-check difference**: shopping-list version assumes `enteredUnit` exists; products version has `if (qtyUnit &&...)` guard. Implication: future bugs require dual fixes. Refactoring unifies this.
- **supabase.ts is critical hub**: 19 callers (18 production + 1 test) — verified via ast-grep. Every change to this module requires verification in all consumers.
- **Precision tolerance**: Conversions round to 4 decimal places (`Math.round(converted * 10000) / 10000`). Precision loss ≈ ±0.0001 per unit. Must be documented to prevent future rounding surprises.
- **Test coverage follows risk hierarchy**: Unit conversion (high-risk) → 11 tests ✅; CRUD operations (medium-risk) → 0 tests 🔴; E2E (validation) → missing
- **RLS policies are incomplete**: shopping_list_items has SELECT/INSERT/DELETE but no UPDATE. Current mitigation: all 6 API routes re-verify `context.locals.user` before queries. Defense-in-depth requires UPDATE policy.

## What We're NOT Doing

- Adding monitoring/alerting for precision loss (post-release task)
- Property-based testing for unit conversion (deferred to Phase 3)
- Refactoring auth context into a service layer (separate initiative)
- Performance benchmarking for concurrent checkoffs (no evidence of bottleneck)
- Changing the checkoff UX or adding confirmation dialogs (design is settled)

## Implementation Approach

**Layered Test Coverage Strategy:**
1. Start with refactoring (extract shared logic) so tests validate clean code
2. Add E2E tests for highest-risk path (checkoff with unit conversion)
3. Add CRUD integration tests for data integrity
4. Add RLS policy for security hardening (lowest urgency but best practice)

**Code Organization:**
- Extract checkoff business logic to `src/lib/checkoff.ts` (similar to units.ts pattern)
- Keep API route handlers thin — delegate to utility functions
- Test utilities in isolation (unit tests) + via API (integration tests)

**Testing Approach:**
- E2E: Playwright page interactions + database verification (what user sees + what's stored)
- Integration: Test API endpoints directly with mocked auth context + real database (e2e/seed.spec.ts pattern)
- Dead code removal: Verify via grep before deleting; check git history to confirm never used

---

## Phase 1: Refactoring & Technical Debt Cleanup

### Overview

Extract duplicated checkoff logic into a shared utility function, refactor both endpoints to use it, remove dead code, and document precision behavior. This creates a clean foundation for testing.

### Changes Required:

#### 1. Create Shared Checkoff Utility

**File**: `src/lib/checkoff.ts` (NEW)

**Intent**: Consolidate unit conversion + inventory update logic from both checkoff endpoints into a single, testable utility. This eliminates duplication and ensures bugs are fixed in one place.

**Contract**: Export a single function:
```typescript
export interface CheckoffResult {
  product: { id: string; quantity: number; unit: string; expiry_date?: string };
  deleted_item_id?: string; // if manual item was deleted
}

export async function addToInventory(
  supabase: ReturnType<typeof createClient>,
  user_id: string,
  item: { name: string; unit: string; quantity?: number },
  qty_purchased: number,
  entered_unit: string,
  expiry_date?: string,
  delete_item_id?: string // for manual items
): Promise<CheckoffResult>
```

Implementation logic:
- Call convertUnit(qty_purchased, entered_unit, item.unit) to validate unit compatibility
- If incompatible, throw error with message "Cannot convert {entered_unit} to {item.unit}"
- If compatible, search for existing product by name (case-insensitive ILIKE)
- If found: UPDATE quantity = quantity + converted_qty, set expiry_date
- If not found: INSERT new product with converted_qty
- If delete_item_id provided: DELETE from shopping_list_items
- Return CheckoffResult with product data

**Why refactor here**: Centralizes the ~30 LOC of duplicated logic; future fixes apply to both endpoints immediately; matches existing codebase pattern (units.ts is a similar utility module).

#### 2. Refactor shopping-list-items Checkoff Endpoint

**File**: `src/pages/api/shopping-list-items/[id]/checkoff.ts`

**Intent**: Simplify the endpoint to delegate business logic to addToInventory(). Reduce LOC and improve readability.

**Contract**: Replace lines 44-111 (unit conversion + insert/update + delete) with:
```typescript
import { addToInventory } from '@/lib/checkoff';

// After form validation (lines 17-42):
try {
  const result = await addToInventory(supabase, user.id, item, qty_purchased, enteredUnit, expiry_date, id);
  return new Response(null, { status: 204 });
} catch (error) {
  if (error.message.includes('Cannot convert')) {
    return redirect(`/shopping-list?error=${encodeURIComponent(error.message)}`);
  }
  return new Response('Server error', { status: 500 });
}
```

#### 3. Refactor products Checkoff Endpoint

**File**: `src/pages/api/products/[id]/checkoff.ts`

**Intent**: Simplify the endpoint using the same addToInventory() utility.

**Contract**: Replace lines 44-64 (unit conversion + update) with:
```typescript
import { addToInventory } from '@/lib/checkoff';

// After form validation (lines 17-43):
try {
  const result = await addToInventory(supabase, user.id, product, qty_purchased, qtyUnit || product.unit, expiry_date);
  return new Response(null, { status: 204 });
} catch (error) {
  if (error.message.includes('Cannot convert')) {
    return redirect(`/inventory?error=${encodeURIComponent(error.message)}`);
  }
  return new Response('Server error', { status: 500 });
}
```

#### 4. Remove Dead Code from units.ts

**File**: `src/lib/units.ts`

**Intent**: Delete unitsCompatible() (lines 100-108) and roundTo2() (lines 110-112). Both are exported but never called; removing them reduces cognitive load.

**Contract**: Delete 9 LOC. Update `src/lib/units.test.ts` to remove corresponding test stubs (if any exist). Verify with:
```bash
grep -r "unitsCompatible\|roundTo2" src/ e2e/
# Should return only the deleted definitions in git history
```

#### 5. Document Precision Tolerance

**File**: `src/lib/units.ts`

**Intent**: Add JSDoc comment to convertUnit() explaining rounding behavior.

**Contract**: Add header comment to convertUnit() function:
```typescript
/**
 * Convert a quantity from one unit to another within the same category.
 * 
 * Precision: Conversions round to 4 decimal places (Math.round(value * 10000) / 10000).
 * Acceptable precision loss: ±0.0001 per unit. For example, 1.23456 kg → 1.2346 kg.
 * This level of precision is acceptable for food inventory (loss ~0.1g per kg).
 * 
 * Returns null if units are incompatible (different categories).
 */
```

### Success Criteria:

#### Automated Verification:

- TypeScript compilation passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Unit tests for checkoff.ts pass: Tests created in Phase 2 will cover this
- Both checkoff endpoints still return 204 on success: Verify via existing integration tests
- No references to unitsCompatible or roundTo2: `grep -r "unitsCompatible\|roundTo2" src/` returns empty
- Git history preserved: `git log --oneline src/lib/units.ts` shows deletions

#### Manual Verification:

- Manually verify checkoff flow in browser (add manual item → checkoff → verify in inventory)
- Verify error messages still appear when unit conversion fails
- No TypeScript errors in IDE

**Implementation Note**: Complete this phase first before adding new tests. The refactored utility should be tested in Phase 2.

---

## Phase 2: E2E Test Suite

### Overview

Add Playwright tests for the checkoff flow covering all scenarios: checkoff without unit conversion, with unit conversion, and error cases. This validates the entire feature end-to-end.

### Changes Required:

#### 1. Create E2E Checkoff Test

**File**: `e2e/shopping-list-checkoff.spec.ts` (NEW)

**Intent**: Write Playwright tests for complete checkoff user flow including unit conversion and inventory verification.

**Contract**: Create test suite with 4 test cases:

1. **Test: Checkoff manual item without unit conversion**
   - Setup: Create manual item "Milk" with unit "ml"
   - Action: Open shopping list, checkoff item with same unit (500 ml), set expiry date
   - Assert: Item removed from shopping list, appears in inventory with quantity 500 ml

2. **Test: Checkoff manual item with unit conversion**
   - Setup: Create manual item "Milk" with unit "ml"
   - Action: Open shopping list, checkoff item with different unit (1 L, not ml), system should convert
   - Assert: Conversion preview shows correct target quantity (1000 ml), item removed from shopping list, appears in inventory as 1000 ml

3. **Test: Error case — incompatible unit conversion**
   - Setup: Create manual item "Milk" with unit "ml"
   - Action: Open shopping list, attempt checkoff with incompatible unit (e.g., "kg")
   - Assert: Error message displays "Cannot convert kg to ml", item stays on shopping list

4. **Test: Checkoff pantry item with unit conversion**
   - Setup: Add pantry item "Bread" (50g) below min threshold (100g)
   - Action: Open shopping list, checkoff with different unit (0.5 kg)
   - Assert: Conversion shows 500g, inventory updated to 550g (50+500)

Implementation notes:
- Follow e2e/seed.spec.ts pattern for test structure
- Use `test.describe()` and `test('description')` for test groups
- Use `page.getByRole()` / `page.getByLabel()` for element selection (no CSS selectors)
- Verify both UI state (item removed from list) and database state (quantity in inventory)
- Use `test.afterEach()` for cleanup (delete test items)
- Add unique timestamp suffix to item names to avoid conflicts in parallel runs

### Success Criteria:

#### Automated Verification:

- Playwright tests pass: `npx playwright test e2e/shopping-list-checkoff.spec.ts`
- No console errors during test run
- Database cleanup works (no orphaned test items)

#### Manual Verification:

- Run tests locally and verify videos show correct UI flow
- Manually test checkoff flow in browser (match test scenarios)
- Verify precision is acceptable (converted quantities match expectations)

**Implementation Note**: After this phase completes, the critical user flow is validated. CRUD operations (Phase 3) protect data integrity for less risky paths.

---

## Phase 3: CRUD Integration Tests

### Overview

Add integration tests for create, update, and delete operations on manual shopping list items. This protects data integrity for CRUD operations.

### Changes Required:

#### 1. Create CRUD Integration Tests

**File**: `src/pages/api/shopping-list-items/crud.test.ts` (NEW)

**Intent**: Test all CRUD operations (create, update, delete) with success paths and error cases.

**Contract**: Create test suite with 7 test cases covering:

1. **POST /api/shopping-list-items (Create)**
   - Success: Create item with name, unit, quantity → verify stored in DB
   - Error: Missing name field → returns 400
   - Error: Quantity ≤ 0 → returns 400
   - Error: Unknown unit → returns 400

2. **PATCH /api/shopping-list-items/[id] (Update)**
   - Success: Update quantity → verify DB updated
   - Error: Item not found (404) → returns 404
   - Error: Quantity ≤ 0 → returns 400

3. **DELETE /api/shopping-list-items/[id] (Delete)**
   - Success: Delete item → verify removed from DB
   - Error: Item not found (404) → returns 404

Implementation notes:
- Follow pattern in `src/pages/api/shopping-list-items/[id]/checkoff.test.ts`
- Use `createMockContext()` for auth context with test user ID
- Test both success and error paths
- Verify user isolation (one user cannot delete another's items via RLS)
- Seed test data with unique IDs (timestamp + random) to avoid conflicts

### Success Criteria:

#### Automated Verification:

- CRUD tests pass: `npm run test -- crud.test.ts`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Test coverage > 80% for shopping-list API routes

#### Manual Verification:

- Verify test output shows all 7 cases passing
- Review test file for clear assertions and error messages

**Implementation Note**: These tests complete coverage for CRUD operations. Combined with E2E tests from Phase 2, the shopping list feature is now fully validated.

---

## Phase 4: Security Hardening (RLS Policy)

### Overview

Add UPDATE RLS policy to shopping_list_items table to complete row-level security. Currently, UPDATE operations rely on application-level auth checks; this adds a database-level policy for defense-in-depth.

### Changes Required:

#### 1. Add UPDATE RLS Policy

**File**: `supabase/migrations/20260610000002_shopping_list_items_update_rls.sql` (NEW)

**Intent**: Add missing UPDATE policy to shopping_list_items table.

**Contract**: Create migration:
```sql
CREATE POLICY "shopping_list_items_update"
ON shopping_list_items
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

This allows users to UPDATE only rows where `auth.uid() = user_id`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `supabase migration up` (or equivalent in your dev setup)
- No SQL syntax errors
- RLS policies on shopping_list_items are complete (SELECT, INSERT, UPDATE, DELETE all present)
- Linting passes: `npm run lint` (if SQL linter configured)

#### Manual Verification:

- Verify policy was created: Connect to Supabase and check `pg_policies` table
- Confirm app behavior unchanged (PATCH requests still work)
- No regressions in shopping list functionality

**Implementation Note**: This policy is permissive (matches application-level checks) and poses no risk. It's a best-practice addition to the schema.

---

## Testing Strategy

### Unit Tests

- **src/lib/checkoff.ts** (NEW): Test addToInventory() with:
  - Unit conversion success path (convert ml → l)
  - Unit conversion error (incompatible units)
  - Product exists (UPDATE scenario)
  - Product not found (INSERT scenario)
  - Precision rounding (4 decimal places)
  - Manual item deletion (when delete_item_id provided)

### Integration Tests

- **src/pages/api/shopping-list-items/crud.test.ts** (NEW): Test CRUD endpoints with auth context
- **src/pages/api/shopping-list-items/[id]/checkoff.test.ts** (existing): Update to test refactored addToInventory() calls
- **src/pages/api/products/[id]/checkoff.test.ts** (existing): Update to test refactored addToInventory() calls

### E2E Tests

- **e2e/shopping-list-checkoff.spec.ts** (NEW): End-to-end Playwright tests for complete user flow

### Manual Testing Steps

1. Add a manual shopping list item (name, unit, quantity)
2. Verify it appears on shopping list
3. Checkoff the item without changing unit → verify in inventory
4. Checkoff another item with unit conversion (e.g., 2L milk → ml) → verify converted quantity in inventory
5. Try checkoff with incompatible unit (e.g., kg for ml) → verify error message
6. Verify user isolation: log in as different user, confirm can't see other user's items

---

## Performance Considerations

- **No performance regression expected**: Checkoff refactoring extracts logic but doesn't change algorithms
- **Database queries unchanged**: Same number of queries (product lookup + update/insert + delete item)
- **Test overhead**: E2E tests will add ~5 minutes to CI/CD; consider running in parallel

---

## Migration Notes

- **No schema changes required** except the new UPDATE RLS policy (non-breaking)
- **Code changes are backwards-compatible**: Both endpoints maintain same API contract (POST returns 204)
- **Deployment order**: Deploy code changes (Phase 1-3) before migration (Phase 4); RLS policy doesn't break existing code

---

## References

- Related research: `context/changes/shopping-list/research.md`
- Similar utility pattern: `src/lib/units.ts` (exported functions, unit tested)
- Similar API route tests: `src/pages/api/shopping-list-items/[id]/checkoff.test.ts`
- E2E test pattern: `e2e/seed.spec.ts`
- Checkoff migration repo-map notes: `context/map/repo-map.md` (lines 168-185, 299-304)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Refactoring & Technical Debt Cleanup

#### Automated

- [ ] 1.1 Create src/lib/checkoff.ts with addToInventory() utility
- [ ] 1.2 Refactor shopping-list-items checkoff endpoint to use new utility
- [ ] 1.3 Refactor products checkoff endpoint to use new utility
- [ ] 1.4 Remove dead code (unitsCompatible, roundTo2) from units.ts
- [ ] 1.5 Add precision tolerance documentation to convertUnit()
- [ ] 1.6 TypeScript compilation passes
- [ ] 1.7 Linting passes
- [ ] 1.8 Existing checkoff integration tests still pass

#### Manual

- [ ] 1.9 Manually test checkoff flow in browser (add item → checkoff → verify in inventory)
- [ ] 1.10 Verify error messages appear when unit conversion fails

### Phase 2: E2E Test Suite

#### Automated

- [ ] 2.1 Create e2e/shopping-list-checkoff.spec.ts with 4 test cases
- [ ] 2.2 E2E tests pass (no conversion, with conversion, error cases, pantry item)
- [ ] 2.3 No console errors during test run
- [ ] 2.4 Database cleanup works (no orphaned test items)

#### Manual

- [ ] 2.5 Run tests locally and verify videos show correct UI flow
- [ ] 2.6 Manually verify checkoff precision matches test expectations

### Phase 3: CRUD Integration Tests

#### Automated

- [ ] 3.1 Create src/pages/api/shopping-list-items/crud.test.ts
- [ ] 3.2 CRUD tests pass (create, update, delete with success and error paths)
- [ ] 3.3 Test coverage > 80% for shopping-list API routes
- [ ] 3.4 TypeScript compilation passes
- [ ] 3.5 Linting passes

#### Manual

- [ ] 3.6 Review test file for clear assertions and error messages

### Phase 4: Security Hardening (RLS Policy)

#### Automated

- [ ] 4.1 Create migration for UPDATE RLS policy
- [ ] 4.2 Migration applies cleanly
- [ ] 4.3 No SQL syntax errors
- [ ] 4.4 Linting passes

#### Manual

- [ ] 4.5 Verify policy was created in Supabase
- [ ] 4.6 Confirm PATCH requests still work (no regressions)
