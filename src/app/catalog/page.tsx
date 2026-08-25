"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { CATALOG_KIND_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export default function CatalogPage() {
  const crm = useCrm();

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Preconstruction"
        title="Price book"
        description="Labor, material, equipment, allowances, and subcontract packages estimators drop onto a proposal. This is the catalog behind every estimate."
      />

      {crm.catalog.length === 0 ? (
        <EmptyState
          title="Price book is empty"
          description="Reset the Northline demo to load CSI-style items, or connect Supabase and run the second migration."
        />
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {crm.catalog.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="tabular-nums">{item.costCode}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {CATALOG_KIND_LABELS[item.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.unitCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Use these lines when you{" "}
        <Link href="/estimates" className="text-primary hover:underline">
          draft an estimate
        </Link>
        .
      </p>
    </div>
  );
}
