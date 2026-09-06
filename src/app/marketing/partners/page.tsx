"use client";

import Link from "next/link";
import { EmptyState } from "@/components/page-chrome";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm-store";

export default function MarketingPartnersPage() {
  const crm = useCrm();
  const partners = crm.contacts.filter((contact) => contact.isReferralPartner);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-medium">Realtor co-brand kits</h2>
        <p className="text-sm text-muted-foreground">
          Generate a preferred-vendor one-pager with the partner’s name merged in.
        </p>
      </div>
      {partners.length === 0 ? (
        <EmptyState
          title="No referral partners yet"
          description="Mark a contact as a referral partner, then build a co-brand kit here."
          action={
            <Button nativeButton={false} render={<Link href="/contacts" />} size="sm">
              Open contacts
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {partners.map((partner) => (
            <li key={partner.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-medium">{partner.name}</p>
                <p className="text-xs text-muted-foreground">
                  {partner.title || "Referral partner"}
                  {partner.phone ? ` · ${partner.phone}` : ""}
                </p>
              </div>
              <Button
                nativeButton={false}
                size="sm"
                render={
                  <Link href={`/marketing/create?template=tpl-realtor-cobrand&partner=${partner.id}`} />
                }
              >
                Build co-brand kit
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
