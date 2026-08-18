---
title: "Domain Distillation: Smart Pantry Tracker"
created: 2026-08-18
type: domain-distillation
---

# Domain Distillation: Smart Pantry Tracker

## KROK 0: Kontekst projektu

**Typ projektu:** Aplikacja webowa (Greenfield MVP)  
**Stack:** Astro 6 + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare Pages  
**Timeline MVP:** 3 tygodnie  
**Skala:** Mały user base, niskie QPS, mały volume danych  

**Dokumentacja źródłowa:**
- `context/foundation/prd.md` — wymagania (vision, personas, success criteria, FR/NFR)
- `context/foundation/tech-stack.md` — uzasadnienie tech stacku
- `CLAUDE.md` — konwencje kodu

**Warstwy logiki biznesowej w kodzie:**
- **Persystencja:** `src/pages/api/` — API routes (Astro) na Supabase
- **Domena biznesowa:** Rozproszona w API routes (`products/[id].ts`, `shopping-list-items/[id].ts`) — brak dedykowanej warstwy domeny
- **UI:** Strony Astro (`src/pages/`) renderujące HTML + komponenty React

**Ograniczenia:** Dokumentacja wymagań jest szczegółowa; brak dedykowanej dokumentacji architektury domeny.

---

## KROK 1: Ubiquitous Language

### Pojęcia domenowe z PRD

| Termin | Definicja z PRD | Cytat źródłowy | Lokacja w kodzie |
|--------|-----------------|---|---|
| **Restocking Rule** | Reguła biznesowa decydująca, czy produkt potrzebuje uzupełnienia: `current_quantity < min_threshold AND addToList = true` | PRD § Business Logic: "The app decides a product needs restocking when its current quantity falls below the user-set minimum threshold and the product's `addToList` flag is ON." | `src/pages/shopping-list/index.astro:39` `.eq("add_to_list", true)` + query filter |
| **Inventory** | Pełna lista produktów domowych użytkownika ze stanami | PRD § User Stories US-01: "Given a logged-in user with a product "Milk" (quantity: 2 litres, minimum threshold: 1 litre)" | `src/pages/inventory/index.astro:8-16` interface `Product` |
| **Shopping List** | Live reflection produktów aktualnie poniżej progu (auto-derived) + niestandardowe przedmioty (manual) | PRD § Vision: "the shopping list is derived automatically from inventory state" | `src/pages/shopping-list/index.astro:21-42` — merge `products` (filtered) + `shopping_list_items` |
| **Minimum Threshold (min_threshold)** | Użytkownik-określony poziom poniżej którego produkt uważa się za "running low" | PRD § Business Logic: "a minimum threshold (set by the user at the level below which they consider themselves 'running low')" | `src/pages/api/products/index.ts:20` form field; `src/lib/validation.ts:22` enforced > 0 |
| **Current Quantity** | Dostępna ilość produktu — aktualizowana gdy użytkownik zużywa lub uzupełnia zapasy | PRD § US-01: "the user updates the product quantity to 0 (used the last of it)" | `src/pages/api/products/[id].ts:27` quantity field; `checkoff.ts:41-50` increment logic |
| **Add-to-List Flag (addToList)** | Opt-in boolean (default ON); gdy OFF, produkt nigdy nie pojawia się na liście niezależnie od quantity | PRD § FR-010: "any product whose current quantity is below its minimum threshold **and whose `addToList` flag is ON**" | `src/pages/api/products/index.ts:21` checkbox; `src/pages/shopping-list/index.astro:39` filter `.eq("add_to_list", true)` |
| **Product** | Jednostka inwentarza: id, name, quantity, unit, min_threshold, add_to_list, expiry_date (opcjonalny), user_id | PRD § FR-004: "User can add a product to their inventory (name, quantity, unit, **optional** expiry date, minimum threshold)" | `src/pages/inventory/index.astro:8-16` interface `Product`; Supabase table `products` |
| **Shopping List Item (Manual)** | Niestandardowy przedmiot dodany ręcznie do listy — nie związany z produktem w pantry | PRD § FR-014: "User can manually add an arbitrary item to their shopping list (not linked to a pantry product)" | `src/pages/shopping-list/index.astro:14-19` interface `ManualItem`; Supabase table `shopping_list_items` |
| **Checkoff** | Operacja: użytkownik potwierdza kupienie przedmiotu, podaje ilość; ilość produktu w pantry wzrasta | PRD § US-01 AC: "The product entry in the inventory remains visible (with quantity 0), not deleted" + FR-012: "enter the quantity purchased; the product's inventory quantity increases by that amount" | `src/pages/api/products/[id]/checkoff.ts` POST handler; `shopping-list-items/[id]/checkoff.ts` POST handler |
| **Unit** | Jednostka miary (g, kg, ml, l, pcs, itp.) — umożliwia konwersję między kategoriami (masa, objętość, szt) | PRD § FR-004: "name, quantity, unit"; CLAUDE.md: "unit conversion integration" | `src/lib/units.ts` — konwersja z tablicą UNIT_MAP; `convertUnit()` fn |
| **Expiry Date** | Data wygaśnięcia produktu — opcjonalna; produkty wygasłe (expiry_date < dziś) wyświetlane w czerwieni | PRD § FR-008: "User can see expired products visually highlighted (red) in their inventory" | `src/pages/inventory/index.astro:19-22` — porównanie z `todayStr` do hilight |
| **User (Auth Context)** | Zalogowany użytkownik — owns all their pantry data; single model (no roles, no sharing) | PRD § Access Control: "Single user model. Each account holds its own isolated pantry" | `src/middleware.ts:16-19` — `context.locals.user` z Supabase auth |

