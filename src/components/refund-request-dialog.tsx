"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefundFacts, RefundImpactTable } from "@/components/refund-panels";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import { paymentsForJob } from "@/lib/job-financials";
import {
  REFUND_REASONS,
  cardFeeForRefund,
  paymentDetail,
  paymentHeading,
  paymentRefundBlock,
  refundDraftError,
  refundImpact,
  refundPayout,
  refundReasonLabel,
  refundableRemaining,
  type RefundDestination,
  type RefundRequest,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";

const STEPS = ["What", "How", "Review"] as const;

function customerName(job: Job, contacts: { id: string; name: string }[], clients: { id: string; name: string }[]) {
  return (
    contacts.find((item) => item.id === job.primaryContactId)?.name.trim() ||
    clients.find((item) => item.id === job.clientId)?.name.trim() ||
    job.name
  );
}

function parseMoney(raw: string) {
  const value = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function RefundRequestDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const [step, setStep] = useState(0);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partial, setPartial] = useState("");
  const [reason, setReason] = useState("deductible_returned");
  const [note, setNote] = useState("");
  const [destination, setDestination] = useState<RefundDestination>("original");
  const [companyCoversFee, setCompanyCoversFee] = useState(true);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const payments = paymentsForJob(job.id, crm.payments, crm.invoices)
    .filter((payment) => payment.amount > 0 && !/refund/i.test(payment.method))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const refunds = (crm.refundRequests ?? []).filter((item) => item.jobId === job.id);
  const payment = payments.find((item) => item.id === paymentId) ?? null;
  const cap = payment ? refundableRemaining(payment, refunds) : 0;
  const amount = mode === "full" ? cap : parseMoney(partial);
  const fee = payment ? cardFeeForRefund(payment, amount) : 0;
  const customer = customerName(job, crm.contacts, crm.clients);
  const preview: RefundRequest | null = payment
    ? {
        id: "preview",
        number: "",
        jobId: job.id,
        paymentId: payment.id,
        amount,
        full: mode === "full",
        reason,
        note,
        destination,
        destinationLabel: "",
        feeAmount: fee,
        feeCoveredByCompany: fee > 0 ? companyCoversFee : true,
        attachmentName,
        attachmentUrl,
        status: "requested",
        requestedBy: "",
        requestedByName: "",
        requestedAt: "",
        decidedBy: "",
        decidedByName: "",
        decidedAt: null,
        denyReason: "",
        processedAt: null,
        refundedAt: null,
        refundPaymentId: null,
        questions: [],
        updatedAt: "",
      }
    : null;
  const payout = preview ? refundPayout(preview) : 0;
  const impact = preview
    ? refundImpact({
        payments: paymentsForJob(job.id, crm.payments, crm.invoices),
        expenses: crm.expenses.filter((expense) => expense.jobId === job.id),
        refunds,
        refund: preview,
      })
    : null;
  const closeout = (crm.commissionCloseouts ?? []).find((item) => item.jobId === job.id) ?? null;

  function continueStep() {
    if (step === 0) {
      const problem = refundDraftError({
        payment,
        refunds,
        amount,
        reason,
        feeCoveredByCompany: companyCoversFee,
      });
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setStep((current) => Math.min(current + 1, 2));
  }

  async function submit() {
    if (!payment || saving) return;
    const problem = refundDraftError({
      payment,
      refunds,
      amount,
      reason,
      feeCoveredByCompany: companyCoversFee,
    });
    if (problem) {
      toast.error(problem);
      setStep(0);
      return;
    }
    setSaving(true);
    try {
      const saved = await crm.requestRefund({
        jobId: job.id,
        paymentId: payment.id,
        amount,
        reason,
        note,
        destination,
        feeCoveredByCompany: companyCoversFee,
        attachmentName,
        attachmentUrl,
      });
      if (saved) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 900_000) {
      toast.error("Attach a file under 900 KB.");
      return;
    }
    const url = await readFile(file);
    setAttachmentName(file.name);
    setAttachmentUrl(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <div className="px-6 pt-5 pr-12">
          <DialogTitle className="text-xl font-semibold tracking-tight">Request a refund</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-[#6f6a64]">
            {job.name}
            {job.code ? ` · ${job.code}` : ""}
          </DialogDescription>
          <ol className="mt-4 grid grid-cols-3 border-b border-[#ece7e1]">
            {STEPS.map((label, index) => (
              <li key={label} className="pb-3">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                      index === step
                        ? "bg-[#c43832] text-white"
                        : index < step
                          ? "bg-[#1c1c1c] text-white"
                          : "bg-[#eceae6] text-[#6f6a64]",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className={cn(index === step ? "font-medium text-[#1c1c1c]" : "text-[#6f6a64]")}>{label}</span>
                </span>
                <span className={cn("mt-2 block h-0.5", index === step ? "bg-[#c43832]" : "bg-transparent")} />
              </li>
            ))}
          </ol>
        </div>

        <div className="max-h-[min(60vh,34rem)] overflow-y-auto px-6 py-5">
          {step === 0 ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">Which payment?</p>
                <ul className="mt-2 space-y-2">
                  {payments.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-[#e6e1da] px-3 py-4 text-sm text-[#6f6a64]">
                      Log a payment on this job before requesting a refund.
                    </li>
                  ) : (
                    payments.map((item) => {
                      const blocked = paymentRefundBlock(item, refunds);
                      const selected = item.id === paymentId;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            disabled={Boolean(blocked)}
                            onClick={() => {
                              setPaymentId(item.id);
                              setMode("full");
                              setPartial("");
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left",
                              selected
                                ? "border-[#e7a3a8] bg-[#fff5f6]"
                                : "border-[#ece7e1] bg-white hover:bg-[#faf9f7]",
                              blocked && "cursor-not-allowed opacity-60",
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                selected ? "border-[#c43832]" : "border-[#c9c3bb]",
                              )}
                            >
                              {selected ? <span className="size-2 rounded-full bg-[#c43832]" /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{paymentHeading(item)}</span>
                              <span className="mt-0.5 block text-xs text-[#6f6a64]">
                                {blocked ?? paymentDetail(item)}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(item.amount)}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              <div>
                <p className="text-sm font-medium">How much?</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg bg-[#f3f1ec] p-1">
                    {(["full", "partial"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setMode(value);
                          if (value === "partial") setPartial(cap ? cap.toFixed(2) : "");
                        }}
                        className={cn(
                          "h-8 rounded-md px-3 text-sm capitalize",
                          mode === value ? "bg-white font-medium shadow-sm" : "text-[#6f6a64]",
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <label className="flex h-10 min-w-40 flex-1 items-center gap-2 rounded-lg border border-[#e6e1da] bg-[#f7f5f2] px-3">
                    <span className="text-sm text-[#8a847c]">$</span>
                    <input
                      value={mode === "full" ? (cap ? cap.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "") : partial}
                      readOnly={mode === "full"}
                      onChange={(event) => setPartial(event.target.value)}
                      inputMode="decimal"
                      aria-label="Refund amount"
                      className="w-full bg-transparent text-right text-sm tabular-nums outline-none"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-[#8a847c]">
                  {payment
                    ? `Up to ${formatMoney(cap)} can be refunded on this payment.`
                    : "Pick a payment to see what’s left to refund."}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium">Reason</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REFUND_REASONS.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setReason(id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm",
                        reason === id
                          ? "border-[#e7a3a8] bg-[#fff5f6] font-medium text-[#c43832]"
                          : "border-[#e6e1da] bg-white text-[#3f3c39]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">Note for the approver</p>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What happened, and anything accounting should know"
                  className="mt-2 min-h-24 rounded-xl border-[#e6e1da] bg-white"
                />
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-[#d9d3cb] px-3 py-1.5 text-sm text-[#6f6a64] hover:bg-[#faf9f7]">
                  <Paperclip className="size-3.5" />
                  {attachmentName || "Attach a file (carrier letter, signed cancellation…)"}
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(event) => {
                      void onFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {step === 1 && payment ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium">How should it go back?</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Choice
                    selected={destination === "original"}
                    title="Original payment"
                    body={paymentDetail(payment)}
                    onClick={() => setDestination("original")}
                  />
                  <Choice
                    selected={destination === "check"}
                    title="Mail a check"
                    body={customer ? `Payable to ${customer}` : "Payable to the customer"}
                    onClick={() => setDestination("check")}
                  />
                </div>
              </div>
              {fee > 0 ? (
                <div>
                  <p className="text-sm font-medium">Card fee ({formatMoney(fee)})</p>
                  <p className="mt-1 text-sm text-[#6f6a64]">
                    The processor keeps 4% of a card charge. Choose who covers it.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Choice
                      selected={companyCoversFee}
                      title="Company covers it"
                      body={`${customer || "The customer"} receives ${formatMoney(amount)}.`}
                      onClick={() => setCompanyCoversFee(true)}
                    />
                    <Choice
                      selected={!companyCoversFee}
                      title="Deduct it from the refund"
                      body={`${customer || "The customer"} receives ${formatMoney(Math.max(0, amount - fee))}.`}
                      onClick={() => setCompanyCoversFee(false)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#6f6a64]">This payment has no card fee.</p>
              )}
              <p className="text-sm text-[#6f6a64]">
                Accounting sends the money after they approve it. The job doesn’t change until then.
              </p>
            </div>
          ) : null}

          {step === 2 && preview && payment && impact ? (
            <div className="space-y-5">
              <RefundFacts payment={payment} refund={preview} />
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
              <p className="text-sm text-[#6f6a64]">
                {refundReasonLabel(reason)} · {destination === "check" ? "mailed check" : "original payment"} ·{" "}
                {customer || "the customer"} receives {formatMoney(payout)}.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7e1] px-6 py-4">
          <p className="text-sm text-[#6f6a64]">
            Refund <span className="font-semibold text-[#1c1c1c]">{formatMoney(payout)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => (step === 0 ? onOpenChange(false) : setStep((current) => current - 1))}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 2 ? (
              <Button type="button" className="rounded-lg bg-[#c43832] text-white hover:bg-[#a82f2a]" onClick={continueStep}>
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-lg bg-[#c43832] text-white hover:bg-[#a82f2a]"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? "Sending…" : "Submit request"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  selected,
  title,
  body,
  onClick,
}: {
  selected: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left",
        selected ? "border-[#e7a3a8] bg-[#fff5f6]" : "border-[#ece7e1] bg-white hover:bg-[#faf9f7]",
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs text-[#6f6a64]">{body}</span>
    </button>
  );
}

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
