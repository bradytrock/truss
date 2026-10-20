"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PhotoWell, SuitePage, SuiteTitle, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { MARKETING_TEMPLATES } from "@/lib/marketing/templates";
import type { MarketingTemplate, MarketingTemplateKind } from "@/lib/marketing/types";

const FILTERS: Array<{ id: string; label: string; kinds?: MarketingTemplateKind[] }> = [
  { id: "all", label: "All" },
  { id: "storm", label: "Storm & insurance", kinds: ["flyer", "case_study"] },
  { id: "job", label: "Job site", kinds: ["yard_sign", "leave_behind"] },
  { id: "neighbors", label: "Neighbors", kinds: ["door_hanger", "postcard"] },
  { id: "partner", label: "Partner kits", kinds: ["realtor_cobrand"] },
  { id: "referral", label: "Referral", kinds: ["referral_ask", "review_ask"] },
];

export default function MarketingTemplatesPage() {
  const crm = useCrm();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const templates = useMemo(() => {
    const kinds = FILTERS.find((item) => item.id === filter)?.kinds;
    return MARKETING_TEMPLATES.filter((template) => template.kind !== "email_drip" && template.kind !== "sms_drip")
      .filter((template) => !kinds || kinds.includes(template.kind))
      .filter((template) => `${template.name} ${template.headline}`.toLowerCase().includes(query.trim().toLowerCase()));
  }, [filter, query]);

  return (
    <SuitePage>
      <SuiteTitle
        title="Templates"
        description="Every kit works as a flyer, door hanger, postcard, or email. Merge fields fill from the job or partner."
        action={
          <Button nativeButton={false} render={<Link href="/marketing/campaigns/design" />}>New template</Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full border px-3 py-1 text-sm ${filter === item.id ? "border-[#1c1b1a] bg-[#1c1b1a] text-white" : "border-[#e7e4df] bg-white"}`}
          >
            {item.label}
            {item.id === "all" ? ` ${MARKETING_TEMPLATES.filter((template) => template.kind !== "email_drip" && template.kind !== "sms_drip").length}` : ""}
          </button>
        ))}
        <Input className="ml-auto w-56" placeholder="Search templates" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} company={crm.company.name} />
        ))}
      </div>
    </SuitePage>
  );
}

function TemplateCard({ template, company }: { template: MarketingTemplate; company: string }) {
  return (
    <article className="flex flex-col rounded-xl border border-[#e7e4df] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <ToneBadge tone={template.channel === "partner" ? "green" : "red"}>{template.badge}</ToneBadge>
        <span className="text-[10px] text-[#8a8680]">{template.printReady ? "Print" : "Screen"}</span>
      </div>
      <PhotoWell className="h-28" />
      <p className="font-heading mt-3 flex-1 text-[1.05rem] leading-snug font-medium">{template.headline}</p>
      <p className="mt-1 text-[11px] tracking-wide text-[#8a8680] uppercase">{company}</p>
      <div className="mt-3 flex gap-2">
        <Button nativeButton={false} size="sm" render={<Link href={`/marketing/print?template=${template.id}`} />}>Use template</Button>
        <Button nativeButton={false} size="sm" variant="outline" render={<Link href={`/marketing/print?template=${template.id}`} />}>Preview</Button>
      </div>
    </article>
  );
}
