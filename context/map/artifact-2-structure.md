# Structure: Zależności, Entry Pointy, Cykle i Lokalne Centra

**Metodologia**: Manual import analysis (bez dependency-cruiser) — grep import statements, trace dependency graph

---

## 1. Entry Points: Gdzie Projekt Zaczyna Się

### A. Page Routes (Astro SSR)

```
src/pages/
├─ *.astro              — Strony publiczne (index, dashboard)
├─ inventory/
│  ├─ index.astro       — Inventory browse (protected)
│  ├─ new.astro         — Create product form
│  └─ [id]/edit.astro   — Edit product form
├─ shopping-list/
│  ├─ index.astro       — Shopping list + checkoff UI (protected)
│  └─ new.astro         — Manual item form
└─ auth/
   ├─ signin.astro      — Sign in page
   ├─ signup.astro      — Sign up page
   └─ *.astro           — Auth flows (confirm, reset, etc.)
```

**Charakterystyka**: Thin entry points — routing + data fetch + component composition.  
**Protected Routes** (middleware guards): `/dashboard`, `/inventory`, `/shopping-list`, `/auth/update-password`

### B. API Routes (HTTP Endpoints)

```
src/pages/api/
├─ auth/
│  ├─ signin.ts         — POST (email/password → auth)
│  ├─ signup.ts         — POST (email/password → register)
│  ├─ signout.ts        — POST (logout)
│  ├─ reset-password.ts — POST (send reset email)
│  ├─ update-password.ts — POST (set new password)
│  └─ confirm.ts        — GET (email confirmation callback)
│
├─ products/
│  ├─ index.ts          — GET (list products)
│  └─ [id]/
│     ├─ [id].ts        — GET (fetch), PUT (edit), DELETE (delete)
│     ├─ checkoff.ts    — POST (add to pantry + unit conversion)
│     ├─ checkoff.test.ts — Unit tests for checkoff
│     ├─ listing.ts     — GET (check if on shopping list)
│     └─ unlist.ts      — POST (remove from list)
│
└─ shopping-list-items/
   ├─ index.ts          — GET (list items), POST (create manual item)
   ├─ [id].ts           — PATCH (edit manual item), DELETE
   ├─ [id]/checkoff.ts  — POST (check off item)
   └─ [id]/checkoff.test.ts — Integration tests
```

**Charakterystyka**: Thin API handlers — auth check, supabase query, response.  
**Pattern**: Form-submission routes (auth) → redirect; Fetch routes (products/items) → JSON/status.

---

## 2. Dependency Graph: Kontrakty Między Warstwami

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINT LAYER                        │
│  (Astro pages + API routes — thin routing/auth dispatch)    │
├─────────────────────────────────────────────────────────────┤
│                   MIDDLEWARE LAYER                          │
│  src/middleware.ts (auth check, user context injection)     │
├─────────────────────────────────────────────────────────────┤
│              BUSINESS LOGIC LAYER (CONTRACTS)               │
│  • src/lib/units.ts (unit conversion)                       │
│  • src/lib/validation.ts (input validation)                 │
│  • src/lib/date.ts (date utilities — isolated)              │
│  • src/lib/utils.ts (CSS utilities — isolated)              │
├─────────────────────────────────────────────────────────────┤
│             INFRASTRUCTURE LAYER (CRITICAL HUB)             │
│  • src/lib/supabase.ts (Supabase client factory)            │
│  • External: @supabase/ssr, astro:env/server                │
├─────────────────────────────────────────────────────────────┤
│                      UI LAYER                               │
│  • src/components/**/*.tsx (React components)               │
│  • src/components/**/*.astro (Astro components)             │
└─────────────────────────────────────────────────────────────┘
```

### Contract 1: Entry Point → Middleware (ALL Requests)

```
Request Flow:
  src/pages/*.astro or src/pages/api/*.ts
          ↓ (Astro routing)
  src/middleware.ts
  ├─ Imports: @/lib/supabase
  ├─ Sets: context.locals.user (null or AuthUser)
  └─ Guards: Protected routes redirect to /auth/signin
```

**Contract Terms:**
- Input: `context.request.headers`, `context.cookies`
- Output: `context.locals.user` (AuthUser | null)
- **Side Effect**: Unprotected route + no user → redirect `/auth/signin`

**Risk**: Change middleware → impacts ALL routes (see Section 4A)

### Contract 2: Middleware & API Routes → Infrastructure

```
Direct Dependencies:
  src/middleware.ts ──→ src/lib/supabase.ts
  src/pages/api/**/*.ts ──→ src/lib/supabase.ts
  
  (11 API route files import supabase.ts)
