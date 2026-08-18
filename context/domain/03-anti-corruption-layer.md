---
title: "Anti-Corruption Layer: Supabase Query API Leakage"
created: 2026-08-18
type: refactor-plan
---

# Anti-Corruption Layer: Supabase Query API Leakage

## KROK 0: Odkrycie kontekstu

**Stack:** Astro 6 (SSR) + React 19 + TypeScript + Supabase + Cloudflare Pages  
**Zależności zewnętrzne** (z package.json):
- `@supabase/ssr` ^0.10.3 — Server-side cookie/auth handling
- `@supabase/supabase-js` ^2.106.2 — Supabase client SDK
- `@astrojs/cloudflare` ^13.5.0 — deployment adapter
- `astro` ^6.3.1 — framework

**Warstwy kodu:**
- `src/lib/supabase.ts` — client factory
- `src/middleware.ts` — auth context (per-request)
- `src/pages/api/**/*.ts` — 18 API route handlers
- `src/pages/**/*.astro` — 5+ server-side Astro pages
- `src/lib/test/fake-supabase.ts` — test harness

**Deklaracje o wymienialności:**
- CLAUDE.md § Key Conventions linii 29: "`supabase.ts` is the Supabase client factory" — udziela jedynemu miejscu, ale zwraca pełny SupabaseClient
- CLAUDE.md § Business Logic linii 51: "Data isolation per user is enforced by Supabase Row-Level Security; **never bypass RLS with service-role key**" — pokazuje zależność od Supabase RLS (tj. brak alternatywy)
- infrastructure.md § Unknown Unknowns linii 81: "**Supabase JS client may open a WebSocket...**" — świadomość specyficznych zachowań Supabase, ale brak abstrakcji do obsługi przyszłej wymiany

**Brak deklaracji wymienialności** — nigdzie nie mówią "persystencja powinna być wymienialna" ani "abstrakcja od bazy".

---

## KROK 1: IDENTYFIKACJA przeciekających zależności

### Przeskanowanie importów — gdzie żyją zależności Supabase

| Plik | Import | Linia | Typ zależności |
|---|---|---|---|
| `src/lib/supabase.ts` | `import { createServerClient, parseCookieHeader } from "@supabase/ssr"` | 1 | **Biblioteka (root cause)** |
| `src/lib/supabase.ts` | `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` | 3 | Konfiguracja |
| `src/middleware.ts` | `import { createClient } from "@/lib/supabase"` | 2 | Pośredni (import z library wrapper) |
| `src/middleware.ts` | `await supabase.auth.getUser()` | 18 | **Typ: Supabase auth API** |
| `src/pages/api/auth/signin.ts` | `import { createClient } from "@/lib/supabase"` | 2 | Pośredni |
| `src/pages/api/auth/signin.ts` | `supabase.auth.signInWithPassword()` | 13 | **Typ: Supabase auth API** |
| `src/pages/api/products/index.ts` | `import { createClient } from "@/lib/supabase"` | 2 | Pośredni |
| `src/pages/api/products/index.ts` | `supabase.from("products").insert()` | 23 | **Typ: Supabase PostgREST API** |
| `src/pages/api/products/[id].ts` | `await supabase.from("products").select()` | 34 | **Typ: Supabase PostgREST API** |
| `src/pages/api/products/[id].ts` | `supabase.from("products").update()` | 56 | **Typ: Supabase PostgREST API** |
| `src/pages/api/products/[id].ts` | `supabase.from("products").delete()` | 91 | **Typ: Supabase PostgREST API** |
| `src/pages/inventory/index.astro` | `import { createClient } from "@/lib/supabase"` | 4 | Pośredni |
| `src/pages/inventory/index.astro` | `supabase.from("products").select(...).order()` | 29-30 | **Typ: Supabase PostgREST API** |
| `src/pages/shopping-list/index.astro` | `supabase.from("products").select()` | 36-40 | **Typ: Supabase PostgREST API** |
| `src/lib/test/fake-supabase.ts` | `private operation: "select" \| "update" \| "delete"` | 43 | **Replikacja API Supabase** |
| (15 dalszych API routes) | `supabase.from(...).select().update().delete().insert().order()` | — | **Typ: Supabase PostgREST API (powielone 15x)** |

**WSZYSTKIE importy znikają — wszystkie idą przez `createClient()`** (linija supabase.ts:1), ale zwracają typ SupabaseClient z rzeczywistą zależnością na `@supabase/ssr`.

### Duplikacja i wzorce — gdzie kod się rozsmaruje

