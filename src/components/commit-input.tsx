"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CommitInput({
  value,
  onCommit,
  className,
  parse,
  type,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string | number;
  onCommit: (value: string) => void;
  parse?: (value: string) => string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  function commit(raw: string) {
    const next = parse ? parse(raw) : raw;
    if (next !== String(value)) onCommit(next);
    else setDraft(String(value));
  }
  return (
    <Input
      {...props}
      type={type}
      className={className}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (type === "date") commit(next);
      }}
      onBlur={() => commit(draft)}
    />
  );
}

export function CommitTextarea({
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
