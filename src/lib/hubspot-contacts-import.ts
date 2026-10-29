import { hasBusinessDevelopmentSeat } from "@/lib/bd";
import { parseDelimited } from "@/lib/catalog-csv";
import {
  HUBSPOT_SOURCE,
  detectHubSpotColumns,
  guessOwnerStaffId,
  parseHubSpotDate,
  tallyHubSpotValues,
  type HubSpotDistinct,
} from "@/lib/hubspot-import";
import { digitsOnly, storedPhone } from "@/lib/phone";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, type Client, type ClientType, type Contact, type StaffMember } from "@/lib/types";

/**
 * HubSpot contacts export → Truss contacts (and the companies they work for).
 *
 * Everything here is pure, like hubspot-import.ts. The same
 * `applyHubSpotContactsMapping` call feeds the Verify screen and the store
 * write. Every row lands with the Referral partner flag on by default, so the
 * relationship shows in the business development book of the seat that owns
 * it and referred leads roll into that person's BD tracking.
 */

export { HUBSPOT_SOURCE };

export type HubSpotContactField =
  | "recordId"
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "owner"
  | "companyId"
  | "companyName"
  | "jobTitle"
  | "leadStatus"
  | "marketingStatus"
  | "createDate"
  | "lastActivity";

const FIELD_ALIASES: Record<HubSpotContactField, string[]> = {
  recordId: ["record id", "contact id", "hs object id", "object id", "id", "vid"],
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last", "surname"],
  fullName: ["full name", "contact name", "name"],
  email: ["email", "email address", "contact email", "primary email", "work email"],
  phone: ["phone number", "phone", "mobile phone number", "mobile phone", "mobile", "cell phone", "cell", "contact phone"],
  owner: ["contact owner", "owner", "hubspot owner", "assigned to"],
  companyId: ["primary associated company id", "associated company id", "company id"],
  companyName: ["associated company", "primary associated company", "associated company name", "company name", "company"],
  jobTitle: ["job title", "title"],
  leadStatus: ["lead status"],
  marketingStatus: ["marketing contact status", "marketing status"],
  createDate: ["create date", "created date", "created at", "createdate", "date created"],
  lastActivity: ["last activity date", "last activity"],
};

export const HUBSPOT_CONTACT_FIELD_LABELS: Record<HubSpotContactField, string> = {
  recordId: "Record ID",
  firstName: "First Name",
  lastName: "Last Name",
  fullName: "Name",
  email: "Email",
  phone: "Phone Number",
  owner: "Contact owner",
  companyId: "Primary Associated Company ID",
  companyName: "Associated Company",
  jobTitle: "Job Title",
  leadStatus: "Lead Status",
  marketingStatus: "Marketing contact status",
  createDate: "Create Date",
  lastActivity: "Last Activity Date",
};

export type HubSpotContactRawRow = {
  /** 1-based line in the file, for the issues list. */
  line: number;
  values: Partial<Record<HubSpotContactField, string>>;
};

export type HubSpotContactsParsed = {
  rows: HubSpotContactRawRow[];
  /** Original header text for every column we recognized. */
  columns: Partial<Record<HubSpotContactField, string>>;
  /** Header text for columns we ignored. */
  ignoredColumns: string[];
  missingRequired: string[];
  owners: HubSpotDistinct[];
  companies: Array<HubSpotDistinct & { hubspotId: string }>;
  leadStatuses: HubSpotDistinct[];
  marketingStatuses: HubSpotDistinct[];
};

