"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState, ErrorBanner, Metric, MetricStrip } from "@/components/page-chrome";
import {
  CARD_METRICS,
  CARD_RANGES,
  sinceForRange,
  sumTotals,
  totalsByStaff,
  type CardRange,
  type CardTotalRow,
} from "@/lib/card-analytics";
import { cardUrlForSeat } from "@/lib/card";
import { useCrm } from "@/lib/crm-store";
import { initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { StaffMember } from "@/lib/types";

export function CardAnalyticsReport({ staffId }: { staffId?: string }) {
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
    return [...pool].sort((left, right) => {
      const leftOpens = byStaff.get(left.id)?.view ?? 0;
      const rightOpens = byStaff.get(right.id)?.view ?? 0;
      if (leftOpens !== rightOpens) return rightOpens - leftOpens;
      return left.name.localeCompare(right.name);
    });
  }, [byStaff, crm.staff, staffId]);

  const loading = rows === null;
  const nothingYet = !loading && scoped.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {staffId ? "Activity on your card." : "Activity across every card in the company."}
        </p>
        <Select
          value={range}
          onValueChange={(value) => setRange((String(value ?? "30") as CardRange) || "30")}
          items={CARD_RANGES.map((item) => ({ value: item.value, label: item.label }))}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CARD_RANGES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Opens" value={String(totals.view ?? 0)} hint="Times a card was opened" />
        <Metric
          label="Contact saves"
          value={String(totals.save_contact ?? 0)}
          hint="Downloaded to a phone"
        />
        <Metric
          label="Review taps"
          value={String(totals.review ?? 0)}
          hint="Sent to a Google listing"
        />
        <Metric
          label="Calls and texts"
          value={String((totals.call ?? 0) + (totals.text ?? 0))}
          hint="Tapped to reach the person"
        />
      </MetricStrip>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{staffId ? "Your card" : "By person"}</CardTitle>
          <CardDescription>
            Opens count each time the link is loaded. Bots and link previews are not counted.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="h-24 animate-pulse bg-muted" />
          ) : nothingYet ? (
            <EmptyState
              title="No card activity yet"
              description={
                staffId
                  ? "Share your card link or tap your NFC tag. Opens and taps show up here."
                  : "Once someone opens a card, opens, saves, and taps land here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    {CARD_METRICS.map((metric) => (
                      <TableHead key={metric.kind} className="text-right">
                        {metric.short}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((member) => (
                    <PersonRow
                      key={member.id}
                      member={member}
                      totals={byStaff.get(member.id) ?? {}}
                      companySlug={crm.company.slug}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PersonRow({
  member,
  totals,
  companySlug,
}: {
  member: StaffMember;
  totals: Record<string, number>;
  companySlug: string;
}) {
  const photo = member.photoUrl?.trim() ?? "";
  const url = cardUrlForSeat({ slug: companySlug }, member);
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <Avatar>
            {photo ? <AvatarImage src={photo} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(member.name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{member.name}</span>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:underline"
              >
                /{member.cardSlug}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">{member.title}</span>
            )}
          </div>
        </div>
      </TableCell>
      {CARD_METRICS.map((metric) => {
        const value = totals[metric.kind] ?? 0;
        return (
          <TableCell
            key={metric.kind}
            className={
              value > 0 ? "text-right tabular-nums" : "text-right tabular-nums text-muted-foreground"
            }
          >
            {value}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
