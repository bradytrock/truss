import { isPublicAppPath, isPublicCardPath } from "@/lib/auth-paths";
import { isLegalPath } from "@/lib/legal";
import { DEMO_SCHEDULE_URL, shouldForceDemo, subscriptionActiveFromRpc } from "@/lib/subscription";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseKey,
  getSupabaseUrl,
  SB_KEY_COOKIE,
  SB_URL_COOKIE,
} from "@/lib/supabase/env";
import {
  GATE_COOKIE,
  GATE_COOKIE_MAX_AGE,
  projectRefFromSupabaseUrl,
  readAuthCookieSession,
} from "@/lib/supabase/session-cookie";

function redirectToDemo() {
  return NextResponse.redirect(DEMO_SCHEDULE_URL);
}

function redirectToLogin(request: NextRequest) {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (next && next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

function isSharePath(path: string) {
  return (
    path.startsWith("/share") ||
    path.startsWith("/portal") ||
    path.startsWith("/realtor-portal") ||
    path.startsWith("/api/share") ||
    path.startsWith("/api/portal") ||
    path.startsWith("/api/realtor-portal") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/qbwc") ||
    path.startsWith("/api/voice/lookup") ||
    path.startsWith("/api/voice/intake") ||
    path.startsWith("/api/voice/book") ||
    path.startsWith("/api/voice/log") ||
    path.startsWith("/api/chat") ||
    path.startsWith("/chat/") ||
    isPublicCardPath(path)
  );
}

function rememberGate(response: NextResponse, open: boolean) {
  response.cookies.set(GATE_COOKIE, open ? "1" : "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: open ? GATE_COOKIE_MAX_AGE : 0,
  });
}

function finishSession(
  request: NextRequest,
  path: string,
  signedIn: boolean,
  subscriptionActive: boolean,
  response: NextResponse,
) {
  if (signedIn && shouldForceDemo({ signedIn, pathname: path, subscriptionActive })) {
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "This company needs an active subscription. Schedule a demo at TheRoofingCRM.com." },
        { status: 402 },
      );
    }
    return redirectToDemo();
  }

  if (signedIn && path.startsWith("/login")) {
    const next = request.nextUrl.searchParams.get("next");
    const dest = request.nextUrl.clone();
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      const parsed = new URL(next, request.nextUrl.origin);
      dest.pathname = parsed.pathname;
      dest.search = parsed.search;
    } else {
      dest.pathname = "/";
      dest.search = "";
    }
    return NextResponse.redirect(dest);
  }

  if (signedIn && path.startsWith("/signup") && !request.nextUrl.searchParams.get("invite")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  if (!signedIn && !isPublicAppPath(path)) {
    return redirectToLogin(request);
  }

  return response;
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Legal pages and homeowner links must not wait on a CRM session.
  if (isLegalPath(path) || isSharePath(path)) {
    return NextResponse.next({ request });
  }

  const url = getSupabaseUrl() || request.cookies.get(SB_URL_COOKIE)?.value || "";
  const key = getSupabaseKey() || request.cookies.get(SB_KEY_COOKIE)?.value || "";

  if (!url || !key) {
    if (isPublicAppPath(path)) return NextResponse.next({ request });
    return redirectToLogin(request);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const session = readAuthCookieSession(
    request.cookies.getAll(),
    projectRefFromSupabaseUrl(url),
    nowSec,
  );
  const gateOpen = request.cookies.get(GATE_COOKIE)?.value === "1";

  // A live access token plus a recent subscription check can skip Auth and Postgres.
  if (!session.present) {
    return finishSession(request, path, false, false, NextResponse.next({ request }));
  }
  if (session.fresh && gateOpen) {
    return finishSession(request, path, true, true, NextResponse.next({ request }));
  }

  let supabaseResponse = NextResponse.next({ request });
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
          Object.entries(headers).forEach(([header, value]) =>
            supabaseResponse.headers.set(header, value)
          );
        }
      },
    },
  });

  let signedIn = session.fresh;
  if (!session.fresh) {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  }
  const subscriptionActive = signedIn
    ? subscriptionActiveFromRpc(await supabase.rpc("company_subscription_active"))
    : false;
  rememberGate(supabaseResponse, signedIn && subscriptionActive);

  return finishSession(request, path, signedIn, subscriptionActive, supabaseResponse);
}
