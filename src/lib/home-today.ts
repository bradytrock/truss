import { daysUntil, greeting, localYmd } from "@/lib/format";
import type { Estimate, Job, Task } from "@/lib/types";

export type HomeBriefAction = {
  label: string;
  href: string;
  count?: number;
  primary?: boolean;
};

export type HomeBrief = {
  dateLabel: string;
  greet: string;
  text: string;
  actions: HomeBriefAction[];
};

export type HomeFocus = {
  label: string;
  value: string;
  detail: string;
  href: string;
  action: string;
  names: string[];
};

const AVATAR_TONES = [
  { bg: "#e8e1f7", fg: "#4b3a8c" },
  { bg: "#dff0e8", fg: "#1f6b4a" },
  { bg: "#fbe7dc", fg: "#8a3d1c" },
  { bg: "#e2ecf9", fg: "#1c4a8a" },
  { bg: "#f6e3ea", fg: "#88304f" },
  { bg: "#efeee9", fg: "#55524d" },
] as const;

export function overdueDays(dueAt: string, now = new Date()) {
  const due = daysUntil(dueAt);
  if (due === null) return 0;
  void now;
  return Math.max(0, -due);
}

export function openCallbacks(tasks: Task[]) {
  return tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title));
}

export function unsignedProposals(estimates: Estimate[]) {
  return estimates.filter((estimate) => estimate.status === "sent" || estimate.status === "viewed");
}

export function preconJobs(jobs: Job[]) {
  return jobs.filter((job) => job.status === "precon");
}

export function jobsMissingContract(jobs: Job[]) {
  return jobs.filter((job) => !(job.contractValue > 0));
}

export function jobsMissingStart(jobs: Job[]) {
  return jobs.filter((job) => !job.startDate);
}

export function avatarTone(name: string) {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return AVATAR_TONES[sum % AVATAR_TONES.length] ?? AVATAR_TONES[0];
}

export function sparklinePath(values: number[], width = 140, height = 36) {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - 2 - (value / max) * (height - 6);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function sourceShares(items: Array<{ label: string; value: number }>) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return items
    .filter((item) => item.value > 0)
    .map((item) => ({
      label: item.label,
      value: item.value,
      pct: total > 0 ? Math.round((item.value / total) * 100) : 0,
    }));
}

export function briefStorageKey(staffId: string, now = new Date()) {
  return `truss.homeBrief.v1:${staffId || "anon"}:${localYmd(now)}`;
}

export function loadBriefOpen(staffId: string, now = new Date()) {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(briefStorageKey(staffId, now)) !== "0";
  } catch {
    return true;
  }
}

export function saveBriefOpen(staffId: string, open: boolean, now = new Date()) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(briefStorageKey(staffId, now), open ? "1" : "0");
}

export function buildHomeBrief(input: {
  firstName: string;
  callbackCount: number;
  oldestCallback?: { name: string; dueAt: string } | null;
  proposalCount: number;
  preconWithoutStart: number;
  jobsWithoutContract: number;
  now?: Date;
}): HomeBrief {
  const now = input.now ?? new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const greet = `${greeting()}, ${input.firstName || "there"}.`;
  const parts: string[] = [];
  const actions: HomeBriefAction[] = [];

  if (input.callbackCount > 0) {
    const oldest = input.oldestCallback;
    const oldestBit = oldest
      ? ` — the oldest is ${oldest.name} from ${new Date(`${oldest.dueAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
      : "";
    parts.push(
      `You have ${input.callbackCount} callback${input.callbackCount === 1 ? "" : "s"} waiting${oldestBit}.`,
    );
    actions.push({
      label: "Start calling",
      href: "#home-callbacks",
      count: input.callbackCount,
      primary: true,
    });
  }

  if (input.proposalCount > 0) {
    parts.push(
      input.proposalCount === 1
        ? "One proposal is out and still unsigned."
        : `${input.proposalCount} proposals are out and still unsigned.`,
    );
    actions.push({ label: "Nudge proposals", href: "/estimates", count: input.proposalCount });
  }

  if (input.preconWithoutStart > 0) {
    parts.push(
      `${input.preconWithoutStart} job${input.preconWithoutStart === 1 ? " is" : "s are"} in precon without a start date.`,
    );
  }

  if (input.jobsWithoutContract > 0) {
    parts.push(
      `${input.jobsWithoutContract} active job${input.jobsWithoutContract === 1 ? " has" : "s have"} no contract amount attached, so your pipeline is reading low.`,
    );
    actions.push({
      label: "Link contract values",
      href: "/jobs",
      count: input.jobsWithoutContract,
    });
  }

  if (parts.length === 0) {
    parts.push("Nothing is blocking the book this morning. Pipeline, proposals, and callbacks are clear.");
  }

  if (!actions.some((action) => action.primary)) {
    actions.unshift({
      label: parts.length === 1 && input.callbackCount === 0 ? "View pipeline" : "Got it",
      href: parts.length === 1 && input.callbackCount === 0 ? "/pipeline" : "#home-today",
      primary: true,
    });
  }

  return {
    dateLabel,
    greet,
    text: parts.join(" "),
    actions,
  };
}

export function buildHomeFocus(input: {
  callbackCount: number;
  oldestDays: number;
  proposalCount: number;
  jobsWithoutContract: number;
  names: string[];
}): HomeFocus {
  if (input.callbackCount > 0) {
    return {
      label: "Start here",
      value: `${input.callbackCount} callback${input.callbackCount === 1 ? "" : "s"}`,
      detail:
        input.oldestDays > 0
          ? `Overdue — the oldest has waited ${input.oldestDays} day${input.oldestDays === 1 ? "" : "s"}.`
          : "Due today or coming up.",
      href: "#home-callbacks",
      action: "Start calling",
      names: input.names,
    };
  }
  if (input.proposalCount > 0) {
    return {
      label: "Start here",
      value: `${input.proposalCount} proposal${input.proposalCount === 1 ? "" : "s"}`,
      detail: "Out with the customer and still unsigned.",
      href: "/estimates",
      action: "Follow up",
      names: input.names,
    };
  }
  if (input.jobsWithoutContract > 0) {
    return {
      label: "Start here",
      value: `${input.jobsWithoutContract} job${input.jobsWithoutContract === 1 ? "" : "s"}`,
      detail: "Active work with no contract amount linked.",
      href: "/jobs",
      action: "Open jobs",
      names: input.names,
    };
  }
  return {
    label: "Start here",
    value: "All clear",
    detail: "No overdue callbacks or unsigned proposals.",
    href: "/pipeline",
    action: "View pipeline",
    names: [],
  };
}
