import { formatPhone, localYmd } from "@/lib/format";
import { isAutomatedText } from "@/lib/inbox-desk";
import { isDeletedJob, jobRecordHref } from "@/lib/job-record";
import { messagesHref } from "@/lib/job-messages";
import type {
  Activity,
  Estimate,
  EstimateSignatureEvent,
  Expense,
  GmailMessage,
  Job,
  Opportunity,
  TextMessage,
} from "@/lib/types";

const SKIP_MESSAGE_KINDS = new Set(["reaction", "rename", "membership", "effect", "poll", "edit"]);

/** How many activity items the home card shows before the rest open in the date popup. */
export const HOME_ACTIVITY_LIMIT = 10;

export type HomeActivityFilter = "all" | "proposals" | "messages" | "expenses";

export type HomeActivityBucket = "proposals" | "messages" | "expenses" | "progress";
export type HomeActivityIcon =
  | "opened"
  | "sent"
  | "signed"
  | "declined"
  | "text"
  | "email"
  | "call"
  | "work";

export type HomeActivityDelivery = {
  id: string;
  channel: "email" | "text";
  value: string;
  status: string;
  ok: boolean;
};

export type HomeActivityEvent = {
  id: string;
  at: string;
  when: string;
  icon: HomeActivityIcon;
  title: string;
  detail: string;
  meta: string;
  amount: number | null;
  phone: string;
  textHref: string;
  followUp: boolean;
  deliveries: HomeActivityDelivery[];
  proposalHref: string;
  shareToken: string;
};

export type HomeActivityGroup = {
  id: string;
  bucket: HomeActivityBucket;
  kind: "property" | "expenses" | "plain";
  at: string;
  day: string;
  title: string;
  place: string;
  badge: string;
  href: string;
  jobCode: string;
  expenseTotal: number;
  events: HomeActivityEvent[];
};

export type HomeActivityDay = {
  id: string;
  label: string;
  groups: HomeActivityGroup[];
};

export type HomeActivityFeed = {
  today: string;
  counts: { all: number; proposals: number; messages: number; expenses: number };
  days: HomeActivityDay[];
};

export type HomeActivityContact = {
  id: string;
  name: string;
  phone: string;
  email: string;
};

export type HomeActivityInput = {
  now?: Date;
  jobs: Job[];
  opportunities: Opportunity[];
  estimates: Estimate[];
  signatureEvents?: EstimateSignatureEvent[];
  expenses?: Expense[];
  messages?: TextMessage[];
  emails?: GmailMessage[];
  activities?: Activity[];
  contacts?: HomeActivityContact[];
};

type Draft = Omit<HomeActivityGroup, "expenseTotal"> & { expenseTotal?: number };

export function buildHomeActivity(input: HomeActivityInput): HomeActivityFeed {
  const now = input.now ?? new Date();
  const today = localYmd(now);
  const yesterday = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12));
  const jobs = new Map<string, Job>();
  const jobsByOpportunity = new Map<string, Job>();
  for (const job of input.jobs) {
    if (!job?.id || isDeletedJob(job)) continue;
    jobs.set(job.id, job);
    if (job.opportunityId && !jobsByOpportunity.has(job.opportunityId)) {
      jobsByOpportunity.set(job.opportunityId, job);
    }
  }
  const opportunities = new Map(input.opportunities.filter((item) => item?.id).map((item) => [item.id, item]));
  const contacts = new Map((input.contacts ?? []).filter((item) => item?.id).map((item) => [item.id, item]));
  const estimates = input.estimates.filter((estimate) => estimate?.id && !estimate.archivedAt);

  const groups: Draft[] = [];
  groups.push(...proposalGroups({ input, now, jobs, opportunities, contacts, estimates }));
  groups.push(...messageGroups({ input, now, jobs, jobsByOpportunity, opportunities, contacts }));
  groups.push(...expenseGroups({ input, now, jobs, opportunities }));
  groups.push(...progressGroups({ input, now, jobs, jobsByOpportunity, opportunities }));

  const ready = groups
    .filter((group) => group.events.length > 0)
    .map((group) => ({
      ...group,
      expenseTotal: group.expenseTotal ?? 0,
      title: group.bucket === "expenses" ? expenseTitle(group.events.length) : group.title,
      events: group.bucket === "expenses" ? [...group.events].sort(byNewest) : group.events,
      at: group.events.reduce((latest, event) => (event.at > latest ? event.at : latest), group.events[0]?.at ?? group.at),
    }));

  const byDay = new Map<string, HomeActivityGroup[]>();
  for (const group of ready) {
    const day = localYmd(new Date(group.at));
    const list = byDay.get(day) ?? [];
    list.push({ ...group, day });
    byDay.set(day, list);
  }

  const days = [...byDay.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([id, dayGroups]) => ({
      id,
      label: id === today ? "Today" : id === yesterday ? "Yesterday" : dayTitle(id),
      groups: dayGroups.sort((left, right) => right.at.localeCompare(left.at)),
    }));

  return {
    today,
    counts: {
      all: countEvents(ready),
      proposals: countEvents(ready, "proposals"),
      messages: countEvents(ready, "messages"),
      expenses: countEvents(ready, "expenses"),
    },
    days,
  };
}

