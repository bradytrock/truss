"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REPORT_COLORS, VerticalBars } from "@/components/reports-charts";
import { PersonAvatar, ReportCard, Segmented } from "@/components/reports-chrome";
import { formatCurrency, formatCurrencyFull, formatDate, formatDateShort } from "@/lib/format";
import {
  personPlacement,
  personWonCsv,
  teamRates,
  type PersonDetail,
  type PersonJobStatus,
} from "@/lib/person-report";
import { DATE_PRESETS, type DatePreset, type PerformanceReport } from "@/lib/reports";
import { SEAT_ROLE_LABELS } from "@/lib/types";

const PAGE_SIZE = 8;

const RANGE_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "ytd", label: "YTD" },
];

const STATUS_ITEMS: { value: PersonJobStatus; label: string }[] = [
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "open", label: "Open" },
];

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const body = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PersonReportPanel({
  detail,
  report,
  preset,
  onPreset,
  onBack,
  onSwitch,
}: {
  detail: PersonDetail;
  report: PerformanceReport;
  preset: DatePreset;
  onPreset: (preset: DatePreset) => void;
  onBack: () => void;
  onSwitch: (staffId: string) => void;
}) {
  const ranges = RANGE_OPTIONS.some((item) => item.value === preset)
    ? RANGE_OPTIONS
    : [
        { value: preset, label: DATE_PRESETS.find((item) => item.id === preset)?.label ?? "This range" },
        ...RANGE_OPTIONS,
      ];
  const people = report.byTeam.map((row) => row.staff);
  if (!people.some((person) => person.id === detail.staff.id)) people.unshift(detail.staff);

  if (detail.staff.role === "business_development") {
    return (
      <div className="space-y-4">
        <BackButton name={detail.staff.name} onBack={onBack} />
        <ReportCard className="px-4 py-6 text-sm" >
          <p style={{ color: REPORT_COLORS.ink }}>Business development is reported on BD / ROI, not the team leaderboard.</p>
        </ReportCard>
      </div>
    );
  }

  return (
    <PersonBody
      detail={detail}
      report={report}
      preset={preset}
      ranges={ranges}
      people={people}
      onPreset={onPreset}
      onBack={onBack}
      onSwitch={onSwitch}
    />
  );
}

