"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookUser } from "lucide-react";
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
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { SEAT_ROLE_LABELS } from "@/lib/types";

type BookFilter = "all" | "referral" | "mine";

export default function ContactsPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BookFilter>("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return crm.contacts.filter((contact) => {
      if (filter === "referral" && !contact.isReferralPartner) return false;
      if (filter === "mine" && contact.ownerStaffId !== crm.effectiveStaff?.id) return false;
      if (!needle) return true;
      const company = crm.getClient(contact.clientId);
      const owner = crm.staff.find((member) => member.id === contact.ownerStaffId);
      return (
        contact.name.toLowerCase().includes(needle) ||
        contact.title.toLowerCase().includes(needle) ||
        contact.email.toLowerCase().includes(needle) ||
        company?.name.toLowerCase().includes(needle) ||
        owner?.name.toLowerCase().includes(needle)
      );
    });
  }, [crm, filter, query]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Relationships"
        title="Contacts"
        description="People first. Homeowners do not need a company. Realtors, adjusters, and the occasional commercial owner can still sit on a company record."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people, homeowners, or companies"
              className="sm:w-64"
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
          icon={<BookUser className="size-5" />}
          title={query || filter !== "all" ? "No contacts match these filters" : "No contacts in this book"}
          description={
            query || filter !== "all"
              ? "Clear the search or filter to see the people you can access."
              : "Add homeowners, adjusters, and realtors to the book for this seat."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
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
                  <TableRow key={contact.id}>
                    <TableCell>
                      <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline">
                        {contact.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{contact.title}</p>
                    </TableCell>
                    <TableCell>
                      {company ? (
                        <Link href={`/clients/${company.id}`} className="hover:underline">
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
    </div>
  );
}
