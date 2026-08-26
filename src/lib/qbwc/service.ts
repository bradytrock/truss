import { createAnonClient } from "@/lib/supabase/anon";
import { isMissingQbwc } from "@/lib/supabase/schema-errors";
import {
  parseWorkPayload,
  type QbwcStep,
  type QbwcWork,
} from "@/lib/qbwc/work";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function qbwcAuthenticate(username: string, password: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("qbwc_authenticate", {
    p_username: username,
    p_password: password,
  });
  if (error) {
    console.error("[qbwc] authenticate", error.code, error.message);
    if (isMissingQbwc(error)) return { ok: false as const, reason: "sql" };
    return { ok: false as const, reason: "nvu" };
  }
  const row = asRecord(data);
  if (!row || row.ok !== true) return { ok: false as const, reason: "nvu" };
  return { ok: true as const, ticket: String(row.ticket ?? "") };
}

export async function qbwcNextWork(ticket: string): Promise<
  | { ok: true; done: true }
  | { ok: true; done: false; step: QbwcStep; work: QbwcWork }
  | { ok: false; reason: string }
> {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("qbwc_next_work", { p_ticket: ticket });
  if (error) {
    console.error("[qbwc] next_work", error.code, error.message);
    if (isMissingQbwc(error)) return { ok: false, reason: "sql" };
    return { ok: false, reason: "ticket" };
  }
  const row = asRecord(data);
  if (!row || row.ok === false) return { ok: false, reason: String(row?.reason ?? "ticket") };
  if (row.done === true) return { ok: true, done: true };
  const work = parseWorkPayload(row.work);
  const step = String(row.step ?? "customer_query") as QbwcStep;
  if (!work) return { ok: false, reason: "payload" };
  return { ok: true, done: false, step, work };
}

export async function qbwcApply(
  ticket: string,
  action: "next" | "complete" | "fail",
  extra: { nextStep?: string; txnId?: string; error?: string } = {},
) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("qbwc_apply_response", {
    p_ticket: ticket,
    p_action: action,
    p_next_step: extra.nextStep ?? "",
    p_txn_id: extra.txnId ?? "",
    p_error: extra.error ?? "",
  });
  if (error) {
    console.error("[qbwc] apply", error.code, error.message);
    return { ok: false as const };
  }
  const row = asRecord(data);
  return { ok: row?.ok === true };
}

export async function qbwcLastError(ticket: string) {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("qbwc_get_last_error", { p_ticket: ticket });
  if (error) return "Could not read the last QuickBooks error.";
  return typeof data === "string" ? data : "";
}

export async function qbwcClose(ticket: string) {
  const supabase = createAnonClient();
  await supabase.rpc("qbwc_close", { p_ticket: ticket });
}
