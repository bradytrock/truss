import { formatDate, formatMoney, localYmd } from "@/lib/format";
import { formatPhoneInput } from "@/lib/phone";
import { jobAddress } from "@/lib/job-record";
import { lineIncluded } from "@/lib/estimate-totals";
import { tradeSummary, type CompanySettings, type Estimate, type EstimateLine, type Job } from "@/lib/types";

export type CompletionCertificate = {
  companyName: string;
  licenseNumber: string;
  phone: string;
  ownerName: string;
  propertyAddress: string;
  jobName: string;
  jobCode: string;
  startDate: string;
  completionDate: string;
  permitNumber: string;
  contractAmount: string;
  scope: string;
  materials: string;
  warranty: string;
  notes: string;
  preparedBy: string;
  ownerSignature: string;
  contractorSignature: string;
};

type CertificateEstimate = Pick<
  Estimate,
  "id" | "status" | "acceptedAt" | "createdAt" | "signatureName" | "archivedAt"
>;

type CertificateLine = Pick<EstimateLine, "estimateId" | "title" | "optional" | "selected" | "sortOrder">;

export function completionCertificateFilename(jobName: string) {
  const base = jobName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Job";
  return `${base} certificate of completion.pdf`;
}

export function completionCertificateDateLabel(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const formatted = formatDate(raw);
  return formatted === "—" ? raw : formatted;
}

export function completionCertificateStatement(
  certificate: Pick<CompletionCertificate, "ownerName" | "propertyAddress" | "completionDate">,
) {
  const owner = certificate.ownerName.trim() || "the property owner";
  const place = certificate.propertyAddress.trim() || "the property named above";
  const when = completionCertificateDateLabel(certificate.completionDate);
  const finished = when ? ` as of ${when}` : "";
  return `This certifies that the work described above was completed for ${owner} at ${place} in accordance with the contract and is accepted as finished${finished}.`;
}

function toYmd(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return localYmd(date);
}

function preferredEstimate(estimates: CertificateEstimate[]) {
  const open = estimates.filter((estimate) => !estimate.archivedAt && estimate.status !== "declined");
  const accepted = open.filter((estimate) => estimate.status === "accepted");
  const pool = accepted.length > 0 ? accepted : open;
  return pool.slice().sort((a, b) => {
    const aKey = a.acceptedAt || a.createdAt;
    const bKey = b.acceptedAt || b.createdAt;
    return bKey.localeCompare(aKey);
  })[0];
}

function scopeFromSources(
  job: Pick<Job, "description" | "trades">,
  estimate: CertificateEstimate | undefined,
  lines: CertificateLine[],
) {
  const description = job.description.trim();
  if (description) return description;
  if (estimate) {
    const titles = lines
      .filter((line) => line.estimateId === estimate.id && lineIncluded(line))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => line.title.trim())
      .filter(Boolean);
    if (titles.length > 0) return titles.map((title) => `- ${title}`).join("\n");
  }
  const trades = tradeSummary(job.trades);
  return trades === "Trades involved" ? "" : trades;
}

export function completionCertificateDraft(input: {
  job: Pick<
    Job,
    | "name"
    | "code"
    | "description"
    | "contractValue"
    | "startDate"
    | "substantialCompletion"
    | "street"
    | "city"
    | "state"
    | "postalCode"
    | "location"
    | "trades"
  >;
  customerName: string;
  company: Pick<CompanySettings, "name" | "licenseNumber" | "phone">;
  preparedBy: string;
  estimates?: CertificateEstimate[];
  estimateLines?: CertificateLine[];
  today?: string;
}): CompletionCertificate {
  const estimates = input.estimates ?? [];
  const lines = input.estimateLines ?? [];
  const chosen = preferredEstimate(estimates);
  const preparedBy = input.preparedBy.trim();
  const today = input.today?.trim() || localYmd(new Date());
  return {
    companyName: input.company.name.trim(),
    licenseNumber: input.company.licenseNumber.trim(),
    phone: formatPhoneInput(input.company.phone),
    ownerName: input.customerName.trim(),
    propertyAddress: jobAddress(input.job),
    jobName: input.job.name.trim(),
    jobCode: input.job.code.trim(),
    startDate: toYmd(input.job.startDate),
    completionDate: toYmd(input.job.substantialCompletion) || today,
    permitNumber: "",
    contractAmount: input.job.contractValue > 0 ? formatMoney(input.job.contractValue) : "",
    scope: scopeFromSources(input.job, chosen, lines),
    materials: "",
    warranty: "",
    notes: "",
    preparedBy,
    ownerSignature: chosen?.status === "accepted" ? chosen.signatureName.trim() : "",
    contractorSignature: preparedBy,
  };
}
