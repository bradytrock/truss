import { createClient } from "@supabase/supabase-js";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

/** Guest Supabase client for homeowner share links. Never attach cookies or a JWT. */
export function createAnonClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
