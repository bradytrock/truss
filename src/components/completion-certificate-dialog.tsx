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
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import {
  completionCertificateDraft,
  completionCertificateStatement,
  type CompletionCertificate,
} from "@/lib/completion-certificate";
import { downloadCompletionCertificatePdf } from "@/lib/completion-certificate-pdf";
import { PAPER_INK_HEX, PAPER_MUTED_HEX, PAPER_RED_HEX } from "@/lib/document-paper";
import { PaperSheet } from "@/components/document-paper-chrome";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CompletionCertificateDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const [draft, setDraft] = useState<CompletionCertificate | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    if (draft) setDraft(null);
  } else if (!draft) {
    const estimates = crm.estimates.filter((estimate) => estimate.jobId === job.id);
    const estimateIds = new Set(estimates.map((estimate) => estimate.id));
    setDraft(
      completionCertificateDraft({
        job,
        customerName: crm.customerName(job),
        company: crm.company,
        preparedBy: (crm.effectiveStaff?.name || crm.user.name || "").trim(),
        estimates,
        estimateLines: crm.estimateLines.filter((line) => estimateIds.has(line.estimateId)),
      }),
    );
  }

  function patch(key: keyof CompletionCertificate, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const { blob, name } = await downloadCompletionCertificatePdf({
        certificate: draft,
        company: crm.company,
      });
      const file = new File([blob], name, { type: "application/pdf" });
      const saved = await crm.addJobFiles(job.id, [file]);
      if (saved.length > 0) {
        toast.success("Certificate saved on this job.");
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the certificate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,56rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Certificate of completion</DialogTitle>
          <DialogDescription>
            Filled from this job. Edit anything, then save the PDF on the job and download it.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <PaperSheet>
            <div className="space-y-4 px-4 py-4" style={{ color: PAPER_INK_HEX }}>
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  {crm.company.logoUrl?.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={crm.company.logoUrl}
                      alt=""
                      className="mb-2 h-10 w-auto max-w-[8rem] object-contain object-left"
                    />
                  ) : null}
                  <p className="text-sm font-semibold">{draft.companyName.trim() || crm.company.name}</p>
                  <p className="text-[11px] tracking-[0.14em] uppercase" style={{ color: PAPER_MUTED_HEX }}>
                    {draft.licenseNumber.trim() ? `License ${draft.licenseNumber.trim()}` : "Certificate"}
                  </p>
                </div>
                <p className="text-right text-sm font-bold tracking-wide" style={{ color: PAPER_RED_HEX }}>
                  Certificate of completion
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Property owner">
                  <Input value={draft.ownerName} onChange={(event) => patch("ownerName", event.target.value)} />
                </Field>
                <Field label="Job">
                  <Input value={draft.jobName} onChange={(event) => patch("jobName", event.target.value)} />
                </Field>
                <Field label="Property" className="sm:col-span-2">
                  <Input
                    value={draft.propertyAddress}
                    onChange={(event) => patch("propertyAddress", event.target.value)}
                  />
                </Field>
                <Field label="Job code">
                  <Input value={draft.jobCode} onChange={(event) => patch("jobCode", event.target.value)} />
                </Field>
                <Field label="Contract amount">
                  <Input
                    value={draft.contractAmount}
                    onChange={(event) => patch("contractAmount", event.target.value)}
                    placeholder="$0.00"
                  />
                </Field>
                <Field label="Start">
                  <Input
                    type="date"
                    value={draft.startDate}
                    onChange={(event) => patch("startDate", event.target.value)}
                  />
                </Field>
                <Field label="Completion">
                  <Input
                    type="date"
                    value={draft.completionDate}
                    onChange={(event) => patch("completionDate", event.target.value)}
                  />
                </Field>
                <Field label="Permit">
                  <Input
                    value={draft.permitNumber}
                    onChange={(event) => patch("permitNumber", event.target.value)}
                    placeholder="Permit number"
                  />
                </Field>
                <Field label="Prepared by">
                  <Input value={draft.preparedBy} onChange={(event) => patch("preparedBy", event.target.value)} />
                </Field>
                <Field label="Contractor">
                  <Input value={draft.companyName} onChange={(event) => patch("companyName", event.target.value)} />
                </Field>
                <Field label="License">
                  <Input
                    value={draft.licenseNumber}
                    onChange={(event) => patch("licenseNumber", event.target.value)}
                    placeholder="License number"
                  />
                </Field>
                <Field label="Phone">
                  <Input value={draft.phone} onChange={(event) => patch("phone", event.target.value)} />
                </Field>
                <Field label="Scope of work" className="sm:col-span-2">
                  <Textarea
                    value={draft.scope}
                    onChange={(event) => patch("scope", event.target.value)}
                    placeholder="What was completed on this job"
                    className="min-h-24"
                  />
                </Field>
                <Field label="Materials" className="sm:col-span-2">
                  <Textarea
                    value={draft.materials}
                    onChange={(event) => patch("materials", event.target.value)}
                    placeholder="Manufacturer, product, and underlayment"
                  />
                </Field>
                <Field label="Warranty" className="sm:col-span-2">
                  <Textarea
                    value={draft.warranty}
                    onChange={(event) => patch("warranty", event.target.value)}
                    placeholder="Workmanship and material warranty"
                  />
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  <Textarea
                    value={draft.notes}
                    onChange={(event) => patch("notes", event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="Owner signature">
                  <Input
                    value={draft.ownerSignature}
                    onChange={(event) => patch("ownerSignature", event.target.value)}
                    placeholder="Name as it should print"
                  />
                </Field>
                <Field label="Contractor signature">
                  <Input
                    value={draft.contractorSignature}
                    onChange={(event) => patch("contractorSignature", event.target.value)}
                    placeholder="Name as it should print"
                  />
                </Field>
              </div>
              <p className="text-sm leading-relaxed italic" style={{ color: PAPER_MUTED_HEX }}>
                {completionCertificateStatement(draft)}
              </p>
            </div>
          </PaperSheet>
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
