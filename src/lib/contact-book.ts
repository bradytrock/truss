import { siteForContact, siteLabelFromRecord } from "@/lib/contacts";
import { formatDateShort, formatPhone, localYmd } from "@/lib/format";
import { leadSourceLabel } from "@/lib/leads";
import { jobsForContact, opportunitiesForContact } from "@/lib/parties";
import { contactMatchesQuery, storedPhone } from "@/lib/phone";
import {
  CLIENT_TYPE_LABELS,
  JOB_STATUS_LABELS,
  type Activity,
  type ActivityType,
  type Client,
  type Contact,
  type Estimate,
  type GmailMessage,
  type Job,
  type Opportunity,
  type Task,
} from "@/lib/types";

export const CONTACT_STAGES = ["lead", "prop", "cust", "past"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];

export const CONTACT_FILTERS = ["all", "lead", "prop", "cust", "past", "tasks", "vendors"] as const;
export type ContactFilter = (typeof CONTACT_FILTERS)[number];

export const CONTACT_FILTER_OPTIONS: { value: ContactFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "lead", label: "Leads" },
  { value: "prop", label: "Proposal out" },
  { value: "cust", label: "Customers" },
  { value: "past", label: "Past" },
  { value: "tasks", label: "Needs a call" },
  { value: "vendors", label: "Vendors" },
];

const AVATAR_TONES = [
  { bg: "#e8e1f7", fg: "#4b3a8c" },
  { bg: "#dff0e8", fg: "#1f6b4a" },
  { bg: "#fbe7dc", fg: "#8a3d1c" },
  { bg: "#e2ecf9", fg: "#1c4a8a" },
  { bg: "#f6e3ea", fg: "#88304f" },
  { bg: "#efeee9", fg: "#55524d" },
] as const;

export function avatarTone(name: string) {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

export const CONTACT_STAGE_META: Record<ContactStage, { label: string; chip: string }> = {
  lead: { label: "Lead", chip: "bg-[#f0efec] text-[#6e6e73]" },
  prop: { label: "Proposal out", chip: "bg-[#fbf1e1] text-[#9a5b0c]" },
  cust: { label: "Customer", chip: "bg-[#e7effb] text-[#13295b]" },
  past: { label: "Past customer", chip: "bg-[#e6f3ea] text-[#1f7a3f]" },
};

const ACTIVITY_TITLES: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  site_walk: "Site walk",
  stage_change: "Moved",
  audit: "Update",
  text: "Text",
};

const ACTIVE_JOB: ReadonlySet<Job["status"]> = new Set(["precon", "in_progress", "punch", "on_hold"]);

export type ContactNoteTarget = {
  entityType: "opportunity" | "job" | "client";
  entityId: string;
};

export type ContactTaskTarget = {
  relatedType: "opportunity" | "job" | "client";
  relatedId: string;
};

export type ContactBookJob = {
  id: string;
  name: string;
  code: string;
  status: Job["status"];
  statusLabel: string;
};

export type ContactBookTask = {
  id: string;
  title: string;
  dueAt: string;
  completed: boolean;
  late: boolean;
};

export type ContactBookActivity = {
  id: string;
  title: string;
  detail: string;
  at: string;
  when: string;
  kind: "note" | "event";
};

export type ContactBookRow = {
  id: string;
  name: string;
  typeLine: string;
  sourceLabel: string;
  address: string;
  phone: string;
  phoneRaw: string;
  email: string;
  stage: ContactStage;
  lastContactAt: string | null;
  lastContactLabel: string;
  overdueCallback: boolean;
  openTaskCount: number;
  jobs: ContactBookJob[];
  tasks: ContactBookTask[];
  activity: ContactBookActivity[];
  noteTarget: ContactNoteTarget | null;
  taskTarget: ContactTaskTarget | null;
};

export type ContactBookInput = {
  contacts: Contact[];
  clients: Client[];
  jobs: Job[];
  opportunities: Opportunity[];
  estimates: Estimate[];
  tasks: Task[];
  activities: Activity[];
  gmailMessages?: GmailMessage[];
};

export function parseContactFilter(value: string | null | undefined): ContactFilter {
  return CONTACT_FILTERS.includes(value as ContactFilter) ? (value as ContactFilter) : "all";
}

