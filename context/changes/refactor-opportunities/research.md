---
date: 2026-08-18T16:45:00Z
researcher: Claude Code Research Agents (5 parallel sub-agents x 3 dimensions each)
git_commit: 11bdb4ccba5c3bd5357742e2dd0e0312592b0582
branch: main-M4
repository: smart-pantry-tracker
topic: "Refactor Opportunities: Prioritize 5 Candidates from Technical Debt Analysis"
tags: [research, refactor, technical-debt, candidates, feasibility, impact]
status: complete
last_updated: 2026-08-18
last_updated_by: Claude Code Research Agents
last_updated_note: "Complete 15-agent investigation: 5 candidates × (present shape + history + feasibility); ranked by debt cost vs. change cost; blocking dependencies identified"
---

# Research: Refactor Opportunities — Technical Debt Prioritization

**Date**: 2026-08-18  
**Researcher**: Claude Code (5 specialized agents, 3 investigations each)  
**Git Commit**: 11bdb4ccba5c3bd5357742e2dd0e0312592b0582  
**Branch**: main-M4  
**Repository**: smart-pantry-tracker  

---

## Research Question

Building on the comprehensive technical debt analysis in `context/changes/shopping-list/research.md`, **which problems merit refactoring, in what order, and at what cost?**

Specifically:
- Which architectural problems would change code structure (true refactoring candidates)?
- What is the intentionality behind each problem (conscious design decision vs. oversight)?
- What is the real effort to fix each, and what must be done first (dependency order)?
- Which 2–3 refactors deliver the highest ratio of debt-reduction to implementation cost?

---

## Summary

The shopping-list analysis identified **11 distinct problems**. Of these, **5 are true refactoring candidates** (code structure changes):

| # | Candidate | Current → Target | Debt Cost | Change Cost | Feasibility | **Rank** |
|---|-----------|-----------------|-----------|-------------|-------------|---------|
| **C1** | Duplicated checkoff logic | 2 endpoints (95% dup) → 1 shared function | Medium | 8h, low risk | EASY | **3** |
| **C2** | Checkoff atomicity | Multi-step queries → PL/pgSQL transaction | HIGH | 15–22h, medium risk | MEDIUM | **1** |
| **C3** | Validation inconsistency | 4 paths, 3 validation gaps → unified layer | MEDIUM | 2.5h (phase 1), low risk | EASY | **2** |
| **C4** | Supabase API leakage | .from() in 11 files → port/adapter abstraction | CRITICAL | 5–7 weeks, medium risk | MEDIUM | **4** |
| **C5** | Manual item fuzzy matching | ILIKE merge → explicit separation or documented feature | LOW | 1–2h, depends on intent | EASY | **1** (pending decision) |

**What the ranking means**: Candidates 2, 3, 1 (in that order) have the strongest cost/benefit ratio given blocking dependencies. C4 is high-impact but requires C1 first. C5 awaits product decision.

---

## Detailed Findings

### Candidate C1: Duplicated Checkoff Logic

**Location**: `src/pages/api/shopping-list-items/[id]/checkoff.ts` vs. `src/pages/api/products/[id]/checkoff.ts`

#### Present Shape (Evidence-Based)

**What's duplicated:**
- Input validation (qty_purchased, units, expiry): **100% identical** across both files
- Unit conversion + rounding logic: **100% identical code** (lines 60–66 in shopping-list; 46–50 in products)
- Update payload construction: **100% identical** for expiry_date, add_to_list, min_threshold
- **Key divergence**: Null-check on `qtyUnit` — products version guards it; shopping-list assumes it exists (no guard)

**Files involved**: 4 (2 endpoints + 2 test files)

**Test coverage**: 5 happy-path cases; no atomicity tests (separate issue — C2)

#### History & Intentionality (Verdict: **Conscious Limitation**)

- **Created**: June 9, 2026, 2.5 hours apart (a962154 vs. a573a70)
- **Phase labels**: Explicit "Phase 1" and "Phase 3" in same feature commit
- **Design decision**: Different data flows justify separation (update existing vs. upsert + delete)
- **Null-check difference**: Intentional — shopping-list has fallback mechanism; products doesn't
- **Parallel maintenance**: Both updated together in triage fixes (commit da29929) — proves awareness of duplication
- **Trade-off made**: Code duplication accepted for clarity/separation of concerns over unified endpoint

