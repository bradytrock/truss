import { newShareToken } from "@/lib/share";

export const REALTOR_PORTAL_INVITE_DAYS = 90;

export function newRealtorPortalToken() {
  return `rt-${newShareToken()}`;
}

export function realtorPortalInviteExpiry(from = new Date()) {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + REALTOR_PORTAL_INVITE_DAYS);
  return expires.toISOString();
}

export function realtorPortalPath(token: string) {
  return `/realtor-portal/${encodeURIComponent(token)}`;
}

export function realtorPortalUrl(token: string, origin = "") {
  const path = realtorPortalPath(token);
  if (origin) return `${origin.replace(/\/+$/, "")}${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}

export type RealtorPortalCompany = {
  name: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
};

export type RealtorPortalContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  ownerName: string;
  listingWatchUrl: string;
  listingWatchEnabled: boolean;
};

export type RealtorPortalReferral = {
  id: string;
  code: string;
  name: string;
  stage: string;
  value: number;
  leadSource: string;
  createdAt: string;
  location: string;
  jobId: string | null;
};

export type RealtorPortalScheduleItem = {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  location: string;
  assignee: string;
  notes: string;
};

export type RealtorPortalJob = {
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
  schedule: RealtorPortalScheduleItem[];
};

export type RealtorPortalListing = {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  price: number | null;
  status: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listedAt: string | null;
  source: string;
  sourceUrl: string;
  summary: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type RealtorPortalPipeline = {
  watchEnabled: boolean;
  watchUrl: string;
  activeListings: number;
  openReferrals: number;
};

export type RealtorPortalPayload = {
  token: string;
  expiresAt: string;
  company: RealtorPortalCompany;
  contact: RealtorPortalContact;
  referrals: RealtorPortalReferral[];
  jobs: RealtorPortalJob[];
  listings: RealtorPortalListing[];
  pipeline: RealtorPortalPipeline;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullable(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function parseSchedule(raw: unknown): RealtorPortalScheduleItem | null {
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

function parseReferral(raw: unknown): RealtorPortalReferral | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    code: asString(raw.code),
    name: asString(raw.name, "Referral"),
    stage: asString(raw.stage),
    value: asNumber(raw.value) ?? 0,
    leadSource: asString(raw.leadSource),
    createdAt: asString(raw.createdAt),
    location: asString(raw.location),
    jobId: asNullable(raw.jobId),
  };
}

function parseJob(raw: unknown): RealtorPortalJob | null {
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
    schedule: Array.isArray(raw.schedule)
      ? (raw.schedule.map(parseSchedule).filter(Boolean) as RealtorPortalScheduleItem[])
      : [],
  };
}

function parseListing(raw: unknown): RealtorPortalListing | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  if (!id) return null;
  return {
    id,
    title: asString(raw.title, "Listing"),
    address: asString(raw.address),
    city: asString(raw.city),
    state: asString(raw.state),
    postalCode: asString(raw.postalCode),
    price: asNumber(raw.price),
    status: asString(raw.status, "unknown"),
    beds: asNumber(raw.beds),
    baths: asNumber(raw.baths),
    sqft: asNumber(raw.sqft),
    listedAt: asNullable(raw.listedAt),
    source: asString(raw.source),
    sourceUrl: asString(raw.sourceUrl),
    summary: asString(raw.summary),
    firstSeenAt: asString(raw.firstSeenAt),
    lastSeenAt: asString(raw.lastSeenAt),
  };
}

export function parseRealtorPortalPayload(raw: unknown): RealtorPortalPayload | null {
  if (!isRecord(raw) || !isRecord(raw.company) || !isRecord(raw.contact)) return null;
  const token = asString(raw.token);
  if (token.length < 6) return null;
  const company = raw.company;
  const contact = raw.contact;
  const pipelineRaw = isRecord(raw.pipeline) ? raw.pipeline : {};
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
      name: asString(contact.name, "Partner"),
      email: asString(contact.email),
      phone: asString(contact.phone),
      title: asString(contact.title),
      ownerName: asString(contact.ownerName),
      listingWatchUrl: asString(contact.listingWatchUrl),
      listingWatchEnabled: Boolean(contact.listingWatchEnabled),
    },
    referrals: Array.isArray(raw.referrals)
      ? (raw.referrals.map(parseReferral).filter(Boolean) as RealtorPortalReferral[])
      : [],
    jobs: Array.isArray(raw.jobs) ? (raw.jobs.map(parseJob).filter(Boolean) as RealtorPortalJob[]) : [],
    listings: Array.isArray(raw.listings)
      ? (raw.listings.map(parseListing).filter(Boolean) as RealtorPortalListing[])
      : [],
    pipeline: {
      watchEnabled: Boolean(pipelineRaw.watchEnabled),
      watchUrl: asString(pipelineRaw.watchUrl),
      activeListings:
        typeof pipelineRaw.activeListings === "number" ? pipelineRaw.activeListings : 0,
      openReferrals:
        typeof pipelineRaw.openReferrals === "number" ? pipelineRaw.openReferrals : 0,
    },
  };
}
