import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeState } from "./address-suggest.ts";

export const COMPANYCAM_API = "https://api.companycam.com/v2";

const IMAGE_URL_TYPES = ["web", "original", "thumbnail"] as const;

export type CompanyCamCompany = {
  id: string;
  name: string;
};

export type CompanyCamAddress = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

export type CompanyCamAddressJob = CompanyCamAddress & {
  id: string;
  projectId?: string;
};

export type CompanyCamProject = {
  id: string;
  name: string;
  address: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  url: string;
};

export type CompanyCamPhoto = {
  id: string;
  projectId: string;
  url: string;
  caption: string;
  takenOn: string;
};

export type CompanyCamWebhookEvent = {
  eventType: string;
  photo: CompanyCamPhoto | null;
};

export function looksLikeCompanyCamToken(value: string) {
  const token = value.trim();
  if (token.length < 20 || token.length > 512) return false;
  if (/\s/.test(token)) return false;
  if (/^https?:/i.test(token)) return false;
  return true;
}

export function companyCamTokenHint(value: string) {
  const token = value.trim();
  if (token.length < 4) return "";
  return token.slice(-4);
}

export function companyCamWebhookUrl(origin: string, token: string) {
  const base = origin.trim().replace(/\/+$/, "");
  const webhookToken = token.trim();
  if (!base || webhookToken.length < 24) return "";
  return `${base}/api/companycam/webhook?token=${encodeURIComponent(webhookToken)}`;
}

export function companyCamSignature(token: string, rawBody: string) {
  return createHmac("sha1", token).update(rawBody).digest("base64");
}

export function companyCamSignatureMatches(token: string, rawBody: string, header: string | null) {
  const given = header?.trim() ?? "";
  if (!token.trim() || !given) return false;
  const expected = companyCamSignature(token, rawBody);
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isCompanyCamImageUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname.toLowerCase().includes("companycam");
  } catch {
    return false;
  }
}

export function companyCamErrorMessage(json: unknown, fallback: string) {
  if (!isRecord(json)) return fallback;
  const errors = json.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first.trim();
  }
  if (typeof json.error === "string" && json.error.trim()) return json.error.trim();
  if (typeof json.message === "string" && json.message.trim()) return json.message.trim();
  return fallback;
}

export function parseCompanyCamCompany(json: unknown): CompanyCamCompany | null {
  const row = isRecord(json) && isRecord(json.company) ? json.company : json;
  if (!isRecord(row)) return null;
  const id = idOf(row.id);
  const name = textOf(row.name);
  if (!id || !name) return null;
  return { id, name };
}

export function parseCompanyCamProject(json: unknown): CompanyCamProject | null {
  if (!isRecord(json)) return null;
  const id = idOf(json.id);
  if (!id) return null;
  const name = textOf(json.name) || "Untitled project";
  const parts = companyCamAddressFromJson(json.address);
  const address = formatCompanyCamAddress(json.address);
  const explicit = textOf(json.project_url);
  const url = explicit.startsWith("https://")
    ? explicit
    : `https://app.companycam.com/projects/${encodeURIComponent(id)}`;
  return { id, name, address, url, ...parts };
}

export function companyCamAddressFromJson(address: unknown): CompanyCamAddress {
  if (!isRecord(address)) return { street: "", city: "", state: "", postalCode: "" };
  return {
    street: [textOf(address.street_address_1), textOf(address.street_address_2)].filter(Boolean).join(" "),
    city: textOf(address.city),
    state: textOf(address.state),
    postalCode: textOf(address.postal_code),
  };
}

/** First five ZIP digits. ZIP+4 and punctuation collapse to the same code. */
export function companyCamPostalCode(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}

const PAUSED_COMPANYCAM_PROJECT_PREFIX = "paused:";

/** Keeps an unlinked job from matching the same address again until that address changes. */
export function pausedCompanyCamProjectId(jobId: string) {
  return `${PAUSED_COMPANYCAM_PROJECT_PREFIX}${jobId.trim()}`;
}

export function isPausedCompanyCamProjectId(projectId: string) {
  return projectId.trim().startsWith(PAUSED_COMPANYCAM_PROJECT_PREFIX);
}

export function pausedCompanyCamAddress(value: string): CompanyCamAddress | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    return {
      street: typeof row.street === "string" ? row.street : "",
      city: typeof row.city === "string" ? row.city : "",
      state: typeof row.state === "string" ? row.state : "",
      postalCode: typeof row.postalCode === "string" ? row.postalCode : "",
    };
  } catch {
    return null;
  }
}

