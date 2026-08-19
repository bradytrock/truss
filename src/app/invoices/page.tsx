"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate } from "@/lib/format";
import { derivedInvoiceStatus, invoiceBalance, invoiceTotal, paidOnInvoice } from "@/lib/money";
import { INVOICE_STATUS_LABELS, INVOICE_STATUSES, type InvoiceStatus } from "@/lib/types";

export default function InvoicesPage() {
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [create, setCreate] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return crm.invoices
      .map((invoice) => ({
        invoice,
        status: derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments),
        total: invoiceTotal(invoice.id, crm.invoiceLines),
        paid: paidOnInvoice(invoice.id, crm.payments),
        balance: invoiceBalance(invoice.id, crm.invoiceLines, crm.payments),
      }))
      .filter((row) => {
        if (status !== "all" && row.status !== status) return false;
        if (!needle) return true;
        const client = crm.getClient(row.invoice.clientId);
        return (
          row.invoice.name.toLowerCase().includes(needle) ||
          row.invoice.number.toLowerCase().includes(needle) ||
          (client?.name.toLowerCase().includes(needle) ?? false)
        );
      });
  }, [crm, query, status]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Draws, deposits, and retainage. Record the check when it hits — outstanding AR is what the office actually tracks."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search invoices"
              className="sm:w-56"
            />
            <Select
              value={status}
              onValueChange={(value) => setStatus((value as InvoiceStatus | "all") ?? "all")}
              items={[
                { value: "all", label: "All statuses" },
                ...INVOICE_STATUSES.map((item) => ({
                  value: item,
                  label: INVOICE_STATUS_LABELS[item],
                })),
              ]}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {INVOICE_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {INVOICE_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setCreate(true)}>New invoice</Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title={query || status !== "all" ? "No invoices match these filters" : "No invoices yet"}
          description={
            query || status !== "all"
              ? "Clear the search or status filter."
              : "Convert an accepted estimate, or log a draw against a job."
          }
          action={<Button onClick={() => setCreate(true)}>New invoice</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ invoice, status: rowStatus, total, balance }) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                      {invoice.number}
                    </Link>
                    <p className="text-xs text-muted-foreground">{invoice.name}</p>
                  </TableCell>
                  <TableCell>{crm.getClient(invoice.clientId)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={rowStatus} />
                  </TableCell>
                  <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrencyFull(total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrencyFull(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateInvoiceDialog open={create} onOpenChange={setCreate} />
    </div>
  );
}