function PersonBody({
  detail,
  report,
  preset,
  ranges,
  people,
  onPreset,
  onBack,
  onSwitch,
}: {
  detail: PersonDetail;
  report: PerformanceReport;
  preset: DatePreset;
  ranges: { value: DatePreset; label: string }[];
  people: PerformanceReport["byTeam"][number]["staff"][];
  onPreset: (preset: DatePreset) => void;
  onBack: () => void;
  onSwitch: (staffId: string) => void;
}) {
  const [status, setStatus] = useState<PersonJobStatus>("won");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const rates = teamRates(report.byTeam);
  const valueRank = personPlacement(report.byTeam, detail.staff.id, "wonValue");
  const jobRank = personPlacement(report.byTeam, detail.staff.id, "won");
  const avgRank = personPlacement(report.byTeam, detail.staff.id, "avgJob");
  const closeGap = pct(detail.closeRate) !== pct(detail.qualifiedClose);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return detail.jobs.filter((row) => {
      if (row.status !== status) return false;
      if (!needle) return true;
      return [row.code, row.name, row.city, row.type, row.source].join(" ").toLowerCase().includes(needle);
    });
  }, [detail.jobs, query, status]);
  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE);
  const filteredTotal = filtered.reduce((sum, row) => sum + row.value, 0);
  const statusLabel = STATUS_ITEMS.find((item) => item.value === status)?.label.toLowerCase() ?? "won";

  function exportWon() {
    const csv = personWonCsv(detail);
    downloadCsv(csv.filename, csv.headers, csv.rows);
  }

  return (
    <div className="space-y-4">
      <BackButton name={detail.staff.name} onBack={onBack} />

      <ReportCard className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={detail.staff.name} photoUrl={detail.staff.photoUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg leading-tight font-semibold" style={{ color: REPORT_COLORS.ink }}>
                {detail.staff.name}
              </h2>
              {valueRank ? (
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: REPORT_COLORS.blueTint, color: REPORT_COLORS.blue }}
                >
                  #{valueRank.rank} of {valueRank.of} on team
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs" style={{ color: REPORT_COLORS.muted }}>
              {SEAT_ROLE_LABELS[detail.staff.role]} · Sales owner on {detail.assigned} lead{detail.assigned === 1 ? "" : "s"} this period
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented aria-label="Person date range" size="sm" value={preset} onChange={onPreset} options={ranges} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 rounded-lg bg-white px-2.5 text-xs font-medium"
                  style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.ink }}
                />
              }
            >
              Switch user
              <ChevronDown className="size-3.5" style={{ color: REPORT_COLORS.muted }} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              {people.map((person) => (
                <DropdownMenuItem key={person.id} onClick={() => onSwitch(person.id)}>
                  {person.name}
                  {person.id === detail.staff.id ? " · viewing" : ""}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            onClick={exportWon}
            className="h-8 rounded-lg bg-white px-2.5 text-xs font-medium"
            style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.ink }}
          >
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </ReportCard>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Won value"
          value={formatCurrencyFull(detail.wonValue)}
          rank={rankText(valueRank, (row) => formatCurrency(row.wonValue))}
          formula="Sum of the contract value of won jobs"
          detail="Leads they own that went on to sign."
        />
        <MetricCard
          label="Jobs"
          value={String(detail.won)}
          rank={rankText(jobRank, (row) => String(row.won))}
          formula="Won leads created in the period"
          detail="Counted once, on the sales owner."
        />
        <MetricCard
          label="Close rate"
          value={pct(detail.closeRate)}
          rank={`Team avg ${pct(rates.closeRate)}`}
          formula={`${detail.won} won ÷ (${detail.won} won + ${detail.lost} lost)`}
          detail="Decided deals only. Open deals are left out."
        />
        <MetricCard
          label="Qualified close"
          value={pct(detail.qualifiedClose)}
          rank={`Team avg ${pct(rates.qualifiedClose)}`}
          formula={`${detail.won} won ÷ ${detail.qualified} qualified`}
          detail={
            detail.stillOpen
              ? `Includes the ${detail.stillOpen} qualified lead${detail.stillOpen === 1 ? "" : "s"} still open.`
              : "Open qualified leads stay in this count."
          }
        />
        <MetricCard
          label="Avg job size"
          value={detail.won ? formatCurrencyFull(detail.avgJob) : "—"}
          rank={rankText(avgRank, (row) => formatCurrency(row.avgJob))}
          formula={detail.won ? `${formatCurrencyFull(detail.wonValue)} ÷ ${detail.won} jobs` : "No won jobs in this range"}
          detail="Won value divided by jobs won."
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <ReportCard className="px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
              Lead-to-win funnel
            </h3>
            <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              Where the close-rate denominators come from
            </p>
          </div>
          <div className="mt-4 space-y-2.5">
            <FunnelRow label="Leads assigned" count={detail.assigned} max={detail.assigned} />
            <FunnelRow label="Inspected" count={detail.inspected} max={detail.assigned} />
            <FunnelRow label="Qualified" count={detail.qualified} max={detail.assigned} />
            <FunnelRow label="Proposal sent" count={detail.proposal} max={detail.assigned} />
            <FunnelRow label="Won" count={detail.won} max={detail.assigned} tone="strong" />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: REPORT_COLORS.muted }}>
            {detail.unqualified ? <span>{detail.unqualified} leads unqualified</span> : null}
            {detail.qualifiedNoProposal ? <span>{detail.qualifiedNoProposal} qualified, no proposal yet</span> : null}
            {detail.awaitingDecision ? <span>{detail.awaitingDecision} proposals awaiting decision</span> : null}
            {!detail.assigned ? <span>No leads in this range.</span> : null}
          </div>
        </ReportCard>

        <ReportCard className="px-4 py-4">
          <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
            {detail.qualified} qualified lead{detail.qualified === 1 ? "" : "s"} — outcome
          </h3>
          <OutcomeBar won={detail.won} lost={detail.lost} open={detail.stillOpen} />
          <ul className="mt-3 space-y-1.5 text-sm">
            <Legend swatch={REPORT_COLORS.blue} label="Won" count={detail.won} />
            <Legend swatch={REPORT_COLORS.orange} label="Lost" count={detail.lost} />
            <Legend swatch="#c5d4f6" label="Still open" count={detail.stillOpen} />
          </ul>
          {closeGap ? (
            <p
              className="mt-4 rounded-lg px-3 py-2.5 text-xs leading-relaxed"
              style={{ backgroundColor: "#f8f3e4", color: "#6b5b32" }}
            >
              Why {pct(detail.closeRate)} vs {pct(detail.qualifiedClose)}: close rate only counts decided deals ({detail.won} won + {detail.lost} lost). Qualified close also counts the {detail.stillOpen} still open, so it rises as they close.
            </p>
          ) : null}
        </ReportCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportCard className="px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
              Won value by job type
            </h3>
            <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              Sums to {formatCurrencyFull(detail.wonValue)}
            </p>
          </div>
          {detail.byType.length === 0 ? (
            <p className="py-8 text-sm" style={{ color: REPORT_COLORS.muted }}>
              No won jobs in this range.
            </p>
          ) : (
            <div className="mt-4 space-y-3.5">
              {detail.byType.map((row) => (
                <div key={row.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <p className="min-w-0 truncate" style={{ color: REPORT_COLORS.ink }}>
                      <span className="font-medium">{row.label}</span>
                      <span style={{ color: REPORT_COLORS.muted }}>
                        {" "}
                        · {row.count} job{row.count === 1 ? "" : "s"} · avg {formatCurrencyFull(row.avg)}
                      </span>
                    </p>
                    <p className="shrink-0 font-semibold tabular-nums">{formatCurrencyFull(row.value)}</p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#e7eefb" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${detail.wonValue ? (row.value / detail.wonValue) * 100 : 0}%`,
                        backgroundColor: REPORT_COLORS.blue,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportCard>

        <ReportCard className="px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
              Won value by month
            </h3>
            <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              Close date
            </p>
          </div>
          <VerticalBars
            className="mt-2 h-40"
            items={detail.byMonth}
            format={formatCurrency}
            highlightKey={report.currentMonthKey}
          />
        </ReportCard>
      </div>

      <ReportCard>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
              {status === "won"
                ? `Won jobs that make up ${formatCurrency(detail.wonValue)}`
                : status === "lost"
                  ? "Lost jobs"
                  : "Open qualified leads"}
            </h3>
            <p className="mt-1 text-xs" style={{ color: REPORT_COLORS.muted }}>
              {status === "won"
                ? "Every row here is counted in Won value and Jobs. Click a job to open it."
                : "These rows are not part of won value."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setExpanded(false);
              }}
              placeholder="Search jobs"
              aria-label="Search jobs"
              className="h-8 w-40 bg-white text-xs"
            />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus((value as PersonJobStatus) ?? "won");
                setExpanded(false);
              }}
              items={STATUS_ITEMS}
            >
              <SelectTrigger size="sm" className="w-28 bg-white" aria-label="Job status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Job</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lead source</TableHead>
              <TableHead>Signed</TableHead>
              <TableHead className="text-right">Days to close</TableHead>
              <TableHead className="pr-4 text-right">Contract value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-6 text-center text-sm" style={{ color: REPORT_COLORS.muted }}>
                  {query ? "No jobs match this search." : `No ${statusLabel} jobs in this range.`}
                </TableCell>
              </TableRow>
            ) : null}
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <Link href={row.href} className="font-semibold hover:underline" style={{ color: REPORT_COLORS.blue }}>
                    {row.code}
                  </Link>
                </TableCell>
                <TableCell>{row.city}</TableCell>
                <TableCell>
                  <TypePill label={row.type} />
                </TableCell>
                <TableCell style={{ color: REPORT_COLORS.muted }}>{row.source}</TableCell>
                <TableCell className="tabular-nums" style={{ color: REPORT_COLORS.muted }}>
                  {row.signedAt ? (row.signedAt.slice(0, 4) === report.range.end.slice(0, 4) ? formatDateShort(row.signedAt) : formatDate(row.signedAt)) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.days ?? "—"}</TableCell>
                <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatCurrencyFull(row.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs"
          style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.muted }}
        >
          <span>
            Showing {visible.length} of {filtered.length} {statusLabel} job{filtered.length === 1 ? "" : "s"}
            {filtered.length > PAGE_SIZE ? (
              <>
                {" "}
                ·{" "}
                <button type="button" className="font-medium hover:underline" style={{ color: REPORT_COLORS.blue }} onClick={() => setExpanded((value) => !value)}>
                  {expanded ? "Show less" : `View all ${filtered.length}`}
                </button>
              </>
            ) : null}
          </span>
          <span className="font-medium" style={{ color: REPORT_COLORS.ink }}>
            Total {formatCurrencyFull(filteredTotal)}
          </span>
        </div>
      </ReportCard>

      <ReportCard className="px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
              Not counted yet: {detail.stillOpen} open qualified opportunit{detail.stillOpen === 1 ? "y" : "ies"}
            </h3>
            <p className="mt-1 text-xs" style={{ color: REPORT_COLORS.muted }}>
              These sit in the qualified-close denominator but not in won value.
            </p>
          </div>
          <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
            Est. pipeline {formatCurrency(detail.openValue)}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {detail.openGroups.map((group) => (
            <OpenCard key={group.id} label={group.label} count={group.count} hint={group.hint} />
          ))}
          <OpenCard
            label="Lost this period"
            count={detail.lost}
            hint={detail.lost ? "Already in the close rate" : "Would lower close rate"}
          />
        </div>
      </ReportCard>
    </div>
  );
}

