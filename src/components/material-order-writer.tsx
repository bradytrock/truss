"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VendorPicker } from "@/components/vendor-picker";
import { MaterialOrderItems } from "@/components/material-order-items";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import type { MaterialOrder } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { downloadMaterialOrderPdf } from "@/lib/material-order-pdf";
import { materialOrderLinesFor, materialOrderTotal } from "@/lib/material-orders";
import { vendorChoices } from "@/lib/qb-vendors";
import { documentOwnerStaff, documentProjectManager, letterheadCompanyForRecord } from "@/lib/document-owner";
import { cn } from "@/lib/utils";

export function MaterialOrderWriter({ order }: { order: MaterialOrder }) {
  const crm = useCrm();
  const router = useRouter();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [pending, setPending] = useState(false);
  const job = crm.getJob(order.jobId);
  const lines = materialOrderLinesFor(order.id, crm.materialOrderLines ?? []);
  const total = materialOrderTotal(lines);
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const vendorNames = [...vendors.fromQb.map((item) => item.name), ...vendors.extras];
  const extraVendors = [
    ...(crm.materialOrders ?? []).map((item) => item.vendor.trim()),
    ...(crm.materialOrderTemplates ?? []).map((item) => item.vendor.trim()),
  ].filter(Boolean);
  const customer = job ? crm.customerName(job) : "";
  const opportunity = job?.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const letterhead = letterheadCompanyForRecord({
    company: crm.company,
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    inBook: true,
  });
  const projectManager = documentProjectManager({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    companyPhone: letterhead.phone,
  });
  const orderedBy =
    documentOwnerStaff({
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
    })?.name || crm.user.name;

  async function downloadPdf() {
    if (lines.length === 0) {
      toast.error("Add at least one item before generating a PDF.");
      return;
    }
    setPdfBusy(true);
    try {
      await downloadMaterialOrderPdf({
        order,
        lines,
        job,
        company: letterhead,
        customer,
        orderedBy,
        projectManager,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-28 sm:pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {order.number}
          </p>
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
            Material order
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {job ? (
              <Link href={`/jobs?job=${job.id}`} className="hover:underline">
                {job.code ? `${job.code} · ` : ""}
                {job.name}
              </Link>
            ) : (
              "This job is no longer in your book."
            )}
          </p>
          {job ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {jobAddress(job) || customer || "Add a job-site address on the job."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            type="button"
            variant="outline"
            render={<Link href="/material-orders/templates" />}
          >
            Templates
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={lines.length === 0}
            onClick={() => {
              setTemplateName(job?.name ? `${job.name} materials` : `${order.number} template`);
              setSaveOpen(true);
            }}
          >
            Save as template
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pdfBusy || lines.length === 0}
            onClick={() => void downloadPdf()}
          >
            <Download />
            PDF
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Build this list by hand, or start from a company template. It does not follow the estimate or
        invoice. Unit costs come from the price book when you add a catalog item — upload a pricing
        sheet under{" "}
        {crm.viewer && canManageSettings(crm.viewer.role, crm.viewer) ? (
          <Link href="/settings/price-book" className="text-primary hover:underline">
            Settings → Price book
          </Link>
        ) : (
          "Settings → Price book"
        )}
        .
      </p>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Supplier</Label>
          <VendorPicker
            value={order.vendor}
            onChange={(value) => void crm.updateMaterialOrder(order.id, { vendor: value })}
            names={vendorNames}
            extraNames={extraVendors}
            emptyHint="Type a supplier if they are not in QuickBooks yet."
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="mo-needed">Needed by</Label>
          <Input
            id="mo-needed"
            type="date"
            value={order.neededBy ?? ""}
            onChange={(event) =>
              void crm.updateMaterialOrder(order.id, { neededBy: event.target.value || null })
            }
          />
        </div>
      </section>

      <MaterialOrderItems
        lines={lines}
        emptyHint="No items yet. Pull from the price book so estimated cost prints on the PDF, start from a template, or add a custom line and type the cost."
        onAddFromCatalog={(catalogItemId) => crm.addMaterialOrderLineFromCatalog(order.id, catalogItemId)}
        onAddCustom={() => void crm.addCustomMaterialOrderLine(order.id)}
        onUpdate={(id, patch) => void crm.updateMaterialOrderLine(id, patch)}
        onRemove={(id) => void crm.removeMaterialOrderLine(id)}
      />

      <section className="grid gap-1.5">
        <Label htmlFor="mo-notes">Notes for the supplier</Label>
        <Textarea
          id="mo-notes"
          rows={3}
          value={order.notes}
          onChange={(event) => void crm.updateMaterialOrder(order.id, { notes: event.target.value })}
          placeholder="Will-call vs delivery, color, staging notes…"
        />
      </section>

      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3",
          "fixed inset-x-3 bottom-3 z-20 shadow-md sm:static sm:shadow-none",
        )}
      >
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Estimated material cost
          </p>
          <p className="font-heading text-xl tabular-nums">{formatMoney(total)}</p>
        </div>
        <Button
          type="button"
          disabled={pdfBusy || lines.length === 0}
          onClick={() => void downloadPdf()}
        >
          <Download />
          PDF
        </Button>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as company template</DialogTitle>
            <DialogDescription>
              Supplier, notes, items, quantities, and unit costs are copied. The next job can start from
              this instead of a blank order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="mo-template-name">Template name</Label>
            <Input
              id="mo-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Hail roof — architectural shingles"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !templateName.trim()}
              onClick={() => {
                setPending(true);
                void crm
                  .saveMaterialOrderAsTemplate(order.id, templateName.trim())
                  .then((template) => {
                    toast.success(`${template.name} is in company templates.`);
                    setSaveOpen(false);
                    router.push(`/material-orders/templates/${template.id}`);
                  })
                  .finally(() => setPending(false));
              }}
            >
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
