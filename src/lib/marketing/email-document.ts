import { useSyncExternalStore } from "react";
import type { EmailCampaignAudience } from "@/lib/marketing/email-campaigns";
import { readMarketingLocal, subscribeMarketingLocal, writeMarketingLocal } from "@/lib/marketing/local-store";

export const EMAIL_BLOCK_TYPES = [
  "text",
  "image",
  "button",
  "columns",
  "job_photos",
  "before_after",
  "review",
  "rep_card",
  "divider",
  "video",
  "social",
  "spacer",
] as const;

export type EmailBlockType = (typeof EMAIL_BLOCK_TYPES)[number];

export type EmailTextRole = "headline" | "kicker" | "body";

export type EmailBlock =
  | { id: string; type: "text"; role: EmailTextRole; text: string; align: "left" | "center" }
  | { id: string; type: "image"; alt: string; url: string }
  | {
      id: string;
      type: "button";
      label: string;
      href: string;
      color: string;
      width: "fit" | "full";
      trackInspection: boolean;
    }
  | { id: string; type: "columns"; left: string; right: string }
  | { id: string; type: "job_photos"; caption: string }
  | { id: string; type: "before_after"; caption: string }
  | { id: string; type: "review"; quote: string; name: string; stars: number }
  | { id: string; type: "rep_card" }
  | { id: string; type: "divider" }
  | { id: string; type: "video"; url: string }
  | { id: string; type: "social" }
  | { id: string; type: "spacer"; height: number };

export type EmailDocument = {
  id: string;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  audienceKind: EmailCampaignAudience;
  listId: string | null;
  city: string;
  zip: string;
  includePunch: boolean;
  updatedAt: string;
  status: "draft" | "scheduled" | "sent";
  scheduledFor: string | null;
  campaignId: string | null;
};

export const EMAIL_BLOCK_LABELS: Record<EmailBlockType, string> = {
  text: "Text",
  image: "Image",
  button: "Button",
  columns: "Columns",
  job_photos: "Job photos",
  before_after: "Before / after",
  review: "Review",
  rep_card: "Rep card",
  divider: "Divider",
  video: "Video",
  social: "Social",
  spacer: "Spacer",
};

const STORAGE_KEY = "truss.marketing.email-docs.v1";

export function emailBlockId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmailBlock(type: EmailBlockType): EmailBlock {
  const id = emailBlockId();
  switch (type) {
    case "text":
      return {
        id,
        type,
        role: "body",
        align: "left",
        text: "Hi {{firstName}},\n\nWrite the note homeowners should actually read.",
      };
    case "image":
      return { id, type, alt: "Job photo", url: "" };
    case "button":
      return {
        id,
        type,
        label: "Book a free inspection",
        href: "{{inspectionLink}}",
        color: "#d71c27",
        width: "fit",
        trackInspection: true,
      };
    case "columns":
      return { id, type, left: "Left column", right: "Right column" };
    case "job_photos":
      return { id, type, caption: "Recent roofs near you" };
    case "before_after":
      return { id, type, caption: "Before and after" };
    case "review":
      return {
        id,
        type,
        quote: "Crew showed up on time, and they cleaned the whole yard.",
        name: "Homeowner · Google",
        stars: 5,
      };
    case "rep_card":
      return { id, type: "rep_card" };
    case "divider":
      return { id, type: "divider" };
    case "video":
      return { id, type, url: "" };
    case "social":
      return { id, type: "social" };
    case "spacer":
      return { id, type, height: 24 };
  }
}

export function createDefaultEmailDocument(preset?: { listId?: string; name?: string }): EmailDocument {
  const headline = createEmailBlock("text");
  if (headline.type === "text") {
    headline.role = "headline";
    headline.text = "Hail hit {{jobCity}} yesterday.";
  }
  const body = createEmailBlock("text");
  if (body.type === "text") {
    body.text =
      "Hi {{firstName}},\n\nStorms like this often damage shingles in ways you can't see from the ground, and insurance carriers set deadlines for claims. Our crews are already working near you this week, so a free 20-minute inspection is easy to fit in.";
  }
  const kicker = createEmailBlock("text");
  if (kicker.type === "text") {
    kicker.role = "kicker";
    kicker.text = "Recent roofs near you";
  }
  const photo = createEmailBlock("image");
  if (photo.type === "image") photo.alt = "Job photo · hail damage close-up";
  return {
    id: emailBlockId(),
    name: preset?.name?.trim() || "Hail check",
    subject: "Hail hit {{jobCity}} — free roof check this week",
    blocks: [
      photo,
      headline,
      body,
      kicker,
      createEmailBlock("job_photos"),
      createEmailBlock("button"),
      createEmailBlock("review"),
      createEmailBlock("rep_card"),
    ],
    audienceKind: preset?.listId ? "list" : "storm",
    listId: preset?.listId || null,
    city: "",
    zip: "",
    includePunch: false,
    updatedAt: new Date().toISOString(),
    status: "draft",
    scheduledFor: null,
    campaignId: null,
  };
}

