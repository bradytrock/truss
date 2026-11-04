"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Search,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { RecordErrorBoundary } from "@/components/record-error-boundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCrm } from "@/lib/crm-store";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  contactForPhone,
  contactsForTexting,
  conversationThreadKey,
  filterMessageThreads,
  jobForContact,
  messageThreads,
  messagesHref,
  phoneKey,
  resolveInboxThreadKey,
  type MessageThread,
} from "@/lib/job-messages";
import {
  addedThreadPeople,
  addableThreadPeople,
  implicitThreadCrew,
  openedAtFor,
  threadUnreadCount,
  viewerFromStaff,
  visibleInboxThreads,
} from "@/lib/message-threads";
import { formatCurrency, formatInboxTime, formatPhone, formatTime, initials, localYmd } from "@/lib/format";
import { ASSISTANT_NAME } from "@/lib/product";
import { firstName, formatPhoneInput, looksLikePhone } from "@/lib/phone";
import { mailHref } from "@/lib/job-emails";
import { jobPaperHref, jobRecordHref, mapsUrl } from "@/lib/job-record";
import { estimateTotals } from "@/lib/estimate-totals";
import { cn } from "@/lib/utils";
import { fallbackChatReplies, type WebsiteChatThread } from "@/lib/website-chat";
import { IMESSAGE_EFFECTS, IMESSAGE_TAPBACKS } from "@/lib/imessage";
import {
  appointmentLabel,
  avatarTone,
  buildInboxTimeline,
  cassioTextDraft,
  daysSinceLabel,
  firstHttpUrl,
  formatCallDuration,
  formatInboxDay,
  hostOf,
  inboxAddress,
  inboxChips,
  inboxQueue,
  inboxRoleLabel,
  inboxStage,
  isAutomatedText,
  jobProgress,
  jobsForPeople,
  nextAppointment,
  onMyWayText,
  QUICK_REPLIES,
  quickReplyBody,
  reviewRequestDraft,
  shortStaffName,
  smsSegmentLabel,
  textStatusLabel,
  textStatusTone,
  threadIsAutomated,
  threadIsMine,
  threadIsUnassigned,
  threadMatchesScope,
  threadOwnerId,
  type InboxCall,
  type InboxChannel,
  type InboxChip,
  type InboxQueue,
  type InboxScope,
  type InboxTimelineEntry,
} from "@/lib/inbox-desk";
import type { Estimate, Job, Opportunity, TextMessage } from "@/lib/types";
const CLOSED_KEY = "truss.inbox.closed";
const PAGE_OPENED_AT = new Date().toISOString();

function textOf(value: unknown) {
  return typeof value === "string" ? value : "";
}

function estimateNumberFor(
  estimates: Estimate[],
  jobId: string | null | undefined,
  opportunityId: string | null | undefined,
) {
  const match = estimates.find(
    (estimate) =>
      estimate &&
      !estimate.archivedAt &&
      (estimate.status === "sent" || estimate.status === "viewed" || estimate.status === "accepted") &&
      ((jobId && estimate.jobId === jobId) || (opportunityId && estimate.opportunityId === opportunityId)),
  );
  return match?.number || "";
}

const EMPTY_CLOSED: Record<string, string> = {};
const closedListeners = new Set<() => void>();
let closedSnapshot = EMPTY_CLOSED;
let closedLoaded = false;

function readClosed(): Record<string, string> {
  if (typeof window === "undefined") return EMPTY_CLOSED;
  try {
    const raw = window.localStorage.getItem(CLOSED_KEY);
    if (!raw) return EMPTY_CLOSED;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return EMPTY_CLOSED;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") next[key] = value;
    }
    return next;
  } catch {
    return EMPTY_CLOSED;
  }
}

function getClosedSnapshot() {
  if (!closedLoaded && typeof window !== "undefined") {
    closedSnapshot = readClosed();
    closedLoaded = true;
  }
  return closedSnapshot;
}

function subscribeClosed(listener: () => void) {
  closedListeners.add(listener);
  return () => closedListeners.delete(listener);
}