export function contactTypeLine(contact: Contact, client?: Client | null) {
  const title = contact.title.trim();
  if (contact.isReferralPartner) {
    const role = title && title.toLowerCase() !== "homeowner" ? title : "Partner";
    return client?.name ? `${role} · ${client.name}` : role;
  }
  if (client) {
    const kind =
      client.type === "owner" || client.type === "developer"
        ? client.type === "owner"
          ? "Commercial"
          : "Developer"
        : CLIENT_TYPE_LABELS[client.type];
    return title ? `${kind} · ${title}` : kind;
  }
  return title || "Homeowner";
}

export function contactSourceLabel(jobs: Job[], opportunities: Opportunity[]) {
  const newestOpp = [...opportunities].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (newestOpp?.leadSource) return leadSourceLabel(newestOpp.leadSource);
  const sourced = jobs.find((job) => job.leadSource);
  if (sourced?.leadSource) return leadSourceLabel(sourced.leadSource);
  return "";
}

export function estimatesForContact(
  contact: Contact,
  estimates: Estimate[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const jobIds = new Set(jobs.map((job) => job.id));
  const oppIds = new Set(opportunities.map((opportunity) => opportunity.id));
  return estimates.filter((estimate) => {
    if (estimate.archivedAt) return false;
    if (estimate.contactId === contact.id) return true;
    if (estimate.secondContactId === contact.id) return true;
    if (estimate.jobId && jobIds.has(estimate.jobId)) return true;
    if (estimate.opportunityId && oppIds.has(estimate.opportunityId)) return true;
    return false;
  });
}

export function tasksForContact(
  contact: Contact,
  tasks: Task[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const jobIds = new Set(jobs.map((job) => job.id));
  const oppIds = new Set(opportunities.map((opportunity) => opportunity.id));
  return tasks.filter((task) => {
    if (task.relatedType === "job" && task.relatedId && jobIds.has(task.relatedId)) return true;
    if (task.relatedType === "opportunity" && task.relatedId && oppIds.has(task.relatedId)) {
      return true;
    }
    if (
      task.relatedType === "client" &&
      task.relatedId &&
      contact.clientId &&
      task.relatedId === contact.clientId
    ) {
      return true;
    }
    return false;
  });
}

export function activitiesForContact(
  contact: Contact,
  activities: Activity[],
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const jobIds = new Set(jobs.map((job) => job.id));
  const oppIds = new Set(opportunities.map((opportunity) => opportunity.id));
  return activities.filter((activity) => {
    if (activity.entityType === "job" && jobIds.has(activity.entityId)) return true;
    if (activity.entityType === "opportunity" && oppIds.has(activity.entityId)) return true;
    if (activity.entityType === "client" && contact.clientId && activity.entityId === contact.clientId) {
      return true;
    }
    return false;
  });
}

export function contactStage(jobs: Job[], estimates: Estimate[]): ContactStage {
  const live = jobs.filter((job) => !job.deletedAt);
  if (live.some((job) => ACTIVE_JOB.has(job.status))) return "cust";
  if (estimates.some((estimate) => estimate.status === "sent" || estimate.status === "viewed")) {
    return "prop";
  }
  if (estimates.some((estimate) => estimate.status === "accepted")) return "cust";
  if (live.some((job) => job.status === "complete")) return "past";
  return "lead";
}

export function formatLastContactAt(iso: string | null | undefined, now = new Date()) {
  if (!iso) return "—";
  const date = parseWhen(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (Math.abs(diffMin) < 1) return "Just now";
  if (diffMin > 0 && diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffMin > 0 && diffHr < 24) return `${diffHr}h ago`;
  const today = localYmd(now);
  const day = localYmd(date);
  const startToday = parseWhen(`${today}T12:00:00`);
  const startThen = parseWhen(`${day}T12:00:00`);
  const days = Math.round((startToday.getTime() - startThen.getTime()) / 86_400_000);
  if (days === 1) return "Yesterday";
  return formatDateShort(iso);
}

export function lastContactAt(times: Array<string | null | undefined>) {
  const stamps = times.filter((value): value is string => Boolean(value && value.trim()));
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest));
}

export function relatedTarget(
  contact: Contact,
  jobs: Job[],
  opportunities: Opportunity[],
): ContactNoteTarget | null {
  const job = sortJobs(jobs)[0];
  if (job) return { entityType: "job", entityId: job.id };
  const opportunity = [...opportunities].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (opportunity) return { entityType: "opportunity", entityId: opportunity.id };
  if (contact.clientId) return { entityType: "client", entityId: contact.clientId };
  return null;
}

export function buildContactBookRow(
  contact: Contact,
  book: Omit<ContactBookInput, "contacts">,
  now = new Date(),
): ContactBookRow {
  const client = contact.clientId
    ? book.clients.find((item) => item.id === contact.clientId)
    : undefined;
  const jobs = sortJobs(jobsForContact(contact, book.jobs));
  const opportunities = opportunitiesForContact(contact, book.opportunities);
  const estimates = estimatesForContact(contact, book.estimates, jobs, opportunities);
  const tasks = sortTasks(tasksForContact(contact, book.tasks, jobs, opportunities), now);
  const activities = activitiesForContact(contact, book.activities, jobs, opportunities);
  const mailAt = latestMailAt(contact, book.gmailMessages);
  const address = siteLabelFromRecord(siteForContact(contact.id, [...jobs, ...opportunities]));
  const at = lastContactAt([
    ...activities.map((item) => item.createdAt),
    ...estimates.map((item) => item.sentAt || item.acceptedAt || item.createdAt),
    ...opportunities.map((item) => item.createdAt),
    mailAt,
  ]);
  const openTasks = tasks.filter((task) => !task.completed);
  const target = relatedTarget(contact, jobs, opportunities);

  return {
    id: contact.id,
    name: contact.name,
    typeLine: contactTypeLine(contact, client),
    sourceLabel: contactSourceLabel(jobs, opportunities),
    address,
    phone: formatPhone(contact.phone),
    phoneRaw: contact.phone.trim(),
    email: contact.email.trim(),
    stage: contactStage(jobs, estimates),
    lastContactAt: at,
    lastContactLabel: formatLastContactAt(at, now),
    overdueCallback: openTasks.some((task) => task.late),
    openTaskCount: openTasks.length,
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      code: job.code,
      status: job.status,
      statusLabel: JOB_STATUS_LABELS[job.status],
    })),
    tasks,
    activity: buildActivity(activities, estimates, opportunities, now),
    noteTarget: target,
    taskTarget: target
      ? { relatedType: target.entityType, relatedId: target.entityId }
      : null,
  };
}

