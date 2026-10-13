import { formatTime, initials, localYmd } from "@/lib/format";
import { closedWonThisMonth, type HomeWonDeal } from "@/lib/home-dashboard";
import { isDeletedJob, jobRecordHref, parseLocation } from "@/lib/job-record";
import { messageThreads, messagesHref } from "@/lib/job-messages";
import { postedPayments } from "@/lib/payment-posting";
import { namesMatch } from "@/lib/seats";
import { sortTasks, taskIsOverdue } from "@/lib/task-desk";
import {
  STAGE_LABELS,
  isShelvedStage,
  type Contact,
  type Job,
  type Opportunity,
  type Payment,
  type PipelineStage,
  type ScheduleEvent,
  type Task,
  type TextMessage,
} from "@/lib/types";

export type FieldSite = {
  key: string;
  badge: string;
  name: string;
  street: string;
  locality: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  href: string;
  photosHref: string;
  measureHref: string;
  lat: number | null;
  lng: number | null;
  jobId: string | null;
  opportunityId: string | null;
  contactId: string | null;
  clientId: string | null;
  entityType: "job" | "opportunity" | null;
  entityId: string | null;
};

export type FieldPresence = {
  tone: "live" | "next" | "open";
  label: string;
  detail: string;
};

export type FieldAttentionTask = {
  id: string;
  title: string;
  who: string;
  daysLate: number;
  phone: string;
  href: string;
  action: "call" | "open";
};

export type FieldMessagePreview = {
  key: string;
  title: string;
  initials: string;
  preview: string;
  when: string;
  href: string;
};

export type FieldForecastDay = {
  label: string;
  weekday: string;
  short: string;
  high: number;
  low: number;
  icon: "sun" | "cloud";
  rain: boolean;
  emphasize: boolean;
};

export type FieldHomeModel = {
  dateLabel: string;
  greeting: string;
  firstName: string;
  site: FieldSite | null;
  presence: FieldPresence | null;
  attention: {
    count: number;
    oldestDays: number;
    tasks: FieldAttentionTask[];
    hidden: number;
  };
  monthLabel: string;
  wonAmount: number;
  wonCount: number;
  collectedAmount: number;
  collectedCount: number;
  pipelineAmount: number;
  pipelineCount: number;
  messages: FieldMessagePreview[];
};

export type FieldHomeInput = {
  staffName: string;
  staffId: string;
  events: ScheduleEvent[];
  jobs: Job[];
  opportunities: Opportunity[];
  contacts: Contact[];
  tasks: Task[];
  payments: Payment[];
  messages: TextMessage[];
  wonDeals: HomeWonDeal[];
};

const ATTENTION_LIMIT = 2;

export function fieldDateLabel(now = new Date()) {
  return now
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

export function fieldGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function fieldFirstName(name: string) {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

export function fieldShortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Site";
  return parts[parts.length - 1] ?? "Site";
}

export function fieldMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}$${Math.round(abs)}`;
}

export function fieldMessageWhen(iso: string, now = new Date()) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function forecastIsRain(code: number, chance: number) {
  return chance >= 40 || code >= 51;
}

export function forecastIcon(code: number, rain: boolean): "sun" | "cloud" {
  if (rain || code >= 3) return "cloud";
  return "sun";
}

export function buildForecastDays(
  input: {
    time: string[];
    weatherCode: number[];
    tempMax: number[];
    tempMin: number[];
    precipProb: number[];
  },
  now = new Date(),
): FieldForecastDay[] {
  const today = localYmd(now);
  const days = input.time.slice(0, 4).map((iso, index) => {
    const date = new Date(`${iso}T12:00:00`);
    const code = input.weatherCode[index] ?? 0;
    const chance = input.precipProb[index] ?? 0;
    const rain = forecastIsRain(code, chance);
    return {
      label: iso === today ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
      weekday: date.toLocaleDateString("en-US", { weekday: "long" }),
      short: date.toLocaleDateString("en-US", { weekday: "short" }),
      high: Math.round(input.tempMax[index] ?? 0),
      low: Math.round(input.tempMin[index] ?? 0),
      icon: forecastIcon(code, rain) as "sun" | "cloud",
      rain,
      emphasize: false,
    };
  });
  const wetIndex = days.findIndex((day) => day.rain);
  const emphasize = wetIndex >= 0 ? wetIndex : 0;
  return days.map((day, index) => ({ ...day, emphasize: index === emphasize }));
}

export function tearOffNote(days: FieldForecastDay[]) {
  const wet = days.filter((day) => day.rain);
  if (wet.length === 0) return null;
  const dry = days.filter((day) => !day.rain).map((day) => day.short);
  const wetLabel = wet.map((day) => day.weekday).join(" and ");
  if (dry.length === 0) return `Rain ${wetLabel} — hold tear-offs until it clears.`;
  return `Rain ${wetLabel} — plan tear-offs for ${joinOr(dry)}`;
}

export function parseOpenMeteo(payload: unknown, now = new Date()) {
  if (!payload || typeof payload !== "object") return null;
  const daily = (payload as { daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] } }).daily;
  if (!daily?.time?.length) return null;
  return buildForecastDays(
    {
      time: daily.time,
      weatherCode: daily.weather_code ?? [],
      tempMax: daily.temperature_2m_max ?? [],
      tempMin: daily.temperature_2m_min ?? [],
      precipProb: daily.precipitation_probability_max ?? [],
    },
    now,
  );
}

async function geocodePlace(place: string) {
  const queries = [place];
  const city = place.split(",")[0]?.trim();
  if (city && city !== place) queries.push(city);
  for (const query of queries) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`;
    const geo = await fetch(geoUrl);
    if (!geo.ok) continue;
    const body = (await geo.json()) as { results?: Array<{ latitude: number; longitude: number }> };
    const hit = body.results?.[0];
    if (hit) return hit;
  }
  return null;
}