```

**Contract Terms:**
```typescript
createClient(requestHeaders: Headers, cookies: AstroCookies) 
  → SupabaseClient | null

// Callers must null-check:
const supabase = createClient(headers, cookies);
if (!supabase) return new Response("Supabase is not configured", { status: 503 });
```

**Critical Invariant**: If `SUPABASE_URL` or `SUPABASE_KEY` env vars missing → returns `null`.  
**Risk**: Change supabase.ts → breaks all 11+ callers (see Section 4A)

### Contract 3: API Routes → Business Logic

#### 3a: Products Checkoff → Unit Conversion

```
src/pages/api/products/[id]/checkoff.ts
  ├─ Imports: @/lib/units
  └─ Calls: convertUnit(value, fromUnit, toUnit) → number | null
```

**Contract Terms:**
```typescript
convertUnit(value: number, fromUnit: string, toUnit: string): number | null
  // Returns: converted value, or null if incompatible units
  // Side effect: None (pure function)
```

**Examples:**
- `convertUnit(100, "g", "kg")` → `0.1`
- `convertUnit(100, "ml", "l")` → `0.1`
- `convertUnit(100, "g", "ml")` → `null` (incompatible categories)
- `convertUnit(100, "pcs", "pcs")` → `100` (count units pass through)

**Usage in checkoff.ts (line 46):**
```typescript
const converted = convertUnit(qtyPurchased, qtyUnit, productUnit);
if (converted === null) {
  return new Response(`Cannot convert ${qtyUnit} to ${productUnit}`, { status: 422 });
}
```

**Risk**: Change units.ts → breaks checkoff validation (see Section 4B)

#### 3b: Product Edit → Validation

```
src/pages/api/products/[id].ts (PUT handler)
  ├─ Imports: @/lib/validation
  └─ Calls: validateProductInput(input) → ValidationResult
```

**Contract Terms:**
```typescript
validateProductInput(input: {
  quantity: number;
  unit: string;
  minThreshold: number;
  currentUnit: string;  // ← for backwards-compat with legacy units
}) → { ok: true } | { ok: false; status: number; message: string }
```

**Examples:**
- `{ ok: true }` → Proceed with update
- `{ ok: false; status: 400; message: "quantity must be > 0" }` → Invalid input
- `{ ok: false; status: 422; message: "Unrecognized unit: xyz" }` → Unit error

**Validation Rules** (from validation.ts):
1. `quantity > 0` (same as checkoff guard)
2. `minThreshold > 0`
3. If unit changed → must be recognized unit OR unchanged from currentUnit
   - **Rationale**: Legacy products with unrecognized units won't break on edit

**Risk**: Change validation.ts → breaks product edit flow (see Section 4C)

#### 3c: Validation → Units (Internal Dependency)

```
src/lib/validation.ts
  └─ Imports: @/lib/units
     └─ Calls: isKnownUnit(unit: string) → boolean
```

**Contract Terms:**
```typescript
isKnownUnit(unit: string): boolean
  // Returns: true if unit is in UNIT_MAP
  // Side effect: None (pure function)
