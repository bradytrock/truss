import { cardUrl } from "@/lib/card";
import { firstName } from "@/lib/phone";
import { looksLikeEmail } from "@/lib/share-text";
import type { Contact, Job, StaffMember } from "@/lib/types";

export const EMAIL_CAMPAIGN_AUDIENCES = ["realtors", "clients", "past_clients", "storm"] as const;
export type EmailCampaignAudience = (typeof EMAIL_CAMPAIGN_AUDIENCES)[number];

export const EMAIL_CAMPAIGN_AUDIENCE_LABELS: Record<EmailCampaignAudience, string> = {
  realtors: "Realtors",
  clients: "Current clients",
  past_clients: "Past clients",
  storm: "Storm / ZIP",
};

export const EMAIL_CAMPAIGN_SEND_CAP = 200;

export type EmailCampaignFilter = {
  city?: string;
  zip?: string;
  includePunch?: boolean;
};

export type EmailCampaignRecipient = {
  contactId: string;
  jobId: string | null;
  email: string;
  name: string;
  jobAddress: string;
  jobCity: string;
};

export type EmailCampaignMergeInput = {
  recipient: EmailCampaignRecipient;
  companyName: string;
  staffName: string;
  staffPhone: string;
  staffCardUrl: string;
};

export type EmailCampaignRecord = {
  id: string;
  name: string;
  audienceKind: EmailCampaignAudience;
  audienceCity: string;
  audienceZip: string;
  includePunch: boolean;
  subject: string;
  bodyText: string;
  status: string;
  createdByName: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  sentAt: string | null;
};

export function isEmailCampaignAudience(value: string): value is EmailCampaignAudience {
  return (EMAIL_CAMPAIGN_AUDIENCES as readonly string[]).includes(value);
}

export function normalizeCampaignEmail(value: string) {
  return value.trim().toLowerCase();
}

export function jobAddressLine(job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location">) {
  const line = [job.street, job.city, job.state, job.postalCode].filter(Boolean).join(", ");
  return line || job.location.trim();
}

function liveJobs(jobs: Job[]) {
  return jobs.filter((job) => !job.deletedAt);
}

function contactsOnJob(job: Job, contacts: Contact[], homeownersOnly: boolean) {
  const related = new Set(job.relatedContactIds);
  return contacts.filter((contact) => {
    if (homeownersOnly && contact.isReferralPartner) return false;
    if (job.primaryContactId && contact.id === job.primaryContactId) return true;
    if (related.has(contact.id)) return true;
    if (job.clientId && contact.clientId === job.clientId && !contact.isReferralPartner) return true;
    return false;
  });
}

function matchesStormJob(job: Job, filter: EmailCampaignFilter) {
  const city = filter.city?.trim().toLowerCase() ?? "";
  const zip = filter.zip?.trim().replace(/\s+/g, "") ?? "";
  if (!city && !zip) return false;
  const jobCity = `${job.city} ${job.location}`.toLowerCase();
  const jobZip = job.postalCode.replace(/\s+/g, "");
  const cityOk = !city || jobCity.includes(city);
  const zipOk = !zip || jobZip.startsWith(zip) || jobZip.includes(zip);
  return cityOk && zipOk;
}

function pushRecipient(
  byEmail: Map<string, EmailCampaignRecipient>,
  contact: Contact,
  job?: Job | null,
) {
  const email = normalizeCampaignEmail(contact.email);
  if (!looksLikeEmail(email) || byEmail.has(email)) return;
  byEmail.set(email, {
    contactId: contact.id,
    jobId: job?.id ?? null,
    email,
    name: contact.name.trim() || email,
    jobAddress: job ? jobAddressLine(job) : "",
    jobCity: job?.city.trim() || "",
  });
}