**Verdict**: **Not technical debt** in the "overlooked problem" sense — it's a deliberate architectural choice with documented rationale.

#### Feasibility (Path: Extract Shared Function)

**Option**: Extract `performCheckoff()` utility in `src/lib/checkoff.ts`

- **Effort**: 8 hours (2h pure logic, 2h unit tests, 2h refactor endpoints, 2h QA)
- **Risk**: Low (fully reversible, no infra changes)
- **Blocker**: None
- **Test coverage**: Must expand from 5 → 13+ test cases (atomicity + error paths still needed separately)
- **Success metric**: No behavior change; grep finds zero `.update(quantity:...)` calls in api routes (all via shared function)

**Incremental path**: 
1. Extract logic (test-first)
2. Refactor products/[id]/checkoff.ts
3. Refactor shopping-list-items/[id]/checkoff.ts
4. Verify tests pass; no new tests should break

---

### Candidate C2: Checkoff Atomicity Violation

**Location**: `src/pages/api/shopping-list-items/[id]/checkoff.ts` and `src/pages/api/products/[id]/checkoff.ts`

#### Present Shape (Evidence-Based)

**What's broken**:
- Checkoff does SELECT + VALIDATE + UPDATE + DELETE as 3–4 independent API calls
- No transaction wrapper; each auto-commits independently
- Race conditions possible: SELECT reads qty=100, second request SELECTs same, both add 50 → qty=200 (not 250)
- Retry vulnerability: Client retries after timeout → double-increment (qty += 50 twice)
- Partial failure: UPDATE product succeeds, DELETE item fails → item stuck in shopping_list_items, product updated

**Files involved**: 2 endpoints (products/checkoff, shopping-list-items/checkoff)

**Test coverage**: 5 happy-path cases; **0 atomicity tests** (retry, concurrency, partial failure)

#### History & Intentionality (Verdict: **Conscious Limitation**)

- **Plan dated June 8, 2026**: Explicitly states "Increment is fetch-then-write, not atomic"
- **Rationale documented**: Supabase JS client has no `quantity = quantity + x` server-side expressions; no RPC pattern exists in codebase
- **Single-user assumption**: App treats one user per account (no multi-user race conditions expected in MVP)
- **Three constraints acknowledged**:
  1. Supabase JS client limitation
  2. Codebase consistency (every other quantity write uses fetch-then-write)
  3. Single-user design (no optimistic locking exists anywhere)
- **Status in domain refactor** (Aug 18): NOW flagged as **Priority #1 invariant violation** — decision changed post-MVP

**Verdict**: **Intentional deferral** — "Not production-strength but acceptable for MVP" decision made explicitly at time of implementation.

#### Feasibility (Path: PL/pgSQL RPC Transaction)

**Option A (Recommended)**: Create PL/pgSQL function `checkoff_product_atomic()` via `.rpc()` call

- **Effort**: 15–22 hours (4–6h domain aggregate, 5–8h RPC + repo, 6–8h route refactors, 1–2h cleanup)
- **Risk**: Medium (new abstraction, transaction handling, error mapping)
- **Blockers**: None immediately, but **C1 helpful** (consolidates duplication before transaction refactor)
- **Test coverage**: Must expand from 5 → 30–40+ test cases (concurrent checkoffs, idempotency, partial failures)
- **Infrastructure**: Existing RPC support in Supabase; PL/pgSQL proven via migrations
- **Phases**: 
  1. Domain aggregate (RestockableProduct) + error types
  2. Repository interface + PL/pgSQL function + fake implementation
  3. API route refactors (POST, PUT, checkoff endpoints)
  4. Cleanup + documentation

**Key prerequisite**: C3 (validation) should be done first — ensures product state can't start invalid.

---

### Candidate C3: Validation Inconsistency

**Location**: Scattered across `products/index.ts` (POST), `products/[id].ts` (PUT), checkoff endpoints

