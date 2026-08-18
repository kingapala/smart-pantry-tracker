---
title: "Architectural Summary Report — Module 4 (10xArchitect Path)"
date: 2026-08-18
author: "Claude Code (Module 4)"
project: "Smart Pantry Tracker"
---

# Architectural Summary: Smart Pantry Tracker

## 1. Projekt (L2–L5)

**Projekt:** Smart Pantry Tracker  
**Stack:** Astro 6 SSR + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages  
**Skala:** MVP production-ready, solo developer (Kinga Nowak), 26-day active cycle (May 21–Jun 15, 2026), 40+ commits  
**Artefakty:** L2 (repo-map.md), L3 (research.md — shopping-list), L4 (plan.md — shopping-list refactor), L5 (3× DDD notes)

---

## 2. Mapa Projektu (L2: repo-map.md)

### Strefy Ryzyka (Hotspots)
- **shopping-list/index.astro** (8 zmian, 7 dni) — HIGH: checkoff dialog, unit conversion, manual items
- **middleware.ts** (6 zmian) — CRITICAL: guards ALL routes via `context.locals.user`
- **supabase.ts** (nigdy zmieniony, 25 linii) — CRITICAL HUB: 15 callers (verified: 19 callers via ast-grep, L3:393)

### Zależności Krytyczne
- Zmiana `supabase.ts` → łamie 19 plików (middleware + 5 auth + 4 products API + 3 shopping-list API + 3 pages)
- Zmiana `middleware.ts` → łamie wszystkie routes (auth, route protection)
- Zmiana `units.ts` → łamie validation.ts + checkoff.ts + 2 test files

### Status & Znane Problemy
✅ **Strengths:** Clean DAG (no cycles), stable core (supabase.ts frozen since day 1), security-first culture (5 findings caught & fixed same-day)  
🔴 **Vulnerabilities:** Single point of failure (supabase.ts hub), unit conversion is "young" (3 weeks, edge cases partially tested)  
⚠️ **Technical Debt:** No UPDATE RLS policy on shopping_list_items (mitigated by app-level checks), no unit tests for supabase.ts

---

## 3. Analiza Ficzera (L3: research.md)

