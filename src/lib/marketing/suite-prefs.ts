export type MarketingGuardrails = {
  pauseOnBounce: boolean;
  frequencyCap: boolean;
  quietHours: boolean;
  mailingAddress: string;
};

export type SegmentRule = {
  id: string;
  field: "type" | "city" | "email" | "title";
  op: "is" | "is_not" | "contains";
  value: string;
};

export type SavedSegment = {
  id: string;
  name: string;
  rules: SegmentRule[];
};

export type CanvassDoor = {
  id: string;
  address: string;
  status: "todo" | "left" | "talked" | "skip";
};

export type AutomationStep =
  | { id: string; kind: "trigger"; title: string; detail: string }
  | { id: string; kind: "wait"; days: number }
  | { id: string; kind: "email"; title: string; detail: string }
  | { id: string; kind: "branch"; title: string }
  | { id: string; kind: "task"; title: string; detail: string }
  | { id: string; kind: "sms"; title: string; detail: string }
  | { id: string; kind: "exit"; detail: string };

export type MarketingFlow = {
  id: string;
  name: string;
  summary: string;
  active: boolean;
  steps: AutomationStep[];
};

import { useSyncExternalStore } from "react";
import { readMarketingLocal, subscribeMarketingLocal, writeMarketingLocal } from "@/lib/marketing/local-store";

const GUARD_KEY = "truss.marketing.guardrails.v1";
const SEGMENT_KEY = "truss.marketing.segments.v1";
const DOOR_KEY = "truss.marketing.doors.v1";
const FLOW_KEY = "truss.marketing.flows.v1";

export const DEFAULT_GUARDRAILS: MarketingGuardrails = {
  pauseOnBounce: true,
  frequencyCap: true,
  quietHours: false,
  mailingAddress: "",
};

export function defaultFlows(): MarketingFlow[] {
  return [
    {
      id: "flow-post-inspection",
      name: "Post-inspection follow-up",
      summary: "Inspection done, no estimate signed",
      active: false,
      steps: [
        {
          id: "s1",
          kind: "trigger",
          title: "Inspection completed and no estimate signed",
          detail: "Homeowners only",
        },
        { id: "s2", kind: "wait", days: 1 },
        {
          id: "s3",
          kind: "email",
          title: "Your roof inspection photos",
          detail: "Photos and notes from {{repName}}'s inspection",
        },
        { id: "s4", kind: "wait", days: 3 },
        { id: "s5", kind: "branch", title: "Opened the photos email?" },
        { id: "s6", kind: "task", title: "Call {{firstName}} about the estimate", detail: "Assigned to the job's project manager" },
        { id: "s7", kind: "sms", title: "Did you get your inspection photos?", detail: "Only contacts with a phone number" },
        { id: "s8", kind: "wait", days: 7 },
        { id: "s9", kind: "email", title: "How insurance claim deadlines work", detail: "Claim timeline, and how the crew helps" },
        { id: "s10", kind: "exit", detail: "Exit when the estimate is signed, the job is lost, or the contact unsubscribes." },
      ],
    },
    {
      id: "flow-review",
      name: "Review ask",
      summary: "2 days after a job is completed",
      active: false,
      steps: [
        { id: "r1", kind: "trigger", title: "Job marked complete", detail: "Homeowner on the job" },
        { id: "r2", kind: "wait", days: 2 },
        { id: "r3", kind: "email", title: "How did we do?", detail: "Review link for the office Google listing" },
        { id: "r4", kind: "exit", detail: "One reminder after 5 days, then stop." },
      ],
    },
    {
      id: "flow-anniversary",
      name: "Roof anniversary",
      summary: "Every year on the install date",
      active: false,
      steps: [
        { id: "a1", kind: "trigger", title: "Install anniversary", detail: "Completed roofing jobs" },
        { id: "a2", kind: "email", title: "Happy roof-iversary", detail: "A free check-up while the crew is nearby" },
        { id: "a3", kind: "exit", detail: "Stops if the contact unsubscribes." },
      ],
    },
  ];
}

const EMPTY_SEGMENTS: SavedSegment[] = [];
const EMPTY_DOORS: CanvassDoor[] = [];
let flowFallback: MarketingFlow[] | null = null;

function stableFlows() {
  flowFallback ??= defaultFlows();
  return flowFallback;
}

