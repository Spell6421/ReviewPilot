import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Reads the Supabase session and returns the auth user.
 * Use this in server components / server actions / route handlers.
 * Returns `null` if there is no signed-in user — does NOT redirect.
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Like getCurrentUser(), but redirects to /login if no user is signed in.
 * Use on protected pages where a user is required.
 */
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Loads the Business owned by the current user, plus the user itself.
 *
 * Redirect behavior:
 *   - No signed-in user → /login
 *   - Signed in but no Business row yet → /onboarding
 *
 * Every page under app/(app)/ should call this at the top.
 */
export async function requireCurrentBusiness() {
  const user = await requireCurrentUser();

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
  });

  if (!business) redirect("/onboarding");

  return { user, business };
}
