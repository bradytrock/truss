import { googleCalendarInviteBody } from "@/lib/calendar-invite";

/** Read and write events, so an outside guest can be emailed a calendar invite. */
export const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const GOOGLE_SCOPES = [
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export const GCAL_COOKIE = "theroofingcrm_gcal";
export const GCAL_COOKIE_LEGACY = "truss_gcal";
export const GCAL_OAUTH_STATE = "theroofingcrm_gcal_oauth";

export function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";
}

export function googleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}

export function isGoogleOAuthConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

export function googleRedirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/google/calendar/callback`;
}

export type StoredGoogleTokens = {
  staffId: string;
  googleEmail: string;
  calendarId: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
};

export function googleAuthUrl(params: { origin: string; state: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", googleRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, origin: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google did not return tokens.");
  }
  return json;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Could not refresh Google access.");
  }
  return json;
}

export async function googleEmailForToken(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as { email?: string };
  return json.email || "";
}

export async function listGoogleEvents(input: {
  accessToken: string;
  calendarId?: string;
  timeMin: string;
  timeMax: string;
}) {
  const calendarId = encodeURIComponent(input.calendarId || "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", input.timeMin);
  url.searchParams.set("timeMax", input.timeMax);
  url.searchParams.set("maxResults", "50");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const json = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      htmlLink?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message || "Could not load Google Calendar events.");
  }
  return (json.items ?? []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    title: item.summary || "(No title)",
    startsAt: item.start?.dateTime || (item.start?.date ? `${item.start.date}T00:00:00` : ""),
    endsAt: item.end?.dateTime || (item.end?.date ? `${item.end.date}T00:00:00` : ""),
    location: item.location || "",
    htmlLink: item.htmlLink,
    allDay: Boolean(item.start?.date && !item.start.dateTime),
  }));
}

export class GoogleCalendarScopeError extends Error {
  constructor() {
    super("Reconnect Google Calendar so Truss can send invites.");
  }
}

type GoogleErrorBody = {
  error?: { message?: string; errors?: Array<{ reason?: string }> };
};

async function throwGoogleCalendarError(response: Response): Promise<never> {
  const json = (await response.json().catch(() => ({}))) as GoogleErrorBody;
  const reason = json.error?.errors?.[0]?.reason ?? "";
  const message = json.error?.message ?? "";
  const lowered = `${reason} ${message}`.toLowerCase();
  if (
    response.status === 403 &&
    (reason === "insufficientPermissions" || lowered.includes("insufficient") || lowered.includes("scope"))
  ) {
    throw new GoogleCalendarScopeError();
  }
  throw new Error(message || "Google Calendar rejected the invite.");
}

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  attendeeEmails: string[];
  sendUpdates?: "all" | "none";
}) {
  const calendarId = encodeURIComponent(input.calendarId || "primary");
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
  url.searchParams.set("sendUpdates", input.sendUpdates ?? "all");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleCalendarInviteBody(input)),
  });
  if (!response.ok) await throwGoogleCalendarError(response);
  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new Error("Google Calendar did not return an event.");
  return json.id;
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  googleEventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  attendeeEmails: string[];
  sendUpdates?: "all" | "none";
}) {
  const calendarId = encodeURIComponent(input.calendarId || "primary");
  const eventId = encodeURIComponent(input.googleEventId);
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
  );
  url.searchParams.set("sendUpdates", input.sendUpdates ?? "all");
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(googleCalendarInviteBody(input)),
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) await throwGoogleCalendarError(response);
  const json = (await response.json()) as { id?: string };
  return json.id || input.googleEventId;
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId?: string;
  googleEventId: string;
}) {
  const calendarId = encodeURIComponent(input.calendarId || "primary");
  const eventId = encodeURIComponent(input.googleEventId);
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
  );
  url.searchParams.set("sendUpdates", "all");
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${input.accessToken}` } });
  if (response.ok || response.status === 404 || response.status === 410) return;
  await throwGoogleCalendarError(response);
}
