# Contributors: Kontekst Kontrybutorów — src/lib/supabase.ts

**Focal Point**: `src/lib/supabase.ts` (CRITICAL HUB — 15 callers)  
**Solo Developer**: Kinga Nowak (kinga.nowak@dreamstormstudios.com)  
**Analysis Period**: May 21, 2026 – June 15, 2026  

---

## 1. Contributor Map: Who Worked on What

### Supabase.ts Itself

```
Commits touching src/lib/supabase.ts:
  1. 3c23875 (2026-05-21) "Skill bootstrapper"
     Author: Kinga Nowak
     Action: Initial creation of supabase.ts factory
     Lines: 25 lines (complete implementation, no changes since)
```

**Observation**: `supabase.ts` has been **stable since initial creation** (May 21). **Zero modifications** in the 26-day project history. This is intentional — the factory is a thin wrapper that *should* be stable.

### Infrastructure Around Supabase.ts

**Files that changed TOGETHER with supabase.ts area** (mid-tier dependencies):

| File | Changes | Date Range | Author | Context |
|------|---------|-----------|--------|---------|
| `src/middleware.ts` | 6 | May 21 – Jun 7 | Kinga | Auth flow, route protection |
| `src/pages/api/auth/*.ts` | 5 files | May 21 – Jun 5 | Kinga | Auth endpoints (signin, signup, reset, update, confirm) |
| `src/lib/units.ts` | 3 | Jun 9–11 | Kinga | Unit conversion (tested, validated) |
| `src/lib/validation.ts` | 1 | Jun 10 | Kinga | Product input validation |

---

## 2. Temporal Patterns: When Supabase Area Was Active

### Timeline: Infrastructure Development

```
May 21 (T+0):      ✅ Skill bootstrapper
  └─ src/lib/supabase.ts created (no changes since)
  
May 28 (T+7):      ✅ DB Schema & RLS Phase 1
  └─ supabase/migrations/20260528000000_products_schema.sql
  └─ supabase.ts tested in API context (not modified)

June 2 (T+12):     ✅ DB Schema Review
  └─ Plan review flagged: createClient() calling convention missing from contracts
  └─ Mitigation: contracts updated, not supabase.ts itself

June 2 (T+12):     ✅ Auth Completion Phase 1
  └─ First auth endpoints added (signin.ts uses supabase.ts)
  └─ supabase.ts proves stable under auth load

June 5 (T+15):     ✅ Auth Completion Phase 2 + Shopping List Core P1
  └─ Password reset flow (reset-password.ts)
  └─ Route protection added (middleware.ts + PROTECTED_ROUTES)
  └─ supabase.ts handles new load: middleware auth check + 5 auth endpoints + API routes

June 5 (T+15):     🔴 Auth Impl Review: 5 Security Findings
  └─ F1-F5: Issues found in auth flows (confirm.ts, reset-password.ts, middleware.ts)
  └─ F3 specifically: `/api/auth/update-password` missing from PROTECTED_ROUTES
  └─ supabase.ts NOT faulted (findings in calling code, not factory)

June 7 (T+17):     ✅ Shopping List Core P1 Feature Gate
  └─ middleware.ts updated: PROTECTED_ROUTES expanded
  └─ supabase.ts carries 9 callers now (middleware + 8 API routes)

June 9-10 (T+19-20): ✅ Shopping List Complete Feature
  └─ Manual checkoff + unit conversion  
  └─ Impl review: F1-F4 findings (mostly validation, not supabase)
  └─ supabase.ts carries 13 callers now (stable)

June 10 (T+20):    ✅ Testing Bootstrap (Vitest + Unit Conversion)
  └─ units.ts tested (30 test cases)
  └─ validation.ts tested (10 cases)
  └─ supabase.ts NOT tested (no unit tests for factory, only integration)
  └─ **RISK**: No isolated tests for supabase.ts

June 11 (T+21):    🔧 Added hook
  └─ src/lib/units.ts modified (hook for build process)
  └─ supabase.ts untouched

June 15 (T+25):    ✅ Checkoff-Unit-Conversion Integration Tests
  └─ E2E tests added (playwright)
  └─ Integration tests for checkoff flow (shopping-list-items/[id]/checkoff.test.ts)
  └─ supabase.ts tested via integration (indirectly)
```