/** A paused link blocks another match at the same address. A new address can match again. */
export function companyCamCandidateProjectId(
  job: CompanyCamAddress & { projectId?: string },
  pauseAddressLine: string,
) {
  const projectId = job.projectId?.trim() ?? "";
  if (!isPausedCompanyCamProjectId(projectId)) return projectId;
  const paused = pausedCompanyCamAddress(pauseAddressLine);
  if (!paused || companyCamAddressesMatch(paused, job)) return projectId;
  return "";
}

/**
 * Street, city, state, and ZIP compare equal after spelling differences
 * (St/Street, N/North, Suite/#, TX/Texas, ZIP+4). A missing city or state
 * does not reject a match. A different city, state, or unit does.
 */
export function companyCamAddressesMatch(left: CompanyCamAddress, right: CompanyCamAddress) {
  const a = normalizeCompanyCamAddress(left);
  const b = normalizeCompanyCamAddress(right);
  if (!a || !b) return false;
  if (!companyCamStreetsMatch(a.street, b.street) || a.postal !== b.postal) return false;
  if (a.city && b.city && a.city !== b.city) return false;
  if (a.state && b.state && a.state !== b.state) return false;
  return true;
}

/** The one item at this address. Zero or several matches stay unresolved. */
export function uniqueCompanyCamAddressMatch<T>(
  items: readonly T[],
  addressOf: (item: T) => CompanyCamAddress,
  target: CompanyCamAddress,
) {
  const matches = items.filter((item) => companyCamAddressesMatch(addressOf(item), target));
  return matches.length === 1 ? matches[0] : null;
}

/** The CompanyCam project at the job address, when the search list is complete and unique. */
export function companyCamProjectForJob(
  projects: readonly CompanyCamProject[],
  job: CompanyCamAddress,
  listComplete: boolean,
) {
  if (!listComplete) return null;
  return uniqueCompanyCamAddressMatch(projects, (project) => project, job) ?? null;
}

/**
 * The one open job at the project address.
 * A job already tied to a different project, or a project already tied to a different job, stays unresolved.
 * An incomplete candidate list never counts as unique.
 */
export function companyCamJobForProject(
  jobs: readonly CompanyCamAddressJob[],
  project: CompanyCamAddress & { id: string },
  listComplete: boolean,
) {
  if (!listComplete) return null;
  const match = uniqueCompanyCamAddressMatch(jobs, (job) => job, project);
  if (!match) return null;
  const linkedProject = match.projectId?.trim() ?? "";
  if (linkedProject && linkedProject !== project.id) return null;
  if (jobs.some((job) => (job.projectId?.trim() ?? "") === project.id && job.id !== match.id)) return null;
  return match;
}

export function parseCompanyCamPhoto(json: unknown): CompanyCamPhoto | null {
  if (!isRecord(json)) return null;
  const id = idOf(json.id);
  const url = companyCamImageUrl(json);
  if (!id || !isCompanyCamImageUrl(url)) return null;
  const projectId =
    idOf(json.project_id) ||
    (isRecord(json.project) ? idOf(json.project.id) : "");
  const description = textOf(json.description);
  const creator = textOf(json.creator_name);
  const caption = (description || (creator ? `CompanyCam · ${creator}` : "CompanyCam")).slice(0, 500);
  return {
    id,
    projectId,
    url,
    caption,
    takenOn: companyCamCapturedDate(json.captured_at ?? json.created_at),
  };
}

export function parseCompanyCamWebhook(json: unknown): CompanyCamWebhookEvent {
  if (!isRecord(json)) return { eventType: "", photo: null };
  const eventType = textOf(json.event_type) || textOf(json.event);
  if (!eventType.startsWith("photo.")) return { eventType, photo: null };
  const payload = isRecord(json.payload) ? json.payload : json;
  const source = isRecord(payload.photo) ? payload.photo : payload;
  const projectId =
    idOf(source.project_id) || (isRecord(payload.project) ? idOf(payload.project.id) : "");
  if (eventType === "photo.deleted") {
    const id = idOf(source.id);
    if (!id) return { eventType, photo: null };
    return {
      eventType,
      photo: { id, projectId, url: "", caption: "", takenOn: "" },
    };
  }
  const photo = parseCompanyCamPhoto(source);
  if (photo && !photo.projectId && projectId) photo.projectId = projectId;
  return { eventType, photo };
}