```

**Validation.ts Usage** (line 27):
```typescript
if (unitChanged && !isKnownUnit(input.unit)) {
  return { ok: false, status: 422, message: `Unrecognized unit: ${input.unit}` };
}
```

**Risk**: Change units.ts (add/remove unit) → validation behavior changes (see Section 4D)

### Contract 4: Pages → API Routes (Client-Side Fetch)

```
src/pages/shopping-list/index.astro
  ├─ POST to src/pages/api/products/[id]/checkoff.ts
  ├─ POST to src/pages/api/shopping-list-items/[id]/checkoff.ts
  ├─ PATCH to src/pages/api/shopping-list-items/[id].ts
  ├─ DELETE to src/pages/api/shopping-list-items/[id].ts
  └─ POST to src/pages/api/products/[id]/unlist.ts

src/pages/inventory/index.astro
  ├─ PUT to src/pages/api/products/[id].ts
  ├─ DELETE to src/pages/api/products/[id].ts
  ├─ GET to src/pages/api/products/[id]/listing.ts
  └─ POST to src/pages/api/products/[id]/checkoff.ts
```

**Contract Terms** (HTTP request/response):
- Client sends FormData (multipart form)
- Server returns:
  - Success: `200 OK` or `204 No Content`
  - Error: `400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`, `503 Service Unavailable`

**Risk**: Change API response format → breaks UI (see Section 4E)

### Contract 5: Pages → Components (Template Data)

```
src/pages/shopping-list/index.astro
  └─ Imports: React components
     ├─ src/components/Topbar.astro
     └─ (inline React components via JSX)

src/pages/inventory/index.astro
  └─ Imports: React components (inline JSX)
```

**Contract**: Astro pages pass data via JSX props to React components.  
**Risk**: Changing component props → breaks page rendering

---

## 3. Circular Dependencies: Cycle Detection

### Explicit Import Chain Analysis

```
✓ middleware.ts → supabase.ts  [No reverse import]
✓ validation.ts → units.ts     [No reverse import]
✓ checkoff.ts → units.ts       [No reverse import]
✓ products/[id].ts → validation.ts  [No reverse import]
```

**Conclusion**: **NO CIRCULAR DEPENDENCIES detected.**

**Why it's clean:**
1. Middleware is lowest-level access (only imports supabase)
2. Business logic layers don't import entry points
3. Pages don't import API routes (HTTP only)
4. Components are leaves (only imported, don't import pages)

---

## 4. Fan-In / Fan-Out: Who Depends on What & What Can Break

### 4A. CRITICAL HUB: `src/lib/supabase.ts`

**Fan-In** (who imports it):
```
1. src/middleware.ts
2. src/pages/api/auth/signin.ts
3. src/pages/api/auth/signup.ts
4. src/pages/api/auth/signout.ts
5. src/pages/api/auth/reset-password.ts
6. src/pages/api/auth/update-password.ts
7. src/pages/api/auth/confirm.ts
8. src/pages/api/products/index.ts
9. src/pages/api/products/[id].ts
10. src/pages/api/products/[id]/checkoff.ts
11. src/pages/api/products/[id]/listing.ts
12. src/pages/api/products/[id]/unlist.ts
13. src/pages/api/shopping-list-items/index.ts
14. src/pages/api/shopping-list-items/[id].ts
15. src/pages/api/shopping-list-items/[id]/checkoff.ts

