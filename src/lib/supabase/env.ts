export const SB_URL_COOKIE = "truss-sb-url";
export const SB_KEY_COOKIE = "truss-sb-key";
export const SB_URL_LS = "truss.supabase.url";
export const SB_KEY_LS = "truss.supabase.key";

/** Shared Truss project. Publishable key is a client key; RLS isolates companies. */
export const TRUSS_SUPABASE_URL = "https://cxrgdjvkmvnuztubxldh.supabase.co";
export const TRUSS_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Fs_dTxYT2nBFYVjLLG6vpg_n5b_NSa1";

function looksLikeProjectUrl(value: string | undefined) {
  const url = value?.trim() ?? "";
  return url.startsWith("https://") && url.includes(".supabase.co");
}

function looksLikePublishableKey(value: string | undefined) {
  const key = value?.trim() ?? "";
  return key.startsWith("sb_publishable_") || key.startsWith("eyJ");
}

export function getSupabaseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (looksLikeProjectUrl(fromEnv)) return fromEnv.replace(/\/+$/, "");
  return TRUSS_SUPABASE_URL;
}

export function getSupabaseKey() {
  const fromEnv = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (looksLikePublishableKey(fromEnv)) return fromEnv;
  return TRUSS_SUPABASE_PUBLISHABLE_KEY;
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function persistSupabaseBrowserConfig(url: string, key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SB_URL_LS, url);
  window.localStorage.setItem(SB_KEY_LS, key);
}

export function clearSupabaseBrowserConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SB_URL_LS);
  window.localStorage.removeItem(SB_KEY_LS);
}

export function normalizeSupabaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