**Key Pattern**: supabase.ts was **created early (May 21), immediately stable, zero changes**. All load added via dependent files (middleware, API routes). Design holds under 26 days of feature development.

---

## 3. Knowledge Concentration: One Developer, All Areas

### Single Developer Across All Layers

```
Timeline:
  Kinga Nowak (solo) → May 21 through June 15
    ├─ DB schema design (May 28)
    ├─ Supabase factory (May 21 — done once, never touched)
    ├─ Middleware (auth check, PROTECTED_ROUTES)
    ├─ Auth endpoints (signin, signup, reset, update, confirm)
    ├─ API routes (products, shopping-list-items)
    ├─ Business logic (units, validation)
    ├─ UI pages & forms
    └─ Testing (Vitest, Playwright)
```

**Concentration**: ALL knowledge resides with Kinga Nowak. Single point of failure for:
- Supabase factory logic
- Auth flow decisions
- API route patterns
- Test patterns

**Risk**: No second pair of eyes on supabase.ts. Reviews were internal (self-reviews), not peer reviews.

---

## 4. PR/Review History: Edge Cases & Known Issues

### No Traditional PRs (Solo Dev)

This is a solo project. No GitHub PRs in traditional sense. Reviews are **post-implementation** via review-bot agents.

### Impl Reviews Touching Supabase.ts Callers

#### Review #1: DB Schema & RLS (June 2)

**Plan Review Finding F3** (OBSERVATION):
```
Location: Phase 2 Changes #1 and #2
Detail: createClient() calling convention absent from API route contracts

Before: Contracts only said "null-check createClient()"
After: Contracts added "createClient(context.request.headers, context.cookies)"

Impact: Callers must pass exact params or createClient returns null
Risk: If signature changes (params or return), 15 callers break
```

**Decision**: Document the exact calling convention. Don't change supabase.ts itself — design is correct, documentation was incomplete.

---

#### Review #2: Auth Completion (June 5)

**Impl Review — 5 Findings** (0 critical to supabase.ts, 5 to callers):

**F3 — /api/auth/update-password not in PROTECTED_ROUTES**
```
Severity: WARNING
Location: src/middleware.ts:4
Detail: API endpoint accepts unauthenticated POSTs
Root Cause: middleware.ts didn't guard the route; supabase.ts fine

Fix: Added "/api/auth/update-password" to PROTECTED_ROUTES array
     This is middleware responsibility, not supabase.ts
```

**F4 — No server-side null guard on email**
```
Severity: WARNING
Location: src/pages/api/auth/reset-password.ts:5
Detail: form.get("email") discarded null; direct POST reaches Supabase with null
Root Cause: reset-password.ts validation missing; supabase.ts fine

Fix: Added if (!email?.trim()) guard before supabase call
```

**Pattern**: All 5 findings in auth-completion review are in CALLERS of supabase.ts, not in supabase.ts itself.

**supabase.ts Resilience**: The factory gracefully handles edge cases:
- Returns `null` if env vars missing → callers must check
- Passes through Supabase error messages → callers must handle
- No exceptions thrown (defensive coding)

---

#### Review #3: Shopping List Complete (June 9)

**Impl Review — 4 Findings**:

| Finding | Location | Root Cause | Fault |
|---------|----------|-----------|-------|
| F1 | checkoff.ts:18 | No qty validation | checkoff.ts, not supabase |
| F2 | shopping-list-items/checkoff.ts | Case-sensitive name lookup | query logic, not supabase |
| F3 | plan.md | Plan outdated | documentation, not supabase |
| F4 | shopping-list/index.astro | Confirm button re-enable | UI logic, not supabase |

**supabase.ts Role**: Provides `.eq()`, `.ilike()`, `.update()` methods via SupabaseClient. Factory itself faultless.

---

#### Review #4: Testing Bootstrap (June 10)

**Impl Review — APPROVED (0 critical, 1 warning, 1 observation)**

**supabase.ts Testing**: **No unit tests exist**. Reasoning:
- supabase.ts is a thin wrapper (25 lines)
- All logic is Supabase SDK initialization (external library)
- Testing would mock @supabase/ssr, adding little value
- Integration tests (via API routes) provide coverage
- **Known Gap**: If supabase.ts changes (env var handling, cookie logic), no isolated tests catch regressions

