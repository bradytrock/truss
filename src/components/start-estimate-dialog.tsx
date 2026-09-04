"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { useCrm } from "@/lib/crm-store";
import type { EagleviewOrder } from "@/lib/eagleview";
import { amountForTemplate, linesForTemplate } from "@/lib/estimate-templates";
import { formatMoney } from "@/lib/format";
import type { StartEstimateChoices } from "@/lib/start-estimate";
import { JOB_MARKET_LABELS } from "@/lib/types";

const NONE = "__none__";

export function StartEstimateDialog({
  open,
  onOpenChange,
  initialTemplateId,
  measurementOrder,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTemplateId?: string | null;
  measurementOrder: EagleviewOrder | null;
  pending: boolean;
  onConfirm: (choices: StartEstimateChoices) => void | Promise<void>;
}) {
  const crm = useCrm();
  const [templateId, setTemplateId] = useState<string>(NONE);
  const [useMeasurements, setUseMeasurements] = useState(false);

  const templates = useMemo(
    () => [...(crm.estimateTemplates ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [crm.estimateTemplates],
  );

  useEffect(() => {
    if (!open) return;
    const preferred = initialTemplateId?.trim() ?? "";
    const exists = preferred && templates.some((template) => template.id === preferred);
    setTemplateId(exists ? preferred : NONE);
    setUseMeasurements(Boolean(measurementOrder));
  }, [open, initialTemplateId, measurementOrder, templates]);

  const measurementLabel = measurementOrder
    ? [
        measurementOrder.totalSquares != null ? `${measurementOrder.totalSquares} sq` : null,
        measurementOrder.wastePercent != null ? `${measurementOrder.wastePercent}% waste` : null,
        measurementOrder.pitchSummary?.trim() || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New estimate</DialogTitle>
          <DialogDescription>
            Start blank or from a company template. When this job has an EagleView report ready,
            you can fill matching line quantities from those measurements.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Template</p>
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
              <li>
                <button
                  type="button"
                  onClick={() => setTemplateId(NONE)}
                  className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left ${
                    templateId === NONE ? "bg-muted/60" : "hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">No template</span>
                    <span className="block text-xs text-muted-foreground">
                      Blank proposal — add lines from the price book
                    </span>
                  </span>
                </button>
              </li>
              {templates.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No company templates yet.{" "}
                  <Link
                    href="/estimates/templates"
                    className="text-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    Build one
                  </Link>
                  .
                </li>
              ) : (
                templates.map((template) => {
                  const selected = templateId === template.id;
                  const lines = linesForTemplate(crm.estimateTemplateLines ?? [], template.id);
                  return (
                    <li key={template.id}>
                      <button
                        type="button"
                        onClick={() => setTemplateId(template.id)}
                        className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left ${
                          selected ? "bg-muted/60" : "hover:bg-muted/40"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium">{template.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {template.description || JOB_MARKET_LABELS[template.market]}
                            {lines.length
                              ? ` · ${lines.length} ${lines.length === 1 ? "line" : "lines"}`
                              : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {formatMoney(amountForTemplate(template, lines))}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="rounded-md border px-3 py-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={useMeasurements}
                disabled={!measurementOrder || pending}
                onCheckedChange={(value) => setUseMeasurements(Boolean(value))}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Use EagleView measurements</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {measurementOrder
                    ? `Apply squares and lengths from the ready report${measurementLabel ? ` (${measurementLabel})` : ""} onto matching line titles (shingles, ridge, hip, valley, etc.).`
                    : "Available when this estimate is tied to a job with a ready EagleView report."}
                </span>
                {useMeasurements && templateId === NONE && measurementOrder ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Pick a template with coverage and length lines, or add those lines after create and apply from the job’s EagleView panel.
                  </span>
                ) : null}
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              void onConfirm({
                templateId: templateId === NONE ? null : templateId,
                useMeasurements: Boolean(useMeasurements && measurementOrder),
              })
            }
          >
            {pending ? "Creating…" : "Create estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
