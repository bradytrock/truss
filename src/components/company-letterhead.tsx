"use client";

import { formatCompanyAddress, formatCompanyContact } from "@/lib/format";
import { useCrmOptional } from "@/lib/crm-store";
import { NORTHLINE_COMPANY, type CompanySettings } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const logoUrl = resolved.logoUrl?.trim();

  return (
    <div className={cn("flex items-start gap-3", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-12 w-auto max-w-[9rem] shrink-0 object-contain object-left"
        />
      ) : null}
      <div className="min-w-0">
        <p className="font-heading text-lg font-medium">{resolved.name}</p>
        {address ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{address}</p> : null}
        {contact ? <p className="text-xs leading-relaxed text-muted-foreground">{contact}</p> : null}
        {resolved.licenseNumber ? (
          <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
            License {resolved.licenseNumber}
          </p>
        ) : null}
      </div>
    </div>
  );
}