#### Present Shape (Evidence-Based)

**Validation gaps**:

| Endpoint | quantity > 0 | min_threshold > 0 | unit known/unchanged |
|----------|:----:|:----:|:----:|
| POST /api/products | ❌ | ❌ | ❌ |
| PUT /api/products/[id] | ✅ | ✅ | ✅ |
| POST /api/shopping-list-items/[id]/checkoff | ⚠️ (qtyPurchased only) | ❌ | N/A |
| PATCH /api/shopping-list-items/[id] | ⚠️ (qty only) | ❌ | ❌ |

**Critical bug discovered**: `shopping-list-items/[id]/checkoff.ts:93` creates new products with `min_threshold: 0` (violates "min_threshold must be > 0" invariant).

**Current validation state**: `validateProductInput()` exists (14 test cases, fully covered) but only called from PUT; POST and checkoff paths don't use it.

#### History & Intentionality (Verdict: **Conscious Gap**)

- **Created**: POST (June 2, 2026) without validation
- **validateProductInput() added**: June 10, 2026 — explicitly scoped to PUT only
- **Plan document**: "Testing Bootstrap" plan explicitly notes POST shares same gap but "Deferred to follow-up" — classified as out-of-scope for Phase 1
- **Risk tracking**: Marked HIGH severity in domain refactor plan (Aug 18) with note "worth raising as new risk in future --refresh"
- **Status**: Intentional MVP deferral, now known as high-priority debt

**Verdict**: **Not an oversight** — two-phase rollout: Phase 1 (June 10) fixed PUT for Risk #6; POST remains in backlog, already flagged.

#### Feasibility (Path: Incremental Consolidation)

**Phase 1 (Recommended first, 2.5 hours, LOW RISK):**

1. **Fix critical bug** (shopping-list-items/[id]/checkoff.ts:93): Validate min_threshold > 0 before insert
   - 15 minutes code + 1 hour test (catch this with new validation test)
   
2. **POST /api/products/index.ts**: Call `validateProductInput()` before insert
   - 15 minutes code + 1 hour test
   
3. **PATCH /api/shopping-list-items/[id].ts**: Add unit validation (isKnownUnit check)
   - 15 minutes code + 1 hour test

**Phase 2 (1.5 hours, MEDIUM RISK):**

4. Extract `validateCheckoffInput()` function — unify checkoff validation
   - Covers shopping-list-items POST and checkoff edge cases
   - 1 hour function + tests, 30 min apply to endpoints

**Blockers**: None (C1, C2 are independent)

**Test coverage**: Currently 0 validation-failure tests for POST, shopping-list-items endpoints; Phase 1 adds 1–2 cases per endpoint.

---

### Candidate C4: Supabase PostgREST API Leakage

**Location**: Scattered across 11 implementation files (8 API routes + 3 Astro pages)

#### Present Shape (Evidence-Based)

**Leakage scope**:
- **11 implementation files** call `.from("table").select()/.update()/.delete()/.insert()`
- **6 query patterns duplicated**:
  - SELECT + ORDER (inventory sorting): 3 locations
  - SELECT + eq filters (ILIKE lookups): 6+ locations
  - UPDATE + eq (user isolation): 6 locations
  - DELETE + eq: 3 locations
  - INSERT: 3 locations
- **Test harness replicates entire query builder API** (fake-supabase.ts lines 41–110)
- **Zero abstractions**: No repository pattern, no DI container, no adapter layer

**Key note**: Research.md claimed "20+ files" — actually **11 files** (more accurate count from verification).

#### History & Intentionality (Verdict: **MVP Pragmatism + Unawareness**)

- **May 21, 2026**: `supabase.ts` created as **client factory** (not abstraction layer)
- **June 2, 2026**: First API routes immediately call `.from()` directly
- **Design intent**: Supabase.ts documented as "client factory" in CLAUDE.md, not abstraction boundary
- **Awareness without action**: infrastructure.md explicitly notes Supabase's WebSocket Realtime specifics but no abstraction plan created
- **Solo dev context**: 26-day MVP (40+ commits); speed prioritized; refactoring never revisited
- **Auth leakage too**: Same pattern for `.auth.getUser()` across 5 files (parallel problem)

