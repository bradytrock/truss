"use client";

import Link from "next/link";
import { PhotoWell, StatCard, SuiteCard, SuitePage, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";
import { MARKETING_TEMPLATES } from "@/lib/marketing/templates";
import { MARKETING_TEMPLATE_KIND_LABELS } from "@/lib/marketing/types";

export default function MarketingHomePage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const featured = MARKETING_TEMPLATES.filter((template) => template.featured).slice(0, 4);
  const views = marketing.materials.reduce((sum, item) => sum + item.views, 0);
  const shares = marketing.materials.reduce((sum, item) => sum + item.shares, 0);
  const liveJobs = crm.jobs.filter((job) => !job.deletedAt);
  const city = busiestCity(liveJobs.map((job) => job.city).filter(Boolean));
  const finishedWeek = liveJobs.filter((job) => job.status === "complete").length;
  const partners = crm.contacts.filter((contact) => contact.isReferralPartner).length;

  return (
    <SuitePage>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SuiteCard className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-heading text-[1.7rem] leading-none font-medium">Email a list</h2>
            <p className="mt-2 max-w-md text-sm text-[#6f6a64]">
              Realtors, current jobs, past clients, or a city/ZIP after a storm. Compose, merge, send.
            </p>
          </div>
          <Button nativeButton={false} render={<Link href="/marketing/quick-send" />}>
            Open email
          </Button>
        </SuiteCard>
        <SuiteCard className="bg-[#1c1b1a] p-5 text-white">
          <p className="text-[10px] tracking-[0.16em] text-red-300 uppercase">Storm watch</p>
          <p className="font-heading mt-2 text-[1.35rem] leading-snug font-medium">
            {city ? `Jobs on the books in ${city}` : "No city cluster on the books yet"}
          </p>
          <p className="mt-2 text-sm text-white/70">
            {city
              ? `${liveJobs.filter((job) => job.city === city).length} jobs in ${city}. Build the list, then print the block.`
              : "When jobs share a city, this is where the storm list starts."}
          </p>
          <div className="mt-4 flex gap-2">
            <Button nativeButton={false} size="sm" render={<Link href={city ? `/marketing/quick-send?city=${encodeURIComponent(city)}` : "/marketing/quick-send"} />}>
              Build list from ZIP
            </Button>
            <Button nativeButton={false} size="sm" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" render={<Link href="/marketing/leave-behinds" />}>
              Plan canvass
            </Button>
          </div>
        </SuiteCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Templates" value={String(MARKETING_TEMPLATES.length)} hint="Print and flyer kits" />
        <StatCard label="My materials" value={String(marketing.materials.length)} hint="Generated for jobs and partners" />
        <StatCard label="Opens" value={views.toLocaleString()} hint="Emails and public share-link views" />
        <StatCard label="Shares" value={String(shares)} hint="Copied or sent links" />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-[1.6rem] font-medium">Print from a template</h2>
            <p className="text-sm text-[#6f6a64]">Pick a kit, merge a job or realtor, then export or share.</p>
          </div>
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/marketing/templates" />}>
            All templates
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {featured.map((template) => (
            <Link key={template.id} href={`/marketing/print?template=${template.id}`} className="rounded-xl border border-[#e7e4df] bg-white p-3 hover:border-[#d7d2cb]">
              <div className="mb-2 flex items-center justify-between">
                <ToneBadge tone={template.accent === "#0f766e" ? "green" : "red"}>{template.badge}</ToneBadge>
                <span className="text-[10px] tracking-wide text-[#8a8680] uppercase">{crm.company.name}</span>
              </div>
              <PhotoWell className="h-28" label="Photo from job gallery" />
              <p className="font-heading mt-3 text-[1.05rem] leading-snug font-medium">{template.headline}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#6f6a64]">{template.summary}</p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md bg-[#1c1b1a] px-2.5 py-1 text-[12px] text-white">Merge & print</span>
                <span className="rounded-md border px-2.5 py-1 text-[12px]">Share link</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <SuiteCard className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Recent activity</h2>
            <Link href="/marketing/reports" className="text-sm text-primary">View all</Link>
          </div>
          {marketing.materials.length === 0 ? (
            <p className="py-8 text-sm text-[#6f6a64]">Print a kit or send a list and it shows up here.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
                <tr>
                  <th className="pb-2 font-medium">What</th>
                  <th className="pb-2 font-medium">Who</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {marketing.materials.slice(0, 5).map((material) => (
                  <tr key={material.id} className="border-t border-[#f0eeeb]">
                    <td className="py-2.5">
                      <ToneBadge tone="stone">{MARKETING_TEMPLATE_KIND_LABELS[material.kind]}</ToneBadge>
                      <span className="ml-2">{material.name}</span>
                    </td>
                    <td className="py-2.5 text-[#6f6a64]">{material.createdByName}</td>
                    <td className="py-2.5">{material.views} views</td>
                    <td className="py-2.5 text-[#6f6a64]">{new Date(material.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SuiteCard>
        <SuiteCard className="divide-y divide-[#f0eeeb] p-2">
          <p className="px-3 py-2 text-sm font-medium">This week</p>
          <Link href="/marketing/reviews" className="block px-3 py-3 text-sm hover:bg-[#fafafa]">
            <span className="font-medium">{finishedWeek} finished jobs</span>
            <span className="mt-0.5 block text-[#6f6a64]">Ready for a review ask when the crew is done.</span>
          </Link>
          <Link href="/marketing/partners" className="block px-3 py-3 text-sm hover:bg-[#fafafa]">
            <span className="font-medium">{partners} referral partners</span>
            <span className="mt-0.5 block text-[#6f6a64]">Send a partner kit or a check-in.</span>
          </Link>
          <Link href="/marketing/leave-behinds" className="block px-3 py-3 text-sm hover:bg-[#fafafa]">
            <span className="font-medium">{marketing.materials.filter((item) => item.kind === "door_hanger").reduce((sum, item) => sum + item.views, 0)} door-hanger scans</span>
            <span className="mt-0.5 block text-[#6f6a64]">QR views on leave-behinds you have printed.</span>
          </Link>
        </SuiteCard>
      </div>
    </SuitePage>
  );
}

function busiestCity(cities: string[]) {
  const counts = new Map<string, number>();
  for (const city of cities) counts.set(city, (counts.get(city) || 0) + 1);
  let best = "";
  let n = 0;
  for (const [city, count] of counts) {
    if (count > n) {
      best = city;
      n = count;
    }
  }
  return n >= 2 ? best : cities[0] || "";
}
