import type { Estimate } from "@/lib/types";

export type EstimateSigner = "primary" | "second" | "both";

export function joinCustomerNames(primary: string, second?: string | null) {
  const a = primary.trim() || "Homeowner";
  const b = second?.trim();
  if (!b || b === a) return a;
  return `${a} and ${b}`;
}

export function primaryNameFromJoined(customer: string, second?: string | null) {
  const joined = customer.trim() || "Homeowner";
  const other = second?.trim();
  if (other && joined.endsWith(` and ${other}`)) {
    return joined.slice(0, joined.length - ` and ${other}`.length) || "Homeowner";
  }
  return joined;
}

export function estimateNeedsSecondSignature(estimate: Pick<Estimate, "secondContactId">) {
  return Boolean(estimate.secondContactId);
}

export function estimateFullySigned(
  estimate: Pick<Estimate, "secondContactId" | "acceptedAt" | "secondAcceptedAt">,
) {
  if (!estimate.acceptedAt) return false;
  if (!estimate.secondContactId) return true;
  return Boolean(estimate.secondAcceptedAt);
}

export function nextEstimateSignature(
  estimate: Estimate,
  signer: EstimateSigner,
  now: string,
): Pick<Estimate, "acceptedAt" | "secondAcceptedAt" | "status"> {
  const needsSecond = estimateNeedsSecondSignature(estimate);
  let acceptedAt = estimate.acceptedAt;
  let secondAcceptedAt = estimate.secondAcceptedAt;
  if (signer === "primary" || signer === "both" || !needsSecond) {
    acceptedAt = acceptedAt ?? now;
  }
  if (needsSecond && (signer === "second" || signer === "both")) {
    secondAcceptedAt = secondAcceptedAt ?? now;
  }
  if (!needsSecond) secondAcceptedAt = null;
  const fully = Boolean(acceptedAt) && (!needsSecond || Boolean(secondAcceptedAt));
  return {
    acceptedAt,
    secondAcceptedAt,
    status: fully ? "accepted" : estimate.status === "declined" ? "declined" : estimate.status,
  };
}

export function estimateSignatureLines(
  estimate: Pick<Estimate, "secondContactId" | "acceptedAt" | "secondAcceptedAt">,
  names: { primary: string; second?: string | null },
) {
  const lines: Array<{ role: "primary" | "second"; name: string; signedAt: string | null }> = [
    {
      role: "primary",
      name: names.primary.trim() || "Homeowner",
      signedAt: estimate.acceptedAt,
    },
  ];
  if (estimate.secondContactId) {
    lines.push({
      role: "second" as const,
      name: names.second?.trim() || "Second homeowner",
      signedAt: estimate.secondAcceptedAt,
    });
  }
  return lines;
}
