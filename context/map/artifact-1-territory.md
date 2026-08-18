# Territory: Historia Zmian i Aktywne Obszary

**Okres analizy**: Czerwiec 2026 (ostatnie 2+ miesiące)  
**Commit range**: 11bdb4c (Added tests) ← 3c23875 (Skill bootstrapper)  
**Contributor**: Kinga Nowak (solo developer)

---

## 1. Struktura Katalogów: Git Activity Heatmap

### TOP Aktywne Katalogi (w `src/`)

| Katalog | Zmiany | Charakter | Status |
|---------|--------|----------|--------|
| `src/pages/shopping-list/` | 10 | UI + endpoint | 🔥 Very Hot |
| `src/pages/inventory/` | 10 | UI + endpoint | 🔥 Very Hot |
| `src/pages/api/` | 15+ | Business logic | 🔥 Very Hot |
| `src/lib/` | 6 | Core utils | 🟠 Warm |
| `src/middleware.ts` | 6 | Auth/routing | 🔴 Critical |
| `src/components/` | 5 | UI elements | 🟡 Moderate |
| `src/pages/auth/` | 5 | Auth flows | 🟡 Moderate |

### Infrastructure / Schema (Wrażliwe)

| Obszar | Zmiany | Event | Status |
|--------|--------|-------|--------|
| `supabase/migrations/` | 4 major | DB schema evolution | 🔴 Critical |
| `package.json` | 4 | Dependencies (Vitest, Playwright) | 🟡 Moderate |
| `.github/workflows/` | 2 | CI pipeline | 🟡 Moderate |
| `astro.config.mjs` | 2 | Runtime config | 🟡 Moderate |

### Metadata / Documentation (Szum)

| Katalog | Zmiany | Notatka |
|---------|--------|---------|
| `.claude/` | 50+ | CLI manifests, skills — nie runtime |
| `context/` | 50+ | Planning docs, archives — nie runtime |
| `.playwright-cli/` | 6 | Test run logs — wygenerowane |

---

## 2. Co-Changing Files: Moduły Sprzęgnięte

### Pattern A: UI + API ↔ Logic

**Shopping List Feature** (najaktywniejsza):
```
src/pages/shopping-list/index.astro  (8 zmian)
  ↔ src/pages/api/shopping-list-items/[id].ts  (3 zmian)
  ↔ src/pages/api/shopping-list-items/[id]/checkoff.ts  (2 zmian)
  ↔ src/pages/api/products/[id]/checkoff.ts  (3 zmian)
```
- Zmieniają się razem w 6+ commitach
- Klasyczny req-response cycle

**Inventory Feature**:
```
src/pages/inventory/index.astro  (7 zmian)
  ↔ src/pages/inventory/new.astro  (3 zmian)
  ↔ src/pages/inventory/[id]/edit.astro  (3 zmian)
```
- Strony inventory razem w CRUD operacjach

### Pattern B: Unit Conversion & Validation

**Tightly Coupled Core Logic**:
```
src/lib/units.ts  (3 zmian)
  ↔ src/lib/units.test.ts  (2 zmian)
  ↔ src/lib/validation.ts  (test+fix: commit c654dc1)
  ↔ src/pages/api/products/[id].ts  (1 zmiana)
```
- **Wrażliwe**: zmiana w `units.ts` → trzeba update'ować testy + validation
- **Risk**: brakuje test coverage dla `validation.ts`

### Pattern C: Auth/Middleware — Centralna Kontrola

```
src/middleware.ts  (6 zmian)
  ↔ src/pages/api/auth/signin.ts  (2 zmian)
  ↔ src/pages/api/auth/reset-password.ts  (2 zmian)
  ↔ src/pages/auth/signin.astro  (2 zmian)
```
- **Wrażliwe**: middleware dotyka ALL requests
- Zmianę w middleware → kaskada w auth flows

### Pattern D: Metadata Propagation (Szum)

