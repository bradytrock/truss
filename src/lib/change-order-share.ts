import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizeShareToken } from "@/lib/share";

export type SharedChangeOrderLine = {
  title: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  taxable: boolean;
};

export type SharedChangeOrderPayload = {
  number: string;
  reason: string;
  notes: string;
  status: string;
  taxRate: number;
  estimateNumber: string;
  companyName: string;
  jobName: string;
  jobCode: string;
  jobLocation: string;
  signatureName: string;
  alreadySigned: boolean;
  before: number;
  delta: number;
  after: number;
  lines: SharedChangeOrderLine[];
};

function guestError(error: { message?: string } | null, fallback: string) {
  const message = error?.message ?? "";
  if (/schema cache|could not find the function|change_orders/i.test(message)) {
    return "This change order isn’t available.";
  }
  return message || fallback;
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseSharedChangeOrder(data: unknown): SharedChangeOrderPayload | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.number !== "string" || !row.number) return null;
  const lines = Array.isArray(row.lines)
    ? row.lines.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const line = item as Record<string, unknown>;
        return [
          {
            title: typeof line.title === "string" ? line.title : "",
            description: typeof line.description === "string" ? line.description : "",
            quantity: asNumber(line.quantity),
            unit: typeof line.unit === "string" ? line.unit : "",
            unitCost: asNumber(line.unitCost),
            taxable: line.taxable !== false,
          },
        ];
      })
    : [];
  return {
    number: row.number,
    reason: typeof row.reason === "string" ? row.reason : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    status: typeof row.status === "string" ? row.status : "sent",
    taxRate: asNumber(row.taxRate),
    estimateNumber: typeof row.estimateNumber === "string" ? row.estimateNumber : "",
    companyName: typeof row.companyName === "string" ? row.companyName : "",
    jobName: typeof row.jobName === "string" ? row.jobName : "",
    jobCode: typeof row.jobCode === "string" ? row.jobCode : "",
    jobLocation: typeof row.jobLocation === "string" ? row.jobLocation : "",
    signatureName: typeof row.signatureName === "string" ? row.signatureName : "",
    alreadySigned: row.alreadySigned === true || row.status === "accepted",
    before: asNumber(row.before),
    delta: asNumber(row.delta),
    after: asNumber(row.after),
    lines,
  };
}

export async function loadSharedChangeOrder(token: string) {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_change_order", { p_token: trimmed });
    if (error || data == null) return null;
    return parseSharedChangeOrder(data);
  } catch {
    return null;
  }
}

export async function declineSharedChangeOrder(token: string) {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) {
    return { payload: null as SharedChangeOrderPayload | null, error: "This change order isn’t available." };
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("decline_shared_change_order", { p_token: trimmed });
    if (error) {
      return { payload: null, error: guestError(error, "Could not decline the change order.") };
    }
    const payload = parseSharedChangeOrder(data);
    if (!payload) return { payload: null, error: "This change order isn’t available." };
    return { payload, error: null as string | null };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Could not decline the change order.",
    };
  }
}

export async function signSharedChangeOrder(token: string, name: string, image: string) {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) {
    return { payload: null as SharedChangeOrderPayload | null, error: "This change order isn’t available." };
  }
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("sign_shared_change_order", {
      p_token: trimmed,
      p_signer_name: name,
      p_signature: image,
    });
    if (error) {
      return { payload: null, error: guestError(error, "Could not save the signature.") };
    }
    const payload = parseSharedChangeOrder(data);
    if (!payload) return { payload: null, error: "This change order isn’t available." };
    return { payload, error: null as string | null };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Could not save the signature.",
    };
  }
}
