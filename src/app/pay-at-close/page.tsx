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
import { PayAtCloseStatusBadge, SeverityBadge } from "@/components/job-pay-at-close-panel";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { jobRecordHref } from "@/lib/job-record";
import {
  PAY_AT_CLOSE_OPEN_STATUSES,
  PAY_AT_CLOSE_STATUS_LABELS,
  PAY_AT_CLOSE_STATUSES,
  RECOMMENDATION_LABELS,
  applicationState,
  payAtCloseAwaitingApproval,
  payAtCloseExposure,
  type PayAtCloseStatus,
} from "@/lib/pay-at-close";
import { canDecidePayAtClose, canViewPayAtClose } from "@/lib/visibility";
import { cn } from "@/lib/utils";

type Filter = PayAtCloseStatus | "all" | "open" | "flagged" | "awaiting_approval";

function monthLabel(month: string) {
  if (month === "unscheduled") return "No date";
  const [year, mm] = month.split("-");
  const date = new Date(Number(year), Number(mm) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function PayAtClosePage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  // Captured once per mount so "in N days" stays pure during render.
  const [todayMs] = useState(() => new Date(new Date().toDateString()).getTime());

  const all = useMemo(() => crm.jobPayAtClose ?? [], [crm.jobPayAtClose]);
  const exposure = useMemo(() => payAtCloseExposure(all), [all]);
  const awaitingCount = useMemo(() => all.filter(payAtCloseAwaitingApproval).length, [all]);
  const canDecide = canDecidePayAtClose(crm.effectiveStaff?.role);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all
      .map((record) => ({ record, job: crm.getJob(record.jobId) }))
      .filter((row) => {
        if (filter === "open" && !PAY_AT_CLOSE_OPEN_STATUSES.includes(row.record.status)) return false;
        if (filter === "flagged" && !(row.record.report?.flags ?? []).some((flag) => flag.severity === "high")) return false;
        if (filter === "awaiting_approval" && !payAtCloseAwaitingApproval(row.record)) return false;
        if (
          filter !== "all" &&
          filter !== "open" &&
          filter !== "flagged" &&
          filter !== "awaiting_approval" &&
          row.record.status !== filter
        )
          return false;
        if (!needle) return true;
        const haystack = [
          row.job?.name,
          row.job?.code,
          row.job?.location,
          row.record.titleCompany,
          row.record.escrowOfficer,
          row.record.escrowFileNumber,
          row.record.listingAgent,
          row.record.signerNames,
          ...(row.record.property?.ownerNames ?? []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const aDate = a.record.expectedCloseDate ?? "9999";
        const bDate = b.record.expectedCloseDate ?? "9999";
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        return b.record.updatedAt.localeCompare(a.record.updatedAt);
      });
  }, [all, crm, filter, query]);

  const shownDue = rows.reduce((sum, row) => sum + Math.max(0, row.record.contractValue - row.record.depositAmount), 0);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!canViewPayAtClose(crm.effectiveStaff?.role)) {
    return (
      <EmptyState
        title="Pay at close stays with the office"
        description="Business development tracks the lead and the sold job. Money carried to a closing stays with ops and accounting."
        action={
          <Link href="/jobs" className="text-sm font-medium text-primary hover:underline">
            Back to jobs
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <PageHeader
        eyebrow="Risk"
        title="Pay at close"
        description="Repairs paid from seller proceeds at closing. Every open deal, what is due, when it closes, and what public records say about the equity behind it."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deals" className="sm:w-56" />
            <Select
              value={filter}
              onValueChange={(value) => setFilter((value as Filter) ?? "open")}
              items={[
                { value: "open", label: "Open deals" },
                { value: "awaiting_approval", label: "Awaiting approval" },
                { value: "flagged", label: "High-risk flags" },
                { value: "all", label: "All" },
                ...PAY_AT_CLOSE_STATUSES.map((item) => ({ value: item, label: PAY_AT_CLOSE_STATUS_LABELS[item] })),
              ]}
            >
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open deals</SelectItem>
                <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
                <SelectItem value="flagged">High-risk flags</SelectItem>
                <SelectItem value="all">All</SelectItem>
                {PAY_AT_CLOSE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PAY_AT_CLOSE_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Carried to closing" value={formatCurrencyFull(exposure.openAmount)} detail={`${exposure.openCount} open deal${exposure.openCount === 1 ? "" : "s"}`} />
        <Stat label="Awaiting closing" value={formatCurrencyFull(exposure.awaitingCloseAmount)} detail="Work done, waiting on the table" />
        <Stat label="High-risk open" value={String(exposure.highFlagCount)} detail="Open deals with a high flag" tone={exposure.highFlagCount ? "text-rose-700" : undefined} />
        <Stat
          label="Awaiting approval"
          value={String(awaitingCount)}
          detail={canDecide ? "Requests waiting on you" : "Requests waiting on a company admin"}
          tone={awaitingCount ? "text-primary" : undefined}
        />
        <Stat label="Collected · fell through" value={`${formatCurrencyFull(exposure.paidAmount)} · ${formatCurrencyFull(exposure.fellThroughAmount)}`} detail="All time" />
      </div>

      {exposure.byMonth.length ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="self-center text-muted-foreground">Due by month:</span>
          {exposure.byMonth.map((bucket) => (
            <span key={bucket.month} className="rounded-full border bg-card px-2.5 py-1 tabular-nums">
              {monthLabel(bucket.month)} · {formatCurrencyFull(bucket.amount)} · {bucket.count}
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {rows.length} deal{rows.length === 1 ? "" : "s"} · {formatCurrencyFull(shownDue)} due at closing
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No open pay-at-close deals" : "No deals match"}
          description="Open a job and start the pay-at-close review from the overview or the Pay at close tab."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Closing</TableHead>
                <TableHead className="text-right">Due at closing</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Top flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ record, job }) => {
                const report = record.report;
                const top = report?.flags[0];
                const due = Math.max(0, record.contractValue - record.depositAmount);
                const closeDays = record.expectedCloseDate
                  ? Math.round((new Date(`${record.expectedCloseDate}T00:00:00`).getTime() - todayMs) / 86_400_000)
                  : null;
                return (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Link href={jobRecordHref(record.jobId, { tab: "pay-at-close" })} className="font-medium hover:underline">
                        {job?.name ?? "Job"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[job?.code, job?.location, record.titleCompany ? `${record.titleCompany}${record.escrowFileNumber ? ` #${record.escrowFileNumber}` : ""}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <PayAtCloseStatusBadge status={record.status} />
                      {applicationState(record.application) !== "not_sent" ? (
                        <span className={cn("mt-1 block text-xs", applicationState(record.application) === "submitted" ? "text-emerald-700" : "text-muted-foreground")}>
                          {applicationState(record.application) === "submitted" ? "Homeowner answered" : "Link out"}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {record.expectedCloseDate ? (
                        <span className={cn(closeDays != null && closeDays < 0 && PAY_AT_CLOSE_OPEN_STATUSES.includes(record.status) && "text-rose-700")}>
                          {formatDate(record.expectedCloseDate)}
                          <span className="block text-xs text-muted-foreground">
                            {closeDays == null ? "" : closeDays < 0 ? `${Math.abs(closeDays)} days past` : closeDays === 0 ? "today" : `in ${closeDays} days`}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No date</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyFull(due)}
                      {record.depositAmount ? <span className="block text-xs text-muted-foreground">{formatCurrencyFull(record.depositAmount)} deposit</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {report?.waterfall.coverageRatio != null ? `${report.waterfall.coverageRatio.toFixed(2)}×` : "—"}
                      {report ? <span className="block text-xs text-muted-foreground">net {formatCurrencyFull(report.waterfall.netProceeds)}</span> : null}
                    </TableCell>
                    <TableCell>
                      {report ? (
                        <span>
                          {RECOMMENDATION_LABELS[report.recommendation]}
                          <span className="block text-xs text-muted-foreground">score {report.score} · {formatDate(report.generatedAt)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Not reviewed</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {top ? (
                        <span className="flex items-start gap-2">
                          <SeverityBadge severity={top.severity} />
                          <span className="text-xs">{top.title}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
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

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="rounded-[12px] border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", tone)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
