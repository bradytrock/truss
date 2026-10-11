import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";
import { installLocalWriteTracker } from "@/lib/supabase/local-writes";

export function createClient() {
  installLocalWriteTracker();
  return createBrowserClient<Database>(getSupabaseUrl(), getSupabaseKey());
}
