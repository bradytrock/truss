"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Paperclip, Send, Sparkles, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCrm } from "@/lib/crm-store";
import { compressReceipt } from "@/lib/job-financials";
import { buildAssistantContext } from "@/lib/assistant/context";
import { TRUSS_ASK_EVENT } from "@/lib/assistant/ask";
import {
  describeToolCall,
  executeToolCall,
  shouldConfirmCall,
  toolMessage,
  type ExecuteExtras,
} from "@/lib/assistant/execute";
import { toolStatus } from "@/lib/assistant/tools";
import type { AssistantMessage, AssistantResponse, AssistantToolCall, AssistantToolResult } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Log a hail roof at 412 Maple for Jane Ortiz, phone 214-555-0144, seed Website",
  "Draft a reroof estimate on the open job from the price book",
  "Review my inbox, match people, and tag mail to jobs",
];

const MAX_HOPS = 8;

type Attachment = { dataUrl: string; name: string };

type PendingConfirm = {
  history: AssistantMessage[];
  calls: AssistantToolCall[];
  results: Array<AssistantToolResult | undefined>;
  confirmIndexes: number[];
};

function visibleMessages(messages: AssistantMessage[]) {
  return messages.filter((message) => message.role === "user" || (message.role === "assistant" && (message.content || !message.toolCalls?.length)));
}

