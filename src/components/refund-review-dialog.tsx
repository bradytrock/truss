"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefundCheckList, RefundFacts, RefundImpactTable } from "@/components/refund-panels";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { paymentsForJob } from "@/lib/job-financials";
import { jobRecordHref } from "@/lib/job-record";
import {
  canProcessRefunds,
  isOpenRefund,
  refundApprovalChecks,
  refundImpact,
  refundPayout,
  refundWhen,
  REFUND_STATUS_LABELS,
} from "@/lib/refunds";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

function refundStatusLabelSafe(status: string) {
  return REFUND_STATUS_LABELS[status as keyof typeof REFUND_STATUS_LABELS] ?? status;
}

export function RefundReviewDialog({
  refundId,
  open,
  onOpenChange,
}: {
  refundId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const refund = (crm.refundRequests ?? []).find((item) => item.id === refundId) ?? null;
  const job = refund ? crm.getJob(refund.jobId) : undefined;
  const viewer = crm.effectiveStaff;
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  if (!refund || !job) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Refund request</DialogTitle>
          <DialogDescription>This refund is no longer on the job.</DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }

  const payments = paymentsForJob(job.id, crm.payments, crm.invoices);
  const payment = payments.find((item) => item.id === refund.paymentId) ?? null;
  const refunds = (crm.refundRequests ?? []).filter((item) => item.jobId === job.id);
  const contact = crm.contacts.find((item) => item.id === job.primaryContactId);
  const client = crm.clients.find((item) => item.id === job.clientId);
  const customer = contact?.name.trim() || client?.name.trim() || job.name;
  const requester = crm.staff.find((member) => member.id === refund.requestedBy);
  const role = requester ? requester.title.trim() || SEAT_ROLE_LABELS[requester.role] : "Team";
  const payout = refundPayout(refund);
  const impact = refundImpact({
    payments,
    expenses: crm.expenses.filter((expense) => expense.jobId === job.id),
    refunds,
    refund,
  });
  const closeout = (crm.commissionCloseouts ?? []).find((item) => item.jobId === job.id) ?? null;
  const checks = refundApprovalChecks({
    payment,
    refund,
    refunds,
    viewerStaffId: viewer?.id ?? "",
    viewerName: viewer?.name ?? "",
  });
  const processor = canProcessRefunds(viewer?.role);
  const self = viewer?.id === refund.requestedBy || viewer?.name === refund.requestedByName;
  const canDecide = processor && refund.status === "requested" && checks.every((item) => item.ok);
  const canWithdraw = (self || processor) && (refund.status === "requested" || refund.status === "approved");
  const firstName = refund.requestedByName.split(" ")[0] || "them";
  const initials = refund.requestedByName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDenyOpen(false);
          setAskOpen(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-3xl">
        <div className="px-6 pt-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-xl font-semibold tracking-tight">Refund request</DialogTitle>
            <span className="text-sm text-[#8a847c]">{refund.number}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                refund.status === "requested" && "bg-[#fbf1df] text-[#8a5a22]",
                refund.status === "approved" && "bg-[#e7f0fb] text-[#1d4e89]",
                refund.status === "processing" && "bg-[#fbf1df] text-[#8a5a22]",
                refund.status === "refunded" && "bg-[#e7f6ea] text-[#217a45]",
                (refund.status === "denied" || refund.status === "withdrawn") && "bg-[#f3f1ec] text-[#5c5854]",
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {refundStatusLabelSafe(refund.status)}
            </span>
          </div>
          <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-[#6f6a64]">
            <span>
              {job.name}
              {job.code ? ` · ${job.code}` : ""}
            </span>
            <Link href={jobRecordHref(job.id, { tab: "financials" })} className="font-medium text-[#c43832] hover:underline">
              Open job →
            </Link>
          </DialogDescription>
        </div>

        <div className="max-h-[min(62vh,36rem)] space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7f4ef] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e7e1d8] text-sm font-semibold text-[#5c564e]">
                {initials || "—"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {refund.requestedByName}
                  <span className="font-normal text-[#6f6a64]"> · {role}</span>
                </p>
                <p className="text-xs text-[#6f6a64]">Requested {refundWhen(refund.requestedAt)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(payout)}</p>
              <p className="text-xs text-[#6f6a64]">
                to {customer}
                {refund.destinationLabel ? ` · ${refund.destinationLabel}` : ""}
              </p>
            </div>
          </div>

          <RefundFacts payment={payment} refund={refund} />

          {isOpenRefund(refund) ? (
            <div>
              <p className="mb-2 text-sm font-medium">What changes on the job</p>
              <RefundImpactTable
                collected={impact.collected}
                collectedAfter={impact.collectedAfter}
                customerRefund={impact.refunded}
                customerRefundAfter={impact.customerRefundAfter}
                profitDelta={impact.profitDelta}
                closeoutStatus={closeout?.status ?? null}
              />
            </div>
          ) : null}

          {refund.status === "denied" && refund.denyReason ? (
            <p className="rounded-xl bg-[#fdecea] px-3 py-2 text-sm text-[#8d2e2a]">Denied: {refund.denyReason}</p>
          ) : null}

          {refund.status === "requested" ? (
            <div>
              <p className="mb-2 text-sm font-medium">Checks</p>
              <RefundCheckList checks={checks} />
            </div>
          ) : null}

          {refund.questions.length > 0 ? (
            <ul className="space-y-2">
              {refund.questions.map((item) => (
                <li key={item.id} className="rounded-xl bg-[#f7f4ef] px-3 py-2 text-sm">
                  <p className="text-xs text-[#6f6a64]">
                    {item.authorName} · {item.createdAt ? refundWhen(item.createdAt) : ""}
                  </p>
                  <p className="mt-1">{item.body}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {askOpen ? (
            <div>
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={`What should ${firstName} know?`}
                className="min-h-20 rounded-xl"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-lg" onClick={() => setAskOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-lg"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const saved = await crm.askRefundQuestion(refund.id, question);
                      if (saved) {
                        setQuestion("");
                        setAskOpen(false);
                      }
                    })
                  }
                >
                  Send
                </Button>
              </div>
            </div>
          ) : null}

          {denyOpen ? (
            <div>
              <Textarea
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                placeholder="Why this refund is denied"
                className="min-h-20 rounded-xl"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" className="rounded-lg" onClick={() => setDenyOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-lg"
                  disabled={busy}
                  onClick={() => void run(() => crm.decideRefund(refund.id, "deny", denyReason))}
                >
                  Confirm deny
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7e1] px-6 py-4">
          <div>
            {isOpenRefund(refund) && !self ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-[#3f3c39] hover:underline"
                onClick={() => {
                  setDenyOpen(false);
                  setAskOpen((current) => !current);
                }}
              >
                <MessageCircle className="size-4" />
                Ask {firstName} a question
              </button>
            ) : canWithdraw ? (
              <button
                type="button"
                className="text-sm text-[#6f6a64] hover:underline"
                disabled={busy}
                onClick={() => void run(() => crm.withdrawRefund(refund.id))}
              >
                Withdraw
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex gap-2">
            {processor && !self && refund.status === "requested" && !denyOpen ? (
              <Button type="button" variant="outline" className="rounded-lg text-[#c43832]" disabled={busy} onClick={() => setDenyOpen(true)}>
                Deny
              </Button>
            ) : null}
            {canDecide ? (
              <Button
                type="button"
                className="rounded-lg bg-[#1f7a4d] text-white hover:bg-[#18643f]"
                disabled={busy}
                onClick={() => void run(() => crm.decideRefund(refund.id, "approve"))}
              >
                Approve {formatMoney(payout)}
              </Button>
            ) : null}
            {processor && refund.status === "approved" ? (
              <Button
                type="button"
                className="rounded-lg bg-[#1f7a4d] text-white hover:bg-[#18643f]"
                disabled={busy}
                onClick={() => void run(() => crm.advanceRefund(refund.id, "processing"))}
              >
                Start processing
              </Button>
            ) : null}
            {processor && refund.status === "processing" ? (
              <Button
                type="button"
                className="rounded-lg bg-[#1f7a4d] text-white hover:bg-[#18643f]"
                disabled={busy}
                onClick={() => void run(() => crm.advanceRefund(refund.id, "refunded"))}
              >
                Mark {formatMoney(payout)} refunded
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