function BackButton({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: REPORT_COLORS.muted }}>
      <ChevronLeft className="size-4" />
      <span>Team leaderboard</span>
      <span style={{ color: REPORT_COLORS.ink }}>/ {name}</span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  rank,
  formula,
  detail,
}: {
  label: string;
  value: string;
  rank: string;
  formula: string;
  detail: string;
}) {
  return (
    <ReportCard className="flex flex-col px-4 py-3.5">
      <p className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: REPORT_COLORS.muted }}>
        {label}
      </p>
      <p className="mt-2 text-[1.65rem] leading-none font-semibold tracking-tight tabular-nums" style={{ color: REPORT_COLORS.ink }}>
        {value}
      </p>
      <p className="mt-2 text-xs" style={{ color: REPORT_COLORS.muted }}>
        {rank}
      </p>
      <div className="mt-3 border-t pt-2.5" style={{ borderColor: REPORT_COLORS.border }}>
        <p className="text-[10px] font-semibold tracking-[0.08em] uppercase" style={{ color: "#5c6b8a" }}>
          How it&apos;s calculated
        </p>
        <p className="mt-1 text-xs leading-snug" style={{ color: REPORT_COLORS.ink }}>
          {formula}
        </p>
        <p className="mt-0.5 text-xs leading-snug" style={{ color: REPORT_COLORS.muted }}>
          {detail}
        </p>
      </div>
    </ReportCard>
  );
}

