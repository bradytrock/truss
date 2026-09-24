"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
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
  const [draftPhone, setDraftPhone] = useState("");
  const [draftContactId, setDraftContactId] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");

  const showCompose =
    composeParam || (!wantedThread && Boolean(queryContact) && !queryThread);
  const selected = showCompose
    ? null
    : queryThread ??
      (wantedThread ? threads.find((row) => row.key === wantedThread) : undefined) ??
      (wantedThread || wantedContact || wantedJob ? null : threads[0] ?? null);

  const visibleThreads = useMemo(() => filterMessageThreads(threads, query), [query, threads]);

  useEffect(() => {
    if (queryContact?.phone) {
      setDraftPhone((current) => current || formatPhoneInput(queryContact.phone));
      setDraftContactId((current) => current || queryContact.id);
    }
  }, [queryContact?.id, queryContact?.phone]);

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
  const conversationOpen = showCompose || Boolean(selected);

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

  const send = useCallback(async () => {
    const text = body.trim();
    if (!looksLikePhone(sendTo) || !text) return;
    setSending(true);
    try {
      const ok = await crm.sendTextMessage({
        to: sendTo,
        content: text,
        jobId: jobHint || undefined,
        contactId: contactHint || undefined,
        name: selected?.contact?.name || composeContact?.name || queryContact?.name,
      });
      if (ok) {
        setBody("");
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

  useEffect(() => {
    if (selected?.key) void crm.markThreadOpened(selected.key);
  }, [crm, selected?.key]);

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
    <div className="-m-5 flex h-[calc(100dvh-3rem)] min-h-0 flex-col bg-background sm:-m-7">
      {crm.hydrateError ? (
        <div className="border-b px-4 py-3">
          <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={cn(
            "flex min-h-0 flex-col border-b bg-background lg:border-r lg:border-b-0",
            conversationOpen && "hidden lg:flex",
          )}
        >
          <div className="border-b px-4 py-3">
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
          <div className="min-h-0 flex-1">
            {visibleThreads.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">
                {threads.length === 0
                  ? "No conversations yet. Text a homeowner — replies land here and on the job."
                  : "No threads match that search."}
              </p>
            ) : (
              <Virtuoso
                className="h-full"
                data={visibleThreads}
                increaseViewportBy={240}
                itemContent={(_index, thread) => (
                  <ThreadRow
                    thread={thread}
                    active={!showCompose && selected?.key === thread.key}
                    unreadCount={threadUnreadCount(
                      thread,
                      openedAtFor(book.messageThreadOpens, crm.user.id, thread.key),
                    )}
                    onOpen={openThread}
                  />
                )}
              />
            )}
          </div>
        </aside>

        <section
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            !conversationOpen && "hidden lg:flex",
          )}
        >
          <header className="flex items-center gap-2 border-b px-3 py-3 sm:px-4">
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
            {showCompose ? (
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
              "min-h-0 flex-1 bg-muted/20",
              showCompose || !selected ? "overflow-y-auto px-4 py-4" : "",
            )}
          >
            {showCompose || !selected ? (
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
              <Conversation key={selected.key} messages={selected.messages} />
            )}
          </div>

          <form
            className="space-y-2 border-t p-4"
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
                disabled={sending || !body.trim() || !looksLikePhone(sendTo)}
                className="self-end"
              >
                {sending ? (
                  "Sending…"
                ) : (
                  <>
                    <Send data-icon="inline-start" />
                    Send
                  </>
                )}
              </Button>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Smartphone className="size-3" />
              {looksLikePhone(sendTo)
                ? "Logged as job communication when a job is attached. Enter to send, Shift+Enter for a new line."
                : "Choose a contact or enter a valid mobile number."}
            </p>
          </form>
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

function Conversation({ messages }: { messages: MessageThread["messages"] }) {
  const lastIndex = Math.max(0, messages.length - 1);
  return (
    <Virtuoso
      className="h-full"
      data={messages}
      increaseViewportBy={{ top: 240, bottom: 400 }}
      initialTopMostItemIndex={lastIndex}
      followOutput="smooth"
      itemContent={(index, message) => {
        const prior = messages[index - 1];
        const showDay = !prior || !sameLocalDay(prior.createdAt, message.createdAt);
        return (
          <div className={cn("px-4", index === 0 ? "pt-4" : "pt-3", index === lastIndex ? "pb-4" : "")}>
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
              <p className="whitespace-pre-wrap">{message.body}</p>
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
      }}
    />
  );
}

function statusLabel(status: string, direction: "inbound" | "outbound") {
  const key = status.toLowerCase();
  if (key === "failed" || key === "error" || key === "undelivered") return "Failed";
  if (key === "queued" || key === "sending") return "Sending";
  return direction === "outbound" ? "Sent" : "Received";
}