**Verdict**: **Not accidental** — but not a deliberate architectural choice either. More "pragmatic MVP acceptance" that was never examined.

#### Feasibility (Path A: Incremental Port/Adapter Refactor)

**Prerequisite**: C1 (consolidate duplication) recommended first — reduces scope by clarifying what abstractions are needed.

**Option**: Repository pattern with ports (ProductRepository, ShoppingListItemRepository) and adapters (SupabaseProductRepository, FakeProductRepository)

- **Effort**: 5–7 weeks (solo developer)
  - Week 1: Ports + adapters + DI container
  - Weeks 2–3: Refactor API routes (parallelizable per route)
  - Week 4: Refactor Astro pages
  - Week 5: Cleanup + grep verification
  
- **Risk**: Medium (15+ files touch, DI patterns new to codebase)
- **Blocker**: **REQUIRES C1 first** (consolidate duplication before abstracting; reduces churn)
- **Test coverage**: Must rebuild test harness (fake-supabase.ts becomes FakeProductRepository)
- **Auth abstraction**: Parallel effort, can follow C4

**Success metric**: `grep "@supabase" src/` returns 4 files (adapters + client factory) only.

---

### Candidate C5: Manual Item Fuzzy Matching (ILIKE)

**Location**: `src/pages/api/shopping-list-items/[id]/checkoff.ts:47`

#### Present Shape (Evidence-Based)

**Current behavior**:
- Manual shopping list items are checked off via `.ilike("name", name)` — case-insensitive exact match
- If pantry product "Milk" exists, manual "milk" matches and UPDATES the product (merges)
- If no match, manual "milk" INSERT creates new product
- Item is deleted after checkoff (line 103–107)
- **Result**: Manual items de facto LINK to pantry products if names match (case-insensitive)

**FR-14 specification**: "User can manually add an arbitrary item to their shopping list (not linked to a pantry product)"

**Current divergence**: Code behavior (fuzzy merge) contradicts spec ("not linked").

#### History & Intentionality (Verdict: **Unintended Side Effect**)

- **June 9, 2026** (a573a70): Checkoff endpoint created with `.eq("name", name)` (case-sensitive match)
- **June 9, 2026 (~4 hours later)** (da29929): Triage review Finding F2 — "case-sensitive name match can create duplicate pantry products"
- **Fix applied**: Change `.eq()` to `.ilike()` — **explicitly framed as "prevent case-sensitive duplicates"**, not "enable linking"
- **Result**: ILIKE was a tactical bug fix (duplicates), not a strategic feature (linking)
- **Plan contradiction**: Original plan (June 8) called for reusing DELETE endpoint for manual items, not creating new checkoff endpoint
- **Current status**: Domain distillation marks as "Rozjazd" (divergence) with note "unclear if intentional"

**Verdict**: **Unintended side effect** — ILIKE solves case-sensitivity bug; linking is a consequence, not intention.

#### Feasibility (Dual Paths Pending Intent Clarification)

**Path A: Forbid fuzzy (preserve manual separation)**

- **Change**: Line 47: `.ilike()` → `.eq()` (exact match)
- **Impact**: Going forward, manual "milk" won't find pantry "Milk" (creates duplicate products)
- **Effort**: 2 hours (1 line code + test cases + decision on products/checkoff consistency)
- **Risk**: Medium (UX surprise for users expecting merge; must decide products/checkoff consistency)
- **Blocker**: Must understand whether ILIKE was intentional (requires git blame review)

**Path B: Document as feature (accept linking)**

- **Change**: Update PRD FR-014 to clarify implicit linking is intentional
- **Effort**: 1.25 hours (docs + code comment + test case)
- **Risk**: Low (code-wise); High (spec-wise — contradicts Socrates rationale)
- **Blocker**: Must get stakeholder decision to change spec

**Critical decision gate**: Was ILIKE intentional convenience feature, or accidental side effect?  
- If **accidental** → Path A (clear bug fix, aligns with spec)
- If **intentional** → Path B (but requires spec change + justification)

---

## Refactor Opportunities: Ranked Candidates

