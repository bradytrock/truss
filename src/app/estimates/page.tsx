"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { CreateEstimateDialog } from "@/components/create-ops-dialogs";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { EstimateStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import { amountForEstimate } from "@/lib/estimate-totals";
import { marketForEstimate } from "@/lib/market";
import {
  ESTIMATE_STATUS_LABELS,
  ESTIMATE_STATUSES,
  type EstimateStatus,
} from "@/lib/types";

export default function EstimatesPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<EstimateStatus | "all">("all");
  const [create, setCreate] = useState(false);

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
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Preconstruction"
        title="Estimates"
        description="Write a proposal the way a production crew actually prices work: sections, optional lines, tax, and a client preview. Send it, get it accepted, convert it to an invoice."
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
            <Button onClick={() => setCreate(true)}>New estimate</Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={query || status !== "all" ? "No estimates match these filters" : "No estimates yet"}
          description={
            query || status !== "all"
              ? "Clear the search or status filter."
              : "Draft a proposal from the price book, then send it to the owner."
          }
          action={<Button onClick={() => setCreate(true)}>New estimate</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
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
                  <TableRow key={estimate.id}>
                    <TableCell>
                      <Link href={`/estimates/${estimate.id}`} className="font-medium hover:underline">
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
      )}

      <p className="text-xs text-muted-foreground">
        Line items come from the{" "}
        <Link href="/catalog" className="text-primary hover:underline">
          price book
        </Link>
        . Totals include tax and skip optional lines that are not selected.
      </p>

      <CreateEstimateDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
