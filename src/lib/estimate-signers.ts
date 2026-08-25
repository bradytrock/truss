import { isSignaturePng } from "@/lib/estimate-signature";
import { newShareToken } from "@/lib/share";
import type { CurrentUser, Estimate, Job, Opportunity, StaffMember } from "@/lib/types";

export type EstimateSigner = "primary" | "second" | "both";
export type HomeownerSigner = "primary" | "second";

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

export function homeownerHasSigned(
  estimate: Pick<Estimate, "acceptedAt" | "secondAcceptedAt"> &
    Partial<Pick<Estimate, "signatureImage" | "secondSignatureImage">>,
  role: HomeownerSigner,
) {
  if (role === "second") {
    return Boolean(estimate.secondAcceptedAt) || isSignaturePng(estimate.secondSignatureImage);
  }
  return Boolean(estimate.acceptedAt) || isSignaturePng(estimate.signatureImage);
}

export function estimateFullySigned(
  estimate: Pick<Estimate, "secondContactId" | "acceptedAt" | "secondAcceptedAt"> &
    Partial<Pick<Estimate, "signatureImage" | "secondSignatureImage">>,
) {
  if (!homeownerHasSigned(estimate, "primary")) return false;
  if (!estimate.secondContactId) return true;
  return homeownerHasSigned(estimate, "second");
}

export function homeownersAwaitingSignature(
  estimate: Pick<
    Estimate,
    | "secondContactId"
    | "acceptedAt"
    | "secondAcceptedAt"
    | "signatureImage"
    | "secondSignatureImage"
  >,
) {
  return !estimateFullySigned(estimate);
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
  const fully =
    (Boolean(acceptedAt) || isSignaturePng(estimate.signatureImage)) &&
    (!needsSecond || Boolean(secondAcceptedAt) || isSignaturePng(estimate.secondSignatureImage));
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

export function signerRoleForToken(
  estimate: Pick<Estimate, "shareToken" | "secondShareToken" | "secondContactId">,
  token: string | null | undefined,
): HomeownerSigner | null {
  const value = token?.trim() ?? "";
  if (!value) return null;
  if (
    estimate.secondContactId &&
    estimate.secondShareToken &&
    estimate.secondShareToken === value &&
    estimate.shareToken !== value
  ) {
    return "second";
  }
  if (estimate.shareToken === value) return "primary";
  if (estimate.secondShareToken === value) return "second";
  return null;
}

export function mintEstimateSignerTokens(
  estimate: Pick<Estimate, "shareToken" | "secondShareToken" | "secondContactId">,
) {
  const shareToken = estimate.shareToken || newShareToken();
  let secondShareToken = estimate.secondContactId ? estimate.secondShareToken || "" : "";
  if (estimate.secondContactId && (!secondShareToken || secondShareToken === shareToken)) {
    secondShareToken = newShareToken();
  }
  if (!estimate.secondContactId) secondShareToken = "";
  return { shareToken, secondShareToken };
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
    | "signatureName"
    | "signatureImage"
    | "secondSignatureName"
    | "secondSignatureImage"
  >,
  names: { contractor?: string | null; primary: string; second?: string | null },
) {
  const lines: Array<{
    role: "contractor" | "primary" | "second";
    party: "contractor" | "homeowner";
    name: string;
    signedAt: string | null;
    image: string;
  }> = [
    {
      role: "contractor",
      party: "contractor",
      name: estimate.ownerSignedName.trim() || names.contractor?.trim() || "Contractor",
      signedAt: contractorSignedAt(estimate),
      image: "",
    },
    {
      role: "primary",
      party: "homeowner",
      name: estimate.signatureName.trim() || names.primary.trim() || "Homeowner",
      signedAt: homeownerHasSigned(estimate, "primary") ? estimate.acceptedAt || estimate.sentAt : null,
      image: estimate.signatureImage,
    },
  ];
  if (estimate.secondContactId) {
    lines.push({
      role: "second",
      party: "homeowner",
      name: estimate.secondSignatureName.trim() || names.second?.trim() || "Second homeowner",
      signedAt: homeownerHasSigned(estimate, "second") ? estimate.secondAcceptedAt : null,
      image: estimate.secondSignatureImage,
    });
  }
  return lines;
}
