"use client";

import { useMemo, useState } from "react";
import { RefundReviewDialog } from "@/components/refund-review-dialog";
import { accCard, CountPill } from "@/components/accounting-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import {
  isOpenRefund,
  refundPayout,
  refundReasonLabel,
  refundWhen,
  REFUND_STATUS_LABELS,
  type RefundRequest,
  type RefundStatus,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ id: "open" | RefundStatus | "closed"; label: string }> = [
  { id: "open", label: "Needs action" },
  { id: "requested", label: "Awaiting approval" },
  { id: "approved", label: "Ready to send" },
  { id: "processing", label: "Processing" },
  { id: "closed", label: "Finished" },
];

export function RefundCountBadge() {
  const crm = useCrm();
  const rows = crm.refundRequests ?? [];
  const waiting = rows.filter(isOpenRefund).length;
  if (!waiting) return null;
  const needsDecision = rows.some((refund) => refund.status === "requested");
  return <CountPill tone={needsDecision ? "danger" : "neutral"}>{waiting}</CountPill>;
}

export function AccountingRefunds({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const crm = useCrm();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("open");
  const rows = useMemo(
    () => [...(crm.refundRequests ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [crm.refundRequests],
  );
  const visible = rows.filter((refund) => {
    if (filter === "open") return isOpenRefund(refund);
    if (filter === "closed") return !isOpenRefund(refund);
    return refund.status === filter;
  });
  const openAmount = rows.filter(isOpenRefund).reduce((sum, refund) => sum + refundPayout(refund), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Refunds</h2>
          <p className="mt-1 text-sm text-[#6f6a64]">
            {rows.filter(isOpenRefund).length === 0
              ? "Nothing is waiting. A refund starts on the job’s financials."
              : `${formatMoney(openAmount)} still has to be approved or sent back.`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              filter === item.id ? "border-[#1c1c1c] bg-[#1c1c1c] text-white" : "border-[#e6e1da] bg-white text-[#3f3c39]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className={cn(accCard, "px-4 py-8 text-center text-sm text-[#6f6a64]")}>
          No refunds in this list.
        </div>
      ) : (
        <ul className={cn(accCard, "divide-y divide-[#f0ece7]")}>
          {visible.map((refund) => (
            <RefundRow key={refund.id} refund={refund} onOpen={() => onSelect(refund.id)} />
          ))}
        </ul>
      )}
      <RefundReviewDialog
        key={selectedId ?? "closed"}
        refundId={selectedId}
        open={Boolean(selectedId)}
        onOpenChange={(next) => !next && onSelect(null)}
      />
    </div>
  );
}

function RefundRow({ refund, onOpen }: { refund: RefundRequest; onOpen: () => void }) {
  const crm = useCrm();
  const job = crm.getJob(refund.jobId);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[#faf9f7]">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{refund.number}</span>
            <span className="text-sm text-[#6f6a64]">{job?.name ?? "Job"}</span>
          </span>
          <span className="mt-1 block text-xs text-[#8a847c]">
            {refund.requestedByName} · {refundReasonLabel(refund.reason)} · {refundWhen(refund.requestedAt)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums">{formatMoney(refundPayout(refund))}</span>
          <span className="mt-1 block text-xs text-[#8a847c]">{REFUND_STATUS_LABELS[refund.status]}</span>
        </span>
      </button>
    </li>
  );
}
