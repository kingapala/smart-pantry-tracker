import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
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
  const qtyPurchased = parseFloat((form.get("qty_purchased") ?? "0") as string);

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
  const newQuantity = currentQuantity + qtyPurchased;

  const { error: updateError } = await supabase
    .from("products")
    .update({ quantity: newQuantity })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return new Response(updateError.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
