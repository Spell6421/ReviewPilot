"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
};

/**
 * Single auth action that signs in or signs up based on the `mode` field. We
 * keep this as one action because React's `useActionState` caches the action
 * argument on first render — passing a different function based on mode would
 * leave the form bound to whichever action was active when the page mounted,
 * causing sign-in attempts to silently run sign-up (and vice versa).
 */
export async function authAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const mode = String(formData.get("mode") ?? "signin");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();

  if (mode === "signup") {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };

    // If email confirmation is enabled in Supabase, signUp returns a user
    // without a session — surface that instead of silently redirecting.
    if (!data.session) {
      return {
        error:
          "Check your email for a confirmation link before signing in. (Or turn off email confirmation in Supabase for local dev.)",
      };
    }

    redirect("/onboarding");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/dashboard");
}