function rememberClosed(key: string, at: string) {
  closedSnapshot = { ...getClosedSnapshot(), [key]: at };
  try {
    window.localStorage.setItem(CLOSED_KEY, JSON.stringify(closedSnapshot));
  } catch {
    // Private mode can refuse the write. The click still clears it for this view.
  }
  for (const listener of closedListeners) listener();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

type InboxListRow = {
  key: string;
  kind: "text" | "web";
  title: string;
  preview: string;
  at: string;
  queue: InboxQueue;
  unread: boolean;
  unreadCount: number;
  code: string;
  chips: InboxChip[];
  estimateNumber: string;
  owner: string;
  unassigned: boolean;
  place: string;
};

type ComposePerson = {
  key: string;
  name: string;
  detail: string;
  meta: string;
  contactId: string;
  phone: string;
  jobId: string;
  threadKey: string;
};

const CHANNELS: { id: InboxChannel; label: string }[] = [
  { id: "all", label: "All" },
  { id: "texts", label: "Texts" },
  { id: "email", label: "Email" },
  { id: "calls", label: "Calls" },
  { id: "notes", label: "Notes" },
];

export function MessagesInbox() {
  const crm = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  const book = crm.book;
  const contacts = Array.isArray(book?.contacts) ? book.contacts : [];
  const jobs = Array.isArray(book?.jobs) ? book.jobs : [];
  const opportunities = Array.isArray(book?.opportunities) ? book.opportunities : [];
  const messages = Array.isArray(book?.messages) ? book.messages : [];
  const profiles = Array.isArray(book?.companyProfiles) ? book.companyProfiles : [];
  const staff = Array.isArray(book?.staff) ? book.staff : [];
  const members = Array.isArray(book?.messageThreadMembers) ? book.messageThreadMembers : [];
  const opens = Array.isArray(book?.messageThreadOpens) ? book.messageThreadOpens : [];
  const clients = Array.isArray(book?.clients) ? book.clients : [];
  const emails = Array.isArray(book?.gmailMessages) ? book.gmailMessages : [];
  const activities = Array.isArray(book?.activities) ? book.activities : [];
  const allThreads = useMemo(() => {
    try {
      return messageThreads(messages, contacts, jobs, opportunities);
    } catch (error) {
      console.error(error);
      return [];
    }
  }, [messages, contacts, jobs, opportunities]);
  const viewer = useMemo(() => {
    if (!crm.effectiveStaff) return null;
    try {
      return viewerFromStaff(
        crm.effectiveStaff,
        profiles,
        crm.impersonatedStaff ? undefined : { profileId: crm.user.id, profileRole: crm.user.role },
      );
    } catch (error) {
      console.error(error);
      return null;
    }
  }, [profiles, crm.effectiveStaff, crm.impersonatedStaff, crm.user.id, crm.user.role]);
  const threads = useMemo(() => {
    if (!viewer) return allThreads;
    try {
      return visibleInboxThreads(allThreads, viewer, { staff, profiles, members, jobs, opportunities });
    } catch (error) {
      console.error(error);
      return allThreads;
    }
  }, [allThreads, jobs, members, opportunities, profiles, staff, viewer]);
  const textable = useMemo(() => {
    try {
      return contactsForTexting(contacts);
    } catch (error) {
      console.error(error);
      return [];
    }
  }, [contacts]);

  const wantedJob = params?.get("job") ?? null;
  const wantedContact = params?.get("contact") ?? null;
  const wantedThread = params?.get("thread") ?? null;
  const composeParam = params?.get("compose") === "1";
  const viewerStaffId = crm.effectiveStaff?.id || crm.user.staffId || "";
  const viewerName = crm.effectiveStaff?.name || crm.user.name || "";

  const queryContact = useMemo(() => {
    if (wantedContact) return contacts.find((row) => row?.id === wantedContact);
    if (wantedJob) {
      const job = jobs.find((row) => row?.id === wantedJob);
      return job ? contacts.find((row) => row?.id === job.primaryContactId) : undefined;
    }
    return undefined;
  }, [wantedContact, wantedJob, contacts, jobs]);

  const queryJob = useMemo(
    () => (wantedJob ? jobs.find((row) => row?.id === wantedJob) : undefined),
    [wantedJob, jobs],
  );

  const queryThread = useMemo(() => {
    try {
      const resolved = resolveInboxThreadKey(wantedThread, contacts);
      if (resolved) return threads.find((thread) => thread.key === resolved);
      if (queryContact) {
        const key = conversationThreadKey({ contactId: queryContact.id, phone: queryContact.phone });
        return threads.find(
          (thread) =>
            thread.key === key ||
            thread.contactId === queryContact.id ||
            (Array.isArray(thread.contactIds) && thread.contactIds.includes(queryContact.id)) ||
            phoneKey(thread.phone) === phoneKey(queryContact.phone),
        );
      }
      return undefined;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }, [wantedThread, queryContact, threads, contacts]);

  const [query, setQuery] = useState("");
  const [draftPhone, setDraftPhone] = useState(() =>
    queryContact?.phone ? formatPhoneInput(queryContact.phone) : "",
  );
  const [draftContactId, setDraftContactId] = useState(() => queryContact?.id ?? "");
  const contactSeed = queryContact?.id ?? "";
  const [seenContact, setSeenContact] = useState(contactSeed);
  if (contactSeed !== seenContact) {
    setSeenContact(contactSeed);
    if (queryContact?.phone && !draftPhone) {
      setDraftPhone(formatPhoneInput(queryContact.phone));
      setDraftContactId(queryContact.id);
    }
  }
  const [body, setBody] = useState("");
  const [effect, setEffect] = useState("");
  const [replyTo, setReplyTo] = useState<{ handle: string; preview: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [webChats, setWebChats] = useState<WebsiteChatThread[]>([]);
  const [webBody, setWebBody] = useState("");
  const [webSending, setWebSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [scopeChoice, setScopeChoice] = useState<InboxScope>("all");
  const [scopeTouched, setScopeTouched] = useState(false);
  const [automatedOnly, setAutomatedOnly] = useState(false);
  const closed = useSyncExternalStore(subscribeClosed, getClosedSnapshot, () => EMPTY_CLOSED);
  const [calls, setCalls] = useState<InboxCall[]>([]);
  const [channel, setChannel] = useState<InboxChannel>("all");
  const [jobFocus, setJobFocus] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const showCompose = composeParam || (!wantedThread && Boolean(queryContact) && !queryThread);
  const webChatId = wantedThread?.startsWith("web:") ? wantedThread.slice(4) : "";
  const explicitSelection = Boolean(wantedThread || wantedContact || wantedJob);
  const fallbackThread = useMemo(() => {
    const mineThread = threads.find((thread) => threadIsMine(thread, { staffId: viewerStaffId, name: viewerName }));
    return mineThread ?? threads[0] ?? null;
  }, [threads, viewerName, viewerStaffId]);
  const selectedWeb = webChats.find((chat) => chat.id === webChatId) ?? null;
  const selected = webChatId || showCompose
    ? null
    : queryThread ??
      (wantedThread ? threads.find((row) => row.key === wantedThread) : undefined) ??
      (explicitSelection ? null : fallbackThread);

  const visibleThreads = useMemo(() => filterMessageThreads(threads, query), [query, threads]);
  const composeContact =
    (draftContactId ? contacts.find((row) => row?.id === draftContactId) : undefined) ??
    contactForPhone(contacts, draftPhone);
  const sendTo = selected?.phone || draftPhone;
  let attachedJobId = "";
  if (composeContact) {
    try {
      attachedJobId = jobForContact(jobs, opportunities, composeContact.id)?.id ?? "";
    } catch (error) {
      console.error(error);
    }
  }
  const jobHintBase = queryJob?.id ?? selected?.jobId ?? attachedJobId;
  const contactHint = queryContact?.id ?? selected?.contactId ?? composeContact?.id ?? "";
  const conversationOpen = showCompose || Boolean(selected) || Boolean(webChatId);
  const threadSeed = selected?.key ?? (webChatId ? `web:${webChatId}` : "");
  const [seenThread, setSeenThread] = useState(threadSeed);
  if (threadSeed !== seenThread) {
    setSeenThread(threadSeed);
    setReplyTo(null);
    setEffect("");
    setJobFocus(null);
    setChannel("all");
    setDetailsOpen(false);
  }

  const mineAvailable = useMemo(
    () => threads.some((thread) => threadIsMine(thread, { staffId: viewerStaffId, name: viewerName })),
    [threads, viewerName, viewerStaffId],
  );
  const scope: InboxScope =
    !scopeTouched && scopeChoice === "mine" && threads.length > 0 && !mineAvailable ? "all" : scopeChoice;

  const focusJobId = jobFocus && jobFocus !== "all" ? jobFocus : null;
  const jobHint = focusJobId || jobHintBase;
  const contactIds = selected?.contactIds?.length
    ? selected.contactIds
    : selected?.contactId
      ? [selected.contactId]
      : composeContact?.id
        ? [composeContact.id]
        : [];
  const relatedJobs = jobsForPeople(jobs, opportunities, contactIds);
  const panelJob =
    jobs.find((job) => job.id === (focusJobId || selected?.jobId || selectedWeb?.jobId || "")) ??
    relatedJobs[0] ??
    null;
  const panelOpportunity =
    (panelJob?.opportunityId ? opportunities.find((row) => row.id === panelJob.opportunityId) : undefined) ??
    selected?.opportunity;
  const activeContact = selected?.contact ?? composeContact;
  const activeClient = activeContact?.clientId
    ? clients.find((client) => client.id === activeContact.clientId)
    : undefined;

  useEffect(() => {
    let cancelled = false;
    function load() {
      void fetch("/api/chat/office")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { chats?: WebsiteChatThread[] } | null) => {
          if (!cancelled) setWebChats(chatThreads(data?.chats));
        })
        .catch(() => undefined);
    }
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/calls/sessions")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { sessions?: InboxCall[] } | null) => {
        if (cancelled || !Array.isArray(data?.sessions)) return;
        setCalls(
          data.sessions.filter((call) => call && typeof call.id === "string" && typeof call.startedAt === "string"),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleWebChats = useMemo(() => {
    const rows = chatThreads(webChats);
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (chat) =>
        textOf(chat.label).toLowerCase().includes(needle) || textOf(chat.preview).toLowerCase().includes(needle),
    );
  }, [query, webChats]);

  const estimates = Array.isArray(book?.estimates) ? book.estimates : [];
  const scheduleEvents = Array.isArray(book?.events) ? book.events : [];

  const rows = useMemo(() => {
    const textRows: InboxListRow[] = visibleThreads.map((thread) => {
      const ownerId = threadOwnerId(thread);
      const owner = staff.find((member) => member.id === ownerId);
      const unreadCount = threadUnreadCount(thread, openedAtFor(opens, crm.user.id, thread.key));
      const automated = threadIsAutomated(thread.messages);
      const chips = inboxChips({
        contact: thread.contact,
        job: thread.job,
        opportunity: thread.opportunity,
        automated,
      });
      return {
        key: thread.key,
        kind: "text" as const,
        title: textOf(thread.title) || "Unknown number",
        preview: textOf(thread.preview),
        at: thread.lastAt,
        queue: inboxQueue(thread, closed[thread.key]),
        unread: unreadCount > 0,
        unreadCount,
        code: textOf(thread.job?.code) || textOf(thread.opportunity?.code),
        chips,
        estimateNumber: estimateNumberFor(estimates, thread.jobId, thread.opportunityId),
        owner:
          shortStaffName(owner?.name) ||
          shortStaffName(thread.job?.salesRep) ||
          shortStaffName(thread.opportunity?.estimator),
        unassigned: threadIsUnassigned(thread),
        place:
          textOf(thread.job?.street) ||
          textOf(thread.opportunity?.street) ||
          textOf(thread.job?.name) ||
          textOf(thread.job?.code) ||
          textOf(thread.opportunity?.code),
      };
    });
    const webRows: InboxListRow[] = visibleWebChats.map((chat) => {
      const last = [...(chat.messages ?? [])].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || "")).at(-1);
      const queue = inboxQueue({ messages: chat.messages }, closed[`web:${chat.id}`]);
      const job = chat.jobId ? jobs.find((row) => row.id === chat.jobId) : undefined;
      return {
        key: `web:${chat.id}`,
        kind: "web" as const,
        title: textOf(chat.label) || "Website chat",
        preview: textOf(chat.preview) || "New website chat",
        at: chat.updatedAt || last?.createdAt || "",
        queue,
        unread: queue === "needs_reply",
        unreadCount: queue === "needs_reply" ? 1 : 0,
        code: textOf(job?.code),
        chips: inboxChips({ web: true, job, opportunity: null }),
        estimateNumber: "",
        owner: "",
        unassigned: true,
        place: textOf(job?.street) || textOf(job?.name) || textOf(job?.code),
      };
    });
    return [...textRows, ...webRows];
  }, [closed, crm.user.id, estimates, jobs, opens, staff, visibleThreads, visibleWebChats]);

  const decorated = useMemo(() => {
    const viewerPick = { staffId: viewerStaffId, name: viewerName };
    return visibleThreads.map((thread) => ({
      thread,
      mine: threadIsMine(thread, viewerPick),
      unread: threadUnreadCount(thread, openedAtFor(opens, crm.user.id, thread.key)) > 0,
      unassigned: threadIsUnassigned(thread),
      automated: threadIsAutomated(thread.messages),
    }));
  }, [crm.user.id, opens, viewerName, viewerStaffId, visibleThreads]);

  const listRows = useMemo(() => {
    const flags = new Map(decorated.map((row) => [row.thread.key, row]));
    return rows.filter((row) => {
      if (row.kind === "web") {
        return threadMatchesScope({
          scope,
          mine: false,
          unread: row.unread,
          unassigned: true,
          automatedOnly,
          automated: false,
        });
      }
      const flag = flags.get(row.key);
      if (!flag) return false;
      return threadMatchesScope({
        scope,
        mine: flag.mine,
        unread: flag.unread,
        unassigned: flag.unassigned,
        automatedOnly,
        automated: flag.automated,
      });
    });
  }, [automatedOnly, decorated, rows, scope]);

  const ordered = useMemo(() => {
    const needs = listRows.filter((row) => row.queue === "needs_reply").sort((a, b) => b.at.localeCompare(a.at));
    const waiting = listRows.filter((row) => row.queue === "waiting").sort((a, b) => b.at.localeCompare(a.at));
    return { needs, waiting, all: [...listRows].sort((a, b) => b.at.localeCompare(a.at)) };
  }, [listRows]);

  const unreadTotal = decorated.filter((row) => row.unread).length + visibleWebChats.filter((chat) => {
    const queue = inboxQueue({ messages: chat.messages }, closed[`web:${chat.id}`]);
    return queue === "needs_reply";
  }).length;
  const unassignedTotal =
    decorated.filter((row) => row.unassigned).length + visibleWebChats.length;

  const timeline = selected
    ? buildInboxTimeline({
        messages: selected.messages,
        emails,
        calls,
        activities,
        contactIds,
        phone: selected.phone,
        focusJobId,
        primaryJobId: selected.jobId,
        jobIds: relatedJobs.map((job) => job.id),
        opportunityIds: [
          ...new Set(
            [selected.opportunityId, panelOpportunity?.id, ...relatedJobs.map((job) => job.opportunityId)].filter(
              (id): id is string => Boolean(id),
            ),
          ),
        ],
        clientIds: activeContact?.clientId ? [activeContact.clientId] : [],
        channel,
      })
    : [];

  const openThread = useCallback(
    (key: string) => {
      const thread = threads.find((item) => item.key === key) ?? allThreads.find((item) => item.key === key);
      void crm.markThreadOpened(key);
      router.replace(messagesHref({ thread: key, contact: thread?.contactId, job: thread?.jobId }), { scroll: false });
    },
    [allThreads, crm, router, threads],
  );

  const openRow = useCallback(
    (row: InboxListRow) => {
      if (row.kind === "web") {
        setWebBody("");
        setSuggestions([]);
        router.replace(messagesHref({ thread: row.key }), { scroll: false });
        return;
      }
      openThread(row.key);
    },
    [openThread, router],
  );

  const markDone = useCallback(
    (key: string) => {
      if (!key) return;
      rememberClosed(key, new Date().toISOString());
      if (!key.startsWith("web:")) void crm.markThreadOpened(key);
    },
    [crm],
  );

  const activeKey = webChatId ? `web:${webChatId}` : showCompose ? "" : selected?.key ?? "";
  const doneKey = selected?.key || (webChatId ? `web:${webChatId}` : "");

  const personFromThread = useCallback(
    (threadKey: string): ComposePerson | null => {
      const thread = threads.find((item) => item.key === threadKey);
      if (!thread) return null;
      const place =
        textOf(thread.job?.street) ||
        textOf(thread.opportunity?.street) ||
        textOf(thread.job?.name) ||
        textOf(thread.preview);
      return {
        key: thread.key,
        name: textOf(thread.title) || "Unknown",
        detail: place,
        meta: formatInboxTime(thread.lastAt),
        contactId: thread.contactId || "",
        phone: thread.phone || "",
        jobId: thread.jobId || "",
        threadKey: thread.key,
      };
    },
    [threads],
  );

  const waitingPicks = useMemo(() => {
    return rows
      .filter((row) => row.kind === "text" && row.queue === "needs_reply")
      .slice(0, 4)
      .map((row) => personFromThread(row.key))
      .filter((person): person is ComposePerson => Boolean(person));
  }, [personFromThread, rows]);

  const schedulePicks = useMemo(() => {
    const today = localYmd(new Date(PAGE_OPENED_AT));
    const picks: ComposePerson[] = [];
    const seen = new Set<string>();
    for (const event of [...scheduleEvents].sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || ""))) {
      if (!event?.startsAt || localYmd(new Date(event.startsAt)) !== today) continue;
      const job = event.jobId ? jobs.find((item) => item.id === event.jobId) : undefined;
      const contact =
        (job?.primaryContactId ? contacts.find((item) => item.id === job.primaryContactId) : undefined) ||
        (event.clientId ? contacts.find((item) => item.clientId === event.clientId) : undefined);
      if (!contact?.id || seen.has(contact.id)) continue;
      seen.add(contact.id);
      const thread = threads.find(
        (item) => item.contactId === contact.id || (item.contactIds || []).includes(contact.id),
      );
      picks.push({
        key: `event:${event.id}`,
        name: contact.name || "Appointment",
        detail: textOf(job?.street) || textOf(event.location) || textOf(event.title),
        meta: formatTime(event.startsAt),
        contactId: contact.id,
        phone: contact.phone || "",
        jobId: job?.id || "",
        threadKey: thread?.key || "",
      });
      if (picks.length >= 4) break;
    }
    return picks;
  }, [contacts, jobs, scheduleEvents, threads]);

  const estimatePicks = useMemo(() => {
    const picks: ComposePerson[] = [];
    const seen = new Set<string>();
    const sent = estimates
      .filter((estimate) => estimate && !estimate.archivedAt && (estimate.status === "sent" || estimate.status === "viewed"))
      .sort((a, b) => (a.sentAt || a.createdAt || "").localeCompare(b.sentAt || b.createdAt || ""));
    for (const estimate of sent) {
      const job = estimate.jobId ? jobs.find((item) => item.id === estimate.jobId) : undefined;
      const contact =
        (estimate.contactId ? contacts.find((item) => item.id === estimate.contactId) : undefined) ||
        (job?.primaryContactId ? contacts.find((item) => item.id === job.primaryContactId) : undefined);
      if (!contact?.id || seen.has(contact.id)) continue;
      const thread = threads.find(
        (item) => item.contactId === contact.id || (item.contactIds || []).includes(contact.id),
      );
      const sentAt = estimate.sentAt || estimate.createdAt;
      const replied = thread?.messages.some(
        (message) => message.direction === "inbound" && sentAt && (message.createdAt || "") > sentAt,
      );
      if (replied) continue;
      seen.add(contact.id);
      picks.push({
        key: `estimate:${estimate.id}`,
        name: contact.name || "Estimate",
        detail: textOf(job?.street) || textOf(estimate.name) || textOf(estimate.number),
        meta: daysSinceLabel(sentAt, new Date(PAGE_OPENED_AT)),
        contactId: contact.id,
        phone: contact.phone || "",
        jobId: job?.id || estimate.jobId || "",
        threadKey: thread?.key || "",
      });
      if (picks.length >= 4) break;
    }
    return picks;
  }, [contacts, estimates, jobs, threads]);

  const toHits = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    if (!needle) return [] as ComposePerson[];
    const digits = needle.replace(/\D/g, "");
    const hits: ComposePerson[] = [];
    for (const contact of textable) {
      if (!contact?.id) continue;
      const related = jobsForPeople(jobs, opportunities, [contact.id]);
      const street = textOf(related[0]?.street);
      const code = textOf(related[0]?.code);
      const blob = `${contact.name || ""} ${contact.phone || ""} ${contact.email || ""} ${street} ${code}`.toLowerCase();
      const phoneHit = digits.length >= 3 && phoneKey(contact.phone).includes(digits);
      if (!blob.includes(needle) && !phoneHit) continue;
      const thread = threads.find(
        (item) =>
          item.contactId === contact.id ||
          (item.contactIds || []).includes(contact.id) ||
          phoneKey(item.phone) === phoneKey(contact.phone),
      );
      hits.push({
        key: `to:${contact.id}`,
        name: contact.name || formatPhone(contact.phone) || "Contact",
        detail: [formatPhone(contact.phone), street || code].filter(Boolean).join(" · "),
        meta: "",
        contactId: contact.id,
        phone: contact.phone || "",
        jobId: thread?.jobId || related[0]?.id || "",
        threadKey: thread?.key || "",
      });
      if (hits.length >= 6) break;
    }
    if (hits.length === 0 && looksLikePhone(pickerQuery)) {
      hits.push({
        key: `phone:${digits}`,
        name: formatPhone(pickerQuery) || pickerQuery,
        detail: "New number. A contact is created when they reply.",
        meta: "",
        contactId: "",
        phone: pickerQuery,
        jobId: "",
        threadKey: "",
      });
    }
    return hits;
  }, [jobs, opportunities, pickerQuery, textable, threads]);

  const composePicks = useMemo(
    () => [...waitingPicks, ...schedulePicks, ...estimatePicks],
    [estimatePicks, schedulePicks, waitingPicks],
  );
  const [pickIndex, setPickIndex] = useState(0);

  const openCompose = useCallback(() => {
    setDraftPhone("");
    setDraftContactId("");
    setPickerQuery("");
    setBody("");
    setReplyTo(null);
    router.replace(messagesHref({ compose: true }), { scroll: false });
  }, [router]);

  const closeCompose = useCallback(() => {
    setDraftPhone("");
    setDraftContactId("");
    setPickerQuery("");
    setBody("");
    setReplyTo(null);
    router.replace("/messages", { scroll: false });
  }, [router]);

  const choosePerson = useCallback(
    (person: ComposePerson) => {
      if (person.threadKey) {
        const thread = threads.find((item) => item.key === person.threadKey) ?? allThreads.find((item) => item.key === person.threadKey);
        void crm.markThreadOpened(person.threadKey);
        router.replace(
          messagesHref({ thread: person.threadKey, contact: person.contactId || thread?.contactId, job: person.jobId || thread?.jobId }),
          { scroll: false },
        );
        return;
      }
      setDraftContactId(person.contactId);
      setDraftPhone(person.phone ? formatPhoneInput(person.phone) : person.phone);
      setPickerQuery("");
      setBody("");
      router.replace(messagesHref({ compose: true, contact: person.contactId, job: person.jobId }), { scroll: false });
    },
    [allThreads, crm, router, threads],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const typing = isTypingTarget(event.target);
      const blankCompose = showCompose && !composeContact && !selected && !selectedWeb;
      if (blankCompose && !peopleOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCompose();
          return;
        }
        if (!typing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          setPickIndex((index) => {
            if (composePicks.length === 0) return 0;
            const delta = event.key === "ArrowDown" ? 1 : -1;
            return (index + delta + composePicks.length) % composePicks.length;
          });
          return;
        }
        if (!typing && event.key === "Enter" && composePicks[pickIndex]) {
          event.preventDefault();
          choosePerson(composePicks[pickIndex]);
          return;
        }
      }
      if (typing || peopleOpen) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "r" && key !== "e") return;
      event.preventDefault();
      if (key === "r") {
        composerRef.current?.focus();
        return;
      }
      if (key === "e") {
        markDone(doneKey);
        return;
      }
      const list = ordered.all;
      if (list.length === 0) return;
      const index = list.findIndex((row) => row.key === activeKey);
      const delta = key === "j" ? 1 : -1;
      const nextIndex =
        index === -1 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, index + delta));
      const next = list[nextIndex];
      if (next) openRow(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeKey,
    choosePerson,
    closeCompose,
    composeContact,
    composePicks,
    doneKey,
    markDone,
    openRow,
    ordered.all,
    peopleOpen,
    pickIndex,
    selected,
    selectedWeb,
    showCompose,
  ]);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!looksLikePhone(sendTo) || !text) return;
    setSending(true);
    try {
      const ok = await crm.sendTextMessage({
        to: sendTo,
        content: text,
        effect,
        replyToHandle: replyTo?.handle,
        jobId: jobHint || undefined,
        contactId: contactHint || undefined,
        name: selected?.contact?.name || composeContact?.name || queryContact?.name,
      });
      if (ok) {
        setBody("");
        setEffect("");
        setReplyTo(null);
        const key = conversationThreadKey({
          contactId: contactHint || composeContact?.id,
          phone: sendTo,
        });
        if (key) router.replace(messagesHref({ thread: key }), { scroll: false });
      }
    } finally {
      setSending(false);
    }
  }, [
    body,
    effect,
    replyTo?.handle,
    sendTo,
    crm,
    jobHint,
    contactHint,
    selected?.contact?.name,
    composeContact?.id,
    composeContact?.name,
    queryContact?.name,
    router,
  ]);

  const saveNote = useCallback(async () => {
    const text = body.trim();
    if (!text) return;
    const target = panelJob
      ? { entityType: "job" as const, entityId: panelJob.id }
      : selected?.opportunityId
        ? { entityType: "opportunity" as const, entityId: selected.opportunityId }
        : activeContact?.clientId
          ? { entityType: "client" as const, entityId: activeContact.clientId }
          : null;
    if (!target) return;
    setSending(true);
    try {
      await crm.addActivity({ ...target, type: "note", body: text });
      setBody("");
    } finally {
      setSending(false);
    }
  }, [activeContact?.clientId, body, crm, panelJob, selected?.opportunityId]);

  const requestReview = useCallback(() => {
    setChannel("texts");
    setBody(reviewRequestDraft(selected?.title || activeContact?.name));
    setDetailsOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, [activeContact?.name, selected?.title]);

  async function replyToWebsite() {
    const text = webBody.trim();
    if (!selectedWeb || !text) return;
    setWebSending(true);
    try {
      const response = await fetch("/api/chat/office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedWeb.id, body: text }),
      });
      const data = (await response.json()) as { ok?: boolean };
      if (data.ok) {
        setWebBody("");
        setSuggestions([]);
        const sent = {
          id: `local-${Date.now()}`,
          direction: "outbound" as const,
          body: text,
          createdAt: new Date().toISOString(),
        };
        setWebChats((current) =>
          current.map((chat) =>
            chat.id === selectedWeb.id
              ? {
                  ...chat,
                  preview: text,
                  messages: [...(Array.isArray(chat.messages) ? chat.messages : []), sent],
                  updatedAt: sent.createdAt,
                }
              : chat,
          ),
        );
      }
    } finally {
      setWebSending(false);
    }
  }

  async function suggestReply() {
    if (!selectedWeb) return;
    setSuggesting(true);
    try {
      const response = await fetch("/api/chat/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: selectedWeb.messages }),
      });
      const data = (await response.json()) as { replies?: string[] };
      setSuggestions(data.replies?.length ? data.replies : fallbackChatReplies());
    } catch {
      setSuggestions(fallbackChatReplies());
    } finally {
      setSuggesting(false);
    }
  }

  const react = useCallback(
    async (message: TextMessage, emoji: string) => {
      if (!message.handle || !looksLikePhone(sendTo) || sending) return;
      setSending(true);
      try {
        await crm.reactToText({
          to: sendTo,
          handle: message.handle,
          emoji,
          preview: message.body,
          jobId: jobHint || undefined,
          contactId: contactHint || undefined,
          name: selected?.contact?.name || composeContact?.name || queryContact?.name,
        });
      } finally {
        setSending(false);
      }
    },
    [sendTo, sending, crm, jobHint, contactHint, selected?.contact?.name, composeContact?.name, queryContact?.name],
  );

  const unsend = useCallback(
    async (message: TextMessage) => {
      if (!message.handle || !looksLikePhone(sendTo) || sending) return;
      if (!window.confirm("Unsend this text? It leaves the phone when Apple still allows it.")) return;
      setSending(true);
      try {
        await crm.unsendText({ to: sendTo, handle: message.handle });
      } finally {
        setSending(false);
      }
    },
    [sendTo, sending, crm],
  );

  useEffect(() => {
    if (selected?.key) void crm.markThreadOpened(selected.key);
    // `crm` is a new object whenever the book changes. Depending on it rewrote
    // this read receipt on every render, and that write storm pinned the database.
  }, [crm.markThreadOpened, selected?.key]);

  function chooseScope(next: InboxScope) {
    setScopeTouched(true);
    setScopeChoice(next);
  }

  const roleLabel = inboxRoleLabel({
    title: activeContact?.title,
    clientType: activeClient?.type,
    market: panelJob?.market || panelOpportunity?.market,
  });
  const noteTarget = Boolean(panelJob || selected?.opportunityId || activeContact?.clientId);
  const mailboxHref = mailHref({
    contact: contactHint,
    job: panelJob?.id ?? jobHint,
    email: activeContact?.email,
    compose: Boolean(activeContact?.email),
  });

  const blankCompose = showCompose && !composeContact && !selected && !selectedWeb;
  const showRail = !blankCompose && Boolean(selected || composeContact || selectedWeb);
  const draftLabel = composeContact
    ? textOf(jobsForPeople(jobs, opportunities, [composeContact.id])[0]?.street) || formatPhone(composeContact.phone) || "no recipient yet"
    : "no recipient yet";
  const recipientName = textOf(selected?.title) || textOf(composeContact?.name) || "";
  const recipientPhone = selected?.phone || composeContact?.phone || draftPhone;
  const lastInbound = [...(selected?.messages ?? [])].reverse().find((message) => message.direction === "inbound")?.body || "";

  if (!crm.hydrated) return <LoadingScreen />;

  const jobContext = (
    <JobContext
      job={panelJob}
      opportunity={panelOpportunity}
      contactName={activeContact?.name || selected?.title}
      phone={recipientPhone}
      email={activeContact?.email}
      role={roleLabel}
      since={panelOpportunity?.createdAt || selected?.messages?.[0]?.createdAt}
      mailboxHref={mailboxHref}
      onReview={requestReview}
      canReview={looksLikePhone(sendTo) && !selectedWeb}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {crm.hydrateError ? (
        <div className="border-b px-4 py-3">
          <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
        </div>
      ) : null}
      {crm.messagesError ? (
        <div className="border-b px-4 py-3">
          <ErrorBanner message={crm.messagesError} onRetry={() => void crm.reload()} />
        </div>
      ) : null}
      <div className={cn(
        "grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(16.5rem,20rem)_minmax(0,1fr)]",
        showRail && "xl:grid-cols-[minmax(16.5rem,20rem)_minmax(0,1fr)_20rem]",
      )}>
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-b bg-background lg:border-r lg:border-b-0",
            conversationOpen && "hidden lg:flex",
          )}
        >
          <div className="border-b px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-heading text-xl font-medium">Inbox</h1>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-rose-100 text-rose-700 shadow-none hover:bg-rose-200"
                onClick={openCompose}
              >
                New message
              </Button>
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter conversations"
              aria-label="Filter conversations"
              className="mt-3 bg-muted/40"
            />
            <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Inbox filters">
              <Pill active={scope === "all"} onClick={() => chooseScope("all")}>
                All
              </Pill>
              <Pill active={scope === "mine"} onClick={() => chooseScope("mine")}>
                Mine
              </Pill>
              <Pill active={scope === "unread"} onClick={() => chooseScope("unread")}>
                Unread {unreadTotal}
              </Pill>
              <Pill active={scope === "unassigned"} onClick={() => chooseScope("unassigned")}>
                Unassigned {unassignedTotal}
              </Pill>
              <Pill active={automatedOnly} onClick={() => setAutomatedOnly((value) => !value)}>
                Automated
              </Pill>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {showCompose ? (
              <button
                type="button"
                className="flex w-full items-start gap-2.5 bg-rose-50 px-3 py-2.5 text-left"
                onClick={openCompose}
              >
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <Pencil className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">New message</span>
                  <span className="mt-0.5 block truncate text-xs text-rose-700">
                    Draft · {draftLabel}
                  </span>
                </span>
              </button>
            ) : null}
            {ordered.all.length === 0 && !showCompose ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                {threads.length === 0 && visibleWebChats.length === 0
                  ? crm.messagesError
                    ? "Texts could not load."
                    : crm.messagesReady
                      ? "No conversations yet. Text a homeowner — replies land here and on the job."
                      : "Loading texts…"
                  : scope === "mine"
                    ? "Nothing assigned to you. All still has the rest of the inbox."
                    : "No conversations match."}
              </p>
            ) : (
              <RecordErrorBoundary
                fallbackTitle="The thread list could not open"
                fallbackDescription="The conversation is still on the right."
              >
                {ordered.all.map((row) => (
                  <ThreadRow key={row.key} row={row} active={row.key === activeKey && !showCompose} onOpen={openRow} />
                ))}
              </RecordErrorBoundary>
            )}
          </div>
        </aside>

        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-background",
            !conversationOpen && "hidden lg:flex",
          )}
        >
          {blankCompose ? (
            <NewMessageDesk
              query={pickerQuery}
              onQuery={setPickerQuery}
              hits={toHits}
              waiting={waitingPicks}
              schedule={schedulePicks}
              estimates={estimatePicks}
              activeIndex={pickIndex}
              onChoose={(person) => {
                setPickIndex(composePicks.findIndex((item) => item.key === person.key));
                choosePerson(person);
              }}
              onClose={closeCompose}
            />
          ) : (
          <>
          <header className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b px-3 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label="Back to threads"
              onClick={() => router.replace("/messages", { scroll: false })}
            >
              <ChevronLeft />
            </Button>
            {selectedWeb ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{textOf(selectedWeb.label) || "Website chat"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selectedWeb.channel === "text"
                    ? "Website chat · asked to continue by text"
                    : "Website chat · replies stay in this box"}
                </p>
              </div>
            ) : webChatId ? (
              <div className="min-w-0">
                <p className="text-sm font-semibold">Website chat</p>
                <p className="text-xs text-muted-foreground">Loading this conversation.</p>
              </div>
            ) : showCompose || selected ? (
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">To</span>
                  <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-muted py-1 pr-1 pl-1">
                    <Avatar className="size-6">
                      <AvatarFallback className={cn("text-[10px]", avatarTone(recipientName))}>
                        {initials(recipientName) || "#"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm font-medium">{recipientName || "New number"}</span>
                    {recipientPhone ? (
                      <span className="truncate text-sm text-muted-foreground">{formatPhone(recipientPhone)}</span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full p-1 text-muted-foreground hover:bg-background"
                      aria-label="Remove recipient"
                      onClick={openCompose}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                  {selected ? (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground"
                      onClick={() => setPeopleOpen(true)}
                    >
                      Add
                    </button>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1.5">
                    {selected ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => markDone(selected.key)}
                      >
                        Mark done
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="xl:hidden"
                      onClick={() => setDetailsOpen(true)}
                    >
                      Job
                    </Button>
                  </span>
                </div>
                {relatedJobs.length > 0 ? (
                  <label className="mt-3 block text-xs text-muted-foreground">
                    Attach to job
                    <select
                      className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground"
                      value={focusJobId || panelJob?.id || relatedJobs[0]?.id || ""}
                      onChange={(event) => setJobFocus(event.target.value)}
                    >
                      {relatedJobs.map((job) => (
                        <option key={job.id} value={job.id}>
                          {[job.street || job.name || "Job", job.name, inboxStage({ job, opportunity: opportunities.find((item) => item.id === job.opportunityId) }).current]
                            .filter(Boolean)
                            .join(" · ")}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold">Inbox</p>
                <p className="text-xs text-muted-foreground">Pick a conversation or start a new text.</p>
              </div>
            )}
          </header>

          {selected && !selectedWeb ? (
            <>
              <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2" role="tablist" aria-label="Conversation channel">
                {CHANNELS.map((item) => (
                  <Pill key={item.id} active={channel === item.id} onClick={() => setChannel(item.id)}>
                    {item.label}
                  </Pill>
                ))}
              </div>
            </>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
            {selectedWeb ? (
              <RecordErrorBoundary
                fallbackTitle="This conversation could not open"
                fallbackDescription="The other threads are still in the list."
              >
                <WebsiteConversation key={selectedWeb.id} messages={selectedWeb.messages} />
              </RecordErrorBoundary>
            ) : webChatId ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Loading this website chat.</p>
            ) : showCompose || !selected ? (
              threads.length === 0 && !showCompose ? (
                crm.messagesError ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">Texts could not load.</p>
                ) : crm.messagesReady ? (
                  <div className="px-4 py-4">
                    <EmptyState
                      title="No texts yet"
                      description="Send a message to a homeowner. Incoming replies land here and on the job record as communication."
                      action={
                        <Button type="button" onClick={openCompose}>
                          Write a text
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <p className="px-4 py-4 text-sm text-muted-foreground">Loading texts…</p>
                )
              ) : (
                <p className="px-4 py-4 text-sm text-muted-foreground">
                  Replies attach to the matching job automatically and show up on that job’s activity.
                </p>
              )
            ) : (
              <RecordErrorBoundary
                fallbackTitle="This conversation could not open"
                fallbackDescription="The other threads are still in the list."
              >
                {selected.messages.length > 0 ? (
                  <p className="px-4 pt-3 text-center">
                    <span className="rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                      Continuing your existing thread with {firstName(textOf(selected.title)) || "them"}
                    </span>
                  </p>
                ) : null}
                <DeskTimeline
                  entries={timeline}
                  channel={channel}
                  contactName={textOf(selected.title)}
                  onReact={(message, emoji) => void react(message, emoji)}
                  onReply={(message) =>
                    setReplyTo({
                      handle: message.handle,
                      preview: (message.body || "").replace(/\s+/g, " ").slice(0, 80),
                    })
                  }
                  onUnsend={(message) => void unsend(message)}
                />
              </RecordErrorBoundary>
            )}
          </div>

          {selectedWeb ? (
            <form
              className="space-y-2 border-t bg-background p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void replyToWebsite();
              }}
            >
              {suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      className="max-w-full rounded-full border bg-background px-3 py-1 text-left text-xs hover:bg-muted"
                      onClick={() => setWebBody(reply)}
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Textarea
                  ref={composerRef}
                  value={webBody}
                  onChange={(event) => setWebBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void replyToWebsite();
                    }
                  }}
                  placeholder="Reply in the website chat…"
                  rows={2}
                  className="min-h-[44px] resize-none"
                />
                <div className="flex shrink-0 flex-col gap-2 self-end">
                  <Button type="button" variant="outline" disabled={suggesting} onClick={() => void suggestReply()}>
                    {suggesting ? "Thinking…" : "Suggest"}
                  </Button>
                  <Button type="submit" disabled={webSending || !webBody.trim()}>
                    {webSending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </form>
          ) : channel === "email" && selected ? (
            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Replies to mail go out from the mailbox.</p>
              <Button nativeButton={false} variant="outline" size="sm" render={<Link href={mailboxHref} />}>
                <Mail data-icon="inline-start" />
                Open mailbox
              </Button>
            </div>
          ) : channel === "calls" && selected ? (
            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <p className="text-xs text-muted-foreground">Calls on this number show up in the thread.</p>
              {selected.phone ? (
                <Button nativeButton={false} size="sm" render={<a href={`tel:${selected.phone}`} />}>
                  <Phone data-icon="inline-start" />
                  Call
                </Button>
              ) : null}
            </div>
          ) : selected || composeContact ? (
            <form
              className="border-t bg-background p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (channel === "notes") void saveNote();
                else void send();
              }}
            >
              {channel !== "notes" && selected ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply.id}
                      type="button"
                      className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-muted"
                      onClick={() => setBody(quickReplyBody(reply.id, recipientName))}
                    >
                      {reply.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {replyTo && channel !== "notes" ? (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                  <span className="min-w-0 truncate">Reply to “{replyTo.preview || "message"}”</span>
                  <button type="button" className="shrink-0 text-muted-foreground" onClick={() => setReplyTo(null)}>
                    Cancel
                  </button>
                </div>
              ) : null}
              <div className="rounded-xl border bg-background px-3 py-2">
                <Textarea
                  ref={composerRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (channel === "notes") void saveNote();
                      else void send();
                    }
                  }}
                  placeholder={
                    channel === "notes"
                      ? "Internal note — the customer will not see this"
                      : "Write a text…"
                  }
                  rows={3}
                  className="min-h-[72px] resize-none border-0 px-0 shadow-none focus-visible:ring-0"
                />
                <div className="mt-1 flex items-center gap-2">
                  {channel !== "notes" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100"
                      onClick={() => setBody(cassioTextDraft(recipientName, lastInbound))}
                    >
                      Draft with {ASSISTANT_NAME}
                    </Button>
                  ) : null}
                  {channel !== "notes" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button type="button" variant="ghost" size="sm" aria-label="Message effect" />}
                      >
                        ···
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => setEffect("")}>No effect</DropdownMenuItem>
                        {IMESSAGE_EFFECTS.map((item) => (
                          <DropdownMenuItem key={item.id} onClick={() => setEffect(item.id)}>
                            {item.label}
                            {effect === item.id ? " · on" : ""}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {channel === "notes"
                      ? noteTarget
                        ? "Hidden from the customer."
                        : "Open a job before saving a note."
                      : smsSegmentLabel(body)}
                  </span>
                  <Button
                    type="submit"
                    className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                    disabled={
                      sending ||
                      !body.trim() ||
                      (channel === "notes" ? !noteTarget : !looksLikePhone(sendTo))
                    }
                  >
                    {sending ? "Saving…" : channel === "notes" ? "Save note" : "Send"}
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
          </>
          )}
        </section>

        <aside className={cn("min-h-0 flex-col overflow-y-auto border-l bg-background", showRail ? "hidden xl:flex" : "hidden")}>
          {jobContext}
        </aside>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle>{panelJob?.code || panelOpportunity?.code || "Job"}</SheetTitle>
            <SheetDescription>Details for this conversation.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{jobContext}</div>
        </SheetContent>
      </Sheet>

      {selected && peopleOpen ? (
        <RecordErrorBoundary fallbackTitle="People could not open" fallbackDescription="This conversation is still here.">
          <ThreadPeopleSheet
            open={peopleOpen}
            onOpenChange={(open) => {
              setPeopleOpen(open);
              if (!open) setPeopleQuery("");
            }}
            thread={selected}
            query={peopleQuery}
            onQueryChange={setPeopleQuery}
          />
        </RecordErrorBoundary>
      ) : null}
    </div>
  );
}

function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        active
          ? "border-neutral-950 bg-neutral-950 text-white"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function NewMessageDesk({
  query,
  onQuery,
  hits,
  waiting,
  schedule,
  estimates,
  activeIndex,
  onChoose,
  onClose,
}: {
  query: string;
  onQuery: (value: string) => void;
  hits: ComposePerson[];
  waiting: ComposePerson[];
  schedule: ComposePerson[];
  estimates: ComposePerson[];
  activeIndex: number;
  onChoose: (person: ComposePerson) => void;
  onClose: () => void;
}) {
  const cards = [
    { title: "Waiting on your reply", hint: "They texted last", people: waiting },
    { title: "On today's schedule", hint: "Appointments on your calendar", people: schedule },
    { title: "Estimates with no answer", hint: "Sent, no reply yet", people: estimates },
  ];
  let cursor = 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/20">
      <div className="flex items-center justify-between border-b bg-background px-5 py-4">
        <h2 className="font-heading text-lg font-medium">New message</h2>
        <button
          type="button"
          aria-label="Close new message"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="relative">
          <label className="flex items-center gap-3 rounded-xl border-2 border-primary bg-background px-3">
            <span className="text-sm text-muted-foreground">To</span>
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Name, street address, job #, or phone number"
              aria-label="To"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          {hits.length > 0 ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border bg-background shadow-md">
              {hits.map((person) => (
                <button
                  key={person.key}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                  onClick={() => onChoose(person)}
                >
                  <Avatar className="size-7">
                    <AvatarFallback className={cn("text-[10px]", avatarTone(person.name))}>
                      {initials(person.name) || "#"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{person.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{person.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Not in the CRM yet? Type their number. A contact is created when they reply.
        </p>
        <div className="mt-5 grid gap-3 xl:grid-cols-3">
          {cards.map((card) => {
            const start = cursor;
            cursor += card.people.length;
            return (
              <section key={card.title} className="rounded-xl border bg-background p-3">
                <h3 className="text-sm font-semibold">{card.title}</h3>
                <p className="text-xs text-muted-foreground">{card.hint}</p>
                <div className="mt-3 space-y-1">
                  {card.people.length === 0 ? (
                    <p className="py-4 text-xs text-muted-foreground">Nothing here right now.</p>
                  ) : (
                    card.people.map((person, index) => (
                      <button
                        key={person.key}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left",
                          activeIndex === start + index && "bg-rose-50",
                        )}
                        onClick={() => onChoose(person)}
                      >
                        <Avatar className="size-8">
                          <AvatarFallback className={cn("text-[10px]", avatarTone(person.name))}>
                            {initials(person.name) || "#"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{person.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{person.detail}</span>
                        </span>
                        {person.meta ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {person.meta}
                          </span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="border-t bg-background px-5 py-2 text-center text-[11px] text-muted-foreground">
        ↑ ↓ to move · ↵ to pick · Esc to discard
      </p>
    </div>
  );
}

function ThreadRow({
  row,
  active,
  onOpen,
}: {
  row: InboxListRow;
  active: boolean;
  onOpen: (row: InboxListRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left",
        active ? "bg-rose-50" : "hover:bg-muted/40",
      )}
    >
      <Avatar className="mt-0.5">
        <AvatarFallback className={cn("text-xs", avatarTone(row.title))}>
          {initials(row.title) || "#"}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", row.unread ? "font-semibold" : "font-medium")}>{row.title}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatInboxTime(row.at)}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.preview}</span>
        {row.place ? (
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {row.unread ? <span className="size-1.5 shrink-0 rounded-full bg-rose-500" /> : null}
            <span className="truncate">{row.place}</span>
            {row.chips.includes("Automated") ? <MetaChip>Automated</MetaChip> : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border bg-background px-1.5 py-px text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function ConversationScroll({ scrollKey, children }: { scrollKey: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [scrollKey]);
  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {children}
    </div>
  );
}

function DeskTimeline({
  entries,
  channel,
  contactName,
  onReact,
  onReply,
  onUnsend,
}: {
  entries: InboxTimelineEntry[];
  channel: InboxChannel;
  contactName: string;
  onReact: (message: TextMessage, emoji: string) => void;
  onReply: (message: TextMessage) => void;
  onUnsend: (message: TextMessage) => void;
}) {
  const last = entries[entries.length - 1];
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-sm text-muted-foreground">
        {channel === "all" ? "Nothing in this conversation yet." : `Nothing in ${channel} yet.`}
      </p>
    );
  }
  return (
    <ConversationScroll scrollKey={`${entries.length}:${last?.id ?? ""}`}>
      <div className="space-y-3 px-4 py-4">
        {entries.map((entry, index) => {
          const prior = entries[index - 1];
          const day = formatInboxDay(entry.at);
          const showDay = !prior || formatInboxDay(prior.at) !== day;
          return (
            <div key={entry.id}>
              {showDay ? (
                <p className="py-2 text-center text-xs text-muted-foreground">{day}</p>
              ) : null}
              <TimelineEntry
                entry={entry}
                contactName={contactName}
                onReact={onReact}
                onReply={onReply}
                onUnsend={onUnsend}
              />
            </div>
          );
        })}
      </div>
    </ConversationScroll>
  );
}

function TimelineEntry({
  entry,
  contactName,
  onReact,
  onReply,
  onUnsend,
}: {
  entry: InboxTimelineEntry;
  contactName: string;
  onReact: (message: TextMessage, emoji: string) => void;
  onReply: (message: TextMessage) => void;
  onUnsend: (message: TextMessage) => void;
}) {
  if (entry.kind === "call") {
    const duration = formatCallDuration(entry.durationSeconds);
    const label =
      entry.status === "logged"
        ? "Call logged"
        : entry.status === "missed"
          ? "Missed call"
          : entry.direction === "outbound"
            ? "Outbound call"
            : "Inbound call";
    return (
      <div className="flex justify-center">
        <p className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs shadow-sm">
          <Phone className="size-3.5 text-muted-foreground" />
          {[label, duration, formatTime(entry.at)].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  }
  if (entry.kind === "note") {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-sm">
        <p className="text-[11px] text-amber-800">
          Internal note · {shortStaffName(entry.author) || "Office"} · {formatTime(entry.at)} · not visible to customer
        </p>
        <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
      </div>
    );
  }
  if (entry.kind === "email") {
    return (
      <div>
        <div className="rounded-xl border bg-background px-3 py-2.5 shadow-sm">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{entry.message.subject || "Email"}</p>
              <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">
                {entry.message.snippet || entry.message.bodyText}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-1 text-right text-[10px] text-muted-foreground">
          Email · {formatTime(entry.at)}
        </p>
      </div>
    );
  }
  return (
    <TextBubble message={entry.message} contactName={contactName} onReact={onReact} onReply={onReply} onUnsend={onUnsend} />
  );
}

function TextBubble({
  message,
  contactName,
  onReact,
  onReply,
  onUnsend,
}: {
  message: TextMessage;
  contactName: string;
  onReact: (message: TextMessage, emoji: string) => void;
  onReply: (message: TextMessage) => void;
  onUnsend: (message: TextMessage) => void;
}) {
  const outbound = message.direction === "outbound";
  const automated = isAutomatedText(message);
  const tracker = firstHttpUrl(message.body);
  const showTracker = Boolean(tracker) && (onMyWayText(message) || /arrival|track/i.test(`${message.body} ${message.detail}`));
  const body = showTracker ? message.body.replace(tracker, "").replace(/\s{2,}/g, " ").trim() : message.body;
  const tone = textStatusTone(message.status);
  return (
    <div className={cn("group max-w-[36rem]", outbound ? "ml-auto" : "mr-auto")}>
      {outbound && (automated || onMyWayText(message) || message.jobId) ? (
        <p className="mb-1 flex flex-wrap justify-end gap-1 text-[10px] text-muted-foreground">
          {automated ? <span className="rounded-full bg-background px-1.5 py-0.5">Automated</span> : null}
          {onMyWayText(message) ? <span className="rounded-full bg-background px-1.5 py-0.5">On-my-way</span> : null}
        </p>
      ) : null}
      <div
        className={cn(
          "rounded-2xl px-3 py-2.5 text-sm",
          outbound ? "bg-neutral-950 text-white" : "border bg-background text-foreground shadow-sm",
        )}
      >
        {message.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.mediaUrl} alt="" className="mb-2 max-h-56 w-full rounded-md object-cover" />
        ) : null}
        {addonNote(message) ? (
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{addonNote(message)}</p>
        ) : null}
        {body ? (
          <p className={cn("whitespace-pre-wrap", message.status === "unsent" && "italic opacity-70")}>{body}</p>
        ) : null}
        {showTracker ? (
          <a
            href={tracker}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-start gap-2 rounded-xl bg-background px-3 py-2 text-foreground shadow-sm"
          >
            <MapPin className="mt-0.5 size-4 text-rose-600" />
            <span>
              <span className="block text-sm font-medium">Live arrival tracker</span>
              <span className="block text-xs text-muted-foreground">{hostOf(tracker)}</span>
            </span>
          </a>
        ) : null}
        {message.handle && message.status !== "unsent" && message.kind !== "reaction" ? (
          <div className={cn("mt-1 flex flex-wrap items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100", outbound && "text-white/80")}>
            {IMESSAGE_TAPBACKS.map((tap) => (
              <button
                key={tap.emoji}
                type="button"
                aria-label={tap.label}
                title={tap.label}
                className="rounded-full px-1 text-sm leading-none hover:bg-black/5"
                onClick={() => onReact(message, tap.emoji)}
              >
                {tap.emoji}
              </button>
            ))}
            <button type="button" className="rounded px-1 text-[10px] tracking-wide text-muted-foreground uppercase" onClick={() => onReply(message)}>
              Reply
            </button>
            {outbound ? (
              <button type="button" className="rounded px-1 text-[10px] tracking-wide text-muted-foreground uppercase" onClick={() => onUnsend(message)}>
                Unsend
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1 text-[10px]",
          outbound ? "text-right" : "text-left",
          tone === "bad" ? "text-destructive" : tone === "ok" && outbound ? "text-emerald-600" : "text-muted-foreground",
        )}
      >
        {outbound
          ? `${formatTime(message.createdAt)} · ${textStatusLabel(message.status, message.direction)}`
          : `${contactName || "Homeowner"} · ${formatTime(message.createdAt)}`}
      </p>
    </div>
  );
}

function WebsiteConversation({ messages }: { messages: WebsiteChatThread["messages"] }) {
  const rows = Array.isArray(messages) ? messages.filter((message) => message && typeof message === "object") : [];
  const last = rows[rows.length - 1];
  if (rows.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        Waiting for the visitor. Replies you send here appear in their chat box.
      </p>
    );
  }
  return (
    <ConversationScroll scrollKey={`${rows.length}:${last?.id ?? ""}`}>
      <div className="space-y-3 px-4 py-4">
        {rows.map((message, index) => {
          const prior = rows[index - 1];
          const day = formatInboxDay(message.createdAt);
          const showDay = !prior || formatInboxDay(prior.createdAt) !== day;
          const outbound = message.direction === "outbound";
          return (
            <div key={message.id || index}>
              {showDay ? (
                <p className="py-2 text-center text-xs text-muted-foreground">{day}</p>
              ) : null}
              <div className={cn("max-w-[36rem] rounded-2xl px-3 py-2.5 text-sm", outbound ? "ml-auto bg-rose-50" : "mr-auto border bg-background shadow-sm")}>
                <p className="whitespace-pre-wrap">{messageText(message.body)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {outbound ? "Reply" : "Visitor"} · {formatTime(message.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </ConversationScroll>
  );
}

function JobContext({
  job,
  opportunity,
  contactName,
  phone,
  email,
  role,
  since,
  mailboxHref,
  onReview,
  canReview,
}: {
  job: Job | null;
  opportunity: Opportunity | undefined;
  contactName?: string;
  phone?: string;
  email?: string;
  role?: string;
  since?: string;
  mailboxHref: string;
  onReview: () => void;
  canReview: boolean;
}) {
  const crm = useCrm();
  const book = crm.book;
  const estimates = Array.isArray(book?.estimates) ? book.estimates : [];
  const lines = Array.isArray(book?.estimateLines) ? book.estimateLines : [];
  const events = Array.isArray(book?.events) ? book.events : [];
  const photos = Array.isArray(book?.photos) ? book.photos : [];
  const insurance = Array.isArray(book?.jobInsurance) ? book.jobInsurance : [];
  const address = inboxAddress(job, opportunity);
  const claim = job ? insurance.find((row) => row.jobId === job.id) : undefined;
  const jobEstimates = estimates
    .filter(
      (estimate) =>
        estimate &&
        !estimate.archivedAt &&
        ((job && estimate.jobId === job.id) || (opportunity && estimate.opportunityId === opportunity.id)),
    )
    .sort((a, b) => (b.sentAt || b.createdAt || "").localeCompare(a.sentAt || a.createdAt || ""));
  const sent = jobEstimates.find(
    (estimate) => estimate.status === "sent" || estimate.status === "viewed" || estimate.status === "accepted",
  );
  const draft = jobEstimates.find((estimate) => estimate.status === "draft");
  const inspected = Boolean(
    job &&
      events.some(
        (event) =>
          event.jobId === job.id && event.kind === "inspection" && event.startsAt <= PAGE_OPENED_AT,
      ),
  );
  const stage = inboxStage({
    job,
    opportunity,
    inspected,
    hasSentEstimate: Boolean(sent),
  });
  const upcoming = nextAppointment(events, job?.id);
  const jobPhotos = photos
    .filter((photo) => job && photo.jobId === job.id && !photo.deletedAt && photo.imageUrl)
    .sort((a, b) => (b.takenAt || "").localeCompare(a.takenAt || ""));
  const recentPhotos = jobPhotos.slice(0, 3);
  const rep = job?.salesRep || opportunity?.estimator || "";
  const money = (estimate: Estimate | undefined) => {
    if (!estimate) return "";
    try {
      const total = estimateTotals(
        estimate,
        lines.filter((line) => line.estimateId === estimate.id),
      ).total;
      return total > 0 ? formatCurrency(total) : "";
    } catch {
      return "";
    }
  };
  const sentMoney = money(sent) || (job && job.contractValue > 0 ? formatCurrency(job.contractValue) : "");
  const mapQuery = [address.street, address.line2].filter((part) => part && part !== "No address yet").join(", ");
  const estimateHref = (sent || draft) ? `/estimates/${(draft || sent)!.id}` : job ? jobPaperHref(job.id) : "/estimates";

  const who = contactName || "This contact";
  const sinceText = sinceLabel(since);
  const progress = jobProgress(job?.status);
  const photoLabel = jobPhotos.length
    ? `${jobPhotos.length} from ${inspected ? "inspection" : "the job"}`
    : "None yet";

  return (
    <div className="px-4 py-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarFallback className={cn("text-sm", avatarTone(who))}>{initials(who) || "#"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-medium">{who}</h2>
          <p className="text-xs text-muted-foreground">
            {[role || "Homeowner", sinceText ? `since ${sinceText}` : ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {phone ? (
          <Button nativeButton={false} variant="outline" size="sm" render={<a href={`tel:${phone}`} />}>
            Call
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            Call
          </Button>
        )}
        <Button nativeButton={false} variant="outline" size="sm" render={<Link href={mailboxHref} />}>
          Email
        </Button>
        <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/calendar" />}>
          Schedule
        </Button>
      </div>
      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Mobile</dt>
          <dd>{phone ? formatPhone(phone) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">{email || "—"}</dd>
        </div>
      </dl>
      {job || opportunity ? (
        <div className="mt-5 rounded-xl border p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{address.street}</p>
            {job ? (
              <Link href={jobRecordHref(job.id)} className="shrink-0 text-xs text-primary">
                Open job
              </Link>
            ) : opportunity ? (
              <Link href={`/opportunities/${opportunity.id}`} className="shrink-0 text-xs text-primary">
                Open lead
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {[address.line2 || job?.city, job?.name || opportunity?.name, rep ? `Rep: ${rep}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="bg-neutral-900" style={{ width: `${Math.max(8, progress - 12)}%` }} />
            <div className="bg-primary" style={{ width: "12%" }} />
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stage</dt>
              <dd className="text-right">{stage.current}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Next</dt>
              <dd className="text-right">{appointmentLabel(upcoming) || stage.next || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Claim</dt>
              <dd>{claim?.claimNumber?.trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Photos</dt>
              <dd>
                {job ? (
                  <Link href={jobRecordHref(job.id, { tab: "photos" })} className="text-primary">
                    {photoLabel}
                  </Link>
                ) : (
                  photoLabel
                )}
              </dd>
            </div>
            {sentMoney ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Estimate</dt>
                <dd>
                  <Link href={estimateHref} className="text-primary">
                    {sentMoney}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
          {recentPhotos.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {recentPhotos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={photo.id} src={photo.imageUrl} alt={photo.caption || ""} className="h-14 w-full rounded-md bg-muted object-cover" />
              ))}
            </div>
          ) : null}
          {mapQuery ? (
            <a href={mapsUrl(mapQuery)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <MapPin className="size-3.5" />
              Map
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">No job is attached yet. Replies still land on the contact when a number matches.</p>
      )}
      {canReview ? (
        <button type="button" className="mt-4 text-sm text-primary" onClick={onReview}>
          Request a review
        </button>
      ) : null}
      {stage.detail ? <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{stage.detail}</p> : null}
      <p className="mt-4 text-xs text-muted-foreground">
        {firstName(who) || who}&apos;s replies land on this job&apos;s activity feed.
      </p>
    </div>
  );
}

function sinceLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function messageText(body: unknown) {
  return typeof body === "string" ? body : "";
}

function chatThreads(value: unknown): WebsiteChatThread[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (chat): chat is WebsiteChatThread =>
      Boolean(chat) && typeof chat === "object" && typeof (chat as WebsiteChatThread).id === "string",
  );
}

function addonNote(message: TextMessage) {
  const detail = messageText(message.detail);
  if (!detail) return "";
  if (message.kind === "effect" || message.kind === "reply" || message.kind === "poll" || message.kind === "edit") {
    return detail;
  }
  if (message.kind === "rename" || message.kind === "membership") return detail;
  return "";
}

function ThreadPeopleSheet({
  open,
  onOpenChange,
  thread,
  query,
  onQueryChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: MessageThread;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const crm = useCrm();
  const book = crm.book;
  const crew = useMemo(
    () => implicitThreadCrew(thread, book.staff, book.companyProfiles, book.jobs, book.opportunities),
    [book.companyProfiles, book.jobs, book.opportunities, book.staff, thread],
  );
  const added = useMemo(
    () => addedThreadPeople(thread.key, book.companyProfiles, book.messageThreadMembers),
    [book.companyProfiles, book.messageThreadMembers, thread.key],
  );
  const addable = useMemo(() => {
    const people = addableThreadPeople(
      thread,
      book.staff,
      book.companyProfiles,
      book.messageThreadMembers,
      book.jobs,
      book.opportunities,
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => {
      if ((person.name || "").toLowerCase().includes(needle)) return true;
      return (person.title || "").toLowerCase().includes(needle);
    });
  }, [book.companyProfiles, book.jobs, book.messageThreadMembers, book.opportunities, book.staff, query, thread]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>People</SheetTitle>
          <SheetDescription>Crew on this job stay here. Anyone you add can see this conversation.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">On this job</p>
            {crew.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No one is attached to this job yet.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {crew.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 py-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">{initials(person.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{person.title || "On this job"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Added</p>
            {added.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No one has been added to this thread.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {added.map(({ member, profile }) => (
                  <li key={member.id} className="flex items-center gap-3 py-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">{initials(profile.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{profile.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{profile.title || "Added"}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${profile.name}`}
                      onClick={() => void crm.removeThreadMember(thread.key, profile.id)}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Add people</p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search the company"
                className="pl-8"
              />
            </div>
            {addable.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Everyone who can be added is already here.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {addable.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted/50"
                      onClick={() => void crm.addThreadMember(thread.key, person.id)}
                    >
                      <Avatar size="sm">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials(person.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{person.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {person.title || "Add to conversation"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

