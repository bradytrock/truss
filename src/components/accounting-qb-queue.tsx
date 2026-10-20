"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QbwcPanel } from "@/components/qbwc-panel";
import { Button } from "@/components/ui/button";
import { accCard, accRed } from "@/components/accounting-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  expenseBlockedReason,
  invoiceBlockedReason,
  invoiceReviewStatus,
  reviewableInvoices,
} from "@/lib/accounting-books";
import { formatMoney } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import { qbwcFile } from "@/lib/qbwc/soap";
import { paymentPushBlocked } from "@/lib/qbwc/work";
import { cn } from "@/lib/utils";
import type { QbSyncStatus } from "@/lib/types";

type QueueKind = "invoices" | "expenses" | "payments";

type ConnectorInfo = {
  configured?: boolean;
  username?: string;
  ownerId?: string;
  fileId?: string;
  appUrl?: string;
  lastConnectedAt?: string | null;
  lastError?: string;
};

export function AccountingQuickBooks({
  onReviewInvoice,
}: {
  onReviewInvoice?: (invoiceId: string) => void;
}) {
  const crm = useCrm();
  const [kind, setKind] = useState<QueueKind>("invoices");
  const [info, setInfo] = useState<ConnectorInfo | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/qbwc/setup")
      .then((response) => response.json())
      .then((data: ConnectorInfo) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const invoiceRows = crm.invoices
    .filter((invoice) => invoice.qbStatus !== "entered" && invoice.status !== "void" && !invoice.archivedAt)
    .map((invoice) => {
      const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
      const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
      const blocked = invoiceBlockedReason({ invoice, job, lines });
      return { invoice, job, blocked, amount: invoiceTotal(invoice.id, crm.invoiceLines) };
    });
  const expenseRows = crm.expenses
    .filter((expense) => expense.qbStatus !== "entered")
    .map((expense) => {
      const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
      return { expense, job, blocked: expenseBlockedReason({ expense, job }) };
    });
  const paymentRows = crm.payments
    .filter((payment) => payment.qbStatus !== "entered")
    .map((payment) => {
      const invoice = payment.invoiceId ? crm.invoices.find((item) => item.id === payment.invoiceId) : undefined;
      const job = payment.jobId ? crm.getJob(payment.jobId) : undefined;
      return { payment, invoice, job, blocked: payment.qbStatus === "error" ? paymentPushBlocked({ payment, invoice, job }) : null };
    });

  const shownInvoices = invoiceRows.filter((row) => inQueue(row.invoice.qbStatus, row.blocked));
  const shownExpenses = expenseRows.filter((row) => inQueue(row.expense.qbStatus, row.blocked));
  const shownPayments = paymentRows.filter((row) => inQueue(row.payment.qbStatus, row.blocked));
  const waiting =
    invoiceRows.filter((row) => row.invoice.qbStatus === "queued").length +
    expenseRows.filter((row) => row.expense.qbStatus === "queued").length +
    paymentRows.filter((row) => row.payment.qbStatus === "queued").length;
  const errors =
    invoiceRows.filter((row) => row.invoice.qbStatus === "error" || Boolean(row.blocked)).length +
    expenseRows.filter((row) => row.expense.qbStatus === "error" || Boolean(row.blocked)).length +
    paymentRows.filter((row) => row.payment.qbStatus === "error").length;
  const readyNotQueued = reviewableInvoices(crm.invoices).filter((invoice) => {
    const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
    const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
    return invoiceReviewStatus(invoice, invoiceBlockedReason({ invoice, job, lines })) === "ready";
  }).length;
  const connected = Boolean(info?.lastConnectedAt);

  function downloadQwc() {
    if (!info?.username || !info.ownerId || !info.fileId) {
      toast.error("Create a connector password first.");
      return;
    }
    const xml = qbwcFile({
      appUrl: info.appUrl || `${window.location.origin}/api/qbwc`,
      userName: info.username,
      ownerId: info.ownerId,
      fileId: info.fileId,
      supportUrl: window.location.origin,
    });
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "truss-quickbooks.qwc";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const response = await fetch("/api/qbwc/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestVendorSync: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(data.error || "Could not queue a Web Connector update.");
        return;
      }
      toast.success("Queued. QuickBooks Desktop picks this up the next time the Web Connector updates.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.7fr)]">
      <div className="space-y-4">
        <section className="flex flex-wrap items-center gap-6 rounded-2xl bg-[#161616] px-5 py-4 text-white">
          <BarStat label="QuickBooks Desktop" value={connected ? "Connected" : info?.configured ? "Waiting" : "Not set up"} dot={connected} />
          <BarStat label="Last poll" value={pollLabel(info?.lastConnectedAt)} warn={stale(info?.lastConnectedAt)} />
          <BarStat label="Waiting to post" value={String(waiting)} />
          <BarStat label="Errors" value={String(errors)} warn={errors > 0} />
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10" onClick={downloadQwc}>
              Download .qwc
            </Button>
            <Button type="button" className={cn("h-10 rounded-xl", accRed)} disabled={syncing} onClick={() => void syncNow()}>
              Sync now
            </Button>
          </div>
        </section>

        <section className={cn(accCard, "overflow-hidden")}>
          <div className="flex justify-end px-4 pt-3">
            <div className="flex rounded-full bg-[#f3f1ec] p-1 text-sm">
              <KindTab active={kind === "invoices"} onClick={() => setKind("invoices")}>
                Invoices {shownInvoices.length}
              </KindTab>
              <KindTab active={kind === "expenses"} onClick={() => setKind("expenses")}>
                Expenses {shownExpenses.length}
              </KindTab>
              <KindTab active={kind === "payments"} onClick={() => setKind("payments")}>
                Payments {shownPayments.length}
              </KindTab>
            </div>
          </div>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-[#8a847c]">
              <tr>
                <th className="px-4 py-2 font-medium">{kind === "payments" ? "Payment" : kind === "expenses" ? "Expense" : "Invoice"}</th>
                <th className="px-4 py-2 font-medium">Customer · Job</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {kind === "invoices"
                ? shownInvoices.map((row) => (
                    <QueueRow
                      key={row.invoice.id}
                      primary={row.invoice.number}
                      secondary={row.invoice.name}
                      who={row.job ? `${crm.customerName(row.invoice)} · ${row.job.code || row.job.name}` : crm.customerName(row.invoice) || "Needs a job"}
                      amount={formatMoney(row.amount)}
                      status={row.invoice.qbStatus}
                      blocked={row.blocked}
                      reviewHref={`/accounting?tab=review&invoice=${row.invoice.id}`}
                      onFix={() => onReviewInvoice?.(row.invoice.id)}
                      kind="invoice"
                      id={row.invoice.id}
                    />
                  ))
                : null}
              {kind === "expenses"
                ? shownExpenses.map((row) => (
                    <QueueRow
                      key={row.expense.id}
                      primary={row.expense.number}
                      secondary={row.expense.vendor}
                      who={row.job ? `${row.job.name}${row.job.code ? ` · ${row.job.code}` : ""}` : "Overhead"}
                      amount={formatMoney(row.expense.amount)}
                      status={row.expense.qbStatus}
                      blocked={row.blocked}
                      reviewHref={`/accounting?tab=expenses&expense=${row.expense.id}`}
                      kind="expense"
                      id={row.expense.id}
                    />
                  ))
                : null}
              {kind === "payments"
                ? shownPayments.map((row) => (
                    <QueueRow
                      key={row.payment.id}
                      primary={row.payment.method}
                      secondary={row.payment.reference}
                      who={row.invoice?.number || row.job?.name || "Unapplied"}
                      amount={formatMoney(row.payment.amount)}
                      status={row.payment.qbStatus}
                      blocked={row.blocked}
                      reviewHref={row.invoice ? `/accounting?tab=review&invoice=${row.invoice.id}` : "/accounting?tab=sync"}
                      kind="payment"
                      id={row.payment.id}
                    />
                  ))
                : null}
            </tbody>
          </table>
          {shownCount(kind, shownInvoices.length, shownExpenses.length, shownPayments.length) === 0 ? (
            <p className="px-4 py-8 text-sm text-[#8a847c]">Nothing in this queue.</p>
          ) : null}
          <p className="border-t border-[#f3efe9] px-4 py-3 text-xs text-[#6f6a64]">
            Invoices enter this queue when approved on Invoice review.
            {readyNotQueued > 0 ? (
              <>
                {" "}
                <Link href="/accounting?tab=review" className="font-medium text-[#c43832] hover:underline">
                  {readyNotQueued} approved {readyNotQueued === 1 ? "invoice isn't" : "invoices aren't"} queued yet
                </Link>
              </>
            ) : null}
          </p>
        </section>
      </div>

      <div className="space-y-4">
        <section className={cn(accCard, "p-5")}>
          <h3 className="text-base font-semibold">What syncs</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <SyncLine label="Customers and jobs" value="CRM → QuickBooks" />
            <SyncLine label="Invoices" value="CRM → QuickBooks" />
            <SyncLine label="Vendor bills / expenses" value="CRM → QuickBooks" />
            <SyncLine label="Payments received" value="Both ways" tone="green" />
            <SyncLine label="Vendors" value="QuickBooks → CRM" tone="blue" />
          </dl>
        </section>
        <QbwcPanel compact />
      </div>
    </div>
  );
}

function inQueue(status: QbSyncStatus, blocked: string | null) {
  return status === "queued" || status === "error" || status === "returned" || Boolean(blocked);
}

function shownCount(kind: QueueKind, invoices: number, expenses: number, payments: number) {
  if (kind === "invoices") return invoices;
  if (kind === "expenses") return expenses;
  return payments;
}

function BarStat({ label, value, dot, warn }: { label: string; value: string; dot?: boolean; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className={cn("mt-1 flex items-center gap-2 text-lg font-semibold", warn && "text-[#ffb4a8]")}>
        {dot ? <span className="size-2 rounded-full bg-[#3dce7a]" /> : null}
        {value}
      </p>
    </div>
  );
}

function KindTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-3 py-1.5 font-medium", active ? "bg-white text-[#1a1a1a] shadow-sm" : "text-[#6f6a64]")}
    >
      {children}
    </button>
  );
}

function SyncLine({ label, value, tone }: { label: string; value: string; tone?: "green" | "blue" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd
        className={cn(
          "rounded-full px-2.5 py-1 text-xs font-medium",
          tone === "green" && "bg-[#e7f6ea] text-[#217a45]",
          tone === "blue" && "bg-[#e7f0fb] text-[#2a62b5]",
          !tone && "bg-[#f3f1ec] text-[#5c5854]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function QueueRow({
  primary,
  secondary,
  who,
  amount,
  status,
  blocked,
  reviewHref,
  onFix,
  kind,
  id,
}: {
  primary: string;
  secondary: string;
  who: string;
  amount: string;
  status: QbSyncStatus;
  blocked: string | null;
  reviewHref: string;
  onFix?: () => void;
  kind: "invoice" | "expense" | "payment";
  id: string;
}) {
  const crm = useCrm();
  const [pending, setPending] = useState(false);
  const pill = statusPill(status, blocked);
  const waiting = status === "queued";

  async function markEntered() {
    setPending(true);
    try {
      await crm.setQbStatus(kind, id, "entered");
    } finally {
      setPending(false);
    }
  }

  async function retry() {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setPending(true);
    try {
      const ok = await crm.setQbStatus(kind, id, "queued");
      if (ok) toast.success(`${primary} is in the Web Connector queue.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-t border-[#f3efe9]">
      <td className="px-4 py-3">
        <p className="font-semibold">{primary}</p>
        {secondary ? <p className="text-xs text-[#8a847c]">{secondary}</p> : null}
      </td>
      <td className="px-4 py-3 text-[#3c3a37]">{who}</td>
      <td className="px-4 py-3 text-right tabular-nums">{amount}</td>
      <td className="px-4 py-3">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", pill.className)}>{pill.label}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          {waiting ? (
            <Button nativeButton={false} size="sm" variant="outline" className="rounded-full" render={<Link href={reviewHref} />}>
              Details
            </Button>
          ) : onFix ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={onFix}>
              Fix
            </Button>
          ) : (
            <Button nativeButton={false} size="sm" variant="outline" className="rounded-full" render={<Link href={reviewHref} />}>
              Fix
            </Button>
          )}
          {status === "error" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void retry()}>
              Retry
            </Button>
          ) : status === "queued" ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => void markEntered()}>
              Entered
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function statusPill(status: QbSyncStatus, blocked: string | null) {
  if (status === "queued") return { label: "Waiting for poll", className: "bg-[#f3f1ec] text-[#5c5854]" };
  if (status === "returned") return { label: "On hold", className: "bg-[#f8ead3] text-[#9a6230]" };
  if (status === "error") return { label: "Blocked · rejected", className: "bg-[#fde8e6] text-[#c43832]" };
  if (blocked && /line item/i.test(blocked)) return { label: "Blocked · no lines", className: "bg-[#fde8e6] text-[#c43832]" };
  if (blocked && /vendor/i.test(blocked)) return { label: "Blocked · no vendor", className: "bg-[#fde8e6] text-[#c43832]" };
  if (blocked && /job/i.test(blocked)) return { label: "Blocked · no job", className: "bg-[#fde8e6] text-[#c43832]" };
  if (blocked && /amount/i.test(blocked)) return { label: "Blocked · no amount", className: "bg-[#fde8e6] text-[#c43832]" };
  if (blocked) return { label: "Blocked", className: "bg-[#fde8e6] text-[#c43832]" };
  return { label: "Not queued", className: "bg-[#f3f1ec] text-[#5c5854]" };
}

function pollLabel(iso: string | null | undefined) {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const when = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days <= 0) return `${when} · today`;
  if (days === 1) return `${when} · yesterday`;
  return `${when} · ${days} days ago`;
}

function stale(iso: string | null | undefined) {
  if (!iso) return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() > 2 * 86_400_000;
}

export function AccountingSyncQueues() {
  return <AccountingQuickBooks />;
}