/** A URL CompanyCam's servers can fetch. Photos that already live on CompanyCam are skipped. */
export function companyCamUploadUrl(value: string) {
  const url = value.trim();
  if (!url.startsWith("https://")) return "";
  if (isCompanyCamImageUrl(url)) return "";
  return url;
}

export function companyCamCapturedUnix(value: string, now = Date.now()) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return Math.floor(now / 1000);
  return Math.floor(ms / 1000);
}

export function companyCamPhotoCreateBody(input: {
  uri: string;
  capturedAt: string;
  description?: string;
}) {
  const photo: Record<string, unknown> = {
    uri: input.uri,
    captured_at: companyCamCapturedUnix(input.capturedAt),
  };
  const description = input.description?.trim().slice(0, 500) ?? "";
  if (description) photo.description = description;
  return { photo };
}

/** Local CompanyCam copies that are no longer on the project. Incomplete lists never drop photos. */
export function companyCamPhotoIdsToDrop(localIds: string[], remoteIds: string[], listComplete: boolean) {
  if (!listComplete) return [];
  const remote = new Set(remoteIds);
  return [...new Set(localIds.map((id) => id.trim()).filter((id) => id && !remote.has(id)))];
}

/** Query string for one CompanyCam photo page. `after` and `page` are never sent together. */
export function companyCamPhotoQuery(input: { after?: string; page?: number; perPage?: number }) {
  const params = new URLSearchParams({ per_page: String(input.perPage ?? 100) });
  const after = input.after?.trim() ?? "";
  if (after) params.set("after", after);
  else if ((input.page ?? 1) > 1) params.set("page", String(input.page));
  return params.toString();
}

/**
 * Cursor for the next photo page, from `X-Next-Cursor` or a `Link` header `after` param.
 * An empty cursor means CompanyCam did not offer another page.
 */
