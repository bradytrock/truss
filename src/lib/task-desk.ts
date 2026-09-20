import { daysUntil } from "@/lib/format";
import type { Job, Opportunity, Task } from "@/lib/types";

export const TASK_FILTERS = ["mine", "open", "overdue", "done", "all"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const TASK_FILTER_LABELS: Record<TaskFilter, string> = {
  mine: "Mine",
  open: "Open",
  overdue: "Overdue",
  done: "Done",
  all: "All",
};

export function taskNotes(task: Pick<Task, "notes">) {
  return task.notes?.trim() ?? "";
}

export function taskIsOverdue(task: Pick<Task, "completed" | "dueAt">) {
  if (task.completed) return false;
  return (daysUntil(task.dueAt) ?? 0) < 0;
}

export function filterTasks(
  tasks: Task[],
  filter: TaskFilter,
  viewerName: string,
) {
  const mine = viewerName.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filter === "done") return task.completed;
    if (filter === "all") return true;
    if (task.completed) return false;
    if (filter === "overdue") return taskIsOverdue(task);
    if (filter === "mine") return mine !== "" && task.assignee.trim().toLowerCase() === mine;
    return true;
  });
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    if (left.completed !== right.completed) return left.completed ? 1 : -1;
    const due = left.dueAt.localeCompare(right.dueAt);
    if (due !== 0) return due;
    return left.title.localeCompare(right.title);
  });
}

export function taskRelatedHref(task: Pick<Task, "relatedType" | "relatedId">) {
  if (!task.relatedId) return null;
  if (task.relatedType === "job") return `/jobs/${task.relatedId}`;
  if (task.relatedType === "opportunity") return `/opportunities/${task.relatedId}`;
  if (task.relatedType === "client") return `/clients/${task.relatedId}`;
  return null;
}

export function taskRelatedLabel(
  task: Pick<Task, "relatedType" | "relatedId">,
  jobs: Job[],
  opportunities: Opportunity[],
) {
  if (!task.relatedId) return "";
  if (task.relatedType === "job") {
    const job = jobs.find((item) => item.id === task.relatedId);
    return job ? [job.code, job.name].filter(Boolean).join(" · ") : "Job";
  }
  if (task.relatedType === "opportunity") {
    const opportunity = opportunities.find((item) => item.id === task.relatedId);
    return opportunity ? [opportunity.code, opportunity.name].filter(Boolean).join(" · ") : "Lead";
  }
  return "";
}

export function taskReminderSubject(title: string, overdue: boolean) {
  const name = title.trim() || "Task";
  return overdue ? `Overdue: ${name}` : `Due today: ${name}`;
}

export function searchTasks(tasks: Task[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return tasks;
  return tasks.filter((task) =>
    [task.title, task.assignee, taskNotes(task)].some((part) => part.toLowerCase().includes(needle)),
  );
}

export function taskDueHeadline(dueAt: string) {
  const days = daysUntil(dueAt);
  if (days === null) return "";
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return "";
}

export type DueTaskReminder = {
  taskId: string;
  companyId: string;
  title: string;
  dueAt: string;
  assignee: string;
  notes: string;
  relatedType: string | null;
  relatedId: string | null;
  assigneeEmail: string;
  assigneeName: string;
  companyName: string;
  companyEmail: string;
};

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function parseDueTaskReminder(raw: unknown): DueTaskReminder | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const taskId = asText(row.task_id ?? row.taskId);
  const email = asText(row.assignee_email ?? row.assigneeEmail).trim();
  if (!taskId || !email) return null;
  return {
    taskId,
    companyId: asText(row.company_id ?? row.companyId),
    title: asText(row.title) || "Task",
    dueAt: asText(row.due_at ?? row.dueAt),
    assignee: asText(row.assignee),
    notes: asText(row.notes),
    relatedType: asText(row.related_type ?? row.relatedType) || null,
    relatedId: asText(row.related_id ?? row.relatedId) || null,
    assigneeEmail: email,
    assigneeName: asText(row.assignee_name ?? row.assigneeName) || asText(row.assignee),
    companyName: asText(row.company_name ?? row.companyName),
    companyEmail: asText(row.company_email ?? row.companyEmail).trim(),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function taskReminderText(input: {
  title: string;
  dueLabel: string;
  notes: string;
  assigneeName: string;
  companyName: string;
  overdue: boolean;
  deskUrl?: string;
}) {
  const lines = [
    input.overdue ? `${input.title} is overdue.` : `${input.title} is due today.`,
    "",
    `Deadline: ${input.dueLabel}`,
    `Assigned to: ${input.assigneeName}`,
  ];
  if (input.companyName) lines.push(`Company: ${input.companyName}`);
  if (input.notes.trim()) {
    lines.push("", input.notes.trim());
  }
  lines.push("", "Open the Tasks desk in Truss to mark it done or move the date.");
  if (input.deskUrl) lines.push(input.deskUrl);
  return lines.join("\n");
}

export function taskReminderHtml(input: {
  title: string;
  dueLabel: string;
  notes: string;
  assigneeName: string;
  companyName: string;
  overdue: boolean;
  deskUrl?: string;
}) {
  const note = input.notes.trim()
    ? `<p>${escapeHtml(input.notes.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";
  const link = input.deskUrl
    ? `<p><a href="${escapeHtml(input.deskUrl)}">Open your task list</a></p>`
    : "";
  return `<p>${escapeHtml(input.overdue ? `${input.title} is overdue.` : `${input.title} is due today.`)}</p>
<p>Deadline: ${escapeHtml(input.dueLabel)}<br/>Assigned to: ${escapeHtml(input.assigneeName)}${
    input.companyName ? `<br/>Company: ${escapeHtml(input.companyName)}` : ""
  }</p>${note}${link}`;
}