function proposalGroups(args: {
  input: HomeActivityInput;
  now: Date;
  jobs: Map<string, Job>;
  opportunities: Map<string, Opportunity>;
  contacts: Map<string, HomeActivityContact>;
  estimates: Estimate[];
}): Draft[] {
  const events = args.input.signatureEvents ?? [];
  const groups: Draft[] = [];
  for (const estimate of args.estimates) {
    const job = estimate.jobId ? args.jobs.get(estimate.jobId) : undefined;
    if (estimate.jobId && !job && args.input.jobs.some((item) => item.id === estimate.jobId && isDeletedJob(item))) {
      continue;
    }
    const opportunity = estimate.opportunityId
      ? args.opportunities.get(estimate.opportunityId)
      : job?.opportunityId
        ? args.opportunities.get(job.opportunityId)
        : undefined;
    const contact =
      lookup(args.contacts, estimate.contactId) ||
      lookup(args.contacts, job?.primaryContactId) ||
      lookup(args.contacts, opportunity?.primaryContactId);
    const related = events.filter((event) => event.estimateId === estimate.id && event.id);
    const opened = related.filter((event) => event.kind === "opened").sort(byCreated);
    const sentEvents = related.filter((event) => event.kind === "sent").sort(byCreated);
    const signed = related.filter((event) => event.kind === "signed").sort(byCreated);
    const declined = related.filter((event) => event.kind === "declined").sort(byCreated);
    const sentStamp = latestStamp([estimate.sentAt, ...sentEvents.map((event) => event.createdAt)]);
    const rows: HomeActivityEvent[] = [];
    const latestOpen = opened.at(-1);
    const openStamp = stamp(latestOpen?.createdAt);
    if (latestOpen && openStamp) {
      const name = latestOpen.signerName.trim() || contact?.name.trim() || "The customer";
      const times = opened.length > 1 ? ` viewed it ${opened.length} times` : " viewed it";
      rows.push(
        eventRow({
          id: `open:${estimate.id}`,
          at: openStamp,
          now: args.now,
          icon: "opened",
          title: "Customer opened the proposal",
          detail: `${name}${times} — a good moment to follow up.`,
          phone: presentPhone(contact?.phone),
          textHref: composeHref(job?.id, contact?.id || latestOpen.contactId),
          followUp: true,
        }),
      );
    }
    const latestSigned = signed.at(-1);
    const signedStamp = stamp(latestSigned?.createdAt);
    if (latestSigned && signedStamp) {
      const name = latestSigned.signerName.trim() || contact?.name.trim() || "The customer";
      rows.push(
        eventRow({
          id: `signed:${estimate.id}`,
          at: signedStamp,
          now: args.now,
          icon: "signed",
          title: "Customer signed the proposal",
          detail: `${name} signed it.`,
        }),
      );
    }
    const latestDeclined = declined.at(-1);
    const declinedStamp = stamp(latestDeclined?.createdAt);
    if (latestDeclined && declinedStamp) {
      const name = latestDeclined.signerName.trim() || contact?.name.trim() || "The customer";
      rows.push(
        eventRow({
          id: `declined:${estimate.id}`,
          at: declinedStamp,
          now: args.now,
          icon: "declined",
          title: "Customer declined the proposal",
          detail: `${name} declined it.`,
        }),
      );
    }
    if (sentStamp) {
      rows.push(
        eventRow({
          id: `sent:${estimate.id}`,
          at: sentStamp,
          now: args.now,
          icon: "sent",
          title: "You sent the proposal",
          deliveries: deliveriesFor(sentEvents),
          proposalHref: `/estimates/${estimate.id}`,
          shareToken: estimate.shareToken?.trim() || "",
        }),
      );
    }
    const kept = rows.filter((row) => inWindow(row.at, args.now));
    if (!kept.length) continue;
    kept.sort(byNewestIcon);
    const header = siteHeader(job, opportunity, estimate);
    groups.push({
      id: `proposal:${estimate.id}`,
      bucket: "proposals",
      kind: "property",
      at: kept[0]?.at ?? sentStamp,
      day: "",
      title: header.title || estimate.number || "Proposal",
      place: header.place,
      badge: estimate.number?.trim() || "",
      href: header.href || `/estimates/${estimate.id}`,
      jobCode: header.jobCode,
      events: kept,
    });
  }
  return groups;
}