### Pojęcia domenowe z kodu (nie wymienione w PRD)

| Termin | Obserwacja | Cytat źródłowy | Status |
|--------|-----------|---|---|
| **Unit Conversion (Cross-category)** | System konwersji jednostek między kategoriami (mass ↔ volume, count ↔ mass forbidden); brak wspomnienia w PRD | `src/lib/units.ts:78-91` `convertUnit()` — checks `category` compatibility | Domena wspomagająca, ale kluczowa dla checkoff flow |
| **Listing Strategy** | Operacja PATCH `/products/[id]/listing` (inny termin niż checkoff) — zmienia min_threshold na `current_quantity + buy` | `src/pages/api/products/[id]/listing.ts:4` PATCH handler — `newMinThreshold = currentQuantity + buy` | ROZJAZD: PRD nie wspomina o tym; kod zawiera zaawansowaną "smart threshold" logic |
| **Product Listing** | Act of marking product as "want to stock": setting min_threshold predyktywnie na podstawie "qty I plan to buy" | `listing.ts:40` — calculated min; Topbar.astro flow | Domena wspierająca (v2?) |

---

## KROK 2: Klasyfikacja subdomen

| Subdomena | Pojęcia | Typ | Uzasadnienie |
|-----------|---------|-----|---|
| **Restocking Engine** | Restocking Rule, Add-to-List Flag, Current Quantity vs Min Threshold | **CORE** | Stanowi przewagę konkurencyjną i sens produktu (PRD Vision): "if the shopping list is derived automatically from inventory state... the user only ever maintains one source of truth." Brak tego = produkt nie istnieje. |
| **Inventory Management** | Product, Quantity, Unit, Min Threshold, Expiry Date, Add-to-List Flag | **CORE** | Bezpośrednio wspiera restocking engine; user robi wszystko tu (FR-004 do FR-009). |
| **Shopping List (Derived)** | Shopping List (auto-generated), Checkoff, Merge (pantry + manual items) | **CORE** | Užytkownik видит wynik reguły restock tutaj (FR-010 do FR-012); zmiana inventory → zmiana listy musi być seamless. |
| **Manual Shopping Items** | Shopping List Item (manual), Create Item, Checkoff Item | **SUPPORTING** | Resolves FR-014 gap (one-off items); mniej kluczowe niż auto-driven items. |
| **Unit Conversion** | Unit, Unit Category, convertUnit(), unitsCompatible() | **SUPPORTING** | Enables user convenience (checkoff w innej jednostce); brak tego = user musi ręcznie liczyć. Nie jest core business insight. |
| **Authentication & Authorization** | User, Auth Context, Session, Role (none), Data Isolation (RLS) | **GENERIC** | Outsourced do Supabase; standard pattern. PRD § Guardrails: "Data isolation must hold unconditionally" — ale to infra concern (RLS policy), nie logika biznesowa. |
| **Form Validation** | Validation Rules (quantity > 0, min_threshold > 0, unit known or unchanged) | **GENERIC** | Standard input validation; Zod-like pattern. |
| **Date Handling** | Expiry Date, Expired vs Soon-to-expire highlighting | **SUPPORTING** | Nice-to-have signalling (FR-008); PRD note: "the highlight is invisible if the user doesn't open the app" → passive UX, nie core feature. |

