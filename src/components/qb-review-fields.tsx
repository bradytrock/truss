"use client";

import { InvoiceDocument } from "@/components/invoice-document";
import { VendorPicker } from "@/components/vendor-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import { costCenterLabel } from "@/lib/job-record";
import { lineAmount } from "@/lib/money";
import { isReceiptPdf, type QbReviewItem } from "@/lib/qb-review";
import { matchVendorName, vendorChoices } from "@/lib/qb-vendors";
import {
  expensePushBlocked,
  invoicePushBlocked,
  paymentPushBlocked,
  workFromBook,
} from "@/lib/qbwc/work";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_ACCOUNTS,
  EXPENSE_METHOD_LABELS,
  EXPENSE_METHODS,
  type ExpenseAccount,
  type ExpenseMethod,
} from "@/lib/types";

export function DocumentPreview({ item }: { item: QbReviewItem }) {
  const crm = useCrm();
  if (item.kind === "invoice") {
    const invoice = item.invoice;
    const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
    const payments = crm.payments.filter((payment) => payment.invoiceId === invoice.id);
    return (
      <div className="mx-auto max-w-3xl">
        <InvoiceDocument
          invoice={invoice}
          lines={lines}
          payments={payments}
          customer={crm.customerName(invoice)}
          company={crm.company}
          status={invoice.status}
        />
      </div>
    );
  }
  const url = item.kind === "expense" ? item.expense.receiptUrl : item.payment.receiptUrl;
  const title = item.kind === "expense" ? `Receipt · ${item.expense.vendor}` : "Payment image";
  if (!url) {
    return (
      <div className="flex min-h-80 items-center justify-center border border-dashed bg-background text-sm text-muted-foreground">
        No PDF or photo on this record.
      </div>
    );
  }
  if (isReceiptPdf(url)) {
    return <iframe title={title} src={url} className="min-h-[70vh] w-full border bg-background" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="mx-auto max-h-[80vh] w-full border bg-background object-contain" />
    </a>
  );
}

export function ReviewRecordFields({ item, locked }: { item: QbReviewItem; locked: boolean }) {
  if (item.kind === "invoice") return <InvoiceFields invoiceId={item.invoice.id} locked={locked} />;
  if (item.kind === "expense") return <ExpenseFields expenseId={item.expense.id} locked={locked} />;
  return <PaymentFields paymentId={item.payment.id} locked={locked} />;
}

export function blockReason(item: QbReviewItem, crm: ReturnType<typeof useCrm>) {
  if (item.kind === "invoice") {
    const job = item.invoice.jobId ? crm.getJob(item.invoice.jobId) : undefined;
    return invoicePushBlocked({
      invoice: item.invoice,
      job,
      lines: crm.invoiceLines.filter((line) => line.invoiceId === item.invoice.id),
    });
  }
  if (item.kind === "expense") return expensePushBlocked(item.expense);
  const invoice = item.payment.invoiceId
    ? crm.invoices.find((row) => row.id === item.payment.invoiceId)
    : undefined;
  return paymentPushBlocked({
    payment: item.payment,
    invoice,
    job: item.payment.jobId ? crm.getJob(item.payment.jobId) : undefined,
  });
}

