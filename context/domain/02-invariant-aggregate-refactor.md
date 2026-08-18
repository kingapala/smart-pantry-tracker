---
title: "Refactor Plan: Checkoff Atomicity & Quantity Integrity Aggregate"
created: 2026-08-18
type: refactor-plan
---

# Refactor Plan: Checkoff Atomicity & Quantity Integrity Aggregate

## KROK 0: Odkrycie kontekstu

**Typ projektu:** Astro 6 SSR + React 19 + Supabase (PostgREST API)  
**Architektura:** API routes (Astro) → Supabase (persystencja) + RLS  
**Logika biznesowa:** Rozproszona między API routes (`src/pages/api/`)  
**Testy:** Istnieje `vitest` + `createFakeSupabase()` test harness dla checkoff operations  
**Dostępne narzędzia:** Transakcje Supabase via `.rpc()` (PL/pgSQL functions) lub sekwencyjne queries z explicit locking

---

## KROK 1: IDENTYFIKACJA niezmienników biznesowych

### Lista wszystkich odkrytych niezmienników

| # | Niezmiennik | Definicja | Cytat źródłowy (plik:linia) | Status egzekwowania |
|---|---|---|---|---|
| **1** | **Restocking Rule** | Produkt pojawia się na liście zakupów IFF `quantity < min_threshold AND addToList = true` | PRD § Business Logic; `shopping-list/index.astro:36-40` | ✅ Solidnie (READ), ale zależy od #2 i #3 |
| **2** | **Quantity Positive Invariant** | Każdy Product w pantry ma `quantity > 0` (albo nie istnieje) | PRD § FR-004 AC; `validation.ts:19` `quantity > 0` | ⚠️ **Słabo** — POST (`products/index.ts`) nie waliduje; PUT waliduje; checkoff może output < 0 |
| **3** | **Min Threshold Positive Invariant** | `min_threshold > 0` (jeśli produkt jest na liście) | PRD § FR-004; `validation.ts:22` | ⚠️ **Słabo** — POST nie waliduje |
| **4** | **Checkoff Atomicity** | Operacja checkoff (inkrementacja quantity + delete shopping list item) musi być atomic; jeśli jedna część zawiedzie, cała operacja fail'a (no partial state) | PRD § US-01 AC; `checkoff.ts:27-71` | ❌ **Nie egzekwowany** — brak transakcji; unit conversion fail nie prevents quantity update attempt; item delete może succeed gdy update failed |
| **5** | **Unit Conversion Consistency** | Jeśli user podaje inną jednostkę w checkoff, musi być konwertowalna do jednostki produktu; else fail (nie truncate/drop) | PRD § FR-012 implicit; `checkoff.ts:45-50`, test `checkoff.test.ts:56-66` | ✅ Solidnie — convertUnit() zwraca null na incompatibility, route zwraca 422 |
| **6** | **User Data Isolation** | Każdy product/item należy do jednego user; user A nie widzi user B danych | PRD § Guardrails "Data isolation must hold unconditionally"; `checkoff.ts:30-31` `.eq("user_id", user.id)` | ✅ Solidnie (RLS + per-query filter) |
| **7** | **Manual Item Integrity** (FR-14) | ShoppingListItem.name musi być distinct od pantry produktów OR fuzzy-match intentional | PRD § FR-014 "not linked to a pantry product"; `shopping-list-items/checkoff.ts:47` ILIKE match | ❌ **Kontrowersyjne** — code robi ILIKE, which de facto links; unclear if intentional |
| **8** | **Checkoff Idempotency** (implicit) | Jeśli user submits checkoff twice (network retry), drugi attempt powinien být safe (nie double-increment quantity) | Nie wymieniony w PRD; `checkoff.ts` brak deduplication | ❌ **Nie egzekwowany** — can double-increment if retry happens before response sent |

---

## KROK 2: KLASYFIKACJA i wybór #1

### Ocena trzema osiami

| Niezmiennik | (a) Rdzeniowość | (b) Rozsmarowanie | (c) Egzekwowanie | **Wynik** |
|---|---|---|---|---|
| #1 Restocking Rule | WYSOKA (core value prop) | ŚREDNIA (2 miejsca: shopping-list.astro + validation czytania) | ✅ Solidnie | ⭐ Core, ale protected |
| **#4 Checkoff Atomicity** | **WYSOKA** (najczęstsza user operation) | **WYSOKA** (4+ warstwy: route parse + unit convert + quantity compute + DB update + delete item) | **❌ NIGDY** | **🎯 WYBÓR #1** |
| #2 Quantity Positive | WYSOKA (fundamentalne dla #1) | WYSOKA (POST/PUT/checkoff) | ⚠️ Niekompletnie | ⭐ High, aber zależy od #4 |
| #5 Unit Conversion | ŚREDNIA (convenience) | NISKA (units.ts + checkoff) | ✅ Solidnie | ⭐ Protected |
| #6 User Isolation | WYSOKA (guardrail) | ŚREDNIA (RLS + queries) | ✅ Solidnie | ⭐ Protected |
| #7 Manual Item Integrity | ŚREDNIA (supporting) | ŚREDNIA (checkoff.ts fuzzy logic) | ❌ Nieintencjonalnie broken? | ⏸️ Clarify later |
| #8 Checkoff Idempotency | ŚREDNIA (reliability) | WYSOKA (retry logic rozproszony) | ❌ Nigdy | ⏸️ Refactor #2 |