### Przepływ Shopping List
**Why:** shopping-list/index.astro has 8 commits in 7 days — tied to Medium/High blast-radius changes (repo-map.md Risk #4). Suspected tight coupling across business logic layers.

**Overview:**  
Shopping List is live, auto-derived view: products with `quantity < min_threshold AND add_to_list = true` appear automatically. Users can add manual items (unlinked to pantry), checkoff purchases with optional unit conversion (e.g., 1L milk → 1000ml), and increment inventory. Checkoff spans 2 API endpoints (`shopping-list-items/[id]/checkoff.ts` + `products/[id]/checkoff.ts`) with ~95% duplicate logic, null-check differs.

### Critical Debt (Verified via ast-grep)
1. **Test Gap — CRUD Untested (~31 LOC/operation):** POST/PATCH/DELETE on manual items have zero integration test coverage. Only checkoff endpoints (3+2 cases) tested. Risk: invalid data insertion, corruption if validation fails. (research.md:206–242)

2. **Logic Duplication — Checkoff ~95% Identical:** Two endpoints replicate unit conversion + quantity math. Null-check differs: shopping-list assumes `enteredUnit` exists; products checks `qtyUnit &&...`. Future bug fix requires dual updates. ast-grep confirmed (research.md:392–403).

3. **Blast Radius — Schema Changes Affect 9–11 Files:**
   - `shopping_list_items.quantity` → 9 files (2 checkoff endpoints, validation.ts, 2 inventory pages, shopping-list.astro, 2 test files)
   - `products.add_to_list` → 11 files (4 API routes, checkoff, 3 inventory pages, 2 migrations)
   - Single query pattern scattered (SELECT+order, UPDATE+eq filters) suggests co-change risk.

---

## 4. Plan Refaktoryzacji (L4: plan.md)

### Zasiąg Refaktoru
**Co:** Unify checkoff logic, add test coverage, harden security  
**Docelowy kształt:** `src/lib/checkoff.ts` — single `addToInventory()` utility imported by both endpoints; eliminates duplication. Plus dead-code cleanup (unitsCompatible, roundTo2 exported but never called).

### Czego NIE Robimy
- Monitoring/alerting for precision loss (post-release)
- Property-based testing for unit conversion (Phase 3, deferred)
- Auth service layer refactor (separate initiative)
- UX changes to checkoff flow

### Fazy Planu
| Faza | Docelowy wynik | Weryfikacja |
|------|---|---|
| **Phase 1: Refactor** | Extract checkoff utility, remove dead code, document precision | TypeScript compile ✓, linting ✓, existing tests pass ✓ |
| **Phase 2: E2E** | 4 Playwright tests (no-convert, with-convert, error, pantry item) | E2E tests pass ✓, no console errors ✓ |
| **Phase 3: CRUD Integration** | 7 test cases (create/update/delete with success & error paths) | CRUD tests pass ✓, coverage >80% ✓ |
| **Phase 4: RLS Policy** | Add UPDATE policy to shopping_list_items (defense-in-depth) | Migration applies ✓, policy verified in Supabase ✓ |

---

## 5. Domena (DDD, L5: 01–03)

### Ubiquitous Language & Kluczowe Rozjazdy
**Core Pojęcia:** Restocking Rule (binary gate: qty < threshold ∧ addToList), Product (inventory unit), ShoppingListItem (manual entry), Min Threshold (user-set), Unit (category-aware conversion)

**Rozjazdy Model ↔ Kod:**
- **Shopping List "auto-derived" vs rzeczywisty UNION:** PRD says "derived automatically" but code merges pantry products + manual items (UNION w L3:51–69). Semantyka split.
- **Manual Item Linking:** Checkoff uses ILIKE fuzzy match (L3:47), linking manual "Sugar" to pantry "sugar", contradicting FR-14 "not linked to pantry". Intentional feature or bug? (L5 KROK 4: tabela rozjazdów, wiersz #7)
- **Checkoff Atomicity Not Enforced:** SELECT + VALIDATE + UPDATE + DELETE are separate queries without transaction. Race condition risk between UPDATE and DELETE. (L5 KROK 1–2: niezmiennik #4, status ❌)

### Niezmiennik #1 & Agregat
**Restocking Rule** (core business): Product is on shopping list ⟺ `quantity < min_threshold AND addToList = true`  
**Problem:** Egzekwowanie rozproszone (READ side solid, WRITE side inconsistent). POST (`products/index.ts`) nie waliduje `quantity > 0` ani `min_threshold > 0`; PUT waliduje; checkoff nie chroni przed `< 0`. (L5 KROK 3: agregat Product, niezmiennik #2 status ⚠️)

**Wybór Agregatu:** RestockableProduct (L5 KROK 4) z metodami `create()`, `checkoff()`, `update()` — egzekwuje niezmienniki fail-fast. `checkoff()` throws na unit incompatibility, negative result. Atomic persistence via PL/pgSQL `checkoff_product_atomic()` (transaction lock + UPDATE + DELETE).

### Anti-Corruption Layer (L3: 03)
**Przeciek:** Supabase PostgREST API (`.from().select().update().delete().insert().eq().order()`) w 20+ plikach — każdy API route, 2 strony Astro, test harness. SDK-specyficzny query builder.

**Rozwiązanie:** Port/Adapter pattern — `ProductRepository` port (domenowy) implementowany przez `SupabaseProductRepository` (adapter). Po refaktorze `@supabase` imports tylko w 4 plikach infrastructure/ (`SupabaseProductRepository.ts`, `SupabaseShoppingListItemRepository.ts`, `SupabaseAuthAdapter.ts`, `supabase.ts`). API routes/pages zależą od portów, nie od SDK. Wymiana Supabase → Firebase: nowy adapter (1 plik) + update DI (1 plik), zero zmian w 20+ plikach.

---

## 6. Decyzje Należące do Mnie

**Co AI podpowiedziało:**
- 3 niezależne refactorings (checkoff logic, test coverage, RLS) — każde odrębnym artefaktem
- DDD analysis ujawniła 8 niezmienników; wszystkie równie ważne na papierze

**Co wybrałem i dlaczego:**
1. **Checkoff atomicity FIRST (nie test-driven):** Atomic checkoff jest fundamentem — jeśli nie trzyma, test coverage go nie naprawia. Refactor checkoff → extract utility. POTEM testy walidują (Phase 2–3).
2. **RLS policy OSTATECZNA warstwa:** App-level auth check istnieje i działa. Policy jest defense-in-depth, ale nie crítico na MVP. Dodaj ją po testach (Phase 4).
3. **ACL deferral (separate initiative):** Anti-corruption layer jest duża (6 faz, 20+ plików). Możliwa post-refactor jako "Phase 5" ale nie część tego sprintu — skupiam się na shopping-list atomicity.

**Uzasadnienie:** Restocking Rule jest core business value (repo-map.md Vision). Checkoff jest najczęstszą user operation. Bez atomicity list staje się niespójna. Test coverage bez atomicity to testing bug. RLS bez test coverage to "feels safe but untested". Sekwencja: atomic checkoff → test coverage → security hardening to ascending risk/confidence.

---

**Report Status:** Complete. Next: Implementation per Phase 1–4 plan.md. ACL (Port/Adapter) zaplanować na Phase 5 (post-deployment).