### **Recommendation: Execute in This Order**

Based on **blocking dependencies**, **debt-to-effort ratio**, and **evidence of intent**:

---

### **#1: C3 — Validation Consolidation** (EXECUTE IMMEDIATELY)

**Current → Target**: 4 scattered validation paths → 1 unified layer

**Why this ranks #1**:
- **Lowest effort** (2.5 hours Phase 1) with **high impact** (fixes critical bug + 3 validation gaps)
- **Zero blockers** — independent from C1, C2, C4
- **Clear intent** — documented as deliberate deferral, now known as HIGH-risk debt
- **Critical bug** fixed first — min_threshold=0 in checkoff creates invalid products
- **Enables C2** — validation must be solid before atomicity work

**Debt-to-effort ratio**: **HIGHEST** (medium debt, minimal effort)

**Timeline**: Start now; Phase 1 doable in <1 sprint, Phase 2 optional follow-up

**Success metrics**:
- ✅ POST validates quantity > 0, min_threshold > 0, unit known
- ✅ All checkoff endpoints validate min_threshold when creating products
- ✅ Test coverage expands to 3+ validation-failure cases per endpoint

---

### **#2: C2 — Checkoff Atomicity** (START AFTER C3, BUT PLAN NOW)

**Current → Target**: Multi-step queries without transaction → PL/pgSQL atomic operation

**Why this ranks #2**:
- **Highest impact** — eliminates retry-vulnerability and concurrency risks
- **Clear intent** — documented as conscious deferral; now flagged as Priority #1 in domain refactor
- **Medium effort** (15–22 hours) amortized over 4 phases; fully parallelizable testing
- **No hard blockers** — but C3 (validation) should precede to ensure safe state

**Debt-to-effort ratio**: **HIGH impact, medium effort**

**Timeline**: 4–5 weeks after C3; can plan in parallel

