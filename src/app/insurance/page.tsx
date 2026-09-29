"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { ClaimStatusBadge } from "@/components/job-insurance-panel";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { phoneSearchText } from "@/lib/phone";
import { jobRecordHref } from "@/lib/job-record";
import {
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  claimTotals,
  supplementIsOpen,
  type ClaimStatus,
} from "@/lib/insurance";

export default function InsurancePage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ClaimStatus | "all" | "open_supplements">("open_supplements");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (crm.jobInsurance ?? [])
      .map((claim) => {
        const job = crm.getJob(claim.jobId);
        const totals = claimTotals(claim);
        return { claim, job, totals };
      })
      .filter((row) => {
        if (status === "open_supplements" && row.totals.openCount === 0) return false;
        if (status !== "all" && status !== "open_supplements" && row.claim.status !== status) return false;
        if (!needle) return true;
        const haystack = [
          row.job?.name,
          row.job?.code,
          row.job?.location,
          row.claim.carrier,
          row.claim.claimNumber,
          row.claim.policyNumber,
          row.claim.adjusterName,
          row.claim.adjusterEmail,
          phoneSearchText(row.claim.adjusterPhone),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => b.claim.updatedAt.localeCompare(a.claim.updatedAt));
  }, [crm, query, status]);

  const openRequested = rows.reduce((sum, row) => sum + row.totals.openRequested, 0);
  const outstanding = rows.reduce((sum, row) => sum + row.totals.outstanding, 0);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <PageHeader
        eyebrow="Claims"
        title="Insurance"
        description="Every carrier claim on the book — supplements still out, checks collected, and what is left after the deductible."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search claims"
              className="sm:w-56"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus((value as ClaimStatus | "all" | "open_supplements") ?? "open_supplements")}
              items={[
                { value: "open_supplements", label: "Open supplements" },
                { value: "all", label: "All claims" },
                ...CLAIM_STATUSES.map((item) => ({ value: item, label: CLAIM_STATUS_LABELS[item] })),
              ]}
            >
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open_supplements">Open supplements</SelectItem>
                <SelectItem value="all">All claims</SelectItem>
                {CLAIM_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {CLAIM_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        {rows.length} claim{rows.length === 1 ? "" : "s"}
        {status === "open_supplements" ? ` · ${formatCurrencyFull(openRequested)} still requested` : ""}
        {" · "}
        {formatCurrencyFull(outstanding)} still to collect
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={status === "open_supplements" ? "No open supplements" : "No claims match"}
          description="Open a job and start the claim to track the carrier, supplements, and insurance checks."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Supplements</TableHead>
                <TableHead className="text-right">Net claim</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const open = row.claim.supplements.filter((item) => supplementIsOpen(item.status));
                return (
                  <TableRow key={row.claim.id}>
                    <TableCell>
                      <Link
                        href={jobRecordHref(row.claim.jobId, { tab: "insurance" })}
                        className="font-medium hover:underline"
                      >
                        {row.job?.name ?? "Job"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {row.job?.code}
                        {row.claim.claimNumber ? ` · ${row.claim.claimNumber}` : ""}
                        {row.claim.adjusterName ? ` · ${row.claim.adjusterName}` : ""}
                        {row.claim.dateOfLoss ? ` · loss ${formatDate(row.claim.dateOfLoss)}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>{row.claim.carrier || "—"}</TableCell>
                    <TableCell>
                      <ClaimStatusBadge status={row.claim.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {open.length ? (
                        <span>
                          {open.length} open
                          <span className="block text-xs text-muted-foreground">
                            {formatCurrencyFull(row.totals.openRequested)} requested
                          </span>
                        </span>
                      ) : row.totals.approvedSupplements ? (
                        <span>{formatCurrencyFull(row.totals.approvedSupplements)} approved</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.totals.netClaim)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.totals.outstanding)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
