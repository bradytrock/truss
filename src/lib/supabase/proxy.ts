import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseKey,
  getSupabaseUrl,
  SB_KEY_COOKIE,
  SB_URL_COOKIE,
} from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = getSupabaseUrl() || request.cookies.get(SB_URL_COOKIE)?.value || "";
  const key = getSupabaseKey() || request.cookies.get(SB_KEY_COOKIE)?.value || "";

  if (!url || !key) {
    return NextResponse.next({ request });
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
  const path = request.nextUrl.pathname;

  if (signedIn && (path.startsWith("/login") || path.startsWith("/signup"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
