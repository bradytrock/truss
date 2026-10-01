export const SYSTEM_EMAIL_KINDS = [
  "estimate",
  "invoice",
  "page",
  "invite",
  "lead_assign",
  "estimate_opened",
  "task_reminder",
  "stripe_revoke",
  "automation",
] as const;

export type SystemEmailKind = (typeof SYSTEM_EMAIL_KINDS)[number];

export type SystemEmailDraft = {
  subject: string;
  headline: string;
  message: string;
  button: string;
};

export type CompanyEmailTemplates = Partial<
  Record<SystemEmailKind, Partial<SystemEmailDraft>>
>;

export const SYSTEM_EMAIL_FIELDS: Array<{
  key: keyof SystemEmailDraft;
  label: string;
}> = [
  { key: "subject", label: "Subject" },
  { key: "headline", label: "Headline" },
  { key: "message", label: "Message" },
  { key: "button", label: "Button" },
];

export const SYSTEM_EMAIL_CATALOG: Array<{
  kind: SystemEmailKind;
  label: string;
  description: string;
  tokens: string[];
}> = [
  {
    kind: "estimate",
    label: "Estimate",
    description: "Emailed when you send a proposal link.",
    tokens: ["name", "company", "address", "addressClause", "number", "managerLine"],
  },
  {
    kind: "invoice",
    label: "Invoice",
    description: "Emailed when you send an invoice link.",
    tokens: ["name", "company", "number", "nameLabel", "addressClause"],
  },
  {
    kind: "page",
    label: "Document",
    description: "Emailed when you send a page or photo report.",
    tokens: ["name", "company", "document", "addressClause"],
  },
  {
    kind: "invite",
    label: "Staff invite",
    description: "Emailed when an admin sends a teammate their signup link.",
    tokens: ["name", "company", "inviter", "seat", "days"],
  },
  {
    kind: "lead_assign",
    label: "New lead",
    description: "Emailed to the assignee and team lead when a lead is assigned.",
    tokens: ["name", "company", "address", "homeownerName", "homeownerPhone", "homeownerEmail", "notes", "roleSubject"],
  },
  {
    kind: "estimate_opened",
    label: "Estimate opened",
    description: "Emailed to the project manager when a client opens a proposal.",
    tokens: ["name", "company", "who", "label", "address", "number", "subject", "message"],
  },
  {
    kind: "task_reminder",
    label: "Task reminder",
    description: "Emailed when a task is due or overdue.",
    tokens: ["name", "company", "title", "due", "subject", "statusLine", "message"],
  },
  {
    kind: "stripe_revoke",
    label: "Stripe removal",
    description: "Emailed to company admins before Stripe keys are removed.",
    tokens: ["name", "company", "requestedBy", "when"],
  },
  {
    kind: "automation",
    label: "Automation",
    description: "Wraps email an automation sends. {{message}} is the text written on that automation.",
    tokens: ["name", "company", "subject", "message"],
  },
];

export const SYSTEM_EMAIL_DEFAULTS: Record<SystemEmailKind, SystemEmailDraft> = {
  estimate: {
    subject: "Your Proposal from {{company}}{{addressClause}}",
    headline: "Hi {{name}}, your estimate from {{company}} is ready.",
    message: "{{managerLine}}Take a look, pick the option that fits, and sign right from your phone.",
    button: "Review & sign",
  },
  invoice: {
    subject: "Your Invoice from {{company}}{{addressClause}}",
    headline: "Hi {{name}}",
    message:
      "{{company}} sent invoice {{number}}{{nameLabel}}.\n\nOpen the invoice on any device and download a PDF when you need it — no account required.",
    button: "View invoice",
  },
  page: {
    subject: "{{document}} from {{company}}{{addressClause}}",
    headline: "Hi {{name}}",
    message: "{{company}} sent {{document}}.\n\nOpen the document on any device — no account required.",
    button: "Open document",
  },
  invite: {
    subject: "Set up your {{company}} account",
    headline: "Hi {{name}},",
    message:
      "{{inviter}} invited you to join {{company}}{{seat}}. This link is only for you, and it works once. After you set a password, it cannot be reused.\n\nThe invite expires in {{days}} days. If you were not expecting this, ignore the email.",
    button: "Set up your account",
  },
  lead_assign: {
    subject: "{{roleSubject}}",
    headline: "",
    message:
      "Homeowner name: {{homeownerName}}\nHomeowner phone number: {{homeownerPhone}}\nHomeowner email: {{homeownerEmail}}\nHomeowner property address: {{address}}\nNotes: {{notes}}",
    button: "",
  },
  estimate_opened: {
    subject: "{{subject}}",
    headline: "{{who}} opened {{label}}",
    message: "{{message}}",
    button: "",
  },
  task_reminder: {
    subject: "{{subject}}",
    headline: "{{statusLine}}",
    message: "{{message}}",
    button: "Open your task list",
  },
  stripe_revoke: {
    subject: "{{company}} Stripe keys will be removed in 24 hours",
    headline: "Hi {{name}},",
    message:
      "{{requestedBy}} started removal of the Stripe keys for {{company}}. They come off at {{when}}. After that, card Pay disappears until a company admin connects Stripe again.\n\nThis wait is required. Keys cannot be changed immediately once they are locked.\nIf you did not expect this, contact the other company admins right away.",
    button: "",
  },
  automation: {
    subject: "{{subject}}",
    headline: "{{subject}}",
    message: "{{message}}",
    button: "",
  },
};