export function resolveEmailCampaignAudience(
  kind: EmailCampaignAudience,
  contacts: Contact[],
  jobs: Job[],
  filter: EmailCampaignFilter = {},
): EmailCampaignRecipient[] {
  const byEmail = new Map<string, EmailCampaignRecipient>();
  const book = liveJobs(jobs);

  if (kind === "realtors") {
    for (const contact of contacts) {
      if (contact.isReferralPartner) pushRecipient(byEmail, contact);
    }
    return [...byEmail.values()];
  }

  const selected = book.filter((job) => {
    if (kind === "clients") return job.status === "in_progress";
    if (kind === "past_clients") {
      if (job.status === "complete") return true;
      return Boolean(filter.includePunch && job.status === "punch");
    }
    return matchesStormJob(job, filter);
  });

  for (const job of selected) {
    for (const contact of contactsOnJob(job, contacts, true)) {
      pushRecipient(byEmail, contact, job);
    }
  }
  return [...byEmail.values()];
}

export function campaignStaffCardUrl(input: {
  companySlug?: string;
  staff?: Pick<StaffMember, "cardSlug"> | null;
  origin?: string;
}) {
  const slug = input.companySlug?.trim() ?? "";
  const person = input.staff?.cardSlug?.trim() ?? "";
  if (!slug || !person) return "";
  return cardUrl(slug, person, input.origin || "");
}

export function applyEmailCampaignMerge(template: string, input: EmailCampaignMergeInput) {
  const values: Record<string, string> = {
    first: firstName(input.recipient.name),
    name: input.recipient.name,
    email: input.recipient.email,
    company: input.companyName,
    companyName: input.companyName,
    "job.address": input.recipient.jobAddress,
    jobAddress: input.recipient.jobAddress,
    "job.city": input.recipient.jobCity,
    jobCity: input.recipient.jobCity,
    "staff.name": input.staffName,
    staffName: input.staffName,
    "staff.phone": input.staffPhone,
    staffPhone: input.staffPhone,
    "staff.card": input.staffCardUrl,
    staffCardUrl: input.staffCardUrl,
  };
  return template
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key]?.trim() ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function htmlParagraphs(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks
    .map((block) => {
      const lines = escapeHtml(block).replaceAll("\n", "<br />");
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#404040;">${lines}</p>`;
    })
    .join("");
}