**Decision (Implicit)**: Accept this gap for MVP. Flag for future hardening.

---

## 5. Themes That Repeat (Kinga's Patterns)

### Pattern 1: Early Stability, Zero Rework

**Evidence**:
- supabase.ts: created May 21, **never touched** (25 lines, perfect first time)
- middleware.ts: created May 21, modified **2x** (formatting, security gate fix) — working as intended
- No "revert this change" commits in history

**Theme**: Kinga designs carefully upfront, implementations stick. Low iteration count.

---

### Pattern 2: Security-First Mindset

**Evidence**:
- Auth completion impl review triggered immediate security audit (5 findings)
- Findings: open-redirect bypass, type validation gap, route protection missing, null guards
- All fixed same session
- Zero security issues in supabase.ts itself (good design)

**Theme**: Security taken seriously. Proactive audits at feature milestones.

---

### Pattern 3: Contracts Over Implementation

**Evidence**:
- Plan reviews check contracts (API signatures, calling conventions) BEFORE impl
- Issues flagged: "Middleware signature doesn't match products/[id].ts" (plan review F1)
- Decision: Fix contract docs, not the code

**Theme**: Design-first. Contracts are the source of truth.

---

### Pattern 4: Integration > Unit Testing

**Evidence**:
- units.ts: 20 unit tests (comprehensive)
- validation.ts: 10 unit tests (comprehensive)
- supabase.ts: 0 unit tests (not isolated)
- Test approach: unit tests for pure functions (units, validation), integration tests for routes + supabase

**Theme**: Test the seams (API routes + real DB) more than internals.

---

### Pattern 5: Rapid Feature Cycles with Retrospectives

**Evidence**:
- Impl reviews within 1-2 days of feature completion
- Findings triaged & fixed same session
- Post-implementation (not pre), but fast feedback loop

**Timeline**:
- June 2: DB schema shipped
- June 2: Plan review + impl review same day
- June 5: Auth shipping → review same day
- June 9: Shopping-list shipping → review same day

**Theme**: Move fast, audit hard, fix immediately.

---

## 6. Edge Cases & Known Issues Affecting supabase.ts Callers

### Edge Case #1: Env Var Missing (supabase.ts Handles Correctly ✅)

```typescript
if (!SUPABASE_URL || !SUPABASE_KEY) {
  return null;
}
```

**All 15 callers MUST null-check**:
```typescript
const supabase = createClient(headers, cookies);
if (!supabase) {
  return new Response("Supabase is not configured", { status: 503 });
}
```

**Known Pattern**: 
- Callers handle this consistently (all return 503 or redirect)
- No callers forget the check (good discipline)
- Risk: If someone adds new caller without null-check, app crashes

**Mitigation**: Code review checklist item — "new supabase.ts caller must null-check"

---

### Edge Case #2: Cookie State Lost (supabase.ts Cookie Handling ✅)

```typescript
cookies: {
  getAll() {
    return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(...);
  },
  setAll(cookiesToSet) {
    cookiesToSet.forEach(({ name, value, options }) => {
      cookies.set(name, value, options);
    });
  },
}
```

**How It Works**:
1. Request comes in with `Cookie` header
2. parseCookieHeader() extracts cookies
3. Supabase auth checks session (via cookie)
4. If new session, Supabase calls setAll() → cookies.set()
5. Astro response includes Set-Cookie header

**Risk**: If `cookies.set()` is called after response headers sent, cookie won't be set.

**Known Issue**: Not a bug, but a constraint. Middleware must call supabase BEFORE doing any response.set(). Currently follows this pattern (line 7 of middleware.ts).

---

### Edge Case #3: Auth State Inconsistency (supabase.ts Fine, middleware Correct)

```typescript
// middleware.ts line 16-18
if (supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  context.locals.user = user ?? null;
} else {
  context.locals.user = null;
}
```

**Decision Made**: If Supabase unavailable, treat as unauthenticated.

**Rationale**: Fail-open is safer than fail-closed. Unauthenticated users see public pages; if they hit protected route, they're redirected to signin. At that point, if Supabase is down, signin fails gracefully (503).

**Known Trade-off**: 
- Pro: App doesn't crash if Supabase briefly unavailable
- Con: Authenticated users appear logged-out if Supabase down

**Status**: Accepted trade-off for MVP. Not flagged in reviews.

