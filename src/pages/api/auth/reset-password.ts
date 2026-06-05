import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string | null;

  if (!email?.trim()) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Email is required")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/reset-email-sent");
};
