"use client";

import Link from "next/link";
import { toast } from "sonner";
import { StatCard, SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";

const ASK =
  "Hi {{contactName}}, it's {{staffName}} with {{companyName}}. Thanks for trusting us with your roof. If you have 30 seconds, a Google review helps a family business like ours a ton: {{reviewUrl}}";

export default function MarketingReviewsPage() {
  const crm = useCrm();
  const reviewUrl =
    crm.googleLocations.find((location) => location.id === crm.effectiveStaff?.googleLocationId)?.reviewUrl ||
    crm.googleLocations.find((location) => location.isDefault)?.reviewUrl ||
    crm.googleLocations[0]?.reviewUrl ||
    "";
  const finished = crm.jobs.filter((job) => !job.deletedAt && job.status === "complete");
  const merge = buildMarketingMerge({
    company: crm.company,
    staff: crm.effectiveStaff,
    reviewUrl,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  const ask = applyMarketingMerge(ASK, merge);

  function copyAsk(jobId?: string) {
    const job = crm.jobs.find((item) => item.id === jobId);
    const contact = crm.contacts.find((item) => item.id === job?.primaryContactId);
    const text = applyMarketingMerge(
      ASK,
      buildMarketingMerge({
        company: crm.company,
        staff: crm.effectiveStaff,
        job,
        contact,
        reviewUrl,
        origin: window.location.origin,
      }),
    );
    void navigator.clipboard.writeText(text);
    toast.success("Ask copied");
  }

  return (
    <SuitePage>
      <SuiteTitle title="Reviews" description="Ask every finished job for a review while the crew is fresh in their mind." />
      <div className="grid gap-3 lg:grid-cols-[220px_repeat(3,minmax(0,1fr))]">
        <SuiteCard className="p-4">
          <p className="font-heading text-5xl font-medium">—</p>
          <p className="mt-2 text-xs text-[#6f6a64]">Google rating shows here when a listing is connected under Settings → Locations.</p>
        </SuiteCard>
        <StatCard label="Finished jobs" value={String(finished.length)} hint="Ready to ask" />
        <StatCard label="Review link" value={reviewUrl ? "On" : "Missing"} hint={reviewUrl ? "Google review URL is set" : "Add one in Settings → Locations"} />
        <StatCard label="This month" value={String(finished.length)} hint="Jobs you can ask today" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SuiteCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Ready to ask</h2>
            <Button type="button" size="sm" disabled={finished.length === 0} onClick={() => copyAsk(finished[0]?.id)}>
              Ask all {finished.length}
            </Button>
          </div>
          {finished.length === 0 ? (
            <p className="text-sm text-[#6f6a64]">No completed jobs yet. The ask is ready for the first one that closes.</p>
          ) : (
            <ul className="divide-y divide-[#f0eeeb]">
              {finished.slice(0, 12).map((job) => {
                const contact = crm.contacts.find((item) => item.id === job.primaryContactId);
                return (
                  <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{contact?.name || job.name}</p>
                      <p className="text-xs text-[#8a8680]">{job.street || job.location} · {job.code}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => copyAsk(job.id)}>Text</Button>
                    <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/quick-send?audience=past_clients`} />}>Email</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </SuiteCard>
        <SuiteCard className="p-4">
          <h2 className="font-medium">The ask</h2>
          <div className="mt-3 rounded-xl bg-[#f6f4f1] p-3 text-sm leading-relaxed">{ask}</div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" checked readOnly />
            Send two days after a job is marked complete — copy the ask, or turn on the Review ask flow.
          </label>
          <Button nativeButton={false} className="mt-3" variant="outline" render={<Link href="/marketing/automations" />}>
            Open the review flow
          </Button>
          {!reviewUrl ? <p className="mt-2 text-xs text-[#8a8680]">Add a Google review URL so the link in the ask is real.</p> : null}
        </SuiteCard>
      </div>
    </SuitePage>
  );
}
