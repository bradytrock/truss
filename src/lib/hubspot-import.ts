import { parseDelimited } from "@/lib/catalog-csv";
import { parseLocation } from "@/lib/job-record";
import { DEFAULT_LEAD_STATE, formatJobSite, leadName } from "@/lib/leads";
import { digitsOnly, storedPhone } from "@/lib/phone";
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  type Contact,
  type JobStatus,
  type LeadSource,
  type PipelineStage,
  type StaffMember,
} from "@/lib/types";
import { WORK_COLUMNS, WORK_COLUMN_LABELS, patchForWorkColumn, type WorkColumn } from "@/lib/work-board";

/**
 * HubSpot deal export → Truss contacts, leads, and jobs.
 *
 * Everything in this file is pure. The same `applyHubSpotMapping` call feeds the
 * Verify screen and the store write, so what the office checks is what lands.
 */

export const HUBSPOT_SOURCE = "hubspot";

export type HubSpotField =
  | "recordId"
  | "dealName"
  | "stage"
  | "pipeline"
  | "amount"
  | "createDate"
  | "closeDate"
  | "owner"
  | "pmName"
  | "assignees"
  | "clientName"
  | "clientEmail"
  | "clientPhone"
  | "clientAddress"
  | "description"
  | "lostReason"
  | "wonReason"
  | "dealType"
  | "priority"
  | "nextStep"
  | "tags"
  | "source"
  | "lastActivity";

const FIELD_ALIASES: Record<HubSpotField, string[]> = {
  recordId: ["record id", "deal id", "hs object id", "object id", "id"],
  dealName: ["deal name", "deal", "name"],
  stage: ["deal stage", "stage", "dealstage"],
  pipeline: ["pipeline"],
  amount: ["amount", "amount in company currency", "deal amount", "value", "contract value"],
  createDate: ["create date", "created date", "created at", "createdate", "date created"],
  closeDate: ["close date", "closed date", "closedate", "date closed"],
  owner: ["deal owner", "owner", "hubspot owner", "sales rep", "assigned to"],
  pmName: ["pm name", "project manager", "pm"],
  assignees: [
    "also assigned",
    "assigned crew",
    "additional owners",
    "other owners",
    "deal collaborators",
    "collaborators",
    "team members",
  ],
  clientName: ["client name", "contact name", "customer name", "homeowner", "homeowner name", "associated contact"],
  clientEmail: ["client email", "contact email", "customer email", "email", "homeowner email"],
  clientPhone: ["client phone", "contact phone", "customer phone", "phone", "phone number", "mobile", "homeowner phone"],
  clientAddress: ["client address", "address", "job address", "property address", "site address", "street address"],
  description: ["deal description", "description", "notes"],
  lostReason: ["closed lost reason", "lost reason"],
  wonReason: ["closed won reason", "won reason"],
  dealType: ["deal type"],
  priority: ["priority"],
  nextStep: ["next step", "next steps"],
  tags: ["deal tags", "tags"],
  source: ["how did they find us", "how did you hear about us", "lead source", "source", "referral source"],
  lastActivity: ["last activity date", "last activity"],
};

/** Without these there is nothing to put on the board. */
export const HUBSPOT_REQUIRED_FIELDS: Array<{ field: HubSpotField; label: string }> = [
  { field: "stage", label: "Deal Stage" },
];

export const HUBSPOT_FIELD_LABELS: Record<HubSpotField, string> = {
  recordId: "Record ID",
  dealName: "Deal Name",
  stage: "Deal Stage",
  pipeline: "Pipeline",
  amount: "Amount",
  createDate: "Create Date",
  closeDate: "Close Date",
  owner: "Deal owner",
  pmName: "PM Name",
  assignees: "Also assigned",
  clientName: "Client Name",
  clientEmail: "Client Email",
  clientPhone: "Client Phone",
  clientAddress: "Client Address",
  description: "Deal Description",
  lostReason: "Closed Lost Reason",
  wonReason: "Closed Won Reason",
  dealType: "Deal Type",
  priority: "Priority",
  nextStep: "Next step",
  tags: "Deal Tags",
  source: "How Did They Find Us?",
  lastActivity: "Last Activity Date",
};

export type HubSpotRawRow = {
  /** 1-based line in the file, for the issues list. */
  line: number;
  values: Partial<Record<HubSpotField, string>>;
};

export type HubSpotDistinct = { value: string; count: number };

export type HubSpotParsed = {
  rows: HubSpotRawRow[];
  /** Original header text for every column we recognized. */
  columns: Partial<Record<HubSpotField, string>>;
  /** Header text for columns we ignored. */
  ignoredColumns: string[];
  missingRequired: string[];
  pipelines: HubSpotDistinct[];
  stages: Array<HubSpotDistinct & { pipeline: string }>;
  owners: HubSpotDistinct[];
  sources: HubSpotDistinct[];
};

