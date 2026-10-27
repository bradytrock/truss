"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { PhotoCategoryBadge } from "@/components/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import {
  photosForVentCloseout,
  ventComplianceBlock,
  ventSubmitBlock,
  type CommissionCloseout,
  type VentCloseoutInput,
} from "@/lib/commission-closeout";
import { livePhotos } from "@/lib/photo-trash";
import type { JobPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CloseoutVentDialog({
  jobId,
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  jobId: string;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (vents: VentCloseoutInput) => void;
}) {
  const crm = useCrm();
  const photos = useMemo(() => livePhotos(crm.photos, jobId), [crm.photos, jobId]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const block = ventSubmitBlock({ photoIds: selected, note });

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected([]);
          setNote("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vent pipe photos</DialogTitle>
          <DialogDescription>
            Choose the photos that show the vent pipes. If this job has none, explain why.
          </DialogDescription>
        </DialogHeader>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">This job has no photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => {
              const chosen = selected.includes(photo.id);
              const label = photo.caption.trim() || "Job photo";
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-pressed={chosen}
                  aria-label={chosen ? `Remove ${label}` : `Choose ${label} as a vent pipe photo`}
                  onClick={() => toggle(photo.id)}
                  className={cn(
                    "relative overflow-hidden rounded-[12px] border text-left",
                    chosen && "ring-2 ring-primary",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  <PhotoCategoryBadge
                    category={photo.category}
                    className="absolute top-2 right-2 border-white/20 bg-black/55 text-white"
                  />
                  {chosen ? (
                    <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" />
                    </span>
                  ) : null}
                  {photo.caption.trim() ? (
                    <span className="block truncate px-2 py-1.5 text-xs">{photo.caption.trim()}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {selected.length === 0 ? (
          <div className="space-y-2">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this job has no vent pipe photos"
              aria-label="Why this job has no vent pipe photos"
            />
            {block ? <p className="text-xs text-muted-foreground">{block}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {selected.length} vent pipe photo{selected.length === 1 ? "" : "s"} selected.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || Boolean(block)} onClick={() => onSubmit({ photoIds: selected, note })}>
            {busy ? "Sending…" : "Send for closeout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CloseoutVentRecord({
  closeout,
  photos,
  editing = false,
  onCompliant,
}: {
  closeout: Pick<CommissionCloseout, "ventPhotoIds" | "ventNote" | "ventCompliant">;
  photos: JobPhoto[];
  editing?: boolean;
  onCompliant?: (checked: boolean) => void;
}) {
  const chosen = photosForVentCloseout(photos, closeout.ventPhotoIds);
  const block = editing ? ventComplianceBlock(closeout.ventCompliant) : null;
  return (
    <section className="space-y-3 rounded-md border p-3">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Vent pipes</p>
        {editing ? null : (
          <p className="mt-1 text-sm text-muted-foreground">
            {closeout.ventCompliant
              ? "Accounting marked the vent pipes compliant."
              : "Waiting on accounting to mark the vent pipes compliant."}
          </p>
        )}
      </div>
      {chosen.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {chosen.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-[12px] border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.imageUrl}
                alt={photo.caption.trim() || "Vent pipe photo"}
                className="aspect-[4/3] w-full object-cover"
              />
              {photo.caption.trim() ? (
                <figcaption className="truncate px-2 py-1.5 text-xs">{photo.caption.trim()}</figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : closeout.ventPhotoIds.length > 0 ? (
        <p className="text-sm">The selected vent pipe photos are no longer on the job.</p>
      ) : (
        <p className="text-sm">{closeout.ventNote.trim() || "No vent pipe photos were selected."}</p>
      )}
      {editing && onCompliant ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={closeout.ventCompliant}
            onCheckedChange={(checked) => onCompliant(checked === true)}
            aria-label="Vent pipes are compliant"
          />
          <span>
            Vent pipes are compliant
            {block ? <span className="mt-1 block text-muted-foreground">{block}</span> : null}
          </span>
        </label>
      ) : null}
    </section>
  );
}