function messageGroups(args: {
  input: HomeActivityInput;
  now: Date;
  jobs: Map<string, Job>;
  jobsByOpportunity: Map<string, Job>;
  opportunities: Map<string, Opportunity>;
  contacts: Map<string, HomeActivityContact>;
}): Draft[] {
  const buckets = new Map<string, Draft>();
  const textStamps: Array<{ at: string; jobId: string; contactId: string }> = [];
  const emailStamps: Array<{ at: string; jobId: string }> = [];

  for (const message of args.input.messages ?? []) {
    if (!message?.id) continue;
    const kind = (message.kind || "").trim().toLowerCase();
    if (SKIP_MESSAGE_KINDS.has(kind) || isAutomatedText(message)) continue;
    const at = stamp(message.createdAt);
    if (!at || !inWindow(at, args.now)) continue;
    const job = lookup(args.jobs, message.jobId);
    const contact = lookup(args.contacts, message.contactId) || lookup(args.contacts, job?.primaryContactId);
    const name = contact?.name.trim() || "Homeowner";
    const outbound = message.direction !== "inbound";
    textStamps.push({ at, jobId: job?.id || "", contactId: contact?.id || "" });
    pushEvent(buckets, {
      key: groupKey(job?.id, contact?.id, message.phone, message.id, at),
      job,
      opportunity: job?.opportunityId ? args.opportunities.get(job.opportunityId) : undefined,
      event: eventRow({
        id: `text:${message.id}`,
        at,
        now: args.now,
        icon: kind === "call" ? "call" : "text",
        title:
          kind === "call"
            ? outbound
              ? `You called ${name}`
              : `${name} called`
            : outbound
              ? `You texted ${name}`
              : `${name} texted`,
        detail: firstLine(message.body),
        phone: presentPhone(message.phone || contact?.phone),
      }),
    });
  }

  for (const email of args.input.emails ?? []) {
    if (!email?.id) continue;
    const at = stamp(email.receivedAt);
    if (!at || !inWindow(at, args.now)) continue;
    const job = lookup(args.jobs, email.jobId);
    const contact = lookup(args.contacts, email.contactId) || lookup(args.contacts, job?.primaryContactId);
    if (!job && !contact) continue;
    const outbound = email.direction === "outbound";
    const who = outbound
      ? contact?.name.trim() || email.toEmail.trim() || "them"
      : email.fromName.trim() || contact?.name.trim() || email.fromEmail.trim() || "Someone";
    emailStamps.push({ at, jobId: job?.id || "" });
    pushEvent(buckets, {
      key: groupKey(job?.id, contact?.id, "", email.id, at),
      job,
      opportunity: job?.opportunityId ? args.opportunities.get(job.opportunityId) : undefined,
      event: eventRow({
        id: `email:${email.id}`,
        at,
        now: args.now,
        icon: "email",
        title: outbound ? `You emailed ${who}` : `${who} emailed`,
        detail: email.subject.trim() || firstLine(email.snippet),
      }),
    });
  }

  for (const activity of args.input.activities ?? []) {
    if (!activity?.id) continue;
    if (activity.type !== "call" && activity.type !== "email" && activity.type !== "text") continue;
    const at = stamp(activity.createdAt);
    if (!at || !inWindow(at, args.now)) continue;
    const job =
      activity.entityType === "job"
        ? lookup(args.jobs, activity.entityId)
        : activity.entityType === "opportunity"
          ? args.jobsByOpportunity.get(activity.entityId)
          : undefined;
    const opportunity =
      activity.entityType === "opportunity"
        ? args.opportunities.get(activity.entityId)
        : job?.opportunityId
          ? args.opportunities.get(job.opportunityId)
          : undefined;
    const contact = lookup(args.contacts, job?.primaryContactId) || lookup(args.contacts, opportunity?.primaryContactId);
    if (activity.type === "text" && textStamps.some((item) => sameParty(item, job?.id, contact?.id) && withinMinutes(item.at, at, 5))) {
      continue;
    }
    if (activity.type === "email" && job && emailStamps.some((item) => item.jobId === job.id && withinMinutes(item.at, at, 10))) {
      continue;
    }
    const body = firstLine(activity.body);
    if (!body) continue;
    pushEvent(buckets, {
      key: groupKey(job?.id, contact?.id, "", activity.id, at),
      job,
      opportunity,
      event: eventRow({
        id: `activity:${activity.id}`,
        at,
        now: args.now,
        icon: activity.type === "call" ? "call" : activity.type === "email" ? "email" : "text",
        title: body,
        detail: [activity.author.trim(), job?.code || opportunity?.code || ""].filter(Boolean).join(" · "),
        phone: presentPhone(contact?.phone),
      }),
    });
  }

  for (const group of buckets.values()) group.events.sort(byNewestIcon);
  return [...buckets.values()];
}