export function emailCampaignHtml(input: {
  company: string;
  subject: string;
  body: string;
  staffName: string;
  staffTitle?: string;
  staffPhone: string;
  staffEmail?: string;
  cardUrl?: string;
  unsubscribeUrl: string;
  logoUrl?: string;
}) {
  const company = escapeHtml(input.company.trim() || "the contractor");
  const logo = input.logoUrl?.trim() ?? "";
  const logoBlock = logo
    ? `<img src="${escapeHtml(logo)}" alt="${company}" width="200" style="display:block;max-width:200px;width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="display:inline-block;font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#fafafa;">${company}</span>`;
  const card = input.cardUrl?.trim() ?? "";
  const cardBlock = card
    ? `<tr>
        <td style="padding:8px 40px 28px;">
          <a href="${escapeHtml(card)}" style="display:block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:16px 24px;font-size:15px;font-weight:700;letter-spacing:-0.01em;text-align:center;">Save my card&nbsp;&nbsp;&#8594;</a>
        </td>
      </tr>`
    : "";
  const phone = input.staffPhone.trim();
  const email = input.staffEmail?.trim() ?? "";
  const telHref = phone.replace(/[^\d+]/g, "");
  const contactBits = [
    phone
      ? `<a href="tel:${escapeHtml(telHref)}" style="color:#5eead4;text-decoration:none;font-weight:600;">${escapeHtml(phone)}</a>`
      : "",
    email
      ? `<a href="mailto:${escapeHtml(email)}" style="color:#e5e5e5;text-decoration:none;">${escapeHtml(email)}</a>`
      : "",
  ].filter(Boolean);
  const staffName = input.staffName.trim();
  const staffBlock = staffName
    ? `<tr>
        <td style="padding:0;background:#0a0a0a;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:28px 40px 6px;font-size:11px;line-height:1.2;letter-spacing:0.18em;text-transform:uppercase;color:#737373;font-weight:600;">${escapeHtml(input.staffTitle?.trim() || "Project manager")}</td>
            </tr>
            <tr>
              <td style="padding:2px 40px ${contactBits.length ? "12px" : "28px"};font-size:22px;line-height:1.2;font-weight:700;letter-spacing:-0.03em;color:#fafafa;">${escapeHtml(staffName)}</td>
            </tr>
            ${
              contactBits.length
                ? `<tr><td style="padding:0 40px 28px;font-size:13px;line-height:1.5;color:#e5e5e5;">${contactBits.join(" &nbsp;·&nbsp; ")}</td></tr>`
                : ""
            }
          </table>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#e5e5e5;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e5e5e5;padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-collapse:collapse;">
            <tr>
              <td style="padding:0;background:#0a0a0a;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:32px 40px 28px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" style="background:#ffffff;">
                        <tr>
                          <td style="padding:16px 20px;">${logoBlock}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="height:3px;line-height:3px;font-size:0;background:#14b8a6;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 8px;">${htmlParagraphs(input.body)}</td>
            </tr>
            ${cardBlock}
            ${staffBlock}
          </table>
          <p style="margin:22px 0 0;font-size:11px;line-height:1.5;color:#737373;max-width:600px;text-align:center;">
            Sent by ${company}.
            <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0f766e;text-decoration:underline;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailCampaignText(input: {
  body: string;
  staffName: string;
  staffPhone: string;
  cardUrl?: string;
  unsubscribeUrl: string;
}) {
  const parts = [input.body.trim()];
  if (input.cardUrl?.trim()) parts.push("", input.cardUrl.trim());
  const sign = [input.staffName.trim(), input.staffPhone.trim()].filter(Boolean).join(" · ");
  if (sign) parts.push("", sign);
  parts.push("", `Unsubscribe: ${input.unsubscribeUrl}`);
  return parts.join("\n");
}

export function defaultEmailCampaignCopy(kind: EmailCampaignAudience): { subject: string; body: string } {
  if (kind === "realtors") {
    return {
      subject: "Preferred roofer for your listings — {{company}}",
      body: "Hi {{first}},\n\nWanted to put a card in your pocket for the next inspection or claim. We keep sellers on schedule and send updates you can forward.\n\n{{staff.card}}\n\n{{staff.name}}\n{{staff.phone}}",
    };
  }
  if (kind === "clients") {
    return {
      subject: "Quick update from {{company}}",
      body: "Hi {{first}},\n\nChecking in on {{job.address}}. Reply to this email if you need anything this week — I am on it.\n\n{{staff.name}}\n{{staff.phone}}",
    };
  }
  if (kind === "past_clients") {
    return {
      subject: "Checking in from {{company}}",
      body: "Hi {{first}},\n\nIt has been a while since we were at {{job.address}}. If a leak, insurance question, or a neighbor needs a name, I am still your person.\n\n{{staff.card}}\n\n{{staff.name}}\n{{staff.phone}}",
    };
  }
  return {
    subject: "Storm check-in from {{company}}",
    body: "Hi {{first}},\n\nWe are checking roofs in {{job.city}} after the storm. If {{job.address}} took hail or wind, reply here and I will come look — no pressure.\n\n{{staff.card}}\n\n{{staff.name}}\n{{staff.phone}}",
  };
}

export function mapEmailCampaignRow(row: {
  id: string;
  name: string;
  audience_kind: string;
  audience_city: string;
  audience_zip: string;
  include_punch: boolean;
  subject: string;
  body_text: string;
  status: string;
  created_by_name: string;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  sent_at: string | null;
}): EmailCampaignRecord {
  return {
    id: row.id,
    name: row.name,
    audienceKind: isEmailCampaignAudience(row.audience_kind) ? row.audience_kind : "storm",
    audienceCity: row.audience_city,
    audienceZip: row.audience_zip,
    includePunch: row.include_punch,
    subject: row.subject,
    bodyText: row.body_text,
    status: row.status,
    createdByName: row.created_by_name,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  };
}
