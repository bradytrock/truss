"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import {
  isPhoneUserAgent,
  messagesAppLink,
  WEBSITE_CHAT_GREETING,
  type WebsiteChatMessage,
} from "@/lib/website-chat";

type Office = { companyName: string; phone: string };

export function WebsiteChatWidget({ companySlug, embed }: { companySlug: string; embed: boolean }) {
  const [open, setOpen] = useState(!embed);
  const [office, setOffice] = useState<Office | null>(null);
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState<WebsiteChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState(false);
  const [handoff, setHandoff] = useState("");
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embed || window.parent === window) return;
    window.parent.postMessage({ type: "truss-chat-size", open }, window.location.origin);
  }, [embed, open]);

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = isPhoneUserAgent(ua);
    const storageKey = `truss.websiteChat.${companySlug}`;
    const saved = window.localStorage.getItem(storageKey) || "";
    let cancelled = false;

    async function boot() {
      const lookedUp = await fetch(`/api/chat/lookup?company=${encodeURIComponent(companySlug)}`);
      const officeData = (await lookedUp.json()) as Office & { ok?: boolean; error?: string };
      if (cancelled) return;
      if (!officeData.ok) {
        setError(officeData.error || "Chat is not available.");
        setReady(true);
        return;
      }
      const nextOffice = {
        companyName: officeData.companyName || "Office",
        phone: officeData.phone || "",
      };
      setOffice(nextOffice);
      setPhone(mobile);
      if (mobile && nextOffice.phone) {
        setHandoff(
          messagesAppLink(nextOffice.phone, WEBSITE_CHAT_GREETING, /iPhone|iPod/i.test(ua)),
        );
        setReady(true);
        return;
      }

      if (saved) {
        const read = await fetch(`/api/chat/messages?token=${encodeURIComponent(saved)}`);
        const data = (await read.json()) as { ok?: boolean; messages?: WebsiteChatMessage[] };
        if (!cancelled && data.ok) {
          setToken(saved);
          setMessages(data.messages ?? []);
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
      const data = (await started.json()) as { ok?: boolean; token?: string; error?: string };
      if (cancelled) return;
      if (!data.ok || !data.token) {
        setError(data.error || "Chat is not available.");
        setReady(true);
        return;
      }
      window.localStorage.setItem(storageKey, data.token);
      setToken(data.token);
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
    if (!token || !open || phone) return;
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
  }, [token, open, phone]);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, open]);

  const name = office?.companyName || "the office";

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

  const panel = !ready ? (
    <p className="p-5 text-sm text-muted-foreground">Opening chat…</p>
  ) : phone && handoff ? (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <p className="text-sm font-semibold">Text {name}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          This opens Messages so you can text the office right away.
        </p>
      </div>
      <a
        href={handoff}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Open Messages
      </a>
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask {name} a question. A teammate replies here.</p>
        ) : (
          messages.map((message) => (
            <p
              key={message.id}
              className={
                message.direction === "outbound"
                  ? "ml-8 rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-8 rounded-2xl bg-muted px-3 py-2 text-sm"
              }
            >
              {message.body}
            </p>
          ))
        )}
      </div>
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