function expenseGroups(args: {
  input: HomeActivityInput;
  now: Date;
  jobs: Map<string, Job>;
  opportunities: Map<string, Opportunity>;
}): Draft[] {
  const buckets = new Map<string, Draft>();
  for (const expense of args.input.expenses ?? []) {
    if (!expense?.id) continue;
    const at = stamp(expense.createdAt) || stamp(expense.incurredAt);
    if (!at || !inWindow(at, args.now)) continue;
    const job = lookup(args.jobs, expense.jobId);
    const day = localYmd(new Date(at));
    const key = `expense:${job?.id || "none"}:${day}`;
    const when = relativeWhen(at, args.now);
    const meta = [expense.number.trim(), expense.invoiceNumber.trim() ? `Invoice ${expense.invoiceNumber.trim()}` : "", when]
      .filter(Boolean)
      .join(" · ");
    const existing = buckets.get(key);
    const row = eventRow({
      id: `expense:${expense.id}`,
      at,
      now: args.now,
      icon: "work",
      title: expense.vendor.trim() || "Expense",
      meta,
      amount: Number.isFinite(expense.amount) ? expense.amount : 0,
    });
    if (existing) {
      existing.events.push(row);
      existing.expenseTotal = (existing.expenseTotal ?? 0) + (row.amount ?? 0);
      if (row.at > existing.at) existing.at = row.at;
      continue;
    }
    const opportunity = job?.opportunityId ? args.opportunities.get(job.opportunityId) : undefined;
    buckets.set(key, {
      id: key,
      bucket: "expenses",
      kind: "expenses",
      at,
      day,
      title: "",
      place: "",
      badge: "",
      href: job ? jobRecordHref(job.id) : "",
      jobCode: job?.code || opportunity?.code || "",
      expenseTotal: row.amount ?? 0,
      events: [row],
    });
  }
  return [...buckets.values()];
}