function isBlock(value: unknown): value is EmailBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as { id?: unknown; type?: unknown };
  return typeof block.id === "string" && EMAIL_BLOCK_TYPES.includes(block.type as EmailBlockType);
}

const EMPTY_DOCS: EmailDocument[] = [];

function parseEmailDocuments(raw: string): EmailDocument[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return EMPTY_DOCS;
  return parsed
    .filter((item): item is EmailDocument => {
      if (!item || typeof item !== "object") return false;
      const doc = item as EmailDocument;
      return typeof doc.id === "string" && typeof doc.subject === "string" && Array.isArray(doc.blocks);
    })
    .map((doc) => ({
      ...doc,
      blocks: doc.blocks.filter(isBlock),
      audienceKind: doc.audienceKind || "storm",
      listId: doc.listId ?? null,
      city: doc.city || "",
      zip: doc.zip || "",
      includePunch: Boolean(doc.includePunch),
      status: doc.status || "draft",
      scheduledFor: doc.scheduledFor ?? null,
      campaignId: doc.campaignId ?? null,
      name: doc.name || "Untitled campaign",
      updatedAt: doc.updatedAt || new Date().toISOString(),
    }));
}

export function loadEmailDocuments(companyId: string): EmailDocument[] {
  return readMarketingLocal(`${STORAGE_KEY}:${companyId}`, EMPTY_DOCS, parseEmailDocuments);
}

export function saveEmailDocuments(companyId: string, docs: EmailDocument[]) {
  writeMarketingLocal(`${STORAGE_KEY}:${companyId}`, docs);
}

export function useEmailDocuments(companyId: string) {
  return useSyncExternalStore(
    subscribeMarketingLocal,
    () => loadEmailDocuments(companyId),
    () => EMPTY_DOCS,
  );
}

