"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-chrome";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const events = useMemo(() => {
    return [...(crm.companyAuditEvents ?? [])]
      .filter((event) => (entityType === "all" ? true : event.entityType === entityType))
      .filter((event) => (action === "all" ? true : event.action === action))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [action, crm.companyAuditEvents, entityType]);

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

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Audit trail"
        description="Every tracked CRM change with before/after snapshots. Revert when the action is reversible — storage files are never purged from Backblaze."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={entityType}
          onValueChange={(value) => setEntityType((value as CompanyAuditEntityType | "all") ?? "all")}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All records</SelectItem>
            {(Object.keys(COMPANY_AUDIT_ENTITY_LABELS) as CompanyAuditEntityType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {COMPANY_AUDIT_ENTITY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={action}
          onValueChange={(value) => setAction((value as CompanyAuditAction | "all") ?? "all")}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {(Object.keys(COMPANY_AUDIT_ACTION_LABELS) as CompanyAuditAction[]).map((key) => (
              <SelectItem key={key} value={key}>
                {COMPANY_AUDIT_ACTION_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No audit events yet. Opening a file, moving a stage, changing a contact, sending an estimate, or trashing a photo will show up here.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => {
            const open = openId === event.id;
            const reversible = canRevertCompanyAudit(event);
            return (
              <li key={event.id} className="rounded-md border px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setOpenId(open ? null : event.id)}
                  >
                    <p className="text-sm font-medium">{event.summary}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        COMPANY_AUDIT_ACTION_LABELS[event.action],
                        COMPANY_AUDIT_ENTITY_LABELS[event.entityType],
                        event.actor.trim() || null,
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
                      disabled={busyId === event.id}
                      onClick={() => void revert(event)}
                    >
                      <RotateCcw data-icon="inline-start" />
                      Revert
                    </Button>
                  ) : null}
                </div>
                {open ? (
                  <div className="mt-3 grid gap-3 border-t pt-3 text-xs sm:grid-cols-2">
                    <Snapshot title="Before" value={event.beforeState} />
                    <Snapshot title="After" value={event.afterState} />
                    {event.changedFields.length > 0 ? (
                      <p className="sm:col-span-2 text-muted-foreground">
                        Fields: {event.changedFields.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
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
