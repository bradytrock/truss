import { clerkMiddleware, currentUser } from "@clerk/nextjs/server";
import { linkClerkProfile } from "@/lib/clerk-profile-link";
import { clerkConfigured } from "@/lib/clerk-env";
import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

const withClerk = clerkMiddleware(async (auth, request) => {
  const { userId, getToken } = await auth();
  if (userId) {
    const person = await currentUser();
    const email = person?.primaryEmailAddress?.emailAddress ?? "";
    if (email) await linkClerkProfile(userId, email);
  }
  return updateSession(request, userId ? { getToken } : null);
});

export async function proxy(request: NextRequest) {
  if (!clerkConfigured()) return updateSession(request);
  return withClerk(request, {} as Parameters<typeof withClerk>[1]);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