export function normalizeHubSpotHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Match export headers to fields. Exact aliases, in alias order, so "Client Email" wins over a generic "Email". */
export function detectHubSpotColumns<F extends string>(headers: string[], aliases: Record<F, string[]>) {
  const normalized = headers.map(normalizeHubSpotHeader);
  const columns: Partial<Record<F, number>> = {};
  const claimed = new Set<number>();
  for (const field of Object.keys(aliases) as F[]) {
    for (const alias of aliases[field]) {
      const index = normalized.findIndex((header, at) => header === alias && !claimed.has(at));
      if (index >= 0) {
        columns[field] = index;
        claimed.add(index);
        break;
      }
    }
  }
  return columns;
}

function detectColumns(headers: string[]) {
  return detectHubSpotColumns(headers, FIELD_ALIASES);
}

/**
 * One cell can name several people. HubSpot multi-select values are separated
 * by semicolons. "Jones, Brady" stays one person.
 */
export function splitHubSpotPeople(raw: string | undefined): string[] {
  const seen = new Set<string>();
  const people: string[] = [];
  for (const part of (raw ?? "").split(/[;|\n]+/)) {
    const name = part.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    people.push(name);
  }
  return people;
}

function peopleOnHubSpotRow(row: HubSpotRawRow) {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const label of [
    ...splitHubSpotPeople(row.values.owner),
    ...splitHubSpotPeople(row.values.pmName),
    ...splitHubSpotPeople(row.values.assignees),
  ]) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

