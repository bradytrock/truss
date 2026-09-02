"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ContactRecordWindow } from "@/components/contact-window";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { groupContactsByLetter, siteForContact, siteLabelFromRecord } from "@/lib/contacts";
import { useCrm } from "@/lib/crm-store";
import { formatPhone, initials } from "@/lib/format";
import { contactMatchesQuery } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { Contact } from "@/lib/types";

type BookFilter = "homeowners" | "partners" | "mine";

const FILTERS: { value: BookFilter; label: string }[] = [
  { value: "homeowners", label: "Homeowners" },
  { value: "partners", label: "Partners" },
  { value: "mine", label: "My book" },
];

export default function ContactsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ContactsBookPage />
    </Suspense>
  );
}

function ContactsBookPage() {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BookFilter>("homeowners");
  const contactId = searchParams.get("contact");
  const openContact = contactId ? crm.getContact(contactId) : undefined;

  const selectContact = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("contact", id);
      router.replace(`/contacts?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const closeContact = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contact");
    const qs = params.toString();
    router.replace(qs ? `/contacts?${qs}` : "/contacts", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!crm.hydrated || !contactId || openContact) return;
    closeContact();
  }, [closeContact, crm.hydrated, contactId, openContact]);

  const sites = useMemo(() => [...crm.jobs, ...crm.opportunities], [crm.jobs, crm.opportunities]);

  const rows = useMemo(() => {
    const needle = query.trim();
    return crm.contacts.filter((contact) => {
      if (filter === "homeowners" && contact.isReferralPartner) return false;
      if (filter === "partners" && !contact.isReferralPartner) return false;
      if (filter === "mine" && contact.ownerStaffId !== crm.effectiveStaff?.id) return false;
      if (!needle) return true;
      const company = crm.getClient(contact.clientId);
      const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
      const address = siteLabelFromRecord(siteForContact(contact.id, sites));
      return contactMatchesQuery(contact, query, [company?.name, owner?.name, address]);
    });
  }, [crm, filter, query, sites]);

  const groups = useMemo(() => groupContactsByLetter(rows), [rows]);
  const letters = useMemo(() => groups.map((group) => group.letter), [groups]);

  const counts = useMemo(() => {
    const mineId = crm.effectiveStaff?.id;
    return {
      homeowners: crm.contacts.filter((contact) => !contact.isReferralPartner).length,
      partners: crm.contacts.filter((contact) => contact.isReferralPartner).length,
      mine: crm.contacts.filter((contact) => contact.ownerStaffId === mineId).length,
    };
  }, [crm.contacts, crm.effectiveStaff?.id]);

  if (!crm.hydrated) return <LoadingScreen />;

  const looking = Boolean(query.trim()) || filter !== "homeowners";

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Contact book"
        title="Contacts"
        description="Homeowners on this book, filed A to Z by last name. Partners — adjusters, realtors, and the rest — sit on their own tab."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Whose book"
          className="grid grid-cols-3 rounded-md bg-muted p-[3px] sm:inline-grid sm:w-auto"
        >
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            const count = counts[item.value];
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(item.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="ml-1.5 tabular-nums text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
        <Input
          type="search"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, phone, or street"
          className="sm:max-w-72"
          aria-label="Search the contact book"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={looking ? "No one matches" : "No homeowners in this book"}
          description={
            looking
              ? "Clear the search or switch tabs to see the rest of the book."
              : "Add a homeowner from Create, or start a lead. They show up here without a company."
          }
        />
      ) : (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            {groups.map((group) => (
              <section key={group.letter} id={`letter-${group.letter}`} className="scroll-mt-16">
                <h2 className="font-heading sticky top-12 z-10 -mx-1 bg-background/95 px-1 py-2 text-2xl leading-none text-foreground backdrop-blur">
                  {group.letter}
                </h2>
                <ul className="divide-y">
                  {group.contacts.map((contact) => (
                    <li key={contact.id}>
                      <ContactBookRow
                        contact={contact}
                        address={siteLabelFromRecord(siteForContact(contact.id, sites))}
                        companyName={crm.getClient(contact.clientId)?.name ?? ""}
                        selected={contact.id === contactId}
                        onOpen={() => selectContact(contact.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {letters.length > 1 ? (
            <nav
              aria-label="Jump to letter"
              className="sticky top-16 hidden h-fit shrink-0 flex-col items-center gap-0.5 py-1 sm:flex"
            >
              {letters.map((letter) => (
                <a
                  key={letter}
                  href={`#letter-${letter}`}
                  className="px-1 text-[11px] leading-4 font-medium text-muted-foreground hover:text-foreground"
                >
                  {letter}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      )}
      {openContact ? (
        <ContactRecordWindow key={openContact.id} contact={openContact} onClose={closeContact} />
      ) : null}
    </div>
  );
}

function ContactBookRow({
  contact,
  address,
  companyName,
  selected,
  onOpen,
}: {
  contact: Contact;
  address: string;
  companyName: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const phone = formatPhone(contact.phone);
  const phoneLine = phone === "—" ? "" : phone;
  const partner = contact.isReferralPartner;
  const role = contact.title.trim();
  const showRole = partner && role && role.toLowerCase() !== "homeowner";
  const secondary = partner
    ? [showRole ? role : "", companyName].filter(Boolean).join(" · ")
    : address;
  const tertiary = phoneLine || contact.email.trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-1 py-3 text-left sm:px-2",
        selected ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <Avatar size="lg" className="bg-primary/10">
        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
          {initials(contact.name) || "?"}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate font-medium">{contact.name}</span>
          {partner ? (
            <span className="text-xs text-muted-foreground">Partner</span>
          ) : null}
        </span>
        {tertiary ? (
          <span className="mt-0.5 block truncate text-sm tabular-nums text-foreground/80">{tertiary}</span>
        ) : null}
        {secondary ? (
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">{secondary}</span>
        ) : null}
      </span>
    </button>
  );
}
