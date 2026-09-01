import {
  googleClientId,
  googleClientSecret,
  googleEmailForToken,
  isGoogleOAuthConfigured,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export const GMAIL_COOKIE = "theroofingcrm_gmail";
export const GMAIL_OAUTH_STATE = "theroofingcrm_gmail_oauth";

export { googleClientId, googleClientSecret, googleEmailForToken, isGoogleOAuthConfigured, refreshGoogleAccessToken };

export function googleGmailRedirectUri(origin: string) {
  return process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim() || `${origin}/api/google/gmail/callback`;
}

export type StoredGmailTokens = {
  staffId: string;
  accountId: string;
  googleEmail: string;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
};

export function gmailAuthUrl(params: { origin: string; state: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", googleGmailRedirectUri(params.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export async function exchangeGmailCode(code: string, origin: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleGmailRedirectUri(origin),
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

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

export type GmailApiMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

export type ParsedGmailMessage = {
  gmailId: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  ccEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: string;
  direction: "inbound" | "outbound";
};

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  const needle = name.toLowerCase();
  return headers?.find((header) => (header.name ?? "").toLowerCase() === needle)?.value ?? "";
}

function decodeBase64Url(data: string) {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    return Buffer.from(padded + pad, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectPart(part: GmailPart | undefined, preferPlain: string[], html: string[]) {
  if (!part) return;
  const mime = (part.mimeType ?? "").toLowerCase();
  const data = part.body?.data ? decodeBase64Url(part.body.data) : "";
  if (mime === "text/plain" && data) preferPlain.push(data);
  if (mime === "text/html" && data) html.push(data);
  for (const child of part.parts ?? []) collectPart(child, preferPlain, html);
}

export function parseEmailAddress(raw: string) {
  const value = raw.trim();
  const angled = value.match(/^(.*)<([^>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].replace(/^["']|["']$/g, "").trim(),
      email: angled[2].trim().toLowerCase(),
    };
  }
  if (value.includes("@")) return { name: "", email: value.toLowerCase() };
  return { name: value, email: "" };
}

export function parseAddressList(raw: string) {
  return raw
    .split(",")
    .map((part) => parseEmailAddress(part))
    .filter((item) => item.email);
}

export function parseGmailMessage(message: GmailApiMessage, linkedEmail: string): ParsedGmailMessage | null {
  const gmailId = message.id?.trim();
  if (!gmailId) return null;
  const headers = message.payload?.headers;
  const from = parseEmailAddress(headerValue(headers, "From"));
  const toList = parseAddressList(headerValue(headers, "To"));
  const ccList = parseAddressList(headerValue(headers, "Cc"));
  const to = toList[0] ?? parseEmailAddress(headerValue(headers, "To"));
  const subject = headerValue(headers, "Subject").trim();
  const dateHeader = headerValue(headers, "Date");
  const internal = message.internalDate ? Number(message.internalDate) : NaN;
  let receivedAt = new Date().toISOString();
  if (Number.isFinite(internal)) {
    receivedAt = new Date(internal).toISOString();
  } else if (dateHeader) {
    const parsedDate = new Date(dateHeader);
    if (!Number.isNaN(parsedDate.getTime())) receivedAt = parsedDate.toISOString();
  }
  const plain: string[] = [];
  const html: string[] = [];
  collectPart(message.payload, plain, html);
  const bodyText = (plain.join("\n\n").trim() || stripHtml(html.join("\n"))).slice(0, 20_000);
  const linked = linkedEmail.trim().toLowerCase();
  const direction: "inbound" | "outbound" =
    linked && from.email && from.email === linked ? "outbound" : "inbound";
  return {
    gmailId,
    threadId: message.threadId?.trim() || gmailId,
    fromName: from.name,
    fromEmail: from.email,
    toEmail: to.email || toList.map((item) => item.email).join(", "),
    ccEmail: ccList.map((item) => item.email).join(", "),
    subject,
    snippet: (message.snippet ?? bodyText).replace(/\s+/g, " ").trim().slice(0, 280),
    bodyText,
    receivedAt,
    direction,
  };
}

async function gmailGet(path: string, accessToken: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json()) as {
    error?: { message?: string };
    messages?: { id?: string; threadId?: string }[];
    nextPageToken?: string;
  } & GmailApiMessage;
  if (!response.ok) {
    throw new Error(json.error?.message || "Gmail request failed.");
  }
  return json;
}

export async function listRecentGmailMessages(input: {
  accessToken: string;
  linkedEmail: string;
  max?: number;
}) {
  const max = Math.min(input.max ?? 40, 50);
  const list = await gmailGet(
    `users/me/messages?q=${encodeURIComponent("newer_than:30d")}&maxResults=${max}`,
    input.accessToken,
  );
  const refs = list.messages ?? [];
  const parsed: ParsedGmailMessage[] = [];
  for (const ref of refs) {
    if (!ref.id) continue;
    const raw = await gmailGet(`users/me/messages/${encodeURIComponent(ref.id)}?format=full`, input.accessToken);
    const message = parseGmailMessage(raw, input.linkedEmail);
    if (message) parsed.push(message);
  }
  return parsed.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

function encodeRfc822(message: string) {
  return Buffer.from(message, "utf8").toString("base64url");
}

export function buildRfc822(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}) {
  const needsEncode = /[^\u0000-\u007f]/.test(input.subject);
  const subject = needsEncode
    ? `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`
    : input.subject;
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body.replace(/\r?\n/g, "\r\n"),
  ].join("\r\n");
}

export async function sendGmailMessage(input: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}) {
  const raw = encodeRfc822(
    buildRfc822({
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
    }),
  );
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw,
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  });
  const json = (await response.json()) as {
    id?: string;
    threadId?: string;
    error?: { message?: string };
  };
  if (!response.ok || !json.id) {
    throw new Error(json.error?.message || "Gmail did not send that message.");
  }
  return { gmailId: json.id, threadId: json.threadId || json.id };
}
