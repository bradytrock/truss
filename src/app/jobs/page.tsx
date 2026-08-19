"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
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
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { JOB_STATUS_LABELS, JOB_STATUSES, type JobStatus } from "@/lib/types";

export default function JobsPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<JobStatus | "all">("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return crm.jobs.filter((job) => {
      if (status !== "all" && job.status !== status) return false;
      if (!needle) return true;
      const client = crm.getClient(job.clientId);
      return (
        job.name.toLowerCase().includes(needle) ||
        job.location.toLowerCase().includes(needle) ||
        client?.name.toLowerCase().includes(needle) ||
        job.projectManager.toLowerCase().includes(needle)
      );
    });
  }, [crm, query, status]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={crm.resetDemo} />
      ) : null}
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        description="Awarded and active work. This is the book after the bid — not daily reports, just who owns it and where it stands."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search jobs"
              className="sm:w-56"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus((value as JobStatus | "all") ?? "all")}
              items={[
                { value: "all", label: "All statuses" },
                ...JOB_STATUSES.map((jobStatus) => ({
                  value: jobStatus,
                  label: JOB_STATUS_LABELS[jobStatus],
                })),
              ]}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {JOB_STATUSES.map((jobStatus) => (
                  <SelectItem key={jobStatus} value={jobStatus}>
                    {JOB_STATUS_LABELS[jobStatus]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="size-5" />}
          title={query || status !== "all" ? "No jobs match these filters" : "No jobs yet"}
          description={
            query || status !== "all"
              ? "Clear the search or status filter to see the full book of work."
              : "Award a pursuit on the pipeline, or log an existing contract."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PM</TableHead>
                <TableHead>Start</TableHead>
                <TableHead className="text-right">Contract</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{job.location}</p>
                  </TableCell>
                  <TableCell>{crm.getClient(job.clientId)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell>{job.projectManager}</TableCell>
                  <TableCell>{formatDate(job.startDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(job.contractValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
