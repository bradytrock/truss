"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Ruler, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCrm } from "@/lib/crm-store";
import { amountForEstimate } from "@/lib/estimate-totals";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { workMarket } from "@/lib/market";
import {
  EAGLEVIEW_PRODUCTS,
  EAGLEVIEW_STATUS_LABELS,
  eagleviewProductLabel,
  type EagleviewOrder,
  type EagleviewProductId,
} from "@/lib/eagleview";
export function JobEagleviewPanel({
  jobId,
  disabled,
  embedded = false,
}: {
  jobId: string;
  disabled?: boolean;
  embedded?: boolean;
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
    [crm.estimates, job, jobId],
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
      const data = (await response.json()) as {
        error?: string;
        quantity?: number;
        updatedLineIds?: string[];
      };
      if (!response.ok) {
        toast.error(data.error || "Could not apply squares.");
        return;
      }
      const lineCount = data.updatedLineIds?.length ?? 0;
      toast.success(
        lineCount > 1
          ? `Applied EagleView measurements to ${lineCount} estimate lines.`
          : `Applied ${data.quantity} squares to the estimate.`,
      );
      await crm.reload();
    } catch {
      toast.error("Could not apply squares.");
    } finally {
      setPending(false);
    }
  }

  const opportunity = job?.opportunityId
    ? crm.opportunities.find((item) => item.id === job.opportunityId)
    : undefined;
  const selectedEstimateId = applyEstimateId || estimates[0]?.id || "";

  function estimateOptionLabel(estimate: (typeof estimates)[number]) {
    const name = estimate.number || estimate.name || "Estimate";
    if (!job) return name;
    const total = formatCurrencyFull(
      amountForEstimate(estimate, crm.estimateLines, workMarket(job, opportunity)),
    );
    return `${name} · ${total}`;
  }

  if (embedded) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <FileText className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">EagleView report</p>
            <p className="text-sm text-muted-foreground">
              Ridges, hips, valleys, rakes, eaves, drip edge and flashing save on the job.
            </p>
          </div>
          <p className="shrink-0 text-sm text-muted-foreground">
            {orders.length === 0 ? "No orders yet" : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="mt-3 grid gap-3 rounded-[12px] border bg-muted/20 p-3 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Product</span>
            <select
              id={`ev-product-${jobId}`}
              className="flex h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm"
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
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Apply to estimate</span>
            <select
              id={`ev-estimate-${jobId}`}
              className="flex h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm"
              value={selectedEstimateId}
              disabled={disabled || pending || estimates.length === 0}
              onChange={(event) => setApplyEstimateId(event.target.value)}
            >
              {estimates.length === 0 ? <option value="">No estimate yet</option> : null}
              {estimates.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>
                  {estimateOptionLabel(estimate)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Claim # (optional)</span>
            <Input
              id={`ev-claim-${jobId}`}
              value={claimNumber}
              disabled={disabled || pending}
              onChange={(event) => setClaimNumber(event.target.value)}
              placeholder="Insurance claim"
              className="h-9 bg-card"
            />
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox
            checked={includeWaste}
            disabled={disabled || pending}
            onCheckedChange={(value) => setIncludeWaste(value === true)}
          />
          Include suggested waste when applying squares
        </label>

        {showManual ? (
          <div className="mt-3 grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-2">
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
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowManual((value) => !value)}
          >
            Scanned PDF? Enter squares by hand after upload.
          </button>
          <div className="flex flex-wrap gap-2">
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
              className="bg-card"
              disabled={disabled || pending}
              onClick={() => uploadRef.current?.click()}
            >
              <Upload data-icon="inline-start" />
              Upload existing PDF
            </Button>
            <Button type="button" size="sm" disabled={disabled || pending} onClick={() => void orderReport()}>
              Order report
            </Button>
          </div>
        </div>

        {orders.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {orders.map((order) => {
              const file = order.reportFileId
                ? crm.jobFiles.find((item) => item.id === order.reportFileId)
                : null;
              const imported = order.statusDetail.toLowerCase().includes("imported");
              return (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {eagleviewProductLabel(order.product)}
                      {order.totalSquares != null ? ` · ${order.totalSquares} sq` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {EAGLEVIEW_STATUS_LABELS[order.status]} · {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {file?.url || order.reportUrl ? (
                      <Button
                        nativeButton={false}
                        size="sm"
                        variant="outline"
                        render={<a href={file?.url || order.reportUrl} target="_blank" rel="noreferrer" />}
                      >
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
                        Apply
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">EagleView</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Order a roof report or upload one you already have. Report Summary lengths
            (ridges, hips, valleys, rakes, eaves, drip edge, flashing) save on the job
            for the estimate.
          </p>
        </div>
        <Button nativeButton={false} size="sm" variant="ghost" render={<Link href="/settings/integrations/eagleview" />}>
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
                    {order.status === "ready" ? <MeasurementSummary order={order} /> : null}
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

function MeasurementSummary({ order }: { order: EagleviewOrder }) {
  const m = order.measurements ?? {};
  const candidates: Array<[string, string]> = [
    ["Squares", m.totalSquares != null ? String(m.totalSquares) : order.totalSquares != null ? String(order.totalSquares) : ""],
    ["Suggested sq", m.suggestedSquares != null ? String(m.suggestedSquares) : ""],
    ["Waste", m.wastePercent != null ? `${m.wastePercent}%` : order.wastePercent != null ? `${order.wastePercent}%` : ""],
    ["Pitch", m.pitchSummary || order.pitchSummary || ""],
    ["Ridges", m.ridgesLf != null ? `${m.ridgesLf} LF` : ""],
    ["Hips", m.hipsLf != null ? `${m.hipsLf} LF` : ""],
    ["Valleys", m.valleysLf != null ? `${m.valleysLf} LF` : ""],
    ["Rakes", m.rakesLf != null ? `${m.rakesLf} LF` : ""],
    ["Eaves / starter", m.eavesLf != null ? `${m.eavesLf} LF` : ""],
    ["Drip edge", m.dripEdgeLf != null ? `${m.dripEdgeLf} LF` : ""],
    ["Parapets", m.parapetWallsLf != null ? `${m.parapetWallsLf} LF` : ""],
    ["Flashing", m.flashingLf != null ? `${m.flashingLf} LF` : ""],
    ["Step flashing", m.stepFlashingLf != null ? `${m.stepFlashingLf} LF` : ""],
    ["Facets", m.facets != null ? String(m.facets) : ""],
  ];
  const rows = candidates.filter((row) => Boolean(row[1]));

  if (rows.length === 0) return null;

  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </dt>
          <dd className="truncate text-xs font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
