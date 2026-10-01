"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Send, X } from "lucide-react";
import {
  CHAT_ASK_NAME,
  CHAT_ASK_PHONE,
  CHAT_ASK_STREET,
  messagesAppLink,
  parseChatName,
  parseChatPhone,
  parseChatStreet,
  textHandoffBody,
  type WebsiteChatMessage,
} from "@/lib/website-chat";
import { cn } from "@/lib/utils";

type Office = { companyName: string; phone: string };
type Step = "name" | "phone" | "street" | "choose" | "chat" | "text";

type Intake = {
  visitorName?: string;
  visitorPhone?: string;
  visitorStreet?: string;
  channel?: string;
  ready?: boolean;
  phone?: string;
  companyName?: string;
  messages?: WebsiteChatMessage[];
};

const CLOSED_FRAME = "60px";
const OPEN_FRAME_WIDTH = "min(380px, calc(100vw - 32px))";
const OPEN_FRAME_HEIGHT = "min(640px, calc(100vh - 32px))";

function stepFor(intake: Intake | null): Step {
  if (!intake?.ready) {
    if (!intake?.visitorName) return "name";
    if (!intake?.visitorPhone) return "phone";
    return "street";
  }
  if (intake.channel === "text") return "text";
  if (intake.channel === "chat") return "chat";
  return "choose";
}

function officeInitial(name: string) {
  const letter = name.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(letter) ? letter : "";
}

function ChatGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className ?? "size-6"} fill="currentColor">
      <path d="M5 4.75h14A2.25 2.25 0 0 1 21.25 7v7.5A2.25 2.25 0 0 1 19 16.75H9.4L5.15 20.2v-3.45H5A2.25 2.25 0 0 1 2.75 14.5V7A2.25 2.25 0 0 1 5 4.75Z" />
    </svg>
  );
}

