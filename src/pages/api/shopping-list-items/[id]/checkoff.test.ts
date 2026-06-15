import { describe, expect, it, vi } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { nowUTC } from "@/lib/date";
import { createFakeSupabase } from "@/lib/test/fake-supabase";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase";
import * as Endpoint from "./checkoff";

const fakeUser = {
  id: "user-1",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: nowUTC(),
};

// The Container API's types model `renderToResponse`'s first argument as an
// Astro component factory, but for `routeType: "endpoint"` it expects the
// endpoint module's exports (GET/POST/etc.) directly - hence the cast below.
type ContainerInstance = Awaited<ReturnType<typeof AstroContainer.create>>;
type EndpointComponent = Parameters<ContainerInstance["renderToResponse"]>[0];

async function callCheckoff(itemId: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const container = await AstroContainer.create();
  return container.renderToResponse(Endpoint as unknown as EndpointComponent, {
    routeType: "endpoint",
    request: new Request(`http://localhost/api/shopping-list-items/${itemId}/checkoff`, {
      method: "POST",
      body,
    }),
    params: { id: itemId },
    // The Cloudflare adapter's global type augmentation adds a required
    // `cfContext` to App.Locals that this route never reads - cast around it.
    locals: { user: fakeUser } as unknown as App.Locals,
  });
}

describe("POST /api/shopping-list-items/[id]/checkoff", () => {
  it("same-unit checkoff updates the stored quantity by the exact amount", async () => {
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-1", user_id: "user-1", name: "Flour", quantity: 100, unit: "g" }],
      shopping_list_items: [{ id: "sli-1", user_id: "user-1", name: "Flour", unit: "g" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);

    const response = await callCheckoff("sli-1", { qty_purchased: "200" });

    expect(response.status).toBe(204);
    expect(store.products.find((p) => p.id === "prod-1")?.quantity).toBe(300);
    expect(store.shopping_list_items).toHaveLength(0);
  });

  it("cross-unit checkoff (kg -> g) updates the stored quantity by the correctly converted amount", async () => {
    const { client, store } = createFakeSupabase({
      shopping_list_items: [{ id: "sli-2", user_id: "user-1", name: "Sugar", unit: "kg" }],
      products: [{ id: "prod-2", user_id: "user-1", name: "Sugar", quantity: 100, unit: "g" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);

    const response = await callCheckoff("sli-2", { qty_purchased: "0.5" });

    expect(response.status).toBe(204);
    expect(store.products.find((p) => p.id === "prod-2")?.quantity).toBe(600);
    expect(store.shopping_list_items).toHaveLength(0);
  });

  it("an incompatible unit pair (kg vs ml) is rejected with 422 and no write", async () => {
    const { client, store } = createFakeSupabase({
      shopping_list_items: [{ id: "sli-3", user_id: "user-1", name: "Oil", unit: "kg" }],
      products: [{ id: "prod-3", user_id: "user-1", name: "Oil", quantity: 100, unit: "ml" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);

    const response = await callCheckoff("sli-3", { qty_purchased: "1" });

    expect(response.status).toBe(422);
    expect(await response.text()).toBe("Cannot convert kg to ml");
    expect(store.products.find((p) => p.id === "prod-3")?.quantity).toBe(100);
    expect(store.shopping_list_items).toHaveLength(1);
  });
});
