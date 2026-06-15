type FakeRow = Record<string, unknown>;

export interface FakeProduct extends FakeRow {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface FakeShoppingListItem extends FakeRow {
  id: string;
  user_id: string;
  name: string;
  unit: string;
}

export interface FakeSupabaseStore {
  products: FakeProduct[];
  shopping_list_items: FakeShoppingListItem[];
}

export interface FakeSupabaseSeed {
  products?: FakeProduct[];
  shopping_list_items?: FakeShoppingListItem[];
}

type FilterMode = "eq" | "ilike";

interface Filter {
  column: string;
  value: unknown;
  mode: FilterMode;
}

interface QueryResult {
  data: unknown;
  error: null;
}

class FakeQueryBuilder<T extends FakeRow> {
  private filters: Filter[] = [];
  private operation: "select" | "update" | "delete" = "select";
  private updatePayload: Partial<T> = {};
  private single = false;

  constructor(private rows: T[]) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value, mode: "eq" });
    return this;
  }

  ilike(column: string, value: unknown) {
    this.filters.push({ column, value, mode: "ilike" });
    return this;
  }

  update(payload: Partial<T>) {
    this.operation = "update";
    this.updatePayload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  private matches(row: T) {
    return this.filters.every(({ column, value, mode }) => {
      const rowValue = row[column];
      if (mode === "ilike") {
        return String(rowValue).toLowerCase() === String(value).toLowerCase();
      }
      return rowValue === value;
    });
  }

  private execute(): QueryResult {
    if (this.operation === "update") {
      this.rows.filter((row) => this.matches(row)).forEach((row) => Object.assign(row, this.updatePayload));
      return { data: null, error: null };
    }
    if (this.operation === "delete") {
      const remaining = this.rows.filter((row) => !this.matches(row));
      this.rows.length = 0;
      this.rows.push(...remaining);
      return { data: null, error: null };
    }
    const results = this.rows.filter((row) => this.matches(row));
    return { data: this.single ? (results[0] ?? null) : results, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: (value: QueryResult) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(seed: FakeSupabaseSeed = {}) {
  const store: FakeSupabaseStore = {
    products: seed.products ? seed.products.map((row) => ({ ...row })) : [],
    shopping_list_items: seed.shopping_list_items ? seed.shopping_list_items.map((row) => ({ ...row })) : [],
  };

  const client = {
    from(table: keyof FakeSupabaseStore) {
      if (table === "products") return new FakeQueryBuilder(store.products);
      return new FakeQueryBuilder(store.shopping_list_items);
    },
  };

  return { client, store };
}
