"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { PhotoAnnotateEditor } from "@/components/photo-annotate-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrm } from "@/lib/crm-store";
import type { JobPhoto } from "@/lib/types";

export function PhotoViewer({
  photo,
  open,
  onOpenChange,
  title,
  description,
  actions,
}: {
  photo: JobPhoto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const crm = useCrm();
  const [editing, setEditing] = useState(false);

  if (!photo) return null;

  if (editing) {
    return (
      <PhotoAnnotateEditor
        src={photo.imageUrl}
        alt={title || photo.caption || "Job photo"}
        onClose={() => setEditing(false)}
        onSave={async (file) => {
          const ok = await crm.updateJobPhoto(photo.id, { file });
          if (ok) {
            toast.success("Photo updated.");
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEditing(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-3xl" showCloseButton>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.imageUrl}
          alt={title || photo.caption || "Job photo"}
          className="max-h-[70vh] w-full bg-black object-contain"
        />
        <div className="space-y-3 p-5">
          <DialogHeader className="p-0">
            <DialogTitle>{title || photo.caption || "Photo"}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
            {actions}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
