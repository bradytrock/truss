"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PhotoWell, StatCard, SuiteCard, SuitePage, SuiteTitle, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";
import { useMarketing } from "@/lib/marketing/store";
import { marketingTemplateById } from "@/lib/marketing/templates";
import type { Contact } from "@/lib/types";

function isPartner(contact: Contact) {
  return contact.isReferralPartner || /realtor|agent|property manager|insurance|broker/i.test(contact.title);
}

export default function MarketingPartnersPage() {
  const crm = useCrm();
  const router = useRouter();
  const marketing = useMarketing();
  const partners = crm.contacts.filter(isPartner);
  const [selectedId, setSelectedId] = useState(partners[0]?.id || "");
  const [filter, setFilter] = useState("all");
  const [kit, setKit] = useState({ onePager: true, checklist: true, inspection: true, claim: false, cards: false });
  const selected = partners.find((partner) => partner.id === selectedId) ?? partners[0];
  const filtered = partners.filter((partner) => {
    if (filter === "realtors") return /realtor|agent/i.test(partner.title) || partner.isReferralPartner;
    if (filter === "insurance") return /insurance/i.test(partner.title);
    if (filter === "property") return /property/i.test(partner.title);
    return true;
  });
  const referred = selected
    ? crm.jobs.filter((job) => !job.deletedAt && job.relatedContactIds.includes(selected.id))
    : [];

  function generate() {
    const template = marketingTemplateById("tpl-realtor-cobrand");
    if (!template || !selected) return;
    const merge = buildMarketingMerge({
      company: crm.company,
      staff: crm.effectiveStaff,
      partner: selected,
      origin: window.location.origin,
    });
    const material = marketing.createFromTemplate({
      template,
      headline: applyMarketingMerge(template.headline, merge),
      subhead: applyMarketingMerge(template.subhead, merge),
      body: applyMarketingMerge(template.body, merge),
      cta: applyMarketingMerge(template.cta, merge),
      partnerContactId: selected.id,
    });
    toast.success(`Kit saved for ${selected.name}`);
    router.push(`/marketing/materials/${material.id}`);
  }

  return (
    <SuitePage className="max-w-[1240px]">
      <SuiteTitle
        title="Partners"
        description="Realtors, insurance agents, and property managers who send you work."
        action={<Button type="button" nativeButton={false} render={<Link href="/contacts" />}>Add partner</Button>}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active partners" value={String(partners.length)} hint="Referral partners and agent titles" />
        <StatCard label="Kits sent" value={String(marketing.materials.filter((item) => item.partnerContactId).length)} hint="Co-brand pieces saved" />
        <StatCard label="Referred jobs" value={String(crm.jobs.filter((job) => !job.deletedAt && job.relatedContactIds.some((id) => partners.some((partner) => partner.id === id))).length)} hint="Jobs that list a partner" />
        <StatCard label="Need a touch" value={String(partners.filter((partner) => !partner.email).length)} hint="No email on the contact" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <SuiteCard>
          <div className="flex flex-wrap gap-2 border-b border-[#f0eeeb] px-3 py-3">
            {[
              ["all", "All"],
              ["realtors", "Realtors"],
              ["insurance", "Insurance agents"],
              ["property", "Property managers"],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFilter(id)} className={`rounded-full px-3 py-1 text-sm ${filter === id ? "bg-[#1c1b1a] text-white" : "bg-[#f4f3f1]"}`}>
                {label}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-[#6f6a64]">No partners in this view. Mark a contact as a referral partner, or put Realtor on their title.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] tracking-[0.12em] text-[#8a8680] uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Referrals</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((partner) => (
                  <tr key={partner.id} onClick={() => setSelectedId(partner.id)} className={`cursor-pointer border-t border-[#f0eeeb] ${partner.id === selected?.id ? "bg-[#f3faf6]" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{partner.name}</p>
                      <p className="text-xs text-[#8a8680]">{partner.email || "No email"}</p>
                    </td>
                    <td className="px-4 py-3 text-[#6f6a64]">{partner.title || (partner.isReferralPartner ? "Referral partner" : "Partner")}</td>
                    <td className="px-4 py-3">{crm.jobs.filter((job) => job.relatedContactIds.includes(partner.id)).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SuiteCard>
        <SuiteCard className="p-4">
          {selected ? (
            <>
              <ToneBadge tone="green">Partner</ToneBadge>
              <PhotoWell className="mt-3 h-28" label="Headshot + job photo" />
              <h2 className="font-heading mt-3 text-xl font-medium">{selected.name} × {crm.company.name}</h2>
              <p className="text-sm text-[#6f6a64]">Preferred roofing partner{selected.title ? ` · ${selected.title}` : ""}.</p>
              <div className="mt-4 space-y-2 text-sm">
                <p className="text-[11px] tracking-[0.12em] text-[#8a8680] uppercase">What&apos;s in the kit</p>
                {(
                  [
                    ["onePager", "Co-branded one-pager"],
                    ["checklist", "Buyer's roof checklist"],
                    ["inspection", "Pre-listing inspection offer"],
                    ["claim", "Insurance claim guide"],
                    ["cards", "Referral cards"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" checked={kit[key]} onChange={(event) => setKit((current) => ({ ...current, [key]: event.target.checked }))} />
                    {label}
                  </label>
                ))}
              </div>
              <Button type="button" className="mt-4 w-full bg-[#1f6f5b] text-white hover:bg-[#1a5c4c]" onClick={generate}>
                Generate kit for {selected.name.split(" ")[0]}
              </Button>
              <div className="mt-4 space-y-1 text-sm">
                <p className="text-[11px] tracking-[0.12em] text-[#8a8680] uppercase">Referred jobs</p>
                {referred.length === 0 ? <p className="text-[#6f6a64]">None on the books yet.</p> : referred.slice(0, 4).map((job) => (
                  <p key={job.id} className="flex justify-between gap-2"><span>{job.street || job.name}</span><span className="text-[#8a8680]">{job.status}</span></p>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#6f6a64]">Select a partner to build a kit.</p>
          )}
        </SuiteCard>
      </div>
    </SuitePage>
  );
}
