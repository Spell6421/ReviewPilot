import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that require the user to be signed in. Hitting any of these while
 * logged out bounces to /login. The "has a Business yet?" check lives in
 * lib/current-business.ts because Prisma can't run in Edge middleware.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/missed-leads",
  "/messages",
  "/settings",
  "/billing",
  "/onboarding",
];

/**
 * Routes that should bounce a signed-in user away (no point seeing /login
 * when you're already authed).
 */
const AUTH_ONLY_FOR_GUESTS = ["/login"];

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

/**
 * Refreshes the Supabase auth cookie and enforces the route guard.
 * Called from the root middleware.ts on every (non-static) request.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: don't insert logic between createServerClient() and getUser().
  // getUser() refreshes the token cookie if it expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Logged-out user trying to hit a protected page -> /login.
  if (!user && startsWithAny(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged-in user landing on /login -> /dashboard.
  // (If they don't have a Business yet, /dashboard will bounce them to /onboarding.)
  if (user && startsWithAny(pathname, AUTH_ONLY_FOR_GUESTS)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
