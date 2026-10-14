import { createClient } from "@supabase/supabase-js";
import { railwayClientOptions } from "@/lib/railway-rest";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

/** Guest client for homeowner share links. Never attach cookies or a JWT. */
export function createAnonClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseKey(), {
    ...railwayClientOptions(),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