function InvoiceFields({ invoiceId, locked }: { invoiceId: string; locked: boolean }) {
  const crm = useCrm();
  const invoice = crm.invoices.find((item) => item.id === invoiceId);
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === invoiceId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!invoice) return null;
  const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
  const { work } = workFromBook({
    invoice,
    job,
    lines,
    contacts: crm.contacts,
    clients: crm.clients,
    opportunities: crm.opportunities,
  });
  const jobs = jobChoices(crm);

  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
        QuickBooks will add this on{" "}
        <span className="font-mono">
          {work.customerName}:{work.jobCode || "Job"}
        </span>{" "}
        with item {work.itemName}. Change the job or lines if that is wrong.
      </p>
      <Field label="Invoice name">
        <Input
          defaultValue={invoice.name}
          disabled={locked}
          onBlur={(event) => {
            const name = event.target.value.trim();
            if (name && name !== invoice.name) void crm.updateInvoice(invoice.id, { name });
          }}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Issued">
          <Input
            type="date"
            defaultValue={invoice.issuedAt.slice(0, 10)}
            disabled={locked}
            onBlur={(event) => {
              if (event.target.value && event.target.value !== invoice.issuedAt.slice(0, 10)) {
                void crm.updateInvoice(invoice.id, { issuedAt: event.target.value });
              }
            }}
          />
        </Field>
        <Field label="Due">
          <Input
            type="date"
            defaultValue={invoice.dueAt?.slice(0, 10) ?? ""}
            disabled={locked}
            onBlur={(event) => {
              void crm.updateInvoice(invoice.id, { dueAt: event.target.value || null });
            }}
          />
        </Field>
      </div>
      <Field label="Job">
        <Select
          value={invoice.jobId || "none"}
          onValueChange={(value) => void crm.updateInvoice(invoice.id, { jobId: value === "none" ? null : String(value) })}
          disabled={locked}
          items={[{ value: "none", label: "No job" }, ...jobs]}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No job</SelectItem>
            {jobs.map((row) => (
              <SelectItem key={row.value} value={row.value}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-xs font-medium">Lines QuickBooks will post</p>
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_4.5rem_5.5rem]">
            <Input
              defaultValue={line.description}
              disabled={locked}
              onBlur={(event) => {
                const description = event.target.value.trim();
                if (description !== line.description) void crm.updateInvoiceLine(line.id, { description });
              }}
            />
            <Input
              type="number"
              step="0.01"
              defaultValue={String(line.quantity)}
              disabled={locked}
              onBlur={(event) => {
                const quantity = Number(event.target.value);
                if (Number.isFinite(quantity) && quantity !== line.quantity) {
                  void crm.updateInvoiceLine(line.id, { quantity });
                }
              }}
            />
            <Input
              type="number"
              step="0.01"
              defaultValue={String(line.unitCost)}
              disabled={locked}
              onBlur={(event) => {
                const unitCost = Number(event.target.value);
                if (Number.isFinite(unitCost) && unitCost !== line.unitCost) {
                  void crm.updateInvoiceLine(line.id, { unitCost });
                }
              }}
            />
            <p className="text-xs text-muted-foreground sm:col-span-3">
              {line.quantity} {line.unit} · {formatMoney(lineAmount(line))}
            </p>
          </div>
        ))}
      </div>
      <Field label="Memo">
        <Textarea
          defaultValue={invoice.notes}
          disabled={locked}
          rows={2}
          onBlur={(event) => {
            if (event.target.value !== invoice.notes) void crm.updateInvoice(invoice.id, { notes: event.target.value });
          }}
        />
      </Field>
    </div>
  );
}

