import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clerkConfigured } from "@/lib/clerk-env";
import { railwayClientOptions } from "@/lib/railway-rest";
import {
  getSupabaseKey,
  getSupabaseUrl,
  SB_KEY_COOKIE,
  SB_URL_COOKIE,
} from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

async function clerkAccessToken() {
  if (!clerkConfigured()) return null;
  try {
    const { userId, getToken } = await auth();
    if (!userId) return null;
    return (await getToken()) || null;
  } catch {
    return null;
  }
}

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl() || cookieStore.get(SB_URL_COOKIE)?.value || "";
  const key = getSupabaseKey() || cookieStore.get(SB_KEY_COOKIE)?.value || "";
  const accessToken = await clerkAccessToken();

  return createServerClient<Database>(url, key, {
    ...railwayClientOptions(),
    ...(accessToken ? { accessToken: async () => accessToken } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Proxy refreshes the session; Server Components cannot write cookies.
        }
      },
    },
  });
}
