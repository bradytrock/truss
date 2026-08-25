"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { messageThreads, phoneKey } from "@/lib/job-messages";
import { formatPhone, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

function MessagesInbox() {
  const crm = useCrm();
  const params = useSearchParams();
  const threads = useMemo(
    () => messageThreads(crm.messages, crm.contacts, crm.jobs, crm.opportunities),
    [crm.messages, crm.contacts, crm.jobs, crm.opportunities],
  );

  const wantedJob = params.get("job");
  const wantedContact = params.get("contact");
  const wantedThread = params.get("thread");

  const queryContact = useMemo(() => {
    if (wantedContact) return crm.contacts.find((row) => row.id === wantedContact);
    if (wantedJob) {
      const job = crm.jobs.find((row) => row.id === wantedJob);
      return job ? crm.contacts.find((row) => row.id === job.primaryContactId) : undefined;
    }
    return undefined;
  }, [wantedContact, wantedJob, crm.contacts, crm.jobs]);

  const queryJob = useMemo(
    () => (wantedJob ? crm.jobs.find((row) => row.id === wantedJob) : undefined),
    [wantedJob, crm.jobs],
  );

  const queryThread = useMemo(() => {
    if (wantedThread) return threads.find((thread) => thread.key === wantedThread);
    if (queryContact) {
      return threads.find(
        (thread) =>
          thread.contactId === queryContact.id || phoneKey(thread.phone) === phoneKey(queryContact.phone),
      );
    }
    return undefined;
  }, [wantedThread, queryContact, threads]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (queryContact?.phone) setDraftPhone((current) => current || queryContact.phone);
  }, [queryContact?.phone]);

  const showCompose = composing || (!selectedKey && Boolean(queryContact) && !queryThread);
  const selected = showCompose
    ? null
    : (selectedKey ? threads.find((row) => row.key === selectedKey) : undefined) ??
      queryThread ??
      threads[0] ??
      null;
  const jobHint = queryJob?.id ?? selected?.jobId ?? "";
  const contactHint = queryContact?.id ?? selected?.contactId ?? "";
  const sendTo = selected?.phone || draftPhone;

  const send = useCallback(async () => {
    const text = body.trim();
    if (!sendTo.trim() || !text) return;
    setSending(true);
    try {
      const ok = await crm.sendTextMessage({
        to: sendTo,
        content: text,
        jobId: jobHint || undefined,
        contactId: contactHint || undefined,
        name: selected?.contact?.name || queryContact?.name,
      });
      if (ok) {
        setBody("");
        setComposing(false);
        const key = contactHint || phoneKey(sendTo);
        if (key) setSelectedKey(key);
      }
    } finally {
      setSending(false);
    }
  }, [sendTo, body, crm, jobHint, contactHint, selected?.contact?.name, queryContact?.name]);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description="Texts to and from homeowners. Every send and reply is logged on the related job as communication."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setComposing(true);
              setSelectedKey(null);
              setDraftPhone(queryContact?.phone ?? "");
            }}
          >
            <MessageSquare data-icon="inline-start" />
            New text
          </Button>
        }
      />

      {threads.length === 0 && !showCompose ? (
        <EmptyState
          title="No texts yet"
          description="Send a message to a homeowner. Incoming replies land here and on the job record."
          action={
            <Button
              type="button"
              onClick={() => {
                setComposing(true);
                setDraftPhone("");
              }}
            >
              Write a text
            </Button>
          }
        />
      ) : (
        <div className="grid min-h-[70vh] overflow-hidden rounded-md border bg-card lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b lg:border-r lg:border-b-0">
            <div className="border-b px-4 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Threads
              </p>
            </div>
            <div className="max-h-[36vh] overflow-y-auto lg:max-h-[calc(70vh-3rem)]">
              {threads.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No conversations yet.</p>
              ) : (
                threads.map((thread) => {
                  const active = !showCompose && selected?.key === thread.key;
                  return (
                    <button
                      key={thread.key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(thread.key);
                        setComposing(false);
                      }}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left",
                        active ? "bg-muted" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{thread.title}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRelative(thread.lastAt)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{thread.preview}</span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-h-[50vh] flex-col">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {showCompose ? "New message" : selected?.title || "Pick a conversation"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showCompose
                    ? queryContact
                      ? formatPhone(queryContact.phone)
                      : "Enter a mobile number"
                    : selected
                      ? formatPhone(selected.phone)
                      : "Choose a thread or start a new text"}
                </p>
              </div>
              {selected?.jobId ? (
                <Button nativeButton={false} variant="outline" size="sm" render={<Link href={`/jobs/${selected.jobId}`} />}>
                  Open job
                </Button>
              ) : queryJob ? (
                <Button nativeButton={false} variant="outline" size="sm" render={<Link href={`/jobs/${queryJob.id}`} />}>
                  Open job
                </Button>
              ) : null}
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
              {(selected && !showCompose ? selected.messages : []).map((message) => (
                <div
                  key={message.id}
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
                      "mt-1 text-[10px] uppercase tracking-wide",
                      message.direction === "outbound"
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    {message.direction === "outbound" ? "Sent" : "Received"} · {formatRelative(message.createdAt)}
                  </p>
                </div>
              ))}
              {showCompose || !selected ? (
                <p className="text-sm text-muted-foreground">
                  Replies attach to the matching job automatically and show up on that job’s activity.
                </p>
              ) : null}
            </div>

            <form
              className="space-y-2 border-t p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {showCompose || !selected ? (
                <Input
                  value={draftPhone}
                  onChange={(event) => setDraftPhone(event.target.value)}
                  placeholder="Mobile number"
                  inputMode="tel"
                />
              ) : null}
              <div className="flex gap-2">
                <Textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write a text…"
                  rows={2}
                  className="min-h-[44px] resize-none"
                />
                <Button type="submit" disabled={sending || !body.trim() || !sendTo.trim()} className="self-end">
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
                Logged as job communication when a job is attached.
              </p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MessagesInbox />
    </Suspense>
  );
}
