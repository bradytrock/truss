"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  SYSTEM_EMAIL_CATALOG,
  SYSTEM_EMAIL_FIELDS,
  clearEmailTemplate,
  emailTemplateFieldValue,
  emailTemplateHasOverride,
  resolveSystemEmail,
  updateEmailTemplateDraft,
  type CompanyEmailTemplates,
  type SystemEmailKind,
} from "@/lib/email-templates";

const SAMPLE_VARS: Record<SystemEmailKind, Record<string, string>> = {
  estimate: {
    name: "Dana",
    company: "T Rock Roofing",
    address: "100 Main St, Plano, TX",
    addressClause: " for 100 Main St, Plano, TX",
    number: "E-1042",
    managerLine: "Alex put this together after walking your roof. ",
  },
  invoice: {
    name: "Dana",
    company: "T Rock Roofing",
    number: "I-220",
    nameLabel: " (100 Main St)",
    addressClause: " for 100 Main St, Plano, TX",
  },
  page: {
    name: "Dana",
    company: "T Rock Roofing",
    document: "Roof photo report",
    addressClause: " for 100 Main St, Plano, TX",
  },
  invite: {
    name: "Alex",
    company: "T Rock Roofing",
    inviter: "Jordan",
    seat: " as Project manager",
    days: "14",
  },
  lead_assign: {
    name: "Alex",
    company: "T Rock Roofing",
    address: "100 Main St, Plano, TX",
    homeownerName: "Dana Alvarez",
    homeownerPhone: "(214) 555-0101",
    homeownerEmail: "dana@home.test",
    notes: "Storm damage on the south slope.",
    roleSubject: "New Lead assigned to you - 100 Main St, Plano, TX",
  },
  estimate_opened: {
    name: "Alex",
    company: "T Rock Roofing",
    who: "Dana Alvarez",
    label: "E-1042",
    address: "100 Main St, Plano, TX",
    number: "E-1042",
    subject: "Proposal E-1042 opened — 100 Main St, Plano, TX",
    message: "Dana Alvarez opened proposal E-1042 (100 Main St, Plano, TX).",
  },
  task_reminder: {
    name: "Alex",
    company: "T Rock Roofing",
    title: "Order ridge cap",
    due: "Sep 29, 2026",
    subject: "Due today: Order ridge cap",
    statusLine: "Order ridge cap is due today.",
    message: "Deadline: Sep 29, 2026\nAssigned to: Alex Rivera",
  },
  stripe_revoke: {
    name: "Jordan",
    company: "T Rock Roofing",
    requestedBy: "Alex Rivera",
    when: "Wed, Sep 30, 2026, 3:00 PM",
  },
  automation: {
    name: "Dana",
    company: "T Rock Roofing",
    subject: "Your install is scheduled",
    message: "We can start Monday. Reply here if that day does not work.",
  },
};

export function EmailTemplateSettings({
  templates,
  onChange,
}: {
  templates: CompanyEmailTemplates | undefined;
  onChange: (templates: CompanyEmailTemplates) => void;
}) {
  const [kind, setKind] = useState<SystemEmailKind>("estimate");
  const catalog = SYSTEM_EMAIL_CATALOG.find((item) => item.kind === kind) ?? SYSTEM_EMAIL_CATALOG[0];
  const preview = resolveSystemEmail(kind, templates, SAMPLE_VARS[kind]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="email-template-kind">Email</Label>
        <select
          id="email-template-kind"
          className="border-input bg-background h-8 w-full rounded-md border px-2.5 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as SystemEmailKind)}
        >
          {SYSTEM_EMAIL_CATALOG.map((item) => (
            <option key={item.kind} value={item.kind}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{catalog.description}</p>
      </div>

      {SYSTEM_EMAIL_FIELDS.map((field) => (
        <div key={field.key} className="grid gap-1.5">
          <Label htmlFor={`email-template-${field.key}`}>{field.label}</Label>
          <Textarea
            id={`email-template-${field.key}`}
            rows={field.key === "message" ? 6 : 2}
            className="field-sizing-fixed min-h-16 resize-y"
            value={emailTemplateFieldValue(templates, kind, field.key)}
            onChange={(event) =>
              onChange(updateEmailTemplateDraft(templates, kind, field.key, event.target.value))
            }
          />
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Tokens: {catalog.tokens.map((token) => `{{${token}}}`).join(", ")}. Clearing a field puts
        the built-in wording back. Saved copy is used every time the system sends that email.
      </p>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
        <p className="mt-2 font-medium">{preview.subject || "No subject"}</p>
        {preview.headline ? <p className="mt-2">{preview.headline}</p> : null}
        <p className="mt-2 whitespace-pre-line text-muted-foreground">{preview.message}</p>
        {preview.button ? <p className="mt-3 font-medium">{preview.button}</p> : null}
      </div>

      {emailTemplateHasOverride(templates, kind) ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(clearEmailTemplate(templates, kind))}
          >
            Reset {catalog.label.toLowerCase()} email
          </Button>
        </div>
      ) : null}
    </div>
  );
}
