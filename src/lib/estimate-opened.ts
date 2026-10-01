const PREVIEW_BOT =
  /facebookexternalhit|facebot|twitterbot|applebot|slackbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|iframely|embedly|pinterest|bingpreview|googlebot|preview\/|crawler|spider|bot\/|bot;/i;

/** iMessage, Slack, and other unfurlers fetch the page without a person opening it. */
export function isLinkPreviewBot(userAgent: string | null | undefined) {
  return PREVIEW_BOT.test(userAgent ?? "");
}

export type EstimateOpenedNotify = {
  staffId?: string | null;
  name: string;
  phone: string;
  email: string;
  estimateNumber: string;
  estimateName: string;
  jobCode: string;
  address: string;
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyId: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseEstimateOpenedNotify(raw: unknown): EstimateOpenedNotify | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const notify =
    row.notify && typeof row.notify === "object" ? (row.notify as Record<string, unknown>) : row;
  const name = asString(notify.name);
  const phone = asString(notify.phone);
  const email = asString(notify.email);
  if (!name && !phone && !email) return null;
  return {
    staffId: asString(notify.staffId) || null,
    name,
    phone,
    email,
    estimateNumber: asString(notify.estimateNumber),
    estimateName: asString(notify.estimateName),
    jobCode: asString(notify.jobCode),
    address: asString(notify.address),
    contactName: asString(notify.contactName),
    companyName: asString(notify.companyName),
    companyEmail: asString(notify.companyEmail),
    companyId: asString(notify.companyId),
  };
}

export function estimateOpenedWho(contactName: string | null | undefined) {
  return contactName?.trim() || "The homeowner";
}

export function estimateOpenedLabel(input: {
  estimateNumber?: string | null;
  estimateName?: string | null;
}) {
  return input.estimateNumber?.trim() || input.estimateName?.trim() || "the proposal";
}

export function estimateOpenedActivityBody(input: {
  contactName?: string | null;
  estimateNumber?: string | null;
  estimateName?: string | null;
}) {
  return `${estimateOpenedWho(input.contactName)} opened proposal ${estimateOpenedLabel(input)}.`;
}

export function estimateOpenedSms(input: EstimateOpenedNotify) {
  const who = estimateOpenedWho(input.contactName);
  const label = estimateOpenedLabel(input);
  const where = input.address.trim();
  const job = input.jobCode.trim();
  const site = [job, where].filter(Boolean).join(" · ");
  return site ? `${who} opened proposal ${label} (${site}).` : `${who} opened proposal ${label}.`;
}

export function estimateOpenedEmailSubject(input: Pick<EstimateOpenedNotify, "estimateNumber" | "address">) {
  const number = input.estimateNumber.trim();
  const address = input.address.trim();
  if (number && address) return `Proposal ${number} opened — ${address}`;
  if (number) return `Proposal ${number} was opened`;
  if (address) return `Proposal opened — ${address}`;
  return "A proposal was opened";
}

export function estimateOpenedEmailText(input: EstimateOpenedNotify) {
  const lines = [
    estimateOpenedSms(input),
    input.jobCode.trim() ? `Job: ${input.jobCode.trim()}` : "",
    input.address.trim() ? `Address: ${input.address.trim()}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