export function buildContactBook(book: ContactBookInput, now = new Date()) {
  return book.contacts
    .map((contact) => buildContactBookRow(contact, book, now))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function contactRowMatchesQuery(row: ContactBookRow, query: string) {
  return contactMatchesQuery(
    { name: row.name, title: row.typeLine, email: row.email, phone: row.phoneRaw },
    query,
    [row.address, row.typeLine, row.sourceLabel],
  );
}

export function visibleContactRows(rows: ContactBookRow[], filter: ContactFilter, query: string) {
  if (filter === "vendors") return [];
  return rows.filter((row) => {
    if (filter === "tasks" && row.openTaskCount === 0) return false;
    if (filter !== "all" && filter !== "tasks" && row.stage !== filter) return false;
    return contactRowMatchesQuery(row, query);
  });
}

export function contactFilterCounts(rows: ContactBookRow[], vendorCount = 0) {
  return {
    all: rows.length,
    lead: rows.filter((row) => row.stage === "lead").length,
    prop: rows.filter((row) => row.stage === "prop").length,
    cust: rows.filter((row) => row.stage === "cust").length,
    past: rows.filter((row) => row.stage === "past").length,
    tasks: rows.filter((row) => row.openTaskCount > 0).length,
    vendors: vendorCount,
  } satisfies Record<ContactFilter, number>;
}

export type ContactImportDraft = {
  name: string;
  phone: string;
  email: string;
  title: string;
};

export type ContactImportIssue = {
  line: number;
  message: string;
};

export function parseContactCsv(text: string): {
  rows: ContactImportDraft[];
  issues: ContactImportIssue[];
} {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: ContactImportDraft[] = [];
  const issues: ContactImportIssue[] = [];
  if (lines.length === 0) return { rows, issues };

  let header = splitCsvLine(lines[0] ?? "").map((cell) => normalizeHeader(cell));
  let start = 1;
  const looksLikeHeader =
    header.some((cell) => NAME_HEADERS.has(cell) || cell === "first" || cell === "last") ||
    header.includes("phone") ||
    header.includes("email");
  if (!looksLikeHeader) {
    header = ["name", "phone", "email", "title"];
    start = 0;
  }

  for (let index = start; index < lines.length; index++) {
    const raw = lines[index] ?? "";
    if (!raw.trim()) continue;
    const cells = splitCsvLine(raw);
    const get = (...keys: string[]) => {
      for (const key of keys) {
        const at = header.indexOf(key);
        if (at >= 0 && cells[at]?.trim()) return cells[at]!.trim();
      }
      return "";
    };
    const first = get("first", "first name", "firstname");
    const last = get("last", "last name", "lastname");
    const name = get("name", "full name", "contact", "homeowner") || [first, last].filter(Boolean).join(" ");
    if (!name) {
      issues.push({ line: index + 1, message: "Missing name" });
      continue;
    }
    rows.push({
      name,
      phone: storedPhone(get("phone", "mobile", "cell")),
      email: get("email", "e-mail"),
      title: get("title", "role", "type") || "Homeowner",
    });
  }
  return { rows, issues };
}

const NAME_HEADERS = new Set(["name", "full name", "contact", "homeowner"]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ");
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

function parseWhen(iso: string) {
  if (iso.includes("T")) return new Date(iso);
  return new Date(`${iso}T12:00:00`);
}

function sortJobs(jobs: Job[]) {
  return [...jobs].filter((job) => !job.deletedAt).sort((left, right) => {
    const leftActive = ACTIVE_JOB.has(left.status) ? 1 : 0;
    const rightActive = ACTIVE_JOB.has(right.status) ? 1 : 0;
    if (leftActive !== rightActive) return rightActive - leftActive;
    return (right.startDate || "").localeCompare(left.startDate || "");
  });
}

function sortTasks(tasks: Task[], now: Date): ContactBookTask[] {
  const today = localYmd(now);
  return [...tasks]
    .map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      completed: task.completed,
      late: !task.completed && Boolean(task.dueAt) && task.dueAt < today,
    }))
    .sort((left, right) => {
      if (left.completed !== right.completed) return left.completed ? 1 : -1;
      return left.dueAt.localeCompare(right.dueAt) || left.title.localeCompare(right.title);
    });
}