**Wzór 1: SELECT + order** (pojawia się 3x)
```typescript
// src/pages/inventory/index.astro:29-30
await supabase.from("products").select("*").order("expiry_date", { ascending: true, nullsFirst: false })
await supabase.from("products").select("*").order("created_at", { ascending: true })

// src/pages/shopping-list/index.astro:36-40
supabase.from("products").select(...).eq("user_id", user.id).eq("add_to_list", true)
supabase.from("shopping_list_items").select(...)
```

**Wzór 2: UPDATE + eq filters** (pojawia się 5x w różnych routes)
```typescript
// src/pages/api/products/[id].ts:56-66
supabase.from("products").update({ ... }).eq("id", id).eq("user_id", user.id)

// src/pages/api/products/[id]/checkoff.ts:61-65
supabase.from("products").update(updatePayload).eq("id", id).eq("user_id", user.id)
```

**Wzór 3: DELETE + user_id filter** (pojawia się 3x)
```typescript
// src/pages/api/products/[id].ts:91
supabase.from("products").delete().eq("id", id).eq("user_id", user.id)

// src/pages/api/shopping-list-items/[id]/checkoff.ts:104-107
supabase.from("shopping_list_items").delete().eq("id", id).eq("user_id", user.id)
```

**Wzór 4: INSERT** (pojawia się 2x)
```typescript
// src/pages/api/products/index.ts:23-31
supabase.from("products").insert({ user_id: user.id, name, quantity, ... })

// src/pages/api/shopping-list-items/index.ts:21-27
supabase.from("shopping_list_items").insert({ user_id: user.id, name, ... })
```

---

## KROK 2: KLASYFIKACJA i wybór #1

### Ocena wszystkich przecieków

| Przeciek | Liczba plików | Ryzko wymiany | Deklaracja wymienialności | Wybór |
|---|---|---|---|---|
| **Supabase PostgREST API** (`.from().select().update().delete().insert()`) | 20+ (wszystkie API routes + inventory.astro + shopping-list.astro) | WYSOKE — każda nowa persystencja wymaga innego SDK | ❌ Nie | 🎯 **#1 WYBÓR** |
| Supabase Auth API (`.auth.getUser()`, `.auth.signInWithPassword()`) | 5 (middleware + auth routes) | WYSOKIE — wymaga innej lib auth | ⚠️ Implicit w CLAUDE.md | #2 (po #1) |
| Supabase typ klienta (SupabaseClient) | 20+ (zwracany z createClient) | WYSOKIE — zmiana wraca do 20 plików | ❌ Nie | Zależy od #1 |
| `@supabase/ssr` library | 1 (supabase.ts:1) | ŚREDNIA — wymaga alternatywy SSR-aware | ❌ Nie | Logiczny następny |

### Uzasadnienie wyboru #1: Supabase PostgREST API

1. **(a) Liczba warstw / plików dotkniętych:** 20+ plików (wszystkie API routes, 5 stron Astro, test harness)
   - Każdy plik bezpośrednio zna `.from()`, `.select()`, `.update()`, `.delete()`, `.insert()`, `.eq()`, `.order()`
   - Test harness replikuje cały interfejs (`FakeQueryBuilder` w fake-supabase.ts linii 41-50)

2. **(b) Ryzyko i koszt wymiany dziś:**
   - Jeśli chcemy wymienić Supabase na Firebase Realtime Database, Prisma, czy CouchDB:
     - Firebase: `db.collection("products").doc(id).set(data)` — API całkowicie inny
     - Prisma: `prisma.products.update({ where: { id }, data: { ... } })` — inny pattern
     - CouchDB: `db.put({ _id, _rev, ... })` — inny model
   - **Każdy plik API route'u trzeba zmienić** — to nie jest mechaniczna refactor, to przepisanie logiki queryowania
   - Testy wymagają nowego fake'a lub mockowania nowego SDK

3. **(c) Czy dokumenty deklarują wymienialność?**
   - CLAUDE.md § Architecture linii 29 mówi "`supabase.ts` is the Supabase **client factory**" — centralizacja, ale **nie abstrakcja**
   - infrastructure.md § Unknown Unknowns linii 81 wymienia specyficznych Supabase zachowań (WebSocket, Realtime) — świadomość, że Supabase ma specyfiki, ale **brak planu na zmianę**
   - **Brak jakiegokolwiek tekstu** sugerującego, że persystencja powinna być wymienialna

   **Rozjazd INTENCJA vs KOD:** Kod jest dziś w 100% powiązany z Supabase, ale nic tego nie zapewnia intencjonalnie. Jeśli projekt dorosnął (skala zmiennie), może być ciśnienie na wymianę — dokumenty nie są przygotowane.

