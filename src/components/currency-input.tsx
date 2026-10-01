"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import {
  caretAfterMoneyChars,
  completeMoneyDraft,
  formatMoneyDraft,
  formatMoneyField,
  moneyDraft,
  moneyDraftFromValue,
} from "@/lib/money-input";
import { cn } from "@/lib/utils";

type CurrencyInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: string | number;
  onValueChange?: (value: string) => void;
  /** Fires when the field leaves focus and the amount changed. Plain numeric string, or empty. */
  onCommit?: (value: string) => void;
};

export function CurrencyInput({
  value,
  onValueChange,
  onCommit,
  onFocus,
  onBlur,
  className,
  placeholder = "$0.00",
  inputMode = "decimal",
  autoComplete = "off",
  ...props
}: CurrencyInputProps) {
  const stored = moneyDraftFromValue(value);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(stored);
  const caretRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = focused ? draft : stored;
  const display = focused ? formatMoneyDraft(editing) : editing ? formatMoneyField(editing) : "";

  useLayoutEffect(() => {
    const pos = caretRef.current;
    const node = inputRef.current;
    if (pos == null || !node || document.activeElement !== node) return;
    node.setSelectionRange(pos, pos);
    caretRef.current = null;
  }, [display]);

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      autoComplete={autoComplete}
      spellCheck={false}
      placeholder={placeholder}
      className={cn("tabular-nums", className)}
      value={display}
      onFocus={(event) => {
        setDraft(completeMoneyDraft(stored) || stored);
        setFocused(true);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const input = event.target;
        const cursor = input.selectionStart ?? input.value.length;
        const typed = moneyDraft(input.value.slice(0, cursor));
        const next = moneyDraft(input.value);
        caretRef.current = caretAfterMoneyChars(formatMoneyDraft(next), typed.length);
        setDraft(next);
        onValueChange?.(next);
      }}
      onBlur={(event) => {
        const next = completeMoneyDraft(draft);
        setFocused(false);
        setDraft(next);
        if (next !== stored) {
          onValueChange?.(next);
          onCommit?.(next);
        }
        onBlur?.(event);
      }}
    />
  );
}
