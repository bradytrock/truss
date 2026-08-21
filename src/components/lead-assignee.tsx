"use client";

import { type ChangeEvent } from "react";
import type { StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { staffAssignmentLabel } from "@/lib/visibility";

export function LeadAssigneeSelect({
  id,
  value,
  people,
  onChange,
  size = "default",
  className,
}: {
  id?: string;
  value: string;
  people: StaffMember[];
  onChange: (staffId: string) => void;
  size?: "sm" | "default";
  className?: string;
}) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!next || next === value) return;
    onChange(next);
  }

  return (
    <select
      id={id}
      value={people.some((member) => member.id === value) ? value : people[0]?.id ?? ""}
      disabled={people.length === 0}
      onChange={handleChange}
      aria-label="Assigned to"
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-card text-foreground outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-sm",
        className,
      )}
    >
      {people.map((member) => (
        <option key={member.id} value={member.id}>
          {staffAssignmentLabel(member)}
        </option>
      ))}
    </select>
  );
}
