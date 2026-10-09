"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronsUpDown, Mail, MessageSquare, Phone, Search, Send, Smartphone, UserPlus, X } from "lucide-react";
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
import { InboxChannelSwitch } from "@/components/inbox-channel-switch";
import { InboxScroll } from "@/components/inbox-scroll";
import { useCrm } from "@/lib/crm-store";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  formatDate,
  formatInboxTime,
  formatMessageStamp,
  formatPhone,
  initials,
  sameLocalDay,
} from "@/lib/format";
import { formatPhoneInput, looksLikePhone } from "@/lib/phone";
import { mailHref } from "@/lib/job-emails";
import { cn } from "@/lib/utils";
import { fallbackChatReplies, type WebsiteChatThread } from "@/lib/website-chat";
import { IMESSAGE_EFFECTS, IMESSAGE_TAPBACKS } from "@/lib/imessage";
import type { TextMessage } from "@/lib/types";

export function MessagesInbox() {
  const crm = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  const book = crm.book;
  const allThreads = useMemo(
    () => messageThreads(book.messages, book.contacts, book.jobs, book.opportunities),
    [book.messages, book.contacts, book.jobs, book.opportunities],
  );
  const viewer = useMemo(() => {
    if (!crm.effectiveStaff) return null;
    return viewerFromStaff(
      crm.effectiveStaff,
      book.companyProfiles,
      crm.impersonatedStaff
        ? undefined
        : { profileId: crm.user.id, profileRole: crm.user.role },
    );
  }, [
    book.companyProfiles,
    crm.effectiveStaff,
    crm.impersonatedStaff,
    crm.user.id,
    crm.user.role,
  ]);
  const threads = useMemo(
    () =>
      viewer
        ? visibleInboxThreads(allThreads, viewer, {
            staff: book.staff,
            profiles: book.companyProfiles,
            members: book.messageThreadMembers,
            jobs: book.jobs,
            opportunities: book.opportunities,
          })
        : allThreads,
    [allThreads, book.companyProfiles, book.jobs, book.messageThreadMembers, book.opportunities, book.staff, viewer],
  );
  const textable = useMemo(() => contactsForTexting(book.contacts), [book.contacts]);

  const wantedJob = params.get("job");
  const wantedContact = params.get("contact");
  const wantedThread = params.get("thread");
  const composeParam = params.get("compose") === "1";

  const queryContact = useMemo(() => {
    if (wantedContact) return book.contacts.find((row) => row.id === wantedContact);
    if (wantedJob) {
      const job = book.jobs.find((row) => row.id === wantedJob);
      return job ? book.contacts.find((row) => row.id === job.primaryContactId) : undefined;
    }
    return undefined;
  }, [wantedContact, wantedJob, book.contacts, book.jobs]);

  const queryJob = useMemo(
    () => (wantedJob ? book.jobs.find((row) => row.id === wantedJob) : undefined),
    [wantedJob, book.jobs],
  );

  const queryThread = useMemo(() => {
    const resolved = resolveInboxThreadKey(wantedThread, book.contacts);
    if (resolved) return threads.find((thread) => thread.key === resolved);
    if (queryContact) {
      const key = conversationThreadKey({ contactId: queryContact.id, phone: queryContact.phone });
      return threads.find(
        (thread) =>
          thread.key === key ||
          thread.contactId === queryContact.id ||
          thread.contactIds.includes(queryContact.id) ||
          phoneKey(thread.phone) === phoneKey(queryContact.phone),
      );
    }
    return undefined;
  }, [wantedThread, queryContact, threads, book.contacts]);

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

  const showCompose =
    composeParam || (!wantedThread && Boolean(queryContact) && !queryThread);
  const webChatId = wantedThread?.startsWith("web:") ? wantedThread.slice(4) : "";
  const selectedWeb = webChats.find((chat) => chat.id === webChatId) ?? null;
  const selected = webChatId || showCompose
    ? null
    : queryThread ??
      (wantedThread ? threads.find((row) => row.key === wantedThread) : undefined) ??
      (wantedThread || wantedContact || wantedJob ? null : threads[0] ?? null);

  const visibleThreads = useMemo(() => filterMessageThreads(threads, query), [query, threads]);

  const composeContact =
    (draftContactId ? book.contacts.find((row) => row.id === draftContactId) : undefined) ??
    contactForPhone(book.contacts, draftPhone);
  const sendTo = selected?.phone || draftPhone;
  const jobHint =
    queryJob?.id ??
    selected?.jobId ??
    (composeContact ? jobForContact(book.jobs, book.opportunities, composeContact.id)?.id : "") ??
    "";
  const contactHint = queryContact?.id ?? selected?.contactId ?? composeContact?.id ?? "";
  const conversationOpen = showCompose || Boolean(selected) || Boolean(webChatId);
  const threadSeed = selected?.key ?? "";
  const [seenThread, setSeenThread] = useState(threadSeed);
  if (threadSeed !== seenThread) {
    setSeenThread(threadSeed);
    setReplyTo(null);
    setEffect("");
  }

  useEffect(() => {
    let cancelled = false;
    function load() {
      void fetch("/api/chat/office")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { chats?: WebsiteChatThread[] } | null) => {
          if (!cancelled && data?.chats) setWebChats(data.chats);
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

  const visibleWebChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return webChats;
    return webChats.filter(
      (chat) =>
        (chat.label || "").toLowerCase().includes(needle) ||
        (chat.preview || "").toLowerCase().includes(needle),
    );
  }, [query, webChats]);

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
              ? { ...chat, preview: text, messages: [...chat.messages, sent], updatedAt: sent.createdAt }
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

  const openThread = useCallback(
    (key: string) => {
      const thread = threads.find((item) => item.key === key) ?? allThreads.find((item) => item.key === key);
      void crm.markThreadOpened(key);
      router.replace(
        messagesHref({
          thread: key,
          contact: thread?.contactId,
          job: thread?.jobId,
        }),
        { scroll: false },
      );
    },
    [allThreads, crm, router, threads],
  );

  const openCompose = useCallback(() => {
    setDraftPhone(formatPhoneInput(queryContact?.phone ?? ""));
    setDraftContactId(queryContact?.id ?? "");
    setBody("");
    router.replace(
      messagesHref({
        compose: true,
        contact: queryContact?.id,
        job: queryJob?.id,
      }),
      { scroll: false },
    );
  }, [queryContact?.id, queryContact?.phone, queryJob?.id, router]);

  const send = useCallback(() => {
    const text = body.trim();
    if (!looksLikePhone(sendTo) || !text) return;
    const payload = {
      to: sendTo,
      content: text,
      effect,
      replyToHandle: replyTo?.handle,
      jobId: jobHint || undefined,
      contactId: contactHint || undefined,
      name: selected?.contact?.name || composeContact?.name || queryContact?.name,
    };
    setBody("");
    setEffect("");
    setReplyTo(null);
    const key = conversationThreadKey({
      contactId: contactHint || composeContact?.id,
      phone: sendTo,
    });
    if (key && (showCompose || !selected)) {
      router.replace(messagesHref({ thread: key }), { scroll: false });
    }
    void crm.sendTextMessage(payload)
      .then((ok) => {
        if (!ok) setBody((current) => (current.trim() ? current : text));
      })
      .catch(() => {
        setBody((current) => (current.trim() ? current : text));
      });
  }, [
    body,
    effect,
    replyTo?.handle,
    sendTo,
    crm,
    jobHint,
    contactHint,
    selected,
    showCompose,
    composeContact?.id,
    composeContact?.name,
    queryContact?.name,
    router,
  ]);

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
    [
      sendTo,
      sending,
      crm,
      jobHint,
      contactHint,
      selected?.contact?.name,
      composeContact?.name,
      queryContact?.name,
    ],
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

  // The store object changes when a thread is marked read. Depending on it
  // re-fires this effect and floods the network with the same write.
  const markOpened = crm.markThreadOpened;
  useEffect(() => {
    if (selected?.key) void markOpened(selected.key);
  }, [markOpened, selected?.key]);

  const pickerPeople = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    const digits = pickerQuery.replace(/\D/g, "");
    return textable.filter((contact) => {
      if (!needle) return true;
      if (contact.name.toLowerCase().includes(needle)) return true;
      if (contact.title.toLowerCase().includes(needle)) return true;
      if (digits.length >= 3 && phoneKey(contact.phone).includes(digits)) return true;
      return false;
    });
  }, [pickerQuery, textable]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {crm.hydrateError ? (
        <div className="border-b px-4 py-3">
          <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
        </div>
      ) : null}
      <div className="grid h-full min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden border-b bg-background lg:border-r lg:border-b-0",
            conversationOpen && "hidden lg:flex",
          )}
        >
          <div className="shrink-0 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Communication
                </p>
                <h1 className="font-heading text-lg font-medium">Inbox</h1>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={openCompose}>
                <MessageSquare data-icon="inline-start" />
                New text
              </Button>
            </div>
            <div className="mt-3">
              <InboxChannelSwitch />
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search names, jobs, or numbers"
                className="pl-8"
              />
            </div>
          </div>
          <InboxScroll>
            {visibleWebChats.length > 0 ? (
              <div className="border-b">
                <p className="px-4 pt-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Website
                </p>
                {visibleWebChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      setWebBody("");
                      setSuggestions([]);
                      router.replace(messagesHref({ thread: `web:${chat.id}` }), { scroll: false });
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left",
                      webChatId === chat.id ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <Avatar size="sm" className="mt-0.5">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {initials(chat.label || "") || "W"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{chat.label}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatInboxTime(chat.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {chat.preview || "New website chat"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {visibleThreads.length === 0 ? (
              visibleWebChats.length > 0 ? null : (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                {threads.length === 0
                  ? "No conversations yet. Text a homeowner — replies land here and on the job."
                  : "No threads match that search."}
              </p>
              )
            ) : (
              visibleThreads.map((thread) => (
                <ThreadRow
                  key={thread.key}
                  thread={thread}
                  active={!showCompose && selected?.key === thread.key}
                  unreadCount={threadUnreadCount(
                    thread,
                    openedAtFor(book.messageThreadOpens, crm.user.id, thread.key),
                  )}
                  onOpen={openThread}
                />
              ))
            )}
          </InboxScroll>
        </aside>

        <section
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            !conversationOpen && "hidden lg:flex",
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b px-3 py-3 sm:px-4">
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
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selectedWeb.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedWeb.channel === "text"
                      ? "Website chat · asked to continue by text"
                      : "Website chat · replies stay in this box"}
                  </p>
                </div>
                {selectedWeb.jobId ? (
                  <Button
                    nativeButton={false}
                    variant="outline"
                    size="sm"
                    render={<Link href={`/jobs?job=${selectedWeb.jobId}`} />}
                  >
                    Open lead
                  </Button>
                ) : null}
              </>
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
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials(selected.title) || "#"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatPhone(selected.phone)}
                    {selected.job ? ` · ${selected.job.name}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="People on this conversation"
                    onClick={() => setPeopleOpen(true)}
                  >
                    <UserPlus />
                  </Button>
                  {selected.contact?.email ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={
                        <Link
                          href={mailHref({
                            contact: selected.contactId,
                            job: selected.jobId,
                            email: selected.contact.email,
                          })}
                        />
                      }
                    >
                      <Mail />
                      Mail
                    </Button>
                  ) : null}
                  {selected.phone ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<a href={`tel:${selected.phone}`} />}
                    >
                      <Phone />
                      Call
                    </Button>
                  ) : null}
                  {selected.jobId ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link href={`/jobs?job=${selected.jobId}`} />}
                    >
                      Open job
                    </Button>
                  ) : selected.contactId ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link href={`/contacts?contact=${selected.contactId}`} />}
                    >
                      Open contact
                    </Button>
                  ) : queryJob ? (
                    <Button
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      render={<Link href={`/jobs?job=${queryJob.id}`} />}
                    >
                      Open job
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="min-w-0">
                <p className="text-sm font-semibold">Inbox</p>
                <p className="text-xs text-muted-foreground">Pick a conversation or start a new text.</p>
              </div>
            )}
          </header>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col bg-muted/20",
              !selectedWeb && (showCompose || !selected) ? "overflow-y-auto px-4 py-4" : "overflow-hidden",
            )}
          >
            {selectedWeb ? (
              <WebsiteConversation key={selectedWeb.id} messages={selectedWeb.messages} />
            ) : webChatId ? (
              <p className="text-sm text-muted-foreground">Loading this website chat.</p>
            ) : showCompose || !selected ? (
              threads.length === 0 && !showCompose ? (
                <EmptyState
                  title="No texts yet"
                  description="Send a message to a homeowner. Incoming replies land here and on the job record as communication."
                  action={
                    <Button type="button" onClick={openCompose}>
                      Write a text
                    </Button>
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Replies attach to the matching job automatically and show up on that job’s activity.
                </p>
              )
            ) : (
              <Conversation
                key={selected.key}
                messages={selected.messages}
                onReact={(message, emoji) => void react(message, emoji)}
                onReply={(message) =>
                  setReplyTo({
                    handle: message.handle,
                    preview: (message.body || "").replace(/\s+/g, " ").slice(0, 80),
                  })
                }
                onUnsend={(message) => void unsend(message)}
              />
            )}
          </div>

          {selectedWeb ? (
            <form
              className="shrink-0 space-y-2 border-t p-4"
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
                    {webSending ? (
                      "Sending…"
                    ) : (
                      <>
                        <Send data-icon="inline-start" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                This reply shows in the website chat box. It does not send a text.
              </p>
            </form>
          ) : (
          <form
            className="shrink-0 space-y-2 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            {showCompose || !selected ? (
              <div className="space-y-2">
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-8 w-full justify-between font-normal",
                    )}
                  >
                    <span className={cn("truncate", !composeContact && "text-muted-foreground")}>
                      {composeContact ? composeContact.name : "Choose a contact"}
                    </span>
                    <ChevronsUpDown className="opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[var(--anchor-width)] p-0" side="bottom">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search the book"
                        value={pickerQuery}
                        onValueChange={setPickerQuery}
                      />
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
                              <span className="ml-auto text-xs text-muted-foreground">
                                {formatPhone(contact.phone)}
                              </span>
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
                    const match = contactForPhone(book.contacts, value);
                    setDraftContactId(match?.id ?? "");
                  }}
                  placeholder="Mobile number"
                />
              </div>
            ) : null}
            {replyTo ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                <span className="min-w-0 truncate">Reply to “{replyTo.preview || "message"}”</span>
                <button type="button" className="shrink-0 text-muted-foreground" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Effect
              <select
                value={effect}
                onChange={(event) => setEffect(event.target.value)}
                aria-label="Message effect"
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground"
              >
                <option value="">None</option>
                {IMESSAGE_EFFECTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Write a text…"
                rows={2}
                className="min-h-[44px] resize-none"
              />
              <Button
                type="submit"
                disabled={!body.trim() || !looksLikePhone(sendTo)}
                className="self-end"
              >
                <Send data-icon="inline-start" />
                Send
              </Button>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Smartphone className="size-3" />
              {looksLikePhone(sendTo)
                ? "Logged as job communication when a job is attached. Enter to send, Shift+Enter for a new line."
                : "Choose a contact or enter a valid mobile number."}
            </p>
          </form>
          )}
        </section>
      </div>
      {selected ? (
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
      ) : null}
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  unreadCount,
  onOpen,
}: {
  thread: MessageThread;
  active: boolean;
  unreadCount: number;
  onOpen: (key: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(thread.key)}
      className={cn(
        "flex w-full items-start gap-3 border-b px-4 py-3 text-left",
        active ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <Avatar size="sm" className="mt-0.5">
        <AvatarFallback className="bg-primary/10 text-primary">
          {initials(thread.title) || "#"}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", unreadCount > 0 ? "font-semibold" : "font-medium")}>
            {thread.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatInboxTime(thread.lastAt)}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 line-clamp-2 text-xs",
            unreadCount > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {thread.preview}
        </span>
        {thread.job ? (
          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
            {thread.job.code ? `${thread.job.code} · ` : ""}
            {thread.job.name}
          </span>
        ) : null}
      </span>
      {unreadCount > 0 ? (
        <span className="mt-1 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

function WebsiteConversation({ messages }: { messages: WebsiteChatThread["messages"] }) {
  const lastIndex = Math.max(0, messages.length - 1);
  const last = messages[messages.length - 1];
  if (messages.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        Waiting for the visitor. Replies you send here appear in their chat box.
      </p>
    );
  }
  return (
    <InboxScroll stickToEnd stickKey={`${messages.length}:${last?.id ?? ""}`}>
      {messages.map((message, index) => {
        const prior = messages[index - 1];
        const showDay = !prior || !sameLocalDay(prior.createdAt, message.createdAt);
        return (
          <div key={message.id} className={cn("px-4", index === 0 ? "pt-4" : "pt-3", index === lastIndex ? "pb-4" : "")}>
            {showDay ? (
              <p className="mb-3 text-center text-[11px] tracking-wide text-muted-foreground uppercase">
                {formatDate(message.createdAt)}
              </p>
            ) : null}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                message.direction === "outbound"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-card shadow-sm",
              )}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p
                className={cn(
                  "mt-1 text-[10px] tracking-wide uppercase",
                  message.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {message.direction === "outbound" ? "Reply" : "Visitor"} · {formatMessageStamp(message.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </InboxScroll>
  );
}

function addonNote(message: TextMessage) {
  if (!message.detail) return "";
  if (message.kind === "effect" || message.kind === "reply" || message.kind === "poll" || message.kind === "edit") {
    return message.detail;
  }
  if (message.kind === "rename" || message.kind === "membership") return message.detail;
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
      if (person.name.toLowerCase().includes(needle)) return true;
      return person.title.toLowerCase().includes(needle);
    });
  }, [
    book.companyProfiles,
    book.jobs,
    book.messageThreadMembers,
    book.opportunities,
    book.staff,
    query,
    thread,
  ]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>People</SheetTitle>
          <SheetDescription>
            Crew on this job stay here. Anyone you add can see this conversation.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              On this job
            </p>
            {crew.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No one is attached to this job yet.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {crew.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 py-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {initials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{person.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.title || "On this job"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Added
            </p>
            {added.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No one has been added to this thread.</p>
            ) : (
              <ul className="mt-2 divide-y">
                {added.map(({ member, profile }) => (
                  <li key={member.id} className="flex items-center gap-3 py-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {initials(profile.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{profile.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {profile.title || "Added"}
                      </span>
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
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Add people
            </p>
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
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {initials(person.name)}
                        </AvatarFallback>
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

function Conversation({
  messages,
  onReact,
  onReply,
  onUnsend,
}: {
  messages: MessageThread["messages"];
  onReact: (message: TextMessage, emoji: string) => void;
  onReply: (message: TextMessage) => void;
  onUnsend: (message: TextMessage) => void;
}) {
  const lastIndex = Math.max(0, messages.length - 1);
  const last = messages[messages.length - 1];
  return (
    <InboxScroll stickToEnd stickKey={`${messages.length}:${last?.id ?? ""}:${last?.status ?? ""}`}>
      {messages.map((message, index) => {
        const prior = messages[index - 1];
        const showDay = !prior || !sameLocalDay(prior.createdAt, message.createdAt);
        return (
          <div key={message.id} className={cn("px-4", index === 0 ? "pt-4" : "pt-3", index === lastIndex ? "pb-4" : "")}>
            {showDay ? (
              <p className="mb-3 text-center text-[11px] tracking-wide text-muted-foreground uppercase">
                {formatDate(message.createdAt)}
              </p>
            ) : null}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                message.direction === "outbound"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-card shadow-sm",
              )}
            >
              {message.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.mediaUrl}
                  alt=""
                  className="mb-2 max-h-56 w-full rounded-md object-cover"
                />
              ) : null}
              {addonNote(message) ? (
                <p
                  className={cn(
                    "mb-1 text-[10px] font-medium tracking-wide uppercase",
                    message.direction === "outbound" ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {addonNote(message)}
                </p>
              ) : null}
              <p className={cn("whitespace-pre-wrap", message.status === "unsent" && "italic opacity-70")}>
                {message.body}
              </p>
              {message.handle && message.status !== "unsent" && message.kind !== "reaction" ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {IMESSAGE_TAPBACKS.map((tap) => (
                    <button
                      key={tap.emoji}
                      type="button"
                      aria-label={tap.label}
                      title={tap.label}
                      className="rounded-full px-1 text-sm leading-none hover:bg-black/10"
                      onClick={() => onReact(message, tap.emoji)}
                    >
                      {tap.emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1 text-[10px] tracking-wide uppercase",
                      message.direction === "outbound" ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                    onClick={() => onReply(message)}
                  >
                    Reply
                  </button>
                  {message.direction === "outbound" ? (
                    <button
                      type="button"
                      className="rounded px-1 text-[10px] tracking-wide text-primary-foreground/80 uppercase"
                      onClick={() => onUnsend(message)}
                    >
                      Unsend
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p
                className={cn(
                  "mt-1 text-[10px] tracking-wide uppercase",
                  message.direction === "outbound"
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {statusLabel(message.status, message.direction)} · {formatMessageStamp(message.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </InboxScroll>
  );
}

function statusLabel(status: string | null | undefined, direction: "inbound" | "outbound") {
  const key = (status ?? "").toLowerCase();
  if (key === "unsent") return "Unsent";
  if (key === "failed" || key === "error" || key === "undelivered") return "Failed";
  if (key === "queued" || key === "sending") return "Sending";
  return direction === "outbound" ? "Sent" : "Received";
}