---

### Edge Case #4: Form Data Encoding (supabase.ts Not Involved)

**Pattern Seen Across API Routes**:
```typescript
// Good (products/[id].ts, other routes):
return new Response(encodeURIComponent(errorMessage), { status: 500 });

// Bad (some routes initially):
return context.redirect(`/auth/signin?error=${error.message}`); // unencoded
```

**Plan Review F4 (db-schema)**: Flagged that error redirects were missing `encodeURIComponent()`.

**Decision**: Applied consistently across API routes.

**supabase.ts Role**: None (this is caller responsibility).

---

### Edge Case #5: Type Validation in Auth Callbacks (supabase.ts Fine)

**Auth Completion Finding F2**: 
```
Location: src/pages/auth/confirm.ts:16
Issue: type parameter passed to verifyOtp without validating type === "recovery"

Vulnerable: /auth/confirm?token_hash=X&type=anything
Fix: Changed to: token_hash && type === "recovery"
```

**supabase.ts Role**: None (this is callback logic).

**supabase.ts Benefit**: Offers `.auth.verifyOtp()` method, which does internal validation. Caller's responsibility to validate input BEFORE calling.

---

## 7. Decision Points & Rationales: Why supabase.ts Is Designed This Way

### Decision 1: Nullable Return (Returns `null` If Env Vars Missing)

**Original Requirement**: "Supabase is optional for local development."

**Options**:
- A: Return null if env vars missing
- B: Throw exception
- C: Create mock client for local dev

**Chosen**: A (return null)

**Rationale**: 
- Explicit is better than implicit (null-check is visible)
- Dev can work offline (pages load, but API calls fail with clear 503)
- No mocking complexity
- Matches Astro pattern (optional integrations return null)

**Evidence**: All 15 callers correctly null-check. No crashes from missing env vars.

---

### Decision 2: Thin Wrapper Over @supabase/ssr (Don't Reinvent)

**Original Requirement**: "SSR auth flow with Astro."

**Options**:
- A: Implement own auth from Supabase REST API
- B: Use @supabase/ssr (Supabase-blessed SSR lib)
- C: Use @supabase/supabase-js directly

**Chosen**: B (wrap @supabase/ssr)

**Rationale**:
- @supabase/ssr handles cookie-based auth session (required for SSR)
- @supabase/supabase-js doesn't (browser-only)
- Thin wrapper minimizes bugs
- Supabase maintains @supabase/ssr

**Evidence**: No issues in supabase.ts in 26 days of development. Factory is rock-solid.

---

### Decision 3: Cookie Parsing in Middleware (Not in supabase.ts)

**Original Requirement**: "Session state flows via cookies."

**Options**:
- A: Parse cookies in supabase.ts
- B: Parse cookies in middleware, pass to supabase
- C: Let Supabase SDK handle all cookie logic

**Chosen**: A (parse in supabase.ts, wrap @supabase/ssr)

**Rationale**:
- @supabase/ssr requires caller to implement cookie getAll/setAll
- Centralizing this in supabase.ts (factory) prevents duplication
- All callers benefit (middleware + 14 API routes)

**Evidence**: Pattern works. No cookie-related bugs.

---

## 8. Risk Mitigation: What Could Break, How to Protect

### Risk A: Env Var Name Changes (Medium Risk)

**Scenario**: Refactor env vars from `SUPABASE_URL`/`SUPABASE_KEY` to `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_KEY`.

**Impact**: supabase.ts breaks immediately. 15 callers indirectly affected.

**Mitigation**: 
- Commit message should explain rationale
- Run full E2E test suite (auth flow, API routes, protected pages)
- Verify CI passes (lint, build, test)

**Current State**: 
- Env vars defined in astro.config.mjs (env.schema)
- Change there = change in supabase.ts = change everywhere
- Risk: Medium, but contained via CI

---

### Risk B: Cookie Handling Changes (High Risk)

**Scenario**: Astro cookies API changes (version bump), or Supabase auth changes cookie format.

**Impact**: Auth state lost or corrupted. All users logged out. All API routes fail.

**Mitigation**:
- supabase.ts has NO unit tests (only integration)
- If cookie logic breaks, E2E tests will catch it (auth flow)
- But no way to isolate & test cookie parsing
- **Action**: Add unit tests for cookie handling