function latestMailAt(contact: Contact, messages?: GmailMessage[]) {
  if (!messages?.length) return null;
  const email = contact.email.trim().toLowerCase();
  const hits = messages.filter((message) => {
    if (message.contactId === contact.id) return true;
    if ((message.relatedContactIds ?? []).includes(contact.id)) return true;
    if (email && (message.fromEmail.toLowerCase() === email || message.toEmail.toLowerCase() === email)) {
      return true;
    }
    return false;
  });
  return hits.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0]?.receivedAt ?? null;
}

function buildActivity(
  activities: Activity[],
  estimates: Estimate[],
  opportunities: Opportunity[],
  now: Date,
): ContactBookActivity[] {
  const items: ContactBookActivity[] = activities.map((activity) => ({
    id: activity.id,
    title: ACTIVITY_TITLES[activity.type] ?? "Update",
    detail: activity.body.trim(),
    at: activity.createdAt,
    when: formatLastContactAt(activity.createdAt, now),
    kind: activity.type === "note" ? "note" : "event",
  }));

  for (const estimate of estimates) {
    const stamp = estimate.sentAt || estimate.acceptedAt;
    if (!stamp) continue;
    const already = items.some(
      (item) =>
        item.at.slice(0, 10) === stamp.slice(0, 10) &&
        /proposal|estimate|emailed/i.test(`${item.title} ${item.detail}`) &&
        item.detail.includes(estimate.number),
    );
    if (already) continue;
    items.push({
      id: `est-${estimate.id}`,
      title:
        estimate.status === "accepted"
          ? `Proposal ${estimate.number} signed`
          : `Proposal ${estimate.number} sent`,
      detail: estimate.name,
      at: stamp,
      when: formatLastContactAt(stamp, now),
      kind: "event",
    });
  }

  for (const opportunity of opportunities) {
    const already = items.some(
      (item) => item.at.slice(0, 10) === opportunity.createdAt.slice(0, 10) && /lead/i.test(item.title + item.detail),
    );
    if (already) continue;
    const source = opportunity.leadSource ? leadSourceLabel(opportunity.leadSource) : "";
    items.push({
      id: `opp-${opportunity.id}`,
      title: source ? `Lead from ${source}` : "Lead opened",
      detail: opportunity.name,
      at: opportunity.createdAt,
      when: formatLastContactAt(opportunity.createdAt, now),
      kind: "event",
    });
  }

  return items.sort((left, right) => right.at.localeCompare(left.at));
}
