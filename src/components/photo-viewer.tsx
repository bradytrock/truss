"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PhotoAnnotateEditor } from "@/components/photo-annotate-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { isTextEntryElement } from "@/lib/draft-escape";
import { useCrm } from "@/lib/crm-store";
import { formatDate } from "@/lib/format";
import { stepPhotoId } from "@/lib/photos-feed";
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_LABELS, type JobPhoto, type PhotoCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PhotoViewer({
  photo,
  photos,
  open,
  onOpenChange,
  onSelect,
  canManage = true,
  photographer,
  actions,
}: {
  photo: JobPhoto | null;
  /** Gallery order for the left and right buttons. Defaults to the open photo. */
  photos?: JobPhoto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (photoId: string) => void;
  canManage?: boolean;
  photographer?: string;
  actions?: ReactNode;
}) {
  const crm = useCrm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const sequence = useMemo(
    () => (photos && photos.length > 0 ? photos : photo ? [photo] : []),
    [photo, photos],
  );
  const photoId = photo?.id ?? "";
  const editing = Boolean(open && photo && editingId === photo.id);

  const close = useCallback(() => {
    setEditingId(null);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (editing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (isTextEntryElement(event.target)) {
          if (event.target instanceof HTMLElement) event.target.blur();
          return;
        }
        close();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (isTextEntryElement(event.target)) return;
      const next = stepPhotoId(sequence, photoId, event.key === "ArrowLeft" ? -1 : 1);
      if (!next || !onSelect) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(next);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close, editing, onSelect, open, photoId, sequence]);

  if (!open || !photo || typeof document === "undefined") return null;

  if (editing) {
    return createPortal(
      <PhotoAnnotateEditor
        src={photo.imageUrl}
        alt={photo.caption || "Job photo"}
        onClose={() => setEditingId(null)}
        onSave={async (file) => {
          const ok = await crm.updateJobPhoto(photo.id, { file });
          if (ok) {
            toast.success("Photo updated.");
            setEditingId(null);
          }
        }}
      />,
      document.body,
    );
  }

  const job = crm.getJob(photo.jobId);
  const jobHref = job && !job.deletedAt ? `/jobs?job=${job.id}&tab=photos` : null;

  return createPortal(
    <PhotoViewerFrame
      key={photo.id}
      photo={photo}
      photos={sequence}
      canManage={canManage}
      photographer={photographer}
      actions={actions}
      jobName={job?.name}
      jobHref={jobHref}
      isPrimary={job?.primaryPhotoId === photo.id}
      onClose={close}
      onSelect={onSelect}
      onEdit={() => setEditingId(photo.id)}
      onPatch={(patch) => crm.patchJobPhoto(photo.id, patch)}
      onSetPrimary={
        job
          ? (next) => crm.updateJob(job.id, { primaryPhotoId: next ? photo.id : null })
          : undefined
      }
    />,
    document.body,
  );
}

function PhotoViewerFrame({
  photo,
  photos,
  canManage,
  photographer,
  actions,
  jobName,
  jobHref,
  isPrimary = false,
  onClose,
  onSelect,
  onEdit,
  onPatch,
  onSetPrimary,
}: {
  photo: JobPhoto;
  photos: JobPhoto[];
  canManage: boolean;
  photographer?: string;
  actions?: ReactNode;
  jobName?: string;
  jobHref?: string | null;
  isPrimary?: boolean;
  onClose: () => void;
  onSelect?: (photoId: string) => void;
  onEdit: () => void;
  onPatch: (patch: { caption?: string; category?: PhotoCategory; notes?: string }) => Promise<boolean>;
  onSetPrimary?: (next: boolean) => Promise<boolean>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState(photo.caption);
  const [notes, setNotes] = useState(photo.notes ?? "");
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const index = photos.findIndex((item) => item.id === photo.id);
  const canStep = photos.length > 1 && Boolean(onSelect);
  const canPrev = canStep && index > 0;
  const canNext = canStep && index >= 0 && index < photos.length - 1;
  const position = index >= 0 ? `Photo ${index + 1} of ${photos.length}` : "";
  const subtitle = [PHOTO_CATEGORY_LABELS[photo.category], position].filter(Boolean).join(" · ");
  const source = photoSourceLabel(photo);
  const takenBy = photographer?.trim() || photo.createdBy?.trim() || "";

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [photo.id]);

  function shift(delta: number) {
    const next = stepPhotoId(photos, photo.id, delta);
    if (next) onSelect?.(next);
  }

  async function commit(patch: { caption?: string; category?: PhotoCategory; notes?: string }) {
    if (!canManage) return;
    const ok = await onPatch(patch);
    if (ok) return;
    if (patch.caption !== undefined) setCaption(photo.caption);
    if (patch.notes !== undefined) setNotes(photo.notes ?? "");
  }

  async function setPrimary(next: boolean) {
    if (!canManage || !onSetPrimary || primaryBusy || next === isPrimary) return;
    setPrimaryBusy(true);
    try {
      const ok = await onSetPrimary(next);
      if (ok) toast.success(next ? "Primary project photo updated." : "Primary project photo cleared.");
    } finally {
      setPrimaryBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption.trim() || jobName || "Photo"}
      tabIndex={-1}
      data-slot="dialog-content"
      className="fixed inset-0 z-[70] flex flex-col bg-neutral-950 text-white outline-none lg:flex-row"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{jobName || "Photo"}</p>
            <p className="truncate text-xs text-white/60">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton
              label={expanded ? "Show photo details" : "Focus photo"}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </IconButton>
            <IconButton label="Download photo" onClick={() => void downloadPhoto(photo)}>
              <Download className="size-4" />
            </IconButton>
            <IconButton label="Close photo" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.imageUrl}
            alt={photo.caption || "Job photo"}
            className="size-full object-contain"
          />
          <NavButton
            label="Previous photo"
            className="left-3"
            disabled={!canPrev}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="size-5" />
          </NavButton>
          <NavButton label="Next photo" className="right-3" disabled={!canNext} onClick={() => shift(1)}>
            <ChevronRight className="size-5" />
          </NavButton>
        </div>

        {photos.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-4" aria-label="Photos in this set">
            {photos.map((item) => {
              const active = item.id === photo.id;
              return (
                <button
                  key={item.id}
                  ref={active ? activeThumbRef : undefined}
                  type="button"
                  aria-label={item.caption.trim() || "Photo"}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect?.(item.id)}
                  className={cn(
                    "size-14 shrink-0 overflow-hidden rounded-md border-2",
                    active ? "border-white" : "border-transparent opacity-70 hover:opacity-100",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="size-full object-cover" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {expanded ? null : (
        <aside className="flex max-h-[46dvh] w-full shrink-0 flex-col overflow-y-auto border-t border-white/10 bg-background text-foreground lg:max-h-none lg:w-[22rem] lg:border-t-0 lg:border-l lg:border-border">
          <div className="space-y-5 p-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Caption</p>
              <textarea
                value={caption}
                disabled={!canManage}
                aria-label="Caption"
                placeholder="Add a caption"
                rows={2}
                onChange={(event) => setCaption(event.target.value)}
                onBlur={() => {
                  const next = caption.trim();
                  setCaption(next);
                  if (next !== photo.caption) void commit({ caption: next });
                }}
                className="field-sizing-content max-h-28 w-full resize-none bg-transparent text-lg leading-snug font-semibold tracking-tight outline-none placeholder:text-muted-foreground disabled:opacity-100"
              />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0">
                  <span className="font-medium">{jobName || "Job"}</span>
                  {source ? <span className="text-muted-foreground"> · {source}</span> : null}
                </p>
                {jobHref ? (
                  <Link
                    href={jobHref}
                    aria-label={`Open ${jobName || "job"}`}
                    onClick={onClose}
                    className="mt-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="size-3.5" />
                {formatDate(photo.takenAt)}
              </p>
              {takenBy ? <p className="text-muted-foreground">Taken by {takenBy}</p> : null}
              {!jobName ? (
                <p className="text-xs text-muted-foreground">
                  This job is not in your book. The photo is still here for the company.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {PHOTO_CATEGORIES.map((category) => {
                  const selected = photo.category === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected}
                      disabled={!canManage || selected}
                      onClick={() => void commit({ category })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground hover:bg-muted/70",
                        !canManage && !selected && "opacity-50",
                      )}
                    >
                      {PHOTO_CATEGORY_LABELS[category]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Textarea
                value={notes}
                disabled={!canManage}
                aria-label="Notes"
                placeholder="Add a note for the crew"
                rows={4}
                onChange={(event) => setNotes(event.target.value)}
                onBlur={() => {
                  const next = notes.trim();
                  setNotes(next);
                  if (next !== (photo.notes ?? "")) void commit({ notes: next });
                }}
              />
            </div>

            {canManage ? (
              <Button type="button" className="w-full" onClick={onEdit}>
                <Pencil data-icon="inline-start" />
                Mark up photo
              </Button>
            ) : null}

            {onSetPrimary && canManage ? (
              <label className="flex items-center justify-between gap-3 text-sm">
                Set as primary
                <Checkbox
                  checked={isPrimary}
                  disabled={primaryBusy}
                  aria-label={isPrimary ? "Primary project photo" : "Set as primary"}
                  onCheckedChange={(value) => void setPrimary(value === true)}
                />
              </label>
            ) : isPrimary ? (
              <p className="text-sm text-muted-foreground">Primary photo</p>
            ) : null}

            {actions}
          </div>
        </aside>
      )}
    </div>
  );
}

function NavButton({
  label,
  className,
  disabled,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white shadow-md hover:bg-black/85 disabled:opacity-60",
        className,
      )}
    >
      {children}
    </button>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function photoSourceLabel(photo: JobPhoto) {
  if (photo.companycamPhotoId?.trim() || photo.imageUrl.toLowerCase().includes("companycam")) {
    return "via CompanyCam";
  }
  return "";
}

async function downloadPhoto(photo: JobPhoto) {
  const base = (photo.caption.trim() || "photo").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  const filename = `${base || "photo"}.jpg`;
  try {
    const response = await fetch(photo.imageUrl);
    if (!response.ok) throw new Error("Could not download the photo.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch {
    window.open(photo.imageUrl, "_blank", "noopener,noreferrer");
  }
}