**WYBÓR #1 — Supabase PostgREST API przeciek** — bo jest najliczniejszy (20+ plików), najciężej wymienialny (inny SDK), i dokumenty nie deklarują, że ma być wymienialny, co oznacza, że refactor będzie niespodzianką.

---

## KROK 3: DIAGNOZA

### 3.1 Gdzie dziś żyje reguła (cytaty plik:linia)

**Miejsce A: Supabase Client Factory** — `src/lib/supabase.ts:1-24`

```typescript
import { createServerClient, parseCookieHeader } from "@supabase/ssr"; // LINE 1
return createServerClient(SUPABASE_URL, SUPABASE_KEY, {  // LINE 9
  cookies: { ... }
});
```

Zwraca typ `SupabaseClient<Database>` — pełny, nieabstrahowany typ Supabase.

**Miejsce B: Middleware Auth** — `src/middleware.ts:13-19`

```typescript
const supabase = createClient(context.request.headers, context.cookies);  // LINE 13
const {
  data: { user },
} = await supabase.auth.getUser();  // LINE 18 — SUPABASE AUTH API
```

Bezpośrednie wołanie `.auth.getUser()` — konkretna metoda Supabase.

**Miejsce C: API Route — SELECT + ORDER** — `src/pages/inventory/index.astro:24-34`

```typescript
const supabase = createClient(Astro.request.headers, Astro.cookies);  // LINE 24
const { data, error: listError } =
  sortParam === "expiry"
    ? await supabase.from("products")  // LINE 29 — START SUPABASE POSTGREST
        .select("*")
        .order("expiry_date", { ascending: true, nullsFirst: false })
    : await supabase.from("products")
        .select("*")
        .order("created_at", { ascending: true });  // LINE 30 — END
```

Bezpośrednie Supabase query builder — `.from()`, `.select()`, `.order()`.

**Miejsce D: API Route — INSERT** — `src/pages/api/products/index.ts:23-31`

```typescript
const { error } = await supabase.from("products").insert({  // LINE 23
  user_id: user.id,
  name,
  quantity,
  unit,
  expiry_date: expiryDate,
  min_threshold: minThreshold,
  add_to_list: addToList,
});  // LINE 31
```

Bezpośrednie `.from().insert()` — konkretny Supabase API.

**Miejsce E: API Route — UPDATE** — `src/pages/api/products/[id].ts:55-66`

```typescript
const { error } = await supabase
  .from("products")
  .update({  // LINE 55-57
    name,
    quantity,
    unit,
    expiry_date: expiryDate,
    min_threshold: minThreshold,
    add_to_list: addToList,
  })
  .eq("id", id)
  .eq("user_id", user.id);  // LINE 66
```

Bezpośrednie `.from().update().eq()` — konkretny Supabase API.

**Miejsce F: API Route — DELETE** — `src/pages/api/products/[id].ts:91`

```typescript
const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", user.id);  // LINE 91
```

Bezpośrednie `.from().delete().eq()` — konkretny Supabase API.

**Miejsce G: Test Harness — Replikacja API** — `src/lib/test/fake-supabase.ts:41-50`

```typescript
class FakeQueryBuilder<T extends FakeRow> {
  private filters: Filter[] = [];
  private operation: "select" | "update" | "delete" = "select";  // LINE 43
  private updatePayload: Partial<T> = {};
  private single = false;

  constructor(private rows: T[]) {}

  select() {
    return this;  // LINE 49
```

Replikuje cały interfejs Supabase query builder — dowód, że kod jest zdependent na tym API.

### 3.2 Groźne przecieki i naruszenia