const DRAFT_KEYS: Array<keyof SystemEmailDraft> = ["subject", "headline", "message", "button"];

function isKind(value: string): value is SystemEmailKind {
  return (SYSTEM_EMAIL_KINDS as readonly string[]).includes(value);
}

export function parseEmailTemplates(raw: unknown): CompanyEmailTemplates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CompanyEmailTemplates = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isKind(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const draft: Partial<SystemEmailDraft> = {};
    const row = value as Record<string, unknown>;
    for (const field of DRAFT_KEYS) {
      const text = row[field];
      if (typeof text === "string" && text.trim()) draft[field] = text;
    }
    if (Object.keys(draft).length) out[key] = draft;
  }
  return out;
}

export function emailTemplateHasOverride(
  templates: CompanyEmailTemplates | null | undefined,
  kind: SystemEmailKind,
) {
  const stored = templates?.[kind];
  if (!stored) return false;
  return DRAFT_KEYS.some((field) => Boolean(stored[field]?.trim()));
}

export function emailTemplateFieldValue(
  templates: CompanyEmailTemplates | null | undefined,
  kind: SystemEmailKind,
  field: keyof SystemEmailDraft,
) {
  const stored = templates?.[kind]?.[field];
  if (typeof stored === "string" && stored.trim()) return stored;
  return SYSTEM_EMAIL_DEFAULTS[kind][field];
}

export function updateEmailTemplateDraft(
  templates: CompanyEmailTemplates | null | undefined,
  kind: SystemEmailKind,
  field: keyof SystemEmailDraft,
  value: string,
): CompanyEmailTemplates {
  const next: CompanyEmailTemplates = { ...(templates ?? {}) };
  const current: Partial<SystemEmailDraft> = { ...(next[kind] ?? {}) };
  if (!value.trim() || value === SYSTEM_EMAIL_DEFAULTS[kind][field]) delete current[field];
  else current[field] = value;
  if (Object.keys(current).length === 0) delete next[kind];
  else next[kind] = current;
  return next;
}

export function clearEmailTemplate(
  templates: CompanyEmailTemplates | null | undefined,
  kind: SystemEmailKind,
): CompanyEmailTemplates {
  const next: CompanyEmailTemplates = { ...(templates ?? {}) };
  delete next[kind];
  return next;
}

function fillTokens(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    return vars[key] ?? "";
  });
}

export function resolveSystemEmail(
  kind: SystemEmailKind,
  templates: CompanyEmailTemplates | null | undefined,
  vars: Record<string, string | null | undefined>,
): SystemEmailDraft {
  const base = SYSTEM_EMAIL_DEFAULTS[kind];
  const stored = templates?.[kind] ?? {};
  const draft: SystemEmailDraft = {
    subject: stored.subject?.trim() || base.subject,
    headline: stored.headline?.trim() || base.headline,
    message: stored.message?.trim() || base.message,
    button: stored.button?.trim() || base.button,
  };
  return {
    subject: fillTokens(draft.subject, vars).trim(),
    headline: fillTokens(draft.headline, vars).trim(),
    message: fillTokens(draft.message, vars).trim(),
    button: fillTokens(draft.button, vars).trim(),
  };
}

export function systemEmailText(input: { headline?: string; message: string; url?: string }) {
  return [input.headline?.trim(), input.message.trim(), input.url?.trim()].filter(Boolean).join("\n\n");
}

export function systemEmailHtml(input: { headline?: string; message: string; button?: string; url?: string }) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const headline = input.headline?.trim()
    ? `<p style="margin:0 0 12px;font-size:18px;line-height:1.4;">${escape(input.headline.trim())}</p>`
    : "";
  const message = `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escape(input.message).replaceAll("\n", "<br/>")}</p>`;
  const button =
    input.button?.trim() && input.url?.trim()
      ? `<p style="margin:0 0 8px;"><a href="${escape(input.url.trim())}" style="display:inline-block;background:#b51e28;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">${escape(input.button.trim())}</a></p>`
      : "";
  return `${headline}${message}${button}`;
}