export function companyCamNextPhotoCursor(headers: { get(name: string): string | null }) {
  const direct = headers.get("x-next-cursor")?.trim() ?? "";
  if (direct) return direct;
  const link = headers.get("link") ?? "";
  const match = /(?:^|,\s*)<[^>]*[?&]after=([^&>\s]+)[^>]*>\s*;\s*rel="?next"?/i.exec(link);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

/**
 * How to fetch the next CompanyCam photo page.
 * Keep requesting `per_page=100` with `after` set to the previous response cursor until
 * that cursor is empty. A short page is not the end of the project, and `X-Has-Next: false`
 * does not stop the walk while a new cursor is present.
 * Offset `page` is only used when CompanyCam sends no cursor at all.
 * A stuck or missing cursor never counts as a complete list, so unsynced photos are not deleted.
 */
export function companyCamPhotoPageState(input: {
  rawCount: number;
  nextCursor: string;
  hasNext: string;
  page: number;
  previousCursor: string;
}): { mode: "cursor" | "page" | "stop"; cursor: string; page: number; complete: boolean } {
  const hasNext = input.hasNext.trim().toLowerCase();
  const nextCursor = input.nextCursor.trim();
  const previousCursor = input.previousCursor.trim();
  if (input.rawCount <= 0) {
    return { mode: "stop", cursor: "", page: input.page, complete: true };
  }
  if (nextCursor && nextCursor !== previousCursor) {
    return { mode: "cursor", cursor: nextCursor, page: input.page, complete: false };
  }
  if (hasNext === "true" || nextCursor) {
    return { mode: "stop", cursor: "", page: input.page, complete: false };
  }
  if (hasNext === "false") {
    return { mode: "stop", cursor: "", page: input.page, complete: true };
  }
  return { mode: "page", cursor: "", page: input.page + 1, complete: false };
}

/** Every photo id still on the project, including ones whose image URL is not ready yet. */
export function companyCamListedPhotoId(json: unknown) {
  if (!isRecord(json)) return "";
  if (textOf(json.status).toLowerCase() === "deleted") return "";
  return idOf(json.id);
}

export function asCompanyCamList(json: unknown) {
  if (Array.isArray(json)) return json;
  if (!isRecord(json)) return [];
  for (const key of ["data", "projects", "photos", "results", "webhooks"]) {
    const value = json[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export function formatCompanyCamAddress(address: unknown) {
  if (!isRecord(address)) return "";
  const street = [textOf(address.street_address_1), textOf(address.street_address_2)]
    .filter(Boolean)
    .join(" ");
  const city = textOf(address.city);
  const state = textOf(address.state);
  const postal = textOf(address.postal_code);
  const cityLine = [city, state].filter(Boolean).join(", ");
  const region = [cityLine, postal].filter(Boolean).join(" ");
  return [street, region].filter(Boolean).join(", ");
}

export function companyCamImageUrl(value: unknown) {
  if (!isRecord(value)) return "";
  const uris = Array.isArray(value.uris) ? value.uris.filter(isRecord) : [];
  for (const type of IMAGE_URL_TYPES) {
    const match = uris.find((item) => textOf(item.type).toLowerCase() === type);
    const url = match ? httpsUrl(textOf(match.url) || textOf(match.uri)) : "";
    if (url) return url;
  }
  for (const item of uris) {
    const url = httpsUrl(textOf(item.url) || textOf(item.uri));
    if (url) return url;
  }
  return httpsUrl(textOf(value.url) || textOf(value.uri));
}

export function companyCamCapturedDate(value: unknown, now = new Date()) {
  const stamp = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(stamp) || stamp <= 0) return isoDate(now);
  const ms = stamp > 10_000_000_000 ? stamp : stamp * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return isoDate(now);
  return isoDate(date);
}

export function companyCamProjectBody(input: {
  name: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const body: Record<string, unknown> = {
    name: input.name.trim() || input.street.trim() || "Job",
    address: {
      street_address_1: input.street.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      postal_code: input.postalCode.trim(),
      country: "US",
    },
  };
  if (
    typeof input.lat === "number" &&
    typeof input.lng === "number" &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng)
  ) {
    body.coordinates = { lat: input.lat, lon: input.lng };
  }
  return body;
}

export function jobHasCompanyCamAddress(job: {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}) {
  return Boolean(job.street.trim() && job.city.trim() && job.state.trim() && job.postalCode.trim());
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

const STREET_TOKEN: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  av: "ave",
  boulevard: "blvd",
  blvd: "blvd",
  drive: "dr",
  dr: "dr",
  road: "rd",
  rd: "rd",
  lane: "ln",
  ln: "ln",
  court: "ct",
  ct: "ct",
  place: "pl",
  pl: "pl",
  terrace: "ter",
  ter: "ter",
  circle: "cir",
  cir: "cir",
  trail: "trl",
  trl: "trl",
  parkway: "pkwy",
  pkwy: "pkwy",
  highway: "hwy",
  hwy: "hwy",
  square: "sq",
  sq: "sq",
  north: "n",
  n: "n",
  south: "s",
  s: "s",
  east: "e",
  e: "e",
  west: "w",
  w: "w",
  northeast: "ne",
  ne: "ne",
  northwest: "nw",
  nw: "nw",
  southeast: "se",
  se: "se",
  southwest: "sw",
  sw: "sw",
  apartment: "unit",
  apt: "unit",
  suite: "unit",
  ste: "unit",
  unit: "unit",
};

const TRAILING_STREET_SUFFIX = new Set([
  "st",
  "ave",
  "blvd",
  "dr",
  "rd",
  "ln",
  "ct",
  "pl",
  "ter",
  "cir",
  "trl",
  "pkwy",
  "hwy",
  "sq",
  "way",
]);

function normalizeCompanyCamAddress(address: CompanyCamAddress) {
  const street = normalizeStreet(address.street);
  const postal = companyCamPostalCode(address.postalCode);
  if (!street || !postal) return null;
  return {
    street,
    city: normalizeCity(address.city),
    state: normalizeState(address.state),
    postal,
  };
}

function normalizeStreet(value: string) {
  const tokens = value
    .toLowerCase()
    .replace(/#/g, " unit ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => STREET_TOKEN[token] ?? token)
    .filter((token, index, list) => token !== "unit" || list[index - 1] !== "unit");
  return tokens.join(" ");
}

function normalizeCity(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "ft" ? "fort" : token))
    .join(" ");
}

function companyCamStreetsMatch(left: string, right: string) {
  if (left === right) return true;
  const a = stripTrailingStreetSuffix(left);
  const b = stripTrailingStreetSuffix(right);
  return a === b && (a !== left) !== (b !== right);
}

function stripTrailingStreetSuffix(value: string) {
  const tokens = value.split(" ").filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  if (tokens.length < 2 || !TRAILING_STREET_SUFFIX.has(last)) return value;
  return tokens.slice(0, -1).join(" ");
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function httpsUrl(value: string) {
  return value.startsWith("https://") ? value : "";
}

function idOf(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return "";
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
