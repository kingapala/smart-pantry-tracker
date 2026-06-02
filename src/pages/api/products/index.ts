import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/inventory/new?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const name = (form.get("name") ?? "") as string;
  const quantity = parseFloat((form.get("quantity") ?? "0") as string);
  const unit = (form.get("unit") ?? "") as string;
  const expiryDate = ((form.get("expiry_date") ?? "") as string) || null;
  const minThreshold = parseFloat((form.get("min_threshold") ?? "0") as string);
  const addToList = form.has("add_to_list");

  const { error } = await supabase.from("products").insert({
    user_id: user.id,
    name,
    quantity,
    unit,
    expiry_date: expiryDate,
    min_threshold: minThreshold,
    add_to_list: addToList,
  });

  if (error) {
    return context.redirect(`/inventory/new?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/inventory");
};