TOTAL: 15 files depend on supabase.ts
```

**What It Does:**
- Wraps `@supabase/ssr` client initialization
- Handles cookie management (get/set)
- Nullable return (returns `null` if env vars missing)

**Change Impact** (if you modify supabase.ts):
| Change | Impact | Risk |
|--------|--------|------|
| Signature change (params/return) | All 15 callers break | 🔴 CRITICAL |
| Env var behavior change | Auth fails silently or loudly | 🔴 CRITICAL |
| Cookie handling change | Auth state lost or corrupted | 🔴 CRITICAL |
| Exception handling | Unhandled exceptions propagate | 🔴 CRITICAL |

**Mitigation:**
- Test ALL 15 callers (especially middleware + auth routes)
- E2E test auth flow (signin → protected route)

---

### 4B. HIGH-RISK HUB: `src/lib/units.ts`

**Fan-In** (who imports it):
```
1. src/lib/validation.ts
2. src/pages/api/products/[id]/checkoff.ts
3. src/lib/units.test.ts (test)
```

**What It Does:**
- Unit conversion logic (mass, volume, count)
- Defines UNIT_MAP (40+ units)
- Pure functions: convertUnit, isKnownUnit, unitsCompatible, roundTo2

**Change Impact** (if you modify units.ts):

| Change | Impact | Risk |
|--------|--------|------|
| Add/remove unit from UNIT_MAP | validation.ts behavior changes; checkoff accepts/rejects new units | 🟡 MEDIUM |
| Change convertUnit logic | checkoff may misbehave (wrong conversions); tests fail | 🔴 HIGH |
| Change unit categories | Compatibility checks break | 🔴 HIGH |
| Change function signature | validation.ts + checkoff.ts break | 🔴 HIGH |

**Who Breaks If You Change This:**

1. **Downstream**: validation.ts
   - Calls `isKnownUnit()` to validate unit on product edit
   - Change → product edit validation behavior changes

2. **Downstream**: checkoff.ts (API route)
   - Calls `convertUnit()` to handle unit differences
   - Change → checkoff may fail with incompatible units

3. **Tests**: units.test.ts
   - Needs update if function behavior changes

**Mitigation:**
- Unit tests for all conversion scenarios (mass, volume, count)
- Test checkoff flow after any change
- Test product edit validation

---

### 4C. MEDIUM-RISK HUB: `src/lib/validation.ts`

**Fan-In** (who imports it):
```
1. src/pages/api/products/[id].ts (PUT handler)
2. src/lib/validation.test.ts (test)
```

**What It Does:**
- Validates product input (quantity, unit, minThreshold)
- Calls `isKnownUnit()` from units.ts
- Returns structured ValidationResult

**Change Impact** (if you modify validation.ts):

| Change | Impact | Risk |
|--------|--------|------|
| Change validation rules (e.g., quantity > 0 → quantity >= 0) | Product edit accepts/rejects different inputs | 🟡 MEDIUM |
| Change error messages | UI error display changes | 🟢 LOW |
| Change function signature | products/[id].ts breaks | 🔴 HIGH |
| Remove unit compatibility check | Unrecognized units slip through | 🟡 MEDIUM |

**Who Breaks If You Change This:**

1. **Upstream**: products/[id].ts (PUT handler)
   - Calls `validateProductInput()` before update
   - Change → validation behavior changes

2. **Downstream (transitive)**: units.ts
   - validation.ts depends on isKnownUnit()
   - Change to validation.ts → OK; change to units.ts → ripples here

**Mitigation:**
- Unit tests for validation rules
- Test product edit with invalid inputs (quantity ≤ 0, unknown units, etc.)

---

### 4D. THIN ENTRY POINT: `src/middleware.ts`

**Fan-In** (who imports it):
```
Implicit: Astro framework (all requests go through it)
```

**What It Does:**
- Auth check: calls `supabase.auth.getUser()`
- Sets `context.locals.user`
- Route protection: redirects unauth to `/auth/signin`

**Change Impact** (if you modify middleware.ts):

| Change | Impact | Risk |
|--------|--------|------|
| Add new protected route to PROTECTED_ROUTES | That route now requires auth | 🟢 LOW (intentional) |
| Remove protected route | That route becomes public | 🟠 MEDIUM (security!) |
| Change auth check logic | All routes affected | 🔴 CRITICAL |
| Change error handling | Redirect or 401 behavior changes | 🔴 CRITICAL |
| Change cookie handling | Auth state flows differently | 🔴 CRITICAL |

**Who Breaks If You Change This:**

1. **Downstream**: ALL routes
   - Every request goes through middleware
   - Change → ALL routes potentially affected

2. **Downstream (transitive)**: supabase.ts
   - Middleware calls createClient()
   - Change → supabase client initialization changes

**Mitigation:**
- E2E test protected routes (should redirect to signin if not auth)
- E2E test public routes (should work without auth)
- E2E test auth flow (signin should set context.locals.user)

---

### 4E. THIN ENTRY POINT: `src/pages/api/products/[id]/checkoff.ts`

**Fan-In** (who imports it):
```
Implicit: Called via HTTP POST from:
  • src/pages/shopping-list/index.astro (checkoff item)
  • src/pages/inventory/index.astro (add to pantry)
