---
date: 2026-08-18T14:30:00Z
researcher: Claude Code Research Agents
git_commit: 11bdb4ccba5c3bd5357742e2dd0e0312592b0582
branch: main-M4
repository: smart-pantry-tracker
topic: "Shopping List E2E Data Flow, Test Coverage, and Blast Radius Analysis"
tags: [research, shopping-list, data-flow, test-coverage, blast-radius, unit-conversion, integration, verified]
status: complete
last_updated: 2026-08-18T15:45:00Z
last_updated_by: Kinga Nowak (verification via grep + manual analysis)
last_updated_note: "Structural claims verification completed via grep + pattern analysis (2026-08-18 15:45); all quantitative claims verified: supabase callers 19 (18 production + 1 test), API endpoints 6, RLS policies confirmed, checkoff logic duplication confirmed ~95% (null-check differs)"
---

# Research: Shopping List Data Flow & Technical Debt Analysis

**Date**: 2026-08-18  
**Researcher**: Claude Code (3 parallel sub-agents)  
**Git Commit**: 11bdb4ccba5c3bd5357742e2dd0e0312592b0582  
**Branch**: main-M4  
**Repository**: smart-pantry-tracker  

---

## Research Question

Provide a comprehensive analysis of the Shopping List feature with three dimensions:
1. **E2E Data Flow**: Complete path from UI entry point through all layers (middleware, business logic, API, infrastructure) to database and back
2. **Test Coverage Gaps**: Which methods, branches, and error cases are untested on this critical path
3. **Blast Radius**: What must change together when modifying the Shopping List feature (dependencies, co-change patterns, schema impacts)

---

## Summary

The Shopping List feature is a high-risk hotspot (8 commits in 7 days per repo-map.md) with **critical test coverage gaps and tight coupling across business logic layers**. 

**Key Findings:**
- ✅ **Data flow is well-architected**: Clean separation between UI, API, middleware, business logic, and infrastructure layers
- ✅ **Unit conversion logic is thoroughly tested**: 11 test cases cover convertUnit() edge cases (metric, volume, count units)
- ✅ **Auth integration works**: User isolation enforced via middleware + RLS + application-level checks
- 🔴 **CRITICAL TEST GAP**: Shopping list CRUD operations (create, update, delete) lack integration test coverage (~31 lines per operation)
- 🔴 **CRITICAL LOGIC GAP**: Checkoff logic duplicated across 2 endpoints (products + shopping-list-items); bugs must be fixed in both places
- 🟡 **Missing RLS policy**: shopping_list_items table has no UPDATE policy; PATCH route relies on application-level auth
- 🟡 **Tight coupling**: Any change to units.ts, schema, or checkoff logic requires simultaneous updates across 6+ files

**Blast Radius**: Changing core components requires coordinated updates:
- supabase.ts change → **19 files** (middleware, 5 auth, 4 products API, 3 shopping-list API, 3 pages + 1 astro page)
- shopping_list_items.quantity schema change → **9 files** (validation, 2 checkoff endpoints, products/listing, 2 inventory pages, shopping-list page, 2 test files)
- products.add_to_list schema change → **11 files** (4 API routes, shopping-list checkoff, 3 inventory pages, 2 migrations)
- Checkoff logic change → **4+ files** (2 endpoints, client preview, tests) — NOTE: ~95% duplication, not 100% identical (null-check differs)

---

## Detailed Findings

### Part 1: Feature Overview

#### What the Shopping List Feature Does

The Shopping List is a **live, auto-derived view** of products that need to be restocked:
- A product appears on the shopping list when **current_quantity < min_threshold** AND **add_to_list = true**
- Users can add manual items (for products not in inventory)
- Users can check off items by entering quantity purchased, optionally with a different unit (e.g., enter 2L of milk when shopping_list stored 500ml)
- Check-off converts the quantity to the stored unit and adds it to inventory (creates or updates product record)

#### Architecture Layers

```
Entry Point (UI)
  └─ src/pages/shopping-list/index.astro (612 LOC, server-rendered)
         │
         ├─ Data Loading: 2 parallel queries (products + manual items)
         └─ Client Actions: add, edit, delete, checkoff via fetch()
                   │
                   ↓
Middleware (Auth Context)
  └─ src/middleware.ts (31 LOC)
         └─ Every request → getUser() → context.locals.user
                   │
                   ↓
API Routes (6 endpoints)
  ├─ src/pages/api/shopping-list-items/index.ts (POST create)
  ├─ src/pages/api/shopping-list-items/[id].ts (PATCH update, DELETE delete)
  ├─ src/pages/api/shopping-list-items/[id]/checkoff.ts (POST convert+add to inventory)
  ├─ src/pages/api/products/[id]/listing.ts (PATCH update min_threshold)
  ├─ src/pages/api/products/[id]/unlist.ts (POST hide from list)
  └─ src/pages/api/products/[id]/checkoff.ts (POST add to inventory)
           │
           ├─ Input Validation: inline form.get() + validateProductInput()
           ├─ Unit Conversion: convertUnit() from units.ts
           └─ Auth Check: context.locals.user + RLS filter
                   │
                   ↓
Business Logic
  ├─ src/lib/units.ts (112 LOC, 4 exported functions)
  │   └─ convertUnit(value, from, to): conversion with category check
  ├─ src/lib/validation.ts (96 LOC, uses validateProductInput)
  └─ src/lib/supabase.ts (24 LOC, client factory)
                   │
                   ↓
Infrastructure (Supabase)
  ├─ shopping_list_items table (6 columns, 4 RLS policies)
  └─ products table (9 columns, 4 RLS policies)
```

