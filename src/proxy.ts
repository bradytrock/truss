import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkConfigured } from "@/lib/clerk-env";
import { railwayDatabaseActive, TRUSS_DB_COOKIE } from "@/lib/railway-rest";
import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

const withClerk = clerkMiddleware(async (_auth, request) => updateSession(request));

function stampRailwayDatabase(response: Response) {
  if (!railwayDatabaseActive()) return response;
  if (!(response instanceof NextResponse)) return response;
  response.cookies.set(TRUSS_DB_COOKIE, "railway", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function proxy(request: NextRequest) {
  const response = clerkConfigured()
    ? await withClerk(request, {} as Parameters<typeof withClerk>[1])
    : await updateSession(request);
  return stampRailwayDatabase(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
