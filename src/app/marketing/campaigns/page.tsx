"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import {
  applyEmailCampaignMerge,
  campaignStaffCardUrl,
  defaultEmailCampaignCopy,
  EMAIL_CAMPAIGN_AUDIENCE_LABELS,
  EMAIL_CAMPAIGN_AUDIENCES,
  EMAIL_CAMPAIGN_SEND_CAP,
  resolveEmailCampaignAudience,
  type EmailCampaignAudience,
  type EmailCampaignRecord,
} from "@/lib/marketing/email-campaigns";
import { cn } from "@/lib/utils";

const MERGE_HINTS = ["{{first}}", "{{job.address}}", "{{staff.phone}}", "{{staff.card}}"];

export default function MarketingCampaignsPage() {
  const crm = useCrm();
  const [audience, setAudience] = useState<EmailCampaignAudience>("realtors");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [includePunch, setIncludePunch] = useState(false);
  const copy = defaultEmailCampaignCopy(audience);
  const [subject, setSubject] = useState(copy.subject);
  const [body, setBody] = useState(copy.body);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<EmailCampaignRecord[]>([]);
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const next = defaultEmailCampaignCopy(audience);
    setSubject(next.subject);
    setBody(next.body);
    setPreviewIndex(0);
  }, [audience]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/marketing/campaigns");
      const payload = (await response.json().catch(() => null)) as {
        campaigns?: EmailCampaignRecord[];
        configured?: boolean;
        error?: string;
      } | null;
      if (cancelled || !response.ok || !payload) return;
      setCampaigns(payload.campaigns ?? []);
      setResendConfigured(Boolean(payload.configured));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recipients = useMemo(
    () =>
      resolveEmailCampaignAudience(audience, crm.contacts, crm.jobs, {
        city,
        zip,
        includePunch,
      }),
    [audience, city, crm.contacts, crm.jobs, includePunch, zip],
  );
  const preview = recipients[Math.min(previewIndex, Math.max(0, recipients.length - 1))] ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const staffCardUrl = campaignStaffCardUrl({
    companySlug: crm.company.slug,
    staff: crm.effectiveStaff,
    origin,
  });
  const merge = preview
    ? {
        recipient: preview,
        companyName: crm.company.name,
        staffName: crm.effectiveStaff?.name || crm.user.name,
        staffPhone: crm.effectiveStaff?.phone || crm.company.phone,
        staffCardUrl,
      }
    : null;
  const previewSubject = merge ? applyEmailCampaignMerge(subject, merge) : subject;
  const previewBody = merge ? applyEmailCampaignMerge(body, merge) : body;

  async function sendCampaign() {
    if (audience === "storm" && !city.trim() && !zip.trim()) {
      toast.error("Add a city or ZIP for the storm list");
      return;
    }
    if (!subject.trim()) {
      toast.error("Add a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Write a message");
      return;
    }
    if (recipients.length === 0) {
      toast.error("That list has nobody with an email");
      return;
    }
    setSending(true);
    const response = await fetch("/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        audienceKind: audience,
        city,
        zip,
        includePunch,
        subject,
        body,
        contactIds: recipients.slice(0, EMAIL_CAMPAIGN_SEND_CAP).map((row) => row.contactId),
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      mocked?: boolean;
      sent?: number;
      failed?: number;
      skipped?: number;
    } | null;
    setSending(false);
    if (!response.ok) {
      toast.error(payload?.error || "Could not send that campaign");
      return;
    }
    const sent = payload?.sent ?? recipients.length;
    const failed = payload?.failed ?? 0;
    toast.success(
      payload?.mocked
        ? `Queued ${sent} (Resend is not configured — mocked)`
        : `Sent ${sent}${failed ? ` · ${failed} failed` : ""}`,
    );
    const refresh = await fetch("/api/marketing/campaigns");
    const next = (await refresh.json().catch(() => null)) as { campaigns?: EmailCampaignRecord[] } | null;
    if (next?.campaigns) setCampaigns(next.campaigns);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-xl font-medium">Email a list</h2>
          <p className="text-sm text-muted-foreground">
            Pick people from the book, write the note, send from your name. Replies come back to you.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {EMAIL_CAMPAIGN_AUDIENCES.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setAudience(kind)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm",
                audience === kind
                  ? "bg-foreground text-background"
                  : "border text-muted-foreground hover:bg-muted",
              )}
            >
              {EMAIL_CAMPAIGN_AUDIENCE_LABELS[kind]}
            </button>
          ))}
        </div>

        {audience === "storm" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camp-city">City</Label>
              <Input
                id="camp-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Plano"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camp-zip">ZIP</Label>
              <Input
                id="camp-zip"
                value={zip}
                onChange={(event) => setZip(event.target.value)}
                placeholder="75074"
              />
            </div>
          </div>
        ) : null}

        {audience === "past_clients" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePunch}
              onChange={(event) => setIncludePunch(event.target.checked)}
            />
            Include punch-list jobs
          </label>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="camp-name">Campaign name</Label>
          <Input
            id="camp-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={`${EMAIL_CAMPAIGN_AUDIENCE_LABELS[audience]} — ${new Date().toLocaleDateString()}`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="camp-subject">Subject</Label>
          <Input id="camp-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="camp-body">Message</Label>
            <p className="text-[11px] text-muted-foreground">{MERGE_HINTS.join("  ")}</p>
          </div>
          <Textarea
            id="camp-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-44"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {recipients.length} {recipients.length === 1 ? "person" : "people"}
            {recipients.length > EMAIL_CAMPAIGN_SEND_CAP
              ? ` · first ${EMAIL_CAMPAIGN_SEND_CAP} this send`
              : ""}
            {resendConfigured === false ? " · Resend not configured (will mock)" : ""}
          </p>
          <Button type="button" onClick={() => void sendCampaign()} disabled={sending || !crm.hydrated}>
            {sending ? "Sending…" : `Send to ${Math.min(recipients.length, EMAIL_CAMPAIGN_SEND_CAP)}`}
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-lg font-medium">Preview</h3>
            {recipients.length > 1 ? (
              <select
                className="h-8 max-w-[14rem] rounded-md border bg-background px-2 text-sm"
                value={String(previewIndex)}
                onChange={(event) => setPreviewIndex(Number(event.target.value))}
              >
                {recipients.slice(0, 40).map((row, index) => (
                  <option key={`${row.contactId}-${row.email}`} value={index}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {preview ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                To {preview.name} · {preview.email}
                {preview.jobAddress ? ` · ${preview.jobAddress}` : ""}
              </p>
              <p className="font-medium">{previewSubject}</p>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{previewBody}</p>
            </div>
          ) : (
            <EmptyState
              title={audience === "storm" && !city.trim() && !zip.trim() ? "Add a city or ZIP" : "Nobody on this list"}
              description={
                audience === "realtors"
                  ? "Mark contacts as referral partners and add their email."
                  : "This list only includes people with an email on a matching job."
              }
            />
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-heading text-lg font-medium">List</h3>
          {recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipients yet.</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-auto text-sm">
              {recipients.slice(0, EMAIL_CAMPAIGN_SEND_CAP).map((row) => (
                <li key={`${row.contactId}-${row.email}`} className="flex justify-between gap-3">
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="truncate text-muted-foreground">{row.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-lg font-medium">Sent</h3>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing sent yet. The whole team will see the log here.</p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="rounded-lg border px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium tracking-tight">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {EMAIL_CAMPAIGN_AUDIENCE_LABELS[campaign.audienceKind] || campaign.audienceKind}
                        {campaign.audienceCity ? ` · ${campaign.audienceCity}` : ""}
                        {campaign.audienceZip ? ` ${campaign.audienceZip}` : ""}
                        {campaign.createdByName ? ` · ${campaign.createdByName}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {campaign.sentCount} sent
                      {campaign.failedCount ? ` · ${campaign.failedCount} failed` : ""}
                      {campaign.skippedCount ? ` · ${campaign.skippedCount} skipped` : ""}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{campaign.subject}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
