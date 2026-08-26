"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceDocument } from "@/components/invoice-document";
import { VendorPicker } from "@/components/vendor-picker";
import { QbStatusBadge } from "@/components/status-badge";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { costCenterLabel } from "@/lib/job-record";
import { invoiceTotal, lineAmount } from "@/lib/money";
import { matchVendorName, vendorChoices } from "@/lib/qb-vendors";
import {
  commentsForRecord,
  isReceiptPdf,
  isWaitingOnPm,
  itemTitle,
  nextReviewItem,
  qbApproveInbox,
  reviewHref,
  type QbReviewItem,
} from "@/lib/qb-review";
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
  type QbReviewKind,
} from "@/lib/types";
import { canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function QbApproveDesk({
  kind,
  id,
}: {
  kind?: string;
  id?: string;
}) {
  const crm = useCrm();
  const router = useRouter();
  const accountant = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));
  const inbox = useMemo(
    () =>
      qbApproveInbox({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        expenses: crm.expenses,
        payments: crm.payments,
      }),
    [crm.expenses, crm.invoiceLines, crm.invoices, crm.payments],
  );
  const selectedKind = kind === "expense" || kind === "payment" || kind === "invoice" ? kind : undefined;
  const selected = useMemo(() => {
    if (selectedKind && id) {
      return inbox.items.find((item) => item.kind === selectedKind && item.id === id) ?? null;
    }
    return inbox.ready[0] ?? inbox.returned[0] ?? inbox.queued[0] ?? null;
  }, [id, inbox, selectedKind]);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!accountant && !(selectedKind && id)) {
    return (
      <EmptyState
        title="Approve is for accounting"
        description="Company admin and the Accounting seat review invoices, expenses, and payments here. If accounting returned something, open it from the job."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  return (
    <div className="-m-5 flex h-[calc(100dvh-3rem)] min-h-0 flex-col bg-muted/30 sm:-m-7">
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)_24rem]">
        <QueuePane
          inbox={inbox}
          selected={selected}
          onOpen={(item) => router.push(reviewHref(item.kind, item.id))}
        />
        {selected ? (
          <ReviewPane
            item={selected}
            accountant={accountant}
            onMoved={(next) => {
              if (next && (next.kind !== selected.kind || next.id !== selected.id)) {
                router.push(reviewHref(next.kind, next.id));
              } else {
                router.push("/accounting/approve");
              }
            }}
          />
        ) : (
          <div className="col-span-2 flex items-center justify-center p-8">
            <EmptyState
              title="Nothing to approve"
              description="Sent invoices, receipted expenses, and deposits show up here until they are in QuickBooks."
              action={
                <Link href="/accounting" className="text-sm font-medium text-primary hover:underline">
                  Open the books
                </Link>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function QueuePane({
  inbox,
  selected,
  onOpen,
}: {
  inbox: ReturnType<typeof qbApproveInbox>;
  selected: QbReviewItem | null;
  onOpen: (item: QbReviewItem) => void;
}) {
  return (
    <aside className="flex max-h-40 shrink-0 flex-col border-b bg-background lg:max-h-none lg:border-r lg:border-b-0">
      <div className="border-b px-3 py-3">
        <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Approve</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {inbox.readyCount} ready
          {inbox.returnedCount ? ` · ${inbox.returnedCount} with the PM` : ""}
          {inbox.queuedCount ? ` · ${inbox.queuedCount} in the connector` : ""}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueueGroup title="Ready" items={inbox.ready} selected={selected} onOpen={onOpen} />
        <QueueGroup title="Returned to PM" items={inbox.returned} selected={selected} onOpen={onOpen} />
        <QueueGroup title="In the connector" items={inbox.queued} selected={selected} onOpen={onOpen} />
      </div>
    </aside>
  );
}

function QueueGroup({
  title,
  items,
  selected,
  onOpen,
}: {
  title: string;
  items: QbReviewItem[];
  selected: QbReviewItem | null;
  onOpen: (item: QbReviewItem) => void;
}) {
  const crm = useCrm();
  if (items.length === 0) return null;
  return (
    <div className="border-b py-2">
      <p className="px-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </p>
      <ul>
        {items.map((item) => {
          const active = selected?.kind === item.kind && selected.id === item.id;
          return (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                  active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium">{itemTitle(item)}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {itemAmount(item, crm)}
                  </span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.kind === "invoice" ? "Invoice" : item.kind === "expense" ? "Expense" : "Payment"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function itemAmount(item: QbReviewItem, crm: ReturnType<typeof useCrm>) {
  if (item.kind === "invoice") return formatMoney(invoiceTotal(item.invoice.id, crm.invoiceLines));
  if (item.kind === "expense") return formatMoney(item.expense.amount);
  return formatMoney(item.payment.amount);
}

function ReviewPane({
  item,
  accountant,
  onMoved,
}: {
  item: QbReviewItem;
  accountant: boolean;
  onMoved: (next: QbReviewItem | null) => void;
}) {
  const crm = useCrm();
  const [tab, setTab] = useState("document");
  const inbox = useMemo(
    () =>
      qbApproveInbox({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        expenses: crm.expenses,
        payments: crm.payments,
      }),
    [crm.expenses, crm.invoiceLines, crm.invoices, crm.payments],
  );

  return (
    <>
      <section className="min-h-0 overflow-y-auto bg-muted/40 p-3 sm:p-5">
        <div className="lg:hidden">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3 w-full">
              <TabsTrigger value="document">Document</TabsTrigger>
              <TabsTrigger value="data">QuickBooks</TabsTrigger>
            </TabsList>
            <TabsContent value="document">
              <DocumentPreview item={item} />
            </TabsContent>
            <TabsContent value="data">
              <DataAndThread item={item} accountant={accountant} inbox={inbox} onMoved={onMoved} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="hidden lg:block">
          <DocumentPreview item={item} />
        </div>
      </section>
      <aside className="hidden min-h-0 flex-col overflow-y-auto border-l bg-background lg:flex">
        <DataAndThread item={item} accountant={accountant} inbox={inbox} onMoved={onMoved} />
      </aside>
    </>
  );
}

function DocumentPreview({ item }: { item: QbReviewItem }) {
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
    return (
      <iframe title={title} src={url} className="min-h-[70vh] w-full border bg-background" />
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={title} className="mx-auto max-h-[80vh] w-full border bg-background object-contain" />
    </a>
  );
}

function DataAndThread({
  item,
  accountant,
  inbox,
  onMoved,
}: {
  item: QbReviewItem;
  accountant: boolean;
  inbox: ReturnType<typeof qbApproveInbox>;
  onMoved: (next: QbReviewItem | null) => void;
}) {
  const crm = useCrm();
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"approve" | "return" | "resubmit" | "comment" | null>(null);
  const comments = commentsForRecord(crm.qbReviewComments ?? [], item.kind, item.id);
  const status =
    item.kind === "invoice"
      ? item.invoice.qbStatus
      : item.kind === "expense"
        ? item.expense.qbStatus
        : item.payment.qbStatus;
  const jobId =
    item.kind === "invoice"
      ? item.invoice.jobId
      : item.kind === "expense"
        ? item.expense.jobId
        : item.payment.jobId;
  const blocked = blockReason(item, crm);
  const locked = status === "entered";

  async function leaveNote(intent: "comment" | "return" | "approve" | "resubmit", body: string) {
    return crm.addQbReviewComment({ kind: item.kind, recordId: item.id, body, intent });
  }

  async function logJob(body: string) {
    if (!jobId) return;
    await crm.addActivity({ entityType: "job", entityId: jobId, type: "note", body });
  }

  async function approve() {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setPending("approve");
    try {
      const ok = await crm.setQbStatus(item.kind, item.id, "queued");
      if (!ok) return;
      await leaveNote("approve", note.trim() || "Approved for QuickBooks.");
      await logJob(`${itemTitle(item)} approved for QuickBooks.`);
      toast.success("In the Web Connector queue.");
      setNote("");
      onMoved(nextReviewItem(inbox.ready, item.kind, item.id));
    } finally {
      setPending(null);
    }
  }

  async function sendBack() {
    const body = returnNote.trim();
    if (!body) {
      toast.error("Tell the project manager what to change.");
      return;
    }
    setPending("return");
    try {
      const ok = await crm.setQbStatus(item.kind, item.id, "returned");
      if (!ok) return;
      await leaveNote("return", body);
      await logJob(`Returned ${itemTitle(item)}: ${body}`);
      toast.success("Sent back to the project manager.");
      setReturnOpen(false);
      setReturnNote("");
      onMoved(nextReviewItem(inbox.ready, item.kind, item.id));
    } finally {
      setPending(null);
    }
  }

  async function resubmit() {
    setPending("resubmit");
    try {
      const ok = await crm.setQbStatus(item.kind, item.id, "not_in_qb");
      if (!ok) return;
      await leaveNote("resubmit", note.trim() || "Updated. Ready for accounting again.");
      await logJob(`${itemTitle(item)} sent back to accounting.`);
      toast.success("Accounting will see this in Approve again.");
      setNote("");
    } finally {
      setPending(null);
    }
  }

  async function postComment() {
    if (!note.trim()) return;
    setPending("comment");
    try {
      const saved = await leaveNote("comment", note);
      if (saved) setNote("");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {item.kind === "invoice" ? "Invoice" : item.kind === "expense" ? "Expense" : "Payment"}
            </p>
            <h2 className="font-heading text-lg font-medium">{itemTitle(item)}</h2>
          </div>
          <QbStatusBadge status={status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Edit what QuickBooks will get. Comments stay on this document like a Dropbox review.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {item.kind === "invoice" ? (
          <InvoiceFields invoiceId={item.invoice.id} locked={locked} />
        ) : item.kind === "expense" ? (
          <ExpenseFields expenseId={item.expense.id} locked={locked} />
        ) : (
          <PaymentFields paymentId={item.payment.id} locked={locked} />
        )}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase">Comments</p>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notes yet. Ask the PM for a missing receipt, or leave a reminder for yourself.
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium">{comment.authorName}</p>
                    <p className="text-[11px] text-muted-foreground">{formatRelative(comment.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                    {comment.intent === "return"
                      ? "Returned"
                      : comment.intent === "approve"
                        ? "Approved"
                        : comment.intent === "resubmit"
                          ? "Resubmitted"
                          : "Comment"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                </li>
              ))}
            </ul>
          )}
          {locked ? null : (
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Leave a comment on this document"
              rows={3}
            />
          )}
        </div>
      </div>
      {locked ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">Already in QuickBooks.</p>
      ) : (
        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          {accountant ? (
            <Button type="button" disabled={pending !== null} onClick={() => void approve()}>
              Approve for QuickBooks
            </Button>
          ) : null}
          {accountant ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null || status === "queued"}
              onClick={() => setReturnOpen(true)}
            >
              Return to PM
            </Button>
          ) : null}
          {!accountant && isWaitingOnPm(status) ? (
            <Button type="button" disabled={pending !== null} onClick={() => void resubmit()}>
              Send back to accounting
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null || !note.trim()}
            onClick={() => void postComment()}
          >
            Comment
          </Button>
        </div>
      )}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to the project manager</DialogTitle>
            <DialogDescription>
              They will see this note on the job and on this document. Fix the vendor, receipt, or
              amount there, then send it back.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnNote}
            onChange={(event) => setReturnNote(event.target.value)}
            placeholder="What needs to change?"
            rows={4}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending !== null} onClick={() => void sendBack()}>
              Return to PM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function blockReason(item: QbReviewItem, crm: ReturnType<typeof useCrm>) {
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

export function parseReviewKindParam(value: string | undefined): QbReviewKind | null {
  if (value === "invoice" || value === "expense" || value === "payment") return value;
  return null;
}
