"use client";

import Link from "next/link";
import { PhotoWell, SuiteCard, SuitePage, SuiteTitle } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";

const COLORS = [
  { name: "T Rock red", value: "#d71c27" },
  { name: "Ink", value: "#1c1b1a" },
  { name: "Partner green", value: "#1f6f5b" },
  { name: "Paper", value: "#f4f1ea" },
];

export default function MarketingAssetsPage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const photos = crm.photos.filter((photo) => !photo.deletedAt).slice(0, 8);

  return (
    <SuitePage>
      <SuiteTitle
        title="Assets"
        description="One place for the logo, colors, photos, and paperwork every template pulls from."
        action={<Button nativeButton={false} render={<Link href="/photos" />}>Upload</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <SuiteCard className="p-2 text-sm">
          <p className="rounded-md bg-[#1c1b1a] px-3 py-2 text-white">All assets <span className="float-right">{photos.length + marketing.assets.length}</span></p>
          <p className="px-3 py-2 text-[#6f6a64]">Logos <span className="float-right">{crm.company.logoUrl ? 1 : 0}</span></p>
          <p className="px-3 py-2 text-[#6f6a64]">Job photos <span className="float-right">{photos.length}</span></p>
          <p className="px-3 py-2 text-[#6f6a64]">Paperwork <span className="float-right">{marketing.assets.length}</span></p>
        </SuiteCard>
        <div className="space-y-4">
          <SuiteCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Brand kit</h2>
              <span className="text-xs text-[#8a8680]">Used by every template</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <PhotoWell src={crm.company.logoUrl} className="h-24" label="Primary logo" />
              <div className="grid h-24 place-items-center rounded-md bg-[#1c1b1a] text-xs text-white/70">Reversed logo</div>
              <PhotoWell className="h-24" label="Icon mark" />
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              {COLORS.map((color) => (
                <div key={color.value}>
                  <div className="h-10 w-16 rounded-md border border-black/10" style={{ background: color.value }} />
                  <p className="mt-1 text-xs font-medium">{color.name}</p>
                  <p className="font-mono text-[10px] text-[#8a8680]">{color.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-[#3f3c38]">Headline serif · Body sans · {crm.company.name}</p>
          </SuiteCard>
          <SuiteCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">Marketing-approved job photos</h2>
              <Link href="/photos" className="text-sm text-primary">Open Photos library</Link>
            </div>
            <p className="mb-3 text-sm text-[#6f6a64]">Star a photo in any job gallery to make it available to templates. Showing the latest on the company.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.length === 0 ? <p className="col-span-full text-sm text-[#6f6a64]">No job photos yet.</p> : null}
              {photos.map((photo) => (
                <div key={photo.id}>
                  <PhotoWell src={photo.imageUrl} className="h-24" label={photo.caption || "Job photo"} />
                  <p className="mt-1 truncate text-[11px] text-[#8a8680]">{photo.caption || "Job photo"}</p>
                </div>
              ))}
            </div>
          </SuiteCard>
          <SuiteCard className="divide-y divide-[#f0eeeb]">
            <p className="px-4 py-3 font-medium">Paperwork partners and homeowners ask for</p>
            {marketing.assets.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[#6f6a64]">
                Company files live in <Link href="/settings/documents" className="underline">Settings → Documents</Link>. Add a certificate of insurance or warranty packet there, then link it from a partner kit.
              </p>
            ) : (
              marketing.assets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{asset.name}</span>
                  {asset.url ? <a href={asset.url} className="text-primary">Copy link</a> : null}
                </div>
              ))
            )}
          </SuiteCard>
        </div>
      </div>
    </SuitePage>
  );
}
