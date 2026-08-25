"use client";

import { useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_LINE_PHOTOS, normalizeLinePhotoIds, photosForEstimateLine } from "@/lib/estimate-line-photos";
import type { EstimateLine, JobPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EstimateLinePhotos({
  line,
  gallery,
  emptyHint,
  editable,
  onChange,
}: {
  line: Pick<EstimateLine, "photoIds"> & { photos?: EstimateLine["photos"] };
  gallery: JobPhoto[];
  emptyHint?: string;
  editable: boolean;
  onChange?: (photoIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const attached = photosForEstimateLine(line, gallery);
  const attachedIds = attached.map((photo) => photo.id);

  if (!attached.length && !editable) return null;

  return (
    <div className="mt-3 space-y-2">
      {attached.length ? (
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
          {attached.map((photo) => (
            <li key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.imageUrl}
                alt={photo.caption || "Line photo"}
                className="aspect-square w-full rounded-sm border object-cover"
              />
              {editable && onChange ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  className="absolute top-1 right-1 size-6"
                  aria-label="Remove photo"
                  onClick={() => onChange(attachedIds.filter((id) => id !== photo.id))}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable && onChange ? (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <ImagePlus />
            {attached.length ? "Change photos" : "Attach job photos"}
          </Button>
          <LinePhotoPickerDialog
            open={open}
            onOpenChange={setOpen}
            gallery={gallery}
            emptyHint={emptyHint}
            selectedIds={attachedIds}
            onSave={onChange}
          />
        </>
      ) : null}
    </div>
  );
}

function LinePhotoPickerDialog({
  open,
  onOpenChange,
  gallery,
  emptyHint,
  selectedIds,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gallery: JobPhoto[];
  emptyHint?: string;
  selectedIds: string[];
  onSave: (photoIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(selectedIds);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_LINE_PHOTOS) return current;
      return normalizeLinePhotoIds([...current, id]);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked(selectedIds);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Job photos</DialogTitle>
          <DialogDescription>
            Pick shots from this job’s gallery. They print on this line of the proposal.
          </DialogDescription>
        </DialogHeader>
        {gallery.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyHint || "This job does not have photos yet. Add them on the job record first."}
          </p>
        ) : (
          <ul className="grid max-h-[min(24rem,50dvh)] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {gallery.map((photo) => {
              const on = pickedSet.has(photo.id);
              const full = !on && picked.length >= MAX_LINE_PHOTOS;
              return (
                <li key={photo.id}>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => toggle(photo.id)}
                    className={cn(
                      "overflow-hidden rounded-sm border",
                      on && "ring-2 ring-primary",
                      full && "opacity-40",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.imageUrl}
                      alt={photo.caption || "Job photo"}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {picked.length} of {MAX_LINE_PHOTOS} photos on this line.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={gallery.length === 0}
            onClick={() => {
              onSave(picked);
              onOpenChange(false);
            }}
          >
            Save photos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