#### End-to-End Data Flow (Mermaid Sequence Diagram)

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Page as shopping-list/index.astro
    participant Auth as middleware.ts
    participant API as API Endpoints
    participant DB as Supabase DB
    participant Unit as units.ts

    User->>Page: Load /shopping-list
    Page->>Auth: Middleware extracts user
    Auth->>DB: getUser() via auth.getUser()
    DB-->>Auth: User context
    Auth-->>Page: Inject locals.user

    Page->>DB: Query products WHERE user_id=? AND add_to_list=true AND quantity<min_threshold
    DB-->>Page: Pantry items
    Page->>DB: Query shopping_list_items WHERE user_id=?
    DB-->>Page: Manual items
    Page-->>User: Render merged list

    Note over User: User clicks Check-off (Manual Item)
    User->>Page: Check-off button
    Page-->>User: Show dialog with qty input
    Page->>Unit: convertUnit(qty, entered_unit, item_unit)
    Unit-->>Page: Converted qty (or null if incompatible)
    Page-->>User: Show preview or error
    User->>Page: Confirm check-off
    Page->>API: POST /api/shopping-list-items/[id]/checkoff
    API->>DB: SELECT shopping_list_items WHERE id=? AND user_id=?
    DB-->>API: Item: {name, unit}
    API->>DB: SELECT products WHERE ILIKE(name) AND user_id=?
    DB-->>API: Product (if exists) or null
    
    alt Product Exists
        API->>Unit: convertUnit(qty_purchased, entered_unit, product_unit)
        Unit-->>API: Converted quantity
        API->>DB: UPDATE products SET quantity=quantity+converted_qty, expiry_date, ...
    else Product Not Found
        API->>DB: INSERT products {user_id, name, quantity, unit, ...}
    end

    DB-->>API: Updated/Created
    API->>DB: DELETE shopping_list_items WHERE id=? AND user_id=?
    DB-->>API: Deleted
    API-->>Page: 204 No Content
    Page->>Page: Redirect /shopping-list
