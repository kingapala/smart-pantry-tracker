import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response("Supabase is not configured", { status: 503 });
  }

  const id = context.params.id;
  const form = await context.request.formData();
  const name = ((form.get("name") ?? "") as string).trim();
  const buy = parseFloat((form.get("buy") ?? "0") as string);
  const unit = ((form.get("unit") ?? "") as string).trim();

  if (!name || !unit || isNaN(buy) || buy <= 0) {
    return new Response("name, buy and unit are required", { status: 400 });
  }

  const selectResult = await supabase
    .from("products")
    .select("quantity")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectResult.error) {
    return new Response(selectResult.error.message, { status: 500 });
  }
  if (!selectResult.data) {
    return new Response("Product not found", { status: 404 });
  }

  const currentQuantity = Number(selectResult.data.quantity);
  const newMinThreshold = currentQuantity + buy;

  const { error } = await supabase
    .from("products")
    .update({ name, unit, min_threshold: newMinThreshold })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
