import { NextResponse } from "next/server";
import { applyAutomationMerge, emptyAutomationMerge } from "@/lib/automations/merge";
import { executeAutomationActions } from "@/lib/automations/execute";
import { mapAutomation } from "@/lib/supabase/mappers";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import type { Automation } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

async function staffAuthorized() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function previewFromActions(automation: Automation, merge: ReturnType<typeof emptyAutomationMerge>) {
  return automation.actions
    .map((action) => {
      if (action.kind === "webhook") return `Webhook ${action.url || ""}`.trim();
      if (action.kind === "create_task") return applyAutomationMerge(action.title ?? "Task", merge);
      if (action.kind === "send_email") {
        return `${applyAutomationMerge(action.subject ?? "", merge)}\n${applyAutomationMerge(action.body ?? "", merge)}`.trim();
      }
      return applyAutomationMerge(action.body ?? "", merge);
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function GET(request: Request) {
  if (!cronAuthorized(request) && !(await staffAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  let enqueued = 0;
  const { data: upcoming, error: upcomingError } = await supabase.rpc("automation_upcoming_event_matches");
  if (!upcomingError) {
    for (const raw of asList(upcoming)) {
      const row = asRecord(raw);
      const automationRaw = row ? asRecord(row.automation) : null;
      if (!row || !automationRaw) continue;
      const automation = mapAutomation(automationRaw as never);
      const merge = {
        ...emptyAutomationMerge(),
        companyName: String(row.company_name ?? ""),
        companyPhone: String(row.company_phone ?? ""),
        staffName: String(row.owner_name ?? ""),
        staffPhone: String(row.owner_phone ?? ""),
        jobName: String(row.job_name ?? row.event_title ?? ""),
        jobCode: String(row.job_code ?? ""),
        jobCity: String(row.job_city ?? ""),
        contactName: String(row.contact_name ?? ""),
        contactPhone: String(row.contact_phone ?? ""),
        contactEmail: String(row.contact_email ?? ""),
      };
      const preview = previewFromActions(automation, merge);
      const { error } = await supabase.rpc("automation_insert_run", {
        p_run: {
          company_id: String(row.company_id ?? ""),
          automation_id: automation.id,
          job_id: typeof row.job_id === "string" ? row.job_id : "",
          event_id: typeof row.event_id === "string" ? row.event_id : "",
          status: automation.requiresConfirmation ? "pending_confirmation" : "scheduled",
          scheduled_for: automation.requiresConfirmation ? "" : new Date().toISOString(),
          rendered_preview: preview,
        },
      });
      if (!error) enqueued += 1;
    }
  }

  const { data, error } = await supabase.rpc("automation_due_runs");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = asList(data);
  let sent = 0;
  let failed = 0;
  let waiting = 0;

  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    const runId = String(row.id ?? "");
    const companyId = String(row.company_id ?? "");
    const automationRaw = asRecord(row.automation);
    if (!runId || !companyId || !automationRaw) continue;
    const automation = mapAutomation(automationRaw as never);
    if (automation.requiresConfirmation) {
      await supabase.rpc("automation_mark_run", {
        p_id: runId,
        p_status: "pending_confirmation",
        p_preview: String(row.rendered_preview ?? ""),
      });
      waiting += 1;
      continue;
    }
    const preview = String(row.rendered_preview ?? "");
    const merge = { ...emptyAutomationMerge() };
    const result = await executeAutomationActions({
      automation: {
        ...automation,
        actions: automation.actions.map((action) =>
          action.kind === "send_sms" || action.kind === "send_email" || action.kind === "notify_staff"
            ? { ...action, body: preview || action.body }
            : action,
        ),
      },
      merge,
      customerPhone: String(row.contact_phone ?? ""),
      customerEmail: String(row.contact_email ?? ""),
      ownerPhone: String(row.owner_phone ?? ""),
      ownerEmail: String(row.owner_email ?? ""),
      companyId,
      userId: "automation",
      staffById: () => ({
        phone: String(row.owner_phone ?? ""),
        email: String(row.owner_email ?? ""),
        name: String(row.owner_name ?? ""),
      }),
      createTask: async (title) => {
        await supabase.rpc("automation_add_task", {
          p_company_id: companyId,
          p_title: title,
          p_job_id: typeof row.job_id === "string" ? row.job_id : undefined,
          p_assignee: String(row.owner_name ?? ""),
        });
      },
    });
    await supabase.rpc("automation_mark_run", {
      p_id: runId,
      p_status: result.ok ? "sent" : "failed",
      p_delivery: result.delivery,
      p_error: result.error,
    });
    if (result.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    enqueued,
    processed: rows.length,
    sent,
    failed,
    waiting,
  });
}
