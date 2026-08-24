import type { CurrentUser, Estimate, Job, Opportunity, StaffMember } from "@/lib/types";

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

export function contractorSignedAt(
  estimate: Pick<Estimate, "ownerSignedAt" | "sentAt" | "status">,
) {
  if (estimate.ownerSignedAt) return estimate.ownerSignedAt;
  if (estimate.status !== "draft" && estimate.sentAt) return estimate.sentAt;
  return null;
}

export function resolveProjectOwner(input: {
  estimate: Pick<Estimate, "jobId" | "opportunityId" | "ownerSignedName">;
  jobs: Array<Pick<Job, "id" | "ownerStaffId">>;
  opportunities: Array<Pick<Opportunity, "id" | "ownerStaffId">>;
  staff: Array<Pick<StaffMember, "id" | "name" | "title">>;
  user: Pick<CurrentUser, "staffId" | "name" | "title">;
  companyName: string;
}): { name: string; title: string } {
  const stored = input.estimate.ownerSignedName.trim();
  if (stored) {
    const named = input.staff.find((member) => member.name === stored);
    return {
      name: stored,
      title: named?.title || input.user.title || "Project owner",
    };
  }
  const job = input.jobs.find((item) => item.id === input.estimate.jobId);
  const opportunity = input.opportunities.find((item) => item.id === input.estimate.opportunityId);
  const staffId = job?.ownerStaffId || opportunity?.ownerStaffId || input.user.staffId;
  const member = input.staff.find((item) => item.id === staffId);
  return {
    name: member?.name || input.user.name.trim() || input.companyName.trim() || "Contractor",
    title: member?.title || input.user.title || "Project owner",
  };
}

export function estimateSignatureLines(
  estimate: Pick<
    Estimate,
    | "secondContactId"
    | "acceptedAt"
    | "secondAcceptedAt"
    | "ownerSignedAt"
    | "ownerSignedName"
    | "sentAt"
    | "status"
  >,
  names: { contractor?: string | null; primary: string; second?: string | null },
) {
  const lines: Array<{
    role: "contractor" | "primary" | "second";
    party: "contractor" | "homeowner";
    name: string;
    signedAt: string | null;
  }> = [
    {
      role: "contractor",
      party: "contractor",
      name: estimate.ownerSignedName.trim() || names.contractor?.trim() || "Contractor",
      signedAt: contractorSignedAt(estimate),
    },
    {
      role: "primary",
      party: "homeowner",
      name: names.primary.trim() || "Homeowner",
      signedAt: estimate.acceptedAt,
    },
  ];
  if (estimate.secondContactId) {
    lines.push({
      role: "second",
      party: "homeowner",
      name: names.second?.trim() || "Second homeowner",
      signedAt: estimate.secondAcceptedAt,
    });
  }
  return lines;
}
