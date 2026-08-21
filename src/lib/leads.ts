import type { DeliveryMethod, LeadSource } from "@/lib/types";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, LEGACY_LEAD_SOURCE_LABELS } from "@/lib/types";

export function formatJobSite(input: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const postal = input.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

export function leadSourceLabel(source: string | null | undefined) {
  if (!source) return "";
  return LEAD_SOURCE_LABELS[source as LeadSource] ?? LEGACY_LEAD_SOURCE_LABELS[source] ?? source;
}

export function leadSourceChoices(current?: string | null): string[] {
  const value = current?.trim() ?? "";
  if (value && !LEAD_SOURCES.includes(value as LeadSource)) {
    return [value, ...LEAD_SOURCES];
  }
  return [...LEAD_SOURCES];
}

export function defaultDeliveryForSource(source: string): DeliveryMethod {
  if (source === "insurance" || source === "storm") return "insurance_claim";
  return "fixed_price";
}

export function leadName(first: string, last: string, site: string) {
  const full = `${first.trim()} ${last.trim()}`.trim();
  if (site) return `${last.trim() || full} — ${site}`;
  return full || "New lead";
}
