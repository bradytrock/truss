import { NORTHLINE_COMPANY, type CompanySettings } from "@/lib/types";

type StaffEmail = { id: string; name: string; email: string };

export function documentOwnerEmail(input: {
  job?: { ownerStaffId?: string | null; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffEmail[];
  fallbackStaffId?: string;
}) {
  const staffId =
    input.job?.ownerStaffId || input.opportunity?.ownerStaffId || input.fallbackStaffId || "";
  const byId = staffId ? input.staff.find((member) => member.id === staffId) : undefined;
  if (byId?.email.trim()) return byId.email.trim();
  const name = input.job?.salesRep?.trim() || input.opportunity?.estimator?.trim() || "";
  const byName = name
    ? input.staff.find((member) => member.name === name && member.email.trim())
    : undefined;
  return byName?.email.trim() ?? "";
}

export function companyWithOwnerEmail(company: CompanySettings | undefined, ownerEmail: string): CompanySettings {
  const base = company ?? NORTHLINE_COMPANY;
  return { ...base, email: ownerEmail.trim() };
}

export function letterheadCompanyForRecord(input: {
  company?: CompanySettings;
  job?: { ownerStaffId?: string | null; salesRep?: string } | null;
  opportunity?: { ownerStaffId?: string | null; estimator?: string } | null;
  staff: StaffEmail[];
  fallbackStaffId?: string;
  inBook: boolean;
}): CompanySettings {
  const ownerEmail =
    input.inBook || input.job || input.opportunity
      ? documentOwnerEmail(input)
      : input.company?.email ?? "";
  return companyWithOwnerEmail(input.company, ownerEmail);
}