export function emailDocumentPlainText(doc: EmailDocument) {
  const lines: string[] = [];
  for (const block of doc.blocks) {
    if (block.type === "text" || block.type === "columns") {
      if (block.type === "text") lines.push(block.text);
      else lines.push(block.left, block.right);
    } else if (block.type === "button") lines.push(block.label, block.href);
    else if (block.type === "review") lines.push(block.quote, block.name);
    else if (block.type === "image" || block.type === "job_photos" || block.type === "before_after") {
      lines.push(block.type === "image" ? block.alt : block.caption);
    } else if (block.type === "rep_card") lines.push("{{repName}}", "{{repPhone}}");
  }
  return lines.map((line) => line.trim()).filter(Boolean).join("\n\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textHtml(text: string, style: string) {
  const safe = escapeHtml(text).replaceAll("\n", "<br />");
  return `<p style="margin:0 0 16px;${style}">${safe}</p>`;
}

export function renderEmailDocumentHtml(input: {
  doc: EmailDocument;
  companyName: string;
  phone: string;
  logoUrl?: string;
  address?: string;
}) {
  const company = escapeHtml(input.companyName || "Your company");
  const phone = escapeHtml(input.phone || "");
  const logo = input.logoUrl?.trim() ?? "";
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="${company}" width="140" style="display:block;max-width:140px;height:auto;border:0;" />`
    : `<span style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#737373;">${company}</span>`;
  const blocks = input.doc.blocks
    .map((block) => {
      if (block.type === "text") {
        if (block.role === "headline") {
          return textHtml(block.text, "font-size:30px;line-height:1.2;font-weight:600;color:#1c1b1a;font-family:Georgia,'Times New Roman',serif;");
        }
        if (block.role === "kicker") {
          return textHtml(block.text, "font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#737373;font-weight:600;");
        }
        return textHtml(block.text, `font-size:16px;line-height:1.6;color:#3f3f3f;text-align:${block.align};`);
      }
      if (block.type === "image") {
        if (block.url) {
          return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;margin:0 0 18px;" />`;
        }
        return `<div style="margin:0 0 18px;background:#ece7df;color:#8a847a;text-align:center;padding:72px 16px;font-size:13px;">${escapeHtml(block.alt || "Photo")}</div>`;
      }
      if (block.type === "button") {
        const width = block.width === "full" ? "display:block;width:100%;box-sizing:border-box;" : "display:inline-block;";
        return `<p style="margin:8px 0 20px;text-align:center;"><a href="${escapeHtml(block.href || "{{inspectionLink}}")}" style="${width}background:${escapeHtml(block.color || "#d71c27")};color:#ffffff;text-decoration:none;padding:14px 28px;font-size:15px;font-weight:700;border-radius:6px;">${escapeHtml(block.label || "Book")}</a></p>`;
      }
      if (block.type === "columns") {
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;"><tr><td width="50%" valign="top" style="padding-right:8px;font-size:15px;line-height:1.5;color:#3f3f3f;">${escapeHtml(block.left)}</td><td width="50%" valign="top" style="padding-left:8px;font-size:15px;line-height:1.5;color:#3f3f3f;">${escapeHtml(block.right)}</td></tr></table>`;
      }
      if (block.type === "job_photos" || block.type === "before_after") {
        const cells = [1, 2, 3]
          .map(
            (n) =>
              `<td width="33%" style="padding:4px;"><div style="background:#ece7df;color:#8a847a;text-align:center;padding:36px 6px;font-size:12px;">${escapeHtml(block.caption)} ${n}</div></td>`,
          )
          .join("");
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;"><tr>${cells}</tr></table>`;
      }
      if (block.type === "review") {
        const stars = "★".repeat(Math.max(1, Math.min(5, block.stars || 5)));
        return `<div style="margin:0 0 18px;background:#f6f4f1;padding:16px 18px;"><div style="color:#e0a100;letter-spacing:2px;font-size:14px;">${stars}</div><p style="margin:8px 0;font-size:15px;line-height:1.5;color:#1c1b1a;">${escapeHtml(block.quote)}</p><p style="margin:0;font-size:12px;color:#737373;">${escapeHtml(block.name)}</p></div>`;
      }
      if (block.type === "rep_card") {
        return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 18px;"><tr><td style="width:42px;height:42px;background:#1c1b1a;color:#fff;text-align:center;border-radius:21px;font-size:12px;font-weight:700;">PM</td><td style="padding-left:12px;font-size:14px;color:#1c1b1a;"><strong>{{repName}}</strong><br /><span style="color:#d71c27;">{{repPhone}}</span></td></tr></table>`;
      }
      if (block.type === "divider") return `<hr style="border:0;border-top:1px solid #e7e5e4;margin:8px 0 18px;" />`;
      if (block.type === "spacer") return `<div style="height:${Math.max(8, Math.min(120, block.height))}px;line-height:${Math.max(8, Math.min(120, block.height))}px;">&nbsp;</div>`;
      if (block.type === "video") {
        const label = block.url ? escapeHtml(block.url) : "Video link";
        return `<p style="margin:0 0 16px;"><a href="${escapeHtml(block.url || "#")}" style="color:#d71c27;">${label}</a></p>`;
      }
      return `<p style="margin:0 0 16px;font-size:13px;color:#737373;">Facebook · Instagram · Google</p>`;
    })
    .join("");
  const address = input.address?.trim() ? escapeHtml(input.address.trim()) : "";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.doc.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#ece7df;font-family:Helvetica,Arial,sans-serif;color:#1c1b1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ece7df;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;">
            <tr>
              <td style="padding:22px 28px 10px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>${logoHtml}</td>
                    <td align="right" style="font-size:13px;color:#737373;">${phone}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td style="height:3px;background:#d71c27;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:28px 28px 8px;">${blocks}</td></tr>
            <tr>
              <td style="padding:18px 28px 26px;background:#fafafa;font-size:11px;line-height:1.5;color:#737373;text-align:center;">
                ${company}${address ? ` · ${address}` : ""}<br />
                You're getting this because you're a customer.
                <a href="{{unsubscribeUrl}}" style="color:#1f6f5b;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type SavedEmailBlock = { id: string; name: string; block: EmailBlock };

const SAVED_KEY = "truss.marketing.email-saved-blocks.v1";

const EMPTY_SAVED: SavedEmailBlock[] = [];

export function loadSavedEmailBlocks(companyId: string): SavedEmailBlock[] {
  return readMarketingLocal(`${SAVED_KEY}:${companyId}`, EMPTY_SAVED, (raw) => {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return EMPTY_SAVED;
    return parsed.filter((item): item is SavedEmailBlock => {
      if (!item || typeof item !== "object") return false;
      const saved = item as SavedEmailBlock;
      return typeof saved.id === "string" && typeof saved.name === "string" && isBlock(saved.block);
    });
  });
}

export function saveSavedEmailBlocks(companyId: string, blocks: SavedEmailBlock[]) {
  writeMarketingLocal(`${SAVED_KEY}:${companyId}`, blocks);
}

export function useSavedEmailBlocks(companyId: string) {
  return useSyncExternalStore(
    subscribeMarketingLocal,
    () => loadSavedEmailBlocks(companyId),
    () => EMPTY_SAVED,
  );
}
