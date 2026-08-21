"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  ImageIcon,
  Link2,
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
import { PhotoReportPagePreview } from "@/components/photo-report-preview";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { useCrm } from "@/lib/crm-store";
import { downloadPhotoReportPdf } from "@/lib/photo-report-pdf";
import {
  emptyCoverPage,
  emptyPhotosPage,
  emptyTextPage,
  layoutCapacity,
  pageLabel,
  photoById,
} from "@/lib/photo-report";
import { shareUrl } from "@/lib/share";
import {
  PHOTO_PAGE_LAYOUT_LABELS,
  PHOTO_PAGE_LAYOUTS,
  type Job,
  type JobPhoto,
  type PhotoPageLayout,
  type PhotoReport,
  type PhotoReportPage,
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
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

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

  async function sharePage() {
    setShareBusy(true);
    try {
      const token = await crm.ensurePageShareToken(draft.id);
      setDraft((prev) => ({ ...prev, shareToken: token }));
      setShareOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a share link.");
    } finally {
      setShareBusy(false);
    }
  }

  async function removeReport() {
    await crm.deletePhotoReport(draft.id);
    toast.success("Page deleted.");
    onClose();
  }

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-50 flex flex-col bg-background md:left-52">
      <header className="flex shrink-0 flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Page
          </p>
          <Input
            value={draft.title}
            onChange={(event) => commit(draft.pages, { title: event.target.value })}
            className="mt-1 h-8 border-0 bg-transparent px-0 text-base font-medium shadow-none"
            aria-label="Page title"
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
          <Button type="button" variant="outline" size="sm" disabled={shareBusy} onClick={() => void sharePage()}>
            <Link2 data-icon="inline-start" />
            {shareBusy ? "Preparing…" : "Share"}
          </Button>
          <Button type="button" size="sm" disabled={pdfBusy} onClick={() => void downloadPdf()}>
            <Download data-icon="inline-start" />
            {pdfBusy ? "Building PDF…" : "Download PDF"}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close page">
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
            <PhotoReportPagePreview
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
            <p className="text-sm text-muted-foreground">Add a page to start this document.</p>
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
            Delete page
          </Button>
        </aside>
      </div>
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Send this page"
        description="Copy a client link or download a PDF. Anyone with the link can view this document."
        url={draft.shareToken ? shareUrl("p", draft.shareToken) : ""}
        onDownloadPdf={downloadPdf}
      />
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
        Add {selected.length || ""} to page
      </Button>
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
