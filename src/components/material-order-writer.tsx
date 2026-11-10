"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Ellipsis, FileText, MapPin } from "lucide-react";
import { toast } from "sonner";
import { MaterialOrderBoard } from "@/components/material-order-board";
import { PaperArchivedBanner } from "@/components/paper-archive-button";
import { VendorPicker } from "@/components/vendor-picker";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { documentOwnerStaff, letterheadCompanyForRecord } from "@/lib/document-owner";
import { formatMoney, formatPhone } from "@/lib/format";
import { jobAddress, jobPaperHref } from "@/lib/job-record";
import { buildMaterialOrderPdf, previewMaterialOrderPdf } from "@/lib/material-order-pdf";
import { downloadBlob } from "@/lib/share";
import {
  MATERIAL_ORDER_QUICK_NOTES,
  materialOrderBranchLine,
  materialOrderItemSummary,
  materialOrderStatusLabel,
  materialOrderWhenLabel,
  materialOrderWindowLabel,
  presentMaterialLine,
  supplierShortName,
} from "@/lib/material-order-presentation";
import { materialOrderLinesFor, materialOrderTotal } from "@/lib/material-orders";
import { materialOrderTemplateLinesFor } from "@/lib/material-order-templates";
import { currentCatalog } from "@/lib/price-lists";
import { archiveStamp } from "@/lib/paper-archive";
import type { MaterialOrder, MaterialOrderStatus, MaterialOrderWindow, QbVendor } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { vendorChoices } from "@/lib/qb-vendors";
import { cn } from "@/lib/utils";

const STEPS: MaterialOrderStatus[] = ["draft", "sent", "confirmed", "delivered"];

