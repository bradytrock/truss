"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StatCard, SuiteCard, SuitePage } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { EMAIL_CAMPAIGN_AUDIENCE_LABELS, type EmailCampaignRecord } from "@/lib/marketing/email-campaigns";

export default function CampaignReportPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<EmailCampaignRecord | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void fetch("/api/marketing/campaigns")
      .then((response) => response.json())
      .then((payload: { campaigns?: EmailCampaignRecord[] }) => {
        const found = (payload.campaigns ?? []).find((item) => item.id === params.id) ?? null;
        setCampaign(found);
        setMissing(!found);
      })
      .catch(() => setMissing(true));
  }, [params.id]);

  if (missing) {
    return (
      <SuitePage>
        <p className="text-sm text-[#6f6a64]">That campaign isn&apos;t on this company.</p>
        <Button nativeButton={false} className="mt-3" render={<Link href="/marketing/campaigns" />}>Back to campaigns</Button>
      </SuitePage>
    );
  }
  if (!campaign) return <SuitePage>Loading report…</SuitePage>;

  const delivered = campaign.sentCount;
  const attempted = campaign.sentCount + campaign.failedCount;
  const rows = [
    ["Sent", attempted],
    ["Delivered", delivered],
    ["Failed", campaign.failedCount],
    ["Skipped", campaign.skippedCount],
  ] as const;

  return (
    <SuitePage>
      <p className="text-xs text-[#8a8680]">Campaigns / Report</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-[2rem] leading-none font-medium">{campaign.name}</h1>
          <p className="mt-2 text-sm text-[#6f6a64]">
            {campaign.createdByName} · {EMAIL_CAMPAIGN_AUDIENCE_LABELS[campaign.audienceKind]}
            {campaign.audienceCity ? ` · ${campaign.audienceCity}` : ""} {campaign.audienceZip}
          </p>
        </div>
        <Button nativeButton={false} variant="outline" render={<Link href="/marketing/campaigns/design" />}>Duplicate in the editor</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delivered" value={String(delivered)} hint={attempted ? `${Math.round((delivered / attempted) * 100)}% of attempted` : "No attempts"} />
        <StatCard label="Failed" value={String(campaign.failedCount)} hint="Provider rejected or bounced" />
        <StatCard label="Skipped" value={String(campaign.skippedCount)} hint="Unsubscribed or over the send cap" />
        <StatCard label="Opens" value="—" hint="Click tracking starts when a designed button is tied to a job" dark />
      </div>
      <SuiteCard className="p-4">
        <h2 className="font-medium">From inbox to delivered</h2>
        <ul className="mt-4 space-y-3">
          {rows.map(([label, value]) => (
            <li key={label}>
              <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{value}</span></div>
              <div className="h-3 rounded-full bg-[#f0eeeb]">
                <div className="h-3 rounded-full bg-[#1c1b1a]" style={{ width: `${attempted && value ? Math.max(4, Math.round((value / attempted) * 100)) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </SuiteCard>
      <SuiteCard className="p-4 text-sm text-[#6f6a64]">
        Subject: {campaign.subject}
      </SuiteCard>
    </SuitePage>
  );
}
