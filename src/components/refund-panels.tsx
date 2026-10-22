import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { formatMoney } from "@/lib/format";
import {
  REFUND_PROGRESS,
  paymentDetail,
  paymentHeading,
  refundCloseoutNote,
  refundPayout,
  refundReasonLabel,
  refundStepIndex,
  type RefundCheck,
  type RefundRequest,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import type { Payment } from "@/lib/types";

export function RefundProgress({ status }: { status: RefundRequest["status"] }) {
  const index = refundStepIndex(status);
  if (index < 0) return null;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#ece7e1]">
        <div
          className="h-full rounded-full bg-[#e09a3a]"
          style={{ width: `${((index + 1) / REFUND_PROGRESS.length) * 100}%` }}
        />
      </div>
      <ol className="mt-2 grid grid-cols-4 text-[11px] text-[#8a847c]">
        {REFUND_PROGRESS.map((label, step) => (
          <li key={label} className={cn("text-center", step === index && "font-semibold text-[#9a6420]")}>
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8a847c] uppercase">{label}</p>
      <div className="mt-1 text-sm text-[#1c1c1c]">{children}</div>
    </div>
  );
}

export function RefundFacts({
  payment,
  refund,
}: {
  payment: Payment | null;
  refund: Pick<
    RefundRequest,
    "amount" | "full" | "reason" | "note" | "feeAmount" | "feeCoveredByCompany" | "attachmentName" | "attachmentUrl"
  >;
}) {
  const paid = payment ? formatMoney(payment.amount) : "—";
  const when = payment ? paymentDetail(payment).split(" · ").slice(-1)[0] : "";
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
      <Fact label="From payment">
        <p>{payment ? paymentHeading(payment) : "Payment removed"}</p>
        <p className="text-[#6f6a64]">
          {paid}
          {when ? ` · ${when}` : ""}
        </p>
      </Fact>
      <Fact label="Refund">{refund.full ? "Full" : `Partial · ${formatMoney(refund.amount)}`}</Fact>
      <Fact label="Reason">{refundReasonLabel(refund.reason)}</Fact>
      <Fact label={refund.feeAmount > 0 ? `Card fee (${formatMoney(refund.feeAmount)})` : "Card fee"}>
        {refund.feeAmount > 0
          ? refund.feeCoveredByCompany
            ? "Covered by the company"
            : "Deducted from the refund"
          : "No card fee"}
      </Fact>
      <Fact label="Note">{refund.note.trim() || "No note added"}</Fact>
      <Fact label="Attachments">
        {refund.attachmentName ? (
          refund.attachmentUrl ? (
            <a href={refund.attachmentUrl} target="_blank" rel="noreferrer" className="text-[#c43832] hover:underline">
              {refund.attachmentName}
            </a>
          ) : (
            refund.attachmentName
          )
        ) : (
          "None"
        )}
      </Fact>
    </div>
  );
}

export function RefundImpactTable({
  collected,
  collectedAfter,
  customerRefund,
  customerRefundAfter,
  profitDelta,
  closeoutStatus,
}: {
  collected: number;
  collectedAfter: number;
  customerRefund: number;
  customerRefundAfter: number;
  profitDelta: number;
  closeoutStatus: string | null;
}) {
  const rows = [
    ["Collected on the job", formatMoney(collected), formatMoney(collectedAfter)],
    ["Customer refund line", formatMoney(customerRefund), formatMoney(customerRefundAfter)],
  ] as const;
  return (
    <div className="overflow-hidden rounded-xl border border-[#ece7e1]">
      {rows.map(([label, before, after]) => (
        <div key={label} className="flex items-center justify-between gap-3 border-b border-[#ece7e1] px-3 py-2.5 text-sm">
          <span>{label}</span>
          <span className="shrink-0 tabular-nums text-[#6f6a64]">
            {before}
            <span className="px-2 text-[#b7b1a8]">→</span>
            <span className="font-medium text-[#1c1c1c]">{after}</span>
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 border-b border-[#ece7e1] px-3 py-2.5 text-sm">
        <span>Job profit</span>
        <span className="shrink-0 tabular-nums text-[#6f6a64]">
          current
          <span className="px-2 text-[#b7b1a8]">→</span>
          <span className={cn("font-medium", profitDelta < 0 ? "text-[#c43832]" : "text-[#1c1c1c]")}>
            {formatMoney(profitDelta)}
          </span>
        </span>
      </div>
      <p className="bg-[#faf8f5] px-3 py-2.5 text-sm text-[#6f6a64]">{refundCloseoutNote(closeoutStatus)}</p>
    </div>
  );
}

export function RefundCheckList({ checks }: { checks: RefundCheck[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {checks.map((check) => (
        <li
          key={check.id}
          className={cn(
            "flex items-start gap-2 rounded-xl px-3 py-3 text-sm",
            check.ok ? "bg-[#eef8f1] text-[#1d5c38]" : "bg-[#fdecea] text-[#8d2e2a]",
          )}
        >
          {check.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span>{check.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function refundCustomerReceives(refund: RefundRequest) {
  return refundPayout(refund);
}
