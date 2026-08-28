"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { amountForMaterialOrderTemplate } from "@/lib/material-order-templates";
import { useStartMaterialOrder } from "@/lib/start-material-order";

export function MaterialOrderFromTemplateDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const { start, pending } = useStartMaterialOrder();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const templates = useMemo(
    () =>
      [...(crm.materialOrderTemplates ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [crm.materialOrderTemplates],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTemplateId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            Copies items, quantities, unit costs, supplier, and notes onto this job. You can still
            change the list after it opens.
          </DialogDescription>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No company templates yet.{" "}
            <Link
              href="/material-orders/templates"
              className="text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Build one
            </Link>
            , or save an existing order as a template.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {templates.map((template) => {
              const selected = templateId === template.id;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left ${
                      selected ? "border-primary bg-muted/50" : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{template.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {template.description || template.vendor || "No supplier set"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatMoney(
                        amountForMaterialOrderTemplate(
                          template.id,
                          crm.materialOrderTemplateLines ?? [],
                        ),
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !templateId}
            onClick={() => {
              if (!templateId) return;
              void start(jobId, templateId).then(() => onOpenChange(false));
            }}
          >
            {pending ? "Opening…" : "Start order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