export async function loadFieldForecast(
  input: { lat?: number | null; lng?: number | null; place?: string },
  now = new Date(),
) {
  let lat = typeof input.lat === "number" ? input.lat : null;
  let lng = typeof input.lng === "number" ? input.lng : null;
  if ((lat == null || lng == null) && input.place?.trim()) {
    const hit = await geocodePlace(input.place.trim());
    if (!hit) return null;
    lat = hit.latitude;
    lng = hit.longitude;
  }
  if (lat == null || lng == null) return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "4");
  const response = await fetch(url);
  if (!response.ok) return null;
  return parseOpenMeteo(await response.json(), now);
}

export function currentFieldSite(input: FieldHomeInput, now = new Date()) {
  const today = localYmd(now);
  const mine = input.events
    .filter((event) => namesMatch(event.assignee, input.staffName))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const live = mine.find((event) => eventIsLive(event, now));
  if (live) {
    const site = siteForEvent(live, input);
    if (site) {
      return {
        site,
        presence: { tone: "live" as const, label: "On site", detail: `since ${formatTime(live.startsAt)}` },
      };
    }
  }

  const upcoming = mine.find((event) => {
    const start = new Date(event.startsAt);
    return Number.isFinite(start.getTime()) && localYmd(start) === today && start.getTime() > now.getTime();
  });
  if (upcoming) {
    const site = siteForEvent(upcoming, input);
    if (site) {
      return {
        site,
        presence: { tone: "next" as const, label: "Up next", detail: formatTime(upcoming.startsAt) },
      };
    }
  }

  const site = fallbackSite(input);
  if (!site) return { site: null, presence: null };
  return {
    site,
    presence: {
      tone: "open" as const,
      label: "Open",
      detail: site.badge === "LEAD" ? "Lead" : site.badge,
    },
  };
}

export function buildFieldHome(input: FieldHomeInput, now = new Date()): FieldHomeModel {
  const { site, presence } = currentFieldSite(input, now);
  const attention = attentionTasks(input, now);
  const closed = closedWonThisMonth(input.wonDeals, now);
  const collected = collectedThisMonth(input.payments, now);
  const open = input.opportunities.filter(
    (opportunity) => opportunity.stage !== "awarded" && !isShelvedStage(opportunity.stage),
  );
  return {
    dateLabel: fieldDateLabel(now),
    greeting: fieldGreeting(now),
    firstName: fieldFirstName(input.staffName),
    site,
    presence,
    attention,
    monthLabel: now.toLocaleDateString("en-US", { month: "long" }),
    wonAmount: closed.amount,
    wonCount: closed.count,
    collectedAmount: collected.amount,
    collectedCount: collected.count,
    pipelineAmount: open.reduce((sum, opportunity) => sum + (Number(opportunity.value) || 0), 0),
    pipelineCount: open.length,
    messages: recentMessages(input, now),
  };
}

function attentionTasks(input: FieldHomeInput, now: Date) {
  const sorted = sortTasks(input.tasks.filter(taskIsOverdue));
  const tasks = sorted.slice(0, ATTENTION_LIMIT).map((task) => attentionTask(task, input, now));
  const oldestDays = sorted.reduce((max, task) => Math.max(max, lateDays(task, now)), 0);
  return {
    count: sorted.length,
    oldestDays,
    tasks,
    hidden: Math.max(0, sorted.length - tasks.length),
  };
}

