"use client";

import { useMemo, useState } from "react";
import { Mail, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SettingsCard, SettingsPageHeader } from "@/components/settings-chrome";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_AUDIT_ACTION_LABELS,
  COMPANY_AUDIT_ENTITY_LABELS,
  canRevertCompanyAudit,
} from "@/lib/company-audit";
import { useCrm } from "@/lib/crm-store";
import { formatDateTimeUtc } from "@/lib/format";
import type { CompanyAuditAction, CompanyAuditEntityType, CompanyAuditEvent } from "@/lib/types";

export function CompanyAuditPanel() {
  const crm = useCrm();
  const [entityType, setEntityType] = useState<CompanyAuditEntityType | "all">("all");
  const [action, setAction] = useState<CompanyAuditAction | "all">("all");
  const [who, setWho] = useState("all");
  const [when, setWhen] = useState("60");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const actors = useMemo(() => {
    const names = new Set<string>();
    for (const event of crm.companyAuditEvents ?? []) {
      const name = event.actor.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [crm.companyAuditEvents]);

  const events = useMemo(() => {
    const days = Number(when);
    // eslint-disable-next-line react-hooks/purity -- window length is a clock read, not render state
    const cutoff = Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
    return [...(crm.companyAuditEvents ?? [])]
      .filter((event) => (entityType === "all" ? true : event.entityType === entityType))
      .filter((event) => (action === "all" ? true : event.action === action))
      .filter((event) => (who === "all" ? true : event.actor.trim() === who))
      .filter((event) => (cutoff ? new Date(event.createdAt).getTime() >= cutoff : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [action, crm.companyAuditEvents, entityType, when, who]);

  function exportCsv() {
    const header = ["When", "Who", "Action", "Record", "Summary"];
    const rows = events.map((event) => [
      event.createdAt,
      event.actor,
      COMPANY_AUDIT_ACTION_LABELS[event.action],
      COMPANY_AUDIT_ENTITY_LABELS[event.entityType],
      event.summary,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-trail.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function revert(event: CompanyAuditEvent) {
    if (!canRevertCompanyAudit(event)) return;
    if (
      !window.confirm(
        `Revert this change?\n\n${event.summary}\n\nThe audit trail keeps both the original and the revert.`,
      )
    ) {
      return;
    }
    setBusyId(event.id);
    try {
      const ok = await crm.revertCompanyAudit(event.id);
      if (!ok) toast.error("Could not revert that change.");
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo(() => {
    const buckets = new Map<string, CompanyAuditEvent[]>();
    for (const event of events) {
      const day = new Date(event.createdAt).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const list = buckets.get(day) ?? [];
      list.push(event);
      buckets.set(day, list);
    }
    return [...buckets.entries()];
  }, [events]);

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        eyebrow="Security"
        title="Audit trail"
        description="Every change to people, settings, and records — who made it, when, and a one-click revert where it’s safe."
        actions={
          <Button type="button" variant="outline" className="rounded-lg bg-white" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <FilterSelect label="Who" value={who} onChange={setWho} options={[{ value: "all", label: "Everyone" }, ...actors.map((name) => ({ value: name, label: name }))]} />
        <FilterSelect
          label="What"
          value={action === "all" && entityType === "all" ? "all" : entityType !== "all" ? `entity:${entityType}` : `action:${action}`}
          onChange={(value) => {
            if (value === "all") {
              setAction("all");
              setEntityType("all");
              return;
            }
            if (value.startsWith("entity:")) {
              setEntityType(value.slice(7) as CompanyAuditEntityType);
              setAction("all");
              return;
            }
            setAction(value.slice(7) as CompanyAuditAction);
            setEntityType("all");
          }}
          options={[
            { value: "all", label: "All changes" },
            ...(Object.keys(COMPANY_AUDIT_ENTITY_LABELS) as CompanyAuditEntityType[]).map((key) => ({
              value: `entity:${key}`,
              label: COMPANY_AUDIT_ENTITY_LABELS[key],
            })),
            ...(Object.keys(COMPANY_AUDIT_ACTION_LABELS) as CompanyAuditAction[]).map((key) => ({
              value: `action:${key}`,
              label: COMPANY_AUDIT_ACTION_LABELS[key],
            })),
          ]}
        />
        <FilterSelect
          label="When"
          value={when}
          onChange={setWhen}
          options={[
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
            { value: "60", label: "Last 60 days" },
            { value: "0", label: "All time" },
          ]}
        />
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No audit events in this window. Opening a file, moving a stage, changing a contact, sending an estimate, or trashing a photo will show up here.
        </p>
      ) : (
        <SettingsCard className="divide-y divide-[#f0ece8] px-2">
          {groups.map(([day, rows]) => (
            <div key={day} className="px-3 py-3">
              <p className="text-xs font-medium text-muted-foreground">{day}</p>
              <ul className="mt-2 divide-y divide-[#f6f3ef]">
                {rows.map((event) => {
                  const open = openId === event.id;
                  const reversible = canRevertCompanyAudit(event);
                  return (
                    <li key={event.id} className="flex flex-wrap items-start gap-3 py-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                        <Mail className="size-3.5" />
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setOpenId(open ? null : event.id)}
                      >
                        <p className="text-sm font-medium">{event.summary}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            event.actor.trim() || "System",
                            COMPANY_AUDIT_ACTION_LABELS[event.action],
                            COMPANY_AUDIT_ENTITY_LABELS[event.entityType],
                            formatDateTimeUtc(event.createdAt),
                            event.revertedAt ? `Reverted by ${event.revertedBy || "teammate"}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </button>
                      {reversible ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-lg bg-white"
                          disabled={busyId === event.id}
                          onClick={() => void revert(event)}
                        >
                          <RotateCcw data-icon="inline-start" />
                          Revert
                        </Button>
                      ) : null}
                      {open ? (
                        <div className="basis-full grid gap-3 border-t pt-3 text-xs sm:grid-cols-2">
                          <Snapshot title="Before" value={event.beforeState} />
                          <Snapshot title="After" value={event.afterState} />
                          {event.changedFields.length > 0 ? (
                            <p className="text-muted-foreground sm:col-span-2">
                              Fields: {event.changedFields.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </SettingsCard>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {label}
      <Select value={value} onValueChange={(next) => onChange(String(next ?? "all"))} items={options}>
        <SelectTrigger className="w-44 rounded-lg bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function Snapshot({ title, value }: { title: string; value: Record<string, unknown> }) {
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-md bg-muted/50 p-2 whitespace-pre-wrap break-all">
        {Object.keys(value).length === 0 ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