**Wnioski:**
- **Core domena** = Restocking Logic + Inventory + Shopping List — trzy boki tego samego trójkąta.
- **Supporting** domains zapewniają UX layer (manual items, date signals, unit convenience).
- **Generic** domains to infra (auth, validation) — replace-ability high.

---

## KROK 3: Agregaty i ich niezmienniki

### Agregat 1: Product (Restockable Item)

**Identyfikator:** `id` (UUID, DB-generated)  
**Pola:**
```
id: UUID
user_id: UUID (foreign key → auth.users)
name: string (non-empty)
quantity: number > 0
unit: string (known from UNIT_MAP or legacy)
min_threshold: number > 0
add_to_list: boolean (default true)
expiry_date: string | null (ISO date)
created_at: timestamp (auto)
updated_at: timestamp (auto)
```

**Niezmienniki:**

| Niezmiennik | Reguła | Cytat źródłowy | Status egzekwowania |
|---|---|---|---|
| **Restocking Gate** | Produkt jest na liście zakupów IFF `quantity < min_threshold AND add_to_list = true` | PRD § Business Logic: "current quantity drops below the threshold and the flag is ON, the product becomes a restocking candidate" | ✅ **Egzekwowany w kodzie**: `src/pages/shopping-list/index.astro:39` `.eq("add_to_list", true)` + SELECT filter; produkty poniżej progu nie są zwracane jeśli flag OFF |
| **Positive Quantity** | `quantity` zawsze > 0; nigdy 0 lub ujemny | PRD § AC (US-01): "The product entry in the inventory remains visible (with quantity 0), not deleted" — interpretacja: logika testowa dopuszcza 0, ale walidacja form zmusza > 0 | ⚠️ **Deklarowany, ale słabo egzekwowany**: `src/lib/validation.ts:19` sprawdza > 0 w PUT, ale POST nie waliduje; API `checkoff.ts:19` sprawdza qtyPurchased > 0, ale nie chroni quantity product'u przed < 0 |
| **Positive Threshold** | `min_threshold` zawsze > 0 | PRD § FR-004: "User can add a product to their inventory... minimum threshold" + Socrates challenge accepted | ⚠️ **Deklarowany**: `src/lib/validation.ts:22` checka > 0 w PUT, ale POST (`products/index.ts`) nie waliduje |
| **Unit Immutability on Edit** | Jeśli `unit` się zmienia, musi być Known Unit (lub stay unchanged) | PRD § FR-004: "unit" — brak wymogu immutability, ale zmiana bez konwersji danych historycznych może popsuć checkoff flow | ⚠️ **Częściowo egzekwowany**: `src/lib/validation.ts:26-28` pozwala zmianę TYLKO jeśli jest known unit; jednak nie ma backfill reguły dla istniejących quantity |
| **User Ownership** | Każdy Product.user_id musi matchować authenticated user.id | PRD § Access Control: "User A must never be able to view, modify, or delete any pantry record belonging to user B" | ✅ **Egzekwowany**: każdy query zawiera `.eq("user_id", user.id)` (src/pages/api/products/[id].ts:66, index.ts itd.); Supabase RLS policy zapewnia second layer |
| **No Orphaned Products** | Produkt nie może istnieć bez user_id | Inherent w schemacie | ✅ **Egzekwowany**: DB constraint; insert zawsze zawiera `user_id: user.id` |

