import { looksLikeEmail } from "@/lib/share-text";

export const LIST_ROLES = ["realtor", "insurance", "homeowner", "other"] as const;
export type ListRole = (typeof LIST_ROLES)[number];

export const LIST_ROLE_META: Record<ListRole, { label: string; title: string; partner: boolean }> = {
  realtor: { label: "Real estate agent", title: "Real estate agent", partner: true },
  insurance: { label: "Insurance", title: "Insurance", partner: true },
  homeowner: { label: "Homeowner", title: "Homeowner", partner: false },
  other: { label: "Other", title: "", partner: false },
};

export type ListEntry = {
  name: string;
  email: string;
  phone: string;
};

export function isListRole(value: string): value is ListRole {
  return (LIST_ROLES as readonly string[]).includes(value);
}

export function nameFromEmail(email: string) {
  const local = email.split("@")[0] || email;
  const words = local.split(/[._+-]+/).filter(Boolean);
  if (!words.length) return email;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function looksLikePhone(value: string) {
  if (value.includes("@")) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export function parseListLine(line: string): ListEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const angle = trimmed.match(/^(.*)<([^>]+)>\s*$/);
  let name = "";
  let source = trimmed;
  if (angle) {
    name = angle[1].replace(/^["']|["']$/g, "").trim();
    source = angle[2].trim();
  }
  const commaParts = source.split(/[,\t]/).map((part) => part.trim()).filter(Boolean);
  const tokens =
    commaParts.length === 1 && !angle
      ? commaParts[0].split(/\s+/).filter(Boolean)
      : commaParts;
  let email = "";
  let phone = "";
  const nameBits = name ? [name] : [];
  for (const token of tokens) {
    const cleaned = token.replace(/^["']|["']$/g, "").replace(/[<>]/g, "");
    if (!email && looksLikeEmail(cleaned)) email = cleaned;
    else if (!phone && looksLikePhone(cleaned)) phone = cleaned;
    else if (cleaned) nameBits.push(cleaned);
  }
  if (!email) return null;
  return { name: nameBits.join(" ").trim(), email, phone };
}

export function parseListPaste(text: string) {
  const entries: ListEntry[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const entry = parseListLine(trimmed);
    if (!entry) {
      invalid.push(trimmed);
      continue;
    }
    const key = entry.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return { entries, invalid };
}
