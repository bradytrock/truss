import { normalizePersonCardSlug } from "./card-slug.ts";
import { formatCurrencyFull } from "./format.ts";
import { digitsOnly, formatPhoneInput, looksLikePhone } from "./phone.ts";
import type { GoogleLocation, SeatRole, StaffMember, Team } from "./types.ts";
import { SEAT_ROLE_LABELS } from "./types.ts";
import { NO_TEAM } from "./teams.ts";

export const PROFILE_TABS = [
  { id: "details", label: "Details" },
  { id: "card", label: "Digital card" },
  { id: "goal", label: "Sales goal" },
  { id: "signature", label: "Signature" },
  { id: "chat", label: "Website chat" },
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]["id"];

export type ProfileDraft = {
  name: string;
  title: string;
  email: string;
  phone: string;
  role: SeatRole;
  teamId: string;
  cardSlug: string;
  locationId: string | null;
  signature: string;
  quota: string;
};

export type ProfileChange = {
  key: string;
  label: string;
  from: string;
  to: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_IN_TEXT = /(?:\+?1[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g;

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "They";
}

/** "Brady's", "Sam Rogers's". */
export function possessive(name: string) {
  const trimmed = name.trim() || "Their";
  return `${trimmed}'s`;
}

export function draftFromMember(member: StaffMember): ProfileDraft {
  return {
    name: member.name,
    title: member.title,
    email: member.email,
    phone: formatPhoneInput(member.phone),
    role: member.role,
    teamId: member.teamId?.trim() ? member.teamId : "",
    cardSlug: member.cardSlug,
    locationId: member.googleLocationId ?? null,
    signature: member.emailSignature ?? "",
    quota: member.monthlySalesQuota == null ? "" : String(member.monthlySalesQuota),
  };
}

export function roleBookHelp(role: SeatRole) {
  if (role === "company_admin") {
    return "Company admin: sees every job, contact, and report. Team controls whose book they see.";
  }
  if (role === "project_manager") {
    return "Project manager: their own leads and jobs. Team controls whose book they see.";
  }
  if (role === "business_development") {
    return "Business development: prospecting and the business-development book. Team controls whose book they see.";
  }
  if (role === "accountant") {
    return "Accounting: paperwork and the jobs they’re assigned. Team controls whose book they see.";
  }
  return `${SEAT_ROLE_LABELS[role]}: access follows this role. Team controls whose book they see.`;
}

export function profileFieldErrors(draft: Pick<ProfileDraft, "name" | "email" | "phone" | "cardSlug">) {
  const errors: Partial<Record<"name" | "email" | "phone" | "cardSlug", string>> = {};
  if (!draft.name.trim()) errors.name = "Enter a name.";
  if (draft.phone.trim() && !looksLikePhone(draft.phone)) {
    errors.phone = "Enter a 10-digit phone number.";
  }
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) {
    errors.email = "Enter a full email, like name@company.com.";
  }
  if (!draft.cardSlug.trim()) errors.cardSlug = "Enter a card URL, like first.last.";
  return errors;
}

export function parseCardSlugAliases(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map((item) => String(item)) : String(value ?? "").split(",");
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const slug = normalizePersonCardSlug(part);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    aliases.push(slug);
  }
  return aliases;
}

export function serializeCardSlugAliases(aliases: string[]) {
  return parseCardSlugAliases(aliases).join(",");
}

export function takenCardSlugs(staff: StaffMember[], exceptId: string) {
  const taken = new Set<string>();
  for (const member of staff) {
    if (member.id === exceptId) continue;
    const slug = normalizePersonCardSlug(member.cardSlug || "");
    if (member.cardSlug.trim()) taken.add(slug);
    for (const alias of parseCardSlugAliases(member.cardSlugAliases)) taken.add(alias);
  }
  return taken;
}

/** sam.rogers2, then sam.rogers3, when sam.rogers is taken. */
export function suggestFreeCardSlug(desired: string, taken: Iterable<string>) {
  const used = new Set(Array.from(taken, (value) => value.trim().toLowerCase()).filter(Boolean));
  const base = normalizePersonCardSlug(desired).replace(/\d+$/, "") || "card";
  let n = 2;
  let candidate = `${base}${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${base}${n}`.slice(0, 64);
  }
  return candidate;
}

export function cardSlugTakenMessage(slug: string, suggestion: string) {
  return `Someone already uses /${slug}. Try /${suggestion} or a nickname.`;
}

export function cardSlugAliasesAfterSave(input: {
  previousSlug: string;
  previousAliases: string[];
  nextSlug: string;
  keepRedirect: boolean;
}) {
  const previous = input.previousSlug.trim() ? normalizePersonCardSlug(input.previousSlug) : "";
  const next = normalizePersonCardSlug(input.nextSlug);
  const aliases = parseCardSlugAliases(input.previousAliases).filter((alias) => alias !== next);
  if (previous && previous !== next && input.keepRedirect && !aliases.includes(previous)) {
    aliases.push(previous);
  }
  return aliases;
}

function teamLabel(teams: Team[], teamId: string) {
  if (!teamId || teamId === NO_TEAM) return "No team";
  return teams.find((team) => team.id === teamId)?.name.trim() || "No team";
}

