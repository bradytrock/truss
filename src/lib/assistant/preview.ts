import type { SuggestedAddress } from "../address-suggest.ts";
import type { AssistantToolCall } from "./types.ts";
import { asString } from "./files.ts";
import { nextJobCode } from "../job-code.ts";
import { isLeadSource, LEAD_SOURCE_LABELS } from "../lead-sources.ts";
import { formatPhoneInput } from "../phone.ts";

export type PreviewField = { label: string; value: string };

export type AddressSite = {
  id: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
  deletedAt?: string | null;
};

export type PreviewContact = { name: string; phone?: string };

export type LeadPreview = {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  source: string;
  sourceLabel: string;
  notes: string;
  damage: string;
  addressLine: string;
  jobCode: string;
  contactNote: string;
  assignedTo: string;
  fields: PreviewField[];
};

export type CassioSuggestion = { title: string; meta: string; prompt: string };

export type LeadNextStep = { id: "inspect" | "text" | "estimate"; label: string; prompt: string };

const STREET_SUFFIX =
  /\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|place|pl|trail|trl|circle|cir)\.?$/i;

const CONFIRM_ACTIONS: Record<string, { title: string; action: string }> = {
  create_lead: { title: "New lead", action: "Create lead" },
  send_estimate: { title: "Send estimate", action: "Send estimate" },
  send_invoice: { title: "Send invoice", action: "Send invoice" },
  void_invoice: { title: "Void invoice", action: "Void invoice" },
  accept_estimate: { title: "Accept estimate", action: "Mark signed" },
  delete_job: { title: "Delete job", action: "Delete job" },
  log_payment: { title: "Record payment", action: "Record payment" },
  send_mail: { title: "Send email", action: "Send email" },
};

const ARG_LABELS: Record<string, string> = {
  estimate: "Estimate",
  invoice: "Invoice",
  job: "Job",
  amount: "Amount",
  method: "Method",
  date: "Date",
  reference: "Reference",
  to: "To",
  subject: "Subject",
  body: "Message",
  reason: "Reason",
  thread: "Thread",
};

export function cassioSubtitle(leadName?: string) {
  const name = leadName?.trim();
  if (name) return `New lead · ${name}`;
  return "Runs your book: leads, estimates, invoices, mail";
}

export function streetHeadline(street: string) {
  return street.trim().replace(STREET_SUFFIX, "");
}

export function countWord(count: number) {
  return ["two", "three", "four", "five", "six"][count - 2] ?? String(count);
}

export function leadIntro(count: number, street: string) {
  const base = "Here's the lead I'll create.";
  if (count < 2) return base;
  const place = streetHeadline(street) || "that street";
  return `${base} One thing to check first: there are ${countWord(count)} ${place}s in your area.`;
}

export function plannedLeadLine(address: string, chose: boolean) {
  const place = address.trim();
  if (!place) return "Planned a new lead.";
  return chose ? `Planned a new lead · ${place} picked` : `Planned a new lead · ${place}`;
}

export function leadDoneLine(firstName: string) {
  const name = firstName.trim();
  if (!name) return "Done. The lead is in your book and assigned to you. Want me to take the next step?";
  return `Done. ${name} is in your book and the lead is assigned to you. Want me to take the next step?`;
}

export function addressChoiceLabel(row: Pick<SuggestedAddress, "street" | "city" | "state" | "postalCode">) {
  const place = [row.city.trim(), row.postalCode.trim()].filter(Boolean).join(" ");
  return [row.street.trim(), place || row.state.trim()].filter(Boolean).join(", ");
}

export function damageLabel(notes: string) {
  const text = notes.trim();
  if (!text) return "";
  const parts: string[] = [];
  if (/hail/i.test(text)) parts.push("Hail");
  else if (/wind/i.test(text)) parts.push("Wind");
  if (/roof/i.test(text)) parts.push("Roof");
  if (parts.length) return parts.join(" · ");
  return text;
}

