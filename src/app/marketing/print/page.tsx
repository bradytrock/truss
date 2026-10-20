"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PhotoWell, SuiteCard, SuitePage, SuiteTitle, ToneBadge } from "@/components/marketing/suite-ui";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { applyMarketingMerge, buildMarketingMerge } from "@/lib/marketing/merge";
import { useMarketing } from "@/lib/marketing/store";
import { marketingTemplateById, MARKETING_TEMPLATES } from "@/lib/marketing/templates";
import { formatPhone } from "@/lib/format";

const FORMATS = [
  { id: "flyer", label: "Flyer", detail: "8.5 × 11 in" },
  { id: "hanger", label: "Door hanger", detail: "4.25 × 11 in" },
  { id: "postcard", label: "Postcard", detail: "6 × 9 in, landscape" },
  { id: "social", label: "Social post", detail: "1080 × 1350 px" },
] as const;

function PrintStudio() {
  const crm = useCrm();
  const router = useRouter();
  const marketing = useMarketing();
  const params = useSearchParams();
  const jobs = crm.jobs.filter((job) => !job.deletedAt);
  const [templateId, setTemplateId] = useState(params.get("template") || MARKETING_TEMPLATES[0]?.id || "");
  const [jobId, setJobId] = useState(params.get("job") || jobs[0]?.id || "");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("flyer");
  const [quantity, setQuantity] = useState(150);
  const [showRep, setShowRep] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const template = marketingTemplateById(templateId) ?? MARKETING_TEMPLATES[0];
  const job = jobs.find((item) => item.id === jobId) ?? null;
  const contact = crm.contacts.find((item) => item.id === job?.primaryContactId) ?? null;
  const photos = crm.photos.filter((photo) => photo.jobId === job?.id && !photo.deletedAt);
  const [photoId, setPhotoId] = useState(photos[0]?.id || "");
  const photo = photos.find((item) => item.id === photoId) ?? photos[0];
  const merge = buildMarketingMerge({
    company: crm.company,
    staff: crm.effectiveStaff,
    job,
    contact,
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  const headline = template ? applyMarketingMerge(template.headline, merge) : "";
  const body = template ? applyMarketingMerge(template.body, merge) : "";

  function download() {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
    if (!popup) {
      toast.error("Allow pop-ups to download the PDF");
      return;
    }
    const esc = (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    popup.document.write(`<!doctype html><html><head><title>${esc(headline)}</title>
      <style>
        @page { size: letter; margin: 0.6in; }
        body { font-family: Georgia, serif; color: #1c1b1a; }
        .badge { display:inline-block; background:#d71c27; color:white; font-family: Helvetica, sans-serif; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 4px 8px; }
        h1 { font-size: 36px; line-height: 1.15; }
        p { font-family: Helvetica, sans-serif; font-size: 14px; line-height: 1.5; }
        .photo { background:#e7e2da; height: 240px; display:grid; place-items:center; color:#8a847a; }
        img { width:100%; height:240px; object-fit:cover; }
      </style></head><body>
      <div class="badge">${esc(template?.badge ?? "")}</div>
      <p style="float:right;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">${esc(crm.company.name)}</p>
      ${photo?.imageUrl && /^https?:/i.test(photo.imageUrl) ? `<img src="${esc(photo.imageUrl)}" alt="" />` : `<div class="photo">Photo from job gallery</div>`}
      <h1>${esc(headline)}</h1>
      <p>${esc(body)}</p>
      ${showRep ? `<p><strong>${esc(crm.effectiveStaff?.name || crm.user.name)}</strong> · ${esc(formatPhone(crm.effectiveStaff?.phone || crm.company.phone))}</p>` : ""}
      ${showQr ? `<p>QR · book an inspection</p>` : ""}
      <p>${quantity} copies · ${FORMATS.find((item) => item.id === format)?.detail}</p>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    popup.document.close();
  }

  function saveMaterial() {
    if (!template) return;
    const material = marketing.createFromTemplate({
      template,
      headline,
      subhead: applyMarketingMerge(template.subhead, merge),
      body,
      cta: applyMarketingMerge(template.cta, merge),
      jobId: job?.id ?? null,
      contactId: contact?.id ?? null,
      photoUrls: photo?.imageUrl ? [photo.imageUrl] : [],
    });
    toast.success("Saved to My materials");
    router.push(`/marketing/materials/${material.id}`);
  }

  return (
    <SuitePage>
      <SuiteTitle
        title="Print studio"
        description="Merge a job into a kit, then download a print-ready page or save a share link."
      />
      <div className="mb-2 flex items-center gap-3 text-sm text-[#6f6a64]">
        <span className="text-emerald-700">1 Template</span>
        <span>2 Merge</span>
        <span>3 Export</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <SuiteCard className="space-y-3 p-4">
            <label className="block text-xs text-[#6f6a64]">
              Template
              <select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={template?.id} onChange={(event) => setTemplateId(event.target.value)}>
                {MARKETING_TEMPLATES.filter((item) => item.kind !== "email_drip" && item.kind !== "sms_drip").map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[#6f6a64]">
              Job
              <select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={job?.id || ""} onChange={(event) => setJobId(event.target.value)}>
                <option value="">No job</option>
                {jobs.map((item) => (
                  <option key={item.id} value={item.id}>{item.code} · {item.street || item.name}</option>
                ))}
              </select>
            </label>
            {job ? (
              <div className="rounded-lg bg-[#f6f4f1] p-3 text-sm">
                <p className="font-medium">{[job.street, job.city, job.state, job.postalCode].filter(Boolean).join(", ") || job.location}</p>
                <p className="text-[#6f6a64]">{job.name}</p>
                <p className="text-[#6f6a64]">Rep: {job.projectManager || crm.effectiveStaff?.name || "Unassigned"}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 6).map((item) => (
                <button key={item.id} type="button" onClick={() => setPhotoId(item.id)} className={item.id === photo?.id ? "ring-2 ring-primary" : ""}>
                  <PhotoWell src={item.imageUrl} className="h-14" label={item.caption || "Photo"} />
                </button>
              ))}
              {photos.length === 0 ? <PhotoWell className="col-span-3 h-16" label="No photos on this job yet" /> : null}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showRep} onChange={(event) => setShowRep(event.target.checked)} /> Rep name and cell</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showQr} onChange={(event) => setShowQr(event.target.checked)} /> QR code to book an inspection</label>
          </SuiteCard>
        </div>
        <SuiteCard className="bg-[#ece7df] p-6">
          <p className="mb-3 text-center text-xs text-[#6f6a64]">{FORMATS.find((item) => item.id === format)?.label} preview</p>
          <article className="mx-auto max-w-md bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <ToneBadge>{template?.badge}</ToneBadge>
              <span className="text-[10px] tracking-wide text-[#8a8680] uppercase">{crm.company.name}</span>
            </div>
            <PhotoWell src={photo?.imageUrl} className="mt-3 h-40" label={photo?.caption || "Photo · front elevation, after"} />
            <h2 className="font-heading mt-4 text-[1.8rem] leading-tight font-medium">{headline}</h2>
            <p className="mt-2 text-sm text-[#3f3c38]">{body}</p>
            {showRep ? (
              <p className="mt-4 text-sm">{crm.effectiveStaff?.name || crm.user.name} · {formatPhone(crm.effectiveStaff?.phone || crm.company.phone)}</p>
            ) : null}
            {showQr ? <p className="mt-2 text-xs text-[#8a8680]">QR · scan to book</p> : null}
          </article>
        </SuiteCard>
      </div>
      <SuiteCard className="space-y-3 p-4">
        <div className="grid gap-2">
          {FORMATS.map((item) => (
            <label key={item.id} className="flex items-center gap-3 rounded-lg border border-[#eee] px-3 py-2">
              <input type="radio" checked={format === item.id} onChange={() => setFormat(item.id)} />
              <span className="font-medium">{item.label}</span>
              <span className="text-sm text-[#8a8680]">{item.detail}</span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Quantity
          <input className="mt-1 h-9 w-32 rounded-md border px-2" type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} />
        </label>
        <Button type="button" className="w-full" onClick={download}>Download print-ready PDF</Button>
        <Button type="button" variant="outline" className="w-full" onClick={saveMaterial}>Copy share link</Button>
        <p className="text-center text-xs text-[#8a8680]">
          Saved pieces live in <Link href="/marketing/materials" className="underline">My materials</Link> and the job&apos;s files tab.
        </p>
      </SuiteCard>
    </SuitePage>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<SuitePage>Opening print studio…</SuitePage>}>
      <PrintStudio />
    </Suspense>
  );
}