**Parity obserwacji:**
- Restocking gate jest solidnie egzekwowany (READ side).
- Quantity/Threshold validation istnieje ale jest **niekompletna** — POST nie waliduje, PUT waliduje, checkoff może potencjalnie zepsuć invariant.
- Unit zmiana jest gałęzią logiki — brak dedykowanego test coverage widocznego w kodzie.

---

### Agregat 2: ShoppingListItem (Manual Item)

**Identyfikator:** `id` (UUID, DB-generated)  
**Pola:**
```
id: UUID
user_id: UUID (foreign key → auth.users)
name: string (non-empty)
quantity: number > 0
unit: string
expiry_date: string | null (ISO date, optional)
created_at: timestamp (auto)
```

**Niezmienniki:**

| Niezmiennik | Reguła | Status egzekwowania |
|---|---|---|
| **Not Auto-derived** | ShoppingListItem.name ≠ any Product.name (SHOULD be manual, not auto-populated) | ❌ **Nie egzekwowany**: checkoff.ts:47 robi case-insensitive `.ilike("name", name)` match; jeśli user ręcznie doda "Milk" a ma już pantry Product "milk", checkoff SCALI przedmiot do produktu zamiast preserve distinct entries |
| **User Ownership** | ShoppingListItem.user_id musi matchować authenticated user | ✅ **Egzekwowany**: każdy query `.eq("user_id", user.id)` |
| **Positive Quantity** | quantity > 0 | ⚠️ **Deklarowany, słabo egzekwowany**: POST (`shopping-list-items/index.ts`) nie waliduje na insert |

**Obserwacja:**
ShoppingListItem jest "lightweight" — mniej egzekwowania niezmienników niż Product. Fuzzy match w checkoff (ILIKE) jest feature czy bug? Rozjazd w semantyce?

---

### Agregat 3: User (Auth Context)

**Identyfikator:** `id` (UUID, Supabase auth.users)  
**Pola:**
```
id: UUID
email: string (unique, email format)
encrypted_password: hash
session: JWT (in cookie)
created_at: timestamp
last_sign_in_at: timestamp | null
```

**Niezmienniki:**

| Niezmiennik | Reguła | Status egzekwowania |
|---|---|---|
| **Unique Email** | Brak dwóch użytkowników z tym samym email | ✅ **Egzekwowany**: Supabase auth.users constraint |
| **Session Validity** | Session musi być valid JWT przed any protected route access | ✅ **Egzekwowany**: `src/middleware.ts:24-27` redirect do signin jeśli no user |
| **Data Isolation** | Użytkownik vidi only OWN products i manual items | ✅ **Egzekwowany**: RLS policy + każdy API query `.eq("user_id", user.id)` |

---

## KROK 4: Tabela rozjazdów MODEL vs KOD

