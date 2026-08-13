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

async function callCheckoff(productId: string, fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);

  const container = await AstroContainer.create();
  return container.renderToResponse(Endpoint as unknown as EndpointComponent, {
    routeType: "endpoint",
    request: new Request(`http://localhost/api/products/${productId}/checkoff`, {
      method: "POST",
      body,
    }),
    params: { id: productId },
    // The Cloudflare adapter's global type augmentation adds a required
    // `cfContext` to App.Locals that this route never reads - cast around it.
    locals: { user: fakeUser } as unknown as App.Locals,
  });
}

describe("POST /api/products/[id]/checkoff", () => {
  it("cross-unit checkoff (kg -> g) updates the stored quantity by the correctly converted amount", async () => {
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-4", user_id: "user-1", name: "Sugar", quantity: 100, unit: "g" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);

    const response = await callCheckoff("prod-4", { qty_purchased: "0.5", qty_unit: "kg" });

    expect(response.status).toBe(204);
    expect(store.products.find((p) => p.id === "prod-4")?.quantity).toBe(600);
  });

  it("an incompatible unit pair (kg vs ml) is rejected with 422 and no write", async () => {
    const { client, store } = createFakeSupabase({
      products: [{ id: "prod-5", user_id: "user-1", name: "Oil", quantity: 100, unit: "ml" }],
    });
    vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>);

    const response = await callCheckoff("prod-5", { qty_purchased: "1", qty_unit: "kg" });

    expect(response.status).toBe(422);
    expect(await response.text()).toBe("Cannot convert kg to ml");
    expect(store.products.find((p) => p.id === "prod-5")?.quantity).toBe(100);
  });
});