### Uzasadnienie wyboru #4

**Checkoff Atomicity** jest wyborem, bo:

1. **Rdzeniowy dla sensu produktu:** Checkoff to beat heart operacji — user każdego dnia kupuje i checkuje. Jeśli atomicity nie trzyma, lista może być niespójna ze stanem pantry, psując Restocking Rule.

2. **Rozsmarowany po warstwach:**
   - Parse wejścia (checkoff.ts:17-25)
   - SELECT product (checkoff.ts:27-39)
   - Unit conversion kalkulacja (checkoff.ts:44-51) — **może zawieźć**
   - Quantity increment (checkoff.ts:53)
   - DB UPDATE (checkoff.ts:61-65) — **asynchroniczny, może zawieźć**
   - DB DELETE item (shopping-list-items/checkoff.ts:103-107) — **separate query, race condition zone**

3. **Całkowicie nie egzekwowany:**
   - Brak `BEGIN TRANSACTION ... COMMIT` — jeśli convertUnit() zwraca null (line 47), route returns 422, ale jeśli UPDATE zawiedzie (line 61), już pominęliśmy walidację. Jeśli convertUnit() zwraca coś, ale DB update zawiedzie, client dostaje 500, ale nie wie, czy quantity zmienił się czy nie.
   - Jeśli user checkuje ShoppingListItem, a matchuje do pantry produktu, operacja robi: UPDATE product + DELETE item (w oddzielnych queries, bez lock); race condition: między UPDATE a DELETE, inny user może checkoff ten sam product, leading to double-increment.
   - Brak deduplication — retry zwracający tę samą response nie helps; client retryuje request, drugą iteracją quantity inkrementuje znowu.

---

## KROK 3: DIAGNOZA wybranego niezmiennika (#4)

### 3.1 Gdzie dziś żyje reguła (cyty plik:linia)

**Miejsce A: Checkoff Product (pantry)** — `src/pages/api/products/[id]/checkoff.ts`

```
Line 27-32: SELECT product (quantity, unit)
  .eq("id", id)
  .eq("user_id", user.id)
  .maybeSingle()

Line 45-50: Unit conversion
  const converted = convertUnit(qtyPurchased, qtyUnit, productUnit);
  if (converted === null) {
    return new Response(`Cannot convert ...`, { status: 422 });
  }
  addedQuantity = Math.round(converted * 10000) / 10000;

Line 53: Compute new quantity (NO VALIDATION HERE — can be < 0 if convertUnit output is huge)
  const newQuantity = currentQuantity + addedQuantity;

Line 61-65: UPDATE product (quantity alone, no atomicity guarantees)
  const { error: updateError } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id);
```

**Miejsce B: Checkoff ShoppingListItem** — `src/pages/api/shopping-list-items/[id]/checkoff.ts`

```
Line 27-32: SELECT shopping list item
  .from("shopping_list_items")
  .select("name, unit")
  .eq("id", id)
  .eq("user_id", user.id)
  .maybeSingle()

Line 44-49: FIND existing product by name (FUZZY MATCH — ILIKE)
  .ilike("name", name)
  .eq("user_id", user.id)
  .maybeSingle()

Line 55-84: IF existing product found:
  - Compute unit conversion
  - UPDATE product (line 76-80)
  - ELSE INSERT new product (line 86-96)

Line 103-107: DELETE shopping_list_item
  .from("shopping_list_items")
  .delete()
  .eq("id", id)
  .eq("user_id", user.id)
```

**Miejsce C: Validation** — `src/lib/validation.ts`

```
Line 18-32: validateProductInput() — checks quantity > 0, min_threshold > 0
  BUT: called only from PUT, not POST
```

**Miejsce D: POST Product (CREATE)** — `src/pages/api/products/index.ts`

```
Line 23-31: INSERT product — NO VALIDATION OF quantity > 0
  const { error } = await supabase.from("products").insert({
    user_id: user.id,
    name,
    quantity,  // <-- NOT VALIDATED
    unit,
    expiry_date: expiryDate,
    min_threshold: minThreshold,  // <-- NOT VALIDATED
    add_to_list: addToList,
  });
```

### 3.2 Analiza luk

