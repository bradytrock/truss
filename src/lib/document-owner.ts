import { namesMatch } from "@/lib/seats";
import { NORTHLINE_COMPANY, type CompanySettings } from "@/lib/types";

type StaffContact = {
  id: string;
  name: string;
  title?: string;
  email: string;
  phone?: string;
  emailSignature?: string;
};

export type ProjectManagerContact = {
  name: string;
  title: string;
  email: string;
  phone: string;
};

export function documentOwnerStaff(input: {
  job?: { ownerStaffId?: string | null; projectManager?: string; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffContact[];
  fallbackStaffId?: string;
}) {
  const staffId = input.job?.ownerStaffId || input.opportunity?.ownerStaffId || "";
  const byId = staffId ? input.staff.find((member) => member.id === staffId) : undefined;
  if (byId) return byId;
  const name =
    input.job?.projectManager?.trim() ||
    input.job?.salesRep?.trim() ||
    input.opportunity?.estimator?.trim() ||
    "";
  if (name) {
    const byName = input.staff.find((member) => namesMatch(member.name, name));
    if (byName) return byName;
  }
  const fallbackId = input.fallbackStaffId || "";
  if (!fallbackId) return undefined;
  return input.staff.find((member) => member.id === fallbackId);
}

export function documentOwnerEmail(input: {
  job?: { ownerStaffId?: string | null; projectManager?: string; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffContact[];
  fallbackStaffId?: string;
}) {
  const owner = documentOwnerStaff(input);
  if (owner?.email.trim()) return owner.email.trim();
  return "";
}

export function documentProjectManager(input: {
  job?: { ownerStaffId?: string | null; projectManager?: string; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffContact[];
  fallbackStaffId?: string;
  companyPhone?: string;
}): ProjectManagerContact | null {
  const owner = documentOwnerStaff(input);
  const named =
    owner?.name.trim() ||
    input.job?.projectManager?.trim() ||
    input.job?.salesRep?.trim() ||
    input.opportunity?.estimator?.trim() ||
    "";
  if (!named) return null;
  return {
    name: named,
    title: owner?.title?.trim() || "Project Manager",
    email: owner?.email.trim() ?? "",
    phone: owner?.phone?.trim() || input.companyPhone?.trim() || "",
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim() ?? "";
    if (trimmed) return trimmed;
  }
  return "";
}

/** Project manager fields used when emailing a share link. */
export function shareEmailOwnerFromBook(input: {
  job?: { ownerStaffId?: string | null; projectManager?: string; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffContact[];
  fallbackStaffId?: string;
  /** Seat currently sending (viewer / effective staff). */
  senderStaff?: StaffContact | null;
  /** Auth login email when the seat row has none yet. */
  loginEmail?: string;
  companyPhone?: string;
  companyEmail?: string;
  companySignature?: string;
}): {
  name: string;
  title: string;
  email: string;
  phone: string;
  signature: string;
} | null {
  const pm = documentProjectManager(input);
  const owner = documentOwnerStaff(input);
  const sender = input.senderStaff ?? undefined;
  const fallback = input.fallbackStaffId
    ? input.staff.find((member) => member.id === input.fallbackStaffId)
    : undefined;

  const displayName = firstNonEmpty(pm?.name, sender?.name, fallback?.name);
  if (!displayName) return null;

  const sameAsSender =
    Boolean(sender) &&
    ((Boolean(owner && sender && owner.id === sender.id) ||
      Boolean(sender && namesMatch(sender.name, displayName))));

  const email = firstNonEmpty(
    pm?.email,
    sameAsSender ? sender?.email : "",
    // Prefer the sender's email when the job PM seat has none — they are sending.
    sender?.email,
    fallback?.email,
    input.loginEmail,
    input.companyEmail,
  );

  const title =
    firstNonEmpty(pm?.title, sameAsSender ? sender?.title : "", sender?.title, fallback?.title) ||
    "Project Manager";
  const phone = firstNonEmpty(
    pm?.phone,
    sameAsSender ? sender?.phone : "",
    sender?.phone,
    fallback?.phone,
    input.companyPhone,
  );

  const signature = firstNonEmpty(
    sameAsSender ? sender?.emailSignature : "",
    owner?.emailSignature,
    sender?.emailSignature,
    fallback?.emailSignature,
    input.companySignature,
  );

  return {
    name: displayName,
    title,
    email,
    phone,
    signature,
  };
}

export function companyWithOwnerEmail(company: CompanySettings | undefined, ownerEmail: string): CompanySettings {
  const base = company ?? NORTHLINE_COMPANY;
  return { ...base, email: ownerEmail.trim() };
}

export function letterheadCompanyForRecord(input: {
  company?: CompanySettings;
  job?: { ownerStaffId?: string | null; projectManager?: string; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffContact[];
  fallbackStaffId?: string;
  inBook: boolean;
}): CompanySettings {
  const ownerEmail =
    input.inBook || input.job || input.opportunity
      ? documentOwnerEmail(input)
      : input.company?.email ?? "";
  return companyWithOwnerEmail(input.company, ownerEmail);
}