```
CLAUDE.md  (12 zmian)
.claude/.10x-cli-manifest.json  (11 zmian)
```
- Aktualizacje przy każdym feature
- Nie dotykają runtime, ale pokazują zmienność w tooling

---

## 3. Aktywne Obszary Przecinające Się z Krytycznymi Ścieżkami

### A. Runtime (src/pages/ + src/pages/api/)

**Trzy główne feature tracks**:

1. **Shopping List (VERY HOT)**
   - 8 commits do UI page
   - 3 commits do checkoff API
   - Commits: a962154 → d5fe91a → 2001f6c (latest)
   - Ostatnia zmiana: `2001f6c` (checkoff-unit-conversion-integration, 2 dni temu)
   - **Risk**: Niepewne unit conversion + checkoff interaction

2. **Inventory Management (VERY HOT)**
   - 7 commits do UI page
   - 3 commits do edit/new flows
   - Commits: fd7584e → 4685b52 → c3c3945
   - Ostatnia zmiana: `c3c3945` (Prettier fix, ~1 tydzień temu)
   - **Status**: Stabilna, czeka na new features

3. **Unit Conversion + Validation (NEWLY ACTIVE)**
   - 6 commits w ostatnim tygodniu (risk mitigation)
   - Commity: b3968fa → c654dc1 → 3eeb786 → d441383
   - Ostatni: `2001f6c` (integration tests)
   - **Risk Profile**: HIGH — niedawnie zmienione, wymaga uwagi

### B. Auth/Middleware (Controlling Gate)

```
src/middleware.ts  — 6 major zmian
  - Route protection (PROTECTED_ROUTES array)
  - User context injection (Astro.locals.user)
  - Auth state flow
```
- Dot ostatnia zmiana: `4b098a1` (fix prettiera, ~2 tygodnie)
- **Risk**: Zmiana middleware → ALL pages mogą się złamać
- **Observation**: Stabilne, ale jedno z najostrożniej ruszanych miejsc

### C. Data Layer (supabase/)

**Schema Evolution**:
```
supabase/migrations/:
  - 20260528000000_products_schema.sql
  - 20260602000000_products_add_to_list_index.sql
  - 20260605000001_shopping_list_items.sql
supabase/seed.sql  (3 zmian)
```
- **Pattern**: Schema + Seed razem
- **Last change**: `fcfa9be` (shopping-list-core feature, ~3 tygodnie)
- **Risk**: RLS policies + User isolation (muszą być spójne z middleware)

### D. Build / CI (Infrastructure)

```
.github/workflows/ci.yml  — 3 zmian
playwright.config.ts  — 2 zmian (dodano E2E)
vitest.config.ts  — 2 zmian (dodano unit tests)
astro.config.mjs  — 2 zmian
```
- **Pattern**: Testing infrastructure jest stabilna, nie zmienia się często
- **Last change**: `11bdb4c` (E2E tests bootstrap)
- **Note**: Playwright workflow dodany ostatnio → E2E tests są nowe

### E. Integracje (API / External)

```
src/lib/supabase.ts  — 1 zmiana (historycznie)
src/pages/api/auth/  — 5 zmian (auth flow)
```
- **Observation**: Supabase client jest stable
- **Risk**: Auth zmieniał się 5x — potential dla regressions

---

## 4. Hotspots: Obszary Wysokiej Zmienności

