import { createHmac, timingSafeEqual } from "node:crypto";

export const COMPANYCAM_API = "https://api.companycam.com/v2";

const IMAGE_URL_TYPES = ["web", "original", "thumbnail"] as const;

export type CompanyCamCompany = {
  id: string;
  name: string;
};

export type CompanyCamProject = {
  id: string;
  name: string;
  address: string;
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
  const address = formatCompanyCamAddress(json.address);
  const explicit = textOf(json.project_url);
  const url = explicit.startsWith("https://")
    ? explicit
    : `https://app.companycam.com/projects/${encodeURIComponent(id)}`;
  return { id, name, address, url };
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
