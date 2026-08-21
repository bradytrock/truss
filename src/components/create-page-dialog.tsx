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
import { PAGE_TEMPLATE_OPTIONS } from "@/lib/photo-report";
import type { PageTemplateId } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CreatePageDialog({
  open,
  onOpenChange,
  pending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onCreate: (template: PageTemplateId) => void | Promise<void>;
}) {
  const [template, setTemplate] = useState<PageTemplateId>("photos");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            Pick a template for this job. You can add photos, notes, and a cover after it opens.
          </DialogDescription>
        </DialogHeader>
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
              void onCreate(template);
            }}
          >
            {pending ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
