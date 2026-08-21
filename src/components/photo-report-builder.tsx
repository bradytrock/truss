"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ImageIcon,
  Plus,
  Trash2,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatDate } from "@/lib/format";
import { downloadPhotoReportPdf } from "@/lib/photo-report-pdf";
import { photoReportCoverModel } from "@/lib/photo-report-cover";
import {
  emptyCoverPage,
  emptyPhotosPage,
  emptyTextPage,
  layoutCapacity,
  pageLabel,
  photoById,
} from "@/lib/photo-report";
import {
  PHOTO_CATEGORY_LABELS,
  PHOTO_PAGE_LAYOUT_LABELS,
  PHOTO_PAGE_LAYOUTS,
  type CompanySettings,
  type Contact,
  type Job,
  type JobPhoto,
  type PhotoPageLayout,
  type PhotoReport,
  type PhotoReportPage,
  type StaffMember,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function PhotoReportBuilder({
  job,
  report,
  onClose,
}: {
  job: Job;
  report: PhotoReport;
  onClose: () => void;
}) {
  const crm = useCrm();
  const photos = crm.photos.filter((photo) => photo.jobId === job.id);
  const [draft, setDraft] = useState(report);
  const [selectedId, setSelectedId] = useState(report.pages[0]?.id ?? "");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = draft.pages.find((page) => page.id === selectedId) ?? draft.pages[0];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void crm.updatePhotoReport(draft.id, {
        title: draft.title,
        pages: draft.pages,
        updatedAt: draft.updatedAt,
        createdBy: draft.createdBy,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [crm.updatePhotoReport, draft]);

  function commit(pages: PhotoReportPage[], extra?: Partial<PhotoReport>) {
    const next: PhotoReport = {
      ...draft,
      ...extra,
      pages,
      updatedAt: new Date().toISOString(),
    };
    setDraft(next);
    if (!pages.some((page) => page.id === selectedId)) {
      setSelectedId(pages[0]?.id ?? "");
    }
  }

  function patchPage(pageId: string, patch: Partial<PhotoReportPage> | PhotoReportPage) {
    commit(
      draft.pages.map((page) =>
        page.id === pageId ? ({ ...page, ...patch } as PhotoReportPage) : page,
      ),
    );
  }

  function addPage(type: PhotoReportPage["type"]) {
    const page =
      type === "cover" ? emptyCoverPage({ title: job.name }) : type === "text" ? emptyTextPage() : emptyPhotosPage();
    commit([...draft.pages, page]);
    setSelectedId(page.id);
  }

  function movePage(pageId: string, direction: -1 | 1) {
    const index = draft.pages.findIndex((page) => page.id === pageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.pages.length) return;
    const pages = [...draft.pages];
    const [page] = pages.splice(index, 1);
    pages.splice(nextIndex, 0, page);
    commit(pages);
  }

  function removePage(pageId: string) {
    if (draft.pages.length === 1) {
      toast.error("Keep at least one page.");
      return;
    }
    commit(draft.pages.filter((page) => page.id !== pageId));
  }

  function addPhotos(page: Extract<PhotoReportPage, { type: "photos" }>, photoIds: string[]) {
    const existing = new Set(page.items.map((item) => item.photoId));
    const incoming = photoIds.filter((id) => !existing.has(id));
    if (incoming.length === 0) return;
    const cap = layoutCapacity(page.layout);
    const room = Math.max(0, cap - page.items.length);
    const fit = incoming.slice(0, room);
    const overflow = incoming.slice(room);
    let pages = draft.pages.map((item) =>
      item.id === page.id && item.type === "photos"
        ? {
            ...item,
            items: [
              ...item.items,
              ...fit.map((photoId) => ({
                photoId,
                caption: photoById(photos, photoId)?.caption ?? "",
              })),
            ],
          }
        : item,
    );
    if (overflow.length > 0) {
      const extras = chunkAsPages(
        overflow.map((photoId) => photoById(photos, photoId)).filter((photo): photo is JobPhoto => Boolean(photo)),
        page.layout,
      );
      const index = pages.findIndex((item) => item.id === page.id);
      pages = [...pages.slice(0, index + 1), ...extras, ...pages.slice(index + 1)];
    }
    commit(pages);
    setPickerOpen(false);
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      await downloadPhotoReportPdf({
        report: draft,
        job,
        photos,
        company: crm.company,
        contacts: crm.contacts,
        staff: crm.staff,
        customerName: crm.customerName(job),
      });
      toast.success("PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function removeReport() {
    await crm.deletePhotoReport(draft.id);
    toast.success("Photo report deleted.");
    onClose();
  }

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-50 flex flex-col bg-background md:left-52">
      <header className="flex shrink-0 flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Photo report
          </p>
          <Input
            value={draft.title}
            onChange={(event) => commit(draft.pages, { title: event.target.value })}
            className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none"
            aria-label="Report title"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => addPage("photos")}>
            <Plus data-icon="inline-start" />
            Photos
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addPage("text")}>
            <FileText data-icon="inline-start" />
            Text
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => addPage("cover")}>
            Cover
          </Button>
          <Button type="button" size="sm" disabled={pdfBusy} onClick={() => void downloadPdf()}>
            <Download data-icon="inline-start" />
            {pdfBusy ? "Building PDF…" : "Download PDF"}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close report">
            <XIcon />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        <aside className="min-h-0 overflow-y-auto border-b p-2 lg:border-r lg:border-b-0">
          <ul className="space-y-1">
            {draft.pages.map((page, index) => (
              <li key={page.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(page.id)}
                  className={cn(
                    "w-full rounded-md border px-2 py-2 text-left text-sm",
                    page.id === selected?.id ? "border-primary bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">
                    Page {index + 1}
                  </span>
                  <span className="mt-0.5 block truncate">{pageLabel(page, index)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-h-0 overflow-y-auto bg-muted/40 p-4 sm:p-6">
          {selected ? (
            <ReportPagePreview
              page={selected}
              job={job}
              photos={photos}
              report={draft}
              company={crm.company}
              contacts={crm.contacts}
              staff={crm.staff}
              customerName={crm.customerName(job)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Add a page to start this report.</p>
          )}
        </div>

        <aside className="min-h-0 overflow-y-auto border-t p-3 lg:border-t-0 lg:border-l">
          {selected ? (
            <PageInspector
              page={selected}
              photos={photos}
              pickerOpen={pickerOpen}
              onPickerOpenChange={setPickerOpen}
              onChange={(patch) => patchPage(selected.id, patch)}
              onMove={(direction) => movePage(selected.id, direction)}
              onRemove={() => removePage(selected.id)}
              onAddPhotos={(ids) => {
                if (selected.type === "photos") addPhotos(selected, ids);
              }}
              canMoveUp={draft.pages[0]?.id !== selected.id}
              canMoveDown={draft.pages.at(-1)?.id !== selected.id}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-6 text-destructive"
            onClick={() => void removeReport()}
          >
            <Trash2 data-icon="inline-start" />
            Delete report
          </Button>
        </aside>
      </div>
    </div>
  );
}

function chunkAsPages(photos: JobPhoto[], layout: PhotoPageLayout) {
  const cap = layoutCapacity(layout);
  const pages: PhotoReportPage[] = [];
  for (let index = 0; index < photos.length; index += cap) {
    const slice = photos.slice(index, index + cap);
    pages.push({
      ...emptyPhotosPage(layout),
      items: slice.map((photo) => ({ photoId: photo.id, caption: photo.caption })),
    });
  }
  return pages;
}

function PageInspector({
  page,
  photos,
  pickerOpen,
  onPickerOpenChange,
  onChange,
  onMove,
  onRemove,
  onAddPhotos,
  canMoveUp,
  canMoveDown,
}: {
  page: PhotoReportPage;
  photos: JobPhoto[];
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<PhotoReportPage> | PhotoReportPage) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAddPhotos: (photoIds: string[]) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const unused = photos.filter((photo) => {
    if (page.type !== "photos") return true;
    return !page.items.some((item) => item.photoId === photo.id);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon-xs" disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label="Move page up">
          <ChevronUp />
        </Button>
        <Button type="button" variant="outline" size="icon-xs" disabled={!canMoveDown} onClick={() => onMove(1)} aria-label="Move page down">
          <ChevronDown />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onRemove}>
          Remove page
        </Button>
      </div>

      {page.type === "cover" ? (
        <>
          <Field label="Title" htmlFor="cover-title">
            <Input id="cover-title" value={page.title} onChange={(event) => onChange({ title: event.target.value })} />
          </Field>
          <Field label="Prepared for" htmlFor="cover-sub">
            <Input id="cover-sub" value={page.subtitle} onChange={(event) => onChange({ subtitle: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={page.showAddress} onCheckedChange={(value) => onChange({ showAddress: Boolean(value) })} />
            Show job-site address
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={page.showDate} onCheckedChange={(value) => onChange({ showDate: Boolean(value) })} />
            Show report date
          </label>
          <Field label="Cover photo">
            <Select
              value={page.heroPhotoId ?? "none"}
              onValueChange={(value) => onChange({ heroPhotoId: !value || value === "none" ? null : String(value) })}
              items={[
                { value: "none", label: "None" },
                ...photos.map((photo) => ({ value: photo.id, label: photo.caption || "Untitled photo" })),
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a photo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {photos.map((photo) => (
                  <SelectItem key={photo.id} value={photo.id}>
                    {photo.caption || "Untitled photo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the hero on the PDF cover. It is cropped to fill the page, like a drone shot on a printed report.
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date of loss" htmlFor="cover-loss">
              <Input
                id="cover-loss"
                value={page.dateOfLoss}
                onChange={(event) => onChange({ dateOfLoss: event.target.value })}
                placeholder="06.14.2026"
              />
            </Field>
            <Field label="Claim number" htmlFor="cover-claim">
              <Input
                id="cover-claim"
                value={page.claimNumber}
                onChange={(event) => onChange({ claimNumber: event.target.value })}
                placeholder="Claim #"
              />
            </Field>
          </div>
          <Field label="Cover notes" htmlFor="cover-notes">
            <Textarea
              id="cover-notes"
              rows={4}
              value={page.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="What this report is for — insurance update, homeowner recap, punch list."
            />
          </Field>
        </>
      ) : null}

      {page.type === "text" ? (
        <>
          <Field label="Heading" htmlFor="text-heading">
            <Input id="text-heading" value={page.heading} onChange={(event) => onChange({ heading: event.target.value })} />
          </Field>
          <Field label="Body" htmlFor="text-body">
            <Textarea
              id="text-body"
              rows={10}
              value={page.body}
              onChange={(event) => onChange({ body: event.target.value })}
              placeholder="Scope notes, materials, next steps, or a daily log."
            />
          </Field>
        </>
      ) : null}

      {page.type === "photos" ? (
        <>
          <Field label="Page heading" htmlFor="photos-heading">
            <Input
              id="photos-heading"
              value={page.heading}
              onChange={(event) => onChange({ heading: event.target.value })}
              placeholder="Before, south slope, kitchen…"
            />
          </Field>
          <Field label="Layout">
            <Select
              value={page.layout}
              onValueChange={(value) => {
                if (value === "one" || value === "two" || value === "four") onChange({ layout: value });
              }}
              items={PHOTO_PAGE_LAYOUTS.map((layout) => ({
                value: layout,
                label: PHOTO_PAGE_LAYOUT_LABELS[layout],
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PHOTO_PAGE_LAYOUTS.map((layout) => (
                  <SelectItem key={layout} value={layout}>
                    {PHOTO_PAGE_LAYOUT_LABELS[layout]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={page.showCaptions} onCheckedChange={(value) => onChange({ showCaptions: Boolean(value) })} />
            Show captions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={page.showTakenAt} onCheckedChange={(value) => onChange({ showTakenAt: Boolean(value) })} />
            Show date taken
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={page.showCategory} onCheckedChange={(value) => onChange({ showCategory: Boolean(value) })} />
            Show before / after
          </label>
          <div className="space-y-2">
            {page.items.map((item, index) => (
              <div key={`${item.photoId}-${index}`} className="rounded-md border p-2">
                <p className="mb-1 truncate text-xs text-muted-foreground">
                  {photoById(photos, item.photoId)?.caption || "Photo"}
                </p>
                <Input
                  value={item.caption}
                  onChange={(event) =>
                    onChange({
                      items: page.items.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, caption: event.target.value } : entry,
                      ),
                    })
                  }
                  placeholder="Caption on this report"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="mt-1"
                  onClick={() => onChange({ items: page.items.filter((_, entryIndex) => entryIndex !== index) })}
                >
                  Remove from page
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onPickerOpenChange(!pickerOpen)}>
            <ImageIcon data-icon="inline-start" />
            Add photos
          </Button>
          {pickerOpen ? (
            <PhotoPicker photos={unused} remaining={Math.max(0, layoutCapacity(page.layout) - page.items.length)} onAdd={onAddPhotos} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PhotoPicker({
  photos,
  remaining,
  onAdd,
}: {
  photos: JobPhoto[];
  remaining: number;
  onAdd: (photoIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  if (photos.length === 0) {
    return <p className="text-xs text-muted-foreground">Every photo on this job is already on this page.</p>;
  }
  return (
    <div className="space-y-2 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">
        {remaining === 0
          ? "This page is full — extras open a new page."
          : `${remaining} open slot${remaining === 1 ? "" : "s"} on this page.`}
      </p>
      <ul className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
        {photos.map((photo) => {
          const on = selected.includes(photo.id);
          return (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() =>
                  setSelected((current) => (on ? current.filter((id) => id !== photo.id) : [...current, photo.id]))
                }
                className={cn("overflow-hidden border", on && "ring-2 ring-primary")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.imageUrl} alt={photo.caption || "Job photo"} className="aspect-square w-full object-cover" />
              </button>
            </li>
          );
        })}
      </ul>
      <Button type="button" size="sm" disabled={selected.length === 0} onClick={() => onAdd(selected)}>
        Add {selected.length || ""} to report
      </Button>
    </div>
  );
}

function ReportPagePreview({
  page,
  job,
  photos,
  report,
  company,
  contacts,
  staff,
  customerName,
}: {
  page: PhotoReportPage;
  job: Job;
  photos: JobPhoto[];
  report: PhotoReport;
  company: CompanySettings;
  contacts: Contact[];
  staff: StaffMember[];
  customerName: string;
}) {
  return (
    <article className="mx-auto aspect-[8.5/11] w-full max-w-[28rem] overflow-hidden border bg-white text-neutral-900 shadow-sm">
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
        <div className="flex h-full flex-col p-5">
          {page.type === "text" ? <TextPreview page={page} /> : <PhotosPreview page={page} photos={photos} />}
          <p className="mt-auto pt-3 text-[10px] tracking-wide text-neutral-400 uppercase">{company.name}</p>
        </div>
      )}
    </article>
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
        <div className="grid grid-cols-4 gap-2 border-b border-white/10 pb-2">
          {[
            ["Inspection date", cover.inspectionDate],
            ["Date of loss", cover.dateOfLoss],
            ["Claim number", cover.claimNumber],
            ["Job number", cover.jobNumber],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[6px] font-semibold tracking-[0.14em] text-[#c4182a] uppercase">{label}</p>
              <p className="mt-0.5 truncate text-[9px] font-semibold">{value || "—"}</p>
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

function TextPreview({ page }: { page: Extract<PhotoReportPage, { type: "text" }> }) {
  return (
    <div>
      <h2 className="font-heading text-xl">{page.heading.trim() || "Notes"}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
        {page.body.trim() || "Write the narrative for this page."}
      </p>
    </div>
  );
}

function PhotosPreview({
  page,
  photos,
}: {
  page: Extract<PhotoReportPage, { type: "photos" }>;
  photos: JobPhoto[];
}) {
  const items = page.items.slice(0, layoutCapacity(page.layout));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {page.heading.trim() ? <h2 className="mb-2 text-sm font-medium">{page.heading}</h2> : null}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-2",
          page.layout === "four" ? "grid-cols-2 grid-rows-2" : "grid-cols-1",
        )}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center bg-neutral-100 text-xs text-neutral-400">Add photos to this page</div>
        ) : (
          items.map((item) => {
            const photo = photoById(photos, item.photoId);
            return (
              <figure key={item.photoId} className="flex min-h-0 flex-col">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.imageUrl} alt="" className="min-h-0 flex-1 object-cover" />
                ) : (
                  <div className="flex flex-1 items-center justify-center bg-neutral-100 text-[10px] text-neutral-400">
                    Missing photo
                  </div>
                )}
                {page.showCaptions && item.caption.trim() ? (
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
          })
        )}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