```

**What It Does:**
- Check off a product (add to pantry or shopping list)
- Handle unit conversion (if qtyUnit != productUnit)
- Update product quantity in DB
- Update min_threshold if provided

**Change Impact** (if you modify checkoff.ts):

| Change | Impact | Risk |
|--------|--------|------|
| Change error status codes (400 → 422) | UI error handling changes | 🟡 MEDIUM |
| Change request param names (qty_purchased → quantity_purchased) | UI form breaks | 🔴 HIGH |
| Change response format | UI parsing breaks | 🔴 HIGH |
| Change unit conversion logic | Wrong quantities added to pantry | 🔴 CRITICAL |
| Change DB update query | Product state corrupted | 🔴 CRITICAL |

**Who Breaks If You Change This:**

1. **Upstream**: shopping-list/index.astro UI
   - POST form data: qty_purchased, qty_unit, expiry_date, add_to_list, min_threshold
   - Expects: 204 No Content or error status

2. **Upstream**: inventory/index.astro UI
   - POST form data: same as above
   - Expects: same response

**Mitigation:**
- E2E test checkoff flow (add to pantry with unit conversion)
- E2E test checkoff with incompatible units (should 422)
- Test with different unit pairs (g↔kg, ml↔l, pcs↔pcs)

---

### 4F. LEAF NODES (Isolated, Low Risk)

```
✓ src/lib/date.ts
  • Only imported by pages (for display formatting)
  • No downstream consumers
  • Change risk: LOW

✓ src/lib/utils.ts (CSS utilities)
  • Only imported by components
  • Pure functions (clsx + tailwind-merge)
  • Change risk: LOW

✓ src/lib/config-status.ts
  • Only imported by dashboard
  • For config status checking
  • Change risk: LOW

