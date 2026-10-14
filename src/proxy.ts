import { clerkMiddleware } from "@clerk/nextjs/server";
import { clerkConfigured } from "@/lib/clerk-env";
import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

const withClerk = clerkMiddleware(async (_auth, request) => updateSession(request));

export async function proxy(request: NextRequest) {
  if (!clerkConfigured()) return updateSession(request);
  return withClerk(request, {} as Parameters<typeof withClerk>[1]);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
