export const CLAIM_STATUSES = [
  "intake",
  "inspected",
  "estimate_sent",
  "supplementing",
  "approved",
  "depreciation",
  "closed",
  "denied",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  intake: "Intake",
  inspected: "Inspected",
  estimate_sent: "Estimate sent",
  supplementing: "Supplementing",
  approved: "Approved",
  depreciation: "Recovering depreciation",
  closed: "Closed",
  denied: "Denied",
};

export const CLAIM_PERILS = ["hail", "wind", "water", "fire", "other"] as const;
export type ClaimPeril = (typeof CLAIM_PERILS)[number];

export const CLAIM_PERIL_LABELS: Record<ClaimPeril, string> = {
  hail: "Hail",
  wind: "Wind",
  water: "Water",
  fire: "Fire",
  other: "Other",
};

export const SUPPLEMENT_STATUSES = ["draft", "submitted", "approved", "partial", "denied"] as const;
export type SupplementStatus = (typeof SUPPLEMENT_STATUSES)[number];

export const SUPPLEMENT_STATUS_LABELS: Record<SupplementStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  partial: "Partial",
  denied: "Denied",
};

export const CHECK_KINDS = ["acv", "depreciation", "supplement", "other"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export const CHECK_KIND_LABELS: Record<CheckKind, string> = {
  acv: "ACV",
  depreciation: "Depreciation",
  supplement: "Supplement",
  other: "Other",
};

export const CHECK_PAYEES = ["homeowner", "mortgage", "contractor", "split"] as const;
export type CheckPayee = (typeof CHECK_PAYEES)[number];

export const CHECK_PAYEE_LABELS: Record<CheckPayee, string> = {
  homeowner: "Homeowner",
  mortgage: "Mortgage company",
  contractor: "Contractor",
  split: "Split",
};

export interface ClaimSupplement {
  id: string;
  title: string;
  status: SupplementStatus;
  requested: number;
  approved: number;
  submittedAt: string | null;
  decidedAt: string | null;
  notes: string;
}

export interface ClaimCheck {
  id: string;
  kind: CheckKind;
  payee: CheckPayee;
  amount: number;
  receivedAt: string;
  reference: string;
  supplementId: string | null;
  notes: string;
}

export interface JobInsurance {
  id: string;
  jobId: string;
  carrier: string;
  claimNumber: string;
  policyNumber: string;
  dateOfLoss: string | null;
  peril: ClaimPeril | "";
  status: ClaimStatus;
  deductible: number;
  rcv: number;
  acv: number;
  depreciation: number;
  recoverable: boolean;
  overheadProfit: number;
  mortgageCompany: string;
  loanNumber: string;
  adjusterName: string;
  adjusterEmail: string;
  adjusterPhone: string;
  notes: string;
  supplements: ClaimSupplement[];
  checks: ClaimCheck[];
  updatedAt: string;
}

export interface ClaimTotals {
  approvedSupplements: number;
  openRequested: number;
  openCount: number;
  rcvWithSupplements: number;
  netClaim: number;
  collected: number;
  outstanding: number;
}

function money(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function isClaimPeril(value: string): value is ClaimPeril {
  return (CLAIM_PERILS as readonly string[]).includes(value);
}

export function isSupplementStatus(value: string): value is SupplementStatus {
  return (SUPPLEMENT_STATUSES as readonly string[]).includes(value);
}

function isCheckKind(value: string): value is CheckKind {
  return (CHECK_KINDS as readonly string[]).includes(value);
}

function isCheckPayee(value: string): value is CheckPayee {
  return (CHECK_PAYEES as readonly string[]).includes(value);
}

export function parseSupplements(value: unknown): ClaimSupplement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id).trim();
    if (!id) return [];
    const status = text(row.status);
    return [
      {
        id,
        title: text(row.title),
        status: isSupplementStatus(status) ? status : "draft",
        requested: money(row.requested),
        approved: money(row.approved),
        submittedAt: text(row.submittedAt) || null,
        decidedAt: text(row.decidedAt) || null,
        notes: text(row.notes),
      },
    ];
  });
}

export function parseChecks(value: unknown): ClaimCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = text(row.id).trim();
    if (!id) return [];
    const kind = text(row.kind);
    const payee = text(row.payee);
    return [
      {
        id,
        kind: isCheckKind(kind) ? kind : "other",
        payee: isCheckPayee(payee) ? payee : "homeowner",
        amount: money(row.amount),
        receivedAt: text(row.receivedAt),
        reference: text(row.reference),
        supplementId: text(row.supplementId) || null,
        notes: text(row.notes),
      },
    ];
  });
}