function attentionTask(task: Task, input: FieldHomeInput, now: Date): FieldAttentionTask {
  const related = relatedRecord(task, input);
  const contact = related
    ? input.contacts.find((item) => item.id === related.primaryContactId)
    : undefined;
  const relatedName = contact?.name || related?.name || "";
  const assignee = task.assignee?.trim() ?? "";
  const who =
    assignee && !namesMatch(assignee, input.staffName)
      ? assignee
      : relatedName || assignee || "Open task";
  const phone = contact?.phone?.trim() ?? "";
  const call = Boolean(phone) && /\b(call|callback|phone|ring)\b/i.test(task.title);
  return {
    id: task.id,
    title: task.title,
    who,
    daysLate: lateDays(task, now),
    phone,
    href: taskHref(task),
    action: call ? "call" : "open",
  };
}

function recentMessages(input: FieldHomeInput, now: Date): FieldMessagePreview[] {
  return messageThreads(input.messages, input.contacts, input.jobs, input.opportunities)
    .slice(0, 2)
    .map((thread) => {
      const last = thread.messages[thread.messages.length - 1];
      const body = (last?.body || thread.preview || "").replace(/\s+/g, " ").trim();
      const clipped = body.length > 42 ? `${body.slice(0, 40).trim()}…` : body;
      return {
        key: thread.key,
        title: thread.title,
        initials: initials(thread.title) || "?",
        preview: last?.direction === "outbound" ? `You: ${clipped}` : clipped,
        when: fieldMessageWhen(thread.lastAt, now),
        href: messagesHref({ thread: thread.key }),
      };
    });
}

function collectedThisMonth(payments: Payment[], now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const rows = postedPayments(payments).filter((payment) => {
    const stamp = new Date(payment.paidAt).getTime();
    return Number.isFinite(stamp) && stamp >= start && stamp <= end;
  });
  const invoices = new Set(rows.map((payment) => payment.invoiceId).filter((id): id is string => Boolean(id)));
  return {
    amount: rows.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    count: invoices.size || rows.length,
  };
}

function fallbackSite(input: FieldHomeInput) {
  const opportunities = openOpportunities(input.opportunities).sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
  const jobs = activeJobs(input.jobs);
  const ownedOpp = opportunities.find((opportunity) => staffTouchesOpportunity(opportunity, input));
  if (ownedOpp) return siteFromOpportunity(ownedOpp, input.contacts);
  const ownedJob = jobs.find((job) => staffTouchesJob(job, input));
  if (ownedJob) return siteFromJob(ownedJob, input.contacts);
  const anyOpp = opportunities[0];
  if (anyOpp) return siteFromOpportunity(anyOpp, input.contacts);
  const anyJob = jobs[0];
  if (anyJob) return siteFromJob(anyJob, input.contacts);
  return null;
}

function siteForEvent(event: ScheduleEvent, input: FieldHomeInput) {
  if (event.jobId) {
    const job = input.jobs.find((item) => item.id === event.jobId && !isDeletedJob(item));
    if (job) return siteFromJob(job, input.contacts);
  }
  if (event.opportunityId) {
    const job = activeJobs(input.jobs).find((item) => item.opportunityId === event.opportunityId);
    if (job) return siteFromJob(job, input.contacts);
    const opportunity = input.opportunities.find((item) => item.id === event.opportunityId);
    if (opportunity && !isShelvedStage(opportunity.stage)) return siteFromOpportunity(opportunity, input.contacts);
  }
  const location = event.location?.trim() || "";
  const title = event.title?.trim() || "";
  if (!location && !title) return null;
  const address = splitAddress({ location });
  return {
    key: `event:${event.id}`,
    badge: "STOP",
    name: fieldShortName(title || location),
    street: address.street || location || title,
    locality: address.locality,
    address: location || title,
    city: address.city,
    state: address.state,
    phone: "",
    href: "/calendar",
    photosHref: "/photos",
    measureHref: "/calendar",
    lat: null,
    lng: null,
    jobId: null,
    opportunityId: null,
    contactId: null,
    clientId: null,
    entityType: null,
    entityId: null,
  } satisfies FieldSite;
}

function siteFromJob(job: Job, contacts: Contact[]): FieldSite {
  const contact = contacts.find((item) => item.id === job.primaryContactId);
  const address = splitAddress(job);
  const person = contact?.name?.trim() || job.name;
  return {
    key: `job:${job.id}`,
    badge: "JOB",
    name: fieldShortName(person),
    street: address.street || job.name,
    locality: address.locality,
    address: joinAddress(address.street || job.name, address.locality) || job.location || job.name,
    city: address.city,
    state: address.state,
    phone: contact?.phone?.trim() ?? "",
    href: jobRecordHref(job.id),
    photosHref: jobRecordHref(job.id, { tab: "photos" }),
    measureHref: jobRecordHref(job.id),
    lat: typeof job.lat === "number" ? job.lat : null,
    lng: typeof job.lng === "number" ? job.lng : null,
    jobId: job.id,
    opportunityId: job.opportunityId,
    contactId: job.primaryContactId,
    clientId: job.clientId,
    entityType: "job",
    entityId: job.id,
  };
}

