"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { ProfitAndLossReport } from "@/components/profit-and-loss";
import { AccountingExpenseReview, ExpenseReviewCountBadge } from "@/components/accounting-expense-review";
import { AccountingInvoiceReview, InvoiceReviewCountBadge } from "@/components/accounting-invoice-review";
import { AccountingQuickBooks } from "@/components/accounting-qb-queue";
import { AccountingCloseouts, CloseoutCountBadge } from "@/components/accounting-closeouts";
import { AccountingRefunds, RefundCountBadge } from "@/components/accounting-refunds";
import { AccountingCategories } from "@/components/accounting-categories";
import { CreateInvoiceDialog } from "@/components/create-ops-dialogs";
import { LogPaymentDialog } from "@/components/log-financial-dialogs";
import { accCard, accRed, CountPill } from "@/components/accounting-chrome";
import { useCrm } from "@/lib/crm-store";
import { expenseCategoriesOrDefaults } from "@/lib/expense-categories";
import {
  AGING_LABELS,
  agingInvoiceRows,
  arAging,
  collectedThisMonth,
  commissionPayout,
  commissionRows,
  completedJobsWithoutInvoice,
  expenseBlockedReason,
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
import { formatCurrency, formatCurrencyFull, formatDate, formatMoney, localYmd } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { isOpenRefund, refundPayout } from "@/lib/refunds";
import type { JobBooksBasis } from "@/lib/job-financials";
import { buildProfitAndLoss, formatPnlPeriod, yearToDateBounds } from "@/lib/profit-and-loss";
import { canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";

const AGING_KEYS: AgingKey[] = ["current", "d1", "d31", "d61", "d90"];

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
  const [report, setReport] = useState<"aging" | "profit" | "commission" | "payments" | "pending" | "pnl" | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [createJobId, setCreateJobId] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState(false);
  const [payQuery, setPayQuery] = useState("");
  const [payJobId, setPayJobId] = useState<string | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("check");
  const ytd = useMemo(() => yearToDateBounds(), []);

  const connectorQueue = useMemo(() => {
    const invoices = crm.invoices.filter((invoice) => {
      if (invoice.archivedAt || invoice.qbStatus === "entered" || invoice.status === "void") return false;
      const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
      const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
      const blocked = invoiceBlockedReason({ invoice, job, lines });
      return invoice.qbStatus === "queued" || invoice.qbStatus === "error" || invoice.qbStatus === "returned" || Boolean(blocked);
    }).length;
    const expenses = crm.expenses.filter((expense) => {
      if (expense.qbStatus === "entered") return false;
      const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
      const blocked = expenseBlockedReason({
        expense,
        job,
        categories: expenseCategoriesOrDefaults(crm.expenseCategories),
      });
      return expense.qbStatus === "queued" || expense.qbStatus === "error" || expense.qbStatus === "returned" || Boolean(blocked);
    }).length;
    const payments = crm.payments.filter((payment) => {
      if (payment.qbStatus === "entered") return false;
      return payment.qbStatus === "queued" || payment.qbStatus === "error" || payment.qbStatus === "returned";
    }).length;
    return { invoices, expenses, payments };
  }, [crm]);
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
  const expenseErrors = useMemo(
    () =>
      crm.expenses.filter((expense) => {
        if (expense.qbStatus === "entered") return false;
        const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
        return (
          expense.qbStatus === "error" ||
          Boolean(
            expenseBlockedReason({
              expense,
              job,
              categories: expenseCategoriesOrDefaults(crm.expenseCategories),
            }),
          )
        );
      }),
    [crm],
  );
  const paymentErrors = useMemo(() => crm.payments.filter((payment) => payment.qbStatus === "error"), [crm.payments]);
  const syncErrorCount = syncErrors.length + expenseErrors.length + paymentErrors.length;
  const missingInvoices = useMemo(
    () => completedJobsWithoutInvoice(crm.jobs, crm.invoices),
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
      categories: expenseCategoriesOrDefaults(crm.expenseCategories),
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
    crm.expenseCategories,
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
  const openRefunds = (crm.refundRequests ?? []).filter(isOpenRefund);
  const openRefundAmount = openRefunds.reduce((sum, refund) => sum + refundPayout(refund), 0);
  const closeoutWaiting = (crm.commissionCloseouts ?? []).filter((item) => item.status === "submitted");
  const awaitingAmount = invoiceReviewAmount(awaiting, crm.invoiceLines);
  const payHits = useMemo(() => searchMoney(payQuery, crm), [crm, payQuery]);

  async function settlePending(id: string, next: "posted" | "rejected") {
    setSettlingId(id);
    try {
      await crm.settlePendingPayment(id, next);
    } finally {
      setSettlingId(null);
    }
  }

  async function invoiceAll(jobs: Job[]) {
    if (jobs.length === 0) return;
    setInvoicing(true);
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueAt = localYmd(due);
    try {
      for (const job of jobs) {
        const customer = crm.customerName(job) || job.name || "Job";
        await crm.addInvoice({
          name: `${customer} invoice`,
          clientId: job.clientId,
          jobId: job.id,
          dueAt,
        });
      }
      toast.success(`${jobs.length} draft ${jobs.length === 1 ? "invoice" : "invoices"} created.`);
    } catch {
      toast.error("Stopped while creating invoices.");
    } finally {
      setInvoicing(false);
    }
  }

  function setTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (next !== "review") params.delete("invoice");
    if (next !== "expenses") params.delete("expense");
    if (next !== "closeouts") params.delete("closeout");
    if (next !== "refunds") params.delete("refund");
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

  function setCloseout(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "closeouts");
    params.delete("invoice");
    params.delete("expense");
    if (id) params.set("closeout", id);
    else params.delete("closeout");
    router.replace(`/accounting?${params.toString()}`, { scroll: false });
  }

  function setRefund(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "refunds");
    params.delete("invoice");
    params.delete("expense");
    if (id) params.set("refund", id);
    else params.delete("refund");
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
  const seat = viewer.role === "accountant" ? "Accounting" : "Admin";
  const closeItems = [
    missingInvoices.length > 0,
    syncErrorCount > 0,
    unassignedBills.length > 0,
    closeoutWaiting.length > 0,
  ];
  const openClose = closeItems.filter(Boolean).length;
  const firstError = syncErrors[0];

  return (
    <div className="space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#8a847c]">{seat} · Every invoice, payment, refund, and sync in the company</p>
          <h1 className="mt-1 text-[2rem] leading-none font-semibold tracking-tight text-[#1a1a1a]">Accounting</h1>
        </div>
        {tab === "overview" ? (
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#e6e1da] bg-white px-4 py-2 text-sm">{monthLabel}</span>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setTab("reports")}>
              Open reports
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          variant="line"
          className="h-auto! w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-[#e6e1da] bg-transparent p-0"
        >
          <Tab value="overview">Overview</Tab>
          <Tab value="review">
            Invoice review
            <InvoiceReviewCountBadge />
          </Tab>
          <Tab value="expenses">
            Expense review
            <ExpenseReviewCountBadge />
          </Tab>
          <Tab value="closeouts">
            Closeouts
            <CloseoutCountBadge />
          </Tab>
          <Tab value="refunds">
            Refunds
            <RefundCountBadge />
          </Tab>
          <Tab value="sync">
            QuickBooks sync
            {syncErrorCount > 0 ? <CountPill tone="danger">{syncErrorCount} errors</CountPill> : null}
          </Tab>
          <Tab value="categories">Categories</Tab>
          <Tab value="reports">Reports</Tab>
          <Tab value="tools">Tools</Tab>
        </TabsList>

        <TabsContent value="overview" className="mt-5 space-y-4">
          <section className="rounded-3xl bg-[#161616] px-5 py-5 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-white/55">{monthLabel.toUpperCase()} CLOSE</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {openClose === 0
                    ? "Nothing stands between you and a clean month"
                    : `${openClose} ${openClose === 1 ? "thing stands" : "things stand"} between you and a clean month`}
                </h2>
              </div>
              <p className="text-sm text-white/60">{4 - openClose} of 4 cleared</p>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CloseCard
                title="Invoice finished jobs"
                count={missingInvoices.length}
                body="Completed work with no invoice yet."
                action="Create invoices"
                onClick={() => document.getElementById("finished-jobs")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              />
              <CloseCard
                title="Clear sync errors"
                count={syncErrorCount}
                body={firstError ? `${firstError.number} is blocking QuickBooks.` : "Nothing is blocking QuickBooks."}
                action={firstError ? `Fix ${firstError.number}` : "Open the queue"}
                onClick={() => (firstError ? setInvoice(firstError.id) : setTab("sync"))}
              />
              <CloseCard
                title="Match supplier bills"
                count={unassignedBills.length}
                body="Bills not tied to any job."
                action="Match to jobs"
                onClick={() => setTab("expenses")}
              />
              <CloseCard
                title="Release closeout"
                count={closeoutWaiting.length}
                body="Compare QuickBooks to job expenses, then pay commission."
                action="Open closeout"
                onClick={() => setTab("closeouts")}
              />
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="AR outstanding"
              value={formatCurrencyFull(aging.total)}
              hint={`${aging.count} open ${aging.count === 1 ? "invoice" : "invoices"}${aging.d1 > 0 && aging.total === aging.d1 ? " · all 1–30 days" : ""}`}
            />
            <Kpi
              label="Awaiting approval"
              value={formatCurrencyFull(awaitingAmount)}
              hint={`${awaiting.length} ${awaiting.length === 1 ? "invoice" : "invoices"} ready`}
              action="Review"
              onAction={() => setTab("review")}
            />
            <Kpi
              label="Collected this month"
              value={formatCurrency(collected.amount)}
              hint={`${collected.count} ${collected.count === 1 ? "payment" : "payments"} recorded`}
            />
            <Kpi
              label="Sync errors"
              value={String(syncErrorCount)}
              hint={firstError ? `${firstError.number} is blocked` : "Queue is clear"}
              warn={syncErrorCount > 0}
              action={syncErrorCount > 0 ? "Fix" : undefined}
              onAction={() => (firstError ? setInvoice(firstError.id) : setTab("sync"))}
            />
          </div>

          {openRefunds.length > 0 ? (
            <section className={cn(accCard, "flex flex-wrap items-center justify-between gap-3 px-4 py-3")}>
              <div>
                <p className="text-sm font-semibold">
                  {openRefunds.length} {openRefunds.length === 1 ? "refund" : "refunds"} to process
                </p>
                <p className="text-xs text-[#6f6a64]">
                  {formatMoney(openRefundAmount)} requested from jobs. Approve it, then send the money back.
                </p>
              </div>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setTab("refunds")}>
                Open refunds
              </Button>
            </section>
          ) : null}

          {pendingRows.length > 0 ? (
            <section className={cn(accCard, "flex flex-wrap items-center justify-between gap-3 px-4 py-3")}>
              <div>
                <p className="text-sm font-semibold">
                  {pendingRows.length} pending card {pendingRows.length === 1 ? "payment" : "payments"}
                </p>
                <p className="text-xs text-[#6f6a64]">
                  {formatCurrencyFull(pendingAmount)} charged in Stripe. Match and post as a job deposit, or reject it.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setTab("reports");
                  setReport("pending");
                }}
              >
                Open pending report
              </Button>
            </section>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.7fr)]">
            <div className="space-y-4">
              <section id="finished-jobs" className={cn(accCard, "overflow-hidden")}>
                <div className="flex items-center justify-between gap-3 px-4 py-4">
                  <div>
                    <h3 className="text-base font-semibold">Finished jobs with no invoice</h3>
                    <p className="text-sm text-[#8a847c]">Billable work sitting idle. Invoice these before month end.</p>
                  </div>
                  {missingInvoices.length > 0 ? (
                    <Button
                      type="button"
                      className={cn("rounded-full", accRed)}
                      disabled={invoicing}
                      onClick={() => void invoiceAll(missingInvoices)}
                    >
                      Invoice all {missingInvoices.length}
                    </Button>
                  ) : null}
                </div>
                {missingInvoices.length === 0 ? (
                  <p className="px-4 pb-5 text-sm text-[#6f6a64]">Every finished job has an invoice.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-[#8a847c]">
                      <tr>
                        <th className="px-4 py-2 font-medium">Customer</th>
                        <th className="px-4 py-2 font-medium">Address</th>
                        <th className="px-4 py-2 font-medium">City</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {missingInvoices.map((job) => {
                        const customer = crm.customerName(job) || job.name;
                        return (
                          <tr key={job.id} className="border-t border-[#f3efe9]">
                            <td className="px-4 py-3 font-medium">{lastWord(customer)}</td>
                            <td className="px-4 py-3 text-[#3c3a37]">{job.street.trim() || jobAddress(job) || "—"}</td>
                            <td className="px-4 py-3 text-[#3c3a37]">{cityLine(job) || "—"}</td>
                            <td className="px-4 py-3 text-right">
                              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setCreateJobId(job.id)}>
                                Create invoice
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              <section className={cn(accCard, "p-5")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">Receivables aging</h3>
                  <button type="button" className="text-sm font-medium text-[#c43832] hover:underline" onClick={() => { setTab("reports"); setReport("aging"); }}>
                    Full AR aging →
                  </button>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[#eceae4]">
                  {AGING_KEYS.map((key) =>
                    aging[key] > 0 ? (
                      <span
                        key={key}
                        className={key === "current" || key === "d1" ? "bg-[#1c1c1c]" : key === "d31" ? "bg-[#8d8680]" : "bg-[#c43832]"}
                        style={{ width: `${(aging[key] / aging.total) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 text-sm">
                  {AGING_KEYS.map((key) => (
                    <div key={key}>
                      <p className="text-[#8a847c]">{AGING_LABELS[key]}</p>
                      <p className="mt-1 font-medium tabular-nums">{aging[key] ? formatCurrencyFull(aging[key]) : "$0"}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <QbDeskCard
                queueCount={connectorQueue.invoices + connectorQueue.expenses + connectorQueue.payments}
                invoices={connectorQueue.invoices}
                expenses={connectorQueue.expenses}
                payments={connectorQueue.payments}
                onViewQueue={() => setTab("sync")}
                onSync={() => setTab("sync")}
              />
              <BlockingCard
                invoiceNumber={firstError?.number}
                invoiceId={firstError?.id}
                reason={
                  firstError
                    ? invoiceBlockedReason({
                        invoice: firstError,
                        job: firstError.jobId ? crm.getJob(firstError.jobId) : undefined,
                        lines: crm.invoiceLines.filter((line) => line.invoiceId === firstError.id),
                      })
                    : null
                }
                onOpen={(id) => setInvoice(id)}
                onRetry={() => {
                  if (!firstError) return;
                  const job = firstError.jobId ? crm.getJob(firstError.jobId) : undefined;
                  const lines = crm.invoiceLines.filter((line) => line.invoiceId === firstError.id);
                  const blocked = invoiceBlockedReason({ invoice: firstError, job, lines });
                  if (blocked) {
                    toast.error(blocked);
                    return;
                  }
                  void crm.setQbStatus("invoice", firstError.id, "queued").then((ok) => {
                    if (ok) toast.success(`${firstError.number} is back in the Web Connector queue.`);
                  });
                }}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="review" className="mt-5">
          <AccountingInvoiceReview selectedId={selectedInvoice} onSelect={setInvoice} />
        </TabsContent>

        <TabsContent value="expenses" className="mt-5">
          <AccountingExpenseReview selectedId={selectedExpense} onSelect={setExpense} />
        </TabsContent>

        <TabsContent value="closeouts" className="mt-5">
          <AccountingCloseouts selectedId={searchParams.get("closeout")} onSelect={setCloseout} />
        </TabsContent>

        <TabsContent value="refunds" className="mt-5">
          <AccountingRefunds selectedId={searchParams.get("refund")} onSelect={setRefund} />
        </TabsContent>

        <TabsContent value="sync" className="mt-5">
          <AccountingQuickBooks onReviewInvoice={setInvoice} />
        </TabsContent>

        <TabsContent value="categories" className="mt-5">
          <AccountingCategories />
        </TabsContent>

        <TabsContent value="reports" className="mt-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#6f6a64]">Run from live job and invoice books, no QuickBooks needed.</p>
            <div className="flex rounded-full bg-[#eceae4] p-1">
              <button
                type="button"
                className={cn("rounded-full px-4 py-1.5 text-sm font-medium", basis === "accrual" ? "bg-white shadow-sm" : "text-[#6f6a64]")}
                onClick={() => setBasis("accrual")}
              >
                Accrual
              </button>
              <button
                type="button"
                className={cn("rounded-full px-4 py-1.5 text-sm font-medium", basis === "cash" ? "bg-white shadow-sm" : "text-[#6f6a64]")}
                onClick={() => setBasis("cash")}
              >
                Cash
              </button>
            </div>
          </div>

          <ReportSection title="Money in">
            <ReportCard
              title="AR aging"
              description="Open balances by invoice and days past due."
              metric={`${formatCurrencyFull(aging.total)} open · ${aging.count} ${aging.count === 1 ? "invoice" : "invoices"}`}
              active={report === "aging"}
              onRun={() => setReport(report === "aging" ? null : "aging")}
            />
            <ReportCard
              title="Deposits and payments"
              description="Every posted payment, newest first."
              metric={`${formatCurrency(collected.amount)} collected this month`}
              active={report === "payments"}
              onRun={() => setReport(report === "payments" ? null : "payments")}
            />
            <ReportCard
              title="Pending card payments"
              description="Match Stripe charges before they post as a job deposit."
              metric={pendingRows.length ? `${formatCurrencyFull(pendingAmount)} to match` : undefined}
              active={report === "pending"}
              onRun={() => setReport(report === "pending" ? null : "pending")}
            />
          </ReportSection>
          <ReportSection title="Profit">
            <ReportCard
              title="Job profitability"
              description="Contract vs. actual cost for billed jobs, with margin."
              active={report === "profit"}
              onRun={() => setReport(report === "profit" ? null : "profit")}
            />
            <ReportCard
              title="Profit and loss"
              description="Year-to-date books in QuickBooks form."
              active={report === "pnl"}
              onRun={() => setReport(report === "pnl" ? null : "pnl")}
            />
          </ReportSection>
          <ReportSection title="People">
            <ReportCard
              title="Commission report"
              description="Payout by sales rep on billed jobs."
              active={report === "commission"}
              onRun={() => setReport(report === "commission" ? null : "commission")}
              wide
            />
          </ReportSection>

          {report === "aging" ? (
            <ReportPreview title="AR aging" subtitle={`${formatCurrencyFull(aging.total)} open`}>
              <table className="w-full text-sm">
                <thead className="border-b border-[#ece7e1] text-[11px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-left">Bucket</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {agingRows.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-b border-[#f3efe9] last:border-0">
                      <td className="px-4 py-2.5">
                        <button type="button" className="text-[#c43832] hover:underline" onClick={() => setInvoice(row.id)}>
                          {row.number}
                        </button>
                        <p className="text-xs text-[#8a847c]">{row.name}</p>
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
                <thead className="border-b border-[#ece7e1] text-[11px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Job</th>
                    <th className="px-4 py-2 text-right">Income</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitJobs.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-b border-[#f3efe9] last:border-0">
                      <td className="px-4 py-2.5">
                        {row.name}
                        <p className="text-xs text-[#8a847c]">{row.salesRep}</p>
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
                <thead className="border-b border-[#ece7e1] text-[11px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Rep</th>
                    <th className="px-4 py-2 text-right">Jobs</th>
                    <th className="px-4 py-2 text-right">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((row) => (
                    <tr key={row.name} className="border-b border-[#f3efe9] last:border-0">
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
                <thead className="border-b border-[#ece7e1] text-[11px] font-semibold tracking-wide text-[#8a847c] uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((payment) => (
                    <tr key={payment.id} className="border-b border-[#f3efe9] last:border-0">
                      <td className="px-4 py-2.5">{formatDate(payment.paidAt)}</td>
                      <td className="px-4 py-2.5">
                        {payment.method}
                        {payment.reference ? <p className="text-xs text-[#8a847c]">{payment.reference}</p> : null}
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
              subtitle={pendingRows.length ? `${pendingRows.length} to match · ${formatCurrencyFull(pendingAmount)}` : "None waiting"}
            >
              {pendingRows.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[#6f6a64]">
                  No card charges are waiting. New Stripe payments show here until someone in accounting matches them.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-[#ece7e1] text-[11px] font-semibold tracking-wide text-[#8a847c] uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">On</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2 text-right">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.map((payment) => {
                      const invoice = payment.invoiceId ? crm.invoices.find((item) => item.id === payment.invoiceId) : undefined;
                      const estimate = payment.estimateId ? crm.estimates.find((item) => item.id === payment.estimateId) : undefined;
                      const job = payment.jobId ? crm.getJob(payment.jobId) : undefined;
                      const label = invoice?.number || estimate?.number || job?.name || job?.code || "Job deposit";
                      return (
                        <tr key={payment.id} className="border-b border-[#f3efe9] last:border-0">
                          <td className="px-4 py-2.5">
                            {formatDate(payment.paidAt)}
                            <p className="text-xs text-[#8a847c]">
                              {paymentMethodLabel(payment.method)}
                              {payment.reference ? ` · ${payment.reference}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            {invoice ? (
                              <button type="button" className="text-[#c43832] hover:underline" onClick={() => setInvoice(invoice.id)}>
                                {label}
                              </button>
                            ) : job ? (
                              <Link href={`/jobs?job=${job.id}`} className="text-[#c43832] hover:underline">
                                {label}
                              </Link>
                            ) : (
                              label
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrencyFull(payment.amount)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" disabled={settlingId === payment.id} onClick={() => void settlePending(payment.id, "posted")}>
                                Match & post
                              </Button>
                              <Button type="button" size="sm" variant="outline" disabled={settlingId === payment.id} onClick={() => void settlePending(payment.id, "rejected")}>
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

          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#e0dbd4] px-4 py-4">
            <div>
              <p className="text-sm font-semibold">Get these by email</p>
              <p className="text-sm text-[#6f6a64]">Schedule AR aging or P&L to land every Monday morning.</p>
              {scheduleOpen ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => { setReport("aging"); setScheduleOpen(false); }}>
                    Open AR aging
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => { setReport("pnl"); setScheduleOpen(false); }}>
                    Open profit and loss
                  </Button>
                  <p className="text-xs text-[#8a847c]">Monday email isn’t connected on this workspace, so the report opens here.</p>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setScheduleOpen((value) => !value)}>
              Schedule a report
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="tools" className="mt-5">
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
            <section className={cn(accCard, "grid overflow-hidden md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]")}>
              <div className="p-5">
                <h3 className="text-base font-semibold">Commission calculator</h3>
                <p className="mt-0.5 text-sm text-[#8a847c]">Rep payout on a closed job</p>
                <div className="mt-4 space-y-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="c-amt">Contract amount</Label>
                    <CurrencyInput id="c-amt" value={contract} onValueChange={setContract} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="c-cost">Job cost</Label>
                    <CurrencyInput id="c-cost" value={jobCost} onValueChange={setJobCost} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PlanButton active={plan === "gp10"} onClick={() => setPlan("gp10")}>
                      10% of gross profit
                    </PlanButton>
                    <PlanButton active={plan === "gp50"} onClick={() => setPlan("gp50")}>
                      50% profit split
                    </PlanButton>
                    <PlanButton active={plan === "rev3"} onClick={() => setPlan("rev3")}>
                      3% of contract
                    </PlanButton>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-between bg-[#161616] p-5 text-white">
                <div>
                  <p className="text-sm text-white/60">Rep payout</p>
                  <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums">{formatCurrencyFull(payout.payout)}</p>
                  <div className="relative mt-6 h-1.5 rounded-full bg-white/15">
                    <span
                      className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-[#c43832]"
                      style={{ left: `${Math.min(96, Math.max(4, payout.margin * 100))}%` }}
                    />
                  </div>
                </div>
                <dl className="mt-8 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-white/60">Gross profit</dt>
                    <dd className="tabular-nums">{formatCurrencyFull(payout.profit)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/60">Margin</dt>
                    <dd className="tabular-nums">{(payout.margin * 100).toFixed(1)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-white/60">Company keeps</dt>
                    <dd className="tabular-nums">{formatCurrencyFull(Math.max(0, payout.profit - payout.payout))}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <section className={cn(accCard, "p-5")}>
              <h3 className="text-base font-semibold">Record a payment</h3>
              <p className="mt-0.5 text-sm text-[#8a847c]">Queues for QuickBooks after you save</p>
              <label className="mt-4 block text-sm">
                <span className="mb-1.5 block text-[#6f6a64]">Job or invoice</span>
                <input
                  value={payQuery}
                  onChange={(event) => {
                    setPayQuery(event.target.value);
                    setPayJobId(null);
                    setPayInvoiceId(null);
                  }}
                  placeholder="Search by customer, address or INV #"
                  aria-label="Search by customer, address or invoice number"
                  className="h-11 w-full rounded-xl border border-[#e6e1da] bg-white px-3 text-sm outline-none placeholder:text-[#9a958e] focus:border-[#c8c2b8]"
                />
              </label>
              {payHits.length > 0 && !payJobId && !payInvoiceId ? (
                <ul className="mt-2 overflow-hidden rounded-xl border border-[#ece7e1]">
                  {payHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#faf9f7]"
                        onClick={() => {
                          setPayQuery(hit.label);
                          setPayJobId(hit.jobId);
                          setPayInvoiceId(hit.invoiceId);
                        }}
                      >
                        <span>{hit.label}</span>
                        <span className="text-xs text-[#8a847c]">{hit.kind}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-4 text-sm text-[#6f6a64]">Method</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  ["check", "Check"],
                  ["ACH", "ACH"],
                  ["card", "Card"],
                  ["insurance", "Insurance draw"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPayMethod(value)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-medium",
                      payMethod === value ? "border-[#1c1c1c] bg-[#1c1c1c] text-white" : "border-[#e6e1da] bg-white",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                className={cn("mt-4 h-11 w-full rounded-xl", accRed)}
                onClick={() => setPaymentOpen(true)}
              >
                Continue
              </Button>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <LogPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        defaultJobId={payJobId}
        defaultInvoiceId={payInvoiceId}
        defaultMethod={payMethod}
      />
      <CreateInvoiceDialog
        open={Boolean(createJobId)}
        onOpenChange={(open) => {
          if (!open) setCreateJobId(null);
        }}
        defaultJobId={createJobId ?? undefined}
      />
    </div>
  );
}

function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsTrigger value={value} className="h-11 flex-none rounded-none px-3 text-[15px] font-medium text-[#6f6a64] data-active:text-[#1a1a1a]">
      {children}
    </TabsTrigger>
  );
}

function CloseCard({
  title,
  count,
  body,
  action,
  onClick,
}: {
  title: string;
  count: number;
  body: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl bg-[#242424] p-4 text-left hover:bg-[#2c2c2c]">
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-2xl font-semibold tabular-nums">{count}</span>
      </span>
      <span className="mt-3 block min-h-10 text-sm text-white/65">{body}</span>
      <span className="mt-4 block text-sm text-white/80">{action} →</span>
    </button>
  );
}

function Kpi({
  label,
  value,
  hint,
  warn,
  action,
  onAction,
}: {
  label: string;
  value: string;
  hint: string;
  warn?: boolean;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={cn(accCard, "px-4 py-4", warn && "border-[#f0c8c4]")}>
      <p className={cn("text-sm", warn ? "text-[#c43832]" : "text-[#6f6a64]")}>{label}</p>
      <p className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", warn ? "text-[#c43832]" : "text-[#1a1a1a]")}>
        {value}
      </p>
      <p className="mt-2 text-sm text-[#6f6a64]">
        {hint}
        {action ? (
          <>
            {" · "}
            <button type="button" className="font-medium text-[#c43832] hover:underline" onClick={onAction}>
              {action}
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

function QbDeskCard({
  queueCount,
  invoices,
  expenses,
  payments,
  onViewQueue,
  onSync,
}: {
  queueCount: number;
  invoices: number;
  expenses: number;
  payments: number;
  onViewQueue: () => void;
  onSync: () => void;
}) {
  const [info, setInfo] = useState<{ configured?: boolean; lastConnectedAt?: string | null; lastError?: string } | null>(null);
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
  const stale = pollIsStale(info?.lastConnectedAt);
  const total = Math.max(queueCount, 1);
  return (
    <section className={cn(accCard, "p-5")}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">QuickBooks Desktop</h3>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", connected ? "bg-[#e7f6ea] text-[#217a45]" : "bg-[#f3f1ec] text-[#5c5854]")}>
          <span className={cn("size-1.5 rounded-full", connected ? "bg-[#217a45]" : "bg-[#8a847c]")} />
          {connected ? "Connected" : info?.configured ? "Waiting" : "Not set up"}
        </span>
      </div>
      {stale ? (
        <p className="mt-3 rounded-xl bg-[#fbf1df] px-3 py-2 text-sm text-[#8a5a22]">
          Last poll was {info?.lastConnectedAt ? formatDate(info.lastConnectedAt) : "never"}. Web Connector hasn’t checked in
          since.
          {queueCount > 0 ? " Requests are piling up." : ""}
        </p>
      ) : (
        <p className="mt-3 text-sm text-[#6f6a64]">Last poll {formatDate(info?.lastConnectedAt)}</p>
      )}
      <div className="mt-4 flex items-end justify-between text-sm">
        <span className="text-[#6f6a64]">In queue</span>
        <span className="font-semibold">{queueCount} requests</span>
      </div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#eceae4]">
        <span className="bg-[#1c1c1c]" style={{ width: `${(invoices / total) * 100}%` }} />
        <span className="bg-[#8d8680]" style={{ width: `${(expenses / total) * 100}%` }} />
        <span className="bg-[#c43832]" style={{ width: `${(payments / total) * 100}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#8a847c]">
        {invoices} invoices · {expenses} expenses · {payments} payments
      </p>
      {info?.lastError ? <p className="mt-2 text-sm text-[#c43832]">{info.lastError}</p> : null}
      <div className="mt-4 flex gap-2">
        <Button type="button" className="rounded-full bg-[#1c1c1c] text-white hover:bg-[#333]" onClick={onSync}>
          Run sync now
        </Button>
        <Button type="button" variant="outline" className="rounded-full" onClick={onViewQueue}>
          View queue
        </Button>
      </div>
    </section>
  );
}

function BlockingCard({
  invoiceNumber,
  invoiceId,
  reason,
  onOpen,
  onRetry,
}: {
  invoiceNumber?: string;
  invoiceId?: string;
  reason: string | null;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  if (!invoiceNumber || !invoiceId) {
    return (
      <section className={cn(accCard, "p-5")}>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8a847c]">BLOCKING SYNC</p>
        <p className="mt-2 text-sm text-[#6f6a64]">Nothing is blocking QuickBooks.</p>
      </section>
    );
  }
  const noJob = Boolean(reason && /job/i.test(reason));
  const noLines = Boolean(reason && /line item/i.test(reason));
  return (
    <section className={cn(accCard, "border-[#f0c8c4] p-5")}>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#c43832]">BLOCKING SYNC</p>
      <h3 className="mt-2 text-base font-semibold">{invoiceNumber} can’t go to QuickBooks</h3>
      <p className="mt-1 text-sm text-[#6f6a64]">Pick one fix to unblock it.</p>
      <div className="mt-3 space-y-2">
        {noJob ? (
          <BlockAction label="Link a job" hint="no job attached" onClick={() => onOpen(invoiceId)} />
        ) : null}
        {noLines ? (
          <BlockAction label="Add line items" hint="invoice is empty" href={`/invoices/${invoiceId}`} />
        ) : null}
        {!noJob && !noLines ? (
          <BlockAction label="Review the invoice" hint={reason || "QuickBooks rejected it"} onClick={() => onOpen(invoiceId)} />
        ) : null}
        <BlockAction label="Retry sync" hint="if it’s already fixed" onClick={onRetry} />
      </div>
    </section>
  );
}

function BlockAction({
  label,
  hint,
  onClick,
  href,
}: {
  label: string;
  hint: string;
  onClick?: () => void;
  href?: string;
}) {
  const className = "flex w-full items-center justify-between rounded-xl border border-[#ece7e1] px-3 py-3 text-left text-sm hover:bg-[#faf9f7]";
  const body = (
    <>
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-[#8a847c]"> · {hint}</span>
      </span>
      <ChevronRight className="size-4 text-[#8a847c]" />
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8a847c] uppercase">{title}</p>
      <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function ReportCard({
  title,
  description,
  metric,
  onRun,
  active,
  wide,
}: {
  title: string;
  description: string;
  metric?: string;
  onRun: () => void;
  active?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRun}
      className={cn(accCard, "flex items-start justify-between gap-3 p-4 text-left", wide && "xl:col-span-3", active && "ring-1 ring-[#1c1c1c]")}
    >
      <span>
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-1 block text-sm text-[#6f6a64]">{description}</span>
        {metric ? <span className="mt-3 block text-sm font-medium">{metric}</span> : null}
      </span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-[#8a847c]" />
    </button>
  );
}

function ReportPreview({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={cn(accCard, "overflow-hidden")}>
      <div className="border-b border-[#ece7e1] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-[#8a847c]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function PlanButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 rounded-full px-3 text-sm font-medium",
        active ? "bg-[#1c1c1c] text-white" : "border border-[#e6e1da] bg-white text-[#1a1a1a]",
      )}
    >
      {children}
    </button>
  );
}

function pollIsStale(iso: string | null | undefined) {
  if (!iso) return true;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return true;
  return Date.now() - date.getTime() > 2 * 86_400_000;
}

function lastWord(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name || "—";
}

function cityLine(job: Job) {
  const region = [job.state, job.postalCode].filter((part) => part.trim()).join(" ");
  return [job.city.trim(), region].filter(Boolean).join(", ");
}

function searchMoney(
  query: string,
  crm: {
    invoices: { id: string; number: string; name: string; jobId: string | null; status: string; archivedAt?: string | null }[];
    jobs: Job[];
    customerName: (record: { jobId?: string | null; clientId?: string | null; primaryContactId?: string | null; opportunityId?: string | null }) => string;
    getJob: (id: string) => Job | undefined;
  },
) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: { id: string; label: string; kind: string; jobId: string | null; invoiceId: string | null }[] = [];
  for (const invoice of crm.invoices) {
    if (invoice.archivedAt || invoice.status === "void") continue;
    const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
    const customer = crm.customerName(invoice);
    const hay = `${invoice.number} ${invoice.name} ${customer} ${job ? jobAddress(job) : ""}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    hits.push({
      id: invoice.id,
      label: `${invoice.number} · ${customer || invoice.name}`,
      kind: "Invoice",
      jobId: invoice.jobId,
      invoiceId: invoice.id,
    });
    if (hits.length >= 6) return hits;
  }
  for (const job of crm.jobs) {
    if (job.deletedAt) continue;
    const customer = crm.customerName(job);
    const hay = `${job.code} ${job.name} ${customer} ${jobAddress(job)}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    hits.push({
      id: job.id,
      label: `${customer || job.name}${job.code ? ` · ${job.code}` : ""}`,
      kind: "Job",
      jobId: job.id,
      invoiceId: null,
    });
    if (hits.length >= 6) break;
  }
  return hits;
}
