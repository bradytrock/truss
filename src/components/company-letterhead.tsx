"use client";

import { formatCompanyAddress, formatCompanyContact } from "@/lib/format";
import { useCrm } from "@/lib/crm-store";

export function CompanyLetterhead({ className }: { className?: string }) {
  const { company } = useCrm();
  const address = formatCompanyAddress(company);
  const contact = formatCompanyContact(company);

  return (
    <div className={className}>
      <p className="font-heading text-lg font-medium">{company.name}</p>
      {address ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{address}</p> : null}
      {contact ? <p className="text-xs leading-relaxed text-muted-foreground">{contact}</p> : null}
      {company.licenseNumber ? (
        <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
          License {company.licenseNumber}
        </p>
      ) : null}
    </div>
  );
}
