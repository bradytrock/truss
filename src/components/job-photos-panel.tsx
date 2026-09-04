"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhotoCategoryBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatDateTimeUtc } from "@/lib/format";
import { livePhotos, trashedPhotos } from "@/lib/photo-trash";
import type { JobPhoto, PhotoAuditEvent } from "@/lib/types";

export function JobPhotosPanel({
  jobId,
  disabled,
  onAddPhoto,
}: {
  jobId: string;
  disabled?: boolean;
  onAddPhoto: () => void;
}) {
  const crm = useCrm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const photos = useMemo(() => livePhotos(crm.photos, jobId), [crm.photos, jobId]);
  const trashed = useMemo(() => trashedPhotos(crm.photos, jobId), [crm.photos, jobId]);
  const audit = useMemo(
    () =>
      [...(crm.photoAuditEvents ?? [])]
        .filter((event) => event.jobId === jobId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [crm.photoAuditEvents, jobId],
  );

  async function trash(photo: JobPhoto) {
    if (disabled) return;
    if (
      !window.confirm(
        `Move “${photo.caption.trim() || "Untitled"}” to the Project Trashcan?\n\nIt will leave the gallery, but the file stays in storage and can be restored.`,
      )
    ) {
      return;
    }
    setBusyId(photo.id);
    try {
      const ok = await crm.deleteJobPhoto(photo.id);
      if (ok) {
        toast.success("Moved to Project Trashcan.");
        setTrashOpen(true);
      }
    } finally {
      setBusyId(null);
    }
  }

  async function restore(photo: JobPhoto) {
    if (disabled) return;
    setBusyId(photo.id);
    try {
      const ok = await crm.restoreJobPhoto(photo.id);
      if (ok) toast.success("Photo restored to the gallery.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {photos.length === 0 ? "No photos on this job." : `${photos.length} photos`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => setTrashOpen((open) => !open)}
            >
              <Trash2 data-icon="inline-start" />
              Trashcan{trashed.length > 0 ? ` (${trashed.length})` : ""}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onAddPhoto}>
              Add photo
            </Button>
          </div>
        </div>
        {photos.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {photos.map((photo) => (
              <figure key={photo.id} className="overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.imageUrl}
                  alt={photo.caption || "Job photo"}
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="space-y-2 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <PhotoCategoryBadge category={photo.category} />
                      <p className="text-sm leading-snug">{photo.caption || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground">
                        {photo.createdBy?.trim()
                          ? `Taken by ${photo.createdBy.trim()} · ${formatDate(photo.takenAt)}`
                          : formatDate(photo.takenAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0"
                      disabled={disabled || busyId === photo.id}
                      aria-label={`Move ${photo.caption || "photo"} to trashcan`}
                      title="Move to Project Trashcan"
                      onClick={() => void trash(photo)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </section>

      {trashOpen ? (
        <section className="space-y-4 border-t pt-6">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Project Trashcan</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Soft-deleted photos only. Storage copies stay on Backblaze — nothing is purged from here.
            </p>
          </div>

          {trashed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Trashcan is empty for this job.</p>
          ) : (
            <ul className="space-y-2">
              {trashed.map((photo) => (
                <li key={photo.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt=""
                    className="size-14 shrink-0 rounded-sm object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{photo.caption || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        photo.deletedBy?.trim() ? `Removed by ${photo.deletedBy.trim()}` : null,
                        photo.deletedAt ? formatDateTimeUtc(photo.deletedAt) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || busyId === photo.id}
                    onClick={() => void restore(photo)}
                  >
                    <RotateCcw data-icon="inline-start" />
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Audit log</p>
            {audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trash or restore events yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {audit.map((event) => (
                  <AuditRow key={event.id} event={event} />
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AuditRow({ event }: { event: PhotoAuditEvent }) {
  const actionLabel = event.action === "restored" ? "Restored" : "Trashed";
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <p className="font-medium">
        {actionLabel} “{event.caption.trim() || "Untitled"}”
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[event.actor.trim() || null, formatDateTimeUtc(event.createdAt), event.detail.trim() || null]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </li>
  );
}
