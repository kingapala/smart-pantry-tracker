import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// PUT and DELETE are called via fetch() from client-side components (F1 fix:
// HTML forms cannot issue PUT/DELETE). These handlers return HTTP status codes
// rather than redirects so the client can distinguish success from error.

export const PUT: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(encodeURIComponent("Supabase is not configured"), { status: 503 });
  }

  const id = context.params.id;
  if (!id) {
    return context.redirect("/inventory");
  }

  const form = await context.request.formData();
  const name = (form.get("name") ?? "") as string;
  const quantity = parseFloat((form.get("quantity") ?? "0") as string);
  const unit = (form.get("unit") ?? "") as string;
  const expiryDate = ((form.get("expiry_date") ?? "") as string) || null;
  const minThreshold = parseFloat((form.get("min_threshold") ?? "0") as string);
  const addToList = form.has("add_to_list");

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
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(encodeURIComponent("Supabase is not configured"), { status: 503 });
  }

  const id = context.params.id;
  if (!id) {
    return context.redirect("/inventory");
  }

  const { error } = await supabase.from("products").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    return new Response(encodeURIComponent(error.message), { status: 500 });
  }

  return new Response(null, { status: 204 });
};
