"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Ruler, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";
import {
  EAGLEVIEW_PRODUCTS,
  EAGLEVIEW_STATUS_LABELS,
  eagleviewProductLabel,
  type EagleviewOrder,
  type EagleviewProductId,
} from "@/lib/eagleview";
import { formatDate } from "@/lib/format";

export function JobEagleviewPanel({
  jobId,
  disabled,
}: {
  jobId: string;
  disabled?: boolean;
}) {
  const crm = useCrm();
  const uploadRef = useRef<HTMLInputElement>(null);
  const job = crm.jobs.find((item) => item.id === jobId);
  const orders = useMemo(
    () => (crm.eagleviewOrders ?? []).filter((order) => order.jobId === jobId),
    [crm.eagleviewOrders, jobId],
  );
  const estimates = useMemo(
    () =>
      crm.estimates.filter(
        (estimate) =>
          estimate.jobId === jobId ||
          (job?.opportunityId && estimate.opportunityId === job.opportunityId),
      ),
    [crm.estimates, job?.opportunityId, jobId],
  );

  const [product, setProduct] = useState<EagleviewProductId>("premium_residential");
  const [claimNumber, setClaimNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [applyEstimateId, setApplyEstimateId] = useState("");
  const [includeWaste, setIncludeWaste] = useState(true);
  const [manualSquares, setManualSquares] = useState("");
  const [manualWaste, setManualWaste] = useState("");
  const [showManual, setShowManual] = useState(false);

  async function orderReport() {
    if (!job || disabled) return;
    if (!job.street.trim() || !job.city.trim() || !job.state.trim() || !job.postalCode.trim()) {
      toast.error("Add the full property address on the job first.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/eagleview/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          product,
          claimNumber: claimNumber.trim() || undefined,
          estimateId: applyEstimateId || estimates[0]?.id || null,
        }),
      });
      const raw = await response.text();
      let data: { error?: string; mocked?: boolean; order?: EagleviewOrder } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        toast.error(
          raw.trim()
            ? `Could not order EagleView (${response.status}).`
            : "Could not order EagleView.",
        );
        return;
      }
      if (!response.ok) {
        toast.error(data.error || `Could not order EagleView (${response.status}).`);
        return;
      }
      toast.success(
        data.mocked
          ? "Mock EagleView report ready — PDF attached under Files."
          : "EagleView order submitted.",
      );
      try {
        await crm.reload();
      } catch {
        // Order already saved; refresh can fail without undoing it.
      }
    } catch {
      toast.error("Could not reach Truss to order EagleView.");
    } finally {
      setPending(false);
    }
  }

  async function importReport(file: File | null) {
    if (!file || disabled) return;
    setPending(true);
    try {
      const body = new FormData();
      body.set("jobId", jobId);
      body.set("file", file);
      body.set("product", product);
      if (claimNumber.trim()) body.set("claimNumber", claimNumber.trim());
      const estimateId = applyEstimateId || estimates[0]?.id || "";
      if (estimateId) body.set("estimateId", estimateId);
      if (manualSquares.trim()) body.set("totalSquares", manualSquares.trim());
      if (manualWaste.trim()) body.set("wastePercent", manualWaste.trim());

      const response = await fetch("/api/eagleview/import", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        error?: string;
        needsManualSquares?: boolean;
        order?: EagleviewOrder;
        measurements?: { totalSquares?: number; wastePercent?: number };
      };
      if (!response.ok) {
        if (data.needsManualSquares) {
          setShowManual(true);
          toast.error(data.error || "Enter total squares and try again.");
        } else {
          toast.error(data.error || "Could not import that report.");
        }
        return;
      }
      const squares = data.measurements?.totalSquares;
      toast.success(
        squares != null
          ? `Imported EagleView report — ${squares} squares.`
          : "Imported EagleView report.",
      );
      setShowManual(false);
      setManualSquares("");
      setManualWaste("");
      try {
        await crm.reload();
      } catch {
        /* order saved */
      }
    } catch {
      toast.error("Could not upload that EagleView PDF.");
    } finally {
      setPending(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function syncOrder(orderId: string) {
    setPending(true);
    try {
      const response = await fetch("/api/eagleview/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error || "Could not pull the report.");
        return;
      }
      toast.success("Report measurements updated.");
      await crm.reload();
    } catch {
      toast.error("Could not pull the report.");
    } finally {
      setPending(false);
    }
  }

  async function applyOrder(order: EagleviewOrder) {
    const estimateId = applyEstimateId || estimates[0]?.id || "";
    if (!estimateId) {
      toast.error("Create an estimate on this job first.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/eagleview/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, estimateId, includeWaste }),
      });
      const data = (await response.json()) as { error?: string; quantity?: number };
      if (!response.ok) {
        toast.error(data.error || "Could not apply squares.");
        return;
      }
      toast.success(`Applied ${data.quantity} squares to the estimate.`);
      await crm.reload();
    } catch {
      toast.error("Could not apply squares.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">EagleView</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Order a roof report, upload one you already have, then apply squares to an estimate.
          </p>
        </div>
        <Button nativeButton={false} size="sm" variant="ghost" render={<Link href="/settings/eagleview" />}>
          Settings
        </Button>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`ev-product-${jobId}`}>Product</Label>
            <select
              id={`ev-product-${jobId}`}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              value={product}
              disabled={disabled || pending}
              onChange={(event) => setProduct(event.target.value as EagleviewProductId)}
            >
              {EAGLEVIEW_PRODUCTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ev-claim-${jobId}`}>Claim # (optional)</Label>
            <Input
              id={`ev-claim-${jobId}`}
              value={claimNumber}
              disabled={disabled || pending}
              onChange={(event) => setClaimNumber(event.target.value)}
              placeholder="Insurance claim"
            />
          </div>
        </div>

        {estimates.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ev-estimate-${jobId}`}>Estimate for apply</Label>
            <select
              id={`ev-estimate-${jobId}`}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              value={applyEstimateId || estimates[0]?.id || ""}
              disabled={disabled || pending}
              onChange={(event) => setApplyEstimateId(event.target.value)}
            >
              {estimates.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>
                  {estimate.number || estimate.name || "Estimate"}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add an estimate on this job to apply report squares later.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border"
            checked={includeWaste}
            disabled={disabled || pending}
            onChange={(event) => setIncludeWaste(event.target.checked)}
          />
          Include suggested waste when applying squares
        </label>

        {showManual ? (
          <div className="grid gap-3 rounded-md border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`ev-manual-sq-${jobId}`}>Total squares</Label>
              <Input
                id={`ev-manual-sq-${jobId}`}
                inputMode="decimal"
                value={manualSquares}
                disabled={disabled || pending}
                onChange={(event) => setManualSquares(event.target.value)}
                placeholder="e.g. 24.5"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ev-manual-waste-${jobId}`}>Waste % (optional)</Label>
              <Input
                id={`ev-manual-waste-${jobId}`}
                inputMode="decimal"
                value={manualWaste}
                disabled={disabled || pending}
                onChange={(event) => setManualWaste(event.target.value)}
                placeholder="e.g. 15"
              />
            </div>
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Entered when the PDF could not be read automatically (common for scanned reports).
            </p>
          </div>
        ) : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowManual(true)}
          >
            Enter squares manually for a scanned PDF
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={disabled || pending} onClick={() => void orderReport()}>
            <Ruler data-icon="inline-start" />
            Order report
          </Button>
          <input
            ref={uploadRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => void importReport(event.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || pending}
            onClick={() => uploadRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            Upload existing PDF
          </Button>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No EagleView orders on this job yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {orders.map((order) => {
            const file = order.reportFileId
              ? crm.jobFiles.find((item) => item.id === order.reportFileId)
              : null;
            const imported = order.statusDetail.toLowerCase().includes("imported");
            return (
              <li key={order.id} className="rounded-md border px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {eagleviewProductLabel(order.product)}
                      {order.mocked ? " · Mock" : ""}
                      {imported ? " · Imported" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {EAGLEVIEW_STATUS_LABELS[order.status]}
                      {order.totalSquares != null ? ` · ${order.totalSquares} sq` : ""}
                      {order.wastePercent != null ? ` · ${order.wastePercent}% waste` : ""}
                      {order.pitchSummary ? ` · ${order.pitchSummary}` : ""}
                      {" · "}
                      {formatDate(order.createdAt)}
                    </p>
                    {order.statusDetail ? (
                      <p className="mt-1 text-xs text-muted-foreground">{order.statusDetail}</p>
                    ) : null}
                    {order.appliedAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Applied to estimate {formatDate(order.appliedAt)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {file?.url || order.reportUrl ? (
                      <Button
                        nativeButton={false}
                        size="sm"
                        variant="outline"
                        render={
                          <a href={file?.url || order.reportUrl} target="_blank" rel="noreferrer" />
                        }
                      >
                        <FileText data-icon="inline-start" />
                        PDF
                      </Button>
                    ) : null}
                    {!imported && (order.status !== "ready" || order.totalSquares == null) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled || pending}
                        onClick={() => void syncOrder(order.id)}
                      >
                        Pull report
                      </Button>
                    ) : null}
                    {order.status === "ready" && order.totalSquares != null ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled || pending || estimates.length === 0}
                        onClick={() => void applyOrder(order)}
                      >
                        Apply to estimate
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
