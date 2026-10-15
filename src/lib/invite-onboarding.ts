export const JOB_RADIUS_MIN = 10;
export const JOB_RADIUS_MAX = 100;
export const JOB_RADIUS_STEP = 5;
export const JOB_RADIUS_DEFAULT = 30;

export const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;

export const ONBOARDING_TASKS = ["profile", "calendar", "gmail", "lead", "photo"] as const;
export type OnboardingTask = (typeof ONBOARDING_TASKS)[number];

export const ONBOARDING_TASK_LABELS: Record<OnboardingTask, string> = {
  profile: "Set up your profile",
  calendar: "Connect Google Calendar",
  gmail: "Connect Gmail",
  lead: "Open your first lead",
  photo: "Upload a job photo",
};

const OAUTH_RETURN_PATHS = new Set(["/welcome", "/", "/calendar", "/mail"]);

export type OnboardingStep = "profile" | "tools" | "done";

export type InviteGateStatus = "open" | "accepted" | "expired" | "used" | "declined" | "missing";

export type InviteGate = {
  status: InviteGateStatus;
  companyId: string;
  companyName: string;
  seatName: string;
  seatTitle: string;
  seatRole: string;
  email: string;
  expiresAt: string;
  reinviteRequested: boolean;
};

const GATE_STATUSES: InviteGateStatus[] = ["open", "accepted", "expired", "used", "declined", "missing"];

export function parseInviteGate(value: unknown): InviteGate {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = row.status;
  return {
    status: GATE_STATUSES.includes(status as InviteGateStatus) ? (status as InviteGateStatus) : "missing",
    companyId: stringField(row.companyId),
    companyName: stringField(row.companyName),
    seatName: stringField(row.seatName),
    seatTitle: stringField(row.seatTitle),
    seatRole: stringField(row.seatRole),
    email: stringField(row.email),
    expiresAt: stringField(row.expiresAt),
    reinviteRequested: row.reinviteRequested === true,
  };
}

export function inviteCanRenew(status: InviteGateStatus) {
  return status === "expired" || status === "used" || status === "declined";
}

export function inviteBlockReason(status: InviteGateStatus) {
  switch (status) {
    case "expired":
      return "This invite expired.";
    case "used":
      return "This invite was already used.";
    case "declined":
      return "This invite was declined.";
    default:
      return "This invite is missing.";
  }
}

export function onboardingStep(value: unknown): OnboardingStep | null {
  if (value === "profile" || value === "tools" || value === "done") return value;
  return null;
}

export function onboardingTasksFromJson(value: unknown): Partial<Record<OnboardingTask, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const tasks: Partial<Record<OnboardingTask, string>> = {};
  for (const task of ONBOARDING_TASKS) {
    const stamp = row[task];
    if (typeof stamp === "string" && stamp.trim()) tasks[task] = stamp;
  }
  return tasks;
}

export function openOnboardingTasks(
  tasks: Partial<Record<OnboardingTask, string>>,
  available: { calendar: boolean; gmail: boolean },
) {
  return ONBOARDING_TASKS.filter((task) => {
    if (task === "calendar" && !available.calendar) return false;
    if (task === "gmail" && !available.gmail) return false;
    return !tasks[task];
  });
}

export function phoneReady(value: string) {
  const digits = value.replace(/\D/g, "");
  const national = digits.length >= 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length >= 10;
}

export function radiusReady(value: number) {
  return (
    Number.isInteger(value) &&
    value >= JOB_RADIUS_MIN &&
    value <= JOB_RADIUS_MAX &&
    value % JOB_RADIUS_STEP === 0
  );
}

export function timeZoneOptions(browserZone: string) {
  const zone = browserZone.trim();
  if (!zone || TIME_ZONES.includes(zone as (typeof TIME_ZONES)[number])) return [...TIME_ZONES];
  return [zone, ...TIME_ZONES];
}

/** Same-origin path an OAuth callback may return to. Anything else falls back. */
export function oauthReturnPath(value: string | null | undefined) {
  if (!value) return null;
  const path = value.split("?")[0]?.trim() ?? "";
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (!OAUTH_RETURN_PATHS.has(path)) return null;
  return path;
}

export function oauthFinishUrl(origin: string, next: string | null | undefined, fallbackPath: string) {
  return new URL(oauthReturnPath(next) ?? fallbackPath, origin);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
