export const NOTIFY_CHANNELS = ["in_app", "email", "text"] as const;

export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const NOTIFY_CHANNEL_LABELS: Record<NotifyChannel, string> = {
  in_app: "In the app",
  email: "Email",
  text: "Text",
};

export type NotifySectionId = "leads" | "jobs" | "chats" | "tasks" | "weather" | "account";

export type NotifyAudience = "everyone" | "team_lead" | "leaders" | "leaders_and_leads" | "admins";

export type AlertId =
  | "lead_assigned_you"
  | "lead_assigned_team"
  | "lead_needs_rep"
  | "lead_passed_back"
  | "lead_rep_note"
  | "proposal_opened"
  | "missed_call"
  | "returning_client"
  | "accounting_returned"
  | "website_chat"
  | "realtor_listing"
  | "task_due"
  | "file_mention"
  | "weather_warning"
  | "weather_lightning"
  | "weather_watch"
  | "stripe_revoke";

export type AlertDef = {
  id: AlertId;
  section: NotifySectionId;
  title: string;
  description: string;
  channels: NotifyChannel[];
  /** These stay on. Lead popups and safety notices cannot be silenced. */
  locked: NotifyChannel[];
  audience: NotifyAudience;
  badge?: string;
};

export type NotificationPrefs = Partial<Record<AlertId, Partial<Record<NotifyChannel, boolean>>>>;

export const NOTIFY_SECTIONS: Array<{ id: NotifySectionId; label: string }> = [
  { id: "leads", label: "Leads" },
  { id: "jobs", label: "Jobs & money" },
  { id: "chats", label: "Chats & lists" },
  { id: "tasks", label: "Tasks & work" },
  { id: "weather", label: "Weather" },
  { id: "account", label: "Account" },
];