function siteFromOpportunity(opportunity: Opportunity, contacts: Contact[]): FieldSite {
  const contact = contacts.find((item) => item.id === opportunity.primaryContactId);
  const address = splitAddress(opportunity);
  const person = contact?.name?.trim() || opportunity.name;
  return {
    key: `opp:${opportunity.id}`,
    badge: opportunityBadge(opportunity.stage),
    name: fieldShortName(person),
    street: address.street || opportunity.name,
    locality: address.locality,
    address: joinAddress(address.street || opportunity.name, address.locality) || opportunity.location || opportunity.name,
    city: address.city,
    state: address.state,
    phone: contact?.phone?.trim() ?? "",
    href: `/opportunities/${opportunity.id}`,
    photosHref: `/opportunities/${opportunity.id}`,
    measureHref: `/opportunities/${opportunity.id}`,
    lat: null,
    lng: null,
    jobId: null,
    opportunityId: opportunity.id,
    contactId: opportunity.primaryContactId,
    clientId: opportunity.clientId,
    entityType: "opportunity",
    entityId: opportunity.id,
  };
}

function opportunityBadge(stage: PipelineStage) {
  return (STAGE_LABELS[stage] || "Lead").toUpperCase();
}

function splitAddress(record: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
}) {
  let street = record.street?.trim() ?? "";
  let city = record.city?.trim() ?? "";
  let state = record.state?.trim() ?? "";
  let postal = record.postalCode?.trim() ?? "";
  if (!street && !city && record.location?.trim()) {
    const parsed = parseLocation(record.location);
    street = parsed.street;
    city = parsed.city;
    state = parsed.state;
    postal = parsed.postalCode;
  }
  const cityState = [city, state].filter(Boolean).join(", ");
  return {
    street,
    city,
    state,
    postal,
    locality: [cityState, postal].filter(Boolean).join(" "),
  };
}

function joinAddress(street: string, locality: string) {
  return [street, locality].filter(Boolean).join(", ");
}

function openOpportunities(opportunities: Opportunity[]) {
  return opportunities.filter((opportunity) => opportunity.stage !== "awarded" && !isShelvedStage(opportunity.stage));
}

function activeJobs(jobs: Job[]) {
  return jobs.filter((job) => !isDeletedJob(job) && job.status !== "complete" && job.status !== "on_hold");
}

function staffTouchesOpportunity(opportunity: Opportunity, input: FieldHomeInput) {
  if (
    input.staffId &&
    (opportunity.ownerStaffId === input.staffId ||
      opportunity.assignedTo === input.staffId ||
      opportunity.originatorStaffId === input.staffId)
  ) {
    return true;
  }
  return namesMatch(opportunity.estimator, input.staffName);
}

function staffTouchesJob(job: Job, input: FieldHomeInput) {
  if (input.staffId && (job.ownerStaffId === input.staffId || job.assigned.includes(input.staffId))) return true;
  return (
    namesMatch(job.salesRep, input.staffName) ||
    namesMatch(job.projectManager, input.staffName) ||
    namesMatch(job.superintendent, input.staffName)
  );
}

function eventIsLive(event: ScheduleEvent, now: Date) {
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const stamp = now.getTime();
  if (!Number.isFinite(start)) return false;
  const stop = Number.isFinite(end) && end > start ? end : start + 2 * 60 * 60 * 1000;
  return stamp >= start && stamp <= stop;
}

function relatedRecord(task: Task, input: FieldHomeInput) {
  if (task.relatedType === "job" && task.relatedId) {
    const job = input.jobs.find((item) => item.id === task.relatedId);
    return job ? { name: job.name, primaryContactId: job.primaryContactId } : undefined;
  }
  if (task.relatedType === "opportunity" && task.relatedId) {
    const opportunity = input.opportunities.find((item) => item.id === task.relatedId);
    return opportunity
      ? { name: opportunity.name, primaryContactId: opportunity.primaryContactId }
      : undefined;
  }
  return undefined;
}

function taskHref(task: Task) {
  if (task.relatedType === "job" && task.relatedId) return jobRecordHref(task.relatedId);
  if (task.relatedType === "opportunity" && task.relatedId) return `/opportunities/${task.relatedId}`;
  return "/tasks";
}

function lateDays(task: Task, now: Date) {
  const due = new Date(`${task.dueAt.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(due.getTime())) return 0;
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86_400_000));
}

function joinOr(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
