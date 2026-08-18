# Mapa Projektu: Smart Pantry Tracker

**Status**: Production-ready MVP  
**Stack**: Astro 6 (SSR) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare  
**Team**: Solo developer (Kinga Nowak)  
**Activity**: Active (26 days: May 21 – June 15, 2026)

---

## 1. Terytoria: Gdzie Projekt Jest Wrażliwy

### Hotspots (8+ zmian — ostrożnie przed refactorem)

| Moduł | Zmian | Risk | Uwaga |
|-------|-------|------|-------|
| `src/pages/shopping-list/index.astro` | 8 | 🔴 HIGH | Checkoff, unit conversion, manual items — intensywnie zmieniane |
| `src/pages/inventory/index.astro` | 7 | 🟡 MEDIUM | Sorting, expiry, CRUD — względnie stabilna |
| `src/middleware.ts` | 6 | 🔴 CRITICAL | Auth check, route protection — każdy request idzie tutaj |
| `src/lib/units.ts` | 3 | 🔴 HIGH | Business logic dla unit conversion — недавно testowana (Risk #1-#6) |

### Krytyczne Zależności (Co Się Łamie Jeśli...)

- **Zmiana `src/lib/supabase.ts`** → Łamią się WSZYSTKIE API routes + middleware (15 plików)
- **Zmiana `src/middleware.ts`** → Łamią się WSZYSTKIE routes (auth, route protection)
- **Zmiana `src/lib/units.ts`** → Łamią się: validation.ts + checkoff.ts + tests
- **Zmiana `src/lib/validation.ts`** → Łamie się: products PUT endpoint

### Szum Do Odfiltrowania

- `.claude/`, `context/` — dokumentacja, nie runtime (50+ zmian)
- `.playwright-cli/` — test artifacts
- `CLAUDE.md` — metadata (12 zmian, ale docs)

**Wnioski**:
- **Nie dotykai middleware ani supabase.ts bez pełnego E2E test suite**
- Shopping-list page i inventory page to ~15 zmian razem — najaktywniejsze obszary
- Unit conversion jest "young" (niedawno testowana) — wymaga ostrożności

---

## 2. Struktura: Architektura i Kontrakty

### Warstwy (Top-Down)

```
ENTRY POINTS (Cienkie)
  ├─ Astro pages (routing)
  └─ API routes (HTTP endpoints)
        ↓
MIDDLEWARE (Hub dla Auth)
  └─ src/middleware.ts (sets context.locals.user, guards PROTECTED_ROUTES)
        ↓
BUSINESS LOGIC (Głębokie)
  ├─ src/lib/units.ts (unit conversion — 40+ units)
  ├─ src/lib/validation.ts (input validation)
  └─ src/lib/date.ts, utils.ts (isolated utilities)
        ↓
INFRASTRUCTURE (Critical Hub — 15 callers)
  └─ src/lib/supabase.ts (Supabase client factory)
        ↓
UI COMPONENTS
  └─ React + Astro components
```

### Kontrakty Do Chronienia (Nie Zmieniaj Signatury)

| Kontrakt | Opis | Risk | Callers |
|----------|------|------|---------|
| `middleware: context.locals.user = AuthUser \| null` | Auth flow | 🔴 CRITICAL | ALL routes |
| `supabase.createClient(headers, cookies) → SupabaseClient \| null` | DB factory | 🔴 CRITICAL | 15 routes + middleware |
| `units.convertUnit(value, from, to) → number \| null` | Unit conversion | 🔴 HIGH | validation + checkoff |
| `validation.validateProductInput(input) → ValidationResult` | Input validation | 🟡 MEDIUM | products PUT |

### Cykli? Nie.

✅ Dependency graph jest czysty DAG — brak cykli, brak pętli.

---

## 3. Contributor Context: Co Wiedzieć

### Jedna Osoba, Cały Projekt

**Kinga Nowak** (solo developer):
- May 21: supabase.ts created (25 lines, **nigdy nie zmieniony**)
- May 28 – June 15: 26 dni, 40+ commits
- Sama pisze, sama audytuje (internal reviews)

**Patterns**:
1. **Design Once, Stick With It** — supabase.ts stable przez 26 dni, 15 callers
2. **Security-First** — Each feature triggers impl review (auth-completion: 5 security findings caught)
3. **Test Integration > Units** — units.ts, validation.ts mają test suites, ale supabase.ts nie
4. **Fast Audit Loops** — ship → review → fix same day

### Znane Problemy (Poprzednie Reviews)

| Phase | Issue | Fix | Status |
|-------|-------|-----|--------|
| Shopping List (Jun 9) | No qty validation (qty_purchased ≤ 0) | Added guard | ✅ FIXED (da29929) |
| Shopping List (Jun 9) | Case-sensitive name lookup ("Milk" vs "milk") | Use .ilike() | ✅ FIXED (da29929) |
| Auth Complete (Jun 5) | `/api/auth/update-password` not in PROTECTED_ROUTES | Added to middleware | ✅ FIXED (29a34f2) |
| Auth Complete (Jun 5) | No null guard on email in reset-password.ts | Added if (!email?.trim()) | ✅ FIXED (29a34f2) |
| Auth Complete (Jun 5) | Protocol-relative URL bypass in confirm.ts | Added !next.startsWith("//") | ✅ FIXED (29a34f2) |
| Testing (Jun 10) | No unit tests for supabase.ts | Accepted gap (thin wrapper) | ⚠️ DEBT |

**Wnioski**:
- Security issues caught early → fixed same day (good review discipline)
- supabase.ts design proven stable → don't change without testing
- Known gap: no unit tests for supabase.ts cookie handling (integration tests cover it)

---

## 4. Co Robić Przed Dużą Zmianą

### Checklist: Refactor/Major Change

Zanim zaczniesz zmieniać którykolwiek z 4 hotspots (shopping-list, inventory, middleware, units):

- [ ] **Read the reviews** 
  - `context/archive/*/reviews/impl-review.md` (znane issues)
  - `context/changes/*/reviews/impl-review.md` (current issues)
  
- [ ] **Run full test suite**
  - `npm run lint` (ESLint)
  - `npm run test` (Vitest — 30 tests)
  - `npx astro build` (type check)
  
- [ ] **E2E test the affected flow**
  - Checklist poniżej

- [ ] **If touching middleware or supabase.ts:**
  - Run ALL E2E tests (auth, protected routes, API calls)
  - Don't change signatury bez updating 15 callers

### E2E Test Checklist (By Feature)

**Auth Flow** (touches middleware + supabase.ts):
- [ ] Signin with valid creds
- [ ] Redirect to /inventory on success
- [ ] Unauthenticated user accessing /inventory → redirect /auth/signin
- [ ] Signout clears session

**Shopping List Checkoff** (touches units + validation + API + UI):
- [ ] Add item to shopping list
- [ ] Checkoff with quantity (same unit)
- [ ] Checkoff with unit conversion (e.g., g → kg)
- [ ] Checkoff with incompatible units → 422 error
- [ ] Manual item checkoff
- [ ] Delete item

**Product Edit** (touches validation + API + UI):
- [ ] Edit quantity
- [ ] Edit unit (recognized unit)
- [ ] Edit unit (legacy/unrecognized unit, keep current)
- [ ] Expiry date update
- [ ] Min threshold update

**Inventory Sorting/Filter**:
- [ ] Sort by expiry (oldest first)
- [ ] Highlight expired products
- [ ] Add new product
- [ ] Delete product

---

## 5. Obszary Ryzyka: Przed Dużą Zmianą Czytaj To

### Risk #1: Unit Conversion (Young Feature — 3 Weeks Old)

**Context**:
- Units added: June 9 (shopping-list-complete)
- Testing added: June 10 (bootstrap test runner)
- Integration tests added: June 15 (checkoff integration tests)

**Known Issues**:
- ✅ No qty validation (FIXED Jun 9)
- ✅ No unit conversion boundary tests (FIXED Jun 10)

**Edge Cases**:
- Count units (pcs, items, sztuki) pass through unchanged (don't convert)
- Unknown units (e.g., "xyz") → return null → API returns 422
- Case-insensitive: "kg" == "KG" == "Kg"
- Whitespace trimmed: " kg " == "kg"

**Before Touching**: Run `npm run test` (30 tests including unit conversion edge cases)

### Risk #2: Middleware (Guards Everything)

**Context**:
- Auth check happens on EVERY request
- PROTECTED_ROUTES controls who sees what
- context.locals.user flows to ALL pages + API routes

**Known Issues**:
- ✅ `/api/auth/update-password` missing from PROTECTED_ROUTES (FIXED Jun 5)
- ⚠️ If Supabase down, app treats users as unauthenticated (intentional fail-open)

**Before Touching**: 
- E2E test: protected routes redirect unauthenticated users
- E2E test: public routes work without auth
- E2E test: authenticated user can access protected routes

### Risk #3: supabase.ts (Critical Hub)

**Context**:
- 25 lines, created May 21, never changed
- 15 files depend on it (middleware + 14 API routes)
- Returns `null` if env vars missing → all callers must null-check

**Known Issues**:
- ✅ All 15 callers correctly null-check
- ⚠️ No unit tests (only integration via API routes)
- ⚠️ If signature changes, 15 callers break

**Before Touching**:
- Run full E2E test suite (all routes with auth + data)
- Verify CI passes (build, lint, test)
- Document: what changed, why

### Risk #4: Shopping List UI (Hottest Page)

**Context**:
- 8 commits in 7 days (May 30 – June 9)
- Checkoff dialog, unit conversion, manual items, delete, edit
- Calls 5 different API endpoints

**Known Issues**:
- ✅ Confirm button re-enabled too early (FIXED Jun 9)
- ⚠️ Case-sensitive product name lookup (FIXED Jun 9)

**Before Touching**:
- Run shopping-list E2E flow (add, checkoff, delete, convert units)
- Test invalid inputs (negative qty, unknown units)

---

## 6. Gotowe Do Zmiany vs. Jeszcze Nie

### ✅ Safe to Refactor (Low Coupling)

- `src/lib/date.ts` — only used by pages, no dependencies
- `src/lib/utils.ts` — CSS utilities, only used by components
- `src/components/**` — leaf nodes, mostly isolated
- Individual pages — can reshape locally without affecting others

### ⚠️ Be Careful (Medium Coupling)

- `src/pages/api/products/[id].ts` — used by inventory UI via fetch
- `src/pages/api/shopping-list-items/[id].ts` — used by shopping-list UI via fetch
- `src/lib/validation.ts` — used by products PUT endpoint
- Any auth endpoint — touches middleware + supabase

### 🔴 Don't Touch Without Full Testing (Critical)

- `src/middleware.ts` → test ALL routes
- `src/lib/supabase.ts` → test auth + all API routes
- `src/lib/units.ts` → test checkoff + validation + all unit pairs
- Auth flows — test signin, signup, reset, confirm, update-password

---

## 7. Key Metrics & Evidence

| Metrika | Wartość | Źródło |
|---------|---------|--------|
| Test Coverage | 30 tests (units + validation) | artifact-1 |
| Critical Hub Fan-In | 15 callers (supabase.ts) | artifact-2 |
| Hottest File | 8 commits (shopping-list/index.astro) | artifact-1 |
| Solo Dev History | 26 days, 40+ commits | artifact-3 |
| Security Findings (Total) | 5 (all fixed same day) | artifact-3 |
| Dependency Cycles | 0 (clean DAG) | artifact-2 |
| Stable Files | 1 (supabase.ts — never changed) | artifact-3 |

---

## 8. Decyzje Architektoniczne (Dlaczego Jest Tak)

### Dlaczego supabase.ts Returns Null?

**Requirement**: Supabase optional for local dev.  
**Decision**: Return null if env vars missing.  
**Trade-off**: Callers must null-check, but explicit is better than implicit.  
**Validation**: All 15 callers correctly null-check (good discipline).

### Dlaczego Middleware Zamiast Auth Guards na Każdej Stronie?

**Requirement**: Protect /dashboard, /inventory, /shopping-list.  
**Decision**: One place (middleware.ts) checks auth on ALL requests.  
**Trade-off**: Single point of failure, but single source of truth.  
**Validation**: PROTECTED_ROUTES array controls which routes require auth.

### Dlaczego API Routes Nie Mają Unit Tests?

**Requirement**: Test unit conversion correctness.  
**Decision**: Unit tests for pure functions (units.ts, validation.ts), integration tests for HTTP boundary (API routes + DB).  
**Trade-off**: API routes tested via E2E, not isolated.  
**Validation**: If supabase.ts breaks, E2E tests will catch it (cookies, auth state, etc.).

### Dlaczego Solo Dev + Internal Reviews?

**Requirement**: Move fast, ship quality.  
**Decision**: Rapid cycles (ship → review → fix same day), self-review via agent.  
**Trade-off**: No peer review, but automated checks (lint, build, test) catch obvious issues.  
**Validation**: 0 critical bugs in production. All impl reviews approved after triage.

---

## 9. Roadmap: Co Następne

### Immediate (Before Shipping)

- [ ] ✅ Test checklist above passes (all E2E flows)
- [ ] ✅ CI passes (lint, build, test)
- [ ] ✅ Review checklist complete

### Phase 2 (Feature-Complete MVP)

- [ ] E2E test coverage for all flows (Playwright framework just added)
- [ ] Integration tests for checkoff + unit-conversion (partially done)
- [ ] Documentation: API contracts, database schema

### Phase 3 (Production Hardening)

- [ ] Unit tests for supabase.ts (cookie handling, env var logic)
- [ ] Linter rule: enforce null-checks on supabase.ts calls
- [ ] Add `/api/products/[id]/checkoff` integration test to prevent regression

### Longer Term (If Team Grows)

- [ ] Refactor lib/ into domain/ (business logic) + infrastructure/ (plumbing)
- [ ] Dependency injection for supabase.ts (reduce coupling)
- [ ] Peer code review process (when developer count > 1)

---

## 10. Quick Reference: Emergency Playbook

### "I Need to Understand an Error"

1. Is it auth-related? → Check `src/middleware.ts`
2. Is it unit conversion? → Check `src/lib/units.ts`
3. Is it validation? → Check `src/lib/validation.ts`
4. Is it a Supabase error? → Check API route's `.eq("user_id", user.id)` + supabase.ts null-check
5. Is it a UI issue? → Check React component props + Astro page data

### "I Want to Add a New Protected Route"

1. Add route to PROTECTED_ROUTES in `src/middleware.ts`
2. Test: unauthenticated user visiting route → redirect to /auth/signin
3. Test: authenticated user visiting route → page loads

### "I Want to Add a New API Endpoint"

1. Create `src/pages/api/.../<method>.ts`
2. Import supabase.ts: `import { createClient } from "@/lib/supabase"`
3. Null-check: `if (!supabase) return new Response(..., { status: 503 })`
4. Auth-check: `if (!context.locals.user) return new Response("Unauthorized", { status: 401 })`
5. RLS check: add `.eq("user_id", user.id)` to all DB queries
6. Test: E2E flow + invalid inputs + auth edge cases

### "Something About Units Broke"

1. Run `npm run test` (30 tests cover unit conversion)
2. Check test output for which case failed
3. If test passes but E2E fails → issue is in API route or UI, not units.ts
4. Before changing units.ts → ask: what unit pair is failing? what's the conversion?

---

## Summary: Mapa jako Decyzja

**Jest to projekt single-developer, production-ready MVP.** 

**Strengths**:
- ✅ Clean architecture (thin entry points, pure business logic)
- ✅ No dependency cycles
- ✅ Stable core (supabase.ts never changed)
- ✅ Security audits built-in (every feature triggers impl review)

**Vulnerabilities**:
- 🔴 supabase.ts is single point of failure (15 callers, no unit tests)
- 🔴 middleware guards everything (if it breaks, all routes fail)
- 🟡 unit conversion is young feature (3 weeks old, needs E2E coverage)
- 🟡 solo developer means no peer review (but auto checks catch issues)

**Action**: Before major refactor, run checklist in Section 4. Before touching hotspots, read Risk sections. Before deploying, run E2E tests.

---

**Last Updated**: June 15, 2026  
**Next Review**: After next feature release or if team joins
