import { contactOptionParts } from "@/lib/contacts";
import type { Contact } from "@/lib/types";

type Site = Parameters<typeof contactOptionParts>[1][number];

export function ContactSelectOption({
  contact,
  sites,
}: {
  contact: Pick<Contact, "id" | "name" | "phone" | "email">;
  sites: Site[];
}) {
  const { name, phone, address, email } = contactOptionParts(contact, sites);
  const headline = [name, phone].filter(Boolean).join(" · ");
  const detail = address || (!phone ? email : "");
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 text-left whitespace-normal">
      <span>{headline}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </span>
  );
}