| Hotspot | Zmian | Powód | Risk |
|---------|-------|-------|------|
| `src/pages/shopping-list/index.astro` | 8 | Feature development (manual checkoff, unit conversion) | 🔴 HIGH — many refactors |
| `src/pages/inventory/index.astro` | 7 | Feature development (sort, expiry highlight) | 🟡 MEDIUM — mostly stable now |
| `src/middleware.ts` | 6 | Auth/routing flows | 🔴 CRITICAL — guards all requests |
| `src/lib/units.ts` | 3 | Business logic (unit conversion) | 🔴 HIGH — newly tested |
| `src/pages/api/shopping-list-items/[id].ts` | 3 | Item CRUD + checkoff | 🟡 MEDIUM — stabilizing |
| `src/pages/api/products/[id]/checkoff.ts` | 3 | Pantry checkoff + unit conversion | 🟡 MEDIUM — stabilizing |
| `CLAUDE.md` | 12 | Docs + config — | 🟢 LOW (metadata) |
| `package-lock.json` | 4 | Dependency updates (Vitest, Playwright) | 🟢 LOW (only major updates) |

---

## 5. Temporal Patterns: Trendy Zmian

### Phase 1: Foundation (Kwiecień-Maj)
- Auth completion (middleware, auth flows)
- Database schema + RLS
- Inventory CRUD basics

### Phase 2: Features (Maj-Czerwiec, Early)
- Shopping list core (manual items)
- Inventory expiry + sorting
- Shopping list UI polish

