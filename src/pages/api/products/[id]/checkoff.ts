import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { convertUnit } from "@/lib/units";

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
  const qtyUnit = ((form.get("qty_unit") ?? "") as string).trim();
  const expiryDateStr = (form.get("expiry_date") as string | null) ?? "";
  const hasAddToList = form.has("add_to_list");
  const minThresholdStr = (form.get("min_threshold") as string | null) ?? "";

  const selectResult = await supabase
    .from("products")
    .select("quantity, unit")
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
  const productUnit = String(selectResult.data.unit);

  let addedQuantity = qtyPurchased;
  if (qtyUnit && qtyUnit.toLowerCase() !== productUnit.toLowerCase()) {
    const converted = convertUnit(qtyPurchased, qtyUnit, productUnit);
    if (converted === null) {
      return new Response(`Cannot convert ${qtyUnit} to ${productUnit}`, { status: 422 });
    }
    addedQuantity = Math.round(converted * 10000) / 10000;
  }

  const newQuantity = currentQuantity + addedQuantity;
  const updatePayload: Record<string, unknown> = { quantity: newQuantity };
  if (expiryDateStr) updatePayload.expiry_date = expiryDateStr;
  if (hasAddToList) {
    updatePayload.add_to_list = true;
    if (minThresholdStr) updatePayload.min_threshold = parseFloat(minThresholdStr);
  }

  const { error: updateError } = await supabase
    .from("products")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return new Response(updateError.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
