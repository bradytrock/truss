"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const wholeLabel = viewer.role === "company_admin" ? "Entire company" : "Entire team";
  const title =
    teamMode && selectedId === TEAM_KEY
      ? viewer.role === "company_admin"
        ? "Company quota"
        : "Team quota"
      : `${(selectedMember ?? viewer).name.split(" ")[0] || "Rep"} quota`;

  return (
    <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c9c9c9] bg-[#f3f3f3] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
            Highlights · {monthLabel}
          </p>
          <h2 className="truncate text-base font-semibold text-[#181818]">{title}</h2>
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
              <SelectTrigger className="h-8 w-[11.5rem] rounded-sm border-[#c9c9c9] bg-white text-xs shadow-none">
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
            <Button
              nativeButton={false}
              size="sm"
              variant="outline"
              className="h-8 rounded-sm border-[#c9c9c9] bg-white text-xs shadow-none"
              render={<Link href="/settings" />}
            >
              Edit quotas
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-4">
        <HighlightField label="Closed won" value={formatCurrencyFull(sold)} />
        <HighlightField
          label="Monthly quota"
          value={quota > 0 ? formatCurrencyFull(quota) : "Not set"}
        />
        <HighlightField
          label="Remaining"
          value={quota > 0 ? formatCurrencyFull(pace.remaining) : "—"}
        />
        <HighlightField
          label="Required / day"
          value={
            quota > 0 && !pace.hit && daysLeft > 0
              ? formatCurrencyFull(pace.perDay)
              : pace.hit
                ? "Quota hit"
                : "—"
          }
          last
        />
      </div>

      <div className="space-y-1.5 border-t border-[#c9c9c9] px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#706e6b]">
          <span>Quota attainment</span>
          <span className="tabular-nums text-[#181818]">{quota > 0 ? `${pct}%` : "—"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-sm bg-[#e5e5e5]">
          <div
            className={cn(
              "h-full rounded-sm transition-[width] duration-500",
              pace.hit ? "bg-[#45c65a]" : "bg-[#0176d3]",
            )}
            style={{ width: `${quota > 0 ? pct : 0}%` }}
          />
        </div>
        <p className="text-xs text-[#706e6b]">
          {quota <= 0
            ? admin
              ? "Set a company default under Settings → Company, or override a seat under People."
              : "Ask an admin to set a monthly quota."
            : pace.hit
              ? `Quota hit · ${formatCurrencyFull(sold)} signed this month`
              : daysLeft === 0
                ? `${formatCurrencyFull(sold)} of ${formatCurrencyFull(quota)} · month ended`
                : `${daysLeft} selling day${daysLeft === 1 ? "" : "s"} left this month`}
        </p>
      </div>
    </section>
  );
}

function HighlightField({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-3 py-2.5",
        !last && "sm:border-r sm:border-[#c9c9c9]",
        "border-b border-[#c9c9c9] sm:border-b-0",
      )}
    >
      <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[#181818]">{value}</p>
    </div>
  );
}
