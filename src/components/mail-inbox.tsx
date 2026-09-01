"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronsUpDown, Mail, RefreshCw, Search, Tag } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  filterMailThreads,
  jobsForMailPicker,
  mailHref,
  mailThreads,
  type MailThread,
} from "@/lib/job-emails";
import { formatInboxTime, formatMessageStamp, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MailInbox() {
  const crm = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  const mine = crm.gmailAccounts.find((account) => account.staffId === crm.user.staffId);
  const inbox = useMemo(
    () =>
      (crm.gmailMessages ?? []).filter((message) => {
        if (mine?.id) return message.accountId === mine.id;
        return true;
      }),
    [crm.gmailMessages, mine?.id],
  );
  const threads = useMemo(
    () => mailThreads(inbox, crm.contacts, crm.jobs, crm.opportunities),
    [inbox, crm.contacts, crm.jobs, crm.opportunities],
  );

  const wantedJob = params.get("job");
  const wantedContact = params.get("contact");
  const wantedThread = params.get("thread");
  const wantedEmail = params.get("email");

  const [query, setQuery] = useState("");
  const [oauthReady, setOauthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const visibleThreads = useMemo(() => filterMailThreads(threads, query), [query, threads]);

  const selected: MailThread | null = useMemo(() => {
    if (wantedThread) return threads.find((thread) => thread.key === wantedThread) ?? null;
    if (wantedEmail) {
      const hit = threads.find((thread) => thread.messages.some((message) => message.id === wantedEmail));
      if (hit) return hit;
    }
    if (wantedContact) {
      const hit = threads.find((thread) => thread.contactId === wantedContact);
      if (hit) return hit;
    }
    if (wantedJob) {
      const hit = threads.find((thread) => thread.jobId === wantedJob || thread.job?.id === wantedJob);
      if (hit) return hit;
    }
    return threads[0] ?? null;
  }, [threads, wantedContact, wantedEmail, wantedJob, wantedThread]);

  const conversationOpen = Boolean(selected);

  useEffect(() => {
    const gmail = params.get("gmail");
    if (gmail === "connected") {
      const email = params.get("email") || "";
      const staffId = params.get("staffId") || crm.user.staffId;
      void crm.markGmailLinked(staffId, email, "google");
      toast.success(`Gmail linked${email ? ` as ${email}` : ""}.`);
      window.history.replaceState({}, "", "/mail");
      void syncInbox();
    } else if (gmail === "error") {
      toast.error(params.get("reason") || "Gmail did not connect.");
      window.history.replaceState({}, "", "/mail");
    }
    void fetch("/api/google/gmail/status")
      .then((response) => response.json())
      .then((json: { configured?: boolean }) => setOauthReady(Boolean(json.configured)))
      .catch(() => setOauthReady(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const syncInbox = useCallback(async () => {
    if (!crm.user.staffId) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/google/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: crm.user.staffId }),
      });
      const json = (await response.json()) as {
        messages?: typeof crm.gmailMessages;
        error?: string;
      };
      if (!response.ok) {
        toast.error(json.error || "Could not sync Gmail.");
        return;
      }
      if (json.messages) crm.mergeGmailMessages(json.messages);
      toast.success(json.messages?.length ? `Synced ${json.messages.length} emails.` : "Gmail is up to date.");
    } catch {
      toast.error("Could not sync Gmail.");
    } finally {
      setSyncing(false);
    }
  }, [crm]);

  const openThread = useCallback(
    (key: string) => {
      router.replace(mailHref({ thread: key }), { scroll: false });
    },
    [router],
  );

  const pickableJobs = useMemo(() => {
    const needle = pickerQuery.trim().toLowerCase();
    return jobsForMailPicker(crm.jobs).filter((job) => {
      if (!needle) return true;
      if (job.name.toLowerCase().includes(needle)) return true;
      if (job.code?.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [crm.jobs, pickerQuery]);

  const taggedJob = selected?.messages.find((item) => item.jobId)?.jobId
    ? crm.jobs.find((job) => job.id === selected.messages.find((item) => item.jobId)?.jobId)
    : undefined;

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
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Communication
                </p>
                <h1 className="font-heading text-lg font-medium">Mail</h1>
                {mine?.linked ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {mine.googleEmail}
                    {mine.source === "demo" ? " · sample" : ""}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">Link Gmail to pull job mail here.</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {mine?.linked && mine.source === "google" ? (
                  <Button type="button" size="sm" variant="outline" disabled={syncing} onClick={() => void syncInbox()}>
                    <RefreshCw data-icon="inline-start" className={syncing ? "animate-spin" : undefined} />
                    Sync
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {mine?.linked ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void crm.disconnectGmail()}>
                  Disconnect
                </Button>
              ) : oauthReady ? (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<a href={`/api/google/gmail/connect?staffId=${encodeURIComponent(crm.user.staffId)}`} />}
                >
                  Connect Gmail
                </Button>
              ) : (
                <Button size="sm" onClick={() => void crm.loadSampleInbox()}>
                  Load sample inbox
                </Button>
              )}
              {!mine?.linked && oauthReady ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void crm.loadSampleInbox()}>
                  Sample inbox
                </Button>
              ) : null}
            </div>
            {!oauthReady ? (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, plus the Gmail callback URI, to connect a real mailbox.
              </p>
            ) : null}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search subject, people, or jobs"
                className="pl-8"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleThreads.length === 0 ? (
              <div className="px-4 py-8">
                {threads.length === 0 ? (
                  <EmptyState
                    title={mine?.linked ? "No mail yet" : "No mailbox linked"}
                    description={
                      mine?.linked
                        ? "Sync Gmail to pull the last 30 days, then tag a thread to a job so it shows on the field record."
                        : "Connect Gmail for this seat, or load the sample inbox to try tagging mail to a job."
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">No threads match that search.</p>
                )}
              </div>
            ) : (
              visibleThreads.map((thread) => {
                const active = selected?.key === thread.key;
                return (
                  <button
                    key={thread.key}
                    type="button"
                    onClick={() => openThread(thread.key)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b px-4 py-3 text-left",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <Avatar size="sm" className="mt-0.5">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {initials(thread.fromName) || "@"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{thread.fromName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatInboxTime(thread.lastAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm">{thread.subject}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{thread.preview}</span>
                      {thread.messages.some((item) => item.jobId) && thread.job ? (
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {thread.job.code ? `${thread.job.code} · ` : ""}
                          {thread.job.name}
                        </span>
                      ) : (
                        <span className="mt-1 block text-[11px] text-muted-foreground">Untagged</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className={cn("flex min-h-0 flex-1 flex-col", !conversationOpen && "hidden lg:flex")}>
          {selected ? (
            <>
              <header className="flex items-start gap-2 border-b px-3 py-3 sm:px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="lg:hidden"
                  aria-label="Back to inbox"
                  onClick={() => router.replace("/mail", { scroll: false })}
                >
                  <ChevronLeft />
                </Button>
                <Avatar size="sm">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {initials(selected.fromName) || "@"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.fromName}
                    {selected.fromEmail ? ` · ${selected.fromEmail}` : ""}
                  </p>
                </div>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "font-normal")}
                  >
                    <Tag />
                    {taggedJob ? taggedJob.code || taggedJob.name : "Tag to job"}
                    <ChevronsUpDown className="opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Find a job"
                        value={pickerQuery}
                        onValueChange={setPickerQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No jobs match.</CommandEmpty>
                        <CommandGroup>
                          {taggedJob ? (
                            <CommandItem
                              value="untag remove job"
                              onSelect={() => {
                                void crm.tagGmailThread(selected.key, null);
                                setPickerOpen(false);
                              }}
                            >
                              Remove job tag
                            </CommandItem>
                          ) : null}
                          {pickableJobs.map((job) => (
                            <CommandItem
                              key={job.id}
                              value={`${job.code} ${job.name}`}
                              onSelect={() => {
                                void crm.tagGmailThread(selected.key, job.id);
                                setPickerOpen(false);
                                setPickerQuery("");
                              }}
                            >
                              <span className="min-w-0 truncate">{job.name}</span>
                              {job.code ? (
                                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                                  {job.code}
                                </span>
                              ) : null}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </header>
              {taggedJob ? (
                <div className="border-b px-4 py-2 text-xs">
                  Tagged to{" "}
                  <Link href={`/jobs/${taggedJob.id}`} className="font-medium hover:underline">
                    {taggedJob.code ? `${taggedJob.code} · ` : ""}
                    {taggedJob.name}
                  </Link>
                </div>
              ) : selected.job ? (
                <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                  Suggested job: {selected.job.code ? `${selected.job.code} · ` : ""}
                  {selected.job.name}
                </div>
              ) : null}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {selected.messages.map((message) => (
                  <article key={message.id} className="border px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {message.direction === "outbound" ? "You" : message.fromName || message.fromEmail}
                      </p>
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        {formatMessageStamp(message.receivedAt)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {message.direction === "outbound" ? `To ${message.toEmail}` : `From ${message.fromEmail}`}
                    </p>
                    <pre className="mt-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
                      {message.bodyText || message.snippet || "(no body)"}
                    </pre>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <Mail className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Pick a thread to read it and tag it to a job.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