export function sourceLabel(source: string) {
  if (!source.trim()) return "";
  if (isLeadSource(source)) return LEAD_SOURCE_LABELS[source];
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contactNote(contacts: PreviewContact[], name: string, phone: string) {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const found = contacts.some((contact) => {
    if (name && contact.name.trim().toLowerCase() === name.toLowerCase()) return true;
    const theirs = (contact.phone ?? "").replace(/\D/g, "");
    return Boolean(digits.length >= 7 && theirs.endsWith(digits));
  });
  return found ? "in your book" : "new contact";
}

export function leadPreview(
  call: AssistantToolCall,
  input: { ownerName: string; codes: Iterable<string>; contacts: PreviewContact[]; now?: Date },
): LeadPreview {
  const args = call.arguments;
  const firstName = asString(args.firstName);
  const lastName = asString(args.lastName);
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = formatPhoneInput(asString(args.phone));
  const email = asString(args.email);
  const street = asString(args.street);
  const city = asString(args.city);
  const state = asString(args.state);
  const postalCode = asString(args.postalCode);
  const source = asString(args.source);
  const notes = asString(args.notes);
  const llcName = asString(args.llcName);
  const relatedName = asString(args.relatedContactName);
  const relatedTitle = asString(args.relatedContactTitle);
  const labeledSource = sourceLabel(source);
  const damage = damageLabel(notes);
  const addressLine = addressChoiceLabel({ street, city, state, postalCode });
  const jobCode = nextJobCode(input.ownerName || "You", input.now ?? new Date(), input.codes);
  const note = contactNote(input.contacts, fullName, phone);
  const assignedTo = args.assignToPreviousPm === true ? "Previous project manager" : "You";
  const fields: PreviewField[] = [
    fullName ? { label: "Contact", value: `${fullName} · ${note}` } : null,
    llcName ? { label: "LLC", value: llcName } : null,
    relatedName
      ? { label: "Related contact", value: [relatedName, relatedTitle].filter(Boolean).join(" · ") }
      : null,
    phone ? { label: "Phone", value: phone } : null,
    email ? { label: "Email", value: email } : null,
    damage ? { label: "Damage", value: damage } : null,
    labeledSource ? { label: "Source", value: labeledSource } : null,
    { label: "Assigned to", value: assignedTo },
  ].filter((field): field is PreviewField => Boolean(field));
  return {
    firstName,
    lastName,
    fullName,
    phone,
    email,
    street,
    city,
    state,
    postalCode,
    source,
    sourceLabel: labeledSource,
    notes,
    damage,
    addressLine,
    jobCode,
    contactNote: note,
    assignedTo,
    fields: fields.filter((field) => field.label !== "Address"),
  };
}

export function bookAddressesMatching(sites: AddressSite[], query: string): SuggestedAddress[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter((token) => token.length > 1 || /\d/.test(token));
  if (tokens.length === 0 || query.trim().length < 4) return [];
  const matches: SuggestedAddress[] = [];
  for (const site of sites) {
    if (site.deletedAt) continue;
    const street = (site.street || "").trim();
    const city = (site.city || "").trim();
    const state = (site.state || "").trim();
    const postalCode = (site.postalCode || "").trim();
    const hay = `${street} ${city} ${state} ${postalCode} ${site.location ?? ""}`.toLowerCase();
    if (!street || !tokens.every((token) => hay.includes(token))) continue;
    matches.push({
      id: `book:${site.id}`,
      label: addressChoiceLabel({ street, city, state, postalCode }),
      street,
      city,
      state,
      postalCode,
    });
    if (matches.length >= 4) break;
  }
  return matches;
}

export function mergeAddressChoices(book: SuggestedAddress[], remote: SuggestedAddress[]) {
  const seen = new Set<string>();
  const merged: SuggestedAddress[] = [];
  for (const row of [...book, ...remote]) {
    const key = `${row.street}|${row.city}|${row.postalCode}`.toLowerCase().replace(/\s+/g, " ");
    if (!row.street || seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...row, label: addressChoiceLabel(row) });
    if (merged.length >= 4) break;
  }
  return merged;
}

export function preferredAddressId(rows: SuggestedAddress[], current: { city: string; postalCode: string; street: string }) {
  const city = current.city.trim().toLowerCase();
  const zip = current.postalCode.trim();
  const street = current.street.trim().toLowerCase();
  const exact = rows.find((row) => {
    if (zip && row.postalCode.trim() !== zip) return false;
    if (city && row.city.trim().toLowerCase() !== city) return false;
    if (street && row.street.trim().toLowerCase() !== street) return false;
    return Boolean(zip || city);
  });
  return (exact ?? rows[0])?.id ?? null;
}

export function applyAddress(call: AssistantToolCall, row: SuggestedAddress): AssistantToolCall {
  return {
    ...call,
    arguments: {
      ...call.arguments,
      street: row.street,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
    },
  };
}

export function confirmAction(name: string) {
  return CONFIRM_ACTIONS[name] ?? { title: "Review change", action: "Save" };
}

export function argumentFields(call: AssistantToolCall): PreviewField[] {
  return Object.entries(ARG_LABELS)
    .map(([key, label]) => {
      const value = asString(call.arguments[key]);
      return value ? { label, value } : null;
    })
    .filter((field): field is PreviewField => Boolean(field));
}

export function cassioSuggestions(
  jobs: Array<{ code?: string; name?: string; deletedAt?: string | null; status?: string }>,
): CassioSuggestion[] {
  const open = jobs.find((job) => !job.deletedAt && job.status !== "complete" && (job.code || job.name));
  const title = open
    ? `Draft a reroof estimate on ${open.name || "the open job"} from the price book`
    : "Draft a reroof estimate on the open job from the price book";
  return [
    {
      title,
      meta: open?.code ? `Estimates · ${open.code}` : "Estimates",
      prompt: title,
    },
    {
      title: "Log a hail roof at 412 Maple for Jane Ortiz, 214-555-0144, source Website",
      meta: "Leads",
      prompt: "Log a hail roof at 412 Maple for Jane Ortiz, phone 214-555-0144, seed Website",
    },
    {
      title: "Review my inbox, match people, and tag mail to jobs",
      meta: "Mail",
      prompt: "Review my inbox, match people, and tag mail to jobs",
    },
  ];
}

export function leadNextSteps(input: { firstName: string; address: string; code: string }): LeadNextStep[] {
  const who = input.firstName.trim() || "them";
  const where = input.address.trim();
  const code = input.code.trim();
  return [
    {
      id: "inspect",
      label: "Schedule a roof inspection",
      prompt: `Schedule a roof inspection${where ? ` at ${where}` : ""} for ${who}${code ? ` on ${code}` : ""}`,
    },
    {
      id: "text",
      label: `Text ${who} that we got the request`,
      prompt: `Text ${who} that we got the request${code ? ` about ${code}` : ""}`,
    },
    {
      id: "estimate",
      label: "Draft a reroof estimate from the price book",
      prompt: `Draft a reroof estimate from the price book${code ? ` on ${code}` : ""}`,
    },
  ];
}
