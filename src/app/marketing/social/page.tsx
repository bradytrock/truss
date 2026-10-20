"use client";

import Link from "next/link";
import { SuiteCard, StatCard, SuitePage, SuiteTitle, ToneBadge, PhotoWell } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";

export default function MarketingSocialPage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const accounts = [
    { name: "Instagram", on: Boolean(crm.company.socialInstagram) },
    { name: "Facebook", on: Boolean(crm.company.socialFacebook) },
    { name: "Google Business Profile", on: crm.googleLocations.length > 0 },
    { name: "LinkedIn", on: Boolean(crm.company.socialLinkedin) },
  ];
  const drafts = marketing.socialPosts.filter((post) => post.status !== "posted");

  return (
    <SuitePage>
      <SuiteTitle
        title="Social"
        description="Posts built from real job photos, on brand every time, scheduled across your accounts."
        action={
          <div className="flex gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/settings" />}>Connect account</Button>
            <Button nativeButton={false} render={<Link href="/marketing/social/compose" />}>Create post</Button>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((account) => (
          <SuiteCard key={account.name} className="p-3">
            <p className="font-medium">{account.name}</p>
            <p className={`text-xs ${account.on ? "text-emerald-700" : "text-[#8a8680]"}`}>{account.on ? "Connected" : "Not connected"}</p>
          </SuiteCard>
        ))}
      </div>
      <div className="flex items-end justify-between">
        <h2 className="font-heading text-2xl font-medium">Drafted by Cassio</h2>
        <span className="text-xs text-[#8a8680]">{drafts.length} waiting</span>
      </div>
      <p className="text-sm text-[#6f6a64]">Nothing publishes until someone approves it.</p>
      {drafts.length === 0 ? (
        <SuiteCard className="p-6 text-sm text-[#6f6a64]">
          No drafts yet. Start from a finished job and Cassio&apos;s checks run on the graphic before you schedule it.
          <div className="mt-3">
            <Button nativeButton={false} render={<Link href="/marketing/social/compose" />}>Draft a post</Button>
          </div>
        </SuiteCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {drafts.map((post) => (
            <SuiteCard key={post.id} className="p-3">
              <ToneBadge tone={post.channel === "instagram" ? "ink" : "red"}>{post.channel}</ToneBadge>
              <PhotoWell className="mt-2 h-36" />
              <p className="mt-2 font-medium">{post.title}</p>
              <p className="line-clamp-3 text-sm text-[#6f6a64]">{post.body}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => marketing.saveSocialPost({ ...post, status: "scheduled" })}
                >
                  Approve
                </Button>
                <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/social/compose?post=${post.id}`} />}>Edit</Button>
              </div>
            </SuiteCard>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Posts" value={String(marketing.socialPosts.length)} hint="Drafts and scheduled" />
        <StatCard label="Scheduled" value={String(marketing.socialPosts.filter((post) => post.status === "scheduled").length)} hint="Approved, not published from here" />
        <StatCard label="Channels ready" value={String(accounts.filter((account) => account.on).length)} hint="Profiles with a link on the company" />
      </div>
    </SuitePage>
  );
}
