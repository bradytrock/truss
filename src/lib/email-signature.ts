import type { CompanySettings, StaffMember } from "@/lib/types";

export function resolveEmailSignature(
  company: Pick<CompanySettings, "defaultEmailSignature">,
  staff?: Pick<StaffMember, "emailSignature"> | null,
) {
  const own = staff?.emailSignature?.trim() ?? "";
  if (own) return own;
  return company.defaultEmailSignature?.trim() ?? "";
}

export function appendEmailSignature(body: string, signature: string) {
  const sig = signature.trim();
  if (!sig) return body;
  const text = body.replace(/\s+$/, "");
  if (!text) return `\n\n${sig}`;
  if (text.endsWith(sig)) return body;
  return `${text}\n\n${sig}`;
}
