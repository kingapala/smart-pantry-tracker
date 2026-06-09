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

  const { error } = await supabase.from("products").update({ add_to_list: false }).eq("id", id).eq("user_id", user.id);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return new Response(null, { status: 204 });
};