function progressGroups(args: {
  input: HomeActivityInput;
  now: Date;
  jobs: Map<string, Job>;
  jobsByOpportunity: Map<string, Job>;
  opportunities: Map<string, Opportunity>;
}): Draft[] {
  const buckets = new Map<string, Draft>();
  for (const activity of args.input.activities ?? []) {
    if (!activity?.id) continue;
    if (activity.type === "call" || activity.type === "email" || activity.type === "text") continue;
    const at = stamp(activity.createdAt);
    if (!at || !inWindow(at, args.now)) continue;
    const body = firstLine(activity.body);
    if (!body) continue;
    const job =
      activity.entityType === "job"
        ? lookup(args.jobs, activity.entityId)
        : activity.entityType === "opportunity"
          ? args.jobsByOpportunity.get(activity.entityId)
          : undefined;
    const opportunity =
      activity.entityType === "opportunity"
        ? args.opportunities.get(activity.entityId)
        : job?.opportunityId
          ? args.opportunities.get(job.opportunityId)
          : undefined;
    const day = localYmd(new Date(at));
    const key = job ? `progress:${job.id}:${day}` : `progress:${activity.id}`;
    pushEvent(buckets, {
      key,
      bucket: "progress",
      job,
      opportunity,
      event: eventRow({
        id: `progress:${activity.id}`,
        at,
        now: args.now,
        icon: "work",
        title: body,
        detail: [activity.author.trim(), job?.code || opportunity?.code || ""].filter(Boolean).join(" · "),
      }),
    });
  }
  for (const group of buckets.values()) group.events.sort(byNewestIcon);
  return [...buckets.values()];
}

function pushEvent(
  buckets: Map<string, Draft>,
  item: { key: string; bucket?: HomeActivityBucket; job?: Job; opportunity?: Opportunity; event: HomeActivityEvent },
) {
  const existing = buckets.get(item.key);
  if (existing) {
    existing.events.push(item.event);
    if (item.event.at > existing.at) existing.at = item.event.at;
    return;
  }
  const header = siteHeader(item.job, item.opportunity);
  const property = Boolean(item.job && header.title);
  buckets.set(item.key, {
    id: item.key,
    bucket: item.bucket ?? "messages",
    kind: property ? "property" : "plain",
    at: item.event.at,
    day: localYmd(new Date(item.event.at)),
    title: property ? header.title : "",
    place: property ? header.place : "",
    badge: "",
    href: header.href,
    jobCode: header.jobCode,
    events: [item.event],
  });
}