export function WebsiteChatWidget({ companySlug, embed }: { companySlug: string; embed: boolean }) {
  const [open, setOpen] = useState(!embed);
  const [office, setOffice] = useState<Office | null>(null);
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<WebsiteChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>("name");
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftStreet, setDraftStreet] = useState("");
  const [handoff, setHandoff] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const publishSize = useCallback((nextOpen: boolean) => {
    if (!embed || window.parent === window) return;
    window.parent.postMessage(
      {
        type: "truss-chat-size",
        open: nextOpen,
        width: nextOpen ? OPEN_FRAME_WIDTH : CLOSED_FRAME,
        height: nextOpen ? OPEN_FRAME_HEIGHT : CLOSED_FRAME,
      },
      "*",
    );
  }, [embed]);

  useEffect(() => {
    if (!embed) return;
    const html = document.documentElement;
    const previousHtml = html.style.backgroundColor;
    const previousBody = document.body.style.backgroundColor;
    const previousOverflow = document.body.style.overflow;
    html.style.backgroundColor = "transparent";
    document.body.style.backgroundColor = "transparent";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.backgroundColor = previousHtml;
      document.body.style.backgroundColor = previousBody;
      document.body.style.overflow = previousOverflow;
    };
  }, [embed]);

  useEffect(() => {
    publishSize(open);
  }, [open, publishSize]);

  useEffect(() => {
    if (!embed || !open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        publishSize(false);
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embed, open, publishSize]);

  useEffect(() => {
    const storageKey = `truss.websiteChat.${companySlug}`;
    const saved = window.localStorage.getItem(storageKey) || "";
    let cancelled = false;

    function applyIntake(data: Intake, existingToken: string) {
      const nextOffice = {
        companyName: data.companyName || "Office",
        phone: data.phone || "",
      };
      setOffice(nextOffice);
      setToken(existingToken);
      setMessages(data.messages ?? []);
      setDraftName(data.visitorName || "");
      setDraftPhone(data.visitorPhone || "");
      setDraftStreet(data.visitorStreet || "");
      setStep(stepFor(data));
      if (data.channel === "text" && nextOffice.phone) {
        const iphone = /iPhone|iPod/i.test(navigator.userAgent);
        setHandoff(messagesAppLink(nextOffice.phone, textHandoffBody(data.visitorName || "", data.visitorStreet || ""), iphone));
      }
    }

    async function boot() {
      const lookedUp = await fetch(`/api/chat/lookup?company=${encodeURIComponent(companySlug)}`);
      const officeData = (await lookedUp.json()) as Office & { ok?: boolean; error?: string };
      if (cancelled) return;
      if (!officeData.ok) {
        setError(officeData.error || "Chat is not available.");
        setReady(true);
        return;
      }
      setOffice({ companyName: officeData.companyName || "Office", phone: officeData.phone || "" });

      if (saved) {
        const read = await fetch(`/api/chat/messages?token=${encodeURIComponent(saved)}`);
        const data = (await read.json()) as Intake & { ok?: boolean };
        if (!cancelled && data.ok) {
          applyIntake(data, saved);
          setReady(true);
          return;
        }
        window.localStorage.removeItem(storageKey);
      }

      const started = await fetch("/api/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: companySlug }),
      });
      const data = (await started.json()) as { ok?: boolean; token?: string; error?: string; companyName?: string; phone?: string };
      if (cancelled) return;
      if (!data.ok || !data.token) {
        setError(data.error || "Chat is not available.");
        setReady(true);
        return;
      }
      window.localStorage.setItem(storageKey, data.token);
      setToken(data.token);
      setOffice({ companyName: data.companyName || officeData.companyName || "Office", phone: data.phone || officeData.phone || "" });
      setMessages([]);
      setStep("name");
      setReady(true);
    }

    void boot().catch(() => {
      if (!cancelled) {
        setError("Chat is not available.");
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companySlug]);

  useEffect(() => {
    if (!token || !open || step !== "chat") return;
    let cancelled = false;
    async function poll() {
      const response = await fetch(`/api/chat/messages?token=${encodeURIComponent(token)}`);
      const data = (await response.json()) as { ok?: boolean; messages?: WebsiteChatMessage[] };
      if (!cancelled && data.ok && data.messages) setMessages(data.messages);
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, open, step]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open, step]);

  useEffect(() => {
    if (!open || !ready || !token || step === "choose" || step === "text") return;
    field.current?.focus();
  }, [open, ready, token, step]);

  const name = office?.companyName || "the office";
  const prompt =
    step === "name" ? CHAT_ASK_NAME : step === "phone" ? CHAT_ASK_PHONE : step === "street" ? CHAT_ASK_STREET : "";

  function remember(lines: Array<Pick<WebsiteChatMessage, "direction" | "body">>) {
    setMessages((current) => [
      ...current,
      ...lines.map((line, index) => ({
        id: `local-${current.length + index}`,
        direction: line.direction,
        body: line.body,
        createdAt: new Date().toISOString(),
      })),
    ]);
  }

  async function answer(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || !token || sending) return;
    setError("");

    if (step === "name") {
      const parsed = parseChatName(text);
      if (!parsed) {
        setError("Enter your name.");
        return;
      }
      remember([
        { direction: "outbound", body: CHAT_ASK_NAME },
        { direction: "inbound", body: parsed },
      ]);
      setDraftName(parsed);
      setBody("");
      setStep("phone");
      return;
    }

    if (step === "phone") {
      const parsed = parseChatPhone(text);
      if (!parsed) {
        setError("Enter a phone number.");
        return;
      }
      remember([
        { direction: "outbound", body: CHAT_ASK_PHONE },
        { direction: "inbound", body: parsed },
      ]);
      setDraftPhone(parsed);
      setBody("");
      setStep("street");
      return;
    }

    if (step === "street") {
      const parsed = parseChatStreet(text);
      if (!parsed) {
        setError("Enter the street address.");
        return;
      }
      setSending(true);
      try {
        const response = await fetch("/api/chat/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, name: draftName, phone: draftPhone, street: parsed }),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!data.ok) {
          setError(data.error || "Could not start that.");
          return;
        }
        setDraftStreet(parsed);
        const read = await fetch(`/api/chat/messages?token=${encodeURIComponent(token)}`);
        const thread = (await read.json()) as { ok?: boolean; messages?: WebsiteChatMessage[] };
        if (thread.ok && thread.messages) setMessages(thread.messages);
        setBody("");
        setStep("choose");
      } finally {
        setSending(false);
      }
    }
  }

  async function choose(channel: "chat" | "text") {
    if (!token || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, channel }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        phone?: string;
        visitorName?: string;
        visitorStreet?: string;
      };
      if (!data.ok) {
        setError(data.error || "Could not continue.");
        return;
      }
      if (channel === "text") {
        const destination = data.phone || office?.phone || "";
        setHandoff(
          messagesAppLink(
            destination,
            textHandoffBody(data.visitorName || draftName, data.visitorStreet || draftStreet),
            /iPhone|iPod/i.test(navigator.userAgent),
          ),
        );
        setStep("text");
        return;
      }
      const read = await fetch(`/api/chat/messages?token=${encodeURIComponent(token)}`);
      const thread = (await read.json()) as { ok?: boolean; messages?: WebsiteChatMessage[] };
      if (thread.ok && thread.messages) setMessages(thread.messages);
      setStep("chat");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const text = body.trim();
    if (!text || !token) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, body: text }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; message?: WebsiteChatMessage };
      if (!data.ok || !data.message) {
        setError(data.error || "Could not send that.");
        return;
      }
      setMessages((current) => [...current, data.message as WebsiteChatMessage]);
      setBody("");
    } finally {
      setSending(false);
    }
  }

  const shown = prompt && !messages.some((message) => message.body === prompt)
    ? [...messages, { id: "prompt", direction: "outbound" as const, body: prompt, createdAt: "" }]
    : messages;

  const mark = officeInitial(office?.companyName || "");
  const placeholder =
    step === "phone" ? "(469) 555-0100" : step === "street" ? "123 Oak Street" : step === "name" ? "Your name" : "Write a message";

  const panel = !ready ? (
    <div className="flex flex-1 items-center justify-center px-6">
      <p className="text-sm text-muted-foreground">Opening chat…</p>
    </div>
  ) : !token ? (
    <div className="flex flex-1 items-center px-6">
      <p className="text-sm leading-relaxed text-muted-foreground">{error || "Chat is not available."}</p>
    </div>
  ) : step === "text" ? (
    <div className="flex flex-1 flex-col justify-center gap-5 px-5 py-6">
      <div>
        <p className="font-heading text-[1.65rem] leading-none text-foreground">Text {name}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This opens Messages with your name and street already written.
        </p>
      </div>
      {handoff ? (
        <a
          href={handoff}
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Open Messages
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">This office does not have a main phone yet. Keep talking here.</p>
      )}
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4">
        {shown.map((message) => {
          const mine = message.direction === "inbound";
          return (
            <p
              key={message.id}
              className={cn(
                "max-w-[84%] px-3.5 py-2.5 text-sm leading-snug break-words whitespace-pre-wrap",
                mine
                  ? "ml-auto rounded-[18px] rounded-br-[5px] bg-primary text-primary-foreground"
                  : "mr-auto rounded-[18px] rounded-bl-[5px] border border-border/80 bg-card text-foreground",
              )}
            >
              {message.body}
            </p>
          );
        })}
      </div>
      {error ? <p className="px-4 pb-1 text-xs text-destructive">{error}</p> : null}
      {step === "choose" ? (
        <div className="grid gap-2 border-t border-border bg-background px-3 py-3">
          <button
            type="button"
            disabled={sending}
            className="h-11 rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void choose("chat")}
          >
            Keep talking here
          </button>
          <button
            type="button"
            disabled={sending || !office?.phone}
            className="h-11 rounded-full border border-border bg-card text-sm font-medium disabled:opacity-50"
            onClick={() => void choose("text")}
          >
            Text the office
          </button>
          {!office?.phone ? (
            <p className="text-center text-xs text-muted-foreground">This office does not have a main phone yet.</p>
          ) : null}
        </div>
      ) : (
        <form
          className="flex items-center gap-2 border-t border-border bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            if (step === "chat") {
              event.preventDefault();
              void send();
              return;
            }
            void answer(event);
          }}
        >
          <label className="sr-only" htmlFor="website-chat-body">
            Message
          </label>
          <input
            id="website-chat-body"
            ref={field}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={placeholder}
            inputMode={step === "phone" ? "tel" : "text"}
            autoComplete={step === "name" ? "name" : step === "phone" ? "tel" : step === "street" ? "street-address" : "off"}
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="submit"
            disabled={sending || !body.trim() || !token}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div
      className={
        embed
          ? "fixed inset-0 bg-transparent"
          : "flex min-h-dvh items-end justify-center bg-muted p-4 sm:items-center"
      }
    >
      <div className={embed ? "relative h-full w-full" : "flex w-full max-w-[380px] flex-col"}>
        {open ? (
          <section
            aria-label={`Chat with ${name}`}
            className={cn(
              "flex flex-col overflow-hidden bg-background",
              embed
                ? "absolute inset-0 h-full"
                : "h-[min(640px,calc(100dvh-2rem))] rounded-[20px] border border-border shadow-[0_22px_50px_rgba(28,12,8,0.18)]",
            )}
          >
            <header className="flex items-center gap-3 bg-primary px-4 py-3.5 text-primary-foreground">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 font-heading text-lg leading-none">
                {mark || <ChatGlyph className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-[1.2rem] leading-none font-medium">{name}</span>
                <span className="mt-1 block text-xs text-primary-foreground/75">Replies from the office</span>
              </span>
              {embed ? (
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-full text-primary-foreground/85 hover:bg-white/10"
                  aria-label="Close chat"
                  onClick={() => {
                    publishSize(false);
                    setOpen(false);
                  }}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </header>
            {panel}
          </section>
        ) : null}
        {embed && !open ? (
          <button
            type="button"
            aria-label="Open chat"
            aria-expanded={false}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:brightness-110"
            onClick={() => {
              publishSize(true);
              setOpen(true);
            }}
          >
            <ChatGlyph className="size-7" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