export function tallyHubSpotValues(values: string[]): HubSpotDistinct[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

export function parseHubSpotCsv(text: string): HubSpotParsed {
  if (text.includes("\u0000") || text.startsWith("PK")) {
    throw new Error("This looks like an Excel workbook. In HubSpot, export as CSV and upload that file.");
  }
  const table = parseDelimited(text);
  if (table.length === 0) throw new Error("The file is empty.");
  const headers = table[0] ?? [];
  const columns = detectColumns(headers);
  const missingRequired = HUBSPOT_REQUIRED_FIELDS.filter((item) => columns[item.field] === undefined).map(
    (item) => item.label,
  );
  if (columns.clientName === undefined && columns.dealName === undefined) {
    missingRequired.push("Client Name or Deal Name");
  }
  const used = new Set(Object.values(columns));
  const ignoredColumns = headers.filter((_, index) => !used.has(index)).map((header) => header.trim()).filter(Boolean);

  const rows: HubSpotRawRow[] = [];
  table.slice(1).forEach((cells, index) => {
    const values: Partial<Record<HubSpotField, string>> = {};
    let any = false;
    for (const [field, at] of Object.entries(columns) as Array<[HubSpotField, number]>) {
      const raw = (cells[at] ?? "").trim();
      if (raw) any = true;
      values[field] = raw;
    }
    if (!any) return;
    rows.push({ line: index + 2, values });
  });

  const stageCounts = new Map<string, { count: number; pipeline: string }>();
  for (const row of rows) {
    const stage = row.values.stage?.trim() ?? "";
    if (!stage) continue;
    const entry = stageCounts.get(stage) ?? { count: 0, pipeline: row.values.pipeline?.trim() ?? "" };
    entry.count += 1;
    stageCounts.set(stage, entry);
  }

  const columnLabels: Partial<Record<HubSpotField, string>> = {};
  for (const [field, at] of Object.entries(columns) as Array<[HubSpotField, number]>) {
    columnLabels[field] = headers[at]?.trim() ?? "";
  }

  return {
    rows,
    columns: columnLabels,
    ignoredColumns,
    missingRequired,
    pipelines: tallyHubSpotValues(rows.map((row) => row.values.pipeline ?? "")),
    stages: [...stageCounts.entries()]
      .map(([value, entry]) => ({ value, count: entry.count, pipeline: entry.pipeline }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)),
    owners: tallyHubSpotValues(rows.flatMap((row) => peopleOnHubSpotRow(row))),
    sources: tallyHubSpotValues(rows.map((row) => row.values.source ?? "")),
  };
}

// ---------------------------------------------------------------------------
// Mapping

export type HubSpotStageTarget = WorkColumn | "skip";

export const HUBSPOT_STAGE_TARGETS: HubSpotStageTarget[] = [
  ...WORK_COLUMNS.filter((column) => column !== "deleted"),
  "skip",
];

export function stageTargetLabel(target: HubSpotStageTarget) {
  return target === "skip" ? "Skip these deals" : WORK_COLUMN_LABELS[target];
}

export type HubSpotMapping = {
  /** HubSpot stage text → board column (or skip). */
  stages: Record<string, HubSpotStageTarget>;
  /** HubSpot owner / PM text → Truss staff id. Empty string falls back to the default owner. */
  owners: Record<string, string>;
  /** Seat that takes every deal whose owner is blank or unmapped. */
  defaultOwnerStaffId: string;
  /** "How Did They Find Us?" text → seed. Empty string leaves the seed blank. */
  sources: Record<string, LeadSource | "">;
  /** Pipelines to bring in. Missing keys are included. */
  pipelines: Record<string, boolean>;
};

const STAGE_GUESSES: Array<{ test: RegExp; target: HubSpotStageTarget }> = [
  { test: /\b(closed\s*won|won|sold|complete|completed|paid|finished|closed\s*paid)\b/i, target: "complete" },
  { test: /\b(closed\s*lost|lost|dead|cancel+ed|declined)\b/i, target: "lost" },
  { test: /\b(unqualified|disqualified|bad\s*fit|spam|junk|not\s*a\s*fit)\b/i, target: "unqualified" },
  { test: /\b(supplement|supplementing)\b/i, target: "supplementing" },
  { test: /\b(punch|final\s*walk|walk\s*through|walkthrough|inspection\s*final)\b/i, target: "punch" },
  { test: /\b(on\s*hold|hold|paused|waiting)\b/i, target: "on_hold" },
  { test: /\b(in\s*progress|production|install|installing|installed|build|building|contract\s*signed|signed|job\s*sold)\b/i, target: "in_progress" },
  { test: /\b(proposal|quote|quoted|estimate\s*sent|contract\s*sent|presentation|decision\s*maker|sent|pending|negotiat)/i, target: "proposal_sent" },
];

export function guessStageTarget(stage: string): HubSpotStageTarget {
  const text = stage.trim();
  if (!text) return "lead";
  for (const guess of STAGE_GUESSES) {
    if (guess.test.test(text)) return guess.target;
  }
  return "lead";
}

const SOURCE_GUESSES: Array<{ test: RegExp; source: LeadSource }> = [
  { test: /podium/i, source: "podium" },
  { test: /\b(google\s*ads?|adwords|paid\s*search|ppc|lsa|local\s*service)/i, source: "google_ad" },
  { test: /\b(angi|angie|home\s*advisor|homeadvisor|thumbtack|yelp)/i, source: "angies_list" },
  { test: /\b(realtor|real\s*estate|agent|broker)/i, source: "realtor" },
  { test: /\b(past\s*client|repeat|previous|existing|returning|prior)/i, source: "past_client" },
  { test: /\b(referr|word\s*of\s*mouth|friend|neighbor|neighbour|family|recommend)/i, source: "referral" },
  { test: /\b(facebook|instagram|social|tiktok|nextdoor|youtube|linkedin|meta)\b/i, source: "social_media" },
  { test: /\b(chatgpt|chat\s*gpt|openai|ai\s*search|gemini|perplexity)/i, source: "chatgpt" },
  { test: /\b(text|sms|message)/i, source: "text_main_line" },
  { test: /\b(phone|call|called|inbound\s*call)/i, source: "phone" },
  { test: /\b(sales|door|canvass|knock|yard\s*sign|truck|wrap|storm|rep)\b/i, source: "sales_team" },
  { test: /\b(google|search|organic|seo|website|web|online|internet|site|direct)\b/i, source: "website" },
];

export function guessLeadSource(value: string): LeadSource | "" {
  const text = value.trim();
  if (!text) return "";
  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if ((LEAD_SOURCES as readonly string[]).includes(key)) return key as LeadSource;
  for (const source of LEAD_SOURCES) {
    if (LEAD_SOURCE_LABELS[source].toLowerCase() === text.toLowerCase()) return source;
  }
  for (const guess of SOURCE_GUESSES) {
    if (guess.test.test(text)) return guess.source;
  }
  return "";
}

function nameTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9@. ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Match a HubSpot owner label ("Brady Jones", "brady@…", "Jones, Brady") to a seat. */
export function guessOwnerStaffId(label: string, staff: StaffMember[]): string {
  const text = label.trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const active = staff.filter((member) => !member.locked);
  const pool = active.length ? active : staff;
  const exact = pool.find((member) => member.name.trim().toLowerCase() === lower);
  if (exact) return exact.id;
  const email = pool.find((member) => member.email && lower.includes(member.email.trim().toLowerCase()));
  if (email) return email.id;
  const tokens = nameTokens(text).filter((token) => !token.includes("@"));
  if (tokens.length === 0) return "";
  const scored = pool
    .map((member) => {
      const memberTokens = nameTokens(member.name);
      const hits = tokens.filter((token) => memberTokens.includes(token)).length;
      return { member, hits, total: memberTokens.length };
    })
    .filter((entry) => entry.hits > 0)
    .sort((left, right) => right.hits - left.hits);
  if (scored.length === 0) return "";
  const best = scored[0];
  const tie = scored.length > 1 && scored[1].hits === best.hits;
  if (tie) return "";
  // One shared token ("Brady") is enough when it is the only match; otherwise ask for the full name.
  if (best.hits >= 2 || (best.hits === 1 && scored.length === 1)) return best.member.id;
  return "";
}

export function defaultHubSpotMapping(parsed: HubSpotParsed, staff: StaffMember[], fallbackOwnerId: string): HubSpotMapping {
  const stages: Record<string, HubSpotStageTarget> = {};
  for (const stage of parsed.stages) stages[stage.value] = guessStageTarget(stage.value);
  const owners: Record<string, string> = {};
  for (const owner of parsed.owners) owners[owner.value] = guessOwnerStaffId(owner.value, staff);
  const sources: Record<string, LeadSource | ""> = {};
  for (const source of parsed.sources) sources[source.value] = guessLeadSource(source.value);
  const pipelines: Record<string, boolean> = {};
  for (const pipeline of parsed.pipelines) pipelines[pipeline.value] = true;
  return { stages, owners, defaultOwnerStaffId: fallbackOwnerId, sources, pipelines };
}

// ---------------------------------------------------------------------------
// Value parsing

export function parseHubSpotAmount(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!text) return 0;
  const negative = /^\(.*\)$/.test(text) || text.includes("-");
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return negative ? -Math.round(amount * 100) / 100 : Math.round(amount * 100) / 100;
}

