"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { VendorPicker } from "@/components/vendor-picker";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { CATALOG_KIND_LABELS, type CatalogKind, type MaterialOrder } from "@/lib/types";
import { canManageSettings } from "@/lib/visibility";
import { downloadMaterialOrderPdf } from "@/lib/material-order-pdf";
import {
  materialOrderLineAmount,
  materialOrderLinesFor,
  materialOrderTotal,
} from "@/lib/material-orders";
import { vendorChoices } from "@/lib/qb-vendors";
import { documentOwnerStaff, documentProjectManager, letterheadCompanyForRecord } from "@/lib/document-owner";
import { cn } from "@/lib/utils";

export function MaterialOrderWriter({ order }: { order: MaterialOrder }) {
  const crm = useCrm();
  const [bookOpen, setBookOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const job = crm.getJob(order.jobId);
  const lines = materialOrderLinesFor(order.id, crm.materialOrderLines ?? []);
  const total = materialOrderTotal(lines);
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const vendorNames = [...vendors.fromQb.map((item) => item.name), ...vendors.extras];
  const extraVendors = (crm.materialOrders ?? [])
    .map((item) => item.vendor.trim())
    .filter(Boolean);
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
        Build this list by hand. It does not follow the estimate or invoice. Unit costs come from the
        price book when you add a catalog item — upload a pricing sheet under{" "}
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.16em] uppercase">Items</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBookOpen(true)}>
              Add from price book
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void crm.addCustomMaterialOrderLine(order.id)}
            >
              Custom item
            </Button>
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
            No items yet. Pull from the price book so estimated cost prints on the PDF, or add a custom
            line and type the cost.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.id} className="rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <Input
                    value={line.name}
                    onChange={(event) =>
                      void crm.updateMaterialOrderLine(line.id, { name: event.target.value })
                    }
                    placeholder="Item name"
                    className="min-w-0 flex-1"
                    aria-label="Item name"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label="Remove item"
                    onClick={() => void crm.removeMaterialOrderLine(line.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-end gap-2 sm:grid-cols-[auto_7rem_7rem_1fr]">
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">Qty</p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Decrease quantity"
                        onClick={() =>
                          void crm.updateMaterialOrderLine(line.id, {
                            quantity: Math.max(0, Math.round((line.quantity - 1) * 100) / 100),
                          })
                        }
                      >
                        <Minus />
                      </Button>
                      <Input
                        inputMode="decimal"
                        value={String(line.quantity)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next)) return;
                          void crm.updateMaterialOrderLine(line.id, { quantity: next });
                        }}
                        className="h-7 w-14 px-1 text-center tabular-nums"
                        aria-label="Quantity"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label="Increase quantity"
                        onClick={() =>
                          void crm.updateMaterialOrderLine(line.id, {
                            quantity: Math.round((line.quantity + 1) * 100) / 100,
                          })
                        }
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">Unit</p>
                    <Input
                      value={line.unit}
                      onChange={(event) =>
                        void crm.updateMaterialOrderLine(line.id, { unit: event.target.value })
                      }
                      aria-label="Unit"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-muted-foreground">Unit cost</p>
                    <Input
                      inputMode="decimal"
                      value={String(line.unitCost)}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (!Number.isFinite(next)) return;
                        void crm.updateMaterialOrderLine(line.id, { unitCost: next });
                      }}
                      aria-label="Unit cost"
                      className="tabular-nums"
                    />
                  </div>
                  <p className="hidden text-right text-sm font-medium tabular-nums sm:block">
                    {formatMoney(materialOrderLineAmount(line))}
                  </p>
                </div>
                <p className="mt-2 text-right text-sm font-medium tabular-nums sm:hidden">
                  {formatMoney(materialOrderLineAmount(line))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <PriceBookSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        onPick={async (catalogItemId) => {
          const item = crm.catalog.find((entry) => entry.id === catalogItemId);
          const saved = await crm.addMaterialOrderLineFromCatalog(order.id, catalogItemId);
          if (saved) toast.message(`${item?.name ?? "Item"} added`);
        }}
      />
    </div>
  );
}

function PriceBookSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (catalogItemId: string) => void | Promise<void>;
}) {
  const { catalog, viewer } = useCrm();
  const [kindFilter, setKindFilter] = useState<"material" | "all">("material");
  const groups = useMemo(() => {
    const source =
      kindFilter === "material" ? catalog.filter((item) => item.kind === "material") : catalog;
    const kinds = Array.from(new Set(source.map((item) => item.kind))) as CatalogKind[];
    return kinds.map((kind) => ({
      kind,
      items: source.filter((item) => item.kind === kind),
    }));
  }, [catalog, kindFilter]);
  const emptyBook = catalog.length === 0;
  const noMaterials = !emptyBook && kindFilter === "material" && groups.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Price book</SheetTitle>
          <SheetDescription>
            Costs copy onto this order from the catalog. Add as many items as you need, then close the
            book and set quantities.
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-2 px-4 pb-2">
          <Button
            type="button"
            size="sm"
            variant={kindFilter === "material" ? "secondary" : "ghost"}
            onClick={() => setKindFilter("material")}
          >
            Materials
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kindFilter === "all" ? "secondary" : "ghost"}
            onClick={() => setKindFilter("all")}
          >
            Whole book
          </Button>
        </div>
        <Command className="min-h-0 flex-1 border-0 bg-transparent p-0">
          <div className="px-4">
            <CommandInput placeholder="Search the book" />
          </div>
          <CommandList className="max-h-none flex-1 px-2">
            <CommandEmpty>
              {emptyBook
                ? "Price book is empty. A company admin can upload a pricing sheet under Settings → Price book."
                : noMaterials
                  ? "No material items in the book. Switch to Whole book, or upload materials as kind material."
                  : "No items match that search."}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.kind} heading={CATALOG_KIND_LABELS[group.kind]}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.costCode} ${item.name}`}
                    onSelect={() => {
                      void onPick(item.id);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p>{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.costCode} · {item.unit}
                      </p>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{formatMoney(item.unitCost)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <div className="border-t px-4 py-3">
          {viewer && canManageSettings(viewer.role, viewer) ? (
            <Link
              href="/settings/price-book"
              className="text-sm text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              Upload or edit the price book
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              A company admin uploads the pricing sheet under Settings → Price book.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
