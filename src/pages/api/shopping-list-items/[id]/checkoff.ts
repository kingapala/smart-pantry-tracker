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
  if (isNaN(qtyPurchased) || qtyPurchased <= 0) {
    return new Response("qty_purchased must be > 0", { status: 400 });
  }
  const qtyUnit = ((form.get("qty_unit") ?? "") as string).trim();
  const expiryDateStr = (form.get("expiry_date") as string | null) ?? "";
  const addToList = form.has("add_to_list");
  const minThresholdStr = (form.get("min_threshold") as string | null) ?? "";

  const itemResult = await supabase
    .from("shopping_list_items")
    .select("name, unit")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (itemResult.error) {
    return new Response(itemResult.error.message, { status: 500 });
  }
  if (!itemResult.data) {
    return new Response("Item not found", { status: 404 });
  }

  const name = String(itemResult.data.name);
  const enteredUnit = qtyUnit || String(itemResult.data.unit);

  const existingResult = await supabase
    .from("products")
    .select("id, quantity, unit")
    .ilike("name", name)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingResult.error) {
    return new Response(existingResult.error.message, { status: 500 });
  }

  if (existingResult.data) {
    const existingId = String(existingResult.data.id);
    const productUnit = String(existingResult.data.unit);

    let addedQuantity = qtyPurchased;
    if (enteredUnit.toLowerCase() !== productUnit.toLowerCase()) {
      const converted = convertUnit(qtyPurchased, enteredUnit, productUnit);
      if (converted === null) {
        return new Response(`Cannot convert ${enteredUnit} to ${productUnit}`, { status: 422 });
      }
      addedQuantity = Math.round(converted * 10000) / 10000;
    }

    const newQuantity = Number(existingResult.data.quantity) + addedQuantity;
    const updatePayload: Record<string, unknown> = { quantity: newQuantity };
    if (expiryDateStr) updatePayload.expiry_date = expiryDateStr;
    if (addToList) {
      updatePayload.add_to_list = true;
      if (minThresholdStr) updatePayload.min_threshold = parseFloat(minThresholdStr);
    }

    const { error: updateError } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", existingId)
      .eq("user_id", user.id);

    if (updateError) {
      return new Response(updateError.message, { status: 500 });
    }
  } else {
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      name,
      quantity: qtyPurchased,
      unit: enteredUnit,
      expiry_date: expiryDateStr || null,
      add_to_list: addToList,
      min_threshold: minThresholdStr ? parseFloat(minThresholdStr) : 0,
    };

    const { error: insertError } = await supabase.from("products").insert(insertPayload);

    if (insertError) {
      return new Response(insertError.message, { status: 500 });
    }
  }

  const { error: deleteError } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteError) {
    return new Response(deleteError.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
