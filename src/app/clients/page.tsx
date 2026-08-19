"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { TypeBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency } from "@/lib/format";

export default function ClientsPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return crm.clients.filter((client) => {
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        client.city.toLowerCase().includes(needle) ||
        client.notes.toLowerCase().includes(needle)
      );
    });
  }, [crm.clients, query]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={crm.resetDemo} />
      ) : null}
      <PageHeader
        eyebrow="Relationships"
        title="Clients"
        description="Owners, developers, public agencies, and the architects who put Northline on the bid list."
        actions={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients"
            className="w-full sm:w-64"
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={query ? "No clients match that search" : "No clients yet"}
          description={
            query
              ? "Try a company name or city."
              : "Add the owners and developers you actually chase work with."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((client) => {
            const contacts = crm.contacts.filter((contact) => contact.clientId === client.id);
            const opps = crm.opportunities.filter(
              (opportunity) =>
                opportunity.clientId === client.id &&
                opportunity.stage !== "lost" &&
                opportunity.stage !== "awarded"
            );
            const jobs = crm.jobs.filter(
              (job) => job.clientId === client.id && job.status !== "complete"
            );
            const pipeline = opps.reduce((sum, opportunity) => sum + opportunity.value, 0);
            return (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{client.name}</CardTitle>
                      <TypeBadge type={client.type} />
                    </div>
                    <CardDescription>
                      {client.city}, {client.state}
                      {contacts[0] ? ` · ${contacts[0].name}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{opps.length} open · {jobs.length} in field</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {pipeline ? formatCurrency(pipeline) : "—"}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