export function MaterialOrderWriter({ order }: { order: MaterialOrder }) {
  const crm = useCrm();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [pending, setPending] = useState(false);
  const job = crm.getJob(order.jobId);
  const lines = materialOrderLinesFor(order.id, crm.materialOrderLines ?? []);
  const catalogById = useMemo(() => new Map(crm.catalog.map((item) => [item.id, item])), [crm.catalog]);
  const presented = useMemo(
    () =>
      lines.map((line) =>
        presentMaterialLine(line, line.catalogItemId ? catalogById.get(line.catalogItemId) : null),
      ),
    [catalogById, lines],
  );
  const total = materialOrderTotal(lines);
  const namedLines = presented.filter((line) => line.name.trim());
  const itemSummary = materialOrderItemSummary(presented);
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
  const owner = documentOwnerStaff({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
  });
  const orderedBy = owner?.name || crm.user.name;
  const orderedByEmail = owner?.email?.trim() || crm.effectiveStaff?.email?.trim() || letterhead.email || "";
  const orderedByPhone = shownPhone(owner?.phone?.trim() || crm.effectiveStaff?.phone?.trim() || letterhead.phone);
  const shortName = supplierShortName(order.vendor);
  const locked = order.status !== "draft";
  const address = job ? jobAddress(job) : "";
  const when = materialOrderWhenLabel({
    neededBy: order.neededBy,
    window: order.window,
    fulfillment: order.fulfillment,
  });
  const deliveryReady = Boolean(order.neededBy);
  const supplierReady = Boolean(order.vendor.trim());
  const priceBook = useMemo(
    () => currentCatalog(crm.catalog, crm.priceLists ?? []),
    [crm.catalog, crm.priceLists],
  );
  const templates = useMemo(
    () =>
      [...(crm.materialOrderTemplates ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((template) => {
          const count = materialOrderTemplateLinesFor(template.id, crm.materialOrderTemplateLines ?? []).length;
          const detail = [count === 1 ? "1 item" : `${count} items`, template.description.trim() || template.vendor.trim()]
            .filter(Boolean)
            .join(" · ");
          return { id: template.id, name: template.name, detail: detail || "Saved list" };
        }),
    [crm.materialOrderTemplateLines, crm.materialOrderTemplates],
  );
  const supplierEmail = emailForVendor(order.vendor, crm.qbVendors ?? []);
  const stepIndex = Math.max(0, STEPS.indexOf(order.status));

  function pdfInput() {
    return {
      order,
      lines: presented,
      job,
      company: letterhead,
      orderedBy,
      orderedByPhone,
      orderedByEmail,
    };
  }

  async function previewPdf() {
    setPdfBusy(true);
    try {
      await previewMaterialOrderPdf(pdfInput());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const blob = await buildMaterialOrderPdf(pdfInput());
      downloadBlob(blob, `${order.number}-material-order.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function sendOrder() {
    if (namedLines.length === 0) {
      toast.error("Add at least one item before sending.");
      return;
    }
    if (!order.vendor.trim()) {
      toast.error("Choose a supplier before sending.");
      return;
    }
    if (!supplierEmail) {
      toast.error(`Add an email for ${order.vendor} before sending the PDF.`);
      return;
    }
    if (!looksLikeEmail(orderedByEmail)) {
      toast.error("Add an email on your profile. Replies from the supplier go to that address.");
      return;
    }
    setSendBusy(true);
    try {
      const blob = await buildMaterialOrderPdf(pdfInput());
      const pdf = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      const subject = `${order.number} material order`;
      const text = [
        `${orderedBy} sent material order ${order.number}${job?.name ? ` for ${job.name}` : ""}.`,
        address ? `Ship to ${address}.` : "",
        deliveryReady ? `${order.fulfillment === "pickup" ? "Will-call" : "Deliver"} ${when}.` : "",
        "The PDF is attached.",
      ]
        .filter(Boolean)
        .join("\n");
      const response = await fetch("/api/material-orders/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: supplierEmail,
          subject,
          text,
          html: `<p>${escapeHtml(text).replaceAll("\n", "<br />")}</p>`,
          senderName: orderedBy,
          companyName: letterhead.name,
          replyTo: orderedByEmail,
          filename: `${order.number}.pdf`,
          pdf,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; mocked?: boolean } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not email the supplier.");
      }
      const saved = await crm.updateMaterialOrder(order.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
      });
      if (!saved) return;
      await crm.addActivity({
        entityType: "job",
        entityId: order.jobId,
        type: "email",
        body: `Emailed ${order.vendor} ${order.number} with the material order PDF (${formatMoney(total)}).`,
      });
      toast.success(
        payload?.mocked
          ? `Marked sent. Email is not connected, so ${shortName} did not receive the PDF.`
          : `Emailed ${shortName} the PDF.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the material order.");
    } finally {
      setSendBusy(false);
    }
  }

  function chooseVendor(value: string) {
    const match = (crm.qbVendors ?? []).find((item) => item.name.trim().toLowerCase() === value.trim().toLowerCase());
    void crm.updateMaterialOrder(order.id, {
      vendor: value,
      branch: match ? [match.city, match.state].filter(Boolean).join(", ") : "",
      accountNumber: match?.accountNumber?.trim() ?? "",
    });
  }

  function toggleQuickNote(note: string) {
    const quickNotes = order.quickNotes.includes(note)
      ? order.quickNotes.filter((item) => item !== note)
      : [...order.quickNotes, note];
    void crm.updateMaterialOrder(order.id, { quickNotes });
  }

  async function archiveOrder() {
    if (order.archivedAt) {
      await crm.updateMaterialOrder(order.id, { archivedAt: null });
      toast.success(`${order.number} is back on the job.`);
      return;
    }
    if (!window.confirm(`Archive ${order.number}? It leaves this job’s Paper list. You can restore it later.`)) return;
    await crm.updateMaterialOrder(order.id, { archivedAt: archiveStamp() });
    toast.success(`${order.number} is archived.`);
  }

  const sendHelper = namedLines.length === 0
    ? "Add at least one item to send."
    : !supplierReady
      ? "Choose a supplier to send."
      : `Emails ${shortName} the PDF and logs it on the job.`;

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href={jobPaperHref(order.jobId)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {job ? (
              <>
                {job.name}
                {job.code ? <span className="text-muted-foreground/80"> · {job.code}</span> : null}
              </>
            ) : (
              "Back to job"
            )}
          </Link>
          <p className="mt-3 text-xs tracking-wide text-muted-foreground">{order.number}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-heading text-4xl leading-none font-medium">
            Material order
            <span className="inline-flex items-center gap-2 font-sans text-base font-medium text-muted-foreground">
              <span
                className={cn(
                  "size-2 rounded-full",
                  order.status === "draft" ? "bg-primary" : "bg-emerald-600",
                )}
              />
              {materialOrderStatusLabel(order.status)}
            </span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[address || customer || "Add a job-site address on the job.", orderedBy ? `Ordered by ${orderedBy}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg bg-card"
            disabled={pdfBusy}
            onClick={() => void (locked ? downloadPdf() : previewPdf())}
          >
            <FileText data-icon="inline-start" />
            {locked ? "Download PDF" : "Preview PDF"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex size-9 items-center justify-center rounded-lg border bg-card text-foreground hover:bg-muted"
              aria-label="More actions"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={lines.length === 0}
                onClick={() => {
                  setTemplateName(job?.name ? `${job.name} materials` : `${order.number} template`);
                  setSaveOpen(true);
                }}
              >
                Save as template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void archiveOrder()}>
                {order.archivedAt ? "Restore" : "Archive"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {locked ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-lg bg-card"
              onClick={() => void crm.updateMaterialOrder(order.id, { status: "draft", sentAt: null })}
            >
              Edit order
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-lg disabled:bg-[#e7a8ad] disabled:text-white disabled:opacity-100"
              disabled={sendBusy || namedLines.length === 0 || !supplierReady}
              onClick={() => void sendOrder()}
            >
              Send to {shortName}
              <ArrowRight data-icon="inline-end" />
            </Button>
          )}
        </div>
      </div>

      {order.archivedAt ? <PaperArchivedBanner label={order.number} /> : null}

      <ol className="flex flex-wrap items-center gap-y-2">
        {STEPS.map((step, index) => {
          const reached = index <= stepIndex;
          const current = index === stepIndex;
          const interactive = !locked ? false : step === "confirmed" || step === "delivered";
          return (
            <li key={step} className="flex items-center">
              <button
                type="button"
                disabled={!interactive}
                aria-current={current ? "step" : undefined}
                onClick={() => {
                  if (step === "confirmed" || step === "delivered") {
                    void crm.updateMaterialOrder(order.id, { status: step });
                  }
                }}
                className={cn("inline-flex items-center gap-2 text-sm", !interactive && "cursor-default")}
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full border-2",
                    reached ? "border-primary bg-primary" : "border-neutral-300 bg-card dark:border-neutral-600",
                  )}
                />
                <span className={cn(reached ? "text-foreground" : "text-muted-foreground")}>
                  {materialOrderStatusLabel(step)}
                </span>
              </button>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "mx-3 h-px w-10 sm:w-16",
                    index < stepIndex ? "bg-primary" : "bg-neutral-200 dark:bg-neutral-700",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {order.status === "sent" ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>
            Sent to {order.vendor.trim() || shortName} with the PDF attached. Waiting on their confirmation —
            editing reopens it as a draft and resends.
          </p>
        </div>
      ) : null}
      {order.status === "confirmed" ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>{order.vendor.trim() || "The supplier"} confirmed this order. Mark it delivered when it lands.</p>
        </div>
      ) : null}
      {order.status === "delivered" ? (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>Delivered. Editing reopens it as a draft.</p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <MaterialOrderBoard
            lines={presented}
            locked={locked}
            supplierName={shortName}
            total={total}
            templates={templates}
            catalog={priceBook}
            canManagePriceBook={Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer))}
            onAddFromCatalog={(catalogItemId) => crm.addMaterialOrderLineFromCatalog(order.id, catalogItemId)}
            onAddCustom={() => void crm.addCustomMaterialOrderLine(order.id)}
            onApplyTemplate={async (templateId) => {
              const added = await crm.applyMaterialOrderTemplate(order.id, templateId);
              const template = templates.find((item) => item.id === templateId);
              if (added.length) toast.success(`${template?.name ?? "Template"} added to this order.`);
            }}
            onUpdate={(id, patch) => void crm.updateMaterialOrderLine(id, patch)}
            onRemove={(id) => void crm.removeMaterialOrderLine(id)}
          />

          <section className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <h2 className="text-base font-semibold">Notes for the supplier</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tap the common ones — they print at the top of the PDF.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MATERIAL_ORDER_QUICK_NOTES.map((note) => {
                const selected = order.quickNotes.includes(note);
                return (
                  <button
                    key={note}
                    type="button"
                    disabled={locked}
                    aria-pressed={selected}
                    onClick={() => toggleQuickNote(note)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-muted",
                      locked && "opacity-70",
                    )}
                  >
                    {note}
                  </button>
                );
              })}
            </div>
            <Label htmlFor="mo-notes" className="mt-4 block text-sm font-medium">
              Anything else
            </Label>
            <Textarea
              id="mo-notes"
              rows={3}
              disabled={locked}
              value={order.notes}
              onChange={(event) => void crm.updateMaterialOrder(order.id, { notes: event.target.value })}
              placeholder="Color confirmation, gate code, where to stage on the lot..."
              className="mt-2 min-h-20 rounded-lg"
            />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Estimated material cost
            </p>
            <p className="mt-1 font-heading text-4xl tabular-nums">{formatMoney(total)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Before tax and delivery — {supplierReady ? shortName : "the supplier"} adds those on their invoice.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <CheckRow ready={supplierReady} label="Supplier" value={supplierReady ? shortName : "Choose one"} />
              <CheckRow
                ready={deliveryReady}
                label={order.fulfillment === "pickup" ? "Will-call" : "Delivery"}
                value={when}
              />
              <CheckRow ready={itemSummary.ready} label="Items" value={itemSummary.label} />
            </ul>
            {locked ? (
              <p className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
                {order.status === "delivered"
                  ? "Delivered"
                  : order.status === "confirmed"
                    ? `Confirmed with ${shortName}`
                    : `Sent · emailed to ${shortName} with the PDF`}
              </p>
            ) : (
              <>
                <Button
                  type="button"
                  className="mt-4 h-10 w-full rounded-lg disabled:bg-[#e7a8ad] disabled:text-white disabled:opacity-100"
                  disabled={sendBusy || namedLines.length === 0 || !supplierReady}
                  onClick={() => void sendOrder()}
                >
                  Send to {shortName}
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">{sendHelper}</p>
              </>
            )}
          </section>

          <section className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <h2 className="text-base font-semibold">Supplier</h2>
            <Label className="mt-3 block text-sm text-muted-foreground">Order from</Label>
            <div className="mt-1.5">
              <VendorPicker
                value={order.vendor}
                disabled={locked}
                className="h-10 rounded-lg bg-card"
                onChange={chooseVendor}
                names={vendorNames}
                extraNames={extraVendors}
                placeholder="Choose a supplier"
                emptyHint="Type a supplier if they are not in QuickBooks yet."
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {materialOrderBranchLine(order.branch, order.accountNumber)}
            </p>
          </section>

          <section className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <h2 className="text-base font-semibold">Getting it to the job</h2>
            <div className="mt-3 grid grid-cols-2 rounded-lg bg-muted p-1">
              {(
                [
                  ["delivery", "Delivery"],
                  ["pickup", "Will-call pickup"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={locked}
                  aria-pressed={order.fulfillment === value}
                  onClick={() => void crm.updateMaterialOrder(order.id, { fulfillment: value })}
                  className={cn(
                    "h-8 rounded-md text-sm",
                    order.fulfillment === value ? "bg-card font-medium shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Label htmlFor="mo-needed" className="mt-4 block text-sm text-muted-foreground">
              {order.fulfillment === "pickup" ? "Pick up on" : "Deliver on"}
            </Label>
            <Input
              id="mo-needed"
              type="date"
              disabled={locked}
              value={order.neededBy ?? ""}
              onChange={(event) =>
                void crm.updateMaterialOrder(order.id, { neededBy: event.target.value || null })
              }
              className="mt-1.5 h-10 rounded-lg"
            />
            <p className="mt-4 text-sm text-muted-foreground">Window</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["morning", "afternoon", "anytime"] as MaterialOrderWindow[]).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  disabled={locked}
                  aria-pressed={order.window === slot}
                  onClick={() => void crm.updateMaterialOrder(order.id, { window: slot })}
                  className={cn(
                    "h-8 rounded-lg px-3 text-sm",
                    order.window === slot
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground hover:bg-muted/80",
                  )}
                >
                  {materialOrderWindowLabel(slot)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {order.fulfillment === "pickup" ? "Will-call at the supplier" : "Ship to the job"}
                </p>
                <p className="text-muted-foreground">
                  {order.fulfillment === "pickup"
                    ? order.vendor.trim() || "Choose a supplier"
                    : address || "Add a job-site address on the job."}
                </p>
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <Checkbox
                checked={order.onCalendar}
                disabled={locked}
                onCheckedChange={(checked) =>
                  void crm.updateMaterialOrder(order.id, { onCalendar: checked === true })
                }
                aria-label="Put it on the production calendar"
              />
              Put it on the production calendar
            </label>
          </section>

          <div className="px-1 text-xs">
            <p className="font-semibold tracking-[0.14em] text-muted-foreground uppercase">Supplier contacts</p>
            <p className="mt-2 text-sm text-foreground">
              {orderedBy}
              {orderedByPhone ? ` · ${orderedByPhone}` : ""}
            </p>
            {orderedByEmail ? <p className="text-sm text-muted-foreground">{orderedByEmail}</p> : null}
          </div>
        </aside>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as company template</DialogTitle>
            <DialogDescription>
              Supplier, notes, items, quantities, and unit costs are copied. The next job can start from this
              instead of a blank order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="mo-template-name">Template name</Label>
            <Input
              id="mo-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Full reroof · 30 sq"
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

function CheckRow({ ready, label, value }: { ready: boolean; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        {ready ? (
          <Check className="size-4 text-emerald-600" />
        ) : (
          <CircleAlert className="size-4 text-amber-500" />
        )}
        {label}
      </span>
      <span className={cn("text-right", ready ? "text-foreground" : "text-amber-700 dark:text-amber-300")}>{value}</span>
    </li>
  );
}

function shownPhone(value: string | undefined) {
  const formatted = formatPhone(value);
  return formatted === "—" ? "" : formatted;
}

function emailForVendor(vendor: string, vendors: QbVendor[]) {
  const key = vendor.trim().toLowerCase();
  if (!key) return "";
  return vendors.find((item) => item.name.trim().toLowerCase() === key)?.email.trim() ?? "";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
