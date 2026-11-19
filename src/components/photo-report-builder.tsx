"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  FileText,
  GripVertical,
  Link2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
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
import { PhotoReportPaper } from "@/components/photo-report-paper";
import { WorkOrderEditor } from "@/components/work-order-editor";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { useCrm } from "@/lib/crm-store";
import { escapeDismissesOverlay } from "@/lib/draft-escape";
import { downloadPhotoReportPdf } from "@/lib/photo-report-pdf";
import { formatDate, formatTime } from "@/lib/format";
import {
  CAPTION_LIMIT,
  LETTERHEAD_TEMPLATES,
  draftCaptionFromTags,
  emptyCoverPage,
  emptyPhotosPage,
  emptyTextPage,
  layoutCapacity,
  missingCaptionCount,
  pageFrame,
  pageLabel,
  parseCaptionTags,
  photoById,
  photoFileLabel,
  photoSection,
} from "@/lib/photo-report";
import { shareUrl } from "@/lib/share";
import { resolveShareContacts } from "@/lib/parties";
import { shareEmailOwnerFromBook } from "@/lib/document-owner";
import { cardHeaderLogo } from "@/lib/card";
import { formatJobSite } from "@/lib/leads";
import { canManageJobPhotos } from "@/lib/visibility";
import {
  PHOTO_CAPTION_TAGS,
  PHOTO_CAPTION_TAG_LABELS,
  type Job,
  type JobPhoto,
  type LetterheadKind,
  type PhotoCaptionTag,
  type PhotoPageFrame,
  type PhotoPageLayout,
  type PhotoReport,
  type PhotoReportPage,
  type PhotoReportPhotosPage,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { fillWorkOrderFromJob } from "@/lib/work-order";

type ViewMode = "edit" | "split" | "preview";
type TrayTab = "pages" | "photos";
type TrayFilter = "unused" | "all";

const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

export function PhotoReportBuilder({
  job,
  report,
  onClose,
  readOnly = false,
}: {
  job: Job;
  report: PhotoReport;
  onClose: () => void;
  /** View and share only — no create, edit, or delete. */
  readOnly?: boolean;
}) {
  const crm = useCrm();
  const photos = crm.photos.filter((photo) => photo.jobId === job.id && !photo.deletedAt);
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const emailOwner = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    senderStaff: crm.effectiveStaff ?? crm.viewer,
    companyPhone: crm.company.phone,
    companyEmail: crm.company.email,
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
  const [draft, setDraft] = useState(() => withJobBoundWorkOrder(report, job, opportunity));
  const [selectedId, setSelectedId] = useState(
    () => report.pages.find((page) => page.type === "photos")?.id ?? report.pages[0]?.id ?? "",
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<ViewMode>("split");
  const [tray, setTray] = useState<TrayTab>("photos");
  const [trayFilter, setTrayFilter] = useState<TrayFilter>("unused");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [dragPhotoId, setDragPhotoId] = useState<string | null>(null);
  const historyRef = useRef<PhotoReport[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingScroll = useRef<string | null>(null);
  const originalKey = useRef(
    JSON.stringify({ title: report.title, pages: report.pages, createdBy: report.createdBy }),
  );
  const saveGen = useRef(0);

  const selected = draft.pages.find((page) => page.id === selectedId) ?? draft.pages[0];
  const selectedIndex = selected ? draft.pages.findIndex((page) => page.id === selected.id) : -1;
  const section = selected ? photoSection(draft.pages, selected.id) : { index: -1, total: 0 };
  const pendingDelete = pendingDeleteId ? draft.pages.find((page) => page.id === pendingDeleteId) : undefined;
  const pendingDeleteIndex = pendingDelete ? draft.pages.findIndex((page) => page.id === pendingDelete.id) : -1;
  const missingCaptions = missingCaptionCount(draft.pages);
  const canUpload = !readOnly && canManageJobPhotos(crm.effectiveStaff?.role ?? crm.viewer?.role);

  const usedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const page of draft.pages) {
      if (page.type !== "photos") continue;
      for (const item of page.items) ids.add(item.photoId);
    }
    return ids;
  }, [draft.pages]);
  const orderedPhotos = useMemo(
    () => [...photos].sort((a, b) => (b.takenAt || "").localeCompare(a.takenAt || "")),
    [photos],
  );
  const unusedPhotos = orderedPhotos.filter((photo) => !usedIds.has(photo.id));
  const trayPhotos = trayFilter === "unused" ? unusedPhotos : orderedPhotos;
  const dragging = dragPhotoId ? photos.find((photo) => photo.id === dragPhotoId) : undefined;

  const updatePhotoReport = crm.updatePhotoReport;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!escapeDismissesOverlay(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (readOnly) return;
    const snapshot = JSON.stringify({
      title: draft.title,
      pages: draft.pages,
      createdBy: draft.createdBy,
    });
    if (snapshot === originalKey.current) {
      setSaveState((current) => (current === "saved" ? current : "saved"));
      return;
    }
    setSaveState("saving");
    const gen = ++saveGen.current;
    const timer = window.setTimeout(() => {
      void updatePhotoReport(draft.id, {
        title: draft.title,
        pages: draft.pages,
        updatedAt: draft.updatedAt,
        createdBy: draft.createdBy,
      }).then((ok) => {
          if (saveGen.current !== gen) return;
          if (ok) originalKey.current = snapshot;
          setSaveState(ok ? "saved" : "error");
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draft, readOnly, updatePhotoReport]);

  useEffect(() => {
    const id = pendingScroll.current;
    if (!id || mode === "preview") return;
    pendingScroll.current = null;
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, mode, selectedId]);

  function selectPage(pageId: string) {
    setSelectedId(pageId);
    setActiveIndex(0);
  }

  function stepPage(delta: number) {
    if (!selected) return;
    const next = draft.pages[selectedIndex + delta];
    if (next) selectPage(next.id);
  }

  function pushHistory(current: PhotoReport) {
    historyRef.current = [...historyRef.current.slice(-39), structuredClone(current)];
    setCanUndo(true);
  }

  function undoChange() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setCanUndo(historyRef.current.length > 0);
    setDraft(previous);
    if (!previous.pages.some((page) => page.id === selectedId)) {
      setSelectedId(previous.pages[0]?.id ?? "");
      setActiveIndex(0);
    }
  }

  function commit(pages: PhotoReportPage[], extra?: Partial<PhotoReport>) {
    if (readOnly) return;
    const next: PhotoReport = {
      ...draft,
      ...extra,
      pages,
      updatedAt: new Date().toISOString(),
    };
    if (JSON.stringify({ ...draft, updatedAt: "" }) === JSON.stringify({ ...next, updatedAt: "" })) {
      return;
    }
    pushHistory(draft);
    setDraft(next);
    if (!pages.some((page) => page.id === selectedId)) {
      setSelectedId(pages[0]?.id ?? "");
      setActiveIndex(0);
    }
  }

  function patchPage(pageId: string, patch: Partial<PhotoReportPage> | PhotoReportPage) {
    commit(
      draft.pages.map((page) => (page.id === pageId ? ({ ...page, ...patch } as PhotoReportPage) : page)),
    );
  }

  function addPage(type: "photos" | "cover") {
    const previous = [...draft.pages].reverse().find((page) => page.type === "photos");
    const layout = previous?.layout ?? "four";
    const page =
      type === "cover"
        ? emptyCoverPage({ title: job.name })
        : {
            ...emptyPhotosPage(layout),
            frame: previous && pageFrame(previous) === "before_after" ? ("before_after" as const) : ("grid" as const),
          };
    commit([...draft.pages, page]);
    selectPage(page.id);
    setTray("pages");
  }

  function addLetterhead(kind: LetterheadKind) {
    const page = emptyTextPage({ kind });
    commit([...draft.pages, page]);
    selectPage(page.id);
    setTray("pages");
  }

  function removePage(pageId: string) {
    if (draft.pages.length === 1) {
      toast.error("Keep at least one page.");
      return;
    }
    commit(draft.pages.filter((page) => page.id !== pageId));
  }

  function requestRemove(pageId: string) {
    const target = draft.pages.find((page) => page.id === pageId);
    if (target?.type === "work_order") {
      toast.error("Work order sections stay on the page. Use Undo to reverse a change.");
      return;
    }
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

  function onDragStart(event: DragStartEvent) {
    setDragPhotoId(photoIdFromTray(String(event.active.id)));
  }

  function onDragEnd(event: DragEndEvent) {
    setDragPhotoId(null);
    const photoId = photoIdFromTray(String(event.active.id));
    if (photoId) {
      const overId = event.over ? String(event.over.id) : "";
      if (overId !== "photo-page" && overId !== "photo-preview") return;
      if (!selected || selected.type !== "photos") {
        toast.message("Open a photo page, then drop the shot there.");
        return;
      }
      addPhotos(selected, [photoId]);
      return;
    }
    reorderPages(event);
  }

  function updateItems(page: PhotoReportPhotosPage, items: PhotoReportPhotosPage["items"]) {
    patchPage(page.id, { items });
  }

  function removePhotoFromPage(page: PhotoReportPhotosPage, index: number) {
    updateItems(
      page,
      page.items.filter((_, entryIndex) => entryIndex !== index),
    );
    setActiveIndex((current) => Math.max(0, Math.min(current, page.items.length - 2)));
  }

  function movePhoto(page: PhotoReportPhotosPage, index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= page.items.length) return;
    updateItems(page, arrayMove(page.items, index, next));
    setActiveIndex(next);
  }

  function setCaption(page: PhotoReportPhotosPage, index: number, caption: string) {
    updateItems(
      page,
      page.items.map((item, entryIndex) =>
        entryIndex === index ? { ...item, caption: caption.slice(0, CAPTION_LIMIT) } : item,
      ),
    );
  }

  function toggleTag(page: PhotoReportPhotosPage, index: number, tag: PhotoCaptionTag) {
    updateItems(
      page,
      page.items.map((item, entryIndex) => {
        if (entryIndex !== index) return item;
        const current = item.tags ?? [];
        const next = current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag];
        return { ...item, tags: parseCaptionTags(next) };
      }),
    );
  }

  function draftTags(page: PhotoReportPhotosPage, index: number) {
    const item = page.items[index];
    if (!item) return;
    const caption = draftCaptionFromTags(item.tags ?? [], page.heading);
    if (!caption) {
      toast.message("Choose a tag first.");
      return;
    }
    setCaption(page, index, caption);
  }

  function addPhotos(page: PhotoReportPhotosPage, photoIds: string[]) {
    const existing = new Set(page.items.map((item) => item.photoId));
    const incoming = photoIds.filter((id) => !existing.has(id));
    if (incoming.length === 0) {
      if (photoIds.length > 0) toast.message("Already on this page.");
      return;
    }
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
                tags: [],
              })),
            ],
          }
        : item,
    );
    if (overflow.length > 0) {
      const extras = chunkAsPages(
        overflow.map((photoId) => photoById(photos, photoId)).filter((photo): photo is JobPhoto => Boolean(photo)),
        page.layout,
        page.frame,
      );
      const index = pages.findIndex((item) => item.id === page.id);
      pages = [...pages.slice(0, index + 1), ...extras, ...pages.slice(index + 1)];
    }
    commit(pages);
    if (fit.length > 0) setActiveIndex(page.items.length);
  }

  function applyFrame(page: PhotoReportPhotosPage, frame: PhotoPageFrame) {
    const layout: PhotoPageLayout = frame === "before_after" ? "two" : "four";
    if (pageFrame(page) === frame && page.layout === layout) return;
    const cap = layoutCapacity(layout);
    const fit = page.items.slice(0, cap);
    const overflow = page.items.slice(cap);
    const updated: PhotoReportPage = { ...page, layout, frame, items: fit };
    let pages = draft.pages.map((item) => (item.id === page.id ? updated : item));
    if (overflow.length > 0) {
      const extras: PhotoReportPage[] = [];
      for (let index = 0; index < overflow.length; index += cap) {
        extras.push({
          ...emptyPhotosPage(layout),
          frame,
          heading: page.heading,
          items: overflow.slice(index, index + cap),
        });
      }
      const at = pages.findIndex((item) => item.id === page.id);
      pages = [...pages.slice(0, at + 1), ...extras, ...pages.slice(at + 1)];
    }
    commit(pages);
    setActiveIndex((current) => Math.min(current, Math.max(0, fit.length - 1)));
  }

  async function uploadFiles(list: FileList | null) {
    if (!list || !canUpload) return;
    const files = Array.from(list).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("Choose an image file.");
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        await crm.addJobPhoto({
          jobId: job.id,
          caption: "",
          category: "progress",
          takenAt: new Date().toISOString(),
          file,
        });
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
    if (readOnly) return;
    await crm.deletePhotoReport(draft.id);
    toast.success("Page deleted.");
    onClose();
  }

  function focusFromPreview(index: number) {
    setActiveIndex(index);
    if (mode === "preview") setMode("split");
    if (selected) pendingScroll.current = `caption-card-${selected.id}-${index}`;
  }

  const sectionTitle =
    selected?.type === "photos" ? selected.heading.trim() || "this page" : pageLabel(selected ?? draft.pages[0], selectedIndex);

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-50 flex flex-col bg-[#f3f3f3] md:left-52">
      <header className="flex shrink-0 flex-col gap-2 border-b bg-background px-3 py-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Back to job">
            <ChevronLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Photo report · {readOnly ? "View only" : "Editing"}
            </p>
            {readOnly ? (
              <p className="truncate text-sm font-medium">{draft.title.trim() || "Untitled page"}</p>
            ) : (
              <input
                value={draft.title}
                onChange={(event) => commit(draft.pages, { title: event.target.value })}
                aria-label="Page title"
                className="w-full truncate border-0 bg-transparent text-sm font-medium outline-none"
              />
            )}
          </div>
          <SaveStatus state={saveState} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={!canUndo}
              onClick={undoChange}
              aria-label="Undo last change"
            >
              <RotateCcw />
            </Button>
          )}
          <ModeSwitch mode={mode} onChange={setMode} />
          {missingCaptions > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Circle className="size-3.5" aria-hidden />
              {missingCaptions} caption{missingCaptions === 1 ? "" : "s"} missing
            </p>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={shareBusy} onClick={() => void sharePage()}>
            <Link2 data-icon="inline-start" />
            {shareBusy ? "Preparing…" : "Share"}
          </Button>
          <Button type="button" size="sm" disabled={pdfBusy} onClick={() => void downloadPdf()}>
            <Download data-icon="inline-start" />
            {pdfBusy ? "Building PDF…" : "Download PDF"}
          </Button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragPhotoId(null)}
      >
        <div
          className={cn(
            "grid min-h-0 flex-1",
            mode === "preview"
              ? "grid-cols-1"
              : mode === "edit"
                ? "lg:grid-cols-[18rem_minmax(0,1fr)]"
                : "lg:grid-cols-[18rem_minmax(0,1fr)_23rem]",
          )}
        >
          {mode === "preview" ? null : (
            <aside className="flex max-h-80 min-h-0 flex-col border-b bg-[#f3f3f3] lg:max-h-none lg:border-r lg:border-b-0">
              <div className="flex shrink-0 border-b bg-background">
                <TrayTabButton active={tray === "pages"} onClick={() => setTray("pages")}>
                  Pages · {draft.pages.length}
                </TrayTabButton>
                <TrayTabButton active={tray === "photos"} onClick={() => setTray("photos")}>
                  Job photos · {photos.length}
                </TrayTabButton>
              </div>
              {tray === "pages" ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {readOnly ? (
                    <ul className="space-y-1">
                      {draft.pages.map((page, index) => (
                        <li key={page.id}>
                          <button
                            type="button"
                            onClick={() => selectPage(page.id)}
                            className={cn(
                              "w-full rounded-md px-2 py-1.5 text-left text-sm",
                              page.id === selected?.id ? "bg-background font-medium shadow-sm" : "hover:bg-background/70",
                            )}
                          >
                            <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">
                              Page {index + 1}
                            </span>
                            {pageLabel(page, index)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <SortableContext items={draft.pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1">
                        {draft.pages.map((page, index) => (
                          <SortablePageCard
                            key={page.id}
                            page={page}
                            index={index}
                            selected={page.id === selected?.id}
                            canDelete={page.type !== "work_order" && draft.pages.length > 1}
                            onSelect={() => selectPage(page.id)}
                            onDelete={() => requestRemove(page.id)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <div className="mb-2 flex gap-1.5">
                    <FilterPill active={trayFilter === "unused"} onClick={() => setTrayFilter("unused")}>
                      Not in report · {unusedPhotos.length}
                    </FilterPill>
                    <FilterPill active={trayFilter === "all"} onClick={() => setTrayFilter("all")}>
                      All
                    </FilterPill>
                  </div>
                  <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                    {selected?.type === "photos"
                      ? `Drag a photo onto the page, or tap + Add, to put it in “${sectionTitle}”.`
                      : "Open a photo page, then drag a shot onto it or tap + Add."}
                  </p>
                  {trayPhotos.length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      {photos.length === 0
                        ? "No photos on this job yet."
                        : "Every job photo is already in the report."}
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2">
                      {trayPhotos.map((photo) => (
                        <TrayPhoto
                          key={photo.id}
                          photo={photo}
                          onThisPage={selected?.type === "photos" && selected.items.some((item) => item.photoId === photo.id)}
                          disabled={readOnly}
                          onAdd={() => {
                            if (selected?.type !== "photos") {
                              toast.message("Open a photo page, then add the shot there.");
                              return;
                            }
                            addPhotos(selected, [photo.id]);
                          }}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {tray === "photos" && canUpload ? (
                <div className="shrink-0 border-t bg-background">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(event) => void uploadFiles(event.target.files)}
                  />
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-1.5 px-3 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    {uploading ? "Uploading…" : "Upload photos"}
                  </button>
                </div>
              ) : null}
              {tray === "pages" && !readOnly ? (
                <div className="shrink-0 space-y-1 border-t bg-background p-2">
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => addPage("photos")}>
                    <Plus data-icon="inline-start" />
                    Photo page
                  </Button>
                  <div className="grid grid-cols-2 gap-1">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="w-full" />}>
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
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive"
                    onClick={() => void removeReport()}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete document
                  </Button>
                </div>
              ) : null}
            </aside>
          )}

          {mode === "preview" ? null : (
            <DropSurface
              id="photo-page"
              disabled={readOnly || selected?.type !== "photos"}
              className="min-h-0 overflow-y-auto bg-[#f3f3f3]"
            >
              {selected ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                          {pageKicker(selectedIndex + 1, selected, section)}
                        </p>
                        {mode === "edit" ? (
                          <PagePager
                            index={selectedIndex}
                            count={draft.pages.length}
                            onPrev={() => stepPage(-1)}
                            onNext={() => stepPage(1)}
                          />
                        ) : null}
                      </div>
                      {selected.type === "photos" ? (
                        <input
                          value={selected.heading}
                          onChange={(event) => patchPage(selected.id, { heading: event.target.value })}
                          readOnly={readOnly}
                          placeholder="Section name"
                          aria-label="Section name"
                          className="mt-1 w-full border-0 bg-transparent font-heading text-3xl leading-tight outline-none placeholder:text-muted-foreground/40"
                        />
                      ) : selected.type === "text" ? null : (
                        <h2 className="mt-1 font-heading text-3xl leading-tight">{pageLabel(selected, selectedIndex)}</h2>
                      )}
                    </div>
                    {selected.type === "photos" && !readOnly ? (
                      <div className="shrink-0">
                        <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                          Page layout
                        </p>
                        <div className="mt-1 flex rounded-md border bg-muted/70 p-0.5">
                          <LayoutChoice
                            active={pageFrame(selected) !== "before_after"}
                            onClick={() => applyFrame(selected, "grid")}
                          >
                            Photo grid
                          </LayoutChoice>
                          <LayoutChoice
                            active={pageFrame(selected) === "before_after"}
                            onClick={() => applyFrame(selected, "before_after")}
                          >
                            Before & after
                          </LayoutChoice>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {selected.type === "photos" ? (
                    <PhotoSectionEditor
                      page={selected}
                      photos={photos}
                      readOnly={readOnly}
                      activeIndex={activeIndex}
                      onFocus={setActiveIndex}
                      onNotes={(notes) => patchPage(selected.id, { notes })}
                      onCaption={(index, caption) => setCaption(selected, index, caption)}
                      onToggleTag={(index, tag) => toggleTag(selected, index, tag)}
                      onDraft={(index) => draftTags(selected, index)}
                      onMove={(index, delta) => movePhoto(selected, index, delta)}
                      onRemove={(index) => removePhotoFromPage(selected, index)}
                    />
                  ) : null}
                  {selected.type === "cover" && !readOnly ? (
                    <div className="rounded-lg border bg-background p-4">
                      <PageInspector
                        page={selected}
                        photos={photos}
                        onChange={(patch) => patchPage(selected.id, patch)}
                        onRemove={() => requestRemove(selected.id)}
                      />
                    </div>
                  ) : null}
                  {selected.type === "cover" && readOnly ? (
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
                  ) : null}
                  {selected.type === "text" ? (
                    <TextPageFields
                      page={selected}
                      readOnly={readOnly}
                      onChange={(patch) => patchPage(selected.id, patch)}
                    />
                  ) : null}
                  {selected.type === "work_order" && !readOnly ? (
                    <WorkOrderEditor
                      page={selected}
                      job={job}
                      opportunity={opportunity}
                      title={draft.title}
                      onTitleChange={(title) => commit(draft.pages, { title })}
                      onChange={(next) => patchPage(selected.id, next)}
                    />
                  ) : null}
                  {selected.type === "work_order" && readOnly ? (
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
                  ) : null}
                </div>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">Add a page to start this document.</p>
              )}
            </DropSurface>
          )}

          {mode === "edit" ? null : (
            <DropSurface
              id="photo-preview"
              disabled={readOnly || selected?.type !== "photos"}
              className="flex min-h-0 flex-col border-t bg-[#f3f3f3] lg:border-t-0 lg:border-l"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-[#1f7a45] uppercase">
                  <span className="size-1.5 rounded-full bg-[#1f7a45]" />
                  Live preview · matches PDF
                </p>
                <PagePager
                  index={Math.max(0, selectedIndex)}
                  count={draft.pages.length}
                  onPrev={() => stepPage(-1)}
                  onNext={() => stepPage(1)}
                />
              </div>
              <div className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-4", mode === "preview" && "mx-auto w-full max-w-xl")}>
                {selected?.type === "photos" ? (
                  <PhotoReportPaper
                    page={selected}
                    pageNumber={selectedIndex + 1}
                    pageCount={draft.pages.length}
                    sectionNumber={section.index >= 0 ? section.index + 1 : null}
                    sectionCount={section.total}
                    jobName={job.name}
                    photos={photos}
                    report={draft}
                    company={crm.company}
                    activeIndex={activeIndex}
                    onSelectIndex={focusFromPreview}
                  />
                ) : selected ? (
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
                ) : null}
              </div>
            </DropSurface>
          )}
        </div>
        <DragOverlay>
          {dragging ? (
            <div className="w-20 overflow-hidden border bg-background shadow-lg">
              {dragging.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dragging.imageUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-[10px]">{photoFileLabel(dragging)}</div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ShareLinkDialog
        unsavedGuard={false}
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
        emailTemplates={crm.company.emailTemplates}
        sender={emailOwner}
        recipients={resolveShareContacts({ jobId: job.id, primaryContactId: job.primaryContactId }, crm)}
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
      <Dialog
        unsavedGuard={false}
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
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
    </div>
  );
}

function SaveStatus({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "error") return <p className="shrink-0 text-xs text-destructive">Could not save</p>;
  return (
    <p className="inline-flex shrink-0 items-center gap-1 text-xs text-[#1f7a45]">
      <Check className="size-3.5" aria-hidden />
      {state === "saving" ? "Saving…" : "All changes saved"}
    </p>
  );
}

function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const options: Array<{ id: ViewMode; label: string }> = [
    { id: "edit", label: "Edit" },
    { id: "split", label: "Split" },
    { id: "preview", label: "Preview" },
  ];
  return (
    <div className="flex rounded-full border bg-background p-0.5" role="group" aria-label="Editor layout">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={mode === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            mode === option.id ? "bg-[#1f7a45] text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PagePager({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
      <Button type="button" variant="ghost" size="icon-xs" disabled={index <= 0} onClick={onPrev} aria-label="Previous page">
        <ChevronLeft />
      </Button>
      <span className="tabular-nums">
        Page {Math.min(count, index + 1)} of {count}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={index >= count - 1}
        onClick={onNext}
        aria-label="Next page"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function TrayTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-2 py-2 text-xs font-medium",
        active ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium",
        active ? "bg-foreground text-background" : "border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function LayoutChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-sm px-2.5 py-1 text-xs font-medium",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DropSurface({
  id,
  disabled,
  className,
  children,
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div ref={setNodeRef} className={cn(className, isOver && !disabled && "ring-2 ring-primary ring-inset")}>
      {children}
    </div>
  );
}

function pageKicker(
  pageNumber: number,
  page: PhotoReportPage,
  section: { index: number; total: number },
) {
  if (page.type === "photos" && section.index >= 0) {
    return `Page ${pageNumber} · Section ${section.index + 1} of ${section.total}`;
  }
  if (page.type === "cover") return `Page ${pageNumber} · Cover`;
  if (page.type === "work_order") return `Page ${pageNumber} · Work order`;
  return `Page ${pageNumber} · ${pageLabel(page, pageNumber - 1)}`;
}

function PhotoSectionEditor({
  page,
  photos,
  readOnly,
  activeIndex,
  onFocus,
  onNotes,
  onCaption,
  onToggleTag,
  onDraft,
  onMove,
  onRemove,
}: {
  page: PhotoReportPhotosPage;
  photos: JobPhoto[];
  readOnly: boolean;
  activeIndex: number;
  onFocus: (index: number) => void;
  onNotes: (notes: string) => void;
  onCaption: (index: number, caption: string) => void;
  onToggleTag: (index: number, tag: PhotoCaptionTag) => void;
  onDraft: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <label className="block rounded-lg border bg-background px-3 py-2">
        <span className="text-[11px] text-muted-foreground">
          Section summary — prints above the photos and on the Summary page
        </span>
        <textarea
          value={page.notes}
          onChange={(event) => onNotes(event.target.value)}
          readOnly={readOnly}
          rows={2}
          placeholder="What this part of the roof shows"
          aria-label="Section summary"
          className="mt-1 w-full resize-none border-0 bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
        />
      </label>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {page.items.length} photo{page.items.length === 1 ? "" : "s"}
        </span>
        <span>Tags print under each caption</span>
      </div>
      {page.items.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background px-3 py-8 text-center text-sm text-muted-foreground">
          No photos on this page yet. Add one from the job photos on the left.
        </p>
      ) : (
        <ul className="space-y-3">
          {page.items.map((item, index) => {
            const photo = photoById(photos, item.photoId);
            return (
              <CaptionCard
                key={`${item.photoId}-${index}`}
                id={`caption-card-${page.id}-${index}`}
                item={item}
                photo={photo}
                active={activeIndex === index}
                readOnly={readOnly}
                canUp={index > 0}
                canDown={index < page.items.length - 1}
                onFocus={() => onFocus(index)}
                onCaption={(caption) => onCaption(index, caption)}
                onToggleTag={(tag) => onToggleTag(index, tag)}
                onDraft={() => onDraft(index)}
                onUp={() => onMove(index, -1)}
                onDown={() => onMove(index, 1)}
                onRemove={() => onRemove(index)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CaptionCard({
  id,
  item,
  photo,
  active,
  readOnly,
  canUp,
  canDown,
  onFocus,
  onCaption,
  onToggleTag,
  onDraft,
  onUp,
  onDown,
  onRemove,
}: {
  id: string;
  item: PhotoReportPhotosPage["items"][number];
  photo: JobPhoto | undefined;
  active: boolean;
  readOnly: boolean;
  canUp: boolean;
  canDown: boolean;
  onFocus: () => void;
  onCaption: (caption: string) => void;
  onToggleTag: (tag: PhotoCaptionTag) => void;
  onDraft: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const label = photo ? photoFileLabel(photo) : "Missing photo";
  const tags = item.tags ?? [];
  return (
    <li
      id={id}
      className={cn(
        "rounded-lg border bg-background p-3",
        active ? "border-primary ring-1 ring-primary" : "border-border",
      )}
      onClick={onFocus}
    >
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          <div className="relative aspect-square overflow-hidden bg-[repeating-linear-gradient(135deg,#e6e2da_0_7px,#f4f2ee_7px_14px)]">
            {photo?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] text-neutral-500">
                {photo ? label : "Missing photo"}
              </span>
            )}
          </div>
          {photo?.imageUrl ? <p className="mt-1 truncate text-[10px] text-muted-foreground">{label}</p> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">Caption</p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {item.caption.length} / {CAPTION_LIMIT}
            </p>
          </div>
          <textarea
            value={item.caption}
            onChange={(event) => onCaption(event.target.value)}
            onFocus={onFocus}
            readOnly={readOnly}
            rows={2}
            maxLength={CAPTION_LIMIT}
            placeholder="Describe what this photo shows..."
            aria-label={`Caption for ${label}`}
            className="mt-1 w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-sm leading-snug outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {PHOTO_CAPTION_TAGS.map((tag) => {
              const on = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly}
                  onClick={() => onToggleTag(tag)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-60",
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-input bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {PHOTO_CAPTION_TAG_LABELS[tag]}
                </button>
              );
            })}
          </div>
          {readOnly ? null : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onDraft}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                <Sparkles className="size-3" />
                Draft from tags
              </button>
              <div className="flex items-center gap-0.5">
                <Button type="button" variant="ghost" size="icon-xs" disabled={!canUp} onClick={onUp} aria-label="Move photo up">
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={!canDown}
                  onClick={onDown}
                  aria-label="Move photo down"
                >
                  <ChevronDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label="Remove photo from page">
                  <XIcon />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function TrayPhoto({
  photo,
  onThisPage,
  disabled,
  onAdd,
}: {
  photo: JobPhoto;
  onThisPage: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tray:${photo.id}`,
    disabled: disabled || onThisPage,
  });
  const label = photoFileLabel(photo);
  return (
    <li className={cn(isDragging && "opacity-40")}>
      <div
        ref={setNodeRef}
        className="relative aspect-square cursor-grab overflow-hidden bg-[repeating-linear-gradient(135deg,#e6e2da_0_7px,#f4f2ee_7px_14px)] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        {photo.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.imageUrl} alt={photo.caption || label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500">{label}</span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{photoClock(photo)}</span>
      </div>
      <Button type="button" size="xs" className="mt-1.5 w-full" disabled={disabled || onThisPage} onClick={onAdd}>
        <Plus data-icon="inline-start" />
        {onThisPage ? "On this page" : "Add to page"}
      </Button>
    </li>
  );
}

function TextPageFields({
  page,
  readOnly,
  onChange,
}: {
  page: Extract<PhotoReportPage, { type: "text" }>;
  readOnly: boolean;
  onChange: (patch: Partial<PhotoReportPage>) => void;
}) {
  return (
    <div className="space-y-3">
      <input
        value={page.heading}
        onChange={(event) => onChange({ heading: event.target.value })}
        readOnly={readOnly}
        placeholder="Heading"
        aria-label="Heading"
        className="w-full border-0 bg-transparent font-heading text-3xl leading-tight outline-none placeholder:text-muted-foreground/40"
      />
      <textarea
        value={page.body}
        onChange={(event) => onChange({ body: event.target.value })}
        readOnly={readOnly}
        rows={14}
        placeholder="Write this page. Introduction, findings, next steps, or a blank note."
        aria-label="Page body"
        className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

function photoClock(photo: JobPhoto) {
  if (!photo.takenAt) return "";
  if (!photo.takenAt.includes("T")) return formatDate(photo.takenAt);
  return formatTime(photo.takenAt);
}

function photoIdFromTray(id: string) {
  return id.startsWith("tray:") ? id.slice(5) : null;
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
          "flex items-start rounded-md border bg-background/40",
          selected ? "border-primary/50 bg-background shadow-sm" : "border-transparent hover:bg-background/80",
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

function withJobBoundWorkOrder(
  report: PhotoReport,
  job: Job,
  opportunity?: Parameters<typeof fillWorkOrderFromJob>[2],
): PhotoReport {
  let changed = false;
  const pages = report.pages.map((page) => {
    if (page.type !== "work_order") return page;
    const next = fillWorkOrderFromJob(page, job, opportunity);
    if (next !== page) changed = true;
    return next;
  });
  return changed ? { ...report, pages } : report;
}

function chunkAsPages(photos: JobPhoto[], layout: PhotoPageLayout, frame?: PhotoPageFrame) {
  const cap = layoutCapacity(layout);
  const pages: PhotoReportPage[] = [];
  for (let index = 0; index < photos.length; index += cap) {
    const slice = photos.slice(index, index + cap);
    pages.push({
      ...emptyPhotosPage(layout),
      frame: frame === "before_after" ? "before_after" : "grid",
      items: slice.map((photo) => ({ photoId: photo.id, caption: photo.caption, tags: [] })),
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

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
