"use client";

import { captionTagLine, layoutCapacity, pageCoverCopy, photoById, photoFileLabel, photoFrameColumns, photoFrameRows } from "@/lib/photo-report";
import { initials } from "@/lib/format";
import type { CompanySettings, JobPhoto, PhotoReport, PhotoReportPhotosPage } from "@/lib/types";
import { cn } from "@/lib/utils";

const HATCH =
  "bg-[repeating-linear-gradient(135deg,#e6e2da_0_7px,#f4f2ee_7px_14px)]";

export function PhotoReportPaper({
  page,
  pageNumber,
  pageCount,
  sectionNumber,
  sectionCount,
  jobName,
  photos,
  report,
  company,
  activeIndex,
  onSelectIndex,
}: {
  page: PhotoReportPhotosPage;
  pageNumber: number;
  pageCount: number;
  sectionNumber: number | null;
  sectionCount: number;
  jobName: string;
  photos: JobPhoto[];
  report: PhotoReport;
  company: CompanySettings;
  activeIndex: number | null;
  onSelectIndex?: (index: number) => void;
}) {
  const copy = pageCoverCopy(report.template);
  const kicker = copy.kicker || "PHOTO";
  const region = [company.city, company.state].filter(Boolean).join(" · ").toUpperCase();
  const logo = company.logoUrl?.trim();
  const cols = photoFrameColumns(page);
  const rows = photoFrameRows(page);
  const cap = layoutCapacity(page.layout);
  const cells = Array.from({ length: cap }, (_, index) => page.items[index] ?? null);
  const section =
    sectionNumber && sectionCount > 0 ? `Section ${sectionNumber} of ${sectionCount}` : "";

  return (
    <article className="flex min-h-[34rem] flex-col bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200 [border-top:2px_solid_var(--primary)]">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-7 w-auto max-w-16 object-contain object-left" />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center bg-primary text-[10px] font-semibold text-white">
              {initials(company.name) || "R"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight">{company.name || "Company"}</p>
            {region ? (
              <p className="truncate text-[8px] font-semibold tracking-[0.14em] text-neutral-700 uppercase">{region}</p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold tracking-[0.14em] uppercase">{kicker}</p>
          <p className="text-[9px] font-bold tracking-[0.12em] text-primary uppercase">Photo report</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-2">
        <p className="text-[9px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
          Page {pageNumber}
          {section ? ` · ${section}` : ""}
        </p>
        <h2 className="mt-1 font-heading text-lg leading-tight">{page.heading.trim() || "Untitled section"}</h2>
        {page.notes.trim() ? (
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-700">{page.notes.trim()}</p>
        ) : null}
        <div
          className="mt-3 grid min-h-0 flex-1 gap-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {cells.map((item, index) => {
            if (!item) {
              return <div key={`empty-${index}`} className={cn("min-h-16", HATCH)} />;
            }
            const photo = photoById(photos, item.photoId);
            const label = photo ? photoFileLabel(photo) : "Missing";
            const tags = captionTagLine(item.tags);
            const active = activeIndex === index;
            return (
              <button
                key={`${item.photoId}-${index}`}
                type="button"
                onClick={() => onSelectIndex?.(index)}
                className="flex min-h-0 flex-col text-left"
              >
                {page.frame === "before_after" ? (
                  <p className="mb-1 text-[8px] font-semibold tracking-[0.14em] text-primary uppercase">
                    {index === 0 ? "Before" : "After"}
                  </p>
                ) : null}
                <div className={cn("relative min-h-16 flex-1", HATCH, active && "ring-2 ring-primary ring-offset-1")}>
                  {photo?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.imageUrl} alt={item.caption || label} className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-neutral-500">
                      {label}
                    </span>
                  )}
                </div>
                {item.caption.trim() ? (
                  <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-neutral-800">{item.caption}</p>
                ) : (
                  <p className="mt-1 text-[10px] text-primary italic">Caption missing</p>
                )}
                {tags ? (
                  <p className="text-[8px] font-semibold tracking-[0.12em] text-neutral-500 uppercase">{tags}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-neutral-200 px-3 py-1.5 text-[9px] text-neutral-500">
        <p className="min-w-0 truncate">{jobName}</p>
        <p className="shrink-0">Page {pageNumber} of {pageCount}</p>
      </footer>
    </article>
  );
}