function ExpenseFields({ expenseId, locked }: { expenseId: string; locked: boolean }) {
  const crm = useCrm();
  const expense = crm.expenses.find((item) => item.id === expenseId);
  if (!expense) return null;
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const jobs = jobChoices(crm);
  const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;

  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
        QuickBooks will post a {expense.method === "credit_card" ? "credit card charge" : "check"} to{" "}
        <span className="font-medium">{expense.vendor || "the vendor"}</span> on{" "}
        {EXPENSE_ACCOUNT_LABELS[expense.account]}
        {job ? ` for ${job.code}` : " as overhead"}.
      </p>
      <Field label="Vendor (payee in QuickBooks)">
        <VendorPicker
          value={expense.vendor}
          names={vendors.fromQb.map((item) => item.name)}
          extraNames={vendors.extras}
          onChange={(vendor) => {
            const next = matchVendorName(vendor, [
              ...vendors.fromQb.map((item) => item.name),
              ...vendors.extras,
            ]);
            if (!locked) void crm.updateExpense(expense.id, { vendor: next || vendor });
          }}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
          <Input
            type="number"
            step="0.01"
            defaultValue={String(expense.amount)}
            disabled={locked}
            onBlur={(event) => {
              const amount = Number(event.target.value);
              if (Number.isFinite(amount) && amount !== expense.amount) {
                void crm.updateExpense(expense.id, { amount });
              }
            }}
          />
        </Field>
        <Field label="Date">
          <Input
            type="date"
            defaultValue={expense.incurredAt.slice(0, 10)}
            disabled={locked}
            onBlur={(event) => {
              if (event.target.value) void crm.updateExpense(expense.id, { incurredAt: event.target.value });
            }}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Expense account">
          <Select
            value={expense.account}
            disabled={locked}
            onValueChange={(value) => void crm.updateExpense(expense.id, { account: value as ExpenseAccount })}
            items={EXPENSE_ACCOUNTS.map((item) => ({ value: item, label: EXPENSE_ACCOUNT_LABELS[item] }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_ACCOUNTS.map((item) => (
                <SelectItem key={item} value={item}>
                  {EXPENSE_ACCOUNT_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paid with">
          <Select
            value={expense.method}
            disabled={locked}
            onValueChange={(value) => void crm.updateExpense(expense.id, { method: value as ExpenseMethod })}
            items={EXPENSE_METHODS.map((item) => ({ value: item, label: EXPENSE_METHOD_LABELS[item] }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_METHODS.map((item) => (
                <SelectItem key={item} value={item}>
                  {EXPENSE_METHOD_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Job">
        <Select
          value={expense.jobId || "none"}
          disabled={locked}
          onValueChange={(value) =>
            void crm.updateExpense(expense.id, { jobId: value === "none" ? null : String(value) })
          }
          items={[{ value: "none", label: "Overhead — not a job" }, ...jobs]}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Overhead — not a job</SelectItem>
            {jobs.map((row) => (
              <SelectItem key={row.value} value={row.value}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Memo">
        <Textarea
          defaultValue={expense.memo}
          disabled={locked}
          rows={2}
          onBlur={(event) => {
            if (event.target.value !== expense.memo) void crm.updateExpense(expense.id, { memo: event.target.value });
          }}
        />
      </Field>
      <p className="text-xs text-muted-foreground">{expense.number} · logged {formatDate(expense.createdAt)}</p>
    </div>
  );
}

function PaymentFields({ paymentId, locked }: { paymentId: string; locked: boolean }) {
  const crm = useCrm();
  const payment = crm.payments.find((item) => item.id === paymentId);
  if (!payment) return null;
  const jobs = jobChoices(crm);
  const invoices = crm.invoices
    .filter((invoice) => invoice.status !== "void")
    .map((invoice) => ({ value: invoice.id, label: `${invoice.number} · ${invoice.name}` }));

  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
        QuickBooks will receive this payment against the invoice you pick. Push that invoice first.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount">
          <Input
            type="number"
            step="0.01"
            defaultValue={String(payment.amount)}
            disabled={locked}
            onBlur={(event) => {
              const amount = Number(event.target.value);
              if (Number.isFinite(amount) && amount !== payment.amount) {
                void crm.updatePayment(payment.id, { amount });
              }
            }}
          />
        </Field>
        <Field label="Date">
          <Input
            type="date"
            defaultValue={payment.paidAt.slice(0, 10)}
            disabled={locked}
            onBlur={(event) => {
              if (event.target.value) void crm.updatePayment(payment.id, { paidAt: event.target.value });
            }}
          />
        </Field>
      </div>
      <Field label="Method">
        <Input
          defaultValue={payment.method}
          disabled={locked}
          onBlur={(event) => {
            if (event.target.value.trim() && event.target.value !== payment.method) {
              void crm.updatePayment(payment.id, { method: event.target.value.trim() });
            }
          }}
        />
      </Field>
      <Field label="Reference / check #">
        <Input
          defaultValue={payment.reference}
          disabled={locked}
          onBlur={(event) => {
            if (event.target.value !== payment.reference) {
              void crm.updatePayment(payment.id, { reference: event.target.value });
            }
          }}
        />
      </Field>
      <Field label="Apply to invoice">
        <Select
          value={payment.invoiceId || "none"}
          disabled={locked}
          onValueChange={(value) =>
            void crm.updatePayment(payment.id, { invoiceId: value === "none" ? null : String(value) })
          }
          items={[{ value: "none", label: "Unapplied" }, ...invoices]}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unapplied</SelectItem>
            {invoices.map((row) => (
              <SelectItem key={row.value} value={row.value}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Job">
        <Select
          value={payment.jobId || "none"}
          disabled={locked}
          onValueChange={(value) =>
            void crm.updatePayment(payment.id, { jobId: value === "none" ? null : String(value) })
          }
          items={[{ value: "none", label: "No job" }, ...jobs]}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No job</SelectItem>
            {jobs.map((row) => (
              <SelectItem key={row.value} value={row.value}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function jobChoices(crm: ReturnType<typeof useCrm>) {
  return [...crm.jobs]
    .filter((job) => !job.deletedAt)
    .sort((a, b) =>
      costCenterLabel(a, crm.opportunities).localeCompare(costCenterLabel(b, crm.opportunities)),
    )
    .map((job) => ({
      value: job.id,
      label: costCenterLabel(job, crm.opportunities),
    }));
}