✓ All components (src/components/**)
  • Leaf nodes (imported by pages, not importing others)
  • Change risk: LOW (local to page)
```

---

## 5. Dependency Layers: What Depends on What

### Import Tree (Simplified)

```
Pages & API Routes (Entry Points)
│
├─→ middleware.ts ──────┐
│   └─→ supabase.ts ◄───┤
│                       │
├─→ API Routes          │
│   ├─ auth/*.ts ───────┤
│   │  └─→ supabase.ts  │
│   │                   │
│   ├─ products/[id]/checkoff.ts
│   │  ├─→ units.ts ────┐
│   │  └─→ supabase.ts  │ (CRITICAL HUB)
│   │                   │
│   ├─ products/[id].ts │
│   │  ├─→ validation.ts
│   │  │   └─→ units.ts │
│   │  └─→ supabase.ts  │
│   │                   │
│   ├─ shopping-list-items/[id].ts
│   │  └─→ supabase.ts  │
│   │                   │
│   └─ other routes ────┘
│
├─→ Components
│   ├─ React components (*.tsx)
│   ├─ Astro components (*.astro)
│   └─ (mostly isolated, some use date.ts, utils.ts)
│
└─→ Utilities (Isolated)
    ├─ date.ts
    ├─ utils.ts (CSS)
    └─ config-status.ts

Legend:
  ◄─ = Multiple imports point here (HUB)
  ──→ = Direct import
  ┌─┐ = Scope grouping
```

### Dependency Levels

**Level 0** (Leaves — no imports except external):
- Components
- date.ts, utils.ts, config-status.ts
- Test files

**Level 1** (Imports Level 0):
- units.ts (only imports external)
- validation.ts (imports units.ts)

**Level 2** (Imports Level 1 + external):
- API routes (import supabase + units/validation)
- middleware.ts (imports supabase)

**Level 3** (Entry Points — calls Level 2):
- Astro pages
- API routes (Astro framework routing)

---

## 6. Kontrakty: Interfaces Between Layers

### Request/Response Contracts

#### Auth Flow Contract

```
Request:  POST /api/auth/signin
  FormData: email, password

Response:
  • Success (302): Redirect to /inventory + cookie set (auth_token)
  • Error (302): Redirect to /auth/signin?error=<encoded-message>

Middleware Contract:
  • Input: request.headers (Cookie), cookies object
  • Side Effect: Sets context.locals.user = AuthUser | null
  • Output: If protected route + no user → redirect /auth/signin
```

#### Product Checkoff Contract

```
Request:  POST /api/products/[id]/checkoff
  FormData: qty_purchased, qty_unit, expiry_date?, add_to_list?, min_threshold?

Validation:
  1. Auth check: context.locals.user must exist (401 if not)
  2. Qty check: qtyPurchased > 0 (400 if not)
  3. Unit check: qtyUnit must be recognized or empty (422 if incompatible)
  4. Unit conversion: convertUnit(qtyPurchased, qtyUnit, productUnit) must succeed (422 if null)

Response:
  • Success (204): No Content
  • Error (400): qty_purchased ≤ 0 or missing
  • Error (401): Not authenticated
  • Error (404): Product not found
  • Error (422): Incompatible units or unknown unit
  • Error (503): Supabase not configured
```

#### Product Edit Contract

```
Request:  PUT /api/products/[id]
  FormData: name, quantity, unit, expiry_date?, min_threshold?, add_to_list?

Validation:
  1. Auth check (302 redirect to /auth/signin if not)
  2. Input validation via validateProductInput():
     - quantity > 0 (400)
     - min_threshold > 0 (400)
     - unit recognized OR unit unchanged from current (422)

Response:
  • Success (200): Updated product
  • Error (302): Redirect to /auth/signin
  • Error (400): Invalid input
  • Error (404): Product not found
  • Error (422): Invalid unit
  • Error (500): DB error
  • Error (503): Supabase not configured
```

---

## 7. Critical Observations: Thinness & Coupling

### Observation 1: Very Thin Design

**Entry Points** (API routes + pages) are **deliberately thin**:
- No business logic
- Just: auth → validation → DB query → response
- Delegates to lib/*.ts for logic

**Example** (checkoff.ts):
```typescript
// Line 5-9: Auth gate (3 lines)
// Line 11-14: Supabase check (3 lines)
// Line 18-21: Qty validation (4 lines)
// Line 27-40: DB select (13 lines)
// Line 44-50: Unit conversion call (7 lines)
// Total: ~30 lines, mostly glue code
```

**Benefit**: Easy to change API without breaking logic.  
**Risk**: But if you change units.ts or validation.ts, ripples across multiple API routes.

### Observation 2: Supabase Is the Critical Hub

**All roads lead to supabase.ts:**
- middleware.ts → supabase (auth)
- 15 API routes → supabase (data)

**Why?**: It's the **only place** that knows how to initialize Supabase client with:
- Env var checking
- Cookie management
- Null handling

**Risk**: supabase.ts is a single point of failure. If it breaks, the entire app breaks.

### Observation 3: Business Logic Is Cleanly Separated

**units.ts + validation.ts are core logic**, not intertwined with HTTP/Astro:
- Pure functions (no side effects)
- Testable (units.test.ts, validation.test.ts)
- Reusable (could be used in CLI, worker, etc.)

**Risk**: But they're in `src/lib/`, mixed with infrastructure (supabase.ts). Might benefit from separation (domain/ vs infrastructure/ folders).

### Observation 4: No Auth in API Routes?

**Wait**: API routes check `context.locals.user` set by middleware, not calling auth directly.

```typescript
// Pattern in all fetch API routes:
const user = context.locals.user;
if (!user) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Benefit**: Middleware sets user once per request.  
**Risk**: If middleware changes, all routes affected. But also: middleware is the **single source of truth** for auth.

---

## 8. What Breaks If You Change What

### Quick Reference Table

| File | Fan-In | Change → Breaks | Risk | Mitigation |
|------|--------|-----------------|------|------------|
| `supabase.ts` | 15 files | All API routes, middleware | 🔴 CRITICAL | Test auth flow E2E |
| `units.ts` | 2 (validation, checkoff) | checkoff, validation | 🔴 HIGH | Unit tests + E2E checkoff |
| `validation.ts` | 1 (products/[id].ts) | Product edit | 🟡 MEDIUM | Unit tests + E2E edit |
| `middleware.ts` | All routes (implicit) | Route protection, auth flow | 🔴 CRITICAL | E2E protected routes |
| `checkoff.ts` | Pages (implicit) | Shopping list UI, inventory UI | 🟡 MEDIUM | E2E checkoff flow |
| `products/[id].ts` | Pages (implicit) | Inventory edit UI | 🟡 MEDIUM | E2E product edit |
| `date.ts` | Pages only | Display formatting | 🟢 LOW | Page visual regression |
| `utils.ts` | Components only | Component styling | 🟢 LOW | Component visual regression |
| `components/*` | Pages only | Page layout/UX | 🟢 LOW | Page visual regression |

---

## 9. Summary: Dependency Structure

### Strengths

✅ **Clean separation**: Entry points delegate to business logic  
✅ **No cycles**: Dependency graph is DAG (directed acyclic graph)  
✅ **Isolated utilities**: date.ts, utils.ts are independent  
✅ **Testable logic**: units.ts, validation.ts are pure functions  
✅ **Single source of truth**: middleware for auth, supabase.ts for DB client  

### Weaknesses / Risks

⚠️ **Critical hub (supabase.ts)**: 15 callers — change → cascade  
⚠️ **Business logic embedded in API routes**: checkoff.ts does unit conversion; if moved → search-and-replace pain  
⚠️ **No dependency injection**: All routes import supabase directly (tight coupling to factory)  
⚠️ **Auth mixed with data**: middleware handles both auth + context injection (single responsibility violated)  
⚠️ **Library structure**: lib/ mixes infrastructure (supabase) + domain (units, validation) — no clear separation  

### Contracts to Protect

| Contract | Type | Stability |
|----------|------|-----------|
| `supabase.createClient(headers, cookies) → SupabaseClient \| null` | Factory | CRITICAL — changing signature breaks 15 callers |
| `units.convertUnit(value, from, to) → number \| null` | Pure | HIGH — used in validation + checkoff |
| `validation.validateProductInput(input) → ValidationResult` | Pure | MEDIUM — used in product edit |
| `middleware: context.locals.user = AuthUser \| null` | Contract | CRITICAL — every route depends on this |
| `checkoff API: POST /products/[id]/checkoff (FormData) → 204 \| error` | HTTP | MEDIUM — UI depends on this endpoint |

### Layers to Treat with Care Before Refactoring

1. **Infrastructure (src/lib/supabase.ts)** — 15 callers
2. **Business Logic (src/lib/units.ts, validation.ts)** — used in multiple API routes
3. **Middleware** — touches ALL requests
4. **API endpoints** — called by pages via fetch

### Safe Areas to Refactor

1. **Components** — leaf nodes, low coupling
2. **Utilities** (date.ts, utils.ts) — only imported by pages
3. **Individual pages** — can reshape props/data flow locally
4. **CSS/styling** — isolated to components
