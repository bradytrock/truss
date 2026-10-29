import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const ESTIMATE_NUMBER_INDEX = "estimates_company_number_idx";
const ESTIMATE_NUMBER = /^EST-\d+$/;

const pendingByCompany = new Map<string, Set<string>>();

/** Next document number. The floor is 1000, so the first number is `{prefix}-1001`. */
export function nextNumber(prefix: string, existing: string[]) {
  const max = existing.reduce((current, value) => {
    const match = value.match(/(\d+)$/);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 1000);
  return `${prefix}-${max + 1}`;
}

export function isDuplicateEstimateNumber(
  error: { code?: string; message?: string } | null | undefined,
) {
  if (!error || error.code !== "23505") return false;
  return (error.message ?? "").includes(ESTIMATE_NUMBER_INDEX);
}

/**
 * Numbers this tab has already handed out and not given back.
 * `except` is the caller's own reservation, which a server allocation may reuse.
 */
export function heldEstimateNumbers(companyId: string, except?: string) {
  const pending = pendingByCompany.get(companyId);
  if (!pending) return [];
  return [...pending].filter((value) => value !== except);
}

function pendingSet(companyId: string) {
  const existing = pendingByCompany.get(companyId);
  if (existing) return existing;
  const created = new Set<string>();
  pendingByCompany.set(companyId, created);
  return created;
}

/**
 * Reserve the next estimate number before any await. Two creates in the same
 * tab otherwise both read the same React state and both insert EST-n.
 */
export function claimEstimateNumber(companyId: string, existing: string[]) {
  const pending = pendingSet(companyId);
  let current = nextNumber("EST", [...existing, ...pending]);
  pending.add(current);
  return {
    get number() {
      return current;
    },
    replace(next: string) {
      const value = next.trim();
      if (!value || value === current) return current;
      pending.delete(current);
      current = value;
      pending.add(current);
      return current;
    },
    release() {
      pending.delete(current);
    },
  };
}

/** Drop in-memory reservations. Tests only. */
export function resetEstimateNumberClaims() {
  pendingByCompany.clear();
}

/**
 * Keep a server-issued number when nobody else has it.
 * `taken` must not include the caller's own reservation — that number is allowed
 * to come back from Postgres.
 */
export function spareEstimateNumber(candidate: string, taken: string[]) {
  const proposed = candidate.trim();
  const used = new Set(taken.filter(Boolean));
  let number = ESTIMATE_NUMBER.test(proposed) ? proposed : nextNumber("EST", [...used]);
  let guard = 0;
  while (used.has(number) && guard < 50) {
    used.add(number);
    number = nextNumber("EST", [...used]);
    guard += 1;
  }
  return number;
}

type NumberClient = SupabaseClient<Database>;

/**
 * Ask Postgres for the next estimate number. Falls back to the newest saved
 * numbers when the allocator function is not deployed yet.
 */
export async function allocateEstimateNumber(
  supabase: NumberClient,
  companyId: string,
  exceptClaim: string,
  existing: string[],
) {
  const taken = [...existing, ...heldEstimateNumbers(companyId, exceptClaim)];
  const allocated = await supabase.rpc("allocate_estimate_number");
  if (!allocated.error && typeof allocated.data === "string") {
    return spareEstimateNumber(allocated.data, taken);
  }
  const latest = await supabase
    .from("estimates")
    .select("number")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const numbers = (latest.data ?? []).map((row) => row.number).filter((value): value is string => Boolean(value));
  return spareEstimateNumber("", [...taken, ...numbers]);
}