| Dokument | Co mówi | Co robi kod | Dowód | Typ | Waga |
|----------|---------|-----------|-------|-----|------|
| **PRD Vision** | "shopping list is derived automatically from inventory state" | Lista zawiera zarówno auto-derived produkty (z pantry, poniżej progu) i manual items (ShoppingListItem table) — nie jest czysto auto-derived | `src/pages/shopping-list/index.astro:34-42` UNION dwóch sources | Interpretacja | WYSOKA — core feature behavior |
| **PRD FR-004** | Expiry date jest **optional** przy dodawaniu produktu | Kod w POST akceptuje null; UI nie wymusza | `src/pages/api/products/index.ts:19` `expiryDate || null` | Alignment ✅ | ŚREDNIA |
| **PRD FR-004** | "User can add a product to their inventory (name, quantity, unit, minimum threshold)" | POST (`products/index.ts`) nie waliduje quantity > 0 ani min_threshold > 0; PUT waliduje; checkoff nie waliduje wstawianego quantity | `src/pages/api/products/index.ts` brak validation vs `src/lib/validation.ts:18-32` | Luka | WYSOKA — niezmiennik |
| **PRD FR-010** | Produkt pojawia się na liście gdy `quantity < min_threshold AND addToList = ON` | Kod filters `.eq("add_to_list", true)` ale query nie zawiera `quantity < min_threshold` — to robią frontend components wyliczające `buy` (`listing.ts:40: newMinThreshold = currentQuantity + buy`) | `src/pages/shopping-list/index.astro:36-40` — SELECT all products `.eq("add_to_list", true)` bez quantity filter | Rozjazd | WYSOKA — logika core |
| **PRD FR-012** | "User can check off a shopping list item and enter the quantity purchased; the product's inventory quantity increases by that amount" | Checkoff obsługuje unit conversion przy inkrementacji (convertUnit); jeśli user kupuje 1 kg mleka a ma ml w pantry, kod konwertuje. PRD nie wspomina o konwersji. | `src/pages/api/products/[id]/checkoff.ts:44-50` convertUnit() call | Enhancement | ŚREDNIA — convenience feature |
| **PRD FR-014** | "User can manually add an arbitrary item to their shopping list (not linked to a pantry product)" | Checkoff ShoppingListItem (line 55) robi ILIKE case-insensitive match; jeśli znalazł match w produktach, scali do produktu zamiast tworzyć nowy. To linkuje "manual" item do pantry product, wbrew FR-14. | `src/pages/api/shopping-list-items/[id]/checkoff.ts:47-49` ILIKE search; line 55-84 update existing | Rozjazd | WYSOKA — user intent conflict |
| **PRD FR-008** | "User can see expired products visually highlighted (red)" | Kod wyświetla produkty z expiry_date < dzisiaj w czerwieni; produkty bez expiry_date nigdy nie są w czerwieni. PRD nie mówi o tym zachowaniu (optional expiry_date requirement). | `src/pages/inventory/index.astro:19-22` highlight logic | Alignment ✅ | NISKA — edge case |
| **PRD § Business Logic** | "The rule produces no score, ranking, or recommendation — it is a binary gate" | `listing.ts:40` calculates `newMinThreshold = currentQuantity + buy` — to nie jest binary gate, to inteligentny scoring na "howManyToBuyFor"; zapewnia predictive threshold | `src/pages/api/products/[id]/listing.ts:40` | Enhancement | ŚREDNIA — smart feature ale undocumented |
| **CLAUDE.md** | "Env vars must use `astro:env/server`" | Kod używa `SUPABASE_URL, SUPABASE_KEY` z `astro:env/server` | `src/lib/supabase.ts:3` import | Alignment ✅ | NISKA — convention |

---

## KROK 5: Ranking kandydatów na refaktor

### Wysokość (Priority) wg Core value + Risk

