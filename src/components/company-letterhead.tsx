"use client";

import { formatCompanyAddress, formatCompanyContact } from "@/lib/format";
import { useCrmOptional } from "@/lib/crm-store";
import { NORTHLINE_COMPANY, type CompanySettings } from "@/lib/types";

export function CompanyLetterhead({
  className,
  company,
}: {
  className?: string;
  company?: CompanySettings;
}) {
  const crm = useCrmOptional();
  const resolved = company ?? crm?.company ?? NORTHLINE_COMPANY;
  const address = formatCompanyAddress(resolved);
  const contact = formatCompanyContact(resolved);

  return (
    <div className={className}>
      <p className="font-heading text-lg font-medium">{resolved.name}</p>
      {address ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{address}</p> : null}
      {contact ? <p className="text-xs leading-relaxed text-muted-foreground">{contact}</p> : null}
      {resolved.licenseNumber ? (
        <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
          License {resolved.licenseNumber}
        </p>
      ) : null}
    </div>
  );
}
