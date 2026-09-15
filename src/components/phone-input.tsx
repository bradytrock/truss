"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatPhoneInput } from "@/lib/phone";

type PhoneInputProps = Omit<ComponentProps<typeof Input>, "type" | "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function PhoneInput({
  value,
  onValueChange,
  autoComplete = "tel",
  inputMode = "tel",
  ...props
}: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode={inputMode}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onValueChange(formatPhoneInput(event.target.value))}
    />
  );
}