| # | Agregat / Pojęcie | Wartość (Core?) | Ryzyko (egzekwowania) | Złożoność refaktoru | Rekomendacja |
|---|---|---|---|---|---|
| **1** | **Product.Restocking Gate** | WYSOKA (core business) | ŚREDNIA (READ side solidny, ale WRITE side inconsistency) | WYSOKA | 🎯 **REFAKTOR #1** — ujednolicić walidację quantity > 0 i min_threshold > 0 między POST/PUT/checkoff; dodać integration tests dla gate |
| **2** | **Product.Quantity Invariant** | WYSOKA (core state) | WYSOKA (POST nie waliduje, checkoff może output < 0?) | ŚREDNIA | 🎯 **REFAKTOR #2** — centralna walidacja `quantity > 0` w POST; dedicated domain service `ensurePositiveQuantity()` |
| **3** | **ShoppingListItem.Manual vs Auto** | ŚREDNIA (supporting) | WYSOKA (ILIKE merge w checkoff.ts linuje se manual items do pantry, wbrew FR-14 intent) | WYSOKA | 🎯 **REFAKTOR #3** — decide: allow merge (implicit linking) czy forbid (preserve manual separation); add explicit FK czy keep denormalized? |
| **4** | **Unit Conversion Strategy** | ŚREDNIA (convenience) | NISKA (solidnie egzekwowany w checkoff.ts) | NISKA | ⏸️ **BACKLOG** — już jest; add coverage |
| **5** | **Product.Unit Immutability** | NISKA (edge case) | ŚREDNIA (change allowed bez data migration) | ŚREDNIA | ⏸️ **BACKLOG** — low frequency; add warning UX |
| **6** | **Shopping List Derivation** | WYSOKA (core output) | ŚREDNIA (logika rozproszony między shopping-list.astro a listing.ts) | WYSOKA | 🎯 **REFAKTOR #4** — extracted `ShoppingList` aggregate z computed properties; owning reguła dostępu do `buy` field |
| **7** | **Listing Strategy (min_threshold prediction)** | NISKA (undocumented feature) | NISKA (isolated route) | NISKA | 📚 **DOCUMENT** — explain "smart threshold" logic i decision rationale |

### Rekomendacja: Startowy punkt refaktoru

**PRIORITY #1: Product Quantity Validation Consolidation**

**Dlaczego:** Restocking gate (core business) zależy od poprawności `quantity` state. POST (`products/index.ts`) i PUT (`products/[id].ts`) mają rozbieżną walidację:
- POST: brak walidacji quantity > 0
- PUT: waliduje quantity > 0 (via `validateProductInput`)
- Checkoff: inkrementuje bez zabezpieczenia przed negative result

**Risk:** Użytkownik może (via race condition lub bug) stworzyć product z quantity ≤ 0, co złamie niezmiennik Restocking Gate.

**Zakres refaktoru:**
1. Przenieść `validateProductInput()` do dedykowanego domain service
2. Użyć we wszystkich INSERT/UPDATE operations na Product
3. Dodać integration test: "user cannot create product with quantity ≤ 0"
4. Dodać E2E test: "checkoff flow preserves quantity > 0 invariant"

**Kryteria gotowości:**
- ✅ Walidacja unified między POST, PUT, checkoff
- ✅ Walidacja min_threshold > 0 also centralized
- ✅ Tests verify gate behavior under quantity mutations

---

## Podsumowanie: Zawartość artefaktu i wnioski

Dokument zawiera kompletną mapę domeny **Smart Pantry Tracker** dzieloną na pięć warstw:
1. **Kontekst**: Stack, timeline, struktura kodu
2. **Ubiquitous Language**: 13 pojęć domenowych z cytatami PRD + obserwacjami z kodu (3 kluczowe: Restocking Rule, Product, Shopping List)
3. **Klasyfikacja subdomen**: CORE (3 subdomeny: Restocking, Inventory, Shopping List), SUPPORTING (4: Manual Items, Unit Conversion, Dates), GENERIC (2: Auth, Validation)
4. **Agregaty + Niezmienniki**: 3 agregaty (Product, ShoppingListItem, User) z 11 niezmiennikami; status egzekwowania dla każdego (✅/⚠️/❌)
5. **Rozjazdy MODEL↔KOD**: 8 wpisów z konkretnymi ścieżkami; NAJWAŻNIEJSZY: Shopping List "auto-derived" vs rzeczywisty UNION dwóch źródeł (pantry + manual), oraz FR-14 fuzzy-match behavior w checkoff

**Najważniejszy wniosek:**  
Core business — **Restocking Rule** — jest logicznie zdefinowany (binary gate: `quantity < threshold AND addToList = true`), ale egzekwowanie jest **rozproszone i niekompletne**. POST nie waliduje quantity > 0; checkoff może inkrementować do stanu, który łamie invariant. Refaktor #1 (centralna walidacja quantity) jest niezbędny zanim produkt będzie production-ready pod względem correctness.
