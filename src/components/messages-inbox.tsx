"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronLeft,
  CheckSquare,
  ChevronsUpDown,
  Eye,
  FileText,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Search,
  SlidersHorizontal,
  Square,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { PhoneInput } from "@/components/phone-input";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { RecordErrorBoundary } from "@/components/record-error-boundary";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { formatInboxTime, formatPhone, formatTime, initials } from "@/lib/format";
import { firstName, formatPhoneInput, looksLikePhone } from "@/lib/phone";
import { mailHref } from "@/lib/job-emails";
import { jobRecordHref } from "@/lib/job-record";
import { estimateTotals } from "@/lib/estimate-totals";
import { uploadViaApi } from "@/lib/storage/client-upload";
import { cn } from "@/lib/utils";
import { readNextStepFacts } from "@/lib/next-steps";
import { fallbackChatReplies, type WebsiteChatThread } from "@/lib/website-chat";
import { IMESSAGE_EFFECTS, IMESSAGE_TAPBACKS } from "@/lib/imessage";
import {
  buildInboxTimeline,
  firstHttpUrl,
  formatCallDuration,
  formatInboxDay,
  hostOf,
  inboxAddress,
  inboxChips,
  inboxMoney,
  inboxNextAction,
  inboxQueue,
  inboxRoleLabel,
  inboxSeen,
  inboxSlashQuery,
  inboxTextTemplates,
  inboxViewers,
  isAutomatedText,
  jobsForPeople,
  nextAppointment,
  onMyWayText,
  reviewRequestDraft,
  shortStaffName,
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
};

const FILTERS: { id: InboxChannel; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "messages", label: "Messages" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
];

const SCOPES: { id: InboxScope; label: string }[] = [
  { id: "mine", label: "My conversations" },
  { id: "all", label: "All conversations" },
  { id: "unread", label: "Unread" },
  { id: "unassigned", label: "Unassigned" },
];

