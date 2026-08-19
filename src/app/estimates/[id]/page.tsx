"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { EstimateStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import { lineAmount, sumLines } from "@/lib/money";
import { CATALOG_KIND_LABELS } from "@/lib/types";

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const crm = useCrm();
  const estimate = crm.getEstimate(id);
  const [notes, setNotes] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!estimate) {
    return (
      <EmptyState
        icon={<span className="text-sm font-medium">?</span>}
        title="Estimate not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/estimates" />}>
            Back to estimates
          </Button>
        }
      />
    );
  }

  const client = crm.getClient(estimate.clientId);
  const opportunity = estimate.opportunityId ? crm.getOpportunity(estimate.opportunityId) : undefined;
  const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
  const lines = crm.estimateLines
    .filter((line) => line.estimateId === estimate.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const total = sumLines(lines);
  const relatedInvoice = crm.invoices.find((invoice) => invoice.estimateId === estimate.id);
  const editable = estimate.status === "draft";
  const canConvert = estimate.status === "sent" || estimate.status === "accepted" || estimate.status === "viewed";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {estimate.number}
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {estimate.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EstimateStatusBadge status={estimate.status} />
            <span className="text-sm text-muted-foreground">
              {crm.customerName(estimate)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {estimate.status === "draft" ? (
            <Button
              disabled={pending || lines.length === 0}
              onClick={() => {
                setPending(true);
                void crm.sendEstimate(estimate.id).then(() => {
                  toast.success("Proposal marked sent.");
                  setPending(false);
                });
              }}
            >
              Send proposal
            </Button>
          ) : null}
          {estimate.status === "sent" || estimate.status === "viewed" ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void crm.acceptEstimate(estimate.id);
                  toast.success("Marked accepted.");
                }}
              >
                Mark accepted
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  void crm.declineEstimate(estimate.id);
                  toast.message("Marked declined.");
                }}
              >
                Decline
              </Button>
            </>
          ) : null}
          {canConvert && !relatedInvoice ? (
            <Button
              disabled={pending}
              onClick={() => {
                setPending(true);
                void crm
                  .convertEstimateToInvoice(estimate.id)
                  .then((invoice) => {
                    toast.success(`${invoice.number} created from this proposal.`);
                    router.push(`/invoices/${invoice.id}`);
                  })
                  .catch(() => setPending(false));
              }}
            >
              Convert to invoice
            </Button>
          ) : null}
          {relatedInvoice ? (
            <Button nativeButton={false} variant="outline" render={<Link href={`/invoices/${relatedInvoice.id}`} />}>
              Open {relatedInvoice.number}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Line items</CardTitle>
              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <Select
                    key={lines.length}
                    onValueChange={(value) => {
                      if (value) void crm.addEstimateLineFromCatalog(estimate.id, String(value));
                    }}
                    items={crm.catalog.map((item) => ({
                      value: item.id,
                      label: `${item.costCode} · ${item.name}`,
                    }))}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Add from price book" />
                    </SelectTrigger>
                    <SelectContent>
                      {crm.catalog.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.costCode} · {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => void crm.addCustomEstimateLine(estimate.id)}>
                    Custom line
                  </Button>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {lines.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                No lines yet. Pull CSI items from the price book or add a lump-sum line.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-20">Unit</TableHead>
                    <TableHead className="w-32 text-right">Unit cost</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                    {editable ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {editable ? (
                          <Input
                            defaultValue={line.description}
                            onBlur={(event) => {
                              const value = event.target.value;
                              if (value !== line.description) {
                                void crm.updateEstimateLine(line.id, { description: value });
                              }
                            }}
                          />
                        ) : (
                          line.description
                        )}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={line.quantity}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (value !== line.quantity) {
                                void crm.updateEstimateLine(line.id, { quantity: value });
                              }
                            }}
                          />
                        ) : (
                          <span className="tabular-nums">{line.quantity}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Input
                            defaultValue={line.unit}
                            onBlur={(event) => {
                              const value = event.target.value;
                              if (value !== line.unit) {
                                void crm.updateEstimateLine(line.id, { unit: value });
                              }
                            }}
                          />
                        ) : (
                          line.unit
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editable ? (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="text-right"
                            defaultValue={line.unitCost}
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (value !== line.unitCost) {
                                void crm.updateEstimateLine(line.id, { unitCost: value });
                              }
                            }}
                          />
                        ) : (
                          <span className="tabular-nums">{formatMoney(line.unitCost)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(lineAmount(line))}
                      </TableCell>
                      {editable ? (
                        <TableCell>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Remove line"
                            onClick={() => void crm.removeEstimateLine(line.id)}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={editable ? 4 : 4} className="font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrencyFull(total)}
                    </TableCell>
                    {editable ? <TableCell /> : null}
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Proposal</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordProperty label="Customer">
                {client ? (
                  <Link href={`/clients/${client.id}`} className="hover:underline">
                    {client.name}
                  </Link>
                ) : (
                  crm.customerName(estimate)
                )}
              </RecordProperty>
              <RecordProperty label="Pursuit">
                {opportunity ? (
                  <Link href={`/opportunities/${opportunity.id}`} className="hover:underline">
                    {opportunity.name}
                  </Link>
                ) : (
                  "—"
                )}
              </RecordProperty>
              <RecordProperty label="Job">
                {job ? (
                  <Link href={`/jobs/${job.id}`} className="hover:underline">
                    {job.name}
                  </Link>
                ) : (
                  "—"
                )}
              </RecordProperty>
              <RecordProperty label="Valid until">{formatDate(estimate.validUntil)}</RecordProperty>
              <RecordProperty label="Sent">{formatDate(estimate.sentAt)}</RecordProperty>
              <RecordProperty label="Accepted">{formatDate(estimate.acceptedAt)}</RecordProperty>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={notes ?? estimate.notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                disabled={!editable && estimate.status === "declined"}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void crm.updateEstimate(estimate.id, { notes: notes ?? estimate.notes });
                    toast.success("Notes saved.");
                  }}
                >
                  Save notes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Price book</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {crm.catalog.length} catalog items across{" "}
                {new Set(crm.catalog.map((item) => CATALOG_KIND_LABELS[item.kind])).size} kinds.{" "}
                <Link href="/catalog" className="text-primary hover:underline">
                  Open the book
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