export function loadGuardrails(companyId: string): MarketingGuardrails {
  return readMarketingLocal(`${GUARD_KEY}:${companyId}`, DEFAULT_GUARDRAILS, (raw) => ({
    ...DEFAULT_GUARDRAILS,
    ...(JSON.parse(raw) as Partial<MarketingGuardrails>),
  }));
}

export function saveGuardrails(companyId: string, value: MarketingGuardrails) {
  writeMarketingLocal(`${GUARD_KEY}:${companyId}`, value);
}

export function useGuardrails(companyId: string) {
  return useSyncExternalStore(subscribeMarketingLocal, () => loadGuardrails(companyId), () => DEFAULT_GUARDRAILS);
}

export function loadSegments(companyId: string): SavedSegment[] {
  return readMarketingLocal(`${SEGMENT_KEY}:${companyId}`, EMPTY_SEGMENTS, (raw) => {
    const stored = JSON.parse(raw) as SavedSegment[];
    return Array.isArray(stored) ? stored : EMPTY_SEGMENTS;
  });
}

export function saveSegments(companyId: string, segments: SavedSegment[]) {
  writeMarketingLocal(`${SEGMENT_KEY}:${companyId}`, segments);
}

export function useSegments(companyId: string) {
  return useSyncExternalStore(subscribeMarketingLocal, () => loadSegments(companyId), () => EMPTY_SEGMENTS);
}

export function loadDoors(companyId: string, jobId: string): CanvassDoor[] {
  return readMarketingLocal(`${DOOR_KEY}:${companyId}:${jobId}`, EMPTY_DOORS, (raw) => {
    const stored = JSON.parse(raw) as CanvassDoor[];
    return Array.isArray(stored) ? stored : EMPTY_DOORS;
  });
}

export function saveDoors(companyId: string, jobId: string, doors: CanvassDoor[]) {
  writeMarketingLocal(`${DOOR_KEY}:${companyId}:${jobId}`, doors);
}

export function useDoors(companyId: string, jobId: string) {
  return useSyncExternalStore(
    subscribeMarketingLocal,
    () => loadDoors(companyId, jobId),
    () => EMPTY_DOORS,
  );
}

export function loadFlows(companyId: string): MarketingFlow[] {
  return readMarketingLocal(`${FLOW_KEY}:${companyId}`, stableFlows(), (raw) => {
    const stored = JSON.parse(raw) as MarketingFlow[];
    if (!Array.isArray(stored) || stored.length === 0) return stableFlows();
    return stored;
  });
}

export function saveFlows(companyId: string, flows: MarketingFlow[]) {
  writeMarketingLocal(`${FLOW_KEY}:${companyId}`, flows);
}

export function useFlows(companyId: string) {
  return useSyncExternalStore(subscribeMarketingLocal, () => loadFlows(companyId), stableFlows);
}

const SEND_LOG = "truss.marketing.send-log.v1";
const EMPTY_SENDS: Array<{ id: string; at: number }> = [];

function loadSends(companyId: string) {
  return readMarketingLocal(`${SEND_LOG}:${companyId}`, EMPTY_SENDS, (raw) => {
    const parsed = JSON.parse(raw) as Array<{ id: string; at: number }>;
    return Array.isArray(parsed) ? parsed : EMPTY_SENDS;
  });
}

export function rememberSends(companyId: string, contactIds: string[]) {
  if (typeof window === "undefined" || contactIds.length === 0) return;
  const now = Date.now();
  const week = now - 7 * 24 * 60 * 60 * 1000;
  const next = [...contactIds.map((id) => ({ id, at: now })), ...loadSends(companyId).filter((row) => row.at >= week)].slice(0, 5000);
  writeMarketingLocal(`${SEND_LOG}:${companyId}`, next);
}

export function cappedContactIds(companyId: string, contactIds: string[]) {
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();
  for (const row of loadSends(companyId)) {
    if (row.at < week) continue;
    counts.set(row.id, (counts.get(row.id) || 0) + 1);
  }
  return contactIds.filter((id) => (counts.get(id) || 0) >= 2);
}

export function quietHoursBlockNow(enabled: boolean) {
  if (!enabled) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Chicago" }).format(
      new Date(),
    ),
  );
  return hour >= 20 || hour < 8;
}
