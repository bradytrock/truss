"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";
import { useMarketing } from "@/lib/marketing/store";

export default function MarketingAssetsPage() {
  const crm = useCrm();
  const marketing = useMarketing();
  const [jobFilter, setJobFilter] = useState("all");

  const companyFiles = crm.companyFiles ?? [];
  const photos = useMemo(
    () =>
      (crm.photos ?? []).filter(
        (photo) => !photo.deletedAt && (jobFilter === "all" || photo.jobId === jobFilter),
      ),
    [crm.photos, jobFilter],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-xl font-medium">Approved assets</h2>
          <p className="text-sm text-muted-foreground">
            Brand-safe files and job photos ready for templates.
          </p>
        </div>
        {marketing.assets.length === 0 ? (
          <EmptyState
            title="No approved assets yet"
            description="Pull from the company file directory or approve job photos below."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {marketing.assets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.url} alt="" className="aspect-[4/3] w-full bg-muted object-cover" />
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {asset.source.replaceAll("_", " ")}
                    {asset.approved ? " · approved" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-xl font-medium">Company file directory</h2>
        {companyFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No company files yet. Add warranties and product sheets under Settings → File directory.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {companyFiles.slice(0, 20).map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.category}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    marketing.saveAsset({
                      id: marketing.newId("asset"),
                      name: file.name,
                      source: "company_file",
                      url: file.url,
                      notes: file.notes || file.category,
                      jobId: null,
                      companyFileId: file.id,
                      approved: true,
                      createdAt: new Date().toISOString(),
                    });
                    toast.success("Added to marketing assets");
                  }}
                >
                  Approve
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-medium">Job photos</h2>
            <p className="text-sm text-muted-foreground">
              Approve before/after shots for social and case studies.
            </p>
          </div>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={jobFilter}
            onChange={(event) => setJobFilter(event.target.value)}
          >
            <option value="all">All jobs</option>
            {crm.jobs
              .filter((job) => !job.deletedAt)
              .slice(0, 40)
              .map((job) => (
                <option key={job.id} value={job.id}>
                  {job.code} · {job.name}
                </option>
              ))}
          </select>
        </div>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos match this filter.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.slice(0, 24).map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="group relative overflow-hidden rounded-md border"
                onClick={() => {
                  marketing.saveAsset({
                    id: marketing.newId("asset"),
                    name: photo.caption || "Job photo",
                    source: "job_photo",
                    url: photo.imageUrl,
                    notes: photo.category,
                    jobId: photo.jobId,
                    companyFileId: null,
                    approved: true,
                    createdAt: new Date().toISOString(),
                  });
                  toast.success("Photo approved for marketing");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.imageUrl} alt="" className="aspect-square w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  Approve
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
