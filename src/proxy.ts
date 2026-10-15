import { clerkMiddleware } from "@clerk/nextjs/server";
import { claimString } from "@/lib/clerk-profile";
import { linkClerkProfile } from "@/lib/clerk-profile-link";
import { clerkConfigured } from "@/lib/clerk-env";
import { updateSession } from "@/lib/supabase/proxy";
import type { NextRequest } from "next/server";

const withClerk = clerkMiddleware(async (auth, request) => {
  const { userId, getToken, sessionClaims } = await auth();
  if (!userId) return updateSession(request, null);

  // currentUser() calls auth() through next/headers. Those headers are not
  // on the request until this proxy returns, so the call throws and every
  // signed-in page is an Internal Server Error.
  let token: string | null = null;
  try {
    token = (await getToken()) ?? null;
  } catch (error) {
    console.error(
      "[clerk] Could not read the session token.",
      error instanceof Error ? error.message : "",
    );
  }
  const claims = sessionClaims as Record<string, unknown> | null;
  const email = claimString(claims, "email") ?? claimString(claims, "email_address") ?? "";
  await linkClerkProfile(userId, email, token);
  return updateSession(request, { getToken: async () => token });
});

export async function proxy(request: NextRequest) {
  if (!clerkConfigured()) return updateSession(request);
  try {
    return await withClerk(request, {} as Parameters<typeof withClerk>[1]);
  } catch (error) {
    console.error(
      "[clerk] Sign-in check failed.",
      error instanceof Error ? error.message : "",
    );
    return updateSession(request);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