/**
 * HubSpot writes dates a few ways depending on the portal: `2024-03-15`,
 * `2024-03-15 14:22`, `2024-03-15T14:22:00Z`, `3/15/2024`, `03/15/2024 2:22 PM`,
 * `Mar 15, 2024`. Returns an ISO string or null when nothing parses.
 */
export function parseHubSpotDate(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, year, month, day, hour, minute, second] = iso;
    const hasZone = /(z|[+-]\d{2}:?\d{2})$/i.test(text);
    if (hasZone) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 12,
      minute ? Number(minute) : 0,
      second ? Number(second) : 0,
    );
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  if (us) {
    const [, month, day, yearRaw, hourRaw, minute, second, meridiem] = us;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    let hour = hourRaw ? Number(hourRaw) : 12;
    if (meridiem) {
      const pm = meridiem.toLowerCase() === "pm";
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const date = new Date(year, Number(month) - 1, Number(day), hour, minute ? Number(minute) : 0, second ? Number(second) : 0);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  return null;
}

export type HubSpotAddress = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  raw: string;
};

const CITY_STATE_ZIP = /^(.*?)[,\s]+([A-Za-z]{2})\.?\s*(\d{5}(?:-\d{4})?)?$/;
const STATE_ZIP = /^([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/;

/** HubSpot keeps the address as one text box; people type it every way there is. */
export function parseHubSpotAddress(raw: string | undefined): HubSpotAddress {
  const text = (raw ?? "")
    .replace(/\r?\n/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*(USA|United States|US)\.?$/i, "")
    .trim();
  if (!text) return { street: "", city: "", state: "", postalCode: "", raw: "" };
  const parsed = parseLocation(text);
  let { street, city, state, postalCode } = parsed;
  if (!state && city) {
    const match = city.match(CITY_STATE_ZIP);
    if (match && match[2]) {
      city = match[1].trim();
      state = match[2].toUpperCase();
      postalCode = match[3] ?? "";
    }
  }
  if (!state && !city && street) {
    // "123 Main St Dallas TX 75201" with no commas at all.
    const match = street.match(/^(.*\S)\s+(\S.*?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (match) {
      street = match[1].trim();
      city = match[2].trim();
      state = match[3].toUpperCase();
      postalCode = match[4];
    }
  }
  if (city && !state) {
    const match = city.match(STATE_ZIP);
    if (match) {
      city = "";
      state = match[1].toUpperCase();
      postalCode = match[2];
    }
  }
  if (state && state.length === 2) state = state.toUpperCase();
  return { street: street.trim(), city: city.trim(), state: state.trim(), postalCode: postalCode.trim(), raw: text };
}

export function splitHubSpotTags(raw: string | undefined) {
  return (raw ?? "")
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Drafts

export type HubSpotContactMatch = "phone" | "email" | null;

export type HubSpotDealDraft = {
  line: number;
  recordId: string;
  dealName: string;
  pipeline: string;
  stageLabel: string;
  /** Resolved board column (never "skip"; skipped rows are flagged `excluded`). */
  column: WorkColumn;
  status: JobStatus;
  stage: PipelineStage | null;
  /** The job and lead name on the board. */
  name: string;
  ownerLabel: string;
  ownerStaffId: string;
  ownerName: string;
  /** Everyone on the job, primary seat first. */
  assigneeStaffIds: string[];
  assigneeNames: string[];
  /** Project manager when the file names one; otherwise the primary seat. */
  projectManagerName: string;
  sourceLabel: string;
  leadSource: LeadSource | "";
  contact: {
    name: string;
    first: string;
    last: string;
    phone: string;
    email: string;
    /** Existing Truss contact that this deal attaches to. */
    existingId: string | null;
    matchedBy: HubSpotContactMatch;
    /** Deals in the same file that share a person share this key. */
    key: string;
  };
  address: HubSpotAddress;
  amount: number;
  createdAt: string;
  closeDate: string | null;
  notes: string;
  nextStep: string;
  lostReason: string;
  tags: string[];
  /** Already in Truss from an earlier import; the import updates instead of adding. */
  existingOpportunityId: string | null;
  /** Hard problems: the row cannot be imported until it is fixed or excluded. */
  issues: string[];
  /** Soft notes shown on Verify. */
  warnings: string[];
  excluded: boolean;
};

export type HubSpotImportResult = {
  created: number;
  updated: number;
  contactsCreated: number;
  contactsMatched: number;
  skipped: number;
};

export type HubSpotApplyContext = {
  staff: StaffMember[];
  contacts: Contact[];
  /** HubSpot Record ID → Truss opportunity id for deals already imported. */
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

export function applyHubSpotMapping(
  parsed: HubSpotParsed,
  mapping: HubSpotMapping,
  context: HubSpotApplyContext,
): HubSpotDealDraft[] {
  const now = context.now ?? new Date();
  const contactsByPhone = new Map<string, Contact>();
  const contactsByEmail = new Map<string, Contact>();
  for (const contact of context.contacts) {
    const phone = phoneKey10(contact.phone);
    if (phone.length === 10 && !contactsByPhone.has(phone)) contactsByPhone.set(phone, contact);
    const email = emailKey(contact.email);
    if (email && !contactsByEmail.has(email)) contactsByEmail.set(email, contact);
  }
  const seenRecordIds = new Set<string>();

  return parsed.rows.map((row) => {
    const values = row.values;
    const issues: string[] = [];
    const warnings: string[] = [];

    const recordId = (values.recordId ?? "").trim();
    const pipeline = (values.pipeline ?? "").trim();
    const stageLabel = (values.stage ?? "").trim();
    const target = mapping.stages[stageLabel] ?? guessStageTarget(stageLabel);
    const pipelineIncluded = pipeline ? mapping.pipelines[pipeline] !== false : true;
    let excluded = false;
    if (!pipelineIncluded) {
      excluded = true;
      warnings.push(`Pipeline “${pipeline}” is left out.`);
    }
    if (target === "skip") {
      excluded = true;
      warnings.push(`Stage “${stageLabel || "blank"}” is set to skip.`);
    }
    const column: WorkColumn = target === "skip" ? "lead" : target;
    const patch = patchForWorkColumn(column);

    const contactName = (values.clientName ?? "").replace(/\s+/g, " ").trim();
    const dealName = (values.dealName ?? "").replace(/\s+/g, " ").trim();
    const parts = contactName.split(" ").filter(Boolean);
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? "");
    const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : (parts[0] ?? "");
    if (!contactName && !dealName) issues.push("No client name or deal name.");

    const phone = storedPhone(values.clientPhone ?? "");
    const rawPhoneDigits = digitsOnly(values.clientPhone ?? "");
    if (rawPhoneDigits && !phone) warnings.push(`Phone “${values.clientPhone}” did not read as a US number.`);
    const email = emailKey(values.clientEmail ?? "");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnings.push(`Email “${values.clientEmail}” looks off.`);

    let existing: Contact | undefined;
    let matchedBy: HubSpotContactMatch = null;
    const phoneKey = phoneKey10(phone);
    if (phoneKey.length === 10 && contactsByPhone.has(phoneKey)) {
      existing = contactsByPhone.get(phoneKey);
      matchedBy = "phone";
    } else if (email && contactsByEmail.has(email)) {
      existing = contactsByEmail.get(email);
      matchedBy = "email";
    }
    const contactKey = existing
      ? `id:${existing.id}`
      : phoneKey.length === 10
        ? `phone:${phoneKey}`
        : email
          ? `email:${email}`
          : contactName
            ? `name:${contactName.toLowerCase()}`
            : `line:${row.line}`;
    if (!existing && !contactName) warnings.push("No client name; the deal name is used for the homeowner.");

    const address = parseHubSpotAddress(values.clientAddress);
    if (address.raw && !address.city) warnings.push("Address has no city; check the street line.");
    if (address.street && address.city && !address.state) {
      address.state = DEFAULT_LEAD_STATE;
      warnings.push(`State missing; set to ${DEFAULT_LEAD_STATE}.`);
    }
    const site = formatJobSite(address);

    const amount = parseHubSpotAmount(values.amount);
    let value = 0;
    if (amount == null) issues.push(`Amount “${values.amount}” is not a number.`);
    else if (amount < 0) {
      warnings.push(`Amount ${values.amount} is negative; saved as $0.`);
    } else value = amount;

    const createdAt = parseHubSpotDate(values.createDate);
    if (values.createDate && !createdAt) warnings.push(`Create date “${values.createDate}” did not parse; using today.`);
    const closeIso = parseHubSpotDate(values.closeDate);
    if (values.closeDate && !closeIso) warnings.push(`Close date “${values.closeDate}” did not parse.`);

    const crew = collectHubSpotAssignees(values, mapping, context.staff);
    issues.push(...crew.issues);
    warnings.push(...crew.warnings);

    const sourceLabel = (values.source ?? "").trim();
    const leadSource = sourceLabel ? (mapping.sources[sourceLabel] ?? guessLeadSource(sourceLabel)) : "";

    if (recordId) {
      if (seenRecordIds.has(recordId)) issues.push(`Record ID ${recordId} appears twice in the file.`);
      seenRecordIds.add(recordId);
    } else {
      warnings.push("No Record ID; re-running this import would add the deal again.");
    }
    const existingOpportunityId = recordId ? (context.importedRecordIds?.get(recordId) ?? null) : null;
    if (existingOpportunityId) warnings.push("Already imported; this run updates it.");

    const personName = contactName || dealName;
    const name = dealName || leadName(first, last, site || address.city);

    const tags = splitHubSpotTags(values.tags);
    const priority = (values.priority ?? "").trim();
    if (priority && !/^(none|low|medium)$/i.test(priority)) tags.push(`Priority: ${priority}`);
    const dealType = (values.dealType ?? "").trim();
    if (dealType) tags.push(dealType);

    const noteParts = [(values.description ?? "").trim()];
    const wonReason = (values.wonReason ?? "").trim();
    if (wonReason) noteParts.push(`Closed won reason: ${wonReason}`);
    const notes = noteParts.filter(Boolean).join("\n\n");

    return {
      line: row.line,
      recordId,
      dealName,
      pipeline,
      stageLabel,
      column,
      status: patch.status,
      stage: patch.stage,
      name,
      ownerLabel: crew.ownerLabel,
      ownerStaffId: crew.ownerStaffId,
      ownerName: crew.ownerName,
      assigneeStaffIds: crew.assigneeStaffIds,
      assigneeNames: crew.assigneeNames,
      projectManagerName: crew.projectManagerName,
      sourceLabel,
      leadSource,
      contact: {
        name: existing?.name ?? personName,
        first,
        last,
        phone,
        email,
        existingId: existing?.id ?? null,
        matchedBy,
        key: contactKey,
      },
      address,
      amount: value,
      createdAt: createdAt ?? now.toISOString(),
      closeDate: closeIso ? closeIso.slice(0, 10) : null,
      notes,
      nextStep: (values.nextStep ?? "").trim(),
      lostReason: (values.lostReason ?? "").trim(),
      tags: [...new Set(tags)],
      existingOpportunityId,
      issues,
      warnings,
      excluded,
    };
  });
}

// ---------------------------------------------------------------------------
// Row overrides from the Verify table

export type HubSpotRowOverride = {
  column?: WorkColumn;
  ownerStaffId?: string;
  /** Full crew, including the primary seat. The primary is kept even if omitted. */
  assigneeStaffIds?: string[];
  leadSource?: LeadSource | "";
  excluded?: boolean;
};

const OWNER_ISSUE = /owner seat|seat is locked/i;

type HubSpotCrew = {
  ownerStaffId: string;
  ownerName: string;
  ownerLabel: string;
  assigneeStaffIds: string[];
  assigneeNames: string[];
  projectManagerName: string;
  issues: string[];
  warnings: string[];
};

function lookupMappedStaff(label: string, mapping: HubSpotMapping, staffById: Map<string, StaffMember>) {
  const id = mapping.owners[label] ?? "";
  if (!id) return undefined;
  return staffById.get(id);
}

/** Deal owner is the seat. A PM and any other named people are assigned too. */
function collectHubSpotAssignees(
  values: Partial<Record<HubSpotField, string>>,
  mapping: HubSpotMapping,
  staff: StaffMember[],
): HubSpotCrew {
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const ownerLabels = splitHubSpotPeople(values.owner);
  const pmLabels = splitHubSpotPeople(values.pmName);
  const extraLabels = splitHubSpotPeople(values.assignees);
  const issues: string[] = [];
  const warnings: string[] = [];
  const groups = [
    ...ownerLabels.map((label) => ({ label, kind: "owner" as const, member: lookupMappedStaff(label, mapping, staffById) })),
    ...pmLabels.map((label) => ({ label, kind: "pm" as const, member: lookupMappedStaff(label, mapping, staffById) })),
    ...extraLabels.map((label) => ({ label, kind: "extra" as const, member: lookupMappedStaff(label, mapping, staffById) })),
  ];

  const primary = groups.find((item) => item.member)?.member;
  let owner = primary;
  const named = ownerLabels.length + pmLabels.length + extraLabels.length > 0;
  const fallbackLabel = ownerLabels[0] || pmLabels[0] || extraLabels[0] || "";
  if (!owner) {
    owner = mapping.defaultOwnerStaffId ? staffById.get(mapping.defaultOwnerStaffId) : undefined;
    if (named && fallbackLabel) {
      warnings.push(`Owner “${fallbackLabel}” is not a seat; assigned to the default owner.`);
    }
  }
  if (!owner) issues.push("No owner seat. Pick a default owner.");
  else if (owner.locked) issues.push(`${owner.name}'s seat is locked.`);

  const warned = new Set<string>();
  if (!primary && fallbackLabel) warned.add(fallbackLabel.toLowerCase());

  const assigneeStaffIds: string[] = [];
  const assigneeNames: string[] = [];
  const push = (member: StaffMember) => {
    if (assigneeStaffIds.includes(member.id)) return;
    assigneeStaffIds.push(member.id);
    assigneeNames.push(member.name);
  };
  if (owner) push(owner);

  let projectManagerName = "";
  for (const item of groups) {
    if (!item.member) {
      const key = item.label.toLowerCase();
      if (warned.has(key)) continue;
      warned.add(key);
      warnings.push(`“${item.label}” is not a seat and was left off the job.`);
      continue;
    }
    if (item.member.locked && item.member.id !== owner?.id) {
      warnings.push(`${item.member.name}'s seat is locked, so they were left off the job.`);
      continue;
    }
    if (item.kind === "pm" && !item.member.locked && !projectManagerName) projectManagerName = item.member.name;
    push(item.member);
  }
  if (!projectManagerName) projectManagerName = owner?.name ?? "";

  return {
    ownerStaffId: owner?.id ?? "",
    ownerName: owner?.name ?? "",
    ownerLabel: ownerLabels.join("; ") || pmLabels.join("; ") || extraLabels.join("; "),
    assigneeStaffIds,
    assigneeNames,
    projectManagerName,
    issues,
    warnings,
  };
}

function crewFromIds(owner: StaffMember | undefined, ids: string[], staff: StaffMember[]) {
  const byId = new Map(staff.map((member) => [member.id, member]));
  const members: StaffMember[] = [];
  const seen = new Set<string>();
  for (const id of [owner?.id ?? "", ...ids]) {
    if (!id || seen.has(id)) continue;
    const member = byId.get(id);
    if (!member) continue;
    seen.add(id);
    members.push(member);
  }
  const issues: string[] = [];
  if (!owner) issues.push("No owner seat. Pick a default owner.");
  else if (owner.locked) issues.push(`${owner.name}'s seat is locked.`);
  for (const member of members) {
    if (owner && member.id !== owner.id && member.locked) issues.push(`${member.name}'s seat is locked.`);
  }
  return {
    assigneeStaffIds: members.map((member) => member.id),
    assigneeNames: members.map((member) => member.name),
    issues,
  };
}

export function overrideHubSpotDraft(
  draft: HubSpotDealDraft,
  override: HubSpotRowOverride | undefined,
  staff: StaffMember[],
): HubSpotDealDraft {
  if (!override) return draft;
  let next = draft;
  if (override.column && override.column !== draft.column) {
    const patch = patchForWorkColumn(override.column);
    next = { ...next, column: override.column, status: patch.status, stage: patch.stage };
  }
  if (override.ownerStaffId !== undefined && override.ownerStaffId !== draft.ownerStaffId) {
    const owner = staff.find((member) => member.id === override.ownerStaffId);
    const extras = next.assigneeStaffIds.filter((id) => id !== draft.ownerStaffId);
    // A lone seat change replaces that person. When others are already on the job, the previous seat stays with them.
    const keepPrevious = extras.length > 0 && draft.ownerStaffId && draft.ownerStaffId !== owner?.id;
    const crew = crewFromIds(owner, keepPrevious ? [draft.ownerStaffId, ...extras] : extras, staff);
    const projectManagerName =
      !next.projectManagerName || next.projectManagerName === draft.ownerName ? (owner?.name ?? "") : next.projectManagerName;
    next = {
      ...next,
      ownerStaffId: owner ? owner.id : "",
      ownerName: owner?.name ?? "",
      projectManagerName,
      assigneeStaffIds: crew.assigneeStaffIds,
      assigneeNames: crew.assigneeNames,
      issues: [...next.issues.filter((issue) => !OWNER_ISSUE.test(issue)), ...crew.issues],
      warnings: next.warnings.filter((warning) => !/assigned to the default owner/i.test(warning)),
    };
  }
  if (override.assigneeStaffIds !== undefined) {
    const owner = staff.find((member) => member.id === next.ownerStaffId);
    const crew = crewFromIds(owner, override.assigneeStaffIds, staff);
    const projectManagerName = crew.assigneeNames.includes(next.projectManagerName)
      ? next.projectManagerName
      : (owner?.name ?? "");
    next = {
      ...next,
      projectManagerName,
      assigneeStaffIds: crew.assigneeStaffIds,
      assigneeNames: crew.assigneeNames,
      issues: [...next.issues.filter((issue) => !OWNER_ISSUE.test(issue)), ...crew.issues],
    };
  }
  if (override.leadSource !== undefined && override.leadSource !== draft.leadSource) {
    next = { ...next, leadSource: override.leadSource };
  }
  if (override.excluded !== undefined && override.excluded !== draft.excluded) {
    next = { ...next, excluded: override.excluded };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Verify summary

export type HubSpotSummary = {
  total: number;
  ready: number;
  blocked: number;
  excluded: number;
  updates: number;
  newContacts: number;
  matchedContacts: number;
  byColumn: Array<{ column: WorkColumn; count: number; amount: number }>;
  byOwner: Array<{ staffId: string; name: string; count: number }>;
  bySource: Array<{ source: LeadSource | ""; count: number }>;
  totalAmount: number;
};

export function isReadyHubSpotDraft(draft: HubSpotDealDraft) {
  return !draft.excluded && draft.issues.length === 0;
}

export function summarizeHubSpotDrafts(drafts: HubSpotDealDraft[]): HubSpotSummary {
  const ready = drafts.filter(isReadyHubSpotDraft);
  const contactKeys = new Map<string, boolean>();
  for (const draft of ready) {
    if (!contactKeys.has(draft.contact.key)) contactKeys.set(draft.contact.key, Boolean(draft.contact.existingId));
  }
  const byColumn = new Map<WorkColumn, { count: number; amount: number }>();
  const byOwner = new Map<string, { name: string; count: number }>();
  const bySource = new Map<LeadSource | "", number>();
  let totalAmount = 0;
  for (const draft of ready) {
    const column = byColumn.get(draft.column) ?? { count: 0, amount: 0 };
    column.count += 1;
    column.amount += draft.amount;
    byColumn.set(draft.column, column);
    const owner = byOwner.get(draft.ownerStaffId) ?? { name: draft.ownerName, count: 0 };
    owner.count += 1;
    byOwner.set(draft.ownerStaffId, owner);
    bySource.set(draft.leadSource, (bySource.get(draft.leadSource) ?? 0) + 1);
    totalAmount += draft.amount;
  }
  return {
    total: drafts.length,
    ready: ready.length,
    blocked: drafts.filter((draft) => !draft.excluded && draft.issues.length > 0).length,
    excluded: drafts.filter((draft) => draft.excluded).length,
    updates: ready.filter((draft) => draft.existingOpportunityId).length,
    newContacts: [...contactKeys.values()].filter((existing) => !existing).length,
    matchedContacts: [...contactKeys.values()].filter((existing) => existing).length,
    byColumn: WORK_COLUMNS.filter((column) => byColumn.has(column)).map((column) => ({
      column,
      ...(byColumn.get(column) ?? { count: 0, amount: 0 }),
    })),
    byOwner: [...byOwner.entries()]
      .map(([staffId, entry]) => ({ staffId, ...entry }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    bySource: [...bySource.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count),
    totalAmount,
  };
}

/** Rows that were not imported, as a CSV the office can fix and upload again. */
export function hubspotSkippedCsv(drafts: HubSpotDealDraft[]) {
  const rows = drafts.filter((draft) => !isReadyHubSpotDraft(draft));
  const header = ["Line", "Record ID", "Deal Name", "Client Name", "Deal Stage", "Why"];
  const lines = [header, ...rows.map((draft) => [
    String(draft.line),
    draft.recordId,
    draft.dealName,
    draft.contact.name,
    draft.stageLabel,
    [...draft.issues, ...draft.warnings].join(" "),
  ])];
  return `${lines.map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
}

/** The import's own export: every recognized HubSpot column, no data rows. */
export const HUBSPOT_TEMPLATE_HEADERS = [
  "Record ID",
  "Deal Name",
  "Deal Stage",
  "Pipeline",
  "Amount",
  "Create Date",
  "Close Date",
  "Deal owner",
  "PM Name",
  "Also assigned",
  "Client Name",
  "Client Email",
  "Client Phone",
  "Client Address",
  "How Did They Find Us?",
  "Deal Description",
  "Next step",
  "Closed Lost Reason",
  "Closed Won Reason",
  "Deal Type",
  "Priority",
  "Deal Tags",
] as const;

export const HUBSPOT_TEMPLATE_CSV = `${HUBSPOT_TEMPLATE_HEADERS.join(",")}
1001,Smith — 123 Main St,Closed won,Sales Pipeline,"$12,450.00",2024-03-15 09:12,2024-04-02,Brady Jones,Brady Jones,Sarah Lee,Linda Smith,linda@example.com,(214) 555-0101,"123 Main St, Dallas, TX 75201",Google,Hail damage on the north slope.,,,,Roof replacement,Medium,
`;