function locationLabel(locations: GoogleLocation[], id: string | null) {
  if (!id) {
    const fallback = locations.find((location) => location.isDefault);
    return fallback ? `Default (${fallback.name})` : "Company default";
  }
  return locations.find((location) => location.id === id)?.name ?? "Company default";
}

function quotaLabel(raw: string) {
  if (!raw.trim()) return "Company default";
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return raw.trim();
  return formatCurrencyFull(amount);
}

function signatureLabel(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "Company signature";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}

export function profileChanges(
  draft: ProfileDraft,
  baseline: ProfileDraft,
  context: { teams: Team[]; locations: GoogleLocation[] },
): ProfileChange[] {
  const changes: ProfileChange[] = [];
  const push = (key: string, label: string, from: string, to: string) => {
    if (from === to) return;
    changes.push({ key, label, from, to });
  };
  push("name", "Name", baseline.name.trim(), draft.name.trim());
  push("title", "Title", baseline.title.trim() || "No title", draft.title.trim() || "No title");
  push(
    "phone",
    "Phone",
    formatPhoneInput(baseline.phone) || "No phone",
    formatPhoneInput(draft.phone) || "No phone",
  );
  push(
    "email",
    "Email",
    baseline.email.trim().toLowerCase() || "No email",
    draft.email.trim().toLowerCase() || "No email",
  );
  push("role", "Role", SEAT_ROLE_LABELS[baseline.role], SEAT_ROLE_LABELS[draft.role]);
  push("team", "Team", teamLabel(context.teams, baseline.teamId), teamLabel(context.teams, draft.teamId));
  push(
    "card",
    "Card URL",
    baseline.cardSlug.trim() ? `/${normalizePersonCardSlug(baseline.cardSlug)}` : "No URL",
    draft.cardSlug.trim() ? `/${normalizePersonCardSlug(draft.cardSlug)}` : "No URL",
  );
  push(
    "location",
    "Google location",
    locationLabel(context.locations, baseline.locationId),
    locationLabel(context.locations, draft.locationId),
  );
  push("signature", "Email signature", signatureLabel(baseline.signature), signatureLabel(draft.signature));
  push("quota", "Monthly quota", quotaLabel(baseline.quota), quotaLabel(draft.quota));
  return changes;
}

export function fillSignature(
  template: string,
  person: { name: string; title: string; phone: string; email: string },
) {
  return template.replace(/\{(name|title|phone|email)\}/gi, (_match, key: string) => {
    const token = key.toLowerCase();
    if (token === "name") return person.name.trim();
    if (token === "title") return person.title.trim();
    if (token === "phone") return formatPhoneInput(person.phone) || person.phone.trim();
    return person.email.trim();
  });
}

export function mismatchedSignaturePhone(signature: string, phoneOnFile: string) {
  const fileDigits = digitsOnly(phoneOnFile);
  const file =
    fileDigits.length >= 11 && fileDigits.startsWith("1") ? fileDigits.slice(1, 11) : fileDigits.slice(-10);
  const matches = signature.match(PHONE_IN_TEXT) ?? [];
  for (const raw of matches) {
    const digits = digitsOnly(raw);
    const national = digits.length >= 11 && digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(-10);
    if (national.length !== 10) continue;
    if (file.length === 10 && national === file) continue;
    return {
      raw,
      found: formatPhoneInput(national),
      file: file.length === 10 ? formatPhoneInput(file) : "",
    };
  }
  return null;
}

export function replaceMismatchedPhone(signature: string, phoneOnFile: string) {
  const mismatch = mismatchedSignaturePhone(signature, phoneOnFile);
  if (!mismatch) return signature;
  return signature.replace(mismatch.raw, "{phone}");
}

export function formatFileMegabytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? mb.toFixed(0) : mb.toFixed(1);
  return `${rounded} MB`;
}

export function photoTooLargeMessage(bytes: number) {
  return `That file is ${formatFileMegabytes(bytes)}. Pick a photo under 2 MB.`;
}

export function chatEmbedDisplay(origin: string, company: string, personId: string) {
  const root = origin.replace(/\/$/, "");
  const office = company.trim().replace(/"/g, "");
  const person = personId.trim().replace(/"/g, "");
  const lines = [`<script src="${root}/api/chat/widget.js"`, `  data-company="${office}"`];
  if (person) lines.push(`  data-person="${person}"`);
  lines.push("  async></script>");
  return lines.join("\n");
}

export function chatSiteLabel(website: string) {
  const host = website.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return host || "their site";
}

export function latestWebsiteChatAt(
  opportunities: Array<{ ownerStaffId?: string; leadSource?: string; createdAt?: string }>,
  staffId: string,
) {
  let best: string | null = null;
  for (const opportunity of opportunities) {
    if (opportunity.ownerStaffId !== staffId) continue;
    if (opportunity.leadSource !== "website") continue;
    const at = opportunity.createdAt?.trim();
    if (!at) continue;
    if (!best || at > best) best = at;
  }
  return best;
}

export function chicagoDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

export function chicagoMonth(now = new Date()) {
  return now.toLocaleDateString("en-US", { month: "long", timeZone: "America/Chicago" });
}
