export const SB_URL_COOKIE = "theroofingcrm-sb-url";
export const SB_KEY_COOKIE = "theroofingcrm-sb-key";
export const SB_URL_COOKIE_LEGACY = "truss-sb-url";
export const SB_KEY_COOKIE_LEGACY = "truss-sb-key";
export const SB_URL_LS = "theroofingcrm.supabase.url";
export const SB_KEY_LS = "theroofingcrm.supabase.key";
const SB_URL_LS_LEGACY = "truss.supabase.url";
const SB_KEY_LS_LEGACY = "truss.supabase.key";

function readCookie(name: string) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function readStorage(name: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(name) ?? "";
  } catch {
    return "";
  }
}

export function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    readStorage(SB_URL_LS) ||
    readStorage(SB_URL_LS_LEGACY) ||
    readCookie(SB_URL_COOKIE) ||
    readCookie(SB_URL_COOKIE_LEGACY)
  );
}

export function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    readStorage(SB_KEY_LS) ||
    readStorage(SB_KEY_LS_LEGACY) ||
    readCookie(SB_KEY_COOKIE) ||
    readCookie(SB_KEY_COOKIE_LEGACY)
  );
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
  window.localStorage.removeItem(SB_URL_LS_LEGACY);
  window.localStorage.removeItem(SB_KEY_LS_LEGACY);
}

export function normalizeSupabaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