export const ALERTS: AlertDef[] = [
  {
    id: "lead_assigned_you",
    section: "leads",
    title: "A lead is assigned to you",
    description: "Name, phone, address, and source. Skipped when you assign it to yourself.",
    channels: ["in_app", "email", "text"],
    locked: ["in_app"],
    audience: "everyone",
  },
  {
    id: "lead_assigned_team",
    section: "leads",
    title: "A lead is assigned to someone on your team",
    description: "You are the team lead. Same details, with the assignee’s name.",
    channels: ["in_app", "email"],
    locked: ["in_app"],
    audience: "team_lead",
  },
  {
    id: "lead_needs_rep",
    section: "leads",
    title: "A lead needs a rep",
    description: "Unassigned. Company admins and directors.",
    channels: ["in_app", "email", "text"],
    locked: ["in_app"],
    audience: "leaders",
    badge: "Admins & directors",
  },
  {
    id: "lead_passed_back",
    section: "leads",
    title: "A rep passes a lead back",
    description: "Reason and note. Company admins and directors, except the rep who sent it.",
    channels: ["in_app", "email", "text"],
    locked: ["in_app"],
    audience: "leaders",
    badge: "Admins & directors",
  },
  {
    id: "lead_rep_note",
    section: "leads",
    title: "A rep writes a note to the admin",
    description: "The note itself. Company admins and directors, except the author.",
    channels: ["in_app", "email", "text"],
    locked: ["in_app"],
    audience: "leaders",
    badge: "Admins & directors",
  },
  {
    id: "proposal_opened",
    section: "jobs",
    title: "A client opens your proposal",
    description: "You are the project manager. Link previews do not count.",
    channels: ["in_app", "email", "text"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "missed_call",
    section: "jobs",
    title: "You miss a call on your voice line",
    description: "You own the job or the new lead. A callback task is still created.",
    channels: ["in_app", "email", "text"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "returning_client",
    section: "jobs",
    title: "A returning client is opened",
    description: "Previous project managers, and company admins and directors when they have to decide.",
    channels: ["in_app", "email", "text"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "accounting_returned",
    section: "jobs",
    title: "Accounting sends back an invoice, expense, or payment",
    description: "You own the job. The note shows on Home and on the file.",
    channels: ["in_app", "email"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "website_chat",
    section: "chats",
    title: "A website chat starts",
    description: "Company admins and directors. A chat tied to one person goes only to that person.",
    channels: ["in_app", "email"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "realtor_listing",
    section: "chats",
    title: "A partner posts a new listing",
    description: "You are watching that realtor’s feed.",
    channels: ["in_app", "text"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "task_due",
    section: "tasks",
    title: "A task is due today or overdue",
    description: "You are an assignee. One email, with a link to your task list.",
    channels: ["in_app", "email"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "file_mention",
    section: "tasks",
    title: "Someone mentions you on a file",
    description: "An @mention on an invoice, expense, or payment. It stays on the file either way.",
    channels: ["in_app", "email"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "weather_warning",
    section: "weather",
    title: "Warning over a job or your location",
    description: "Tornado, severe thunderstorm, flash flood, or large hail. You own the job, or your phone is on site.",
    channels: ["text"],
    locked: ["text"],
    audience: "everyone",
  },
  {
    id: "weather_lightning",
    section: "weather",
    title: "Lightning near a job or you",
    description: "40% or higher. You own the job, or your phone is on site.",
    channels: ["text"],
    locked: [],
    audience: "everyone",
  },
  {
    id: "weather_watch",
    section: "weather",
    title: "Watches, morning hail outlook, high wind, and flash flood watches",
    description: "Company admins, directors, and team leads.",
    channels: ["text"],
    locked: [],
    audience: "leaders_and_leads",
    badge: "Admins, directors, and team leads",
  },
  {
    id: "stripe_revoke",
    section: "account",
    title: "Stripe keys are being removed",
    description: "Company admins. The email names who started it and when the keys come off.",
    channels: ["email"],
    locked: ["email"],
    audience: "admins",
    badge: "Admins",
  },
];

const ALERT_BY_ID = new Map(ALERTS.map((alert) => [alert.id, alert]));

export function alertDef(id: AlertId) {
  return ALERT_BY_ID.get(id);
}

export function channelLocked(alert: AlertDef, channel: NotifyChannel) {
  return alert.locked.includes(channel);
}

export function isTeamLeadSeat(role: string, staffId: string, teams: Array<{ leadStaffId: string }>) {
  return role === "team_lead" || teams.some((team) => team.leadStaffId === staffId);
}

export function memberSeesAlert(audience: NotifyAudience, role: string, teamLead: boolean) {
  if (audience === "everyone") return true;
  if (audience === "admins") return role === "company_admin";
  const leader = role === "company_admin" || role === "director";
  if (audience === "leaders") return leader;
  if (audience === "team_lead") return teamLead;
  return leader || teamLead;
}

export function alertsForMember(role: string, staffId: string, teams: Array<{ leadStaffId: string }>) {
  const teamLead = isTeamLeadSeat(role, staffId, teams);
  return ALERTS.filter((alert) => memberSeesAlert(alert.audience, role, teamLead));
}

export function allowsNotification(
  prefs: NotificationPrefs | null | undefined,
  id: AlertId,
  channel: NotifyChannel,
) {
  const alert = alertDef(id);
  if (!alert || !alert.channels.includes(channel)) return false;
  if (channelLocked(alert, channel)) return true;
  const stored = prefs?.[id]?.[channel];
  return stored !== false;
}

export function parseNotificationPrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const prefs: NotificationPrefs = {};
  for (const alert of ALERTS) {
    const raw = record[alert.id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const channels: Partial<Record<NotifyChannel, boolean>> = {};
    for (const channel of alert.channels) {
      if (channelLocked(alert, channel)) continue;
      const flag = (raw as Record<string, unknown>)[channel];
      if (flag === false) channels[channel] = false;
    }
    if (Object.keys(channels).length) prefs[alert.id] = channels;
  }
  return prefs;
}

export function setNotificationChannel(
  prefs: NotificationPrefs,
  id: AlertId,
  channel: NotifyChannel,
  on: boolean,
): NotificationPrefs {
  const alert = alertDef(id);
  if (!alert || channelLocked(alert, channel) || !alert.channels.includes(channel)) return prefs;
  const next: NotificationPrefs = { ...prefs, [id]: { ...prefs[id] } };
  if (on) delete next[id]?.[channel];
  else next[id] = { ...next[id], [channel]: false };
  if (next[id] && Object.keys(next[id] ?? {}).length === 0) delete next[id];
  return next;
}

export function setAlertsChannels(prefs: NotificationPrefs, alerts: AlertDef[], on: boolean) {
  let next = prefs;
  for (const alert of alerts) {
    for (const channel of alert.channels) {
      next = setNotificationChannel(next, alert.id, channel, on);
    }
  }
  return next;
}

export function sectionCanToggle(alerts: AlertDef[]) {
  return alerts.some((alert) => alert.channels.some((channel) => !channelLocked(alert, channel)));
}

export function prefsSignature(prefs: NotificationPrefs) {
  return ALERTS.map((alert) =>
    alert.channels
      .filter((channel) => !channelLocked(alert, channel))
      .map((channel) => `${alert.id}.${channel}:${allowsNotification(prefs, alert.id, channel) ? 1 : 0}`)
      .join(","),
  ).join("|");
}

export const PREFS_STORAGE_PREFIX = "truss.notification-prefs.";
