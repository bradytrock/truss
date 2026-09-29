import { formatMoney } from "@/lib/format";
import type { AutomationAction, AutomationValueMode } from "@/lib/automations/types";

export function resolveJobValue(
  action: Pick<AutomationAction, "valueMode" | "amount">,
  estimateTotal: number | null,
): { ok: true; amount: number } | { ok: false; error: string } {
  const mode: AutomationValueMode = action.valueMode ?? "estimate";
  if (mode === "zero") return { ok: true, amount: 0 };
  if (mode === "amount") {
    const amount = Number(action.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: "Enter a job value of zero or more." };
    }
    return { ok: true, amount: roundMoney(amount) };
  }
  if (estimateTotal == null || !Number.isFinite(estimateTotal)) {
    return { ok: false, error: "This job has no proposal total to copy." };
  }
  return { ok: true, amount: roundMoney(estimateTotal) };
}

export function describeJobValue(
  action: Pick<AutomationAction, "valueMode" | "amount">,
  estimateTotal: number | null,
) {
  const mode: AutomationValueMode = action.valueMode ?? "estimate";
  if (mode === "zero") return "Set job value to $0";
  if (mode === "amount") {
    const amount = Number(action.amount);
    if (!Number.isFinite(amount)) return "Set job value";
    return `Set job value to ${formatMoney(amount)}`;
  }
  if (estimateTotal == null || !Number.isFinite(estimateTotal)) return "Set job value to the proposal total";
  return `Set job value to the proposal total (${formatMoney(estimateTotal)})`;
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}
