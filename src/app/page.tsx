"use client";

import { useMemo, useState } from "react";
import { BdRoiPanel } from "@/components/bd-roi";
import { HomeDesk } from "@/components/home-desk";
import { AutomationConfirmations } from "@/components/automation-confirmations";
import { HomeOnboarding } from "@/components/home-onboarding";
import { ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { isBusinessDevelopment } from "@/lib/bd";
import { useCrm } from "@/lib/crm-store";
import { closedWonThisMonth, homeGoalScope, homeQuota, wonDeals } from "@/lib/home-dashboard";
import { buildHomeDesk } from "@/lib/home-desk";
import { localYmd } from "@/lib/format";
import { qbQueue } from "@/lib/job-financials";
import { actionableJobCodeReviews } from "@/lib/job-code";
import { jobRecordHref } from "@/lib/job-record";
import { itemTitle, jobDocumentHref, pmReviewNotices } from "@/lib/qb-review";
import { actionableReturningClientNotices } from "@/lib/returning-client";
import { canViewAccounting } from "@/lib/visibility";

export default function HomePage() {
  const crm = useCrm();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decidingCodeId, setDecidingCodeId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const reviewNotices = useMemo(() => {
    const staff = crm.effectiveStaff;
    if (!staff) return [];
    return pmReviewNotices({
      staff,
      roster: crm.staff,
      jobs: crm.jobs,
      invoices: crm.invoices,
      expenses: crm.expenses,
      payments: crm.payments,
      comments: crm.qbReviewComments ?? [],
    });
  }, [crm.effectiveStaff, crm.expenses, crm.invoices, crm.jobs, crm.payments, crm.qbReviewComments, crm.staff]);

  const returningNotices = useMemo(
    () => actionableReturningClientNotices(crm.returningClientLeads, crm.effectiveStaff),
    [crm.effectiveStaff, crm.returningClientLeads],
  );

  const jobCodeReviews = useMemo(
    () => actionableJobCodeReviews(crm.tasks, crm.jobs, crm.effectiveStaff),
    [crm.effectiveStaff, crm.jobs, crm.tasks],
  );

  const desk = useMemo(() => {
    const viewer = crm.effectiveStaff;
    const { ownerIds, roster } = homeGoalScope(viewer, crm.staff);
    const deals = wonDeals({
      jobs: crm.jobs,
      estimates: crm.estimates,
      estimateLines: crm.estimateLines,
      opportunities: crm.opportunities,
      staff: crm.staff,
      ownerIds,
    });
    const closed = closedWonThisMonth(deals);
    const quota = homeQuota(viewer, crm.company, roster);
    const qb = viewer && canViewAccounting(viewer.role)
      ? qbQueue({
          invoices: crm.invoices,
          invoiceLines: crm.invoiceLines,
          payments: crm.payments,
          expenses: crm.expenses,
        })
      : null;
    return buildHomeDesk({
      firstName: crm.user.name.split(" ")[0] || "there",
      jobs: crm.jobs,
      opportunities: crm.opportunities,
      estimates: crm.estimates,
      lines: crm.estimateLines,
      tasks: crm.tasks,
      events: crm.events,
      activities: crm.activities,
      contacts: crm.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
      })),
      customerName: (job) => crm.customerName(job),
      closeouts: (crm.commissionCloseouts ?? []).map((closeout) => ({
        jobId: closeout.jobId,
        status: closeout.status,
      })),
      signed: { amount: closed.amount, count: closed.count, avg: closed.avg },
      quota,
      qb: qb
        ? {
            invoiceCount: qb.invoiceCount,
            expenseCount: qb.expenseCount,
            paymentCount: qb.paymentCount,
          }
        : null,
      accounting: reviewNotices.map((notice) => ({
        id: `${notice.item.kind}-${notice.item.id}`,
        title: itemTitle(notice.item),
        detail: `${notice.reason === "tagged" ? "You were tagged." : "Sent back for a change."} ${notice.preview}`,
        href: jobDocumentHref(notice.jobId, notice.item.kind, notice.item.id),
      })),
      returning: returningNotices.map((notice) => {
        const opportunity = crm.getOpportunity(notice.opportunityId);
        const job = notice.jobId ? crm.getJob(notice.jobId) : undefined;
        const title = [opportunity?.code, opportunity?.name].filter(Boolean).join(" · ") || "Lead";
        return {
          notice,
          title,
          href: job ? jobRecordHref(job.id) : `/opportunities/${notice.opportunityId}`,
        };
      }),
      jobCodes: jobCodeReviews,
    });
  }, [crm, jobCodeReviews, returningNotices, reviewNotices]);

  async function decideReturning(
    noticeId: string,
    decision: "take" | "decline" | "reassigned" | "kept" | "dismiss",
  ) {
    setDecidingId(noticeId);
    try {
      await crm.decideReturningClientLead(noticeId, decision);
    } finally {
      setDecidingId(null);
    }
  }

  async function decideJobCode(jobId: string, decision: "redo" | "keep" | "change", code?: string) {
    setDecidingCodeId(jobId);
    try {
      await crm.decideJobCodeReview(jobId, decision, code);
    } finally {
      setDecidingCodeId(null);
    }
  }

  async function completeTask(taskId: string) {
    setCompletingId(taskId);
    try {
      await crm.toggleTask(taskId);
    } finally {
      setCompletingId(null);
    }
  }

  async function clearRow(row: { id: string; title: string; relatedId: string }) {
    setCompletingId(row.id);
    try {
      await crm.addTask({
        title: row.title,
        dueAt: localYmd(new Date()),
        relatedType: "job",
        relatedId: row.relatedId,
        assignee: crm.effectiveStaff?.name || crm.user.name,
        notes: "Cleared from Needs you today.",
        completed: true,
      });
    } finally {
      setCompletingId(null);
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  const hasLeads = crm.opportunities.length > 0;
  const showBd = Boolean(crm.viewer && isBusinessDevelopment(crm.viewer.role));

  return (
    <div className="space-y-4">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <AutomationConfirmations />
      {!hasLeads ? <HomeOnboarding viewer={crm.effectiveStaff} /> : (
        <HomeDesk
          desk={desk}
          busyId={completingId || decidingId || decidingCodeId}
          onCompleteTask={(id) => void completeTask(id)}
          onClearRow={(row) => void clearRow(row)}
          onReturning={(id, decision) => void decideReturning(id, decision)}
          onJobCode={(jobId, decision, code) => void decideJobCode(jobId, decision, code)}
        />
      )}
      {hasLeads && showBd && crm.viewer ? <BdRoiPanel state={crm.book} viewer={crm.viewer} /> : null}
    </div>
  );
}