export function AssistantPanel() {
  const crm = useCrm();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hops = useRef(0);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const extras = useCallback((): ExecuteExtras => ({ attachment }), [attachment]);

  const context = useCallback(() => {
    return buildAssistantContext({
      companyName: crm.company.name || crm.user.company,
      seatName: crm.effectiveStaff?.name || crm.user.name,
      seatRole: crm.viewer?.role || crm.user.role,
      path: pathname,
      hasAttachment: Boolean(attachment),
      jobs: crm.jobs,
      contacts: crm.contacts,
      estimates: crm.estimates,
      invoices: crm.invoices,
    });
  }, [attachment, crm, pathname]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === ".") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/assistant")
      .then(async (response) => {
        const body = (await response.json()) as { configured?: boolean };
        if (!cancelled) setConfigured(Boolean(body.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, status, pending, error]);

  function handleOpenChange(next: boolean) {
    if (!next && pending) return;
    setOpen(next);
  }

  async function attachFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Attach a photo (receipt, check, or job picture).");
      return;
    }
    try {
      const compressed = await compressReceipt(file);
      setAttachment({ dataUrl: compressed.dataUrl, name: compressed.file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that photo.");
    }
  }

  async function runLoop(history: AssistantMessage[], startHop = 0) {
    setBusy(true);
    setError(null);
    hops.current = startHop;
    let current = history;
    while (hops.current < MAX_HOPS) {
      setStatus("Thinking…");
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: current, context: context() }),
      });
      const data = (await response.json()) as AssistantResponse;
      if (!data.ok) {
        setError(data.message);
        setBusy(false);
        setStatus("");
        return;
      }
      current = [...current, data.message];
      setMessages(current);
      const calls = data.message.toolCalls ?? [];
      if (!calls.length) {
        setBusy(false);
        setStatus("");
        hops.current = 0;
        return;
      }
      const nextExtras = extras();
      const results: Array<AssistantToolResult | undefined> = Array.from({ length: calls.length });
      const confirmIndexes: number[] = [];
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls[index];
        if (shouldConfirmCall(call, nextExtras)) {
          confirmIndexes.push(index);
          continue;
        }
        setStatus(toolStatus(call.name));
        const result = await executeToolCall(crm, call, nextExtras);
        results[index] = result;
        if (result.href) router.push(result.href);
        if (result.ok && (call.name === "log_expense" || call.name === "log_payment" || call.name === "add_job_photo")) {
          setAttachment(null);
        }
      }
      if (confirmIndexes.length) {
        setPending({ history: current, calls, results, confirmIndexes });
        setBusy(false);
        setStatus("");
        return;
      }
      const toolMessages = calls.map((call, index) => toolMessage(call, results[index] ?? { ok: false, error: "Did not run." }));
      current = [...current, ...toolMessages];
      setMessages(current);
      hops.current += 1;
    }
    setError("Stopped after too many steps. Ask again with a shorter request.");
    setBusy(false);
    setStatus("");
  }

  async function finishPending(approved: boolean) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const nextExtras = extras();
    const results = [...pending.results];
    for (const index of pending.confirmIndexes) {
      const call = pending.calls[index];
      if (!approved) {
        results[index] = { ok: false, error: "The user declined." };
        continue;
      }
      setStatus(toolStatus(call.name));
      const result = await executeToolCall(crm, call, nextExtras);
      results[index] = result;
      if (result.href) router.push(result.href);
    }
    const toolMessages = pending.calls.map((call, index) =>
      toolMessage(call, results[index] ?? { ok: false, error: "Did not run." }),
    );
    const next = [...pending.history, ...toolMessages];
    setPending(null);
    setMessages(next);
    hops.current += 1;
    await runLoop(next, hops.current);
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || pending) return;
    if (configured === false) {
      setError("Ask Truss needs OPENAI_API_KEY on the server.");
      return;
    }
    const userText = attachment ? `${content}\n\n[Photo attached: ${attachment.name}]` : content;
    const history: AssistantMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(history);
    setInput("");
    hops.current = 0;
    await runLoop(history, 0);
  }
  sendRef.current = send;

  useEffect(() => {
    function onAsk(event: Event) {
      const prompt = (event as CustomEvent<{ prompt?: string }>).detail?.prompt?.trim();
      if (!prompt) return;
      setOpen(true);
      void sendRef.current(prompt);
    }
    window.addEventListener(TRUSS_ASK_EVENT, onAsk);
    return () => window.removeEventListener(TRUSS_ASK_EVENT, onAsk);
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function onComposerKey(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const shown = visibleMessages(messages);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Ask Truss">
        <Sparkles data-icon="inline-start" />
        <span className="hidden sm:inline">Ask Truss</span>
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b pr-12">
            <div className="flex items-center justify-between gap-2">
              <div>
                <SheetTitle>Ask Truss</SheetTitle>
                <SheetDescription>Say what needs doing. Truss will do it on this seat’s book.</SheetDescription>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)} aria-label="Close">
                <XIcon />
              </Button>
            </div>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {configured === false ? (
                <p className="text-sm text-muted-foreground">
                  Ask Truss uses OpenAI. Add <code className="font-mono text-xs">OPENAI_API_KEY</code> to{" "}
                  <code className="font-mono text-xs">.env.local</code> and restart. It will not invent jobs or numbers without a key.
                </p>
              ) : shown.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    People who would rather talk than click can run the book from here: leads, estimates, invoices, expenses, photos,
                    calendar, and mail.
                  </p>
                  <ul className="space-y-2">
                    {EXAMPLES.map((example) => (
                      <li key={example}>
                        <button
                          type="button"
                          className="w-full rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => void send(example)}
                          disabled={busy}
                        >
                          {example}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <ul className="space-y-3">
                  {shown.map((message, index) => (
                    <li
                      key={`${message.role}-${index}`}
                      className={cn(
                        "max-w-[95%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap",
                        message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {message.content || (busy && index === shown.length - 1 ? status : "")}
                    </li>
                  ))}
                </ul>
              )}
              {status && busy ? <p className="mt-3 text-xs text-muted-foreground">{status}</p> : null}
              {error ? (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <p>{error}</p>
                  <Button type="button" variant="ghost" size="xs" className="mt-1" onClick={() => setError(null)}>
                    Dismiss
                  </Button>
                </div>
              ) : null}
            </div>

            {pending ? (
              <div className="space-y-2 border-t bg-muted/40 px-4 py-3">
                {pending.confirmIndexes.map((index) => (
                  <p key={pending.calls[index].id} className="text-sm">
                    {describeToolCall(pending.calls[index])}
                  </p>
                ))}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={() => void finishPending(true)} disabled={busy}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void finishPending(false)} disabled={busy}>
                    Don’t
                  </Button>
                </div>
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="border-t p-3">
              {attachment ? (
                <div className="mb-2 flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={attachment.dataUrl} alt="" className="size-8 rounded-sm object-cover" />
                  <p className="min-w-0 flex-1 truncate text-xs">{attachment.name}</p>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => setAttachment(null)} aria-label="Remove photo">
                    <XIcon />
                  </Button>
                </div>
              ) : null}
              <div className="flex items-end gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void attachFile(file);
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Attach photo"
                  disabled={busy}
                >
                  <Paperclip />
                </Button>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onComposerKey}
                  placeholder="Tell Truss what to do"
                  className="min-h-10 max-h-32 flex-1 resize-none"
                  disabled={busy || Boolean(pending) || configured === false}
                />
                <Button type="submit" size="icon-sm" className="shrink-0" disabled={busy || Boolean(pending) || !input.trim()} aria-label="Send">
                  <Send />
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">⌘. to open · Enter to send · Shift+Enter for a new line</p>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