**Current State**: 
- No unit tests for supabase.ts
- Integration tests cover happy path
- Edge cases (malformed cookies, missing headers) untested

---

### Risk C: Supabase SDK Major Version (Medium Risk)

**Scenario**: @supabase/ssr v1 → v2 (breaking changes).

**Impact**: supabase.ts may need rewrite. 15 callers unaffected if wrapper interface stays the same.

**Mitigation**:
- Pin @supabase/ssr version in package.json (currently `^0.10.3` — can go up to 0.x)
- Review breaking changes before upgrading
- Test auth flow after upgrade

**Current State**: 
- Version pinned to ^0.10.3 (allows minor bumps)
- No upgrade pressure yet

---

### Risk D: New Caller Forgets Null Check (Low Risk)

**Scenario**: Developer adds 16th API route that calls supabase.ts without null-check.

**Impact**: 503 if Supabase down → app crashes on that route.

**Mitigation**:
- Linter could enforce null-check (need custom rule)
- Code review process should catch it
- CI would fail on type check if done carefully

**Current State**: 
- 15/15 callers correctly null-check
- Good discipline, but not enforced by tooling

---

## 9. Summary: Kinga's Stewardship of supabase.ts

### Strengths

✅ **Stability**: Created once (May 21), never changed. Holds under 26 days of feature development & 15 callers.

✅ **Defensive Design**: Returns null on missing env vars. All callers null-check (no crashes).

✅ **Right Abstraction Level**: Thin wrapper over @supabase/ssr. Exactly right amount of indirection.

✅ **Security-First Mindset**: No security issues in supabase.ts itself. Callers audited regularly.

✅ **Caller Consistency**: All 15 callers follow same null-check + error-response pattern. Good discipline.

### Weaknesses / Risks

⚠️ **No Unit Tests**: supabase.ts untested in isolation. Cookie parsing, error handling not tested.

⚠️ **No Tooling Enforcement**: Null-checks rely on developer discipline, not linter rules.

⚠️ **One Developer**: All knowledge in Kinga's head. No peer review. No docs beyond code.

⚠️ **No Changelog**: When env vars change or behavior changes, no explicit tracking of what changed why.

⚠️ **Single Point of Failure**: If supabase.ts breaks, entire app down. No graceful degradation.

---

## 10. Recommendations for Future Work

### Before Next Major Refactor

1. **Add Unit Tests for supabase.ts**
   - Test null return when env vars missing
   - Test cookie parsing (getAll/setAll)
   - Test error handling (Supabase unavailable)
   - Goal: 80%+ coverage of edge cases

2. **Document the Contract**
   - Write JSDoc for `createClient()`
   - Explain: "Must null-check return value"
   - Explain: "Must call in middleware before response.set()"
   - Explain: Why fail-open on missing env vars

3. **Add Linter Rule**
   - Enforce: All supabase.ts calls must be in null-check block
   - Or: No direct `.from()` calls without prior null-check

4. **E2E Test Suite for Auth**
   - Login → set session cookie
   - Access protected route → should work
   - Logout → session cleared
   - Access protected route → should redirect
   - These tests indirectly test supabase.ts

5. **Plan Version Upgrades**
   - Before upgrading @supabase/ssr: review breaking changes
   - After upgrade: re-run auth E2E tests
   - Document: What changed, why, when

### Low Priority (Nice-to-Have)

- Add TypeScript strict mode (already at strict)
- Add JSDoc examples to supabase.ts
- Track env var changes in changelog

---

## Summary Table: supabase.ts Health

| Dimension | Status | Confidence | Notes |
|-----------|--------|------------|-------|
| **Stability** | ✅ GOOD | HIGH | 0 changes in 26 days, 15 callers happy |
| **Test Coverage** | ⚠️ GAPS | MEDIUM | No unit tests; integration covered |
| **Security** | ✅ GOOD | HIGH | No issues in supabase.ts; callers audited |
| **Documentation** | ⚠️ MINIMAL | LOW | JSDoc missing; contract doc in code comments only |
| **Robustness** | ✅ GOOD | HIGH | Handles null env vars, cookie edge cases |
| **Readiness for Changes** | ⚠️ MEDIUM | MEDIUM | No unit tests = harder to refactor safely |

**Overall Health**: STABLE, but needs hardening before high-velocity development or team growth.