function siteHeader(job?: Job, opportunity?: Opportunity, estimate?: Estimate) {
  const street = job?.street.trim() || estimate?.street.trim() || opportunity?.street?.trim() || "";
  const city = job?.city.trim() || estimate?.city.trim() || opportunity?.city?.trim() || "";
  const state = job?.state.trim() || estimate?.state.trim() || opportunity?.state?.trim() || "";
  const postal = job?.postalCode.trim() || estimate?.postalCode.trim() || opportunity?.postalCode?.trim() || "";
  const cityLine = [city, [state, postal].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const code = job?.code.trim() || opportunity?.code.trim() || "";
  const location = !street && !cityLine ? job?.location.trim() || opportunity?.location.trim() || "" : "";
  const title = street || location || job?.name.trim() || opportunity?.name.trim() || "";
  const place = [cityLine, code].filter(Boolean).join(" · ");
  const href = job ? jobRecordHref(job.id) : opportunity ? `/opportunities/${opportunity.id}` : "";
  return { title, place, href, jobCode: code };
}

function deliveriesFor(events: EstimateSignatureEvent[]): HomeActivityDelivery[] {
  const seen = new Set<string>();
  const rows: HomeActivityDelivery[] = [];
  for (const event of events) {
    const channel = deliveryChannel(event.deliveryChannel);
    const raw = event.deliveryTo.trim();
    if (!channel || !raw) continue;
    const value = channel === "text" ? presentPhone(raw) || raw : raw;
    const key = `${channel}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: event.id, channel, value, status: "Delivered", ok: true });
  }
  rows.sort((left, right) => (left.channel === right.channel ? 0 : left.channel === "email" ? -1 : 1));
  return rows;
}

function deliveryChannel(value: string): "email" | "text" | null {
  const channel = value.trim().toLowerCase();
  if (channel === "email" || channel === "mail") return "email";
  if (channel === "sms" || channel === "text" || channel === "imessage") return "text";
  return null;
}

function eventRow(partial: {
  id: string;
  at: string;
  now: Date;
  icon: HomeActivityIcon;
  title: string;
  detail?: string;
  meta?: string;
  amount?: number | null;
  phone?: string;
  textHref?: string;
  followUp?: boolean;
  deliveries?: HomeActivityDelivery[];
  proposalHref?: string;
  shareToken?: string;
}): HomeActivityEvent {
  return {
    id: partial.id,
    at: partial.at,
    when: relativeWhen(partial.at, partial.now),
    icon: partial.icon,
    title: partial.title,
    detail: partial.detail ?? "",
    meta: partial.meta ?? "",
    amount: partial.amount ?? null,
    phone: partial.phone ?? "",
    textHref: partial.textHref ?? "",
    followUp: partial.followUp ?? false,
    deliveries: partial.deliveries ?? [],
    proposalHref: partial.proposalHref ?? "",
    shareToken: partial.shareToken ?? "",
  };
}

function composeHref(jobId?: string | null, contactId?: string | null) {
  if (!jobId && !contactId) return "";
  return messagesHref({ job: jobId, contact: contactId, compose: true });
}

function groupKey(jobId: string | undefined, contactId: string | undefined, phone: string, id: string, at: string) {
  const day = localYmd(new Date(at));
  if (jobId) return `thread:job:${jobId}:${day}`;
  if (contactId) return `thread:contact:${contactId}:${day}`;
  const digits = phone.replace(/\D/g, "");
  if (digits) return `thread:phone:${digits}:${day}`;
  return `thread:${id}`;
}

function latestStamp(values: Array<string | null | undefined>) {
  return values.map((value) => stamp(value)).filter(Boolean).sort().at(-1) ?? "";
}

export type HomeActivitySelection = {
  days: HomeActivityDay[];
  /** Events that match the filter and the date range. */
  total: number;
  /** Events included after the limit. */
  shown: number;
  counts: HomeActivityFeed["counts"];
};

/** Newest matching items, optionally capped and limited to a date or inclusive range. */
export function selectHomeActivity(
  feed: HomeActivityFeed,
  query: { filter?: HomeActivityFilter; from?: string; to?: string; limit?: number } = {},
): HomeActivitySelection {
  const filter = query.filter ?? "all";
  const bounds = dateBounds(query.from, query.to);
  const matched = collectEvents(feed, "all", bounds);
  const filtered = filter === "all" ? matched : matched.filter((item) => item.group.bucket === filter);
  const limited = query.limit != null && query.limit >= 0 ? filtered.slice(0, query.limit) : filtered;
  return {
    days: regroup(limited, feed.today),
    total: filtered.length,
    shown: limited.length,
    counts: {
      all: matched.length,
      proposals: matched.filter((item) => item.group.bucket === "proposals").length,
      messages: matched.filter((item) => item.group.bucket === "messages").length,
      expenses: matched.filter((item) => item.group.bucket === "expenses").length,
    },
  };
}

function collectEvents(feed: HomeActivityFeed, filter: HomeActivityFilter, bounds: { start: string; end: string }) {
  const chosen: Array<{ group: HomeActivityGroup; event: HomeActivityEvent }> = [];
  for (const day of feed.days) {
    for (const group of day.groups) {
      if (filter !== "all" && group.bucket !== filter) continue;
      for (const event of group.events) {
        const eventDay = localYmd(new Date(event.at));
        if (bounds.start && eventDay < bounds.start) continue;
        if (bounds.end && eventDay > bounds.end) continue;
        chosen.push({ group, event });
      }
    }
  }
  chosen.sort((left, right) => right.event.at.localeCompare(left.event.at) || left.event.id.localeCompare(right.event.id));
  return chosen;
}

function dateBounds(from: string | undefined, to: string | undefined) {
  const start = (from ?? "").trim();
  const end = (to ?? "").trim();
  if (start && end && start > end) return { start: end, end: start };
  return { start, end };
}

function regroup(items: Array<{ group: HomeActivityGroup; event: HomeActivityEvent }>, today: string): HomeActivityDay[] {
  const groups = new Map<string, HomeActivityGroup>();
  for (const item of items) {
    const existing = groups.get(item.group.id);
    if (existing) {
      existing.events.push(item.event);
      continue;
    }
    groups.set(item.group.id, { ...item.group, events: [item.event], expenseTotal: 0 });
  }
  const ready = [...groups.values()].map((group) => {
    const events = [...group.events].sort((left, right) => right.at.localeCompare(left.at));
    const at = events[0]?.at ?? group.at;
    const expenseTotal = events.reduce((sum, event) => sum + (event.amount ?? 0), 0);
    return {
      ...group,
      at,
      day: localYmd(new Date(at)),
      events,
      expenseTotal,
      title: group.bucket === "expenses" ? expenseTitle(events.length) : group.title,
    };
  });
  const byDay = new Map<string, HomeActivityGroup[]>();
  for (const group of ready) {
    const list = byDay.get(group.day) ?? [];
    list.push(group);
    byDay.set(group.day, list);
  }
  const yesterday = shiftYmd(today, -1);
  return [...byDay.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([id, dayGroups]) => ({
      id,
      label: id === today ? "Today" : id === yesterday ? "Yesterday" : dayTitle(id),
      groups: dayGroups.sort((left, right) => right.at.localeCompare(left.at)),
    }));
}

function shiftYmd(ymd: string, days: number) {
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return localYmd(date);
}

function sameParty(item: { jobId: string; contactId: string }, jobId?: string, contactId?: string) {
  if (jobId && item.jobId === jobId) return true;
  if (contactId && item.contactId === contactId) return true;
  return false;
}

function withinMinutes(left: string, right: string, minutes: number) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= minutes * 60_000;
}

function expenseTitle(count: number) {
  return `${count} expense${count === 1 ? "" : "s"} logged`;
}

function countEvents(groups: Draft[], bucket?: HomeActivityBucket) {
  return groups.reduce((total, group) => (bucket && group.bucket !== bucket ? total : total + group.events.length), 0);
}

function lookup<T extends { id: string }>(map: Map<string, T>, id: string | null | undefined) {
  if (!id) return undefined;
  return map.get(id);
}

function byCreated(left: { createdAt: string }, right: { createdAt: string }) {
  return left.createdAt.localeCompare(right.createdAt);
}

function byNewest(left: { at: string }, right: { at: string }) {
  return right.at.localeCompare(left.at);
}

function byNewestIcon(left: HomeActivityEvent, right: HomeActivityEvent) {
  if (left.at !== right.at) return right.at.localeCompare(left.at);
  return iconRank(left.icon) - iconRank(right.icon);
}

function iconRank(icon: HomeActivityIcon) {
  if (icon === "opened") return 0;
  if (icon === "signed") return 1;
  if (icon === "declined") return 2;
  if (icon === "sent") return 3;
  return 4;
}

function stamp(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date(`${trimmed}T12:00:00`).toISOString();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function inWindow(iso: string, now: Date) {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return false;
  return now.getTime() - time > -3_600_000;
}

function relativeWhen(iso: string, now: Date) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMin = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (Math.abs(diffMin) < 1) return "just now";
  if (Math.abs(diffMin) < 60) return diffMin > 0 ? `${diffMin}m ago` : `in ${-diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return diffHr > 0 ? `${diffHr}h ago` : `in ${-diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 14) return diffDay > 0 ? `${diffDay}d ago` : `in ${-diffDay}d`;
  return dayTitle(localYmd(date));
}

function dayTitle(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function firstLine(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function presentPhone(value: string | null | undefined) {
  const formatted = formatPhone(value);
  return formatted === "—" ? "" : formatted;
}
