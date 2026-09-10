"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull } from "@/lib/format";
import {
  canViewTeamGoal,
  effectiveMonthlyQuota,
  goalPace,
  goalRoster,
  sellingDaysLeft,
  soldThisMonth,
  teamQuota,
} from "@/lib/sales-goal";
import { canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

const TEAM_KEY = "team";

export function GoalHeader() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;
  const [focusId, setFocusId] = useState(TEAM_KEY);

  const roster = useMemo(
    () => (viewer ? goalRoster(viewer, crm.staff) : []),
    [crm.staff, viewer],
  );

  const teamMode = Boolean(viewer && canViewTeamGoal(viewer.role));
  const selectedId = teamMode ? focusId : (viewer?.id ?? TEAM_KEY);
  const selectedMember =
    selectedId === TEAM_KEY
      ? null
      : (roster.find((member) => member.id === selectedId) ?? viewer ?? null);

  const ownerIds = useMemo(() => {
    if (!viewer) return null;
    if (teamMode && selectedId === TEAM_KEY) {
      return new Set(roster.map((member) => member.id));
    }
    return new Set([selectedMember?.id ?? viewer.id]);
  }, [roster, selectedId, selectedMember, teamMode, viewer]);

  const sold = useMemo(() => {
    if (!ownerIds) return 0;
    return soldThisMonth({
      jobs: crm.jobs,
      estimates: crm.estimates,
      estimateLines: crm.estimateLines,
      opportunities: crm.opportunities,
      staff: crm.staff,
      ownerIds,
    });
  }, [
    crm.estimateLines,
    crm.estimates,
    crm.jobs,
    crm.opportunities,
    crm.staff,
    ownerIds,
  ]);

  if (!viewer) return null;

  const company = crm.company;
  const quota =
    teamMode && selectedId === TEAM_KEY
      ? teamQuota(roster, company)
      : effectiveMonthlyQuota(selectedMember ?? viewer, company);
  const daysLeft = sellingDaysLeft();
  const pace = goalPace(sold, quota, daysLeft);
  const pct = quota > 0 ? Math.min(100, Math.round((sold / quota) * 100)) : 0;
  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const admin = canManageSettings(viewer.role, viewer);
  const wholeLabel = viewer.role === "company_admin" ? "Whole company" : "Whole team";
  const title =
    teamMode && selectedId === TEAM_KEY
      ? viewer.role === "company_admin"
        ? "Company goal"
        : "Team goal"
      : `${(selectedMember ?? viewer).name.split(" ")[0] || "Rep"}'s goal`;

  const paceLine =
    quota <= 0
      ? "Set a monthly quota to track pacing."
      : pace.hit
        ? `Goal hit · ${formatCurrencyFull(sold)} signed this month`
        : daysLeft === 0
          ? `${formatCurrencyFull(sold)} of ${formatCurrencyFull(quota)} · month ended`
          : `${formatCurrencyFull(sold)} of ${formatCurrencyFull(quota)} · ${daysLeft} selling day${
              daysLeft === 1 ? "" : "s"
            } left · need ${formatCurrencyFull(pace.perDay)}/day to hit goal`;

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Goal · {monthLabel}
            </p>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                {title}
              </h2>
              {quota > 0 ? (
                <span className="text-sm text-muted-foreground">{pct}% of quota</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {teamMode && roster.length > 0 ? (
              <Select
                value={selectedId}
                onValueChange={(value) => setFocusId(String(value ?? TEAM_KEY))}
                items={[
                  { value: TEAM_KEY, label: wholeLabel },
                  ...roster.map((member) => ({ value: member.id, label: member.name })),
                ]}
              >
                <SelectTrigger className="h-9 w-[12.5rem] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TEAM_KEY}>{wholeLabel}</SelectItem>
                  {roster.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {admin ? (
              <Button nativeButton={false} size="sm" variant="outline" render={<Link href="/settings" />}>
                Edit quotas
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                pace.hit ? "bg-emerald-600" : "bg-primary",
              )}
              style={{ width: `${quota > 0 ? pct : 0}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">{paceLine}</p>
          {quota <= 0 && admin ? (
            <p className="text-xs text-muted-foreground">
              Set the company default under Settings → Company, or override a seat under People.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