export function parseHubSpotContactsCsv(text: string): HubSpotContactsParsed {
  if (text.includes("\u0000") || text.startsWith("PK")) {
    throw new Error("This looks like an Excel workbook. In HubSpot, export as CSV and upload that file.");
  }
  const table = parseDelimited(text);
  if (table.length === 0) throw new Error("The file is empty.");
  const headers = table[0] ?? [];
  const columns = detectHubSpotColumns(headers, FIELD_ALIASES);
  const missingRequired: string[] = [];
  if (
    columns.firstName === undefined &&
    columns.lastName === undefined &&
    columns.fullName === undefined &&
    columns.email === undefined
  ) {
    missingRequired.push("First Name and Last Name (or Email)");
  }
  const used = new Set(Object.values(columns));
  const ignoredColumns = headers.filter((_, index) => !used.has(index)).map((header) => header.trim()).filter(Boolean);

  const rows: HubSpotContactRawRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const values: Partial<Record<HubSpotContactField, string>> = {};
    let any = false;
    for (const [field, at] of Object.entries(columns) as Array<[HubSpotContactField, number]>) {
      const raw = (cells[at] ?? "").trim();
      if (raw) any = true;
      values[field] = raw;
    }
    if (!any) return;
    rows.push({ line: index + 2, values });
  });

  const columnLabels: Partial<Record<HubSpotContactField, string>> = {};
  for (const [field, at] of Object.entries(columns) as Array<[HubSpotContactField, number]>) {
    columnLabels[field] = headers[at]?.trim() ?? "";
  }

  const companyCounts = new Map<string, { count: number; hubspotId: string }>();
  for (const row of rows) {
    const name = cleanCompanyName(row.values.companyName);
    if (!name) continue;
    const entry = companyCounts.get(name) ?? { count: 0, hubspotId: (row.values.companyId ?? "").trim() };
    entry.count += 1;
    if (!entry.hubspotId) entry.hubspotId = (row.values.companyId ?? "").trim();
    companyCounts.set(name, entry);
  }

  return {
    rows,
    columns: columnLabels,
    ignoredColumns,
    missingRequired,
    owners: tallyHubSpotValues(rows.map((row) => row.values.owner ?? "")),
    companies: [...companyCounts.entries()]
      .map(([value, entry]) => ({ value, count: entry.count, hubspotId: entry.hubspotId }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)),
    leadStatuses: tallyHubSpotValues(rows.map((row) => row.values.leadStatus ?? "")),
    marketingStatuses: tallyHubSpotValues(rows.map((row) => row.values.marketingStatus ?? "")),
  };
}

