/** Same check as looksLikeEmail in share-text.ts. Kept local so this module stays free of app aliases. */
function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Google Calendar allows a large guest list. Cap invites so one event cannot fan out without bound. */
export const MAX_EXTERNAL_INVITEES = 50;

/**
 * Consumer mailbox domains are not a company. If the office address is on one of
 * these, only an exact staff email counts as inside the organization.
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "hey.com",
]);

export type OrganizationRoster = {
  staffEmails: string[];
  companyEmail: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

export function parseGuestEmails(raw: string | readonly string[]) {
  const text = typeof raw === "string" ? raw : raw.join(",");
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (!looksLikeEmail(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export function organizationDomain(companyEmail: string) {
  const domain = emailDomain(companyEmail);
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return "";
  return domain;
}

/** A teammate, or anyone on the company email domain, already belongs to the organization. */
export function isInsideOrganization(email: string, roster: OrganizationRoster) {
  const normalized = normalizeEmail(email);
  if (!looksLikeEmail(normalized)) return false;
  for (const staffEmail of roster.staffEmails) {
    if (normalizeEmail(staffEmail) === normalized) return true;
  }
  const domain = organizationDomain(roster.companyEmail);
  return Boolean(domain) && emailDomain(normalized) === domain;
}

export function partitionGuestEmails(emails: string | readonly string[], roster: OrganizationRoster) {
  const inside: string[] = [];
  const outside: string[] = [];
  for (const email of parseGuestEmails(emails)) {
    if (isInsideOrganization(email, roster)) inside.push(email);
    else outside.push(email);
  }
  return {
    inside,
    outside: outside.slice(0, MAX_EXTERNAL_INVITEES),
    truncated: Math.max(0, outside.length - MAX_EXTERNAL_INVITEES),
  };
}

export function externalInvitees(emails: string | readonly string[], roster: OrganizationRoster) {
  return partitionGuestEmails(emails, roster).outside;
}

export function guestInviteHint(outside: string[], inside: string[]) {
  if (outside.length === 0 && inside.length === 0) {
    return "People outside the company get a Google Calendar invite. Teammates already see the event here.";
  }
  const parts: string[] = [];
  if (outside.length === 1) {
    parts.push(`${outside[0]} is outside the company and will get a Google Calendar invite.`);
  } else if (outside.length > 1) {
    parts.push(`${outside.length} people outside the company will get a Google Calendar invite.`);
  }
  if (inside.length === 1) {
    parts.push(`${inside[0]} is on the team and already sees this on the calendar.`);
  } else if (inside.length > 1) {
    parts.push(`${inside.length} people are already in the company and see this on the calendar.`);
  }
  return parts.join(" ");
}

export function inviteSentCopy(emails: string[]) {
  if (emails.length === 0) return "";
  if (emails.length === 1) return `Google Calendar invite sent to ${emails[0]}.`;
  if (emails.length === 2) return `Google Calendar invite sent to ${emails[0]} and ${emails[1]}.`;
  return `Google Calendar invite sent to ${emails.length} people outside the company.`;
}

export function googleCalendarInviteBody(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  attendeeEmails: string[];
}) {
  return {
    summary: input.title.trim() || "Event",
    location: input.location.trim(),
    description: input.notes.trim(),
    start: { dateTime: input.startsAt },
    end: { dateTime: input.endsAt },
    attendees: input.attendeeEmails.map((email) => ({ email })),
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
  };
}

export function eventTimesAreInvitable(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export type ExternalCalendarInviteResult = {
  googleEventId: string;
  organizerStaffId: string | null;
  sent: string[];
  cancelled: boolean;
  truncated: number;
  warning?: string;
  error?: string;
};

export async function postExternalCalendarInvite(input: {
  staffId: string;
  googleEventId: string;
  cancel: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  guestEmails: string[];
  sendUpdates: "all" | "none";
}): Promise<ExternalCalendarInviteResult> {
  const response = await fetch("/api/google/calendar/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await response.json().catch(() => null)) as
    | (Partial<ExternalCalendarInviteResult> & { error?: string })
    | null;
  if (!response.ok || !json) {
    return {
      googleEventId: input.googleEventId,
      organizerStaffId: input.staffId,
      sent: [],
      cancelled: false,
      truncated: 0,
      error: json?.error || "Could not send the Google Calendar invite.",
    };
  }
  return {
    googleEventId: typeof json.googleEventId === "string" ? json.googleEventId : "",
    organizerStaffId: json.organizerStaffId ?? null,
    sent: Array.isArray(json.sent) ? json.sent.filter((email): email is string => typeof email === "string") : [],
    cancelled: Boolean(json.cancelled),
    truncated: typeof json.truncated === "number" ? json.truncated : 0,
    warning: json.warning,
  };
}
