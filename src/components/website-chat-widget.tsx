"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquare, Send, X } from "lucide-react";
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

  useEffect(() => {
    if (!embed || window.parent === window) return;
    window.parent.postMessage({ type: "truss-chat-size", open }, window.location.origin);
  }, [embed, open]);

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

  const panel = !ready ? (
    <p className="p-5 text-sm text-muted-foreground">Opening chat…</p>
  ) : step === "text" ? (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <p className="text-sm font-semibold">Text {name}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This opens Messages with your name and street already written.
        </p>
      </div>
      {handoff ? (
        <a
          href={handoff}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Open Messages
        </a>
      ) : (
        <p className="text-sm text-muted-foreground">This office does not have a main phone yet. Keep talking here.</p>
      )}
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {shown.map((message) => (
          <p
            key={message.id}
            className={
              message.direction === "outbound"
                ? "mr-8 rounded-2xl bg-muted px-3 py-2 text-sm"
                : "ml-8 rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
            }
          >
            {message.body}
          </p>
        ))}
      </div>
      {step === "choose" ? (
        <div className="grid gap-2 border-t p-3">
          <button
            type="button"
            disabled={sending}
            className="h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={() => void choose("chat")}
          >
            Keep talking here
          </button>
          <button
            type="button"
            disabled={sending || !office?.phone}
            className="h-10 rounded-md border text-sm font-medium disabled:opacity-50"
            onClick={() => void choose("text")}
          >
            Text the office
          </button>
        </div>
      ) : step === "chat" ? (
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a message"
            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !body.trim() || !token}
            className="inline-flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        </form>
      ) : (
        <form className="flex gap-2 border-t p-3" onSubmit={(event) => void answer(event)}>
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={step === "phone" ? "(469) 555-0100" : step === "street" ? "123 Oak Street" : "Your name"}
            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !body.trim() || !token}
            className="inline-flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className={embed ? "h-dvh w-full bg-transparent" : "flex min-h-dvh items-end justify-center bg-muted/40 p-4 sm:items-center"}>
      <div className={embed ? "flex h-full flex-col items-end justify-end" : "flex w-full max-w-md flex-col items-end"}>
        {open ? (
          <section className="mb-3 flex h-[min(560px,calc(100dvh-7rem))] w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-xl">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">Website chat</p>
              </div>
              {embed ? (
                <button type="button" className="rounded-md p-1 text-muted-foreground" aria-label="Close chat" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </button>
              ) : null}
            </header>
            {error ? <p className="px-4 pt-3 text-xs text-destructive">{error}</p> : null}
            {panel}
          </section>
        ) : null}
        {embed ? (
          <button
            type="button"
            aria-label={open ? "Close chat" : "Open chat"}
            className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <MessageSquare className="size-5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