function cleanCompanyName(raw: string | undefined) {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Mapping

export type HubSpotCompanyTarget = ClientType | "skip";

export const HUBSPOT_COMPANY_TARGETS: HubSpotCompanyTarget[] = [...CLIENT_TYPES, "skip"];

export function companyTargetLabel(target: HubSpotCompanyTarget) {
  return target === "skip" ? "Don’t link a company" : CLIENT_TYPE_LABELS[target];
}

export type HubSpotContactsMapping = {
  /** HubSpot "Contact owner" text → Truss staff id. Empty string falls back to the default owner. */
  owners: Record<string, string>;
  /** Seat that holds every contact whose owner is blank or unmapped. */
  defaultOwnerStaffId: string;
  /**
   * Flip the Referral partner toggle on for every imported contact, so the
   * relationship is tracked in the owning seat's business development book.
   */
  referralPartner: boolean;
  /** Lead statuses to bring in. Missing keys are included. */
  leadStatuses: Record<string, boolean>;
  /** Associated Company text → company type (or skip to leave the contact without a company). */
  companies: Record<string, HubSpotCompanyTarget>;
};

const COMPANY_TYPE_GUESSES: Array<{ test: RegExp; type: ClientType }> = [
  { test: /\b(insurance|claims?|adjust(er|ing|ers)?|mutual|allstate|state\s*farm|usaa|travelers|nationwide|progressive|farmers)\b/i, type: "insurance" },
  {
    test: /\b(realty|real\s*estate|realtors?|properties|brokerage|brokers?|homes|keller|kw|compass|exp|re\/?max|coldwell|sotheby'?s?|century\s*21|berkshire|redfin|ebby|allie\s*beth|listings?)\b/i,
    type: "realtor",
  },
  { test: /\b(hospital|health|healthcare|medical|clinic)\b/i, type: "healthcare_system" },
  { test: /\b(architects?|architecture|design|engineering|engineers?|studio)\b/i, type: "architect" },
  { test: /\b(city of|county|isd|school|district|department|state of|authority|municipal)\b/i, type: "public" },
  {
    test: /\b(roofing|roofers?|construction|builders?|contracting|contractors?|remodel(ing)?|supply|exteriors?|plumbing|hvac|electric(al)?|solar|gutters?|restoration|siding|windows|services)\b/i,
    type: "trade_partner",
  },
  { test: /\b(development|developers?|capital|investments?|holdings|ventures)\b/i, type: "developer" },
];

export function guessCompanyType(name: string): ClientType {
  const text = name.trim();
  if (!text) return "owner";
  for (const guess of COMPANY_TYPE_GUESSES) {
    if (guess.test.test(text)) return guess.type;
  }
  return "owner";
}

/** The seat that should hold imported relationships: the first business development seat, else the viewer. */
export function defaultBdOwnerStaffId(staff: StaffMember[], viewerStaffId: string) {
  const open = staff.filter((member) => !member.locked);
  const bd = open.find((member) => hasBusinessDevelopmentSeat(member));
  if (bd) return bd.id;
  if (open.some((member) => member.id === viewerStaffId)) return viewerStaffId;
  return open[0]?.id ?? "";
}

/** Business development seats first, so the default owner is the obvious pick. */
export function sortBdSeatsFirst(staff: StaffMember[]) {
  return [...staff].sort((left, right) => {
    const leftBd = hasBusinessDevelopmentSeat(left) ? 0 : 1;
    const rightBd = hasBusinessDevelopmentSeat(right) ? 0 : 1;
    return leftBd - rightBd;
  });
}

export function defaultHubSpotContactsMapping(
  parsed: HubSpotContactsParsed,
  staff: StaffMember[],
  fallbackOwnerId: string,
): HubSpotContactsMapping {
  const owners: Record<string, string> = {};
  for (const owner of parsed.owners) owners[owner.value] = guessOwnerStaffId(owner.value, staff);
  const leadStatuses: Record<string, boolean> = {};
  for (const status of parsed.leadStatuses) leadStatuses[status.value] = true;
  const companies: Record<string, HubSpotCompanyTarget> = {};
  for (const company of parsed.companies) companies[company.value] = guessCompanyType(company.value);
  return { owners, defaultOwnerStaffId: fallbackOwnerId, referralPartner: true, leadStatuses, companies };
}

// ---------------------------------------------------------------------------
// Drafts

export type HubSpotContactMatch = "record" | "phone" | "email" | null;

export const HUBSPOT_PARTNER_TITLE = "Referral partner";
export const HUBSPOT_HOMEOWNER_TITLE = "Homeowner";

export type HubSpotContactCompany = {
  /** Rows in the same file that name this company share this key. */
  key: string;
  name: string;
  hubspotId: string;
  type: HubSpotCompanyTarget;
  /** Company already on file with this name. */
  existingId: string | null;
};

export type HubSpotContactDraft = {
  line: number;
  recordId: string;
  name: string;
  first: string;
  last: string;
  title: string;
  /** True when the title came from the file, so toggling Referral partner leaves it alone. */
  titleFromFile: boolean;
  email: string;
  phone: string;
  ownerLabel: string;
  ownerStaffId: string;
  ownerName: string;
  /** The business development tracking toggle. */
  isReferralPartner: boolean;
  company: HubSpotContactCompany | null;
  leadStatus: string;
  marketingStatus: string;
  createdAt: string;
  lastActivityAt: string | null;
  /** Existing Truss contact this row updates (by Record ID, phone, or email). */
  existingId: string | null;
  matchedBy: HubSpotContactMatch;
  previousOwnerStaffId: string | null;
  previousOwnerName: string;
  /** Rows in the same file that describe the same person share this key. */
  key: string;
  /** Hard problems: the row cannot be imported until it is fixed or excluded. */
  issues: string[];
  /** Soft notes shown on Verify. */
  warnings: string[];
  excluded: boolean;
};

export type HubSpotContactsImportResult = {
  created: number;
  updated: number;
  companiesCreated: number;
  companiesMatched: number;
  skipped: number;
};

export type HubSpotContactsApplyContext = {
  staff: StaffMember[];
  contacts: Contact[];
  clients: Client[];
  /** HubSpot Record ID → Truss contact id for people already imported. */
  importedRecordIds?: Map<string, string>;
  now?: Date;
};

function phoneKey10(value: string) {
  const digits = digitsOnly(value);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function emailKey(value: string) {
  return value.trim().toLowerCase();
}

function companyKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitFullName(value: string) {
  const parts = value.split(" ").filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] ?? "" };
}

export function hubspotContactTitle(isReferralPartner: boolean) {
  return isReferralPartner ? HUBSPOT_PARTNER_TITLE : HUBSPOT_HOMEOWNER_TITLE;
}

export function applyHubSpotContactsMapping(
  parsed: HubSpotContactsParsed,
  mapping: HubSpotContactsMapping,
  context: HubSpotContactsApplyContext,
): HubSpotContactDraft[] {
  const now = context.now ?? new Date();
  const staffById = new Map(context.staff.map((member) => [member.id, member]));
  const contactsById = new Map(context.contacts.map((contact) => [contact.id, contact]));
  const contactsByPhone = new Map<string, Contact>();
  const contactsByEmail = new Map<string, Contact>();
  for (const contact of context.contacts) {
    const phone = phoneKey10(contact.phone);
    if (phone.length === 10 && !contactsByPhone.has(phone)) contactsByPhone.set(phone, contact);
    const email = emailKey(contact.email);
    if (email && !contactsByEmail.has(email)) contactsByEmail.set(email, contact);
  }
  const clientsByKey = new Map<string, Client>();
  for (const client of context.clients) {
    const key = companyKey(client.name);
    if (key && !clientsByKey.has(key)) clientsByKey.set(key, client);
  }
  const seenRecordIds = new Set<string>();
  const seenPeople = new Map<string, number>();

  return parsed.rows.map((row) => {
    const values = row.values;
    const issues: string[] = [];
    const warnings: string[] = [];

    const recordId = (values.recordId ?? "").trim();
    const leadStatus = (values.leadStatus ?? "").trim();
    const marketingStatus = (values.marketingStatus ?? "").trim();
    let excluded = false;
    if (leadStatus && mapping.leadStatuses[leadStatus] === false) {
      excluded = true;
      warnings.push(`Lead status “${leadStatus}” is left out.`);
    }

    let first = (values.firstName ?? "").replace(/\s+/g, " ").trim();
    let last = (values.lastName ?? "").replace(/\s+/g, " ").trim();
    if (!first && !last) {
      const full = splitFullName((values.fullName ?? "").replace(/\s+/g, " ").trim());
      first = full.first;
      last = full.last;
    }
    const email = emailKey(values.email ?? "");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnings.push(`Email “${values.email}” looks off.`);
    const phone = storedPhone(values.phone ?? "");
    const phoneKey = phoneKey10(phone);
    if (digitsOnly(values.phone ?? "") && phoneKey.length !== 10) {
      warnings.push(`Phone “${values.phone}” did not read as a US number.`);
    }

    let name = [first, last].filter(Boolean).join(" ");
    if (!name) {
      if (email) {
        name = email;
        warnings.push("No name; the email address is used as the name.");
      } else {
        issues.push("No name or email.");
      }
    }

    const importedId = recordId ? (context.importedRecordIds?.get(recordId) ?? null) : null;
    let existing: Contact | undefined = importedId ? contactsById.get(importedId) : undefined;
    let matchedBy: HubSpotContactMatch = existing ? "record" : null;
    if (!existing && phoneKey.length === 10 && contactsByPhone.has(phoneKey)) {
      existing = contactsByPhone.get(phoneKey);
      matchedBy = "phone";
    } else if (!existing && email && contactsByEmail.has(email)) {
      existing = contactsByEmail.get(email);
      matchedBy = "email";
    }
    const key = existing
      ? `id:${existing.id}`
      : phoneKey.length === 10
        ? `phone:${phoneKey}`
        : email
          ? `email:${email}`
          : recordId
            ? `record:${recordId}`
            : name
              ? `name:${name.toLowerCase()}`
              : `line:${row.line}`;
    if (matchedBy === "record") warnings.push("Already imported; this run updates it.");
    else if (existing) warnings.push(`Already in Contacts as ${existing.name} (matched by ${matchedBy}); this run updates them.`);

    const firstLine = seenPeople.get(key);
    if (firstLine !== undefined) {
      excluded = true;
      warnings.push(`Same person as line ${firstLine}; left out so they are added once.`);
    } else {
      seenPeople.set(key, row.line);
    }

    if (recordId) {
      if (seenRecordIds.has(recordId)) issues.push(`Record ID ${recordId} appears twice in the file.`);
      seenRecordIds.add(recordId);
    } else {
      warnings.push("No Record ID; re-running this import matches by phone or email only.");
    }

    const ownerLabel = (values.owner ?? "").trim();
    let ownerStaffId = mapping.owners[ownerLabel] || "";
    if (!ownerStaffId) {
      ownerStaffId = mapping.defaultOwnerStaffId;
      if (ownerLabel) warnings.push(`Owner “${ownerLabel}” is not a seat; assigned to the default seat.`);
    }
    const owner = staffById.get(ownerStaffId);
    if (!owner) issues.push("No owner seat. Pick a default seat.");
    else if (owner.locked) issues.push(`${owner.name}'s seat is locked.`);
    const previousOwner = existing?.ownerStaffId ? staffById.get(existing.ownerStaffId) : undefined;
    if (existing && owner && existing.ownerStaffId && existing.ownerStaffId !== owner.id) {
      warnings.push(`Moves from ${previousOwner?.name ?? "another seat"} to ${owner.name}.`);
    }

    const isReferralPartner = mapping.referralPartner;
    const fileTitle = (values.jobTitle ?? "").replace(/\s+/g, " ").trim();
    const title = fileTitle || hubspotContactTitle(isReferralPartner);

    const companyName = cleanCompanyName(values.companyName);
    let company: HubSpotContactCompany | null = null;
    if (companyName) {
      const target = mapping.companies[companyName] ?? guessCompanyType(companyName);
      const existingClient = clientsByKey.get(companyKey(companyName));
      company = {
        key: companyKey(companyName),
        name: existingClient?.name ?? companyName,
        hubspotId: (values.companyId ?? "").trim(),
        type: target,
        existingId: existingClient?.id ?? null,
      };
      if (existing?.clientId && existingClient && existing.clientId !== existingClient.id) {
        warnings.push("Already linked to a different company; that link is kept.");
      }
    }

    const createdAt = parseHubSpotDate(values.createDate);
    if (values.createDate && !createdAt) warnings.push(`Create date “${values.createDate}” did not parse.`);
    const lastActivityAt = parseHubSpotDate(values.lastActivity);
    if (values.lastActivity && !lastActivityAt) warnings.push(`Last activity “${values.lastActivity}” did not parse.`);

    return {
      line: row.line,
      recordId,
      name: existing?.name?.trim() ? existing.name : name,
      first,
      last,
      title,
      titleFromFile: Boolean(fileTitle),
      email,
      phone,
      ownerLabel,
      ownerStaffId: owner ? owner.id : "",
      ownerName: owner?.name ?? "",
      isReferralPartner,
      company,
      leadStatus,
      marketingStatus,
      createdAt: createdAt ?? now.toISOString(),
      lastActivityAt,
      existingId: existing?.id ?? null,
      matchedBy,
      previousOwnerStaffId: existing?.ownerStaffId || null,
      previousOwnerName: previousOwner?.name ?? "",
      key,
      issues,
      warnings,
      excluded,
    };
  });
}

// ---------------------------------------------------------------------------
// Row overrides from the Verify table

export type HubSpotContactRowOverride = {
  ownerStaffId?: string;
  isReferralPartner?: boolean;
  companyType?: HubSpotCompanyTarget;
  excluded?: boolean;
};

const OWNER_ISSUE = /owner seat|seat is locked/i;
const OWNER_NOTE = /assigned to the default seat|^moves from /i;

export function overrideHubSpotContactDraft(
  draft: HubSpotContactDraft,
  override: HubSpotContactRowOverride | undefined,
  staff: StaffMember[],
): HubSpotContactDraft {
  if (!override) return draft;
  let next = draft;
  if (override.ownerStaffId !== undefined && override.ownerStaffId !== draft.ownerStaffId) {
    const owner = staff.find((member) => member.id === override.ownerStaffId);
    const issues = next.issues.filter((issue) => !OWNER_ISSUE.test(issue));
    if (!owner) issues.push("No owner seat. Pick a default seat.");
    else if (owner.locked) issues.push(`${owner.name}'s seat is locked.`);
    const warnings = next.warnings.filter((warning) => !OWNER_NOTE.test(warning));
    if (owner && next.previousOwnerStaffId && next.previousOwnerStaffId !== owner.id) {
      warnings.push(`Moves from ${next.previousOwnerName || "another seat"} to ${owner.name}.`);
    }
    next = { ...next, ownerStaffId: owner ? owner.id : "", ownerName: owner?.name ?? "", issues, warnings };
  }
  if (override.isReferralPartner !== undefined && override.isReferralPartner !== draft.isReferralPartner) {
    next = {
      ...next,
      isReferralPartner: override.isReferralPartner,
      title: next.titleFromFile ? next.title : hubspotContactTitle(override.isReferralPartner),
    };
  }
  if (override.companyType !== undefined && next.company && override.companyType !== next.company.type) {
    next = { ...next, company: { ...next.company, type: override.companyType } };
  }
  if (override.excluded !== undefined && override.excluded !== draft.excluded) {
    next = { ...next, excluded: override.excluded };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Verify summary

export type HubSpotContactsSummary = {
  total: number;
  ready: number;
  blocked: number;
  excluded: number;
  /** Ready rows that update a contact already in Truss. */
  updates: number;
  newContacts: number;
  referralPartners: number;
  newCompanies: number;
  matchedCompanies: number;
  byOwner: Array<{ staffId: string; name: string; count: number; partners: number }>;
  byLeadStatus: Array<{ status: string; count: number }>;
};

export function isReadyHubSpotContactDraft(draft: HubSpotContactDraft) {
  return !draft.excluded && draft.issues.length === 0;
}

export function summarizeHubSpotContactDrafts(drafts: HubSpotContactDraft[]): HubSpotContactsSummary {
  const ready = drafts.filter(isReadyHubSpotContactDraft);
  const byOwner = new Map<string, { name: string; count: number; partners: number }>();
  const byLeadStatus = new Map<string, number>();
  const companies = new Map<string, boolean>();
  for (const draft of ready) {
    const owner = byOwner.get(draft.ownerStaffId) ?? { name: draft.ownerName, count: 0, partners: 0 };
    owner.count += 1;
    if (draft.isReferralPartner) owner.partners += 1;
    byOwner.set(draft.ownerStaffId, owner);
    byLeadStatus.set(draft.leadStatus, (byLeadStatus.get(draft.leadStatus) ?? 0) + 1);
    if (draft.company && draft.company.type !== "skip" && !companies.has(draft.company.key)) {
      companies.set(draft.company.key, Boolean(draft.company.existingId));
    }
  }
  return {
    total: drafts.length,
    ready: ready.length,
    blocked: drafts.filter((draft) => !draft.excluded && draft.issues.length > 0).length,
    excluded: drafts.filter((draft) => draft.excluded).length,
    updates: ready.filter((draft) => draft.existingId).length,
    newContacts: ready.filter((draft) => !draft.existingId).length,
    referralPartners: ready.filter((draft) => draft.isReferralPartner).length,
    newCompanies: [...companies.values()].filter((existing) => !existing).length,
    matchedCompanies: [...companies.values()].filter((existing) => existing).length,
    byOwner: [...byOwner.entries()]
      .map(([staffId, entry]) => ({ staffId, ...entry }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    byLeadStatus: [...byLeadStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status)),
  };
}

/** Rows that were not imported, as a CSV the office can fix and upload again. */
export function hubspotContactsSkippedCsv(drafts: HubSpotContactDraft[]) {
  const rows = drafts.filter((draft) => !isReadyHubSpotContactDraft(draft));
  const header = ["Line", "Record ID", "First Name", "Last Name", "Email", "Phone Number", "Contact owner", "Why"];
  const lines = [
    header,
    ...rows.map((draft) => [
      String(draft.line),
      draft.recordId,
      draft.first,
      draft.last,
      draft.email,
      draft.phone,
      draft.ownerLabel,
      [...draft.issues, ...draft.warnings].join(" "),
    ]),
  ];
  return `${lines.map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
}

/** The import's own export: the HubSpot contacts template columns, one sample row. */
export const HUBSPOT_CONTACTS_TEMPLATE_HEADERS = [
  "Record ID",
  "First Name",
  "Last Name",
  "Email",
  "Phone Number",
  "Contact owner",
  "Primary Associated Company ID",
  "Last Activity Date",
  "Lead Status",
  "Marketing contact status",
  "Create Date",
  "Associated Company",
] as const;

export const HUBSPOT_CONTACTS_TEMPLATE_CSV = `${HUBSPOT_CONTACTS_TEMPLATE_HEADERS.join(",")}
3001,Dana,Alvarez,dana@example.com,(214) 555-0142,Brady Jones,9876543210,2025-02-11 10:04,Open,Marketing contact,2024-06-03 09:12,Compass Real Estate
`;
