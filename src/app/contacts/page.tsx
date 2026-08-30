"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ContactRecordWindow } from "@/components/contact-window";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { contactMatchesQuery } from "@/lib/phone";
import { SEAT_ROLE_LABELS } from "@/lib/types";

type BookFilter = "all" | "referral" | "mine";

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
  const [filter, setFilter] = useState<BookFilter>("all");
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

  const rows = useMemo(() => {
    const needle = query.trim();
    return crm.contacts.filter((contact) => {
      if (filter === "referral" && !contact.isReferralPartner) return false;
      if (filter === "mine" && contact.ownerStaffId !== crm.effectiveStaff?.id) return false;
      if (!needle) return true;
      const company = crm.getClient(contact.clientId);
      const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
      return contactMatchesQuery(contact, query, [company?.name, owner?.name]);
    });
  }, [crm.contacts, crm.effectiveStaff?.id, crm, filter, query]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Relationships"
        title="Contacts"
        description="People first. Homeowners do not need a company. Realtors, adjusters, and the occasional commercial owner can still sit on a company record."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onValueChange={setQuery}
              placeholder="Search name, phone, email, or company"
              className="sm:w-64"
              aria-label="Search contacts"
            />
            <Select
              value={filter}
              onValueChange={(value) => setFilter((value as BookFilter) ?? "all")}
              items={[
                { value: "all", label: "Everyone in view" },
                { value: "referral", label: "Referral partners" },
                { value: "mine", label: "In my book" },
              ]}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone in view</SelectItem>
                <SelectItem value="referral">Referral partners</SelectItem>
                <SelectItem value="mine">In my book</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title={query || filter !== "all" ? "No contacts match these filters" : "No contacts in this book"}
          description={
            query || filter !== "all"
              ? "Clear the search or filter to see the people you can access."
              : "Add homeowners, adjusters, and realtors to the book for this seat."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="hidden sm:table-cell">Book</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((contact) => {
                const company = crm.getClient(contact.clientId);
                const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
                return (
                  <TableRow
                    key={contact.id}
                    data-state={contact.id === contactId ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => selectContact(contact.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectContact(contact.id);
                      }
                    }}
                    tabIndex={0}
                  >
                    <TableCell>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-xs text-muted-foreground">{contact.title}</p>
                    </TableCell>
                    <TableCell>
                      {company ? (
                        <Link
                          href={`/clients/${company.id}`}
                          className="hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {company.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Homeowner</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {contact.phone || contact.email || "—"}
                    </TableCell>
                    <TableCell>
                      <p>{owner?.name ?? "Unassigned"}</p>
                      {owner ? (
                        <p className="text-xs text-muted-foreground">{SEAT_ROLE_LABELS[owner.role]}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {contact.isReferralPartner ? (
                        <Badge variant="secondary">Referral partner</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {openContact ? (
        <ContactRecordWindow key={openContact.id} contact={openContact} onClose={closeContact} />
      ) : null}
    </div>
  );
}
