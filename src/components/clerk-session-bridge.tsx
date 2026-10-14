"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { publishClerkBrowser } from "@/lib/clerk-browser";

/** Publishes the Clerk session so browser Supabase calls can send its token. */
export function ClerkSessionBridge() {
  const { isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;
    publishClerkBrowser({
      loaded: true,
      identity: userId
        ? {
            email: user?.primaryEmailAddress?.emailAddress ?? null,
            fullName: user?.fullName ?? "",
            metadata:
              user?.publicMetadata && typeof user.publicMetadata === "object"
                ? (user.publicMetadata as Record<string, unknown>)
                : {},
            getToken: () => getToken(),
          }
        : null,
    });
  }, [getToken, isLoaded, user, userId]);

  return null;
}