| Problem | Dowód | Ryzyko |
|---|---|---|
| **Typ SupabaseClient w 20+ plikach** | Każdy `.from()` call zależy od typu zwracanego przez `createClient()` | Zmiana signatury `createClient()` wymaga update w 20+ plikach |
| **Query builder w API routes** | `.select()`, `.update()`, `.delete()`, `.eq()` znane w 18 plikach | Nowy SDK = nowy query builder — każdy plik trzeba prze-pisać |
| **Duplikacja wzorców SELECT** | `inventory/index.astro:29-30` i `shopping-list/index.astro:36-40` — ten sam `.select(...).order()` czy `.select(...).eq()` | Zmiana logiki queryowania (np. dodanie indexu, zmiana filtru) wymaga zmian w wielu miejscach |
| **Duplikacja wzorców UPDATE** | `products/[id].ts:56`, `checkoff.ts:61`, `listing.ts:42` — każdy .update().eq() | Zmiana update-ów (np. dodanie timestamp'a, zmiana transakcji) wymaga zmian w 3+ plikach |
| **Test harness replikuje API** | `fake-supabase.ts:41-50` — cały QueryBuilder interface | Zmiana Supabase API wymaga update testu; jeśli zamienimy SDK, cały fake jest bezużyteczny |
| **Brak warstwy biznesowej** | API routes bezpośrednio transformują form data → supabase query | Zmiana logiki biznesowej (np. walidacja, normalizacja) jest rozproszona po API routes |

---

## KROK 4: PROJEKT ACL

Nowa warstwa: **Repository Pattern** z portami (interfejsami) i adapterami.

### Port 1: ProductRepository (abstrakacja domenowa)

```typescript
// src/domain/ports/ProductRepository.ts

export type ProductId = string & { readonly __brand: "ProductId" };
export type UserId = string & { readonly __brand: "UserId" };

/**
 * Domain port: abstraction for product persistence.
 * Implementations (Supabase, Firebase, Prisma, etc.) fulfill this contract.
 * API routes and pages depend on this port, not on SDK-specific APIs.
 */
export interface ProductRepository {
  /**
   * Find product by ID and user; fail if not owned by user.
   * @throws ProductNotFound
   * @throws UnauthorizedAccess
   */
  findById(productId: ProductId, userId: UserId): Promise<Product | null>;

  /**
   * Find all products for a user, optionally ordered.
   * @param userId owner
   * @param orderBy optional: "created_at" | "expiry_date"
   * @param direction "asc" | "desc"
   * @returns array (empty if none found, never null)
   */
  findAllByUser(
    userId: UserId,
    orderBy?: "created_at" | "expiry_date",
    direction?: "asc" | "desc"
  ): Promise<Product[]>;

  /**
   * Find products below threshold and opted into shopping list.
   * Used to derive shopping list.
   */
  findBelowThreshold(userId: UserId): Promise<Product[]>;

  /**
   * Create product. Validates quantity > 0, minThreshold > 0 in aggregate layer.
   * @throws UniqueConstraintViolation (if name+user combo exists)
   * @throws ValidationError (if types invalid)
   */
  insert(product: Product, userId: UserId): Promise<ProductId>;

  /**
   * Update product fields (name, quantity, unit, expiry_date, min_threshold, add_to_list).
   * Only owner (user_id match) can update. Enforced by repository.
   * @throws ProductNotFound
   * @throws UnauthorizedAccess
   * @throws ValidationError
   */
  update(product: Product, userId: UserId): Promise<void>;

  /**
   * Delete product. Idempotent — deleting non-existent product returns success.
   * Only owner can delete. Enforced by repository.
   * @throws UnauthorizedAccess (if not owner)
   */
  delete(productId: ProductId, userId: UserId): Promise<void>;
}

/**
 * Domain value object: Product
 */
export interface Product {
  id: ProductId;
  userId: UserId;
  name: string;
  quantity: number; // > 0, guaranteed by domain layer
  unit: string;
  minThreshold: number; // > 0, guaranteed by domain layer
  addToList: boolean;
  expiryDate: string | null; // ISO date or null
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}
```

### Port 2: ShoppingListItemRepository

```typescript
// src/domain/ports/ShoppingListItemRepository.ts

export type ShoppingListItemId = string & { readonly __brand: "ShoppingListItemId" };

export interface ShoppingListItemRepository {
  /**
   * Find all manual shopping list items for user.
   * Ordered by name.
   */
  findAllByUser(userId: UserId): Promise<ShoppingListItem[]>;

  /**
   * Create manual item (not linked to product).
   * @throws ValidationError
   */
  insert(item: ShoppingListItem, userId: UserId): Promise<ShoppingListItemId>;

  /**
   * Delete item. Idempotent.
   * Only owner can delete.
   * @throws UnauthorizedAccess
   */
  delete(itemId: ShoppingListItemId, userId: UserId): Promise<void>;
}

export interface ShoppingListItem {
  id: ShoppingListItemId;
  userId: UserId;
  name: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  createdAt: string;
}
```

### Adapter 1: SupabaseProductRepository (konkretny SDK)

```typescript
// src/infrastructure/SupabaseProductRepository.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductRepository, Product, ProductId, UserId } from "@/domain/ports";

/**
 * Adapter: Supabase implementation of ProductRepository port.
 * ONLY THIS FILE knows about @supabase/supabase-js specifics.
 * 
 * If we ever switch to Firebase / Prisma / CouchDB:
 * - API routes don't change (they use ProductRepository port)
 * - Only this file gets replaced with FirebaseProductRepository, etc.
 */
export class SupabaseProductRepository implements ProductRepository {
  constructor(private supabase: SupabaseClient) {}

  async findById(productId: ProductId, userId: UserId): Promise<Product | null> {
    // SUPABASE-SPECIFIC LOGIC HERE (and only here)
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new RepositoryError(error.message);
    if (!data) return null;

    // MAP from Supabase row to domain Product
    return this.mapToDomain(data);
  }

  async findAllByUser(
    userId: UserId,
    orderBy?: "created_at" | "expiry_date",
    direction?: "asc" | "desc"
  ): Promise<Product[]> {
    let query = this.supabase
      .from("products")
      .select("*")
      .eq("user_id", userId);

    if (orderBy) {
      query = query.order(orderBy, {
        ascending: direction === "asc",
        nullsFirst: orderBy === "expiry_date" ? false : true,
      });
    }

    const { data, error } = await query;
    if (error) throw new RepositoryError(error.message);
    return (data || []).map((row) => this.mapToDomain(row));
  }

  async findBelowThreshold(userId: UserId): Promise<Product[]> {
    // POSTGREST-SPECIFIC: use .eq() filter
    const { data, error } = await this.supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .eq("add_to_list", true)
      .lt("quantity", "min_threshold"); // Supabase: .lt() for "less than"

    if (error) throw new RepositoryError(error.message);
    return (data || []).map((row) => this.mapToDomain(row));
  }

  async insert(product: Product, userId: UserId): Promise<ProductId> {
    const { data, error } = await this.supabase
      .from("products")
      .insert([this.mapToRow(product, userId)])
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Supabase unique constraint code
        throw new UniqueConstraintViolation(`Product ${product.name} already exists`);
      }
      throw new RepositoryError(error.message);
    }

    return data.id as ProductId;
  }

  async update(product: Product, userId: UserId): Promise<void> {
    const { error } = await this.supabase
      .from("products")
      .update(this.mapToRow(product, userId))
      .eq("id", product.id)
      .eq("user_id", userId);

    if (error) throw new RepositoryError(error.message);
  }

  async delete(productId: ProductId, userId: UserId): Promise<void> {
    const { error } = await this.supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("user_id", userId);

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found (idempotent, ignore)
      throw new RepositoryError(error.message);
    }
  }

  // PRIVATE: mapping between Supabase row format and domain Product
  private mapToDomain(row: Record<string, unknown>): Product {
    return {
      id: row.id as ProductId,
      userId: row.user_id as UserId,
      name: String(row.name),
      quantity: Number(row.quantity),
      unit: String(row.unit),
      minThreshold: Number(row.min_threshold),
      addToList: Boolean(row.add_to_list),
      expiryDate: (row.expiry_date as string) || null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapToRow(product: Product, userId: UserId): Record<string, unknown> {
    return {
      id: product.id,
      user_id: userId,
      name: product.name,
      quantity: product.quantity,
      unit: product.unit,
      min_threshold: product.minThreshold,
      add_to_list: product.addToList,
      expiry_date: product.expiryDate,
      updated_at: new Date().toISOString(),
    };
  }
}
```

### Adapter 2: FakeProductRepository (dla testów)

```typescript
// src/infrastructure/FakeProductRepository.ts

import type { ProductRepository, Product, ProductId, UserId } from "@/domain/ports";

/**
 * Adapter: In-memory fake implementation for testing.
 * Replaces SupabaseProductRepository in test harness.
 * 
 * No Supabase dependency — clean slate.
 */
export class FakeProductRepository implements ProductRepository {
  private store: Map<ProductId, Product> = new Map();

  async findById(productId: ProductId, userId: UserId): Promise<Product | null> {
    const product = this.store.get(productId);
    return product && product.userId === userId ? product : null;
  }

  async findAllByUser(
    userId: UserId,
    orderBy?: "created_at" | "expiry_date",
    direction?: "asc" | "desc"
  ): Promise<Product[]> {
    let products = Array.from(this.store.values()).filter((p) => p.userId === userId);

    if (orderBy) {
      const ascending = direction !== "desc";
      products.sort((a, b) => {
        const aVal = a[orderBy];
        const bVal = b[orderBy];
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return ascending ? 1 : -1;
        if (bVal === null) return ascending ? -1 : 1;
        return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return products;
  }

  async findBelowThreshold(userId: UserId): Promise<Product[]> {
    return Array.from(this.store.values()).filter(
      (p) => p.userId === userId && p.quantity < p.minThreshold && p.addToList
    );
  }

  async insert(product: Product, userId: UserId): Promise<ProductId> {
    // Simulate unique constraint
    const exists = Array.from(this.store.values()).some(
      (p) => p.userId === userId && p.name === product.name
    );
    if (exists) throw new UniqueConstraintViolation("Product already exists");

    this.store.set(product.id, { ...product, userId });
    return product.id;
  }

  async update(product: Product, userId: UserId): Promise<void> {
    if (!this.store.has(product.id) || this.store.get(product.id)!.userId !== userId) {
      throw new Error("Not found or unauthorized");
    }
    this.store.set(product.id, { ...product, userId });
  }

  async delete(productId: ProductId, userId: UserId): Promise<void> {
    const product = this.store.get(productId);
    if (product && product.userId === userId) {
      this.store.delete(productId);
    }
    // Idempotent — silently ignore if not found
  }
}
```

---

## KROK 5: Dowód izolacji + Before/After

### 5.1 Kryterium sukcesu: Grep test

**Przed refaktorem:**
```bash
$ grep -r "@supabase" src/
src/lib/supabase.ts:1:  import { createServerClient, parseCookieHeader } from "@supabase/ssr";
src/middleware.ts:18:  const { data: { user } } = await supabase.auth.getUser();
src/pages/api/products/index.ts:23:  const { error } = await supabase.from("products").insert({...});
src/pages/api/products/[id].ts:56:  const { error } = await supabase.from("products").update({...});
src/pages/api/products/[id].ts:91:  const { error } = await supabase.from("products").delete()...;
src/pages/api/auth/signin.ts:13:  const { error } = await supabase.auth.signInWithPassword({...});
... (13 więcej w API routes, 2 w pages, 2 w testy)
```

**Po refaktorem:**
```bash
$ grep -r "@supabase" src/
src/lib/supabase.ts:1:  import { createServerClient, parseCookieHeader } from "@supabase/ssr";
src/infrastructure/SupabaseProductRepository.ts:2:  import type { SupabaseClient } from "@supabase/supabase-js";
src/infrastructure/SupabaseShoppingListItemRepository.ts:2:  import type { SupabaseClient } from "@supabase/supabase-js";
src/infrastructure/SupabaseAuthAdapter.ts:1:  import type { SupabaseClient } from "@supabase/supabase-js";

# KONIEC — tylko 4 pliki w infrastructure/ wiedzą o @supabase
```

### 5.2 Before/After dla SELECT + ORDER

**BEFORE** — `src/pages/inventory/index.astro:29-34`

```typescript
// Zależy od Supabase API
const { data, error: listError } =
  sortParam === "expiry"
    ? await supabase.from("products").select("*").order("expiry_date", { ascending: true, nullsFirst: false })
    : await supabase.from("products").select("*").order("created_at", { ascending: true });

if (listError) {
  return Astro.redirect(`/inventory?error=${encodeURIComponent(listError.message)}`);
}
products = data as Product[];
```

**AFTER** — `src/pages/inventory/index.astro:29-34` (zmienione)

```typescript
// Zależy od domain port (ProductRepository)
import type { ProductRepository } from "@/domain/ports";
import { container } from "@/infrastructure/di"; // dependency injection

const productRepo = container.get<ProductRepository>("productRepository");

try {
  products = await productRepo.findAllByUser(
    user.id as UserId,
    sortParam === "expiry" ? "expiry_date" : "created_at",
    sortParam === "expiry" ? "asc" : "asc"
  );
} catch (error) {
  return Astro.redirect(`/inventory?error=${encodeURIComponent((error as Error).message)}`);
}
```

**Zysk:** Strona nie wie o Supabase. Jeśli zamienimy SDK, ta strona nie zmienia się.

### 5.3 Before/After dla INSERT

**BEFORE** — `src/pages/api/products/index.ts:23-31`

```typescript
const { error } = await supabase.from("products").insert({
  user_id: user.id,
  name,
  quantity,
  unit,
  expiry_date: expiryDate,
  min_threshold: minThreshold,
  add_to_list: addToList,
});

if (error) {
  return context.redirect(`/inventory/new?error=${encodeURIComponent(error.message)}`);
}
```

**AFTER** — `src/pages/api/products/index.ts:23-31` (zmienione)

```typescript
import type { ProductRepository } from "@/domain/ports";
import { Product } from "@/domain/value-objects";
import { container } from "@/infrastructure/di";

const productRepo = container.get<ProductRepository>("productRepository");

try {
  // Aggregate validation happens here
  const product = Product.create({
    name, quantity, unit, minThreshold, expiryDate, addToList
  });

  // Repository persists (Supabase-specific logic encapsulated)
  await productRepo.insert(product, user.id as UserId);
  
  return context.redirect("/inventory");
} catch (error) {
  if (error instanceof ValidationError) {
    return context.redirect(`/inventory/new?error=${encodeURIComponent(error.message)}`);
  }
  throw; // Rethrow infra errors
}
```

**Zysk:** API route nie zna `.from().insert()`. Zmiana SDK zmienia tylko `SupabaseProductRepository`, nie route.

### 5.4 Before/After dla UPDATE

**BEFORE** — `src/pages/api/products/[id].ts:55-66`

```typescript
const { error } = await supabase
  .from("products")
  .update({
    name,
    quantity,
    unit,
    expiry_date: expiryDate,
    min_threshold: minThreshold,
    add_to_list: addToList,
  })
  .eq("id", id)
  .eq("user_id", user.id);

if (error) {
  return new Response(encodeURIComponent(error.message), { status: 500 });
}

return new Response(null, { status: 204 });
```

**AFTER** — `src/pages/api/products/[id].ts:55-66` (zmienione)

```typescript
try {
  const product = await productRepo.findById(id as ProductId, user.id as UserId);
  if (!product) {
    return new Response("Not found", { status: 404 });
  }

  // Aggregate method updates + validates
  product.update({ name, quantity, unit, expiryDate, minThreshold, addToList });

  // Repository persists (Supabase details hidden)
  await productRepo.update(product, user.id as UserId);

  return new Response(null, { status: 204 });
} catch (error) {
  if (error instanceof ValidationError) {
    return new Response(error.message, { status: 400 });
  }
  throw; // Rethrow infra errors
}
```

**Zysk:** Route nie zna `.update().eq()`. SDK zmienia się izolowannie w adapter.

### 5.5 Before/After dla DELETE

**BEFORE** — `src/pages/api/products/[id].ts:91`

```typescript
const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", user.id);

if (error) {
  return new Response(encodeURIComponent(error.message), { status: 500 });
}

return new Response(null, { status: 204 });
```

**AFTER** — `src/pages/api/products/[id].ts:91` (zmienione)

```typescript
try {
  await productRepo.delete(id as ProductId, user.id as UserId);
  return new Response(null, { status: 204 });
} catch (error) {
  if (error instanceof UnauthorizedAccess) {
    return new Response("Unauthorized", { status: 403 });
  }
  throw;
}
```

**Zysk:** Route nie zna `.delete().eq()`. Adapter obsługuje user isolation.

### 5.6 Zmiana SDK — How Easy Is It Now?

**Scenario:** Chcemy wymienić Supabase na Prisma (ORM).

**Przed ACL:** Zmiana 20+ plików (każdy API route, każda Astro page, test harness)

**Po ACL:**
1. Stwórz nowy adapter: `src/infrastructure/PrismaProductRepository.ts` — implementuje `ProductRepository` port
2. Zmień DI container (1 plik: `src/infrastructure/di.ts`) aby użył `PrismaProductRepository` zamiast `SupabaseProductRepository`
3. Testy: nowy `FakePrismaAdapter` lub użyj istniejący `FakeProductRepository`
4. **Zero zmian w API routes, zero zmian w pages, zero zmian w middleware** — wszystkie zależą od portu, nie od SDK

---

## KROK 6: Weryfikacja i plan

### Kryterium sukcesu

✅ **Grep po `@supabase` zwraca wyłącznie pliki w `src/infrastructure/`:**
- `src/infrastructure/SupabaseProductRepository.ts`
- `src/infrastructure/SupabaseShoppingListItemRepository.ts`
- `src/infrastructure/SupabaseAuthAdapter.ts`
- `src/lib/supabase.ts` (client factory — ostatnia bezpośrednia zależność)

❌ **Nie pojawia się w:**
- `src/pages/api/` (API routes)
- `src/pages/*.astro` (Astro pages)
- `src/middleware.ts` (auth middleware — zmienić na Auth port)
- `src/domain/` (business logic)
- Testy (oprócz FakeRepositories)

### Plan faz refaktoru

**Faza 1: Ports & Value Objects (test-first)**
- [ ] Stwórz `src/domain/ports/ProductRepository.ts` — port interface
- [ ] Stwórz `src/domain/ports/ShoppingListItemRepository.ts` — port interface
- [ ] Stwórz `src/domain/value-objects/Product.ts` — aggregate root
- [ ] Stwórz `src/domain/ports/AuthProvider.ts` — port dla auth (odseparuj `.auth.getUser()`)
- [ ] **Unit testy** — pure domain logic (nie wymaga SDK)

**Faza 2: Adapters (Supabase)**
- [ ] Stwórz `src/infrastructure/SupabaseProductRepository.ts` — adapter implementujący port
- [ ] Stwórz `src/infrastructure/SupabaseShoppingListItemRepository.ts` — adapter
- [ ] Stwórz `src/infrastructure/SupabaseAuthAdapter.ts` — adapter dla auth
- [ ] Stwórz `src/infrastructure/di.ts` — dependency injection container (register adapters)
- [ ] **Integration testy** — fake repos + mocked adapter responses

**Faza 3: API Routes (gradual per-route)**
- [ ] Refaktor `POST /api/products/index.ts` — use ProductRepository
- [ ] Refaktor `PUT /api/products/[id].ts` — use ProductRepository
- [ ] Refaktor `DELETE /api/products/[id].ts` — use ProductRepository
- [ ] Refaktor `POST /api/products/[id]/checkoff.ts` — use ProductRepository + ShoppingListItemRepository
- [ ] Refaktor `POST /api/shopping-list-items/[id]/checkoff.ts` — use both repos
- [ ] Refaktor auth routes (`signin`, `signup`, `signout`, `reset-password`) — use AuthAdapter
- [ ] **E2E testy** — każdy endpoint verifies port contract (nie SDK details)

**Faza 4: Astro Pages (server-side)**
- [ ] Refaktor `src/pages/inventory/index.astro` — use ProductRepository
- [ ] Refaktor `src/pages/shopping-list/index.astro` — use ProductRepository + ShoppingListItemRepository
- [ ] Refaktor `src/middleware.ts` — use AuthProvider port
- [ ] **Page testy** — fake repos

**Faza 5: Test Harness**
- [ ] Usuń `src/lib/test/fake-supabase.ts` (już zbędny; używamy FakeProductRepository)
- [ ] Update vitest mocks — inject fake repos via DI container
- [ ] Verify: testy przechodzą bez zmiany asercji

**Faza 6: Cleanup & Documentation**
- [ ] Usuń bezpośrednie importy `@supabase/ssr` z API routes (should only be in adapter)
- [ ] Zaktualizuj CLAUDE.md — opisz Port/Adapter pattern
- [ ] Update JSDoc — wyjaśnij, co się zmienia jeśli wymienimy SDK
- [ ] Archivize `src/lib/supabase.ts` — teraz `src/infrastructure/supabase-client-factory.ts` (private internal)

### Otwarte pytania rozstrzygnięte w ACL

**Q: Jak obsługujemy auth, jeśli Supabase `.auth` jest inny od Firebase `.auth`?**  
A: Nowy port `AuthProvider` z metodami:
```typescript
interface AuthProvider {
  getCurrentUser(): Promise<User | null>;
  signInWithPassword(email: string, password: string): Promise<{ error?: Error }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
}
```
Odseparujemy `.auth.getUser()` od `middleware.ts` — middleware wołuje port, nie SDK.

**Q: Czy DI container jest konieczny?**  
A: W MVP — nie, wystarczy export `productRepository` singleton z `di.ts`. Na skalę — tak, żeby testować z fake'ami bez build time swap'u.

**Q: Czy testy z vitest mogą use FakeRepository bez Supabase?**  
A: Tak. Fake implementuje port — testy registrują fake w DI, request idzie do fake'a zamiast do Supabase.

---

## Podsumowanie

Identyfikowałem **Supabase PostgREST API przeciek** jako najgorszy — znany w 20+ plikach, całkowicie specyficzny dla Supabase (`.from().select().update().delete().insert()`), niepokryty deklaracją wymienialności. Projekt **Repository Pattern + Port/Adapter ACL** izoluje Supabase do `src/infrastructure/` — adaptery implementują domenowe porty, API routes i pages zależą wyłącznie od portów. Rezultat: aby wymienić Supabase na Firebase/Prisma, wystarczy nowy adapter (1 plik) + update DI (1 plik); zero zmian w API routes, pages, testach. Plan refaktoru (6 faz, test-first) stopniowo migruje kod per-layer — najpierw domain + adapters, potem routes, potem pages. Po refaktorze grep `@supabase` zwraca wyłącznie 4 pliki w `infrastructure/` — dowód izolacji.

