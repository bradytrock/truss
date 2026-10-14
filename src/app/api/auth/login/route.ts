import { authErrorMessage } from "@/lib/auth-errors";
import { destinationAfterSignIn, originFromHeaders, safeNextPath } from "@/lib/auth-next";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import { isWelcomePendingMetadata } from "@/lib/welcome";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type PendingCookie = { name: string; value: string; options: CookieOptions };

/**
 * Password sign-in has to set the session cookie on this response.
 * The browser client used to call Supabase Auth and then router.replace,
 * which left the next request without a session and bounced back to /login.
 */
export async function POST(request: NextRequest) {
  const origin = originFromHeaders(request.headers, request.nextUrl.origin);
  const form = await request.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim();
  const password = String(form?.get("password") ?? "");
  const nextPath = safeNextPath(String(form?.get("next") ?? "/"));

  const fail = (message: string) => {
    const login = new URL("/login", origin);
    login.searchParams.set("error", message);
    if (nextPath !== "/") login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login, 303);
  };

  if (!email || !password) return fail("Enter your email and password.");

  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return fail("Sign-in is not configured on this host.");

  const pending: PendingCookie[] = [];
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pending.splice(0, pending.length, ...cookiesToSet);
        },
      },
    });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) return fail(authErrorMessage(error ?? "Could not sign in."));
    if (pending.length === 0) return fail("Could not start a session. Try again.");

    const dest = new URL(
      destinationAfterSignIn(nextPath, isWelcomePendingMetadata(data.user?.user_metadata)),
      origin,
    );
    const response = NextResponse.redirect(dest, 303);
    for (const cookie of pending) {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    return response;
  } catch (error) {
    return fail(authErrorMessage(error instanceof Error ? error.message : "Could not sign in."));
  }
}
