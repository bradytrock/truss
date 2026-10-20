"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";
import { SuiteCard, SuitePage } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cappedContactIds, loadGuardrails, quietHoursBlockNow, rememberSends } from "@/lib/marketing/suite-prefs";
import { cn } from "@/lib/utils";

const FIELDS = ["{{firstName}}", "{{jobCity}}", "{{repName}}", "{{repPhone}}", "{{inspectionLink}}"];

function QuickSend() {
  const crm = useCrm();
  const params = useSearchParams();
  const [audience, setAudience] = useState<EmailCampaignAudience>("storm");
  const [city, setCity] = useState(params.get("city") || "");
  const [zip, setZip] = useState(params.get("zip") || "");
  const [includePunch, setIncludePunch] = useState(false);
  const copy = defaultEmailCampaignCopy(audience);
  const [subject, setSubject] = useState(copy.subject);
  const [body, setBody] = useState(copy.body);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [campaigns, setCampaigns] = useState<EmailCampaignRecord[]>([]);
  const [device, setDevice] = useState<"mobile" | "desktop">("desktop");

  useEffect(() => {
    void fetch("/api/marketing/campaigns")
      .then((response) => response.json())
      .then((payload: { campaigns?: EmailCampaignRecord[] }) => setCampaigns(payload.campaigns ?? []))
      .catch(() => undefined);
  }, []);

  const recipients = useMemo(
    () => resolveEmailCampaignAudience(audience, crm.contacts, crm.jobs, { city, zip, includePunch }),
    [audience, city, crm.contacts, crm.jobs, includePunch, zip],
  );
  const preview = recipients[Math.min(previewIndex, Math.max(0, recipients.length - 1))] ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const merge = preview
    ? {
        recipient: preview,
        companyName: crm.company.name,
        staffName: crm.effectiveStaff?.name || crm.user.name,
        staffPhone: crm.effectiveStaff?.phone || crm.company.phone,
        staffCardUrl: campaignStaffCardUrl({ companySlug: crm.company.slug, staff: crm.effectiveStaff, origin }),
      }
    : null;
  const counts = Object.fromEntries(
    EMAIL_CAMPAIGN_AUDIENCES.map((kind) => [
      kind,
      resolveEmailCampaignAudience(kind, crm.contacts, crm.jobs, { city, zip, includePunch }).length,
    ]),
  ) as Record<EmailCampaignAudience, number>;

  async function send() {
    const guard = loadGuardrails(crm.user.companyId || "local");
    if (quietHoursBlockNow(guard.quietHours)) {
      toast.error("Quiet hours are on. Sends wait until 8 AM Central.");
      return;
    }
    if (audience === "storm" && !city.trim() && !zip.trim()) {
      toast.error("Add a city or ZIP for the storm list");
      return;
    }
    const capped = new Set(guard.frequencyCap ? cappedContactIds(crm.user.companyId || "local", recipients.map((row) => row.contactId)) : []);
    const contactIds = recipients
      .filter((row) => !capped.has(row.contactId))
      .slice(0, EMAIL_CAMPAIGN_SEND_CAP)
      .map((row) => row.contactId);
    if (contactIds.length === 0) {
      toast.error("Everyone on this list already got two marketing emails this week, or the list is empty.");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: subject,
          audienceKind: audience,
          city,
          zip,
          includePunch,
          subject,
          body,
          contactIds,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; sent?: number; campaigns?: EmailCampaignRecord[] } | null;
      if (!response.ok) {
        toast.error(payload?.error || "Could not send");
        return;
      }
      rememberSends(crm.user.companyId || "local", contactIds);
      toast.success(`Sent to ${payload?.sent ?? contactIds.length}`);
      const list = await fetch("/api/marketing/campaigns").then((item) => item.json());
      setCampaigns(list.campaigns ?? []);
    } finally {
      setSending(false);
    }
  }

  return (
    <SuitePage className="max-w-[1240px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[2rem] leading-none font-medium">Quick send</h1>
          <p className="mt-1 text-xs text-[#8a8680]">Draft · saved in this browser</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={sending} onClick={() => void sendTest(subject, body)}>
            Send test
          </Button>
          <Button type="button" size="sm" disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : `Send to ${Math.min(recipients.length, EMAIL_CAMPAIGN_SEND_CAP)}`}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SuiteCard className="space-y-3 p-4">
          <p className="text-[11px] tracking-[0.14em] text-[#8a8680] uppercase">1 · Audience</p>
          {EMAIL_CAMPAIGN_AUDIENCES.map((kind) => (
            <label key={kind} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2", audience === kind ? "border-[#1c1b1a]" : "border-[#eee]")}>
              <input
                type="radio"
                className="mt-1"
                checked={audience === kind}
                onChange={() => {
                  setAudience(kind);
                  const next = defaultEmailCampaignCopy(kind);
                  setSubject(next.subject);
                  setBody(next.body);
                }}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{EMAIL_CAMPAIGN_AUDIENCE_LABELS[kind]}</span>
                <span className="text-xs text-[#8a8680]">
                  {kind === "realtors" ? "Agents in your partner book" : kind === "clients" ? "Homeowners with an open job" : kind === "past_clients" ? "Completed jobs, any year" : "Contacts inside a hail or wind swath"}
                </span>
              </span>
              <span className="text-sm">{counts[kind]}</span>
            </label>
          ))}
          {audience === "storm" ? (
            <div className="space-y-2">
              <Input placeholder="City" value={city} onChange={(event) => setCity(event.target.value)} />
              <Input placeholder="ZIP codes" value={zip} onChange={(event) => setZip(event.target.value)} />
            </div>
          ) : null}
          {audience === "past_clients" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includePunch} onChange={(event) => setIncludePunch(event.target.checked)} />
              Include punch-list jobs
            </label>
          ) : null}
          <div className="rounded-xl bg-[#1c1b1a] p-4 text-white">
            <p className="font-heading text-4xl">{recipients.length}</p>
            <p className="text-sm text-white/70">recipients with a valid email</p>
          </div>
        </SuiteCard>

        <div className="space-y-4">
          <SuiteCard className="space-y-3 p-4">
            <p className="text-[11px] tracking-[0.14em] text-[#8a8680] uppercase">2 · Compose</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-[#6f6a64]">
                From
                <Input className="mt-1" readOnly value={`${crm.effectiveStaff?.name || crm.user.name} · ${crm.company.name}`} />
              </label>
              <label className="text-xs text-[#6f6a64]">
                Start from
                <Input className="mt-1" readOnly value={EMAIL_CAMPAIGN_AUDIENCE_LABELS[audience]} />
              </label>
            </div>
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            <div className="flex flex-wrap gap-1">
              {FIELDS.map((field) => (
                <button key={field} type="button" className="rounded-full border px-2 py-0.5 text-[11px] text-primary" onClick={() => setBody((current) => `${current} ${field}`)}>
                  {field}
                </button>
              ))}
            </div>
            <Textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} />
            <p className="text-[11px] text-[#8a8680]">Unsubscribe link and company address are added automatically.</p>
          </SuiteCard>

          <SuiteCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] tracking-[0.14em] text-[#8a8680] uppercase">3 · Preview</p>
              <div className="flex rounded-full bg-[#f4f3f1] p-0.5 text-xs">
                <button type="button" className={cn("rounded-full px-2 py-1", device === "mobile" && "bg-white")} onClick={() => setDevice("mobile")}>Mobile</button>
                <button type="button" className={cn("rounded-full px-2 py-1", device === "desktop" && "bg-white")} onClick={() => setDevice("desktop")}>Desktop</button>
              </div>
            </div>
            {recipients.length > 1 ? (
              <div className="mb-2 flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPreviewIndex((index) => Math.max(0, index - 1))}>Previous</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPreviewIndex((index) => Math.min(recipients.length - 1, index + 1))}>Next</Button>
              </div>
            ) : null}
            <div className={cn("mx-auto rounded-lg border bg-[#fafafa] p-4", device === "mobile" ? "max-w-sm" : "max-w-xl")}>
              <p className="text-xs text-[#8a8680]">{preview ? preview.name : "No one on this list yet"}</p>
              <p className="mt-2 font-medium">{merge ? applyEmailCampaignMerge(subject, merge) : subject}</p>
              <p className="mt-3 text-sm whitespace-pre-wrap text-[#3f3c38]">{merge ? applyEmailCampaignMerge(body, merge) : body}</p>
              <div className="mt-4 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-white">Book a free inspection</div>
            </div>
          </SuiteCard>
        </div>
      </div>

      <SuiteCard className="overflow-x-auto p-4">
        <h2 className="mb-3 font-medium">Sent and scheduled</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[#6f6a64]">Nothing sent from this company yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
              <tr>
                <th className="pb-2">Email</th>
                <th className="pb-2">Audience</th>
                <th className="pb-2">Sent</th>
                <th className="pb-2">Delivered</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 8).map((campaign) => (
                <tr key={campaign.id} className="border-t border-[#f0eeeb]">
                  <td className="py-2">{campaign.name}</td>
                  <td className="py-2 text-[#6f6a64]">{EMAIL_CAMPAIGN_AUDIENCE_LABELS[campaign.audienceKind]}</td>
                  <td className="py-2">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "—"}</td>
                  <td className="py-2">{campaign.sentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SuiteCard>
    </SuitePage>
  );
}

async function sendTest(subject: string, body: string) {
  const response = await fetch("/api/marketing/campaigns/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, body }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; to?: string } | null;
  if (!response.ok) toast.error(payload?.error || "Could not send the test");
  else toast.success(payload?.to ? `Test sent to ${payload.to}` : "Test sent");
}

export default function QuickSendPage() {
  return (
    <Suspense fallback={<SuitePage>Loading quick send…</SuitePage>}>
      <QuickSend />
    </Suspense>
  );
}
