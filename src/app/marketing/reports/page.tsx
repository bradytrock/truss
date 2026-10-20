"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { EMAIL_CAMPAIGN_AUDIENCE_LABELS, type EmailCampaignRecord } from "@/lib/marketing/email-campaigns";

export default function MarketingReportsPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaignRecord[]>([]);

  useEffect(() => {
    void fetch("/api/marketing/campaigns")
      .then((response) => response.json())
      .then((payload: { campaigns?: EmailCampaignRecord[] }) => setCampaigns(payload.campaigns ?? []))
      .catch(() => undefined);
  }, []);

  return (
    <SuitePage>
      <SuiteTitle title="Reports" description="What went out, what was delivered, and what failed." />
      <SuiteCard className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Audience</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">Skipped</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-[#6f6a64]">Send a campaign to see a report. Opens and revenue show when a click is tied to a job.</td></tr>
            ) : null}
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t border-[#f0eeeb]">
                <td className="px-4 py-3 font-medium">{campaign.name}</td>
                <td className="px-4 py-3">{EMAIL_CAMPAIGN_AUDIENCE_LABELS[campaign.audienceKind]}</td>
                <td className="px-4 py-3">{campaign.sentCount}</td>
                <td className="px-4 py-3">{campaign.failedCount}</td>
                <td className="px-4 py-3">{campaign.skippedCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/campaigns/${campaign.id}`} />}>Open</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SuiteCard>
    </SuitePage>
  );
}
