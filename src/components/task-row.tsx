"use client";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { daysUntil, formatDateShort } from "@/lib/format";
import { taskDueHeadline, taskNotes } from "@/lib/task-desk";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export function TaskRow({
  task,
  relatedLabel,
  relatedHref,
  onToggle,
  onOpen,
}: {
  task: Task;
  relatedLabel?: string;
  relatedHref?: string | null;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const overdue = !task.completed && (daysUntil(task.dueAt) ?? 0) < 0;
  const headline = taskDueHeadline(task.dueAt);
  const notes = taskNotes(task);

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#f3f3f3]">
      <Checkbox
        checked={task.completed}
        onCheckedChange={onToggle}
        className="mt-0.5"
        aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className={cn(
              "block w-full text-left text-sm leading-snug text-[#181818]",
              task.completed && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
        ) : (
          <p className={cn("text-sm leading-snug text-[#181818]", task.completed && "text-muted-foreground line-through")}>
            {task.title}
          </p>
        )}
        <p className={cn("text-xs", overdue ? "text-destructive" : "text-[#706e6b]")}>
          {task.assignee || "Unassigned"} · {formatDateShort(task.dueAt)}
          {headline ? ` · ${headline.toLowerCase()}` : ""}
        </p>
        {relatedHref && relatedLabel ? (
          <Link href={relatedHref} className="mt-0.5 block truncate text-xs text-[#706e6b] hover:underline">
            {relatedLabel}
          </Link>
        ) : relatedLabel ? (
          <p className="mt-0.5 truncate text-xs text-[#706e6b]">{relatedLabel}</p>
        ) : null}
        {notes ? <p className="mt-1 text-xs leading-snug text-[#706e6b]">{notes}</p> : null}
      </div>
    </li>
  );
}
