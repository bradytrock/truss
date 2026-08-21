"use client";

import { Plus, XIcon } from "lucide-react";
import { CompanyLetterhead } from "@/components/company-letterhead";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/format";
import { photoReportCoverModel } from "@/lib/photo-report-cover";
import { layoutCapacity, photoById, photoPageColumns } from "@/lib/photo-report";
import {
  PHOTO_CATEGORY_LABELS,
  PHOTO_PAGE_LAYOUT_LABELS,
  PHOTO_PAGE_LAYOUTS,
  type CompanySettings,
  type Contact,
  type Job,
  type JobPhoto,
  type PhotoReport,
  type PhotoReportPage,
  type StaffMember,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type PageCanvasEdit = {
  onChange: (patch: Partial<PhotoReportPage> | PhotoReportPage) => void;
  onAddPhotos?: () => void;
  onRemovePhoto?: (index: number) => void;
};

export function PhotoReportPagePreview({
  page,
  job,
  photos,
  report,
  company,
  contacts,
  staff,
  customerName,
  edit,
}: {
  page: PhotoReportPage;
  job: Job;
  photos: JobPhoto[];
  report: PhotoReport;
  company: CompanySettings;
  contacts: Contact[];
  staff: StaffMember[];
  customerName: string;
  edit?: PageCanvasEdit;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-2">
      {edit && page.type === "photos" ? <PhotoPageToolbar page={page} onChange={edit.onChange} /> : null}
      <article className="aspect-[8.5/11] w-full overflow-hidden border bg-white text-neutral-900 shadow-sm">
        {page.type === "cover" ? (
          <CoverPreview
            page={page}
            job={job}
            photos={photos}
            report={report}
            company={company}
            contacts={contacts}
            staff={staff}
            customerName={customerName}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col p-5">
            {page.type === "text" ? (
              <TextPreview page={page} company={company} edit={edit} />
            ) : (
              <PhotosPreview page={page} photos={photos} edit={edit} />
            )}
            {page.type === "photos" ? (
              <p className="mt-auto pt-2 text-[10px] tracking-wide text-neutral-400 uppercase">{company.name}</p>
            ) : null}
          </div>
        )}
      </article>
    </div>
  );
}

function PhotoPageToolbar({
  page,
  onChange,
}: {
  page: Extract<PhotoReportPage, { type: "photos" }>;
  onChange: PageCanvasEdit["onChange"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border bg-background px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1">
        {PHOTO_PAGE_LAYOUTS.map((layout) => (
          <Button
            key={layout}
            type="button"
            size="xs"
            variant={page.layout === layout ? "default" : "ghost"}
            onClick={() => onChange({ layout })}
          >
            {PHOTO_PAGE_LAYOUT_LABELS[layout]}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">
        <Checkbox checked={page.showCaptions} onCheckedChange={(value) => onChange({ showCaptions: Boolean(value) })} />
        Caption
      </label>
      <label className="flex items-center gap-1.5">
        <Checkbox checked={page.showTakenAt} onCheckedChange={(value) => onChange({ showTakenAt: Boolean(value) })} />
        Date
      </label>
      <label className="flex items-center gap-1.5">
        <Checkbox checked={page.showCategory} onCheckedChange={(value) => onChange({ showCategory: Boolean(value) })} />
        Before / after
      </label>
    </div>
  );
}

function CoverPreview({
  page,
  job,
  photos,
  report,
  company,
  contacts,
  staff,
  customerName,
}: {
  page: Extract<PhotoReportPage, { type: "cover" }>;
  job: Job;
  photos: JobPhoto[];
  report: PhotoReport;
  company: CompanySettings;
  contacts: Contact[];
  staff: StaffMember[];
  customerName: string;
}) {
  const cover = photoReportCoverModel({
    page,
    report,
    job,
    photos,
    company,
    contacts,
    staff,
    customerName,
  });
  const logoUrl = company.logoUrl?.trim();
  const meta = [
    cover.showInspectionDate ? { label: "Inspection date", value: cover.inspectionDate } : null,
    cover.showDateOfLoss ? { label: "Date of loss", value: cover.dateOfLoss } : null,
    cover.showClaimNumber ? { label: "Claim number", value: cover.claimNumber } : null,
    { label: "Job number", value: cover.jobNumber },
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-neutral-900">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-[#c4182a] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-auto max-w-[4.5rem] object-contain object-left" />
          ) : (
            <span className="flex size-8 items-center justify-center bg-neutral-950 text-[10px] font-semibold tracking-wide text-white">
              {company.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("") || "TR"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-tight">{cover.companyName}</p>
            {cover.companyTag ? (
              <p className="truncate text-[8px] tracking-[0.12em] text-neutral-500 uppercase">{cover.companyTag}</p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold tracking-wide uppercase">{cover.kicker}</p>
          <p className="text-[9px] font-bold tracking-wide text-[#c4182a] uppercase">{cover.reportTitle}</p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-neutral-950">
        {cover.hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.hero.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <p className="flex size-full items-center justify-center text-[10px] text-neutral-400">
            Assign a cover photo
          </p>
        )}
        {cover.street ? (
          <div className="absolute bottom-3 left-3 max-w-[70%] bg-black/80 px-2.5 py-1.5 text-white">
            <p className="text-[7px] font-semibold tracking-[0.16em] text-[#c4182a] uppercase">Property inspected</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase leading-tight">{cover.street}</p>
            {cover.cityLine ? <p className="text-[8px] uppercase text-white/80">{cover.cityLine}</p> : null}
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 bg-neutral-950 px-3 pb-2 pt-2.5 text-white">
        <div
          className="grid gap-2 border-b border-white/10 pb-2"
          style={{ gridTemplateColumns: `repeat(${meta.length}, minmax(0, 1fr))` }}
        >
          {meta.map((item) => (
            <div key={item.label}>
              <p className="text-[6px] font-semibold tracking-[0.14em] text-[#c4182a] uppercase">{item.label}</p>
              <p className="mt-0.5 truncate text-[9px] font-semibold">{item.value || "—"}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[6px] font-semibold tracking-[0.14em] text-[#c4182a] uppercase">Prepared for</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight">{cover.preparedForName}</p>
            {cover.preparedForDetail.map((line) => (
              <p key={line} className="truncate text-[8px] text-white/70">
                {line}
              </p>
            ))}
          </div>
          <div>
            <p className="text-[6px] font-semibold tracking-[0.14em] text-[#c4182a] uppercase">Prepared by</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight">{cover.preparedByName}</p>
            {cover.preparedByTitle ? <p className="truncate text-[8px] text-white/70">{cover.preparedByTitle}</p> : null}
            {cover.preparedByContact ? (
              <p className="truncate text-[8px] text-white/70">{cover.preparedByContact}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2 border-t border-white/10 pt-1.5">
          <p className="truncate text-[7px] font-semibold tracking-wide uppercase">{cover.footerLeft}</p>
          {cover.footerRight ? (
            <p className="truncate text-[7px] tracking-wide text-white/50 uppercase">{cover.footerRight}</p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function TextPreview({
  page,
  company,
  edit,
}: {
  page: Extract<PhotoReportPage, { type: "text" }>;
  company: CompanySettings;
  edit?: PageCanvasEdit;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CompanyLetterhead company={company} className="shrink-0 border-b pb-3" />
      {edit ? (
        <>
          <input
            value={page.heading}
            onChange={(event) => edit.onChange({ heading: event.target.value })}
            placeholder="Heading — Introduction, Next steps…"
            className="mt-3 w-full border-0 bg-transparent font-heading text-xl outline-none placeholder:text-neutral-300"
          />
          <textarea
            value={page.body}
            onChange={(event) => edit.onChange({ body: event.target.value })}
            placeholder="Write this page on the letter. Introduction, findings, next steps, or a blank note."
            className="mt-2 min-h-0 flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-300"
          />
        </>
      ) : (
        <>
          <h2 className="mt-3 font-heading text-xl">{page.heading.trim() || "Notes"}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
            {page.body.trim() || "Write the narrative for this page."}
          </p>
        </>
      )}
    </div>
  );
}

function PhotosPreview({
  page,
  photos,
  edit,
}: {
  page: Extract<PhotoReportPage, { type: "photos" }>;
  photos: JobPhoto[];
  edit?: PageCanvasEdit;
}) {
  const cap = layoutCapacity(page.layout);
  const cols = photoPageColumns(page.layout);
  const filled = page.items.slice(0, cap);
  const slots = edit ? cap : Math.max(filled.length, 1);
  const cells = Array.from({ length: slots }, (_, index) => filled[index] ?? null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {edit ? (
        <input
          value={page.heading}
          onChange={(event) => edit.onChange({ heading: event.target.value })}
          placeholder="Page heading — South slope, kitchen, before…"
          className="mb-2 w-full border-0 bg-transparent text-sm font-medium outline-none placeholder:text-neutral-300"
        />
      ) : page.heading.trim() ? (
        <h2 className="mb-2 text-sm font-medium">{page.heading}</h2>
      ) : null}
      <div
        className={cn("grid min-h-0 gap-2", cols === 2 ? "grid-cols-2" : "grid-cols-1")}
        style={{ gridTemplateRows: `repeat(${Math.max(1, Math.ceil(slots / cols))}, minmax(0, 1fr))` }}
      >
        {cells.map((item, index) => {
          if (!item) {
            return (
              <button
                key={`empty-${index}`}
                type="button"
                onClick={() => edit?.onAddPhotos?.()}
                className="flex min-h-16 flex-col items-center justify-center gap-1 border border-dashed bg-neutral-50 text-[10px] text-neutral-400 hover:border-primary hover:text-primary"
              >
                <Plus className="size-4" />
                Add photo
              </button>
            );
          }
          const photo = photoById(photos, item.photoId);
          return (
            <figure key={`${item.photoId}-${index}`} className="relative flex min-h-0 flex-col">
              {edit?.onRemovePhoto ? (
                <button
                  type="button"
                  className="absolute top-1 right-1 z-10 rounded-sm bg-white/90 p-0.5 text-neutral-500 shadow-sm hover:text-destructive"
                  aria-label="Remove photo"
                  onClick={() => edit.onRemovePhoto?.(index)}
                >
                  <XIcon className="size-3" />
                </button>
              ) : null}
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.imageUrl} alt="" className="min-h-0 flex-1 object-cover" />
              ) : (
                <div className="flex flex-1 items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                  Missing photo
                </div>
              )}
              {edit && page.showCaptions ? (
                <input
                  value={item.caption}
                  onChange={(event) => {
                    const caption = event.target.value;
                    edit.onChange({
                      items: page.items.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, caption } : entry,
                      ),
                    });
                  }}
                  placeholder="Text under this photo"
                  className="mt-1 w-full border-0 bg-transparent text-[10px] leading-snug text-neutral-700 outline-none placeholder:text-neutral-300"
                />
              ) : page.showCaptions && item.caption.trim() ? (
                <figcaption className="mt-1 text-[10px] leading-snug text-neutral-700">{item.caption}</figcaption>
              ) : null}
              {(page.showTakenAt || page.showCategory) && photo ? (
                <p className="text-[10px] text-neutral-500">
                  {[page.showCategory ? PHOTO_CATEGORY_LABELS[photo.category] : "", page.showTakenAt ? formatDate(photo.takenAt) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              ) : null}
            </figure>
          );
        })}
      </div>
      {edit ? (
        <textarea
          value={page.notes ?? ""}
          onChange={(event) => edit.onChange({ notes: event.target.value })}
          placeholder="Describe this page — what we found, what to do next…"
          className="mt-2 min-h-16 flex-1 resize-none border-0 bg-transparent text-xs leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-300"
        />
      ) : page.notes.trim() ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-700">{page.notes}</p>
      ) : null}
    </div>
  );
}