| Luka | Opis | Ryzko | Cytat |
|---|---|---|---|
| **Brak atomic transaction** | Checkoff robi SELECT + VALIDATE + UPDATE (+ DELETE w innym endpoint) bez BEGIN/COMMIT | WYSOKA — race condition między wiele queries | `checkoff.ts:27-71` — no transaction wrapping |
| **Unit conversion failure path nie blocks quantity update** | convertUnit() zwraca null → return 422; BUT jeśli by-mistake passed through, newQuantity mogła by być nan/inf | ŚREDNIA — typ validation powinien catch, ale float arithmetic risky | `checkoff.ts:45-50` — early return on null OK, but no post-conversion validation of newQuantity |
| **newQuantity can be <= 0** | Line 53 `currentQuantity + addedQuantity` — jeśli addedQuantity jest huge (convertUnit bug?), newQuantity może wystrzelić powyżej normalnych wartości; jeśli negative, violates invariant | WYSOKA — narusza Quantity Positive Invariant (#2) | `checkoff.ts:53` — no range check |
| **POST nie waliduje quantity > 0** | insert bez validateProductInput() | WYSOKA — user może ręcznie POST z quantity=0, tworząc invalid product | `products/index.ts:23-31` — no validation |
| **Shopping List DELETE nie atomic z UPDATE** | UPDATE product w checkoff.ts succeeds, ale DELETE item (line 103-107 w innym endpoint) nie; jeśli network error, item stays in shopping_list_items, ale quantity már incremented | WYSOKA — list becomes stale | `checkoff.ts:71` vs `shopping-list-items/checkoff.ts:103` — 2 separate queries |
| **Fuzzy-match (ILIKE) in shopping-list-items checkoff** | Line 47 `.ilike("name", name)` — jeśli user ma 2 produkty "sugar" i "sugary", checkoff ShoppingListItem "Sugar" może matchnąć wrong product | ŚREDNIA — data quality risk | `shopping-list-items/checkoff.ts:47` |
| **No idempotency token/deduplication** | If client retries checkoff request due to network timeout, checkoff.ts reruns, incrementing quantity AGAIN | WYSOKIE — double-spend potential | `checkoff.ts` — no idempotency check |

---

## KROK 4: PROJEKT agregatu-strażnika

### Agregat: `RestockableProductAggregate`

**Cel:** JEDYNE miejsce, w którym zmienia się quantity produktu; gwarantuje atomowość operacji checkoff i zachowuje invarianty.

**Pola agregatu:**
```typescript
class RestockableProduct {
  id: ProductId;                        // UUID
  userId: UserId;                        // UUID (part of identity)
  name: string;
  quantity: PositiveDecimal;             // INVARIANT: > 0
  unit: KnownUnit;                       // z UNIT_MAP
  minThreshold: PositiveDecimal;         // INVARIANT: > 0
  addToList: boolean;
  expiryDate: LocalDate | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Niezmienniki egzekwowane wewnątrz agregatu:**
```
1. quantity > 0 (per Quantity Positive Invariant #2)
2. minThreshold > 0 (per Min Threshold Positive Invariant #3)
3. unit ∈ KNOWN_UNITS || can safely convert existing inventory if unit changed
4. userId jest stable (nie zmienia się w lifetime agregatu)
```

### Metody domenowe

#### 1. Checkoff (Inkrementacja + atomowość)

```typescript
// Nazwa: reprezentuje "product was added to pantry" event
class RestockableProduct {
  /**
   * Receive a purchase (checkoff). Validates unit compatibility and increments
   * quantity atomically. Throws on invalid unit conversion or negative result.
   * 
   * @param qtyPurchased Amount purchased (must be > 0)
   * @param fromUnit Unit entered by user (may differ from product.unit)
   * @param expiryDateOverride Optional override for product.expiryDate
   * @param minThresholdOverride Optional update to min_threshold (if re-stocking)
   * 
   * @throws CheckoffUnitIncompatibility — cannot convert fromUnit to product.unit
   * @throws InvalidCheckoffQuantity — qtyPurchased <= 0 or would result in invalid state
   * @throws CheckoffAtomicityViolation — (if transaction setup fails)
   * 
   * @returns void (mutates this.quantity internally)
   */
  public checkoff(
    qtyPurchased: PositiveDecimal,
    fromUnit: string,
    expiryDateOverride?: LocalDate | null,
    minThresholdOverride?: PositiveDecimal
  ): void {
    // PRE
    if (qtyPurchased <= 0) {
      throw new InvalidCheckoffQuantity(
        `qty_purchased must be > 0, got ${qtyPurchased}`
      );
    }

    // UNIT CONVERSION
    let addedQty = qtyPurchased;
    if (fromUnit.toLowerCase().trim() !== this.unit.toLowerCase().trim()) {
      const converted = convertUnit(qtyPurchased, fromUnit, this.unit);
      if (converted === null) {
        throw new CheckoffUnitIncompatibility(
          `Cannot convert ${fromUnit} to ${this.unit}`,
          { fromUnit, toUnit: this.unit, originalQty: qtyPurchased }
        );
      }
      addedQty = Math.round(converted * 10000) / 10000;
    }

    // QUANTITY UPDATE + INVARIANT CHECK
    const newQuantity = this.quantity + addedQty;
    if (newQuantity <= 0) {
      throw new QuantityMustBePositive(
        `Checkoff would result in quantity ${newQuantity}, violates invariant`,
        { currentQuantity: this.quantity, addedQuantity: addedQty }
      );
    }

    // STATE CHANGE
    this.quantity = newQuantity;
    if (expiryDateOverride !== undefined) {
      this.expiryDate = expiryDateOverride;
    }
    if (minThresholdOverride !== undefined) {
      if (minThresholdOverride <= 0) {
        throw new MinThresholdMustBePositive(
          `min_threshold must be > 0, got ${minThresholdOverride}`
        );
      }
      this.minThreshold = minThresholdOverride;
    }
    this.updatedAt = now();

    // NOTE: No DB write here. Repository handles transaction.
  }
}
```

#### 2. Create (Builder pattern with validation)

```typescript
class RestockableProduct {
  public static create(input: {
    userId: UserId;
    name: string;
    quantity: number;
    unit: string;
    minThreshold: number;
    expiryDate?: LocalDate | null;
    addToList?: boolean;
  }): RestockableProduct {
    // VALIDATION
    if (!input.userId) throw new UserIdRequired();
    if (!input.name || input.name.trim().length === 0) {
      throw new ProductNameRequired();
    }
    if (input.quantity <= 0) {
      throw new QuantityMustBePositive(
        `quantity must be > 0, got ${input.quantity}`
      );
    }
    if (input.minThreshold <= 0) {
      throw new MinThresholdMustBePositive(
        `min_threshold must be > 0, got ${input.minThreshold}`
      );
    }
    if (!isKnownUnit(input.unit)) {
      throw new UnknownUnit(
        `unit "${input.unit}" is not recognized`,
        { unit: input.unit }
      );
    }

    return new RestockableProduct({
      id: generateId(),
      userId: input.userId,
      name: input.name,
      quantity: input.quantity as PositiveDecimal,
      unit: input.unit as KnownUnit,
      minThreshold: input.minThreshold as PositiveDecimal,
      expiryDate: input.expiryDate ?? null,
      addToList: input.addToList ?? true,
      createdAt: now(),
      updatedAt: now(),
    });
  }
}
```

#### 3. Update (partial, defensive)

```typescript
class RestockableProduct {
  /**
   * Update product metadata. Quantity changes go through checkoff() only.
   * Unit change allowed only if all existing inventory can be safely
   * converted to new unit (or via explicit no-op if same).
   * 
   * @throws MinThresholdMustBePositive — if new minThreshold <= 0
   * @throws UnknownUnit — if new unit is not recognized and not same as current
   * @throws UnitConversionRisk — (future: if changing unit requires data migration)
   */
  public update(changes: {
    name?: string;
    unit?: string;
    minThreshold?: PositiveDecimal;
    expiryDate?: LocalDate | null;
    addToList?: boolean;
  }): void {
    if (changes.name !== undefined) {
      if (!changes.name || changes.name.trim().length === 0) {
        throw new ProductNameRequired();
      }
      this.name = changes.name;
    }

    if (changes.unit !== undefined) {
      const isSameUnit = changes.unit.toLowerCase().trim() === this.unit.toLowerCase().trim();
      if (!isSameUnit && !isKnownUnit(changes.unit)) {
        throw new UnknownUnit(
          `unit "${changes.unit}" is not recognized`,
          { unit: changes.unit }
        );
      }
      // TODO: future — add data migration if unit changed materially
      this.unit = changes.unit as KnownUnit;
    }

    if (changes.minThreshold !== undefined) {
      if (changes.minThreshold <= 0) {
        throw new MinThresholdMustBePositive(
          `min_threshold must be > 0, got ${changes.minThreshold}`
        );
      }
      this.minThreshold = changes.minThreshold;
    }

    if (changes.expiryDate !== undefined) {
      this.expiryDate = changes.expiryDate;
    }

    if (changes.addToList !== undefined) {
      this.addToList = changes.addToList;
    }

    this.updatedAt = now();
  }
}
```

### Repository (Atomic WRITE)

```typescript
interface RestockableProductRepository {
  /**
   * Load product + acquire database-level lock (SELECT FOR UPDATE).
   * Repository ensures no other transaction modifies this product while
   * we hold the lock.
   */
  async loadForUpdate(productId: ProductId, userId: UserId): Promise<RestockableProduct | null>;

  /**
   * Atomic checkoff: BEGIN TRANSACTION, checkoff (mutating aggregate),
   * UPDATE product row, (if manual item checkoff) DELETE shopping_list_item,
   * COMMIT or ROLLBACK on error.
   *
   * @throws CheckoffUnitIncompatibility | InvalidCheckoffQuantity | QuantityMustBePositive
   * @throws TransactionFailure — if atomicity cannot be guaranteed
   */
  async checkoffAndPersist(
    product: RestockableProduct,
    { deleteShoppingListItemId?: string }
  ): Promise<void>;

  /**
   * Create + insert in single transaction.
   * @throws ProductAlreadyExists (if name+userId already present)
   * @throws TransactionFailure
   */
  async createAndPersist(product: RestockableProduct): Promise<void>;

  /**
   * Update metadata (not quantity). Single UPDATE statement.
   * @throws ProductNotFound
   * @throws UpdateFailed
   */
  async updateMetadataAndPersist(product: RestockableProduct): Promise<void>;

  /**
   * Delete product (hard delete, no soft-delete for MVP).
   * @throws ProductNotFound
   */
  async deleteAndPersist(productId: ProductId, userId: UserId): Promise<void>;
}
```

#### Repository Implementation (Pseudocode)

```typescript
class SupabaseRestockableProductRepository implements RestockableProductRepository {
  async checkoffAndPersist(
    product: RestockableProduct,
    { deleteShoppingListItemId }: { deleteShoppingListItemId?: string }
  ): Promise<void> {
    // Use Supabase RPC call to execute atomic transaction
    const { error } = await this.supabase.rpc("checkoff_product_atomic", {
      p_product_id: product.id,
      p_user_id: product.userId,
      p_new_quantity: product.quantity,
      p_expiry_date: product.expiryDate,
      p_min_threshold: product.minThreshold,
      p_add_to_list: product.addToList,
      p_delete_item_id: deleteShoppingListItemId ?? null,
    });

    if (error) {
      if (error.code === "PRODUCT_NOT_FOUND") {
        throw new ProductNotFound(`Product ${product.id} not found`, { productId: product.id });
      }
      if (error.code === "CONCURRENCY_CONFLICT") {
        throw new TransactionFailure("Concurrent checkoff detected; retry", { code: "RETRY" });
      }
      throw new TransactionFailure(error.message, { originalError: error });
    }
  }
}
```

#### PL/pgSQL Function (Atomic checkoff)

```sql
CREATE OR REPLACE FUNCTION checkoff_product_atomic(
  p_product_id UUID,
  p_user_id UUID,
  p_new_quantity DECIMAL,
  p_expiry_date DATE,
  p_min_threshold DECIMAL,
  p_add_to_list BOOLEAN,
  p_delete_item_id UUID
)
RETURNS void AS $$
BEGIN
  -- Acquire lock on product row
  PERFORM 1 FROM products 
    WHERE id = p_product_id AND user_id = p_user_id
    FOR UPDATE;

  -- Check product exists (lock acquires, so no race)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0001';
  END IF;

  -- Update product (inside locked transaction)
  UPDATE products SET
    quantity = p_new_quantity,
    expiry_date = COALESCE(p_expiry_date, expiry_date),
    min_threshold = p_min_threshold,
    add_to_list = p_add_to_list,
    updated_at = NOW()
  WHERE id = p_product_id AND user_id = p_user_id;

  -- Delete shopping list item if specified (same transaction)
  IF p_delete_item_id IS NOT NULL THEN
    DELETE FROM shopping_list_items 
      WHERE id = p_delete_item_id AND user_id = p_user_id;
  END IF;

  -- If we reach here, all succeeded atomically
  COMMIT; -- implicit in PostgreSQL function
END;
$$ LANGUAGE plpgsql;
```

---

## KROK 5: Before/After, Plan, Testy

### 5.1 Before/After dla każdego miejsca reguły

#### Before: POST Product (`products/index.ts`)

```typescript
// BEFORE
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const name = (form.get("name") ?? "") as string;
  const quantity = parseFloat((form.get("quantity") ?? "0") as string);
  const minThreshold = parseFloat((form.get("min_threshold") ?? "0") as string);
  
  // NO VALIDATION
  const { error } = await supabase.from("products").insert({
    user_id: user.id,
    name, quantity, minThreshold, ...
  });
  
  // If insert fails, user doesn't know why
  if (error) {
    return context.redirect(`/inventory/new?error=...`);
  }
  return context.redirect("/inventory");
};
```

#### After: POST Product (z agregatem)

```typescript
// AFTER
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const name = (form.get("name") ?? "") as string;
  const quantity = parseFloat((form.get("quantity") ?? "0") as string);
  const minThreshold = parseFloat((form.get("min_threshold") ?? "0") as string);
  
  try {
    // Aggregate validates before any DB call
    const product = RestockableProduct.create({
      userId: user.id,
      name, quantity, minThreshold,
      ...
    });
    
    // Repository persists atomically
    await productRepository.createAndPersist(product);
    return context.redirect("/inventory");
  } catch (e) {
    if (e instanceof ProductDomainError) {
      // Named error — user gets specific reason
      return context.redirect(`/inventory/new?error=${encodeURIComponent(e.message)}`);
    }
    throw; // Re-throw infra errors
  }
};
```

#### Before: Checkoff Product (`products/[id]/checkoff.ts`)

```typescript
// BEFORE
export const POST: APIRoute = async (context) => {
  const qtyPurchased = parseFloat(form.get("qty_purchased") as string);
  const qtyUnit = (form.get("qty_unit") ?? "") as string;
  
  const { data } = await supabase.from("products").select(...).maybeSingle();
  const currentQuantity = Number(data.quantity);
  const productUnit = String(data.unit);
  
  // Unit conversion CAN FAIL
  let addedQuantity = qtyPurchased;
  if (qtyUnit && qtyUnit !== productUnit) {
    const converted = convertUnit(qtyPurchased, qtyUnit, productUnit);
    if (converted === null) {
      return new Response(`Cannot convert ...`, { status: 422 });
    }
    addedQuantity = Math.round(converted * 10000) / 10000;
  }
  
  // RACE CONDITION: between compute and update
  const newQuantity = currentQuantity + addedQuantity;
  
  // UPDATE without check (can be < 0 or huge)
  const { error } = await supabase.from("products").update({ quantity: newQuantity })...;
  if (error) {
    return new Response(error.message, { status: 500 });
  }
  
  // PARTIAL STATE: if shopping list delete fails, item stays in list
  return new Response(null, { status: 204 });
};
```

#### After: Checkoff Product (z agregatem + atomic transaction)

```typescript
// AFTER
export const POST: APIRoute = async (context) => {
  const qtyPurchased = parseFloat(form.get("qty_purchased") as string);
  const qtyUnit = (form.get("qty_unit") ?? "") as string;
  
  try {
    // Load product + acquire lock
    const product = await productRepository.loadForUpdate(productId, user.id);
    if (!product) {
      return new Response("Product not found", { status: 404 });
    }
    
    // Aggregate performs ALL validation + state mutation
    product.checkoff(qtyPurchased, qtyUnit, expiryDateStr, minThresholdStr);
    
    // Repository writes atomically (or fails completely)
    await productRepository.checkoffAndPersist(product);
    
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof CheckoffUnitIncompatibility) {
      return new Response(e.message, { status: 422 });
    }
    if (e instanceof InvalidCheckoffQuantity || e instanceof QuantityMustBePositive) {
      return new Response(e.message, { status: 400 });
    }
    if (e instanceof TransactionFailure && e.isRetryable()) {
      return new Response("Concurrent update; please retry", { status: 409 });
    }
    throw; // Infra error
  }
};
```

#### Before: Checkoff ShoppingListItem (`shopping-list-items/[id]/checkoff.ts`)

```typescript
// BEFORE
export const POST: APIRoute = async (context) => {
  const { data: item } = await supabase.from("shopping_list_items").select(...).maybeSingle();
  
  // FUZZY MATCH can find wrong product
  const { data: existingProduct } = await supabase.from("products")
    .select(...)
    .ilike("name", item.name)  // <-- ILIKE risk
    .eq("user_id", user.id)
    .maybeSingle();
  
  if (existingProduct) {
    // Update and increment
    await supabase.from("products").update({ quantity: ... }).eq("id", existingProduct.id)...;
  } else {
    // Create new product
    await supabase.from("products").insert({ ... });
  }
  
  // DELETE happens AFTER update (no transaction)
  const { error } = await supabase.from("shopping_list_items").delete()
    .eq("id", itemId)...;
  
  if (error) {
    return new Response(error.message, { status: 500 });
  }
  
  return new Response(null, { status: 204 });
};
```

#### After: Checkoff ShoppingListItem (z agregatem + explicit matching)

```typescript
// AFTER
export const POST: APIRoute = async (context) => {
  try {
    const { data: item } = await supabase.from("shopping_list_items")
      .select(...)
      .eq("id", itemId)
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (!item) {
      return new Response("Item not found", { status: 404 });
    }
    
    // DECISION: Use explicit exact match (case-insensitive) instead of ILIKE
    // This clarifies intent: manual items must match existing product name exactly
    // (or not at all, creating new product)
    const matchedProduct = await productRepository.findByNameExact(item.name, user.id);
    
    if (matchedProduct) {
      // Load product, checkoff, persist atomically
      matchedProduct.checkoff(qtyPurchased, qtyUnit, expiryDateStr, minThresholdStr);
      await productRepository.checkoffAndPersist(matchedProduct, { 
        deleteShoppingListItemId: itemId 
      });
    } else {
      // Create new product + delete item atomically
      const newProduct = RestockableProduct.create({
        userId: user.id,
        name: item.name,
        quantity: qtyPurchased,
        unit: qtyUnit || item.unit,
        minThreshold: 0, // or parse from form
        addToList: addToList,
      });
      await productRepository.createAndPersistWithDeleteItem(newProduct, itemId);
    }
    
    return new Response(null, { status: 204 });
  } catch (e) {
    // ... error handling
  }
};
```

#### Before: PUT Product (`products/[id].ts`)

```typescript
// BEFORE
export const PUT: APIRoute = async (context) => {
  const quantity = parseFloat(form.get("quantity") as string);
  const minThreshold = parseFloat(form.get("min_threshold") as string);
  
  // Walidates quantity > 0 i min_threshold > 0
  const validation = validateProductInput({
    quantity, minThreshold, unit, currentUnit
  });
  if (!validation.ok) {
    return new Response(validation.message, { status: validation.status });
  }
  
  // Update
  const { error } = await supabase.from("products").update({
    quantity, minThreshold, ...
  }).eq("id", id).eq("user_id", user.id);
  
  return new Response(null, { status: 204 });
};
```

#### After: PUT Product (z agregatem)

```typescript
// AFTER
export const PUT: APIRoute = async (context) => {
  try {
    // Load current product
    const product = await productRepository.load(productId, user.id);
    if (!product) {
      return new Response("Product not found", { status: 404 });
    }
    
    // Update via aggregate method (validates)
    product.update({
      quantity: parseFloat(form.get("quantity") as string),
      minThreshold: parseFloat(form.get("min_threshold") as string),
      unit: form.get("unit") as string,
      expiryDate: form.get("expiry_date") as string | null,
      addToList: form.has("add_to_list"),
    });
    
    // Persist
    await productRepository.updateMetadataAndPersist(product);
    
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof ProductDomainError) {
      return new Response(e.message, { status: 400 });
    }
    throw;
  }
};
```

---

### 5.2 Plan faz refaktoru

**Faza 1: Domain Layer (Test-First)**
- [ ] Skompiluj `RestockableProduct` agregat (klasa TypeScript)
- [ ] Implementuj `create()`, `checkoff()`, `update()` metody z preconditions
- [ ] Zdefiniuj named domain errors (`CheckoffUnitIncompatibility`, itp.)
- [ ] **Unit tests dla agregatu** (per niezmiennik: Quantity Positive, Unit Conversion, Min Threshold)

**Faza 2: Repository & Persistence**
- [ ] Zdefiniuj `RestockableProductRepository` interface
- [ ] Implementuj `SupabaseRestockableProductRepository` (non-atomic version first)
- [ ] Stwórz PL/pgSQL function `checkoff_product_atomic()` + `create_product_atomic()`
- [ ] **Integration tests** — fake repo + real Supabase queries (vitest + `createFakeSupabase()`)

**Faza 3: API Routes (Gradual Adoption)**
- [ ] Refaktor POST `/api/products/index.ts` — use `RestockableProduct.create()` + repository
- [ ] Refaktor PUT `/api/products/[id].ts` — use `product.update()` + repository
- [ ] Refaktor POST `/api/products/[id]/checkoff.ts` — use `product.checkoff()` + atomic repository
- [ ] **E2E tests** — existing vitest harness (`checkoff.test.ts`) updated to verify atomicity (e.g., "checkoff fails on conversion error leaves DB untouched")

**Faza 4: Shopping List Items Checkoff**
- [ ] Refaktor POST `/api/shopping-list-items/[id]/checkoff.ts` — use atomic checkoff + decide exact-match vs fuzzy-match policy
- [ ] Create `checkoffShoppingListItem()` helper (can call product checkoff + delete)
- [ ] **Decision needed:** ILIKE fuzzy-match is intentional feature or bug? Document.

**Faza 5: Cleanup & Documentation**
- [ ] Usuń `validateProductInput()` (subsumed by aggregate)
- [ ] Update CLAUDE.md z opisem RestockableProduct aggregate
- [ ] Add JSDoc do metod agregatu (error codes, preconditions)

---

### 5.3 Test cases dla niezmiennika #4 (Checkoff Atomicity)

**Test Set 1: Checkoff Quantity Integrity**

```typescript
describe("RestockableProduct.checkoff()", () => {
  it("increments quantity by exact amount when unit matches", () => {
    const prod = RestockableProduct.create({
      userId: "u1", name: "Sugar", quantity: 100, unit: "g", minThreshold: 10
    });
    
    prod.checkoff(50, "g");
    
    expect(prod.quantity).toBe(150);
    expect(prod.updatedAt).toBeGreaterThan(originalTime);
  });

  it("increments quantity by converted amount when unit differs", () => {
    const prod = RestockableProduct.create({
      userId: "u1", name: "Sugar", quantity: 100, unit: "g", minThreshold: 10
    });
    
    prod.checkoff(0.5, "kg");
    
    expect(prod.quantity).toBe(600); // 100 + 500
  });

  it("throws CheckoffUnitIncompatibility when units cannot convert", () => {
    const prod = RestockableProduct.create({
      userId: "u1", name: "Oil", quantity: 100, unit: "ml", minThreshold: 10
    });
    
    expect(() => prod.checkoff(1, "kg")).toThrow(CheckoffUnitIncompatibility);
    expect(prod.quantity).toBe(100); // unchanged
  });

  it("throws InvalidCheckoffQuantity when qtyPurchased <= 0", () => {
    const prod = RestockableProduct.create({...});
    
    expect(() => prod.checkoff(0, "g")).toThrow(InvalidCheckoffQuantity);
    expect(() => prod.checkoff(-5, "g")).toThrow(InvalidCheckoffQuantity);
  });

  it("throws QuantityMustBePositive if checkoff would result in quantity <= 0 (edge: huge conversion)", () => {
    const prod = RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 0.001, unit: "g", minThreshold: 0.001
    });
    
    // Hypothetical: if convertUnit somehow returned negative (shouldn't happen)
    // then result would be invalid. Domain layer catches this.
    // (In practice, convertUnit is pure math, but we're defensive.)
    
    // Real scenario: user tries to checkoff into negative state (should not happen
    // if UI validates, but aggregate catches it):
    // assume somehow user bypasses validation and posts negative added quantity
    expect(() => prod.checkoff(-200, "g")).toThrow(InvalidCheckoffQuantity);
  });

  it("allows optionally overriding expiryDate during checkoff", () => {
    const prod = RestockableProduct.create({
      userId: "u1", name: "Milk", quantity: 2, unit: "l", minThreshold: 1,
      expiryDate: "2026-08-25"
    });
    
    prod.checkoff(1, "l", "2026-09-01");
    
    expect(prod.quantity).toBe(3);
    expect(prod.expiryDate).toBe("2026-09-01");
  });
});
```

**Test Set 2: Checkoff Atomicity in Repository**

```typescript
describe("checkoffAndPersist() atomicity", () => {
  it("updates product quantity and deletes shopping list item in single transaction", async () => {
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Sugar", quantity: 100, unit: "g" }],
      shopping_list_items: [{ id: "item-1", user_id: "user-1", name: "Sugar" }],
    });
    const repo = new SupabaseRestockableProductRepository(client);
    
    const prod = await repo.loadForUpdate("prod-1", "user-1");
    prod.checkoff(50, "g");
    await repo.checkoffAndPersist(prod, { deleteShoppingListItemId: "item-1" });
    
    expect(store.products[0].quantity).toBe(150);
    expect(store.shopping_list_items).toHaveLength(0);
  });

  it("rolls back both updates if unit conversion fails after SELECT (simulate convertUnit returning null)", async () => {
    // This test ensures that if convertUnit() fails INSIDE checkoff(),
    // the throw is caught and no DB writes happen.
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Oil", quantity: 100, unit: "ml" }],
      shopping_list_items: [{ id: "item-1", user_id: "user-1", name: "Oil" }],
    });
    const repo = new SupabaseRestockableProductRepository(client);
    
    const prod = await repo.loadForUpdate("prod-1", "user-1");
    
    expect(() => prod.checkoff(1, "kg")).toThrow(CheckoffUnitIncompatibility);
    // repo.checkoffAndPersist() is never called because exception is thrown
    
    // Verify DB was not touched
    expect(store.products[0].quantity).toBe(100);
    expect(store.shopping_list_items).toHaveLength(1);
  });

  it("retries on CONCURRENCY_CONFLICT (simulate concurrent checkoff)", async () => {
    // Simulate two users checkoff'ing the same product concurrently
    const { client } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Sugar", quantity: 100, unit: "g" }],
    });
    
    const prod1 = await repo.loadForUpdate("prod-1", "user-1");
    const prod2 = await repo.loadForUpdate("prod-1", "user-1"); // second lock fails
    
    prod1.checkoff(50, "g");
    await repo.checkoffAndPersist(prod1);
    
    // Second checkoff should detect concurrency
    prod2.checkoff(30, "g");
    expect(() => repo.checkoffAndPersist(prod2)).toThrow(TransactionFailure);
    expect(store.products[0].quantity).toBe(150); // Only first one applied
  });
});
```

**Test Set 3: Creation Validation**

```typescript
describe("RestockableProduct.create()", () => {
  it("throws QuantityMustBePositive if quantity <= 0", () => {
    expect(() => RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 0, unit: "g", minThreshold: 1
    })).toThrow(QuantityMustBePositive);
    
    expect(() => RestockableProduct.create({
      userId: "u1", name: "Item", quantity: -5, unit: "g", minThreshold: 1
    })).toThrow(QuantityMustBePositive);
  });

  it("throws MinThresholdMustBePositive if minThreshold <= 0", () => {
    expect(() => RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 100, unit: "g", minThreshold: 0
    })).toThrow(MinThresholdMustBePositive);
  });

  it("throws UnknownUnit if unit is not recognized", () => {
    expect(() => RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 100, unit: "xyz", minThreshold: 1
    })).toThrow(UnknownUnit);
  });

  it("accepts known unit variants (plural, abbreviated)", () => {
    const prod1 = RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 100, unit: "grams", minThreshold: 1
    });
    expect(prod1.unit).toBe("grams");
    
    const prod2 = RestockableProduct.create({
      userId: "u1", name: "Item", quantity: 1, unit: "kg", minThreshold: 0.1
    });
    expect(prod2.unit).toBe("kg");
  });
});
```

**Test Set 4: E2E Atomicity (via API route)**

```typescript
describe("POST /api/products/[id]/checkoff — atomicity", () => {
  it("on unit conversion failure, no DB changes occur", async () => {
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Oil", quantity: 100, unit: "ml" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);
    
    const response = await callCheckoff("prod-1", { qty_purchased: "1", qty_unit: "kg" });
    
    expect(response.status).toBe(422);
    expect(store.products[0].quantity).toBe(100); // unchanged
  });

  it("on positive checkoff, shopping list item is deleted atomically", async () => {
    // (requires refactored endpoint that calls repository.checkoffAndPersist with deleteShoppingListItemId)
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Sugar", quantity: 100, unit: "g" }],
      shopping_list_items: [{ id: "item-1", user_id: "user-1", name: "Sugar", unit: "g" }],
    });
    
    const response = await callCheckoff("prod-1", { 
      qty_purchased: "50", 
      shopping_list_item_id: "item-1"
    });
    
    expect(response.status).toBe(204);
    expect(store.products[0].quantity).toBe(150);
    expect(store.shopping_list_items).toHaveLength(0);
  });
});
```

---

### 5.4 Nazwy ścieżek / Kontrakty do zaregistrowania

Jeśli projekt prowadzi rejestr (wewnętrzne API, event stream, itp.):

| Kategoria | Stara nazwa / ścieżka | Nowa nazwa / ścieżka | Powód | Status |
|---|---|---|---|---|
| Domain Error | N/A (was inline string) | `CheckoffUnitIncompatibility` | Named exception, better error handling | NEW |
| Domain Error | N/A | `InvalidCheckoffQuantity` | qty <= 0 | NEW |
| Domain Error | N/A | `QuantityMustBePositive` | qty result < 0 | NEW |
| Domain Error | N/A | `MinThresholdMustBePositive` | threshold <= 0 | NEW |
| Domain Error | N/A | `ProductDomainError` (parent) | Base class for all domain errors | NEW |
| Aggregate | `products` table row | `RestockableProduct` aggregate | Encapsulates invariants | NEW |
| Repository | Inline Supabase queries | `RestockableProductRepository` interface + `SupabaseRestockableProductRepository` impl | Centralized persistence + transactions | NEW |
| PL/pgSQL | N/A | `checkoff_product_atomic()` RPC function | Atomic checkoff | NEW |
| API Route | `POST /api/products/[id]/checkoff` | (same, refactored to use aggregate) | Internal refactor, external contract unchanged | MODIFIED |
| API Route | `POST /api/shopping-list-items/[id]/checkoff` | (same, refactored + decision on fuzzy-match) | Internal refactor | MODIFIED |
| Validation | `validateProductInput()` function | (deprecated, logic moves to `RestockableProduct.update()`) | Consolidation | REMOVED |

---

## Podsumowanie

Odkryłem i wybrałem **Checkoff Atomicity** (#4) jako największy niezmiennik do refaktoru — jest rdzeniowy (najczęstsza operacja), rozprosny (4+ warstwy logiki), i całkowicie nie egzekwowany (brak transakcji, race conditions między SELECT/UPDATE/DELETE). Projekt agregatu **RestockableProduct** wyjaśnia, jak przenieść egzekwowanie z UI i API routes do centralizowanego miejsca (agregat + repository), gwarantującego fail-fast na nielegalne operacje (unit incompatibility, negative quantity) oraz atomowość persystencji via Supabase RPC + PL/pgSQL transaction. Plan refaktoru robi to stopniowo (domain layer → repo → API routes), z comprehensive test harness (vitest) odwołującą się do istniejącego `createFakeSupabase()` i nowych E2E testów dla atomicity. Named domain errors (`CheckoffUnitIncompatibility`, `QuantityMustBePositive`, itp.) zamiast ciągów błędów dają klientowi (API route) możliwość mappingu na konkretne HTTP status codes.

