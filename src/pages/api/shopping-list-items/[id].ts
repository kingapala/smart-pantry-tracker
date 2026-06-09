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
  const quantity = parseFloat((form.get("quantity") ?? "0") as string);
  const unit = ((form.get("unit") ?? "") as string).trim();

  if (!name || !unit || isNaN(quantity) || quantity <= 0) {
    return new Response("name, quantity and unit are required", { status: 400 });
  }

  const existsResult = await supabase
    .from("shopping_list_items")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existsResult.error) {
    return new Response(existsResult.error.message, { status: 500 });
  }
  if (!existsResult.data) {
    return new Response("Item not found", { status: 404 });
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .update({ name, quantity, unit })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response("Supabase is not configured", { status: 503 });
  }

  const id = context.params.id;
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
