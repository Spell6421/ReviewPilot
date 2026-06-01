"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components ("use client").
 * Safe to call repeatedly — supabase-js dedupes under the hood.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