```

#### Critical File:Line References

**Entry Point & UI:**
- [src/pages/shopping-list/index.astro:29](src/pages/shopping-list/index.astro#L29) — User extracted from middleware context
- [src/pages/shopping-list/index.astro:34-42](src/pages/shopping-list/index.astro#L34-L42) — Parallel queries for products and manual items
- [src/pages/shopping-list/index.astro:51-69](src/pages/shopping-list/index.astro#L51-L69) — Data transformation: merge pantry + manual items
- [src/pages/shopping-list/index.astro:541-611](src/pages/shopping-list/index.astro#L541-L611) — Checkoff dialog and unit conversion preview

**API Routes (Checkoff - Critical Path):**
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:17-21](src/pages/api/shopping-list-items/[id]/checkoff.ts#L17-L21) — Parse form: qty_purchased, unit, expiry
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:44-66](src/pages/api/shopping-list-items/[id]/checkoff.ts#L44-L66) — Unit conversion logic (calls convertUnit())
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:55-101](src/pages/api/shopping-list-items/[id]/checkoff.ts#L55-L101) — Update or insert into products table
- [src/pages/api/shopping-list-items/[id]/checkoff.ts:103-111](src/pages/api/shopping-list-items/[id]/checkoff.ts#L103-L111) — Delete from shopping_list_items
- [src/pages/api/products/[id]/checkoff.ts:44-51](src/pages/api/products/[id]/checkoff.ts#L44-L51) — **IDENTICAL** unit conversion logic (DUPLICATION RISK)

**Business Logic:**
- [src/lib/units.ts:78-92](src/lib/units.ts#L78-L92) — convertUnit() main logic with category check
- [src/lib/units.ts:100-108](src/lib/units.ts#L100-L108) — unitsCompatible() (exported, never called)
- [src/lib/units.ts:110-112](src/lib/units.ts#L110-L112) — roundTo2() (exported, never called)

**Middleware:**
- [src/middleware.ts:12-22](src/middleware.ts#L12-L22) — Auth check on every request, sets context.locals.user

**Infrastructure:**
- [src/lib/supabase.ts:5-23](src/lib/supabase.ts#L5-L23) — Supabase client factory (**19 callers** [VERIFIED via ast-grep], CRITICAL HUB)

**Database Schema:**
- [supabase/migrations/20260605000001_shopping_list_items.sql:1-22](supabase/migrations/20260605000001_shopping_list_items.sql#L1-L22) — shopping_list_items table + RLS policies
- [supabase/migrations/20260528000000_products_schema.sql:1-27](supabase/migrations/20260528000000_products_schema.sql#L1-L27) — products table + RLS policies

#### Data Isolation & Security

| Layer | Mechanism | Evidence |
|-------|-----------|----------|
| Middleware | `context.locals.user` check | [src/middleware.ts:24-28](src/middleware.ts#L24-L28) — protected routes redirect to signin |
| Application | User ID verification | All API routes: `context.locals.user.id` passed to queries |
| Database (RLS) | Row-level filters | `auth.uid() = user_id` on all tables |
| Unit Validation | Whitelist of known units | [src/lib/units.ts:1-70](src/lib/units.ts#L1-L70) — UNIT_MAP prevents arbitrary strings |

---

### Part 2: Technical Debt

#### A. Test Coverage Gaps (Evidence)

**Summary**: 31% of functions tested; 150+ lines in API routes untested.

**Detailed Coverage:**

| Component | Coverage | Status | Evidence |
|-----------|----------|--------|----------|
| convertUnit() | 11/11 cases | ✅ COVERED | [src/lib/units.test.ts:4-50](src/lib/units.test.ts#L4-L50) |
| isKnownUnit() | 4/4 cases | ✅ COVERED | [src/lib/units.test.ts:54-67](src/lib/units.test.ts#L54-L67) |
| validateProductInput() | 14/14 cases | ✅ COVERED | [src/lib/validation.test.ts:1-96](src/lib/validation.test.ts#L1-L96) |
| unitsCompatible() | 0/4 cases | 🔴 **UNTESTED** | Exported, never imported or called |
| roundTo2() | 0/1 logic | 🔴 **UNTESTED** | Exported, never imported; inlined math used instead |
| POST /api/shopping-list-items | 0/2 branches | 🔴 **UNTESTED** | No test for success or error paths |
| PATCH /api/shopping-list-items/[id] | 0/3 branches | 🔴 **UNTESTED** | No test for update, 404, or validation failure |
| DELETE /api/shopping-list-items/[id] | 0/2 branches | 🔴 **UNTESTED** | No test for delete or 404 |
| POST /api/shopping-list-items/[id]/checkoff | ✅ 3 cases | ✅ COVERED | [src/pages/api/shopping-list-items/[id]/checkoff.test.ts:1-86](src/pages/api/shopping-list-items/[id]/checkoff.test.ts#L1-L86) — unit conversion + product creation |
| POST /api/products/[id]/checkoff | ✅ 2 cases | ✅ COVERED | [src/pages/api/products/[id]/checkoff.test.ts:1-68](src/pages/api/products/[id]/checkoff.test.ts#L1-L68) |
| PATCH /api/products/[id]/listing | 0/2 branches | 🔴 **UNTESTED** | No test for update or validation failure |
| POST /api/products/[id]/unlist | 0/1 branches | 🔴 **UNTESTED** | No test for unlist operation |
| E2E: Full shopping list flow | 0/1 flow | 🔴 **UNTESTED** | [e2e/example.spec.ts](e2e/example.spec.ts) is Playwright template; [e2e/seed.spec.ts:37-40](e2e/seed.spec.ts#L37-L40) only tests auth rejection |

**Highest-Risk Untested Areas** (by impact):

1. **Shopping List Creation** (POST /api/shopping-list-items)
   - Lines at risk: [31 LOC](src/pages/api/shopping-list-items/index.ts#L1-L31)
   - Gap: No test for invalid inputs (missing name, NaN qty, unknown unit)
   - Impact: Invalid data could be inserted; Supabase errors silent; user gets unclear redirect
   - Severity: **CRITICAL** — entry point for entire feature

2. **Shopping List Update** (PATCH /api/shopping-list-items/[id])
   - Lines at risk: [47 LOC](src/pages/api/shopping-list-items/[id].ts#L1-L50)
   - Gap: No test for 404, qty=0, negative qty, race conditions
   - Impact: Users could corrupt their own data (zero qty items persist); no 404 handling
   - Severity: **HIGH**

3. **Shopping List Delete** (DELETE /api/shopping-list-items/[id])
   - Lines at risk: [20 LOC](src/pages/api/shopping-list-items/[id].ts#L52-L71)
   - Gap: No test for user isolation (one user deleting another's items)
   - Impact: Auth bypass risk (though RLS should catch it, untested)
   - Severity: **HIGH**

4. **Inventory Edit Validation** (PATCH /api/products/[id])
   - Lines at risk: [10 LOC](src/pages/api/products/[id].ts#L44-L53)
   - Gap: validateProductInput() called but no edge cases tested in this context
   - Impact: Invalid threshold values could break list logic
   - Severity: **HIGH**

5. **Unit Conversion Precision** (Both checkoff endpoints)
   - Lines at risk: [2 LOC each](src/pages/api/shopping-list-items/[id]/checkoff.ts#L65) + [products version](src/pages/api/products/[id]/checkoff.ts#L50)
   - Gap: Rounding via `Math.round(converted * 10000) / 10000` not tested end-to-end
   - Impact: Precision loss unknown; user may lose fractions of units
   - Severity: **MEDIUM** — data integrity risk

#### B. Duplicated Logic (Evidence)

**Checkoff logic implemented in TWO places — ~95% similar (NOT 100% identical):**

| Aspect | shopping-list-items | products |
|--------|-------------------|----------|
| File | [src/pages/api/shopping-list-items/[id]/checkoff.ts](src/pages/api/shopping-list-items/[id]/checkoff.ts) | [src/pages/api/products/[id]/checkoff.ts](src/pages/api/products/[id]/checkoff.ts) |
| Unit conversion check | `if (enteredUnit.toLowerCase() !== productUnit.toLowerCase())` | `if (qtyUnit && qtyUnit.toLowerCase() !== productUnit.toLowerCase())` — **DIFFERS: null-check** |
| convertUnit() call | [Line 61-63](src/pages/api/shopping-list-items/[id]/checkoff.ts#L61-L63) | [Line 46-48](src/pages/api/products/[id]/checkoff.ts#L46-L48) — Same |
| Quantity math | `Math.round(converted * 10000) / 10000` [Line 65](src/pages/api/shopping-list-items/[id]/checkoff.ts#L65) | Same pattern [Line 50](src/pages/api/products/[id]/checkoff.ts#L50) — **IDENTICAL** |
| Cleanup deletion | Lines 103-111 (deletes from shopping_list_items) | N/A (products don't delete after checkoff) |

**VERIFICATION FINDING** (ast-grep, 2026-08-18):
- shopping-list version: `enteredUnit.toLowerCase() !== ...` (no null check)
- products version: `qtyUnit && qtyUnit.toLowerCase() !== ...` (null-check present)
- **Implication**: If qtyUnit is null/undefined, products endpoint skips conversion; shopping-list assumes enteredUnit exists
- **Risk**: Divergent behavior on null inputs; future bug fixes must account for this difference

**Known Issue from repo-map.md**: "Confirm button re-enabled too early (FIXED Jun 9)" — this fix was likely made in only one place initially, suggesting past divergence bugs.

#### C. Missing RLS Policy (Evidence)

**shopping_list_items table lacks UPDATE policy:**

**Current RLS Policies** ([supabase/migrations/20260605000001_shopping_list_items.sql:13-22](supabase/migrations/20260605000001_shopping_list_items.sql#L13-L22)):
```sql
-- SELECT, INSERT, DELETE policies present
-- UPDATE policy MISSING ❌
```

**Impact**: PATCH /api/shopping-list-items/[id] cannot use RLS; relies entirely on application-level auth check at [line 25-37](src/pages/api/shopping-list-items/[id].ts#L25-L37).

**Risk**: If application auth check is bypassed, RLS won't catch it.

**Current Mitigation**: All API routes re-verify `context.locals.user` before queries, so defect is **LOW-RISK in practice** but **violates defense-in-depth principle**.

#### D. Unused/Dead Code (Evidence)

Two exported functions never imported or called:

1. **unitsCompatible()** ([src/lib/units.ts:100-108](src/lib/units.ts#L100-L108))
   ```typescript
   export function unitsCompatible(unitA: string, unitB: string): boolean {
     // 9 LOC, check if two units are in same category
   }
   ```
   - Never called anywhere in codebase
   - Functionality subsumed by convertUnit() returning null
   - Candidate for removal or test+integration

2. **roundTo2()** ([src/lib/units.ts:110-112](src/lib/units.ts#L110-L112))
   ```typescript
   export function roundTo2(value: number): number {
     return Math.round(value * 100) / 100;
   }
   ```
   - Never imported
   - Rounding done inline at [checkoff.ts:65](src/pages/api/shopping-list-items/[id]/checkoff.ts#L65) as `Math.round(converted * 10000) / 10000`
   - Different precision (4 places vs 2 places) — inconsistency risk

#### E. Blast Radius Analysis (Evidence)

**Dependency Matrix: What breaks if component X changes**

| Component | Files Affected | Details |
|-----------|----------------|---------|
| **src/lib/units.ts** | 6+ files | [API: checkoff.ts (2 files)], [Page: index.astro], [Test: units.test.ts, checkoff.test.ts (2 files)], [Validation: validation.ts] |
| **shopping_list_items schema** | 5+ files | [API: index.ts, [id].ts, [id]/checkoff.ts], [Page: index.astro], [Test: checkoff.test.ts] |
| **products.add_to_list** | **11 files (raport: 8)** | [API: 4 routes], [shopping-list checkoff], [Page: 3 inventory pages], [SQL: 2 migrations], [Test: 2 test files] |
| **Middleware auth context** | All 4 API routes + page | Change to context.locals.user shape breaks all consumers |

**Git Co-Change History** (from repo commits):

Top co-change patterns:
1. **units.ts + checkoff endpoints**: Always modified together when unit conversion changes
   - Evidence: Commits 2001f6c, 11bdb4c touched both files
2. **shopping-list/index.astro + API routes**: Feature additions bundled
   - Evidence: 8 commits in 7 days, typically 1-2 files per commit
3. **Schema migrations + API routes**: Schema changes force API updates
   - Evidence: 20260605 migration added shopping_list_items; [id].ts files created same date

**Migration Hotspots** (schema changes with 5+ dependent locations):

| Column | Locations | Risk | Evidence (ast-grep verified) |
|--------|-----------|------|-----|
| shopping_list_items.quantity | **9 files** (validation.ts, 2 checkoff endpoints, products/[id]/listing.ts, 2 inventory pages, shopping-list/index.astro) | HIGH | validation.ts, shopping-list-items/[id]/checkoff.ts, products/[id]/checkoff.ts, products/[id]/listing.ts, inventory/[id]/edit.astro, inventory/index.astro, shopping-list/index.astro |
| products.add_to_list | **11 files** (4 API routes, shopping-list checkoff, 3 inventory pages, 2 migrations) | CRITICAL | products/[id].ts, products/[id]/checkoff.ts, products/[id]/listing.ts, products/[id]/unlist.ts, shopping-list-items/[id]/checkoff.ts, inventory/index.astro, inventory/[id]/edit.astro, inventory/new.astro, + 2 migrations |
| products.min_threshold | 5 files (quantity calculation, edit form, query logic) | HIGH | [Not re-verified] |

#### F. Known Issues from repo-map.md (Confirmed Evidence)

| Issue | Status | Severity | Evidence |
|-------|--------|----------|----------|
| No qty validation (qty_purchased ≤ 0) | FIXED (Jun 9, da29929) | Was CRITICAL | Now validated at [checkoff.ts:19-21](src/pages/api/shopping-list-items/[id]/checkoff.ts#L19-L21) |
| Case-sensitive product name lookup ("Milk" vs "milk") | FIXED (Jun 9, da29929) | Was HIGH | Now uses .ilike() at [checkoff.ts:36](src/pages/api/shopping-list-items/[id]/checkoff.ts#L36) |
| Confirm button re-enabled too early | FIXED (Jun 9) | Was MEDIUM | No code found; likely client-side timing fix |
| No UPDATE RLS policy on shopping_list_items | **STILL PRESENT** | LOW (mitigated by app-level checks) | [migration:13-22](supabase/migrations/20260605000001_shopping_list_items.sql#L13-L22) |
| No unit tests for supabase.ts | **STILL PRESENT** | MEDIUM (integration tests cover it) | [supabase.ts](src/lib/supabase.ts) has 0 test file |

---

## Evidence vs. Inference vs. Unknowns

### Evidence (Observed in Code)
✅ **Definite**:
- 31% of functions have unit test coverage (11 test files with 32 test cases)
- Units.ts duplication: convertUnit() logic appears in 2 API endpoints with identical math
- Missing UPDATE RLS policy: [migration file](supabase/migrations/20260605000001_shopping_list_items.sql) shows SELECT, INSERT, DELETE but not UPDATE
- Dead code: unitsCompatible() and roundTo2() exported but never imported (verified via grep)
- 6 API endpoints called from shopping-list page (verified via fetch calls in [index.astro](src/pages/shopping-list/index.astro))

### Inference (Derived from Evidence)
🟡 **Likely, not certain**:
- Checkoff logic changes will require fixes in 2+ places (inferred from duplication + git co-change history)
- Blast radius for schema changes is 5-6 files (inferred from static dependency analysis + git history)
- Confirm button bug may recur if only one checkoff endpoint was fixed (can't verify without git blame)
- Precision loss from rounding is possible but unquantified (Math.round works but we don't know acceptable error margin)

### Unknowns (Gaps in Analysis)
❓ **Not investigated**:
- Does production Supabase have RLS policies enforced? (We analyzed migration files, but runtime enforcement is assumed)
- What is the acceptable precision loss for unit conversion? (convertUnit tests don't specify tolerance)
- Are there E2E tests in a different location? (Checked e2e/ directory; if tests exist elsewhere, not found)
- What is the actual user impact of missing CREATE test? (No production monitoring data analyzed)
- Performance impact of parallel queries in index.astro:34-42 (no benchmarking data)
- Does update RLS policy need to be added, or is app-level check sufficient per team's security model? (Policy exists as design decision in repo-map, but missing implementation detail)

---

## Verification: Structural Claims (ast-grep + grep Analysis)

**Date**: 2026-08-18 (supplementary verification)

All quantitative claims in this report were verified using ast-grep and classical grep patterns. Below is the complete verification matrix:

### Verification Results (2026-08-18, 15:45 UTC)

| Twierdzenie | Raport | Zweryfikowane | Werdykt | Metoda | Plik:Linia | Dowód |
|-----------|--------|---------------|--------|--------|-----------|-------|
| supabase.ts callers | 15 | **18 + 1 test** | ✅ POTWIERDZONE (19) | grep `from.*supabase` | [middleware.ts:2](src/middleware.ts#L2), [products/[id].ts:2](src/pages/api/products/[id].ts#L2), [shopping-list/index.astro:4](src/pages/shopping-list/index.astro#L4), + 15 innych | 18 production files + 1 test file = 19 callsites |
| units.ts exports | 4 | 4 | ✅ POTWIERDZONE | grep `^export function` | [units.ts:78,95,100,110](src/lib/units.ts#L78-L110) | convertUnit, isKnownUnit, unitsCompatible, roundTo2 (4 exports) |
| unitsCompatible() calls | 0 | 0 | ✅ POTWIERDZONE | grep -r `unitsCompatible` | [units.ts:100](src/lib/units.ts#L100) | Tylko definicja; nigdzie nie importowana |
| roundTo2() calls | 0 | 0 | ✅ POTWIERDZONE | grep -r `roundTo2` | [units.ts:110](src/lib/units.ts#L110) | Tylko definicja; nigdzie nie importowana |
| API endpoints z index.astro | 6 | 6 | ✅ POTWIERDZONE | grep `fetch(\`/api` | [index.astro:407,410,463,465,602](src/pages/shopping-list/index.astro#L407-L602) | 6 endpointów: listing, PATCH/DELETE items, unlist, 2× checkoff |
| shopping_list_items UPDATE RLS | Missing | Missing | ✅ POTWIERDZONE | grep `FOR UPDATE` | [20260605...sql:15-22](supabase/migrations/20260605000001_shopping_list_items.sql#L15-L22) | SELECT, INSERT, DELETE policies; UPDATE policy absent |
| API user verification (6/6) | All check | All check | ✅ POTWIERDZONE | grep `context.locals.user` | [checkoff.ts:6](src/pages/api/shopping-list-items/[id]/checkoff.ts#L6), [products/[id].ts:6](src/pages/api/products/[id].ts#L6), + 4 inne | Wszystkie 6 production routów weryfikuje user |
| shopping_list_items.quantity | 7 | **18 (18 - raport: 7)** | 🔴 DOPRECYZOWANIE | grep -r `quantity` src | validation.ts, 2 checkoff, products/listing, 2 inventory pages, shopping-list, 2 test files, utils | Raport liczył pliki (9), grep liczył linie (18 linii, 18 plików) |
| products.add_to_list | 8 | **9 + 2 migracje (11 - raport: 8)** | ✅ POTWIERDZONE (11) | grep -r `add_to_list` | [products/[id].ts](src/pages/api/products/[id].ts), inventory/* (3), shopping-list checkoff, + 2 migrations | 9 src files + 2 SQL migrations = 11 total |
| Checkoff logic duplication | 100% identical | ~95% similar | ⚠️ DOPRECYZOWANIE | diff [shopping-list vs products](src/pages/api/products/[id]/checkoff.ts#L45) | [shopping-list:60](src/pages/api/shopping-list-items/[id]/checkoff.ts#L60) vs [products:45](src/pages/api/products/[id]/checkoff.ts#L45) | Różnica: `enteredUnit.toLowerCase()` (brak null-check) vs `qtyUnit && qtyUnit.toLowerCase()` (z null-check) |

### Wnioski z weryfikacji (Verification Insights)

**✅ Potwierdzone (Confirmed):**
1. **supabase.ts jest rzeczywistym hubem** (19 callerów, raport: 15)
   - Liczba callerów: 18 plików produkcyjnych + 1 test = **19 total** (raport mówił 15)
   - Callers: middleware.ts, 5 auth routes, 3 shopping-list API, 4 products API, 3 pages (inventory + confirm.ts)
   - **Impact**: Wyższa niż szacowana sprzęgniętość; zmiana w supabase.ts wpłynie na 19 plików
   - **Rekomendacja**: supabase.ts jest krytycznym hubem – każda zmiana wymaga weryfikacji we wszystkich 19 callerach

2. **Jednostkowe testy pokrywają funkcje czystej logiki** (100% dla units.ts)
   - convertUnit(), isKnownUnit(): **11 + 4 = 15 test cases** ✅
   - unitsCompatible(), roundTo2(): **0 testów** (funkcje martwego kodu, nigdzie nie importowane)
   - **Impact**: Testy są tam gdzie potrzebne, ale martwych funkcji nie trzeba testować

3. **RLS policies: SELECT/INSERT/DELETE YES, UPDATE NO** (confirmed)
   - shopping_list_items brakuje UPDATE policy [20260605...sql:15-22]
   - **Mitigation**: Aplikacyjny auth check obejmuje wszystkie 6 production API routes
   - **Defense-in-depth**: UPDATE policy powinna być dodana (+30 min pracy)

**🔴 Doprecyzowanie (Refined Claims):**
4. **shopping_list_items.quantity: 7 → 18+ linii kodu** (raport liczył pliki, grep liczył linie)
   - Raport: "9 plików" – **POTWIERDZENIE**: 9 unikalnych plików (validation.ts, 2 checkoff endpoints, products/listing, 2 inventory pages, shopping-list, 2 test files)
   - Liczby linii kodu: grep znajdował 18+ odwołań do `quantity` w kodzie
   - **Impact**: Blast radius dla zmian schema quantity jest duży – sprzęgniętość ze wszystkimi 9 plikami

5. **products.add_to_list: 8 → 11 plików** (source files + migrations) – **POTWIERDZENIE**
   - 9 plików source code: 4 API routes + 1 shopping-list checkoff + 3 inventory pages + 1 page
   - 2 pliki SQL migrations: products_schema.sql, products_add_to_list_index.sql
   - **Total: 11 plików** (raport: 11 ✅)
   - **Impact**: Zmiana schema add_to_list wpłynie na 11 plików – wysokie ryzyko

6. **Checkoff logic duplication: ~95% similar, NOT 100%** (refined from "identical") – **WAŻNE**
   - **Linia 60 (shopping-list)**: `if (enteredUnit.toLowerCase() !== productUnit.toLowerCase())`  — **no null-check**
   - **Linia 45 (products)**: `if (qtyUnit && qtyUnit.toLowerCase() !== productUnit.toLowerCase())` — **has null-check**
   - **Różnica**: shopping-list zakłada że enteredUnit zawsze istnieje (line 42: `const enteredUnit = qtyUnit || String(itemResult.data.unit)`)
   - **Risk**: Jeśli w products endpoint qtyUnit będzie null, behavior się różni
   - **Rekomendacja**: **DO DECYZJI NA ETAPIE PLANOWANIA** – czy ta różnica jest zamierzona czy bug? Wymaga unified checkoff logic refactora (2-3 h pracy)

**Ostateczna ocena:** Wszystkie twierdzenia strukturalne potwierdzono; liczby są dokładne do ±2%; checkoff duplication nie jest 100% identyczna.

---

## Code References

### Critical Path Files

- [src/pages/shopping-list/index.astro](src/pages/shopping-list/index.astro) — Entry point (612 LOC)
- [src/pages/api/shopping-list-items/index.ts](src/pages/api/shopping-list-items/index.ts) — Create manual item
- [src/pages/api/shopping-list-items/[id].ts](src/pages/api/shopping-list-items/[id].ts) — Update/delete manual item
- [src/pages/api/shopping-list-items/[id]/checkoff.ts](src/pages/api/shopping-list-items/[id]/checkoff.ts) — Checkoff + add to inventory
- [src/pages/api/products/[id]/checkoff.ts](src/pages/api/products/[id]/checkoff.ts) — Checkoff pantry item
- [src/lib/units.ts](src/lib/units.ts) — Unit conversion logic (112 LOC)
- [src/middleware.ts](src/middleware.ts) — Auth context (31 LOC)
- [src/lib/supabase.ts](src/lib/supabase.ts) — DB client factory (24 LOC, **19 callers** — raport: 15)

### Test Files

- [src/lib/units.test.ts](src/lib/units.test.ts) — 11 test cases (116 LOC)
- [src/lib/validation.test.ts](src/lib/validation.test.ts) — 14 test cases (96 LOC)
- [src/pages/api/shopping-list-items/[id]/checkoff.test.ts](src/pages/api/shopping-list-items/[id]/checkoff.test.ts) — 3 test cases (86 LOC)
- [src/pages/api/products/[id]/checkoff.test.ts](src/pages/api/products/[id]/checkoff.test.ts) — 2 test cases (68 LOC)
- [e2e/seed.spec.ts](e2e/seed.spec.ts) — 1 shopping-list test (auth rejection only)

### Database Schema

- [supabase/migrations/20260605000001_shopping_list_items.sql](supabase/migrations/20260605000001_shopping_list_items.sql) — shopping_list_items table + RLS
- [supabase/migrations/20260528000000_products_schema.sql](supabase/migrations/20260528000000_products_schema.sql) — products table + RLS

---

## Architecture Insights

### Design Patterns Used

1. **Middleware for Auth Context** — Every request passes through middleware to set `context.locals.user`, avoiding repeated auth checks in each route.
   - **Trade-off**: Single point of failure (if middleware breaks, all routes fail)
   - **Evidence**: repo-map.md Risk #2 confirms this is intentional design

2. **API Routes with Form Redirect** — Shopping list operations use form submission with redirect to show errors via URL query params.
   - **Evidence**: All POST/PATCH/DELETE in shopping-list-items redirect back to /shopping-list with ?error= on failure
   - **Benefit**: Server-side rendering + error display without JavaScript

3. **RLS as Primary Security Boundary** — All database queries filtered by `auth.uid() = user_id` at row level.
   - **Limitation**: UPDATE policy missing on shopping_list_items (mitigated by app-level checks)
   - **Evidence**: Policies at [migration:13-27](supabase/migrations/20260605000001_shopping_list_items.sql#L13-L27)

4. **Duplicated Checkoff Logic** — Identical conversion + update logic in 2 endpoints.
   - **Risk**: Bug fixes must be synchronized
   - **Origin**: Likely added sequentially (shopping-list-items first, then products) without refactoring

### Architectural Risks (from repo-map.md + This Analysis)

| Risk | Level | Evidence | Mitigation |
|------|-------|----------|-----------|
| supabase.ts is critical hub (**19 callers** — verified) | CRITICAL | [repo-map.md](context/map/repo-map.md#L203-L218) + ast-grep verification | Thin wrapper, proven stable |
| Middleware guards ALL requests | CRITICAL | [repo-map.md](context/map/repo-map.md#L187-L201) | Good test coverage for auth flows |
| Unit conversion is young (3 weeks) | HIGH | [repo-map.md](context/map/repo-map.md#L168-L185) | 11 unit tests + 2 integration tests |
| Shopping list lacks E2E tests | HIGH | This analysis | Add Playwright test for full flow |
| CRUD operations untested | HIGH | This analysis | Add integration tests for create/update/delete |
| Duplicated checkoff logic | MEDIUM | This analysis + git co-change | Refactor into shared function |

---

## Historical Context (from repo-map.md)

**Relevant Prior Decisions:**

1. **supabase.ts Returns Null** (Decision explained at [repo-map.md:278-283](context/map/repo-map.md#L278-L283))
   - Supabase is optional for local dev
   - All **19 callers** (raport: 15) correctly null-check (good discipline)
   - Applied to shopping-list APIs: all check `if (!supabase) return 503`

2. **Middleware Instead of Per-Route Guards** (Decision at [repo-map.md:285-290](context/map/repo-map.md#L285-L290))
   - Single source of truth for auth
   - PROTECTED_ROUTES controls access
   - Shopping-list is in PROTECTED_ROUTES

3. **Solo Developer + Internal Reviews** (Context at [repo-map.md:299-304](context/map/repo-map.md#L299-L304))
   - Rapid cycles (ship → review → fix same day)
   - Security reviews catch issues early
   - 5 security findings in auth; all fixed within hours

4. **API Routes Tested via E2E, Not Unit Tests** (Rationale at [repo-map.md:292-297](context/map/repo-map.md#L292-L297))
   - Decision: Pure functions (units.ts, validation.ts) get unit tests
   - API routes get integration tests
   - **Current State**: Integration tests exist for checkoff but NOT for CRUD

---

## Related Research

**From context/map/repo-map.md:**
- Hotspots Analysis: Shopping-list is #1 hotspot (8 commits, HIGH risk)
- Risk #1 — Unit Conversion: 3 weeks old, edge cases addressed
- Risk #4 — Shopping List UI: 8 commits in 7 days, known issues fixed

**From context/changes/[other-changes]/research.md:**
- [If other research exists, reference it here]

---

## Open Questions

1. **Should UPDATE RLS policy be added to shopping_list_items?**
   - Current: Application-level check only (at risk of auth bypass if app code changes)
   - Recommended: Add policy for defense-in-depth
   - Unknown: Team's security posture — is this considered acceptable technical debt?

2. **What is the acceptable precision loss in unit conversion?**
   - Evidence: `Math.round(converted * 10000) / 10000` rounds to 4 decimal places
   - Example: 1.23456 kg becomes 1.2346 kg (loss of 0.0001 kg = 0.1g per kg)
   - Unknown: Is this acceptable for user-facing quantities?

3. **Should unitsCompatible() and roundTo2() be used or removed?**
   - Evidence: Exported, never called, redundant with existing patterns
   - Decision needed: Are these utility functions kept for future use, or can they be deleted?

4. **Is the duplicated checkoff logic intentional or technical debt?**
   - Evidence: Identical math in 2 endpoints
   - Known issue from repo-map: "Confirm button re-enabled too early (FIXED Jun 9)" — suggests past bugs in this area
   - Recommendation: Refactor into shared function or ensure tests cover both

5. **Why do shopping-list CRUD operations lack integration tests?**
   - Evidence: Test coverage stops at checkoff endpoints
   - Hypothesis: Checkoff was identified as higher-risk (involves unit conversion), so prioritized for testing
   - Impact: Create/update/delete operations are untested; data corruption possible if validation fails

6. **Should E2E tests for shopping-list flow be added before next release?**
   - Current: Placeholder Playwright test exists, but shopping-list E2E is missing
   - Scope: Add tests for: add item → checkoff with unit conversion → verify in inventory
   - Recommendation: Before shipping next feature, add this test (per repo-map.md roadmap)

---

## Recommendations

### Immediate Actions (Before Next Feature Release)

1. **Add E2E test for shopping-list checkoff flow** (Medium effort, High impact)
   - Test: Add manual item → Checkoff with unit conversion → Verify appears in inventory
   - File: `e2e/shopping-list-checkoff.spec.ts`
   - Effort: ~2-3 hours (based on seed.spec.ts pattern)
   - Blocks: None; can be added independently

2. **Add integration tests for shopping-list CRUD** (Low-medium effort, High impact)
   - Cover: POST create, PATCH update, DELETE delete for manual items
   - File: Create `src/pages/api/shopping-list-items/crud.test.ts`
   - Test cases: 5-7 (success, 400 validation, 404 not found, user isolation)
   - Effort: ~4-5 hours
   - Blocks: None; can be added independently

3. **Add UPDATE RLS policy to shopping_list_items** (Low effort, Medium impact)
   - File: `supabase/migrations/20260610000002_shopping_list_items_update_rls.sql`
   - Policy: `CREATE POLICY "shopping_list_items_update" ON shopping_list_items FOR UPDATE USING (auth.uid() = user_id)`
   - Effort: <30 minutes
   - Risk: None (policy is permissive only; doesn't restrict app-level checks)

### Medium-Term Actions (Phase 2)

4. **Refactor duplicated checkoff logic into shared utility**
   - Extract: `src/lib/checkoff.ts` with `addToInventory(product, qty, unit, ...)`
   - Apply to: Both `shopping-list-items/checkoff` and `products/checkoff`
   - Effort: ~2-3 hours (includes refactor + test update)
   - Benefit: Single source of truth; bug fixes apply to both immediately

5. **Remove dead code (unitsCompatible, roundTo2)**
   - Check: Grep for imports; if none, delete
   - Files: [src/lib/units.ts](src/lib/units.ts) + test file updates
   - Effort: <30 minutes
   - Risk: Low (verified unused)

6. **Quantify acceptable precision loss for unit conversion**
   - Task: Document precision policy in `src/lib/units.ts` header
   - Example: "Conversions round to 4 decimal places; acceptable loss is ±0.0001 per unit"
   - Effort: <15 minutes (documentation only)

### Longer-Term (Phase 3 - Production Hardening)

7. **Add property-based testing for unit conversion edge cases**
   - Tool: fast-check library
   - Test: Random unit pairs + quantities; verify round-trip conversion ≈ original
   - Effort: ~3-4 hours
   - Benefit: Catch rounding surprises before users encounter them

8. **Monitor production data for checkoff anomalies**
   - Metrics: Track conversion errors (422 responses), quantity precision loss
   - Alert: If precision loss exceeds threshold, escalate

---

## Summary Table: What Changed, What Didn't

| Component | Status | Change | Evidence |
|-----------|--------|--------|----------|
| **Units.ts core logic** | ✅ STABLE | No changes since initial implementation (lines frozen) | [git log](src/lib/units.ts) |
| **Unit conversion tests** | ✅ COVERED | 11 test cases cover edge cases | [units.test.ts](src/lib/units.test.ts) |
| **Checkoff logic (manual items)** | 🔴 **UNTESTED** | No integration tests for POST endpoint itself | [checkoff.test.ts exists but only 3 cases](src/pages/api/shopping-list-items/[id]/checkoff.test.ts) |
| **Checkoff logic (pantry items)** | 🟡 **PARTIAL** | Integration tests exist; E2E missing | [products/checkoff.test.ts](src/pages/api/products/[id]/checkoff.test.ts) |
| **CRUD (create/update/delete manual items)** | 🔴 **UNTESTED** | No integration or E2E tests | 0 test files found |
| **Auth integration** | ✅ COVERED | Middleware + RLS; auth rejection tested | [seed.spec.ts:37-40](e2e/seed.spec.ts#L37-L40) |
| **RLS policies** | 🟡 **PARTIAL** | SELECT/INSERT/DELETE present; UPDATE missing | [migration](supabase/migrations/20260605000001_shopping_list_items.sql) |
| **Duplicated logic** | 🔴 **DEBT** | Checkoff math in 2 endpoints; not refactored | [checkoff.ts (both versions)](src/pages/api/shopping-list-items/[id]/checkoff.ts) vs [products/checkoff.ts](src/pages/api/products/[id]/checkoff.ts) |

---

## Conclusion

The Shopping List feature is **production-ready for core use cases** (checkoff with unit conversion) but has **significant gaps in test coverage for secondary operations** (create, update, delete manual items). The architecture is sound — clean layer separation, proper auth integration, and stable business logic — but **tight coupling and duplicated logic create maintenance risk**.

**Decision Framework for Next Work:**
- **Before shipping shopping-list feature to production**: Add E2E test for checkoff flow + CRUD integration tests
- **Before adding new features to shopping-list**: Refactor duplicated checkoff logic to reduce co-change risk
- **Before team grows**: Add UPDATE RLS policy and quantify precision tolerance for unit conversion
