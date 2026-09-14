"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Info = {
  email: string;
  companyName: string;
  unsubscribed: boolean;
};

export function UnsubscribeClient({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`);
      const payload = (await response.json().catch(() => null)) as (Info & { error?: string }) | null;
      if (cancelled) return;
      if (!response.ok || !payload || payload.error) {
        setError(payload?.error || "That unsubscribe link is not valid.");
        return;
      }
      setInfo(payload);
      setDone(Boolean(payload.unsubscribed));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirm() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/marketing/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error || "Could not unsubscribe.");
      return;
    }
    setDone(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-16">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Email</p>
      <h1 className="mt-2 font-heading text-3xl font-medium tracking-tight">Unsubscribe</h1>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {!error && !info ? <p className="mt-4 text-sm text-muted-foreground">Checking that link…</p> : null}
      {info && !done ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Stop marketing emails from {info.companyName || "this contractor"} to{" "}
            <span className="font-medium text-foreground">{info.email}</span>. Job, estimate, and invoice
            messages are not affected.
          </p>
          <Button type="button" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Saving…" : "Unsubscribe"}
          </Button>
        </div>
      ) : null}
      {info && done ? (
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          {info.email} is unsubscribed from {info.companyName || "this contractor"} marketing emails.
        </p>
      ) : null}
    </main>
  );
}
