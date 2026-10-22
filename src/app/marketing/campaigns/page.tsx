"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatCard, SuiteCard, SuitePage, SuiteTitle, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { EMAIL_CAMPAIGN_AUDIENCE_LABELS, type EmailCampaignRecord } from "@/lib/marketing/email-campaigns";
import { useEmailDocuments } from "@/lib/marketing/email-document";
import { useMarketingLists } from "@/lib/marketing/lists-store";
import { RESEND_FROM_DOMAIN } from "@/lib/resend-from";

export default function MarketingCampaignsPage() {
  const crm = useCrm();
  const [campaigns, setCampaigns] = useState<EmailCampaignRecord[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const lists = useMarketingLists(crm.user.companyId || "local");
  const drafts = useEmailDocuments(crm.user.companyId || "local").filter((doc) => doc.status !== "sent");
  const audienceText = (kind: EmailCampaignRecord["audienceKind"], zip: string, listId: string | null) => {
    if (kind === "list") {
      const name = lists.find((list) => list.id === listId)?.name;
      return name ? `List · ${name}` : "List";
    }
    return `${EMAIL_CAMPAIGN_AUDIENCE_LABELS[kind]}${zip ? ` · ${zip}` : ""}`;
  };
  const sent = campaigns.reduce((sum, campaign) => sum + campaign.sentCount, 0);

  useEffect(() => {
    void fetch("/api/marketing/campaigns")
      .then((response) => response.json())
      .then((payload: { campaigns?: EmailCampaignRecord[]; configured?: boolean }) => {
        setCampaigns(payload.campaigns ?? []);
        setConfigured(Boolean(payload.configured));
      })
      .catch(() => undefined);
  }, []);

  return (
    <SuitePage>
      <SuiteTitle
        title="Campaigns"
        description="Every email, who it went to, and the jobs it turned into."
        action={
          <div className="flex gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/marketing/quick-send" />}>Quick send</Button>
            <Button nativeButton={false} render={<Link href="/marketing/campaigns/design" />}>New campaign</Button>
          </div>
        }
      />
      <SuiteCard className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <span className="text-emerald-700">Sending from {RESEND_FROM_DOMAIN}</span>
        <span className="text-[#6f6a64]">{configured === false ? "Resend key is not on this server, so sends stay as a preview." : "Delivery uses the verified mailbox."}</span>
        <Link href="/marketing/settings" className="ml-auto text-primary">Sending settings</Link>
      </SuiteCard>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Emails sent" value={sent.toLocaleString()} hint="Recorded sends" />
        <StatCard label="Drafts" value={String(drafts.length)} hint="Designed in the editor" />
        <StatCard label="Failed" value={String(campaigns.reduce((sum, campaign) => sum + campaign.failedCount, 0))} hint="Addresses that bounced back from the provider" />
        <StatCard label="Campaigns" value={String(campaigns.length)} hint="Saved on the company" dark />
      </div>
      <SuiteCard className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Audience</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Delivered</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr key={draft.id} className="border-t border-[#f0eeeb]">
                <td className="px-4 py-3">
                  <p className="font-medium">{draft.name}</p>
                  <p className="text-xs text-[#8a8680]">{draft.subject}</p>
                </td>
                <td className="px-4 py-3"><ToneBadge tone="stone">{draft.status}</ToneBadge></td>
                <td className="px-4 py-3">{audienceText(draft.audienceKind, draft.zip, draft.listId)}</td>
                <td className="px-4 py-3 text-[#6f6a64]">{new Date(draft.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3 text-right">
                  <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/campaigns/design?doc=${draft.id}`} />}>Edit</Button>
                </td>
              </tr>
            ))}
            {campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t border-[#f0eeeb]">
                <td className="px-4 py-3">
                  <p className="font-medium">{campaign.name}</p>
                  <p className="text-xs text-[#8a8680]">{campaign.subject}</p>
                </td>
                <td className="px-4 py-3"><ToneBadge tone={campaign.status === "sent" ? "green" : "stone"}>{campaign.status}</ToneBadge></td>
                <td className="px-4 py-3">{audienceText(campaign.audienceKind, campaign.audienceZip, campaign.audienceListId)}</td>
                <td className="px-4 py-3 text-[#6f6a64]">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : "—"}</td>
                <td className="px-4 py-3">{campaign.sentCount}</td>
                <td className="px-4 py-3 text-right">
                  <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/campaigns/${campaign.id}`} />}>Report</Button>
                </td>
              </tr>
            ))}
            {drafts.length === 0 && campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-sm text-[#6f6a64]">No campaigns yet. Design one, or quick-send a list.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </SuiteCard>
    </SuitePage>
  );
}
