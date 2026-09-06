import { newShareToken } from "@/lib/share";
export const PORTAL_INVITE_DAYS = 90;

export function newPortalToken() {
  return `pt-${newShareToken()}`;
}

export function portalInviteExpiry(from = new Date()) {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + PORTAL_INVITE_DAYS);
  return expires.toISOString();
}

export function portalPath(token: string) {
  return `/portal/${encodeURIComponent(token)}`;
}

export function portalUrl(token: string, origin = "") {
  const path = portalPath(token);
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

/** Prefer inviteExpiry for staff seats; portal links last longer. */
export function portalExpiryOrDefault(value?: string | null) {
  return value?.trim() || portalInviteExpiry();
}

export type PortalCompany = {
  name: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
};

export type PortalContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type PortalTrade = {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
};

export type PortalScheduleItem = {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  location: string;
  assignee: string;
  notes: string;
};

export type PortalJob = {
  id: string;
  code: string;
  name: string;
  status: string;
  location: string;
  startDate: string | null;
  projectManager: string;
  superintendent: string;
  salesRep: string;
  assigned: string[];
  trades: PortalTrade[];
  schedule: PortalScheduleItem[];
};

export type PortalDocument = {
  id: string;
  number: string;
  name: string;
  status: string;
  jobId: string | null;
  shareToken: string;
  sharePath: string | null;
  validUntil?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
};

export type PortalReferral = {
  id: string;
  referredName: string;
  status: string;
  pointsAwarded: number;
  createdAt: string;
};

export type PortalRewards = {
  enabled: boolean;
  pointsBalance: number;
  comingSoon: string[];
};

export type PortalPayload = {
  token: string;
  expiresAt: string;
  company: PortalCompany;
  contact: PortalContact;
  jobs: PortalJob[];
  estimates: PortalDocument[];
  invoices: PortalDocument[];
  referrals: PortalReferral[];
  rewards: PortalRewards;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullable(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function parseTrade(raw: unknown): PortalTrade | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    title: asString(raw.title),
    phone: asString(raw.phone),
    email: asString(raw.email),
  };
}

function parseSchedule(raw: unknown): PortalScheduleItem | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const title = asString(raw.title);
  const startsAt = asString(raw.startsAt);
  if (!id || !title || !startsAt) return null;
  return {
    id,
    title,
    kind: asString(raw.kind),
    startsAt,
    endsAt: asString(raw.endsAt, startsAt),
    location: asString(raw.location),
    assignee: asString(raw.assignee),
    notes: asString(raw.notes),
  };
}

function parseJob(raw: unknown): PortalJob | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    code: asString(raw.code),
    name: asString(raw.name, "Job"),
    status: asString(raw.status),
    location: asString(raw.location),
    startDate: asNullable(raw.startDate),
    projectManager: asString(raw.projectManager),
    superintendent: asString(raw.superintendent),
    salesRep: asString(raw.salesRep),
    assigned: asStringArray(raw.assigned),
    trades: Array.isArray(raw.trades) ? raw.trades.map(parseTrade).filter(Boolean) as PortalTrade[] : [],
    schedule: Array.isArray(raw.schedule)
      ? (raw.schedule.map(parseSchedule).filter(Boolean) as PortalScheduleItem[])
      : [],
  };
}

function parseDocument(raw: unknown): PortalDocument | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const number = asString(raw.number);
  if (!id || !number) return null;
  return {
    id,
    number,
    name: asString(raw.name),
    status: asString(raw.status),
    jobId: asNullable(raw.jobId),
    shareToken: asString(raw.shareToken),
    sharePath: asNullable(raw.sharePath),
    validUntil: asNullable(raw.validUntil),
    issuedAt: asNullable(raw.issuedAt),
    dueAt: asNullable(raw.dueAt),
  };
}

function parseReferral(raw: unknown): PortalReferral | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    referredName: asString(raw.referredName),
    status: asString(raw.status, "submitted"),
    pointsAwarded: typeof raw.pointsAwarded === "number" ? raw.pointsAwarded : 0,
    createdAt: asString(raw.createdAt),
  };
}

export function parsePortalPayload(raw: unknown): PortalPayload | null {
  if (!isRecord(raw) || !isRecord(raw.company) || !isRecord(raw.contact)) return null;
  const token = asString(raw.token);
  if (token.length < 6) return null;
  const company = raw.company;
  const contact = raw.contact;
  const rewardsRaw = isRecord(raw.rewards) ? raw.rewards : {};
  return {
    token,
    expiresAt: asString(raw.expiresAt),
    company: {
      name: asString(company.name, "Your contractor"),
      phone: asString(company.phone),
      email: asString(company.email),
      website: asString(company.website),
      logoUrl: asString(company.logoUrl),
    },
    contact: {
      id: asString(contact.id),
      name: asString(contact.name, "Homeowner"),
      email: asString(contact.email),
      phone: asString(contact.phone),
    },
    jobs: Array.isArray(raw.jobs) ? (raw.jobs.map(parseJob).filter(Boolean) as PortalJob[]) : [],
    estimates: Array.isArray(raw.estimates)
      ? (raw.estimates.map(parseDocument).filter(Boolean) as PortalDocument[])
      : [],
    invoices: Array.isArray(raw.invoices)
      ? (raw.invoices.map(parseDocument).filter(Boolean) as PortalDocument[])
      : [],
    referrals: Array.isArray(raw.referrals)
      ? (raw.referrals.map(parseReferral).filter(Boolean) as PortalReferral[])
      : [],
    rewards: {
      enabled: Boolean(rewardsRaw.enabled),
      pointsBalance: typeof rewardsRaw.pointsBalance === "number" ? rewardsRaw.pointsBalance : 0,
      comingSoon: asStringArray(rewardsRaw.comingSoon),
    },
  };
}
