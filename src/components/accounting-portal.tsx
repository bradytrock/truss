"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Hourglass, PieChart, PlugZap, Receipt, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { ProfitAndLossReport } from "@/components/profit-and-loss";
import { AccountingExpenseReview, ExpenseReviewCountBadge } from "@/components/accounting-expense-review";
import { AccountingInvoiceReview, InvoiceReviewCountBadge } from "@/components/accounting-invoice-review";
import { AccountingSyncQueues } from "@/components/accounting-qb-queue";
import { QbwcPanel } from "@/components/qbwc-panel";
import { LogPaymentDialog } from "@/components/log-financial-dialogs";
import { useCrm } from "@/lib/crm-store";
import {
  AGING_LABELS,
  agingInvoiceRows,
  arAging,
  collectedThisMonth,
  commissionPayout,
  commissionRows,
  completedJobsWithoutInvoice,
  expensesMissingJob,
  invoiceBlockedReason,
  invoiceReviewAmount,
  jobProfitRows,
  parseAccountingTab,
  pendingCardPaymentRows,
  recentPaymentRows,
  reviewableInvoices,
  type AgingKey,
} from "@/lib/accounting-books";
import { paymentMethodLabel } from "@/lib/payment-posting";
import { formatCurrency, formatCurrencyFull, formatDate } from "@/lib/format";
import { qbQueue, type JobBooksBasis } from "@/lib/job-financials";
import { buildProfitAndLoss, formatPnlPeriod, yearToDateBounds } from "@/lib/profit-and-loss";
import { canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

const AGING_KEYS: AgingKey[] = ["current", "d1", "d31", "d61", "d90"];
const AGING_BAR: Record<AgingKey, string> = {
  current: "bg-[#13295b]",
  d1: "bg-[#13295b]",
  d31: "bg-[#f0994f]",
  d61: "bg-[#b3261e]",
  d90: "bg-[#b3261e]",
};

export function AccountingPortal() {
  const crm = useCrm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseAccountingTab(searchParams.get("tab"));
  const selectedInvoice = searchParams.get("invoice");
  const selectedExpense = searchParams.get("expense");
  const viewer = crm.effectiveStaff;
  const [basis, setBasis] = useState<JobBooksBasis>("accrual");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [contract, setContract] = useState("18640");
  const [jobCost, setJobCost] = useState("11200");
  const [plan, setPlan] = useState<"gp10" | "gp50" | "rev3">("gp10");
  const [report, setReport] = useState<
    "aging" | "profit" | "commission" | "payments" | "pending" | "pnl" | null
  >(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const ytd = useMemo(() => yearToDateBounds(), []);

  const queue = useMemo(
    () =>
      qbQueue({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
      }),
    [crm.expenses, crm.invoiceLines, crm.invoices, crm.payments],
  );
  const aging = useMemo(
    () => arAging({ invoices: crm.invoices, invoiceLines: crm.invoiceLines, payments: crm.payments }),
    [crm.invoiceLines, crm.invoices, crm.payments],
  );
  const collected = useMemo(() => collectedThisMonth(crm.payments), [crm.payments]);
  const awaiting = useMemo(
    () => reviewableInvoices(crm.invoices).filter((invoice) => invoice.qbStatus !== "queued"),
    [crm.invoices],
  );
  const syncErrors = useMemo(
    () =>
      reviewableInvoices(crm.invoices).filter((invoice) => {
        const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
        const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
        return Boolean(invoiceBlockedReason({ invoice, job, lines })) || invoice.qbStatus === "error";
      }),
    [crm],
  );
  const missingInvoices = useMemo(
    () => completedJobsWithoutInvoice(crm.jobs, crm.invoices).slice(0, 5),
    [crm.invoices, crm.jobs],
  );
  const unassignedBills = useMemo(() => expensesMissingJob(crm.expenses), [crm.expenses]);
  const statement = useMemo(() => {
    return buildProfitAndLoss({
      companyName: crm.company.name,
      jobs: crm.jobs,
      opportunities: crm.opportunities,
      invoices: crm.invoices,
      invoiceLines: crm.invoiceLines,
      payments: crm.payments,
      expenses: crm.expenses,
      estimates: crm.estimates,
      estimateLines: crm.estimateLines,
      basis,
      from: ytd.from,
      to: ytd.to,
      periodLabel: formatPnlPeriod(ytd.from, ytd.to),
    });
  }, [
    basis,
    crm.company.name,
    crm.estimateLines,
    crm.estimates,
    crm.expenses,
    crm.invoiceLines,
    crm.invoices,
    crm.jobs,
    crm.opportunities,
    crm.payments,
    ytd.from,
    ytd.to,
  ]);
  const payout = commissionPayout(Number(contract) || 0, Number(jobCost) || 0, plan);
  const profitJobs = useMemo(
    () =>
      jobProfitRows({
        jobs: crm.jobs,
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
        basis,
      }),
    [basis, crm.expenses, crm.invoiceLines, crm.invoices, crm.jobs, crm.payments],
  );
  const commissions = useMemo(() => commissionRows(profitJobs), [profitJobs]);
  const agingRows = useMemo(
    () =>
      agingInvoiceRows({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
      }),
    [crm.invoiceLines, crm.invoices, crm.payments],
  );
  const paymentRows = useMemo(() => recentPaymentRows(crm.payments).slice(0, 8), [crm.payments]);
  const pendingRows = useMemo(() => pendingCardPaymentRows(crm.payments), [crm.payments]);
  const pendingAmount = pendingRows.reduce((sum, payment) => sum + payment.amount, 0);

  async function settlePending(id: string, next: "posted" | "rejected") {
    setSettlingId(id);
    try {
      await crm.settlePendingPayment(id, next);
    } finally {
      setSettlingId(null);
    }
  }

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (next !== "review") params.delete("invoice");
    if (next !== "expenses") params.delete("expense");
    const qs = params.toString();
    router.replace(qs ? `/accounting?${qs}` : "/accounting", { scroll: false });
  }

  function setInvoice(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "review");
    params.delete("expense");
    if (id) params.set("invoice", id);
    else params.delete("invoice");
    router.replace(`/accounting?${params.toString()}`, { scroll: false });
  }

  function setExpense(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "expenses");
    params.delete("invoice");
    if (id) params.set("expense", id);
    else params.delete("expense");
    router.replace(`/accounting?${params.toString()}`, { scroll: false });
  }

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewAccounting(viewer.role)) {
    return (
      <EmptyState
        title="Accounting is restricted"
        description="Company admin and the Accounting seat review invoices, send them to QuickBooks, and keep job costs honest."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Accounting"
        title="Books and billing"
        description="Review invoices, send them to QuickBooks, and keep job costs honest."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} variant="outline" render={<Link href="/settings/quickbooks" />}>
              <PlugZap data-icon="inline-start" />
              Connection
            </Button>
            <Button nativeButton={false} render={<Link href="/accounting?tab=sync" />}>
              <RefreshCw data-icon="inline-start" />
              Sync now
            </Button>
          </div>
        }
      />
      <p className="text-xs text-[#706e6b]">
        {viewer.role === "accountant" ? "Accounting seat" : "Company admin"} — every invoice, payment, and
        sync in the company.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto rounded-none bg-transparent p-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="review">
            Invoice review
            <InvoiceReviewCountBadge />
          </TabsTrigger>
          <TabsTrigger value="expenses">
            Expense review
            <ExpenseReviewCountBadge />
          </TabsTrigger>
          <TabsTrigger value="sync">
            QuickBooks sync
            {queue.invoiceCount + queue.expenseCount + queue.paymentCount > 0 ? (
              <span className="ml-1 text-muted-foreground">
                {queue.invoiceCount + queue.expenseCount + queue.paymentCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                Accounting snapshot
              </p>
              <p className="text-sm text-[#706e6b]">Receivables and sync health for {monthLabel}</p>
            </div>
            <Button type="button" variant="link" className="h-auto p-0 text-[#0176d3]" onClick={() => setTab("reports")}>
              Open reports
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="AR outstanding" value={formatCurrency(aging.total)} hint={`${aging.count} open invoices`} />
            <Kpi
              label="Awaiting approval"
              value={String(awaiting.length)}
              hint={`${formatCurrencyFull(invoiceReviewAmount(awaiting, crm.invoiceLines))} ready to review`}
            />
            <Kpi
              label="Collected MTD"
              value={formatCurrency(collected.amount)}
              hint={`${collected.count} payment${collected.count === 1 ? "" : "s"} recorded`}
            />
            <Kpi
              label="Sync errors"
              value={String(syncErrors.length)}
              hint={
                syncErrors[0]
                  ? `${syncErrors[0].number} is blocked`
                  : "No mapping or job problems"
              }
              warn={syncErrors.length > 0}
            />
          </div>
          {pendingRows.length > 0 ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[#f0994f] bg-[#fff8f0] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#181818]">
                  {pendingRows.length} pending card payment{pendingRows.length === 1 ? "" : "s"}
                </p>
                <p className="text-xs text-[#706e6b]">
                  {formatCurrencyFull(pendingAmount)} charged in Stripe. Match and post as a job
                  deposit, or reject if it does not belong.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTab("reports");
                  setReport("pending");
                }}
              >
                Open pending report
              </Button>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between gap-3 border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#181818]">Receivables aging</h3>
                  <p className="mt-0.5 text-xs text-[#706e6b]">Open balance by days past due</p>
                </div>
                <Button type="button" variant="link" className="h-auto p-0 text-[#0176d3]" onClick={() => setTab("reports")}>
                  AR aging
                </Button>
              </div>
              <div className="space-y-3 px-4 py-4">
                {AGING_KEYS.map((key) => (
                  <div key={key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-sm">
                    <span>{AGING_LABELS[key]}</span>
                    <div className="h-3.5 overflow-hidden rounded-sm bg-[#f1f0ec]">
                      <span
                        className={cn("block h-full", AGING_BAR[key])}
                        style={{ width: `${aging.total > 0 ? Math.max(2, (aging[key] / aging.total) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-right tabular-nums">{formatCurrencyFull(aging[key])}</span>
                  </div>
                ))}
              </div>
            </section>

            <QbConnectionCard
              queueCount={queue.invoiceCount + queue.expenseCount + queue.paymentCount}
              invoices={queue.invoiceCount}
              expenses={queue.expenseCount}
              payments={queue.paymentCount}
              onViewQueue={() => setTab("sync")}
              onReview={() => setTab("review")}
            />
          </div>

          <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
            <div className="border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#181818]">Needs attention</h3>
              <p className="mt-0.5 text-xs text-[#706e6b]">Things blocking a clean close this month</p>
            </div>
            <ul className="divide-y divide-[#e5e5e5]">
              {syncErrors[0] ? (
                <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {syncErrors[0].number} needs a job, lines, or a QuickBooks retry before it can go.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setInvoice(syncErrors[0].id)}>
                    Review invoice
                  </Button>
                </li>
              ) : null}
              {missingInvoices.length > 0 ? (
                <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {missingInvoices.length} finished job{missingInvoices.length === 1 ? "" : "s"} with no
                    invoice
                    {missingInvoices[0] ? ` — ${missingInvoices.map((job) => job.name).join(", ")}` : ""}.
                  </span>
                  <Button nativeButton={false} size="sm" variant="outline" render={<Link href="/jobs" />}>
                    Open jobs
                  </Button>
                </li>
              ) : null}
              {unassignedBills.length > 0 ? (
                <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {unassignedBills.length} supplier bill{unassignedBills.length === 1 ? "" : "s"} not tied
                    to a job.
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setTab("expenses")}>
                    Review expenses
                  </Button>
                </li>
              ) : null}
              {!syncErrors[0] && missingInvoices.length === 0 && unassignedBills.length === 0 ? (
                <li className="px-4 py-6 text-sm text-[#706e6b]">Nothing blocking the books right now.</li>
              ) : null}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          <AccountingInvoiceReview selectedId={selectedInvoice} onSelect={setInvoice} />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <AccountingExpenseReview selectedId={selectedExpense} onSelect={setExpense} />
        </TabsContent>

        <TabsContent value="sync" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                QuickBooks sync
              </p>
              <p className="text-sm text-[#706e6b]">
                Desktop through the Web Connector. Invoice and expense approval live on their review tabs.
              </p>
            </div>
            <Button nativeButton={false} variant="outline" render={<Link href="/settings/quickbooks" />}>
              Download .qwc
            </Button>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <QbwcPanel />
            </div>
            <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
              <div className="border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#181818]">What syncs</h3>
                <p className="mt-0.5 text-xs text-[#706e6b]">Direction per record type</p>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-4 py-4 text-sm">
                <dt className="text-[#706e6b]">Customers and jobs</dt>
                <dd className="text-right">CRM → QuickBooks</dd>
                <dt className="text-[#706e6b]">Invoices</dt>
                <dd className="text-right">CRM → QuickBooks</dd>
                <dt className="text-[#706e6b]">Payments received</dt>
                <dd className="text-right">Both ways</dd>
                <dt className="text-[#706e6b]">Vendors</dt>
                <dd className="text-right">QuickBooks → CRM</dd>
                <dt className="text-[#706e6b]">Vendor bills / expenses</dt>
                <dd className="text-right">CRM → QuickBooks</dd>
              </dl>
            </section>
          </div>
          <AccountingSyncQueues />
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                Accounting reports
              </p>
              <p className="text-sm text-[#706e6b]">Run in the CRM from live job and invoice books.</p>
            </div>
            <div className="flex border">
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  basis === "accrual" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
                onClick={() => setBasis("accrual")}
              >
                Accrual
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  basis === "cash" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
                onClick={() => setBasis("cash")}
              >
                Cash
              </button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ReportCard
              icon={<Hourglass className="size-5 text-[#13295b]" />}
              title="AR aging"
              description="Open balances by invoice and days past due."
              onRun={() => setReport("aging")}
            />
            <ReportCard
              icon={<PieChart className="size-5 text-[#13295b]" />}
              title="Job profitability"
              description="Contract vs. actual cost for billed jobs, with margin."
              onRun={() => setReport("profit")}
            />
            <ReportCard
              icon={<Users className="size-5 text-[#13295b]" />}
              title="Commission report"
              description="10% of gross profit by sales rep on billed jobs."
              onRun={() => setReport("commission")}
            />
            <ReportCard
              icon={<Receipt className="size-5 text-[#13295b]" />}
              title="Deposits and payments"
              description="Every posted payment, newest first."
              onRun={() => setReport("payments")}
            />
            <ReportCard
              icon={<CreditCard className="size-5 text-[#13295b]" />}
              title="Pending card payments"
              description="Match Stripe charges before they post as a job deposit."
              onRun={() => setReport("pending")}
            />
            <ReportCard
              icon={<PieChart className="size-5 text-[#13295b]" />}
              title="Profit and loss"
              description="Year-to-date books in QuickBooks form."
              onRun={() => setReport("pnl")}
            />
          </div>
          {report === "aging" ? (
            <ReportPreview title="AR aging" subtitle={`${formatCurrencyFull(aging.total)} open`}>
              <table className="w-full text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-left">Bucket</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {agingRows.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-b border-[#e5e5e5] last:border-0">
                      <td className="px-4 py-2.5">
                        <button type="button" className="text-[#0176d3] hover:underline" onClick={() => setInvoice(row.id)}>
                          {row.number}
                        </button>
                        <p className="text-xs text-[#86827b]">{row.name}</p>
                      </td>
                      <td className="px-4 py-2.5">{AGING_LABELS[row.bucket]}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportPreview>
          ) : null}
          {report === "profit" ? (
            <ReportPreview title="Job profitability" subtitle={`${basis} basis`}>
              <table className="w-full text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Job</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitJobs.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-b border-[#e5e5e5] last:border-0">
                      <td className="px-4 py-2.5">
                        {row.name}
                        <p className="text-xs text-[#86827b]">{row.salesRep}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(row.income)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(row.expenses)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{(row.margin * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportPreview>
          ) : null}
          {report === "commission" ? (
            <ReportPreview title="Commission report" subtitle="10% of gross profit">
              <table className="w-full text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Rep</th>
                    <th className="px-4 py-2 text-right">Jobs</th>
                    <th className="px-4 py-2 text-right">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((row) => (
                    <tr key={row.name} className="border-b border-[#e5e5e5] last:border-0">
                      <td className="px-4 py-2.5">{row.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{row.jobs}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(row.payout)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportPreview>
          ) : null}
          {report === "payments" ? (
            <ReportPreview title="Deposits and payments" subtitle={`${paymentRows.length} latest`}>
              <table className="w-full text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((payment) => (
                    <tr key={payment.id} className="border-b border-[#e5e5e5] last:border-0">
                      <td className="px-4 py-2.5">{formatDate(payment.paidAt)}</td>
                      <td className="px-4 py-2.5">
                        {payment.method}
                        {payment.reference ? (
                          <p className="text-xs text-[#86827b]">{payment.reference}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportPreview>
          ) : null}
          {report === "pending" ? (
            <ReportPreview
              title="Pending card payments"
              subtitle={
                pendingRows.length
                  ? `${pendingRows.length} to match · ${formatCurrencyFull(pendingAmount)}`
                  : "None waiting"
              }
            >
              {pendingRows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[#706e6b]">
                  No card charges are waiting. New Stripe payments show here until someone in
                  accounting matches them.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">On</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((payment) => {
                      const invoice = payment.invoiceId
                        ? crm.invoices.find((item) => item.id === payment.invoiceId)
                        : undefined;
                      const estimate = payment.estimateId
                        ? crm.estimates.find((item) => item.id === payment.estimateId)
                        : undefined;
                      const job = payment.jobId ? crm.getJob(payment.jobId) : undefined;
                      const label =
                        invoice?.number ||
                        estimate?.number ||
                        job?.name ||
                        job?.code ||
                        "Job deposit";
                      return (
                        <tr key={payment.id} className="border-b border-[#e5e5e5] last:border-0">
                          <td className="px-4 py-2.5">
                            {formatDate(payment.paidAt)}
                            <p className="text-xs text-[#86827b]">
                              {paymentMethodLabel(payment.method)}
                              {payment.reference ? ` · ${payment.reference}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            {invoice ? (
                              <button
                                type="button"
                                className="text-[#0176d3] hover:underline"
                                onClick={() => setInvoice(invoice.id)}
                              >
                                {label}
                              </button>
                            ) : job ? (
                              <Link href={`/jobs?job=${job.id}`} className="text-[#0176d3] hover:underline">
                                {label}
                              </Link>
                            ) : (
                              label
                            )}
                            {job && (invoice || estimate) ? (
                              <p className="text-xs text-[#86827b]">{job.name || job.code}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatCurrencyFull(payment.amount)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={settlingId === payment.id}
                                onClick={() => void settlePending(payment.id, "posted")}
                              >
                                Match & post
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={settlingId === payment.id}
                                onClick={() => void settlePending(payment.id, "rejected")}
                              >
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ReportPreview>
          ) : null}
          {report === "pnl" ? <ProfitAndLossReport statement={statement} /> : null}
        </TabsContent>

        <TabsContent value="tools" className="mt-4 space-y-4">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
              Accounting tools
            </p>
            <p className="text-sm text-[#706e6b]">Everyday money tasks without opening QuickBooks.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-sm border border-[#c9c9c9] bg-white p-4 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
              <h3 className="text-sm font-semibold text-[#181818]">Commission calculator</h3>
              <p className="mt-0.5 text-xs text-[#706e6b]">Rep payout on a closed job</p>
              <div className="mt-3 space-y-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="c-amt">Contract amount</Label>
                  <Input id="c-amt" type="number" min={0} value={contract} onChange={(event) => setContract(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="c-cost">Job cost</Label>
                  <Input id="c-cost" type="number" min={0} value={jobCost} onChange={(event) => setJobCost(event.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Plan</Label>
                  <Select
                    value={plan}
                    onValueChange={(value) => {
                      if (value === "gp10" || value === "gp50" || value === "rev3") setPlan(value);
                    }}
                    items={[
                      { value: "gp10", label: "10% of gross profit" },
                      { value: "gp50", label: "50/50 profit split" },
                      { value: "rev3", label: "3% of contract" },
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gp10">10% of gross profit</SelectItem>
                      <SelectItem value="gp50">50/50 profit split</SelectItem>
                      <SelectItem value="rev3">3% of contract</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-sm border border-[#dad7d1] bg-[#f3f3f3] px-3 py-3">
                  <p className="text-xs text-[#706e6b]">Rep payout</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-[#13295b]">
                    {formatCurrencyFull(payout.payout)}
                  </p>
                  <p className="mt-1 text-xs text-[#706e6b]">
                    Gross profit {formatCurrencyFull(payout.profit)} ({(payout.margin * 100).toFixed(1)}%)
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-sm border border-[#c9c9c9] bg-white p-4 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
              <h3 className="text-sm font-semibold text-[#181818]">Record a payment</h3>
              <p className="mt-0.5 text-xs text-[#706e6b]">Check, ACH, card, or insurance draw</p>
              <p className="mt-3 text-sm text-[#55524d]">
                Opens the same payment form used on a job. It queues for QuickBooks after you save.
              </p>
              <Button className="mt-4 w-full" onClick={() => setPaymentOpen(true)}>
                Record payment
              </Button>
            </section>

            <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
              <div className="border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
                <h3 className="text-sm font-semibold text-[#181818]">More tools</h3>
                <p className="mt-0.5 text-xs text-[#706e6b]">Receipts and invoices each have a review tab</p>
              </div>
              <ul className="divide-y divide-[#e5e5e5] text-sm">
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p>Expense review</p>
                    <p className="text-xs text-[#706e6b]">Receipts and supplier bills</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab("expenses")}>
                    Open
                  </Button>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p>Web Connector</p>
                    <p className="text-xs text-[#706e6b]">Password, .qwc, and poll</p>
                  </div>
                  <Button nativeButton={false} size="sm" variant="outline" render={<Link href="/settings/quickbooks" />}>
                    Open
                  </Button>
                </li>
                <li className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p>Profit and loss</p>
                    <p className="text-xs text-[#706e6b]">Year to date books</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab("reports")}>
                    Open
                  </Button>
                </li>
              </ul>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <LogPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-sm border border-[#c9c9c9] bg-white px-4 py-4 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">{label}</p>
      <p className={cn("mt-2 text-[1.85rem] leading-none font-semibold tabular-nums", warn ? "text-[#b3261e]" : "text-[#13295b]")}>
        {value}
      </p>
      <p className="mt-2 text-sm text-[#706e6b]">{hint}</p>
    </div>
  );
}

function QbConnectionCard({
  queueCount,
  invoices,
  expenses,
  payments,
  onViewQueue,
  onReview,
}: {
  queueCount: number;
  invoices: number;
  expenses: number;
  payments: number;
  onViewQueue: () => void;
  onReview: () => void;
}) {
  const [info, setInfo] = useState<{
    configured?: boolean;
    lastConnectedAt?: string | null;
    lastError?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/qbwc/setup")
      .then((response) => response.json())
      .then((data: { configured?: boolean; lastConnectedAt?: string | null; lastError?: string }) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = Boolean(info?.lastConnectedAt);
  return (
    <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <div className="border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#181818]">QuickBooks Desktop</h3>
        <p className="mt-0.5 text-xs text-[#706e6b]">Web Connector status</p>
      </div>
      <div className="space-y-3 px-4 py-4 text-sm">
        <p className="font-medium">
          <span
            className={cn(
              "mr-2 inline-block size-2.5 rounded-full",
              connected ? "bg-[#2f7a45] shadow-[0_0_0_4px_#e3f1e6]" : "bg-[#86827b]",
            )}
          />
          {connected ? "Connected" : info?.configured ? "Waiting for first poll" : "Not configured"}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-[#706e6b]">Last poll</dt>
          <dd className="text-right">{info?.lastConnectedAt ? formatDate(info.lastConnectedAt) : "—"}</dd>
          <dt className="text-[#706e6b]">In queue</dt>
          <dd className="text-right">
            {queueCount} request{queueCount === 1 ? "" : "s"}
          </dd>
        </dl>
        <p className="text-[#706e6b]">
          {invoices} invoices · {expenses} expenses · {payments} payments
        </p>
        {info?.lastError ? <p className="text-[#b3261e]">{info.lastError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onViewQueue}>
            View queue
          </Button>
          <Button size="sm" onClick={onReview}>
            Review invoices
          </Button>
        </div>
      </div>
    </section>
  );
}

function ReportCard({
  icon,
  title,
  description,
  onRun,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onRun: () => void;
}) {
  return (
    <section className="flex flex-col rounded-sm border border-[#c9c9c9] bg-white p-4 shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#181818]">
        {icon}
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm text-[#706e6b]">{description}</p>
      <div className="mt-3">
        <Button size="sm" onClick={onRun}>
          Run report
        </Button>
      </div>
    </section>
  );
}

function ReportPreview({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <div className="border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#181818]">{title}</h3>
        <p className="mt-0.5 text-xs text-[#706e6b]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
