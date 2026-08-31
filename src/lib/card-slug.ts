/** First-segment company slugs that would collide with app routes. */
export const RESERVED_COMPANY_SLUGS = new Set([
  "accounting",
  "admin",
  "api",
  "app",
  "approve",
  "auth",
  "billing",
  "calendar",
  "card",
  "catalog",
  "clients",
  "contacts",
  "documents",
  "estimates",
  "favicon.ico",
  "help",
  "home",
  "invoices",
  "jobs",
  "login",
  "mail",
  "material-orders",
  "messages",
  "opportunities",
  "people",
  "photos",
  "pipeline",
  "price-book",
  "profile",
  "qbwc",
  "quickbooks",
  "reports",
  "robots",
  "schedule",
  "settings",
  "share",
  "signup",
  "sitemap",
  "status",
  "support",
  "teams",
  "training",
  "webhook",
  "webhooks",
  "www",
  "_next",
]);

export function slugCompanyName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "company";
}

/** first.last from the first and last words of a name. Sticky once saved. */
export function slugPersonName(name: string) {
  const parts = name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]+/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "card";
  if (parts.length === 1) return parts[0].slice(0, 64);
  return `${parts[0]}.${parts[parts.length - 1]}`.slice(0, 64);
}

export function normalizeCompanySlug(raw: string) {
  return slugCompanyName(raw.replace(/\./g, "-"));
}

export function normalizePersonCardSlug(raw: string) {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/[.-]+/g, (chunk) => (chunk.includes(".") ? "." : "-"))
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 64);
  return slug || "card";
}

export function companySlugIsReserved(slug: string) {
  return RESERVED_COMPANY_SLUGS.has(slug.trim().toLowerCase());
}

export function uniqueSlug(base: string, taken: Iterable<string>) {
  const used = new Set(
    Array.from(taken, (value) => value.trim().toLowerCase()).filter(Boolean),
  );
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function mintCompanySlug(name: string, desired = "", taken: Iterable<string> = []) {
  const fromName = slugCompanyName(name);
  const requested = desired.trim() ? normalizeCompanySlug(desired) : fromName;
  const base = companySlugIsReserved(requested)
    ? uniqueSlug(`${requested}-co`, RESERVED_COMPANY_SLUGS)
    : requested;
  return uniqueSlug(base, taken);
}

export function mintPersonCardSlug(name: string, desired = "", taken: Iterable<string> = []) {
  const requested = desired.trim() ? normalizePersonCardSlug(desired) : slugPersonName(name);
  return uniqueSlug(requested, taken);
}
