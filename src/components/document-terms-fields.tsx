"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  formatTermsSection,
  hasPaymentTermsSections,
  joinTermsSections,
  parseTermsSections,
  TERMS_PAYMENT_HINT,
  type TermsSection,
} from "@/lib/document-terms";
import { cn } from "@/lib/utils";

function CommitTextarea({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

export function DocumentTermsFields({
  value,
  fill,
  disabled,
  onCommit,
  emptyLabel,
  hint,
}: {
  value: string;
  fill: (template: string) => string;
  disabled?: boolean;
  onCommit: (value: string) => void;
  emptyLabel: string;
  hint?: string;
}) {
  const sections = parseTermsSections(value);
  const canEditPayment = Boolean(!disabled && hasPaymentTermsSections(value));

  if (!value.trim()) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  function commitSection(index: number, body: string) {
    const next = sections.map((section, i) => (i === index ? { ...section, body } : section));
    onCommit(joinTermsSections(next));
  }

  return (
    <div className="space-y-5">
      {sections.map((section, index) => (
        <TermsSectionBlock
          key={`${section.key}:${index}`}
          section={section}
          filled={fill(section.payment ? section.body : formatTermsSection(section))}
          editable={canEditPayment && section.payment}
          onCommit={(body) => commitSection(index, body)}
        />
      ))}
      <p className="text-xs text-muted-foreground">
        {hint ??
          (canEditPayment
            ? "Only payment sections can change on this document. Company terms stay as written in Settings."
            : "Company terms are locked on this document. A company admin can mark a payment section in Settings.")}
      </p>
    </div>
  );
}

function TermsSectionBlock({
  section,
  filled,
  editable,
  onCommit,
}: {
  section: TermsSection;
  filled: string;
  editable: boolean;
  onCommit: (body: string) => void;
}) {
  const rows = Math.min(12, Math.max(4, section.body.split("\n").length + 1));
  const title = section.heading || (section.payment ? "Payment" : "Company terms");
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{title}</p>
        {section.payment ? (
          <Badge variant="secondary">Payment</Badge>
        ) : (
          <Badge variant="outline">Locked</Badge>
        )}
      </div>
      {editable ? (
        <>
          <CommitTextarea rows={rows} value={section.body} onCommit={onCommit} />
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{filled}</p>
        </>
      ) : (
        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            section.payment ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {filled}
        </p>
      )}
    </div>
  );
}

export function TermsLockPreview({ value }: { value: string }) {
  const sections = parseTermsSections(value);
  if (sections.length === 0) {
    return <p className="text-xs text-muted-foreground">{TERMS_PAYMENT_HINT}</p>;
  }
  const payment = sections.filter((section) => section.payment);
  const locked = sections.filter((section) => !section.payment);
  return (
    <div className="grid gap-3 text-xs">
      <div>
        <p className="font-medium text-foreground">Editable on each estimate and invoice</p>
        {payment.length === 0 ? (
          <p className="mt-1 text-muted-foreground">
            No payment section detected. Name a heading Payment, Contract price, Deposit, or Amount due, or wrap the
            block in [[payment]] … [[/payment]].
          </p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {payment.map((section, index) => (
              <li key={`pay-${section.key}-${index}`}>
                {section.heading || "Payment"}
              </li>
            ))}
          </ul>
        )}
      </div>
      {locked.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">Locked company terms</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            {locked.map((section, index) => (
              <li key={`lock-${section.key}-${index}`}>
                {section.heading || "Company terms"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted-foreground">{TERMS_PAYMENT_HINT}</p>
    </div>
  );
}
