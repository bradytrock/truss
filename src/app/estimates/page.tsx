"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StartEstimateButton } from "@/components/start-estimate-button";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { EstimateStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import { amountForEstimate } from "@/lib/estimate-totals";
import { marketForEstimate } from "@/lib/market";
import { useStartEstimate } from "@/lib/start-estimate";
import { canManageSettings } from "@/lib/visibility";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUSES,
  type EstimateStatus,
} from "@/lib/types";

export default function EstimatesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <EstimatesList />
    </Suspense>
  );
}

function EstimatesList() {
  const crm = useCrm();
  const searchParams = useSearchParams();
  const fromTemplate = searchParams.get("from") ?? "";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EstimateStatus | "all">("all");
  const { start } = useStartEstimate();
  const startedFrom = useRef("");

  useEffect(() => {
    if (!fromTemplate || !crm.hydrated || startedFrom.current === fromTemplate) return;
    startedFrom.current = fromTemplate;
    void start({ templateId: fromTemplate });
  }, [crm.hydrated, fromTemplate, start]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return crm.estimates.filter((estimate) => {
      if (status !== "all" && estimate.status !== status) return false;
      if (!needle) return true;
      const customer = crm.customerName(estimate);
      return (
        estimate.name.toLowerCase().includes(needle) ||
        estimate.number.toLowerCase().includes(needle) ||
        customer.toLowerCase().includes(needle)
      );
    });
  }, [crm, query, status]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Preconstruction"
        title="Estimates"
        description="Write a proposal the way a production crew actually prices work: sections, optional lines, tax, and a client preview. Send it for signature, collect the drawing on the estimate, convert it to an invoice."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search estimates"
              className="sm:w-56"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus((value as EstimateStatus | "all") ?? "all")}
              items={[
                { value: "all", label: "All statuses" },
                ...ESTIMATE_STATUSES.map((item) => ({
                  value: item,
                  label: ESTIMATE_STATUS_LABELS[item],
                })),
              ]}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ESTIMATE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ESTIMATE_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {crm.viewer && canManageSettings(crm.viewer.role, crm.viewer) ? (
              <Button nativeButton={false} variant="outline" render={<Link href="/settings/price-book" />}>
                Price book
              </Button>
            ) : null}
            <Button nativeButton={false} variant="outline" render={<Link href="/estimates/templates" />}>
              Templates
            </Button>
            <StartEstimateButton>New estimate</StartEstimateButton>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={query || status !== "all" ? "No estimates match these filters" : "No estimates yet"}
          description={
            query || status !== "all"
              ? "Clear the search or status filter."
              : "Draft a proposal from a company template or the price book, then send it to the owner."
          }
          action={<StartEstimateButton>New estimate</StartEstimateButton>}
        />
      ) : (
        <>
          <ul className="space-y-2 sm:hidden">
            {rows.map((estimate) => {
              const total = amountForEstimate(
                estimate,
                crm.estimateLines,
                marketForEstimate(estimate, crm.jobs, crm.opportunities),
              );
              return (
                <li key={estimate.id}>
                  <Link
                    href={`/estimates/${estimate.id}`}
                    className="block rounded-md border bg-card p-3 active:bg-muted/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{estimate.number}</p>
                        <p className="mt-0.5 truncate text-sm">{estimate.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {crm.customerName(estimate)}
                        </p>
                      </div>
                      <p className="shrink-0 tabular-nums text-sm">{formatMoney(total)}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <EstimateStatusBadge status={estimate.status} />
                      <p className="text-xs text-muted-foreground">
                        Valid {formatDate(estimate.validUntil)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-hidden rounded-md border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((estimate) => {
                  const total = amountForEstimate(
                    estimate,
                    crm.estimateLines,
                    marketForEstimate(estimate, crm.jobs, crm.opportunities),
                  );
                  return (
                    <TableRow key={estimate.id} className="relative">
                      <TableCell>
                        <Link
                          href={`/estimates/${estimate.id}`}
                          className="font-medium hover:underline after:absolute after:inset-0"
                        >
                          {estimate.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">{estimate.name}</p>
                      </TableCell>
                      <TableCell>{crm.customerName(estimate)}</TableCell>
                      <TableCell>
                        <EstimateStatusBadge status={estimate.status} />
                      </TableCell>
                      <TableCell>{formatDate(estimate.validUntil)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(total)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Line items come from the{" "}
        {crm.viewer && canManageSettings(crm.viewer.role, crm.viewer) ? (
          <Link href="/settings/price-book" className="text-primary hover:underline">
            price book
          </Link>
        ) : (
          "price book"
        )}
        . Totals include tax and skip optional lines that are not selected.
      </p>
    </div>
  );
}