export function emptyJobInsurance(jobId: string, id?: string): JobInsurance {
  return {
    id: id ?? "",
    jobId,
    carrier: "",
    claimNumber: "",
    policyNumber: "",
    dateOfLoss: null,
    peril: "",
    status: "intake",
    deductible: 0,
    rcv: 0,
    acv: 0,
    depreciation: 0,
    recoverable: true,
    overheadProfit: 0,
    mortgageCompany: "",
    loanNumber: "",
    adjusterName: "",
    adjusterEmail: "",
    adjusterPhone: "",
    notes: "",
    supplements: [],
    checks: [],
    updatedAt: new Date().toISOString(),
  };
}

export function claimTotals(claim: Pick<JobInsurance, "rcv" | "deductible" | "supplements" | "checks">): ClaimTotals {
  const approvedSupplements = claim.supplements
    .filter((item) => item.status === "approved" || item.status === "partial")
    .reduce((sum, item) => sum + item.approved, 0);
  const open = claim.supplements.filter((item) => item.status === "draft" || item.status === "submitted");
  const rcvWithSupplements = claim.rcv + approvedSupplements;
  const netClaim = rcvWithSupplements - claim.deductible;
  const collected = claim.checks.reduce((sum, item) => sum + item.amount, 0);
  return {
    approvedSupplements,
    openRequested: open.reduce((sum, item) => sum + item.requested, 0),
    openCount: open.length,
    rcvWithSupplements,
    netClaim,
    collected,
    outstanding: netClaim - collected,
  };
}

export function jobInsurancePayload(claim: JobInsurance, companyId: string) {
  return {
    id: claim.id,
    company_id: companyId,
    job_id: claim.jobId,
    carrier: claim.carrier.trim(),
    claim_number: claim.claimNumber.trim(),
    policy_number: claim.policyNumber.trim(),
    date_of_loss: claim.dateOfLoss || null,
    peril: claim.peril,
    status: claim.status,
    deductible: claim.deductible,
    rcv: claim.rcv,
    acv: claim.acv,
    depreciation: claim.depreciation,
    recoverable: claim.recoverable,
    overhead_profit: claim.overheadProfit,
    mortgage_company: claim.mortgageCompany.trim(),
    loan_number: claim.loanNumber.trim(),
    adjuster_name: claim.adjusterName.trim(),
    adjuster_email: claim.adjusterEmail.trim(),
    adjuster_phone: claim.adjusterPhone.trim(),
    notes: claim.notes,
    supplements: claim.supplements,
    checks: claim.checks,
    updated_at: claim.updatedAt,
  };
}

export function supplementIsOpen(status: SupplementStatus) {
  return status === "draft" || status === "submitted";
}

function dollars(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** One activity line when the claim, a supplement, or a check actually moves. */
export function insuranceActivityNote(before: JobInsurance | undefined, after: JobInsurance) {
  if (!before) {
    const who = after.carrier.trim() || "Insurance";
    const number = after.claimNumber.trim();
    return `Opened the ${who} claim${number ? ` ${number}` : ""}.`;
  }
  const lines: string[] = [];
  if (before.status !== after.status) {
    lines.push(`Claim is ${CLAIM_STATUS_LABELS[after.status].toLowerCase()}.`);
  }
  const previous = new Map(before.supplements.map((item) => [item.id, item]));
  for (const supplement of after.supplements) {
    const prior = previous.get(supplement.id);
    const title = supplement.title.trim() || "Untitled supplement";
    if (!prior) {
      lines.push(`Supplement “${title}” added, ${dollars(supplement.requested)} requested.`);
      continue;
    }
    if (prior.status !== supplement.status) {
      const approved =
        supplement.status === "approved" || supplement.status === "partial"
          ? ` ${dollars(supplement.approved)} approved.`
          : "";
      lines.push(`Supplement “${title}” is ${SUPPLEMENT_STATUS_LABELS[supplement.status].toLowerCase()}.${approved}`);
    }
  }
  const previousChecks = new Set(before.checks.map((item) => item.id));
  for (const check of after.checks) {
    if (previousChecks.has(check.id)) continue;
    const reference = check.reference.trim();
    lines.push(
      `${CHECK_KIND_LABELS[check.kind]} check ${dollars(check.amount)} recorded${reference ? ` (${reference})` : ""}.`,
    );
  }
  return lines.length ? lines.join(" ") : null;
}
