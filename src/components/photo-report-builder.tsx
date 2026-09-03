"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Download,
  FileText,
  GripVertical,
  Link2,
  Plus,
  Trash2,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoReportPagePreview } from "@/components/photo-report-preview";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { useCrm } from "@/lib/crm-store";
import { downloadPhotoReportPdf } from "@/lib/photo-report-pdf";
import {
  emptyCoverPage,
  emptyPhotosPage,
  emptyTextPage,
  layoutCapacity,
  LETTERHEAD_TEMPLATES,
  pageLabel,
  photoById,
} from "@/lib/photo-report";
import { shareUrl } from "@/lib/share";
import { resolveShareContacts } from "@/lib/parties";
import { shareEmailOwnerFromBook } from "@/lib/document-owner";
import { cardHeaderLogo } from "@/lib/card";
import { formatJobSite } from "@/lib/leads";
import {
  type Job,
  type JobPhoto,
  type LetterheadKind,
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
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const emailOwner = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    companyPhone: crm.company.phone,
    companySignature: crm.company.defaultEmailSignature,
  });
  const propertyAddress =
    formatJobSite({
      street: job.street,
      city: job.city,
      state: job.state,
      postalCode: job.postalCode,
    }) ||
    job.location.trim() ||
    "";
  const [draft, setDraft] = useState(report);
  const [selectedId, setSelectedId] = useState(report.pages[0]?.id ?? "");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const skipObserve = useRef(false);
  const pendingJump = useRef<string | null>(null);
  const [jumpNonce, setJumpNonce] = useState(0);
  const [pickerPageId, setPickerPageId] = useState<string | null>(null);

  const selected = draft.pages.find((page) => page.id === selectedId) ?? draft.pages[0];
  const hasCover = draft.pages.some((page) => page.type === "cover");
  const selectedIndex = selected ? draft.pages.findIndex((page) => page.id === selected.id) : -1;
  const pickerPage = draft.pages.find(
    (page): page is Extract<PhotoReportPage, { type: "photos" }> =>
      page.id === pickerPageId && page.type === "photos",
  );
  const pendingDelete = pendingDeleteId ? draft.pages.find((page) => page.id === pendingDeleteId) : undefined;
  const pendingDeleteIndex = pendingDelete ? draft.pages.findIndex((page) => page.id === pendingDelete.id) : -1;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (skipObserve.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const id = (visible?.target as HTMLElement | undefined)?.dataset.reportPage;
        if (id) setSelectedId(id);
      },
      { root, threshold: [0.25, 0.45, 0.7], rootMargin: "-12% 0px -45% 0px" },
    );
    const nodes = root.querySelectorAll("[data-report-page]");
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [draft.pages]);

  useEffect(() => {
    const id = pendingJump.current;
    if (!id) return;
    pendingJump.current = null;
    skipObserve.current = true;
    const node = scrollerRef.current?.querySelector(`[data-report-page="${id}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
    const timer = window.setTimeout(() => {
      skipObserve.current = false;
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft.pages, jumpNonce]);

  function jumpToPage(pageId: string) {
    skipObserve.current = true;
    pendingJump.current = pageId;
    setSelectedId(pageId);
    setJumpNonce((value) => value + 1);
  }

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

  function addPage(type: "photos" | "cover") {
    const page = type === "cover" ? emptyCoverPage({ title: job.name }) : emptyPhotosPage();
    commit([...draft.pages, page]);
    jumpToPage(page.id);
  }

  function addLetterhead(kind: LetterheadKind) {
    const page = emptyTextPage({ kind });
    commit([...draft.pages, page]);
    jumpToPage(page.id);
  }

  function removePage(pageId: string) {
    if (draft.pages.length === 1) {
      toast.error("Keep at least one page.");
      return;
    }
    commit(draft.pages.filter((page) => page.id !== pageId));
  }

  function requestRemove(pageId: string) {
    if (draft.pages.length === 1) {
      toast.error("Keep at least one page.");
      return;
    }
    setPendingDeleteId(pageId);
  }

  function confirmRemove() {
    if (!pendingDeleteId) return;
    removePage(pendingDeleteId);
    setPendingDeleteId(null);
  }

  function reorderPages(event: DragEndEvent) {
    const overId = event.over?.id;
    if (!overId || event.active.id === overId) return;
    const from = draft.pages.findIndex((page) => page.id === event.active.id);
    const to = draft.pages.findIndex((page) => page.id === overId);
    if (from < 0 || to < 0) return;
    commit(arrayMove(draft.pages, from, to));
  }

  function removePhotoFromPage(page: Extract<PhotoReportPage, { type: "photos" }>, index: number) {
    patchPage(page.id, { items: page.items.filter((_, entryIndex) => entryIndex !== index) });
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
    setPickerPageId(null);
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
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
              <FileText data-icon="inline-start" />
              Letterhead
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {LETTERHEAD_TEMPLATES.map((template) => (
                <DropdownMenuItem key={template.id} onClick={() => addLetterhead(template.id)}>
                  {template.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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

      <div
        className={cn(
          "grid min-h-0 flex-1",
          hasCover ? "lg:grid-cols-[16rem_minmax(0,1fr)_18rem]" : "lg:grid-cols-[16rem_minmax(0,1fr)]",
        )}
      >
        <aside className="min-h-0 overflow-y-auto border-b p-2 lg:border-r lg:border-b-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderPages}>
            <SortableContext items={draft.pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1">
                {draft.pages.map((page, index) => (
                  <SortablePageCard
                    key={page.id}
                    page={page}
                    index={index}
                    selected={page.id === selected?.id}
                    canDelete={draft.pages.length > 1}
                    onSelect={() => jumpToPage(page.id)}
                    onDelete={() => requestRemove(page.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3 w-full justify-start text-destructive"
            onClick={() => void removeReport()}
          >
            <Trash2 data-icon="inline-start" />
            Delete document
          </Button>
        </aside>

        <div ref={scrollerRef} className="min-h-0 overflow-y-auto bg-muted/40 p-4 sm:p-6">
          {draft.pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a page to start this document.</p>
          ) : (
            <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-8 pb-16">
              {draft.pages.length > 1 ? (
                <div className="pointer-events-none sticky top-0 z-10 -mx-1 flex justify-center pt-0.5">
                  <p className="rounded-full border bg-background/95 px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">
                    Page {Math.max(1, selectedIndex + 1)} of {draft.pages.length}
                    {selected ? ` · ${pageLabel(selected, selectedIndex)}` : ""}
                    {" — "}
                    scroll for the rest
                  </p>
                </div>
              ) : null}
              {draft.pages.map((page, index) => {
                const photosPage = page.type === "photos" ? page : null;
                return (
                  <section
                    key={page.id}
                    data-report-page={page.id}
                    className="scroll-mt-12"
                    onClick={() => setSelectedId(page.id)}
                  >
                    <p className="mb-2 text-center text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                      Page {index + 1} of {draft.pages.length}
                      <span className="font-medium tracking-normal text-foreground/70">
                        {" · "}
                        {pageLabel(page, index)}
                      </span>
                    </p>
                    <div
                      className={cn(
                        "rounded-sm",
                        page.id === selected?.id && "ring-2 ring-primary/50 ring-offset-2 ring-offset-muted/40",
                      )}
                    >
                      <PhotoReportPagePreview
                        page={page}
                        job={job}
                        photos={photos}
                        report={draft}
                        company={crm.company}
                        contacts={crm.contacts}
                        staff={crm.staff}
                        customerName={crm.customerName(job)}
                        edit={{
                          onChange: (patch) => patchPage(page.id, patch),
                          onAddPhotos: photosPage
                            ? () => {
                                jumpToPage(page.id);
                                setPickerPageId(page.id);
                                setPickerOpen(true);
                              }
                            : undefined,
                          onRemovePhoto: photosPage
                            ? (photoIndex) => removePhotoFromPage(photosPage, photoIndex)
                            : undefined,
                        }}
                      />
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {hasCover ? (
          <aside className="min-h-0 overflow-y-auto border-t p-3 lg:border-t-0 lg:border-l">
            {selected?.type === "cover" ? (
              <PageInspector
                page={selected}
                photos={photos}
                onChange={(patch) => patchPage(selected.id, patch)}
                onRemove={() => requestRemove(selected.id)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Cover fields stay here. Scroll to the cover, or click it in the list, to edit the title,
                who it is prepared for, and the hero photo.
              </p>
            )}
          </aside>
        ) : null}
      </div>
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Send this page"
        description="Email or text a client link, copy it, or download a PDF. Anyone with the link can view this document."
        url={draft.shareToken ? shareUrl("p", draft.shareToken) : ""}
        kind="page"
        documentName={draft.title}
        propertyAddress={propertyAddress}
        companyName={crm.company.name}
        companyLogoUrl={cardHeaderLogo(crm.company)}
        sender={emailOwner}
        recipients={resolveShareContacts(
          { jobId: job.id, primaryContactId: job.primaryContactId },
          crm,
        )}
        onDownloadPdf={downloadPdf}
        onTexted={(sent) =>
          crm.logOutboundText({
            ...sent,
            jobId: job.id,
            opportunityId: job.opportunityId,
            contactId: sent.contactId || job.primaryContactId,
          })
        }
        onEmailed={(sent) =>
          crm.logOutboundEmail({
            ...sent,
            jobId: job.id,
            opportunityId: job.opportunityId,
            contactId: sent.contactId || job.primaryContactId,
          })
        }
      />
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Remove this page?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Page ${pendingDeleteIndex + 1} · ${pageLabel(pendingDelete, pendingDeleteIndex)} will be taken out of this document.`
                : "This page will be taken out of this document."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={confirmRemove}>
              <Trash2 data-icon="inline-start" />
              Remove page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setPickerPageId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add photos</DialogTitle>
            <DialogDescription>Choose shots from this job. Extra photos open a new page.</DialogDescription>
          </DialogHeader>
          {pickerPage ? (
            <PhotoPicker
              photos={photos.filter((photo) => !pickerPage.items.some((item) => item.photoId === photo.id))}
              remaining={Math.max(0, layoutCapacity(pickerPage.layout) - pickerPage.items.length)}
              onAdd={(ids) => addPhotos(pickerPage, ids)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Open a photo page to add shots.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortablePageCard({
  page,
  index,
  selected,
  canDelete,
  onSelect,
  onDelete,
}: {
  page: PhotoReportPage;
  index: number;
  selected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10")}
    >
      <div
        className={cn(
          "flex items-start rounded-md border",
          selected ? "border-primary bg-primary/8" : "hover:bg-muted/60",
          isDragging && "bg-background shadow-sm",
        )}
      >
        <button
          type="button"
          className="mt-1.5 shrink-0 cursor-grab touch-none px-1 py-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag page ${index + 1} to reorder`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 py-2 pr-1 text-left text-sm">
          <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Page {index + 1}</span>
          <span className="mt-0.5 block truncate">{pageLabel(page, index)}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mt-1 mr-0.5 text-muted-foreground hover:text-destructive"
          disabled={!canDelete}
          aria-label={`Remove page ${index + 1}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
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
  onChange,
  onRemove,
}: {
  page: Extract<PhotoReportPage, { type: "cover" }>;
  photos: JobPhoto[];
  onChange: (patch: Partial<PhotoReportPage> | PhotoReportPage) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove page
        </Button>
      </div>
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
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={page.showDateOfLoss}
          onCheckedChange={(value) => onChange({ showDateOfLoss: Boolean(value) })}
        />
        Show date of loss
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={page.showClaimNumber}
          onCheckedChange={(value) => onChange({ showClaimNumber: Boolean(value) })}
        />
        Show claim number
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
      {page.showDateOfLoss || page.showClaimNumber ? (
        <div className={page.showDateOfLoss && page.showClaimNumber ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
          {page.showDateOfLoss ? (
            <Field label="Date of loss" htmlFor="cover-loss">
              <Input
                id="cover-loss"
                value={page.dateOfLoss}
                onChange={(event) => onChange({ dateOfLoss: event.target.value })}
                placeholder="06.14.2026"
              />
            </Field>
          ) : null}
          {page.showClaimNumber ? (
            <Field label="Claim number" htmlFor="cover-claim">
              <Input
                id="cover-claim"
                value={page.claimNumber}
                onChange={(event) => onChange({ claimNumber: event.target.value })}
                placeholder="Claim #"
              />
            </Field>
          ) : null}
        </div>
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
