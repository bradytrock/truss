import { NORTHLINE_COMPANY, type CompanySettings } from "@/lib/types";

type StaffContact = { id: string; name: string; title?: string; email: string };

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
  const staffId =
    input.job?.ownerStaffId || input.opportunity?.ownerStaffId || input.fallbackStaffId || "";
  const byId = staffId ? input.staff.find((member) => member.id === staffId) : undefined;
  if (byId) return byId;
  const name =
    input.job?.projectManager?.trim() ||
    input.job?.salesRep?.trim() ||
    input.opportunity?.estimator?.trim() ||
    "";
  if (!name) return undefined;
  return input.staff.find((member) => member.name === name);
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
    phone: input.companyPhone?.trim() ?? "",
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
