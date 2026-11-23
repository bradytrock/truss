"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorBanner } from "@/components/page-chrome";
import { REPORT_COLORS } from "@/components/reports-charts";
import { EmptyRow, PillTabs, ReportPanel, StatCard, StatGrid, TotalRow } from "@/components/reports-chrome";
import {
  CARD_RANGES,
  CARD_REPORT_TILES,
  cardActions,
  cardPersonRows,
  cardSaveRate,
  sinceForRange,
  sumTotals,
  totalsByStaff,
  type CardPersonRow,
  type CardRange,
  type CardTotalRow,
} from "@/lib/card-analytics";
import { cardUrlForSeat } from "@/lib/card";
import { useCrm } from "@/lib/crm-store";
import { formatShare } from "@/lib/reports";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export function CardAnalyticsReport({
  staffId,
  onRows,
}: {
  staffId?: string;
  /** Lets the page export whatever the table is showing. */
  onRows?: (rows: CardPersonRow[], range: CardRange) => void;
}) {
  const crm = useCrm();
  const [range, setRange] = useState<CardRange>("30");
  const [rows, setRows] = useState<CardTotalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Everything is set after the await so the effect never renders twice.
    const result = isSupabaseConfigured()
      ? await createClient().rpc("card_event_totals", { p_since: sinceForRange(range) })
      : { data: [], error: null };

    if (result.error) {
      setRows([]);
      setError(
        /card_event|does not exist|schema cache/i.test(result.error.message)
          ? "Run supabase/migrations/20260903210000_card_analytics.sql (or a fresh bootstrap) to start collecting card activity."
          : result.error.message,
      );
      return;
    }
    setError(null);
    setRows(
      (result.data ?? []).map((row) => ({
        staffId: String(row.staff_id),
        kind: String(row.kind),
        total: Number(row.total ?? 0),
      })),
    );
  }, [range]);

  useEffect(() => {
    // Reads Postgres on mount and when the range changes. Every setState in load()
    // runs after the request resolves, so there is no synchronous render cascade —
    // the rule cannot see through the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const scoped = useMemo(
    () => (staffId ? (rows ?? []).filter((row) => row.staffId === staffId) : (rows ?? [])),
    [rows, staffId],
  );
  const totals = useMemo(() => sumTotals(scoped), [scoped]);
  const byStaff = useMemo(() => totalsByStaff(scoped), [scoped]);

  const people = useMemo(() => {
    const pool = staffId ? crm.staff.filter((member) => member.id === staffId) : crm.staff;
    return cardPersonRows(pool, byStaff);
  }, [byStaff, crm.staff, staffId]);

  useEffect(() => {
    onRows?.(people, range);
  }, [onRows, people, range]);

  const loading = rows === null;
  const nothingYet = !loading && scoped.length === 0;
  const maxOpens = Math.max(...people.map((row) => row.opens), 1);
  const opens = totals.view ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
            {staffId ? "Your digital business card" : "Digital business cards"}
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: REPORT_COLORS.muted }}>
            {staffId
              ? "How prospects interact with your card link or QR code."
              : "How prospects interact with each rep’s card link or QR code."}
          </p>
        </div>
        <PillTabs
          aria-label="Card activity range"
          value={range}
          onChange={setRange}
          options={CARD_RANGES.map((item) => ({ value: item.value, label: item.label }))}
        />
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <StatGrid className="lg:grid-cols-5">
        {CARD_REPORT_TILES.map((tile) => {
          const value = totals[tile.kind] ?? 0;
          const hint =
            tile.kind === "save_contact" && opens > 0
              ? `${formatShare(cardSaveRate(totals))} of opens`
              : tile.hint;
          return (
            <StatCard key={tile.kind} label={tile.label} value={value.toLocaleString("en-US")} hint={hint} dot={tile.color} />
          );
        })}
      </StatGrid>

      <ReportPanel
        title={staffId ? "Your card" : "By person"}
        footer="Source: card_event_totals RPC · total actions = saves + review taps + calls + texts. Bots and link previews are not counted."
        bodyClassName="px-0 pb-0"
      >
        {loading ? (
          <div className="mx-4 mb-4 h-24 animate-pulse rounded-md bg-muted" />
        ) : nothingYet ? (
          <div className="px-4 pb-4">
            <EmptyState
              title="No card activity yet"
              description={
                staffId
                  ? "Share your card link or tap your NFC tag. Opens and taps show up here."
                  : "Once someone opens a card, opens, saves, and taps land here."
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead className="text-right">Contact saves</TableHead>
                <TableHead className="text-right">Save rate</TableHead>
                <TableHead className="text-right">Review taps</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Texts</TableHead>
                <TableHead className="pr-4 text-right">Total actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.length === 0 ? <EmptyRow cols={8} message="No people on this card report." /> : null}
              {people.map((row) => {
                const member = crm.staff.find((item) => item.id === row.staffId);
                const url = member ? cardUrlForSeat({ slug: crm.company.slug }, member) : "";
                return (
                  <TableRow key={row.staffId}>
                    <TableCell className="pl-4">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                          {row.name}
                        </a>
                      ) : (
                        <span className="font-semibold">{row.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-28 overflow-hidden rounded-full sm:w-40" style={{ backgroundColor: "#eef0f3" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(row.opens / maxOpens) * 100}%`, backgroundColor: REPORT_COLORS.blue }}
                          />
                        </div>
                        <span className="w-10 text-right font-semibold tabular-nums">{row.opens}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.saves}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.opens ? formatShare(row.saveRate) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reviews}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.texts}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{row.actions}</TableCell>
                  </TableRow>
                );
              })}
              {people.length > 1 ? (
                <TotalRow>
                  <TableCell className="pl-4">All people</TableCell>
                  <TableCell className="tabular-nums">{opens.toLocaleString("en-US")}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.save_contact ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{opens ? formatShare(cardSaveRate(totals)) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.review ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.call ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.text ?? 0}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{cardActions(totals).toLocaleString("en-US")}</TableCell>
                </TotalRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </ReportPanel>
    </div>
  );
}