"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseMoneyInput,
  setAmountToken,
  splitTermsInline,
  TERMS_PAYMENT_HINT,
  withPaymentDefaults,
  type TermsInlinePart,
} from "@/lib/document-terms";
import { cn } from "@/lib/utils";

export function DocumentTermsFields({
  value,
  values,
  disabled,
  onCommit,
  emptyLabel,
  hint,
}: {
  value: string;
  values: Record<string, string>;
  disabled?: boolean;
  onCommit: (value: string) => void;
  emptyLabel: string;
  hint?: string;
}) {
  const resolved = useMemo(() => withPaymentDefaults(values), [values]);
  const parts = useMemo(() => splitTermsInline(value), [value]);

  if (!value.trim()) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  function commitField(key: string, amount: number | null) {
    if (disabled) return;
    onCommit(setAmountToken(value, key, amount));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-7 whitespace-pre-wrap">
        {parts.map((part, index) => (
          <InlinePart
            key={`${part.kind}:${index}`}
            part={part}
            values={resolved}
            disabled={disabled}
            onCommit={commitField}
          />
        ))}
      </p>
      {hint === "" ? null : (
        <p className="text-xs text-muted-foreground">
          {hint ??
            "Payment amounts sit on the lines and fill from the figures above. Other contract language stays locked from Settings."}
        </p>
      )}
    </div>
  );
}

function InlinePart({
  part,
  values,
  disabled,
  onCommit,
}: {
  part: TermsInlinePart;
  values: Record<string, string>;
  disabled?: boolean;
  onCommit: (key: string, amount: number | null) => void;
}) {
  if (part.kind === "text") return <>{part.text}</>;
  const display = part.override
    ? formatInputMoney(part.override)
    : stripMoneyPrefix(values[part.key] ?? "");
  if (!part.editable || disabled) {
    return (
      <span className="inline-block min-w-[5.5rem] border-b border-foreground/70 px-0.5 text-center tabular-nums">
        {display ? `$${display}` : "$________"}
      </span>
    );
  }
  return <MoneyBlank value={display} onCommit={(next) => onCommit(part.key, next)} />;
}

function stripMoneyPrefix(value: string) {
  return value.replace(/^\$/, "").trim();
}

function formatInputMoney(raw: string) {
  const amount = parseMoneyInput(raw);
  if (amount == null) return stripMoneyPrefix(raw);
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MoneyBlank({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (amount: number | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const width = Math.max(8, Math.min(14, (draft || "0.00").length + 1));
  return (
    <span className="inline-flex translate-y-px items-baseline">
      <span className="text-foreground">$</span>
      <input
        inputMode="decimal"
        aria-label="Payment amount"
        className={cn(
          "mx-0.5 h-5 border-0 border-b border-foreground bg-transparent p-0 text-center text-sm tabular-nums shadow-none outline-none",
          "focus-visible:border-primary focus-visible:ring-0",
        )}
        style={{ width: `${width}ch` }}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const amount = parseMoneyInput(draft);
          const formatted = amount == null ? "" : formatInputMoney(String(amount));
          if (formatted !== value) onCommit(amount);
          else setDraft(value);
        }}
      />
    </span>
  );
}

export function TermsLockPreview({ value }: { value: string }) {
  const blanks = splitTermsInline(value).filter((part) => part.kind === "field" && part.editable);
  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <p>
        {blanks.length > 0
          ? `${blanks.length} payment line${blanks.length === 1 ? "" : "s"} on this contract fill from deposit and remaining, and can be typed on the line.`
          : "Add $____ on a payment line to make an amount fill-in on each estimate."}
      </p>
      <p>{TERMS_PAYMENT_HINT}</p>
    </div>
  );
}
