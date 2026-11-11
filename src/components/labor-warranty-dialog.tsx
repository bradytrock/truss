"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCrm } from "@/lib/crm-store";
import { PAPER_INK_HEX, PAPER_MUTED_HEX, PAPER_RED_HEX } from "@/lib/document-paper";
import { formatCompanyAddress, initials } from "@/lib/format";
import {
  laborWarrantyContactLine,
  laborWarrantyDraft,
  laborWarrantyFooterLine,
  laborWarrantySections,
  type LaborWarranty,
} from "@/lib/labor-warranty";
import { downloadLaborWarrantyPdf } from "@/lib/labor-warranty-pdf";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LaborWarrantyDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const [draft, setDraft] = useState<LaborWarranty | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    if (draft) setDraft(null);
  } else if (!draft) {
    const estimates = crm.estimates.filter((estimate) => estimate.jobId === job.id);
    const estimateIds = new Set(estimates.map((estimate) => estimate.id));
    setDraft(
      laborWarrantyDraft({
        job,
        customerName: crm.customerName(job),
        company: crm.company,
        preparedBy: (crm.effectiveStaff?.name || crm.user.name || "").trim(),
        estimates,
        estimateLines: crm.estimateLines.filter((line) => estimateIds.has(line.estimateId)),
        catalog: crm.catalog,
        materialOrders: crm.materialOrders,
        materialOrderLines: crm.materialOrderLines,
      }),
    );
  }

  function patch(key: keyof LaborWarranty, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const { blob, name } = await downloadLaborWarrantyPdf({
        warranty: draft,
        company: crm.company,
      });
      const file = new File([blob], name, { type: "application/pdf" });
      const saved = await crm.addJobFiles(job.id, [file]);
      if (saved.length > 0) {
        toast.success("Warranty saved on this job.");
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the warranty.");
    } finally {
      setBusy(false);
    }
  }

  const companyName = draft?.companyName.trim() || crm.company.name;
  const sections = draft ? laborWarrantySections(companyName) : [];
  const address = formatCompanyAddress(crm.company);
  const contact = laborWarrantyContactLine(crm.company);
  const footer = laborWarrantyFooterLine({ ...crm.company, name: companyName });
  const logoUrl = crm.company.logoUrl?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,56rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lifetime labor & material warranty</DialogTitle>
          <DialogDescription>
            Filled from this job. Edit the blanks, then save the PDF on the job and download it.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <div
            className="overflow-hidden rounded-sm border-[3px] border-neutral-950 bg-white shadow-sm"
            style={{ borderTopColor: PAPER_RED_HEX, color: PAPER_INK_HEX }}
          >
            <div className="space-y-3 px-4 py-4">
              <div className="flex items-start justify-between gap-4 border-b border-neutral-950 pb-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-10 w-auto max-w-12 shrink-0 object-contain object-left" />
                  ) : (
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-md text-xs font-bold text-white"
                      style={{ background: PAPER_RED_HEX }}
                    >
                      {initials(companyName) || "TR"}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{companyName}</p>
                    {address ? (
                      <p className="text-[11px] leading-relaxed" style={{ color: PAPER_MUTED_HEX }}>
                        {address}
                      </p>
                    ) : null}
                    {contact ? (
                      <p className="text-[11px] leading-relaxed" style={{ color: PAPER_MUTED_HEX }}>
                        {contact}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="shrink-0 text-right text-[13px] leading-tight font-bold tracking-wide">
                  LIFETIME LABOR &
                  <br />
                  MATERIAL WARRANTY
                </p>
              </div>
              <div className="rounded-md bg-[#f2f2f2] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Property owner">
                    <Input
                      value={draft.ownerName}
                      onChange={(event) => patch("ownerName", event.target.value)}
                      placeholder="Property owner"
                      className="bg-white text-neutral-950 dark:bg-white"
                    />
                  </Field>
                  <Field label="Shingle type & color">
                    <Input
                      value={draft.shingle}
                      onChange={(event) => patch("shingle", event.target.value)}
                      placeholder="Duration · Onyx Black"
                      className="bg-white text-neutral-950 dark:bg-white"
                    />
                  </Field>
                  <Field label="Install date">
                    <Input
                      type="date"
                      value={draft.installDate}
                      onChange={(event) => patch("installDate", event.target.value)}
                      className="bg-white text-neutral-950 dark:bg-white"
                    />
                  </Field>
                  <Field label="Project manager">
                    <Input
                      value={draft.projectManager}
                      onChange={(event) => patch("projectManager", event.target.value)}
                      placeholder="Project manager"
                      className="bg-white text-neutral-950 dark:bg-white"
                    />
                  </Field>
                </div>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1 text-[11px] leading-snug">
                {sections.map((section) => (
                  <div key={section.number}>
                    <p>
                      <span className="font-semibold">{section.number}.</span> {section.text}
                    </p>
                    {section.items.length > 0 ? (
                      <div className="mt-1 space-y-1 pl-4">
                        {section.items.map((item) => (
                          <p key={item.letter}>
                            <span className="font-semibold">{item.letter}.</span> {item.text}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="grid gap-6 pt-2 sm:grid-cols-2">
                <div>
                  <div className="border-b border-neutral-950 pb-6" />
                  <p className="mt-1.5 text-[11px]" style={{ color: PAPER_MUTED_HEX }}>
                    · {companyName}
                  </p>
                </div>
                <Field label="Signed by">
                  <Input
                    value={draft.signedBy}
                    onChange={(event) => patch("signedBy", event.target.value)}
                    placeholder="Project manager or office"
                    className="bg-white text-neutral-950 italic dark:bg-white"
                  />
                  <span className="text-[11px] leading-snug" style={{ color: PAPER_MUTED_HEX }}>
                    Signed by the company representative (project manager or office).
                  </span>
                </Field>
              </div>
              {footer ? (
                <div
                  className="flex items-start justify-between gap-3 border-t pt-2 text-[10px]"
                  style={{ color: PAPER_MUTED_HEX }}
                >
                  <p>{footer}</p>
                  <p className="shrink-0">Lifetime Labor & Material Warranty</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!draft || busy}>
            {busy ? "Saving…" : "Save and download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-1", className)}>
      <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