### Phase 3: Risk Mitigation (Czerwiec, Recent — ACTIVE NOW)
- Unit conversion bootstrap (Risk #1-#6)
- Validation gap closure
- Testing harness (Vitest + Playwright)
- **Last 7 days**: 5 commits focusing on unit-conversion correctness + integration tests

### Phase 4: Expected (Next)
- E2E test coverage (playwright framework just added)
- Database/ACL refactor? (domain analysis suggests needed)

---

## 6. Szum do Odfiltrowania

### A. Metadata (Nie Runtime)

```
.claude/
  - 50+ commits z CLI manifests, skill definitions
  - Nie dotykają src/ ani supabase/
  - **Znaczenie**: 0 dla runtime analysis

context/
  - 50+ commits z planning docs, reviews, archives
  - Nie dotykają src/ ani supabase/
  - **Znaczenie**: 0 dla runtime — to docs

CLAUDE.md
  - 12 zmian (więcej niż wiele source files!)
  - Ale to dokumentacja, nie kod
  - **Znaczenie**: Pokazuje tooling overhead, nie runtime changes
```

### B. Generated / Transient

```
.playwright-cli/
  - 6 zmian (console logs, page recordings z test runs)
  - Generated, nie committed na main
  - **Znaczenie**: 0

e2e/*.yml files
  - Page recordings z Playwright
  - **Znaczenie**: 0
```

### C. Package Management (Low-Frequency)

```
package-lock.json  — 4 zmian
  - Zmienia się tylko przy `npm install` dla nowych deps
  - Ostatnia zmiana: dodanie Vitest, Playwright
  - **Frequency**: ~1 per major infra addition
  - **Znaczenie**: LOW — tracking major dependency decisions, not churn
```

### D. Nie-Szum (Warto Śledzić)

```
.gitignore  — 3 zmian
  - Zmianę .gitignore → nowy artefakt (playwright logs)
  - Znaczące dla repo cleanliness

.github/workflows/ci.yml  — 3 zmian
  - Changes to CI pipeline → impacts all developers
  - Worth tracking

eslint.config.js, tsconfig.json  — 2 zmian each
  - Toolchain changes → affects all commits
```

---

## 7. Krytyczne Wnioski: Gdzie Projekt Jest Wrażliwy

### 🔴 HIGH RISK Areas (Przed Dużą Zmianą — Przejść Ostrożnie)

1. **`src/pages/shopping-list/index.astro`** (8 zmian)
   - Najaktywniejsza strona
   - Dotyka: checkoff, unit conversion, manual items, deletion
   - **Ostatnia zmiana**: 5 dni temu
   - **Rekomendacja**: Przed zmianą → zRunować E2E testy shopping-list

2. **`src/middleware.ts`** (6 zmian)
   - Każda zmiana → potencjalny impact na ALL pages
   - Dot. auth flow + route protection
   - **Rekomendacja**: Zmiana middleware → full E2E test suite (czeka)

3. **`src/lib/units.ts` + `src/lib/validation.ts`** (3 zmian)
   - Business logic dla unit conversion
   - Niedawno dodano testy (Risk #1-#6)
   - **Rekomendacja**: Wszystkie unit conversion changes → dodać test case

4. **Database Schema + Seed** (`supabase/migrations/`, `seed.sql`)
   - RLS policies zintegrowane z middleware
   - Zmiana schema → trzeba audyt RLS
   - **Rekomendacja**: Zanim zmiana schema → sprawdzić ACL/RLS spójność

### 🟡 MODERATE RISK Areas

5. **`src/pages/api/shopping-list-items/[id].ts`** (3 zmian)
   - API dla item CRUD
   - Koupluje się z UI stroną + middleware
   - **Rekomendacja**: API changes → test unit conversion flow end-to-end

6. **`src/pages/inventory/index.astro`** (7 zmian)
   - Druga-najaktywniejsza strona
   - Ostatnia zmiana: ~1 tydzień temu
   - **Status**: Mniej aktywna niż shopping-list, względnie stabilna

### 🟢 STABLE Areas (Safe to Change)

- Auth flows (`src/pages/auth/`) — 2 tygodnie bez zmian
- Components (`src/components/`) — nie zmieniane w ostatnim tygodniu
- Dashboard (`src/pages/dashboard.astro`) — 1 zmiana 3+ tygodnie temu

---

## 8. Rekomendacje: Co Obserwować Przed Większą Zmianą

### ✅ Checklist dla Any Major Refactor

- [ ] **Przeanalizuj cochanging files** do modułu, który będziesz zmieniać
  - Czy zmiana w X → pociąga zmianę w Y, Z?
  
- [ ] **Zidentyfikuj krytyczne ścieżki** (auth, checkoff, unit conversion)
  - Czy Twoja zmiana dotyka middleware? → full E2E test
  - Czy dotyka unit conversion? → unit tests + E2E
  
- [ ] **Test critical flows** (przed pushowaniem)
  - Shopping list checkoff with unit conversion
  - Manual item add + checkoff
  - Inventory edit + expiry update
  
- [ ] **Schema audit** (jeśli dotykasz supabase/)
  - RLS policies spójne z middleware?
  - Seed.sql aktualna?

- [ ] **Dependency impact** (jeśli zmieniasz package.json)
  - Czy zmiana package-lock.json jest zamierzona?
  - CI pipeline się nie złamała?

---

## Summary: Territory Map

```
VERY HOT (8+ zmian):
  └─ src/pages/shopping-list/index.astro (8) 
  └─ src/pages/inventory/index.astro (7)

CRITICAL (6 zmian, kontroluje wszystko):
  └─ src/middleware.ts (6)

HOT (3 zmian, core logic):
  └─ src/lib/units.ts (3)
  └─ src/pages/api/shopping-list-items/[id].ts (3)
  └─ src/pages/api/products/[id]/checkoff.ts (3)

INFRASTRUCTURE (4 zmian):
  └─ supabase/migrations/ (4)
  └─ .github/workflows/ci.yml (3)

METADATA (szum, 50+ zmian):
  └─ .claude/, context/ (nie dotyka runtime)

RECENTLY ACTIVE PATTERNS:
  ✓ shopping-list + API checkoff — 6 committed razem
  ✓ unit conversion + validation — 4 commits razem
  ✓ auth/middleware — 6 commits, ale stabilne
  ✓ testing infrastructure — nowe (Vitest, Playwright)

AREAS OF CONCERN:
  🔴 Shopping-list UI — intensywnie zmieniane, wymaga uważności
  🔴 Unit conversion — newborn feature, riziko regression
  🔴 Middleware — każdy commit dotyka ALL
  🟡 Inventory — stabilna, but 7 zmian wskazuje na możliwe edge-casey
```