type ComposerMode = "text" | "email" | "note";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [webChats, setWebChats] = useState<WebsiteChatThread[]>([]);
  const [webBody, setWebBody] = useState("");
  const [webSending, setWebSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [scopeChoice, setScopeChoice] = useState<InboxScope>("mine");
  const [scopeTouched, setScopeTouched] = useState(false);
  const [automatedOnly, setAutomatedOnly] = useState(false);
  const closed = useSyncExternalStore(subscribeClosed, getClosedSnapshot, () => EMPTY_CLOSED);
  const [calls, setCalls] = useState<InboxCall[]>([]);
  const [channel, setChannel] = useState<InboxChannel>("all");
  const [composer, setComposer] = useState<ComposerMode>("text");
  const [delivery, setDelivery] = useState<"text" | "email">("text");
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [jobFocus, setJobFocus] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
  const jobHint = queryJob?.id ?? selected?.jobId ?? attachedJobId;
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
    setComposer("text");
    setDelivery("text");
    setSlash(null);
    setTemplatesOpen(false);
    setMentionOpen(false);
    setDetailsOpen(false);
  }

  const mineAvailable = useMemo(
    () => threads.some((thread) => threadIsMine(thread, { staffId: viewerStaffId, name: viewerName })),
    [threads, viewerName, viewerStaffId],
  );
  const scope: InboxScope =
    !scopeTouched && scopeChoice === "mine" && threads.length > 0 && !mineAvailable ? "all" : scopeChoice;

  const focusJobId = jobFocus && jobFocus !== "all" ? jobFocus : null;
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
    const all = [...listRows].sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title));
    return { all };
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
        signatureEvents: Array.isArray(book?.estimateSignatureEvents) ? book.estimateSignatureEvents : [],
        estimates,
        payments: Array.isArray(book?.payments) ? book.payments : [],
        invoices: Array.isArray(book?.invoices) ? book.invoices : [],
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || peopleOpen) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k" && key !== "r" && key !== "e" && key !== "n") return;
      event.preventDefault();
      if (key === "n") {
        if (!webChatId) {
          setComposer((mode) => (mode === "note" ? delivery : "note"));
          window.setTimeout(() => composerRef.current?.focus(), 0);
        }
        return;
      }
      if (key === "r") {
        setComposer("text");
        setDelivery("text");
        window.setTimeout(() => composerRef.current?.focus(), 0);
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
  }, [activeKey, delivery, doneKey, markDone, openRow, ordered.all, peopleOpen, webChatId]);

  const openCompose = useCallback(() => {
    setDraftPhone(formatPhoneInput(queryContact?.phone ?? ""));
    setDraftContactId(queryContact?.id ?? "");
    setBody("");
    router.replace(messagesHref({ compose: true, contact: queryContact?.id, job: queryJob?.id }), { scroll: false });
  }, [queryContact?.id, queryContact?.phone, queryJob?.id, router]);

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
        setSlash(null);
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
      setSlash(null);
    } finally {
      setSending(false);
    }
  }, [activeContact?.clientId, body, crm, panelJob, selected?.opportunityId]);

  const requestReview = useCallback(() => {
    setComposer("text");
    setDelivery("text");
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

  const pickerPeople = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    const digits = pickerQuery.replace(/\D/g, "");
    return textable.filter((contact) => {
      if (!needle) return true;
      if ((contact.name || "").toLowerCase().includes(needle)) return true;
      if ((contact.title || "").toLowerCase().includes(needle)) return true;
      if (digits.length >= 3 && phoneKey(contact.phone).includes(digits)) return true;
      return false;
    });
  }, [pickerQuery, textable]);

  function chooseScope(next: InboxScope) {
    setScopeTouched(true);
    setScopeChoice(next);
  }

  const ownerId = selected ? threadOwnerId(selected) : activeContact?.ownerStaffId || "";
  const ownerStaff = staff.find((member) => member.id === ownerId);
  const ownerLabel = shortStaffName(ownerStaff?.name) || (selected && !threadIsUnassigned(selected) ? "Owner" : "Unassigned");
  const roleLabel = inboxRoleLabel({
    title: activeContact?.title,
    clientType: activeClient?.type,
    market: panelJob?.market || panelOpportunity?.market,
  });
  const jobCountLabel =
    relatedJobs.length === 0
      ? panelOpportunity
        ? "New lead"
        : "No jobs"
      : relatedJobs.length === 1
        ? "1 job"
        : `${relatedJobs.length} jobs`;
  const noteTarget = Boolean(panelJob || selected?.opportunityId || activeContact?.clientId);
  const mailboxHref = mailHref({
    contact: contactHint,
    job: panelJob?.id ?? jobHint,
    email: activeContact?.email,
    compose: Boolean(activeContact?.email),
  });
  const threadPeople = (() => {
    if (!selected) return [];
    const crew = implicitThreadCrew(selected, staff, profiles, jobs, opportunities);
    const added = addedThreadPeople(selected.key, profiles, members).map((row) => row.profile);
    const byId = new Map<string, { id: string; name: string }>();
    for (const person of [...crew, ...added]) {
      const name = textOf(person?.name).trim();
      if (!person?.id || !name) continue;
      byId.set(person.id, { id: person.id, name });
    }
    return [...byId.values()];
  })();
  const viewerDirectory = profiles
    .filter((person) => person?.id && textOf(person.name).trim())
    .map((person) => ({ id: person.id, name: person.name }));
  const viewing = inboxViewers({
    opens,
    people: viewerDirectory.length > 0 ? viewerDirectory : threadPeople,
    threadKey: selected?.key ?? "",
    selfProfileId: crm.user.id,
  });
  const seen = inboxSeen({
    opens,
    people: threadPeople,
    threadKey: selected?.key ?? "",
  });
  const scopeLabel = SCOPES.find((item) => item.id === scope)?.label ?? "My conversations";
  const viewerLabel = viewing[0] ? shortStaffName(viewing[0].name) : "";
  const sendingAs = shortStaffName(crm.effectiveStaff?.name || crm.user.name) || "you";
  const recipientName = textOf(selected?.title || activeContact?.name).trim();
  const greetingName = recipientName ? firstName(recipientName) : "";
  const textTemplates = inboxTextTemplates(recipientName);
  const slashTemplates = slash
    ? textTemplates.filter((item) => item.label.toLowerCase().includes(slash.query.toLowerCase()))
    : [];
  const mentionPeople = staff
    .filter((member) => member.name?.trim())
    .sort((a, b) => a.name.localeCompare(b.name));

  function writeBody(next: string, cursor: number) {
    setBody(next);
    setSlash(composer === "note" || delivery === "email" ? null : inboxSlashQuery(next, cursor));
    window.setTimeout(() => {
      const node = composerRef.current;
      node?.focus();
      node?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  function insertAtCursor(snippet: string) {
    const node = composerRef.current;
    const start = node?.selectionStart ?? body.length;
    const end = node?.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${snippet}${body.slice(end)}`;
    writeBody(next, start + snippet.length);
  }

  function applyTemplate(templateBody: string) {
    if (slash) {
      const node = composerRef.current;
      const cursor = node?.selectionStart ?? body.length;
      const next = `${body.slice(0, slash.start)}${templateBody}${body.slice(cursor)}`;
      writeBody(next, slash.start + templateBody.length);
    } else {
      const gap = body && !/\s$/.test(body) ? "\n" : "";
      insertAtCursor(`${gap}${templateBody}`);
    }
    setTemplatesOpen(false);
    setSlash(null);
  }

  async function attachFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error(`${file.name} is over 25 MB.`);
      return;
    }
    setAttaching(true);
    try {
      const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
      const ext = rawExt && rawExt.length <= 8 && /^[a-z0-9]+$/.test(rawExt) ? rawExt : "bin";
      const path = panelJob ? `${panelJob.id}/${crypto.randomUUID()}.${ext}` : `${crypto.randomUUID()}.${ext}`;
      const uploaded = await uploadViaApi(panelJob ? "job-files" : "company-files", file, path, file.name);
      setBody((current) => {
        const gap = current && !/\s$/.test(current) ? "\n" : "";
        return `${current}${gap}${uploaded.publicUrl}`;
      });
      setSlash(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not attach that file.");
    } finally {
      setAttaching(false);
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  const jobContext = (
    <JobContext
      job={panelJob}
      opportunity={panelOpportunity}
      contactName={activeContact?.name || selected?.title}
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
      <div className="grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_20rem]">
        <aside
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-b bg-background lg:border-r lg:border-b-0",
            conversationOpen && "hidden lg:flex",
          )}
        >
          <div className="border-b px-3 py-3">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg font-medium">Inbox</h1>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  {scopeLabel}
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                  {SCOPES.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => chooseScope(item.id)}>
                      {item.label}
                      {item.id === "unread" ? ` · ${unreadTotal}` : ""}
                      {item.id === "unassigned" ? ` · ${unassignedTotal}` : ""}
                      {scope === item.id ? <Check className="ml-auto size-3.5" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type="button"
                size="icon"
                className="ml-auto bg-[#9a6244] text-white hover:bg-[#855438]"
                aria-label="New message"
                onClick={openCompose}
              >
                <Pencil />
              </Button>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search conversations"
                className="bg-muted/40 pr-8 pl-8"
              />
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger
                  className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                  aria-label="Filter conversations"
                >
                  <SlidersHorizontal className="size-3.5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2">
                  <button
                    type="button"
                    aria-pressed={automatedOnly}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                      automatedOnly ? "bg-muted" : "hover:bg-muted",
                    )}
                    onClick={() => setAutomatedOnly((value) => !value)}
                  >
                    Automated only
                    {automatedOnly ? <Check className="size-3.5" /> : null}
                  </button>
                  <Link
                    href={mailHref()}
                    className="mt-1 flex rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Open mailbox
                  </Link>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {ordered.all.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                {threads.length === 0 && visibleWebChats.length === 0
                  ? crm.messagesError
                    ? "Texts could not load."
                    : crm.messagesReady
                      ? "No conversations yet. Text a homeowner — replies land here and on the job."
                      : "Loading texts…"
                    : scope === "mine"
                    ? "Nothing assigned to you. Switch to All conversations for the rest of the inbox."
                    : "No conversations match."}
              </p>
            ) : (
              <RecordErrorBoundary
                fallbackTitle="The thread list could not open"
                fallbackDescription="The conversation is still on the right."
              >
                {ordered.all.map((row) => (
                  <ThreadRow key={row.key} row={row} active={row.key === activeKey} onOpen={openRow} />
                ))}
              </RecordErrorBoundary>
            )}
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            J / K to move · R to reply · N for note · E to close
          </p>
        </aside>

        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-background",
            !conversationOpen && "hidden lg:flex",
          )}
        >
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
            ) : showCompose ? (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">New message</p>
                <p className="truncate text-xs text-muted-foreground">
                  {composeContact
                    ? `${composeContact.name} · ${formatPhone(composeContact.phone)}`
                    : "Pick someone in the book, or type a mobile number"}
                </p>
              </div>
            ) : selected ? (
              <>
                <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-2">
                  <Avatar>
                    <AvatarFallback className="bg-[#eceae6] text-foreground">
                      {initials(textOf(selected.title)) || "#"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{textOf(selected.title) || "Unknown number"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatPhone(selected.phone)} · {roleLabel} · {jobCountLabel}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {viewerLabel ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ece7f8] py-1 pr-2.5 pl-1 text-xs text-[#5c4d86]">
                      <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#ddd4f3] text-[9px] font-semibold">
                        {initials(viewing[0]?.name) || "·"}
                      </span>
                      {viewerLabel} is viewing
                    </span>
                  ) : null}
                  {selected.phone ? (
                    <Button nativeButton={false} variant="outline" size="sm" render={<a href={`tel:${selected.phone}`} />}>
                      <Phone data-icon="inline-start" />
                      Call
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button type="button" variant="outline" size="sm" disabled={!activeContact} />}
                    >
                      Owner: {ownerLabel}
                      <ChevronDown data-icon="inline-end" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-72 min-w-44 overflow-y-auto">
                      {staff
                        .filter((member) => member.name?.trim())
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((member) => (
                          <DropdownMenuItem
                            key={member.id}
                            onClick={() => {
                              if (!activeContact) return;
                              void crm.updateContact(activeContact.id, { ownerStaffId: member.id });
                            }}
                          >
                            {member.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="People on this conversation"
                    onClick={() => setPeopleOpen(true)}
                  >
                    <UserPlus />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-neutral-950 text-white hover:bg-neutral-800"
                    onClick={() => markDone(selected.key)}
                  >
                    Mark done
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="xl:hidden"
                    onClick={() => setDetailsOpen(true)}
                  >
                    Job
                  </Button>
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold">Inbox</p>
                <p className="text-xs text-muted-foreground">Pick a conversation or start a new text.</p>
              </div>
            )}
          </header>

          {selected && !selectedWeb && relatedJobs.length > 1 ? (
            <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2">
              <Pill active={focusJobId == null} onClick={() => setJobFocus("all")}>
                All jobs
              </Pill>
              {relatedJobs.map((job) => (
                <Pill key={job.id} active={focusJobId === job.id} onClick={() => setJobFocus(job.id)}>
                  <span className="max-w-[16rem] truncate">
                    {job.code ? `${job.code} · ` : ""}
                    {job.street || job.name || "Job"}
                  </span>
                </Pill>
              ))}
            </div>
          ) : null}
          {selected && !selectedWeb ? (
            <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2" role="tablist" aria-label="Conversation channel">
              {FILTERS.map((item) => (
                <Pill key={item.id} active={channel === item.id} onClick={() => setChannel(item.id)}>
                  {item.label}
                </Pill>
              ))}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f7f6f4]">
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
                <DeskTimeline
                  entries={timeline}
                  channel={channel}
                  contactName={textOf(selected.title)}
                  seen={seen.seen}
                  unseen={seen.unseen}
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
          ) : (
            <form
              className="bg-[#f7f6f4] px-3 pt-1 pb-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (composer === "note") void saveNote();
                else if (delivery === "text") void send();
              }}
            >
              {showCompose || !selected ? (
                <div className="mb-2 space-y-2">
                  <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger
                      className={cn(buttonVariants({ variant: "outline" }), "h-8 w-full justify-between font-normal")}
                    >
                      <span className={cn("truncate", !composeContact && "text-muted-foreground")}>
                        {composeContact ? textOf(composeContact.name) || "Contact" : "Choose a contact"}
                      </span>
                      <ChevronsUpDown className="opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[var(--anchor-width)] p-0" side="bottom">
                      <Command shouldFilter={false}>
                        <CommandInput placeholder="Search the book" value={pickerQuery} onValueChange={setPickerQuery} />
                        <CommandList>
                          <CommandEmpty>No one with a mobile number matches.</CommandEmpty>
                          <CommandGroup>
                            {pickerPeople.map((contact) => (
                              <CommandItem
                                key={contact.id}
                                value={`${contact.id} ${contact.name} ${contact.phone}`}
                                onSelect={() => {
                                  setDraftContactId(contact.id);
                                  setDraftPhone(formatPhoneInput(contact.phone));
                                  setPickerOpen(false);
                                  setPickerQuery("");
                                }}
                              >
                                <span className="min-w-0 truncate">{contact.name}</span>
                                <span className="ml-auto text-xs text-muted-foreground">{formatPhone(contact.phone)}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <PhoneInput
                    value={draftPhone}
                    onValueChange={(value) => {
                      setDraftPhone(value);
                      const match = contactForPhone(contacts, value);
                      setDraftContactId(match?.id ?? "");
                    }}
                    placeholder="Mobile number"
                  />
                </div>
              ) : null}
              <div className="rounded-lg border bg-background">
                <div className="flex items-center px-2.5 pt-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground">
                      {composer === "note"
                        ? "Internal note"
                        : delivery === "email"
                          ? activeContact?.email
                            ? `Email · ${activeContact.email}`
                            : "Email"
                          : looksLikePhone(sendTo)
                            ? `Text · ${formatPhone(sendTo)}`
                            : "Text"}
                      <ChevronDown className="size-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                      <DropdownMenuItem
                        onClick={() => {
                          setDelivery("text");
                          setComposer("text");
                        }}
                      >
                        Text
                        {composer !== "note" && delivery === "text" ? <Check className="ml-auto size-3.5" /> : null}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setDelivery("email");
                          setComposer("email");
                          setSlash(null);
                        }}
                      >
                        Email
                        {delivery === "email" && composer !== "note" ? <Check className="ml-auto size-3.5" /> : null}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>iMessage effect</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setEffect("")}>
                        None
                        {effect ? null : <Check className="ml-auto size-3.5" />}
                      </DropdownMenuItem>
                      {IMESSAGE_EFFECTS.map((item) => (
                        <DropdownMenuItem key={item.id} onClick={() => setEffect(item.id)}>
                          {item.label}
                          {effect === item.id ? <Check className="ml-auto size-3.5" /> : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {replyTo && composer !== "note" && delivery === "text" ? (
                  <div className="mx-2.5 mt-2 flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                    <span className="min-w-0 truncate">Reply to “{replyTo.preview || "message"}”</span>
                    <button type="button" className="shrink-0 text-muted-foreground" onClick={() => setReplyTo(null)}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                {delivery === "email" && composer !== "note" ? (
                  <p className="px-2.5 pt-2 text-xs text-muted-foreground">Replies to mail go out from the mailbox.</p>
                ) : null}
                {slash ? (
                  <div className="mx-2.5 mt-2 overflow-hidden rounded-md border">
                    {slashTemplates.length ? (
                      slashTemplates.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyTemplate(item.body)}
                        >
                          {item.label}
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">No templates</p>
                    )}
                  </div>
                ) : null}
                <Textarea
                  ref={composerRef}
                  value={body}
                  onChange={(event) => {
                    const next = event.target.value;
                    const cursor = event.target.selectionStart ?? next.length;
                    setBody(next);
                    setSlash(composer === "note" || delivery === "email" ? null : inboxSlashQuery(next, cursor));
                  }}
                  onKeyDown={(event) => {
                    if (slash && event.key === "Escape") {
                      event.preventDefault();
                      setSlash(null);
                      return;
                    }
                    if (slash && event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (slashTemplates[0]) applyTemplate(slashTemplates[0].body);
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (composer === "note") void saveNote();
                      else if (delivery === "text") void send();
                    }
                  }}
                  placeholder={
                    composer === "note"
                      ? greetingName
                        ? `Internal note about ${greetingName} — they will not see this`
                        : "Internal note — the customer will not see this"
                      : delivery === "email"
                        ? "Mail goes out from the mailbox"
                        : greetingName
                          ? `Write a text to ${greetingName}... (type / for templates)`
                          : "Write a text... (type / for templates)"
                  }
                  rows={2}
                  disabled={delivery === "email" && composer !== "note"}
                  className="min-h-16 resize-none border-0 bg-transparent px-2.5 shadow-none focus-visible:ring-0 disabled:opacity-60"
                />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-2">
                  <button
                    type="button"
                    aria-pressed={composer === "note"}
                    onClick={() => {
                      setComposer((mode) => (mode === "note" ? delivery : "note"));
                      setSlash(null);
                      composerRef.current?.focus();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {composer === "note" ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
                    Note
                  </button>
                  <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
                    <PopoverTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-foreground">
                      <FileText className="size-3.5" />
                      Templates
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 p-1">
                      {textTemplates.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyTemplate(item.body)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    disabled={attaching}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Paperclip className="size-3.5" />
                    Attach
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void attachFile(file);
                    }}
                  />
                  <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
                    <PopoverTrigger className="inline-flex items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-foreground">
                      <AtSign className="size-3.5" />
                      Mention
                    </PopoverTrigger>
                    <PopoverContent align="start" className="max-h-64 w-56 overflow-y-auto p-1">
                      {mentionPeople.length ? (
                        mentionPeople.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              insertAtCursor(`@${shortStaffName(member.name)} `);
                              setMentionOpen(false);
                            }}
                          >
                            {shortStaffName(member.name)}
                          </button>
                        ))
                      ) : (
                        <p className="px-2 py-1.5 text-xs text-muted-foreground">No teammates yet</p>
                      )}
                    </PopoverContent>
                  </Popover>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sending as {sendingAs}</span>
                    {composer !== "note" && delivery === "email" ? (
                      <Button
                        nativeButton={false}
                        size="sm"
                        className="bg-[#9a6244] text-white hover:bg-[#855438]"
                        render={<Link href={mailboxHref} />}
                      >
                        Open mail
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        size="sm"
                        title={composer === "note" && !noteTarget ? "Open a job before saving a note" : undefined}
                        className="bg-[#9a6244] text-white hover:bg-[#855438]"
                        disabled={
                          sending ||
                          attaching ||
                          (composer === "note" ? !body.trim() || !noteTarget : !body.trim() || !looksLikePhone(sendTo))
                        }
                      >
                        {attaching
                          ? "Attaching…"
                          : sending
                            ? composer === "note"
                              ? "Saving…"
                              : "Sending…"
                            : composer === "note"
                              ? "Save note"
                              : "Send text"}
                      </Button>
                    )}
                  </span>
                </div>
              </div>
            </form>
          )}
        </section>

        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l bg-background xl:flex">
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

function ThreadRow({
  row,
  active,
  onOpen,
}: {
  row: InboxListRow;
  active: boolean;
  onOpen: (row: InboxListRow) => void;
}) {
  const owner = row.owner ? `Owner: ${row.owner}` : row.unassigned ? "Unassigned" : "";
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        "flex w-full items-start gap-2.5 border-l-[3px] px-3 py-3 text-left",
        active ? "border-[#9a6244] bg-[#faf7f4]" : "border-transparent hover:bg-muted/40",
      )}
    >
      <Avatar className="mt-0.5">
        <AvatarFallback className="bg-[#eceae6] text-[11px] text-foreground">
          {initials(row.title) || "#"}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("min-w-0 truncate text-sm", row.unread ? "font-semibold" : "font-medium")}>{row.title}</span>
          {row.unread ? <span className="size-1.5 shrink-0 rounded-full bg-rose-500" aria-label="Unread" /> : null}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatInboxTime(row.at)}</span>
        </span>
        <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.preview}</span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {row.code ? <span className="truncate">{row.code}</span> : null}
          {owner ? <span className="truncate">{owner}</span> : null}
        </span>
      </span>
    </button>
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
  seen,
  unseen,
  onReact,
  onReply,
  onUnsend,
}: {
  entries: InboxTimelineEntry[];
  channel: InboxChannel;
  contactName: string;
  seen: Array<{ id: string; name: string }>;
  unseen: Array<{ id: string; name: string }>;
  onReact: (message: TextMessage, emoji: string) => void;
  onReply: (message: TextMessage) => void;
  onUnsend: (message: TextMessage) => void;
}) {
  const last = entries[entries.length - 1];
  const empty =
    channel === "all"
      ? "Nothing in this conversation yet."
      : channel === "messages"
        ? "No messages in this conversation yet."
        : channel === "notes"
          ? "No internal notes yet."
          : channel === "activity"
            ? "No activity on this conversation yet."
            : `Nothing in ${channel} yet.`;
  if (entries.length === 0) {
    return <p className="px-4 py-8 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ConversationScroll scrollKey={`${entries.length}:${last?.id ?? ""}:${seen.length}`}>
      <div className="space-y-3 px-4 py-4">
        {entries.map((entry, index) => {
          const prior = entries[index - 1];
          const day = formatInboxDay(entry.at);
          const showDay = !prior || formatInboxDay(prior.at) !== day;
          return (
            <div key={entry.id}>
              {showDay ? (
                <p className="py-2 text-center text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  {day}
                </p>
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
        {seen.length > 0 ? <SeenBy seen={seen} unseen={unseen} /> : null}
      </div>
    </ConversationScroll>
  );
}

function SeenBy({
  seen,
  unseen,
}: {
  seen: Array<{ id: string; name: string }>;
  unseen: Array<{ id: string; name: string }>;
}) {
  const missing = unseen.slice(0, 3).map((person) => shortStaffName(person.name)).filter(Boolean);
  return (
    <p className="flex items-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
      <span>Seen by</span>
      <span className="flex -space-x-1">
        {seen.slice(0, 4).map((person) => (
          <span
            key={person.id}
            title={person.name}
            className="inline-flex size-5 items-center justify-center rounded-full border border-[#f7f6f4] bg-[#eceae6] text-[9px] font-semibold text-foreground"
          >
            {initials(person.name)}
          </span>
        ))}
      </span>
      {missing.length > 0 ? <span>· not {missing.join(", ")}</span> : null}
    </p>
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
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="size-3.5" />
          {[label, duration, formatTime(entry.at)].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  }
  if (entry.kind === "event") {
    return (
      <div className="flex justify-center">
        <p className="inline-flex items-center gap-1.5 text-center text-xs text-muted-foreground">
          {entry.icon === "payment" ? (
            <Check className="size-3.5 shrink-0" />
          ) : entry.icon === "open" ? (
            <Eye className="size-3.5 shrink-0" />
          ) : (
            <span className="size-1.5 shrink-0 rounded-full bg-current" />
          )}
          <span>
            {entry.label}
            {entry.at ? ` · ${formatTime(entry.at)}` : ""}
          </span>
        </p>
      </div>
    );
  }
  if (entry.kind === "note") {
    return (
      <div className="rounded-lg border border-[#eadc9a] bg-[#f8f1d8] px-3 py-2.5 text-sm">
        <p className="text-[11px] text-[#8a7340]">
          {shortStaffName(entry.author) || "Office"} · Internal note · {formatTime(entry.at)} · not visible to customer
        </p>
        <NoteBody body={entry.body} />
      </div>
    );
  }
  if (entry.kind === "email") {
    const outbound = entry.message.direction !== "inbound";
    const who = shortStaffName(entry.message.fromName) || (outbound ? "Office" : contactName || "Homeowner");
    return (
      <div className={cn("max-w-[28rem]", outbound ? "ml-auto" : "mr-auto")}>
        <div className="rounded-xl border bg-background px-3 py-2.5 shadow-sm">
          <p className="text-sm font-medium">{entry.message.subject || "Email"}</p>
          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {entry.message.snippet || entry.message.bodyText}
          </p>
        </div>
        <p className={cn("mt-1 text-[11px] text-muted-foreground", outbound ? "text-right" : "text-left")}>
          {[who, "Email", formatTime(entry.at), outbound ? "Delivered" : ""].filter(Boolean).join(" · ")}
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
      {outbound && automated ? (
        <p className="mb-1 text-right">
          <span className="rounded-full bg-[#ece8f6] px-1.5 py-0.5 text-[10px] text-[#5c4d86]">Automation</span>
        </p>
      ) : null}
      <div
        className={cn(
          "rounded-2xl px-3 py-2.5 text-sm",
          automated ? "bg-[#ece8f6]" : outbound ? "bg-[#f6e4e0]" : "border bg-background shadow-sm",
        )}
      >
        {message.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.mediaUrl} alt="" className="mb-2 max-h-56 w-full rounded-md object-cover" />
        ) : null}
        {addonNote(message) ? (
          <p className="mb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{addonNote(message)}</p>
        ) : null}
        {body ? <MessageBody body={body} unsent={message.status === "unsent"} /> : null}
        {showTracker ? (
          <a
            href={tracker}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-start gap-2 rounded-xl bg-background px-3 py-2 shadow-sm"
          >
            <MapPin className="mt-0.5 size-4 text-rose-600" />
            <span>
              <span className="block text-sm font-medium">Live arrival tracker</span>
              <span className="block text-xs text-muted-foreground">{hostOf(tracker)}</span>
            </span>
          </a>
        ) : null}
        {message.handle && message.status !== "unsent" && message.kind !== "reaction" ? (
          <div className="mt-1 flex flex-wrap items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
        {[
          outbound ? (automated ? "Automation" : shortStaffName(message.createdBy) || "Office") : contactName || "Homeowner",
          "Text",
          formatTime(message.createdAt),
          outbound ? textStatusLabel(message.status, message.direction) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
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
                <p className="py-2 text-center text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  {day}
                </p>
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
  onReview,
  canReview,
}: {
  job: Job | null;
  opportunity: Opportunity | undefined;
  contactName?: string;
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
  const signatureEvents = Array.isArray(book?.estimateSignatureEvents) ? book.estimateSignatureEvents : [];
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
  const upcoming = nextAppointment(events, job?.id);
  const jobPhotos = photos.filter((photo) => job && photo.jobId === job.id && !photo.deletedAt && photo.imageUrl);
  const recentPhotos = jobPhotos
    .slice()
    .sort((a, b) => (b.takenAt || "").localeCompare(a.takenAt || ""))
    .slice(0, 3);
  const rep = job?.salesRep || opportunity?.estimator || "";
  const estimateValue = (() => {
    if (sent) {
      try {
        const total = estimateTotals(
          sent,
          lines.filter((line) => line.estimateId === sent.id),
        ).total;
        if (total > 0) return total;
      } catch {
        return job?.contractValue ?? 0;
      }
    }
    return job?.contractValue ?? 0;
  })();
  const views = sent ? signatureEvents.filter((event) => event.estimateId === sent.id && event.kind === "opened").length : 0;
  const estimateLabel =
    estimateValue > 0 ? `${inboxMoney(estimateValue)}${views > 0 ? " · viewed" : ""}` : "—";
  const invoices = Array.isArray(book?.invoices) ? book.invoices : [];
  const payments = Array.isArray(book?.payments) ? book.payments : [];
  const invoiceIds = new Set(invoices.filter((invoice) => job && invoice.jobId === job.id).map((invoice) => invoice.id));
  const paid = payments.reduce((sum, payment) => {
    if (!payment || payment.postingStatus === "rejected") return sum;
    const onJob = Boolean(job && (payment.jobId === job.id || (payment.invoiceId && invoiceIds.has(payment.invoiceId))));
    if (!onJob || !Number.isFinite(payment.amount)) return sum;
    return sum + payment.amount;
  }, 0);
  const blanks = [
    claim?.claimNumber?.trim() ? "" : "claim #",
    claim?.carrier?.trim() ? "" : "carrier",
    rep.trim() ? "" : "rep",
    upcoming ? "" : "appointment",
  ].filter(Boolean);
  const firstName = (contactName || "").trim().split(/\s+/)[0] || "";
  const next = inboxNextAction({
    job,
    opportunity,
    facts: readNextStepFacts({
      job,
      opportunity: opportunity ?? null,
      estimates,
      events,
      messages: book?.messages ?? [],
      activities: book?.activities ?? [],
      claimStatus: claim?.status ?? null,
      photoCount: jobPhotos.length,
      firstName,
      address: address.street,
    }),
  });
  const [moving, setMoving] = useState(false);
  const recordHref = job ? jobRecordHref(job.id) : opportunity ? `/opportunities/${opportunity.id}` : "/jobs";

  if (!job && !opportunity) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        No job is attached to this conversation yet. Replies still land on the contact when a number matches.
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {job ? "Job" : "Lead"}
        {job?.code || opportunity?.code ? ` · ${job?.code || opportunity?.code}` : ""}
      </p>
      <h2 className="mt-1 font-heading text-xl leading-tight font-medium">{address.street}</h2>
      {address.line2 ? <p className="mt-0.5 text-sm text-muted-foreground">{address.line2}</p> : null}
      {next ? (
        <div className="mt-4 rounded-xl border border-[#d7eadc] bg-[#e8f4ec] px-3 py-3">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#3d6b4a] uppercase">Next step</p>
          <p className="mt-1 text-sm font-medium">{next.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Stage: {next.stage}</p>
          {next.action && next.column && job ? (
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-[#1f6b45] text-white hover:bg-[#185838]"
              disabled={moving}
              onClick={() => {
                const column = next.column;
                if (!column) return;
                setMoving(true);
                void crm.moveWork(job.id, column).finally(() => setMoving(false));
              }}
            >
              {next.action}
            </Button>
          ) : next.action && next.stageMove && opportunity ? (
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-[#1f6b45] text-white hover:bg-[#185838]"
              disabled={moving}
              onClick={() => {
                const stage = next.stageMove;
                if (!stage) return;
                setMoving(true);
                void crm.moveOpportunity(opportunity.id, stage).finally(() => setMoving(false));
              }}
            >
              {next.action}
            </Button>
          ) : next.action ? (
            <Button
              nativeButton={false}
              size="sm"
              className="mt-3 bg-[#1f6b45] text-white hover:bg-[#185838]"
              render={<Link href={recordHref} />}
            >
              {next.action}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Estimate</p>
          {sent ? (
            <Link href={`/estimates/${sent.id}`} className="mt-0.5 block text-sm hover:underline">
              {estimateLabel}
            </Link>
          ) : (
            <p className="mt-0.5 text-sm">{estimateLabel}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Owner</p>
          <p className="mt-0.5 text-sm">{shortStaffName(rep) || "—"}</p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[10px] tracking-wide text-muted-foreground uppercase">Paid</p>
        <p className="mt-0.5 text-sm">{inboxMoney(paid)}</p>
      </div>
      {blanks.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          + {blanks.length} empty {blanks.length === 1 ? "field" : "fields"} ({blanks.join(", ")})
        </p>
      ) : null}
      <div className="mt-5 flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Photos</p>
        {job ? (
          <Link href={jobRecordHref(job.id, { tab: "photos" })} className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, index) => {
          const photo = recentPhotos[index];
          if (!photo) {
            return (
              <div
                key={`empty-photo-${index}`}
                className="flex aspect-square items-center justify-center rounded-md bg-[#f3f1ee] text-[11px] text-muted-foreground"
              >
                Photo
              </div>
            );
          }
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.imageUrl}
              alt={photo.caption || ""}
              className="aspect-square w-full rounded-md bg-muted object-cover"
            />
          );
        })}
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Quick actions</p>
        <div className="mt-2 flex flex-col gap-2">
          <Button nativeButton={false} variant="outline" className="w-full" render={<Link href="/calendar" />}>
            Book appointment
          </Button>
          <Button type="button" variant="outline" className="w-full" disabled={!canReview} onClick={onReview}>
            Request review
          </Button>
          <Button nativeButton={false} variant="outline" className="w-full" render={<Link href={recordHref} />}>
            {job ? "Open job" : "Open lead"}
          </Button>
        </div>
        {contactName ? <p className="sr-only">Conversation with {contactName}</p> : null}
      </div>
    </div>
  );
}

function MessageBody({ body, unsent }: { body: string; unsent?: boolean }) {
  const parts = body.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <p className={cn("whitespace-pre-wrap", unsent && "italic opacity-70")}>
      {parts.map((part, index) =>
        part.startsWith("http") ? (
          <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-[#9a6244] underline">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(@[A-Za-z][\w'.-]*(?:\s[A-Z]\.)?)/g);
  return (
    <p className="mt-1 whitespace-pre-wrap text-sm">
      {parts.map((part, index) =>
        part.startsWith("@") ? (
          <span key={index} className="font-medium text-[#9a6244]">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
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