function rankText(
  placement: ReturnType<typeof personPlacement>,
  format: (row: NonNullable<ReturnType<typeof personPlacement>>["leader"]) => string,
) {
  if (!placement) return "Not on the board for this range";
  if (placement.isFirst) {
    return placement.next ? `Team rank #1 · next best ${format(placement.next)}` : "Team rank #1";
  }
  return `Team rank #${placement.rank} · leader ${format(placement.leader)}`;
}

function FunnelRow({ label, count, max, tone = "soft" }: { label: string; count: number; max: number; tone?: "soft" | "strong" }) {
  const width = max > 0 ? Math.max(count > 0 ? 4 : 0, (count / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
      <span style={{ color: REPORT_COLORS.ink }}>{label}</span>
      <div className="h-3 overflow-hidden rounded-full" style={{ backgroundColor: "#eef1f5" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${width}%`, backgroundColor: tone === "strong" ? REPORT_COLORS.blue : "#9ec0ea" }}
        />
      </div>
      <span className="text-right font-semibold tabular-nums" style={{ color: REPORT_COLORS.ink }}>
        {count}
      </span>
    </div>
  );
}

function OutcomeBar({ won, lost, open }: { won: number; lost: number; open: number }) {
  const total = won + lost + open;
  const parts = [
    { key: "won", count: won, color: REPORT_COLORS.blue },
    { key: "lost", count: lost, color: REPORT_COLORS.orange },
    { key: "open", count: open, color: "#c5d4f6" },
  ].filter((part) => part.count > 0);
  return (
    <div className="mt-4 flex h-3 overflow-hidden rounded-full" style={{ backgroundColor: "#eef1f5" }}>
      {total === 0
        ? null
        : parts.map((part) => (
            <div key={part.key} style={{ width: `${(part.count / total) * 100}%`, backgroundColor: part.color }} />
          ))}
    </div>
  );
}

function Legend({ swatch, label, count }: { swatch: string; label: string; count: number }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2" style={{ color: REPORT_COLORS.ink }}>
        <span aria-hidden className="size-2.5 rounded-[3px]" style={{ backgroundColor: swatch }} />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{count}</span>
    </li>
  );
}

function TypePill({ label }: { label: string }) {
  const colors = ["#1e4fd8", "#15803d", "#7c3aed", "#c2410c", "#0f766e"];
  let index = 0;
  for (const char of label) index = (index + char.charCodeAt(0)) % colors.length;
  const color = colors[index] ?? REPORT_COLORS.blue;
  return (
    <span className="inline-flex max-w-[10rem] truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color, backgroundColor: `${color}1a` }}>
      {label}
    </span>
  );
}

function OpenCard({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <div className="rounded-lg border px-3 py-3" style={{ borderColor: REPORT_COLORS.border }}>
      <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
        {label}
      </p>
      <p className="mt-1 text-[1.35rem] leading-none font-semibold tabular-nums" style={{ color: REPORT_COLORS.ink }}>
        {count}
      </p>
      <p className="mt-1.5 text-xs" style={{ color: REPORT_COLORS.muted }}>
        {hint}
      </p>
    </div>
  );
}
