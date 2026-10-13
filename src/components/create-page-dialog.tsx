"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  layoutCapacity,
  PAGE_TEMPLATE_OPTIONS,
  photoPageColumns,
  photoPageRows,
  templateIncludesPhotos,
} from "@/lib/photo-report";
import { PHOTO_PAGE_LAYOUT_LABELS, PHOTO_PAGE_LAYOUTS, type PageTemplateId, type PhotoPageLayout } from "@/lib/types";
import { cn } from "@/lib/utils";

const LAYOUT_HINTS: Record<PhotoPageLayout, string> = {
  one: "One large photo",
  two: "Two photos, stacked",
  four: "Numbered 2×2 sheet",
};

export function CreatePageDialog({
  open,
  onOpenChange,
  pending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onCreate: (template: PageTemplateId, photoLayout: PhotoPageLayout) => void | Promise<void>;
}) {
  const [template, setTemplate] = useState<PageTemplateId>("photos");
  const [photoLayout, setPhotoLayout] = useState<PhotoPageLayout>("four");
  const showLayout = templateIncludesPhotos(template);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            Pick a template for this job. Photo pages can start as a numbered four-photo sheet.
          </DialogDescription>
        </DialogHeader>
        {showLayout ? (
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Photos per page</legend>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Four photos keeps each sheet aligned: a number, a caption, and the same frame on every shot.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {PHOTO_PAGE_LAYOUTS.map((layout) => {
                const selected = photoLayout === layout;
                return (
                  <button
                    key={layout}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPhotoLayout(layout)}
                    className={cn(
                      "rounded-md border px-2 py-2 text-left",
                      selected ? "border-primary bg-primary/8" : "hover:bg-muted/60",
                    )}
                  >
                    <LayoutGlyph layout={layout} selected={selected} />
                    <span className="mt-1.5 block text-xs font-medium">{PHOTO_PAGE_LAYOUT_LABELS[layout]}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                      {LAYOUT_HINTS[layout]}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <ul className="grid gap-2">
          {PAGE_TEMPLATE_OPTIONS.map((option) => {
            const selected = template === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => setTemplate(option.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2.5 text-left",
                    selected ? "border-primary bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              void onCreate(template, photoLayout);
            }}
          >
            {pending ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LayoutGlyph({ layout, selected }: { layout: PhotoPageLayout; selected: boolean }) {
  const count = layoutCapacity(layout);
  const cols = photoPageColumns(layout);
  const rows = photoPageRows(layout);
  return (
    <span
      className={cn(
        "grid h-14 w-full gap-1 rounded-sm border bg-background p-1.5",
        selected ? "border-primary" : "border-border",
      )}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={cn("rounded-[2px]", selected ? "bg-primary/30" : "bg-muted")} />
      ))}
    </span>
  );
}
