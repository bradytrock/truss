import { isPublicAppPath } from "@/lib/auth-paths";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseKey,
  getSupabaseUrl,
  SB_KEY_COOKIE,
  SB_URL_COOKIE,
} from "@/lib/supabase/env";

function redirectToLogin(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = getSupabaseUrl() || request.cookies.get(SB_URL_COOKIE)?.value || "";
  const key = getSupabaseKey() || request.cookies.get(SB_KEY_COOKIE)?.value || "";
  const path = request.nextUrl.pathname;

  if (!url || !key) {
    if (isPublicAppPath(path)) return NextResponse.next({ request });
    return redirectToLogin(request);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        if (headers) {
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  if (signedIn && (path.startsWith("/login") || path.startsWith("/signup"))) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  if (!signedIn && !isPublicAppPath(path)) {
    return redirectToLogin(request);
  }

  return supabaseResponse;
}
