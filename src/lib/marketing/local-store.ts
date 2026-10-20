const cache = new Map<string, { raw: string | null; value: unknown }>();

export function subscribeMarketingLocal(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => onChange();
  window.addEventListener("marketing-local", notify);
  return () => window.removeEventListener("marketing-local", notify);
}

export function readMarketingLocal<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value = fallback;
  if (raw != null) {
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function writeMarketingLocal(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(value);
  window.localStorage.setItem(key, raw);
  cache.set(key, { raw, value });
  window.dispatchEvent(new Event("marketing-local"));
}
