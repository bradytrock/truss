import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabaseKey,
  getSupabaseUrl,
  SB_KEY_COOKIE,
  SB_URL_COOKIE,
} from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  const url = getSupabaseUrl() || cookieStore.get(SB_URL_COOKIE)?.value || "";
  const key = getSupabaseKey() || cookieStore.get(SB_KEY_COOKIE)?.value || "";

  return createServerClient<Database>(url, key, {
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