**Blocking sequence**:
1. ✅ C3 validates state before checkoff (ensures product won't start invalid)
2. ✅ C1 consolidates duplication (optional but reduces churn; recommend)
3. 🚀 C2 wraps consolidated logic in atomic transaction

**Success metrics**:
- ✅ `.rpc("checkoff_product_atomic")` called from both endpoints
- ✅ PL/pgSQL function acquires row-level lock, validates unit compatibility, increments, deletes item
- ✅ Retry test: duplicate checkoff request doesn't double-increment
- ✅ Concurrency test: two concurrent checkoffs don't both succeed

---

### **#3: C1 — Consolidate Checkoff Logic** (EXECUTE BETWEEN C3 AND C2)

**Current → Target**: 95% duplicated logic (2 endpoints) → shared utility

**Why this ranks #3**:
- **Medium impact** (reduces duplication, eases maintenance)
- **Very low effort** (8 hours, fully reversible)
- **Clear intent** — intentional separation; documented rationale
- **Enables C2** — consolidation reduces surface area for transaction refactoring

**Debt-to-effort ratio**: **MEDIUM-low effort, medium impact**

**Timeline**: 1 sprint between C3 and C2

**Success metrics**:
- ✅ `src/lib/checkoff.ts` exports `performCheckoff(input) → result`
- ✅ Both endpoints call shared function
- ✅ All tests pass; no behavior change

---

## Candidates Considered & Rejected

### **C4: Supabase API Leakage** — **DEFER TO PHASE 2**

**Why rejected for Phase 1**:
- **Very high effort** (5–7 weeks) relative to immediate business impact
- **Blocking dependency**: Recommend C1 first (consolidate duplication before abstracting)
- **High risk**: New DI patterns, full test harness rebuild
- **Lower priority**: Debt is real but not blocking current features

**When to revisit**: After C1–C3 complete (Phase 2); valuable for team growth and SDK portability.

**Note**: This work is well-scoped and documented (see ACL analysis in domain documents); can be executed by junior engineer with mentoring.

---

### **C5: Manual Item Fuzzy Matching** — **PENDING DECISION**

**Why rejected for Phase 1**:
- **Unresolved intent** — ILIKE was case-sensitivity bug fix, but linking is side effect
- **Specification conflict** — FR-14 says "not linked"; implementation does link
- **Blocking decision**: Product stakeholder must decide: is linking a feature or bug?

**Path A (forbid fuzzy)**: 2 hours, aligns with spec, but requires consistency decision on products/checkoff  
**Path B (document feature)**: 1.25 hours, lower effort, but requires spec change

**When to revisit**: After clarifying intent (git blame review) + product decision on manual-item semantics.

**Note**: This is a low-risk, low-effort fix (1–2 hours) once decision is made. Can be paired with C1 or C3 work in same sprint.

---

## Non-Refactoring Debt (Test Gaps, Documentation)

The shopping-list analysis identified these as **NOT candidates** (test/docs gaps, not structure changes):

| Problem | Type | Owner | Effort | Status |
|---------|------|-------|--------|--------|
| CRUD operations untested (POST create, PATCH update, DELETE) | Test gap | QA/test framework | 4–5h | Backlog |
| Missing RLS UPDATE policy | DB policy gap | Infrastructure | 30min | Backlog |
| E2E shopping-list flow untested | Test gap | E2E framework | 2–3h | Backlog |
| Dead code (unitsCompatible, roundTo2) | Code cleanup | Dev | 30min | Backlog |

These are valuable but do NOT require architectural refactoring — they're addressed through testing and policy additions.

---

## Execution Plan Summary

| Phase | Candidates | Timeline | Blockers | Risk |
|-------|-----------|----------|----------|------|
| **1 (Immediate)** | C3 (validation consolidation) | 1–2 sprints | None | Low |
| **2 (Weeks 3–4)** | C1 (checkoff duplication) | 1 sprint | C3 complete | Low |
| **3 (Weeks 5–8)** | C2 (atomicity via RPC) | 4–5 weeks | C3 + C1 ideal | Medium |
| **4 (Deferred)** | C4 (Supabase abstraction) | 5–7 weeks | C1 first | Medium |
| **5 (Pending)** | C5 (fuzzy matching) | 1–2 hours | Intent decision | Easy once decided |

---

## Appendix: Evidence Summary

### Candidates Verified Evidence

| Candidate | Shape Evidence | History Evidence | Feasibility Evidence |
|-----------|---|---|---|
| C1 | Exact line-by-line diff (shopping-list vs products checkoff) | Commit dates (June 9, 2.5h apart), plan phase labels, triage review | Path A: extract function, 8h, low risk, 0 blockers |
| C2 | State diagram showing all failure paths (7 outcomes) | Plan (June 8) explicit statement "not atomic", 3 constraints documented, domain refactor (Aug 18) now flags as #1 priority | RPC via `.rpc()`, 15–22h, 4 phases, C3 prerequisite |
| C3 | Validation matrix (POST/PUT/checkoff coverage) + critical bug (min_threshold=0) | Commit timeline (June 2 → June 10), plan doc "deferred to follow-up", risk tracking | Phase 1: 2.5h (bug fix + POST + PATCH), Phase 2: 1.5h (checkoff unification), 0 blockers |
| C4 | File inventory (11 impl files + 6 patterns duplicated) | May 21 client factory, June 2 first .from() call, MVP pragmatism, awareness without action | Path A: incremental, 5–7 weeks, C1 prerequisite, medium risk |
| C5 | Current behavior (.ilike exact match), diff to spec (FR-14) | Commit a573a70 (June 9), da29929 (4h later, F2 fix), intent conclusion (unintended side effect) | Path A: forbid (2h, needs consistency decision), Path B: document (1.25h, needs spec change) |

---

## Conclusion

The shopping-list feature is production-ready for MVP use cases but carries **5 refactoring opportunities** ranging from immediate (C3: 2.5h) to deferred (C4: 5–7 weeks). 

**Recommended execution**: C3 → C1 → C2 over 8–10 weeks, with C4 and C5 deferred to Phase 2 pending stakeholder decisions.

**What's required**: Discipline to follow blocking dependencies (C3 before C1, C1 before C2) and resist scope creep (C4 is valuable but separate).

The debt is real, intentional (not an oversight), and has been quantified. The path forward is clear.
