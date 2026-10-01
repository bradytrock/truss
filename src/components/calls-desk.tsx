"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Delete, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-chrome";
import { useSoftphone } from "@/lib/calls/softphone";
import { formatPhoneInput } from "@/lib/phone";
import type { CallSessionRow } from "@/lib/calls/types";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"] as const;

export function CallsDesk() {
  const phone = useSoftphone();
  const [digits, setDigits] = useState("");
  const [sessions, setSessions] = useState<CallSessionRow[]>([]);

  useEffect(() => {
    void fetch("/api/calls/sessions")
      .then((response) => response.json())
      .then((data: { sessions?: CallSessionRow[] }) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]));
  }, [phone.active?.sessionId]);

  async function placeCall() {
    if (!digits.trim()) return;
    try {
      await phone.dial(digits);
      toast.success("Calling…");
    } catch {
      // toast handled in provider
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <PageHeader
        title="Calls"
        description="Dial from your office Photon line through LiveKit. Softphone, cell, and app endpoints can ring together."
      />

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border px-4 py-5">
            <p className="mb-3 text-center font-mono text-2xl tracking-wide">
              {digits || "Enter a number"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="secondary"
                  className="h-12 text-lg"
                  onClick={() => setDigits((value) => formatPhoneInput(value + key))}
                >
                  {key}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setDigits((value) => value.slice(0, -1))}
              >
                <Delete className="size-4" />
                Clear
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={phone.dialing || !digits.trim() || Boolean(phone.active)}
                onClick={() => void placeCall()}
              >
                <Phone className="size-4" />
                {phone.dialing ? "Dialing…" : "Call"}
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure queues and who rings under{" "}
            <Link href="/settings/calling" className="underline underline-offset-2">
              Settings → Calling
            </Link>
            . Per-seat softphone / cell / app mix is under{" "}
            <Link href="/settings/people/calling" className="underline underline-offset-2">
              People → Calling
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Recent calls
          </h2>
          <ul className="divide-y rounded-lg border">
            {sessions.length === 0 ? (
              <li className="px-4 py-8 text-sm text-muted-foreground">No calls yet.</li>
            ) : (
              sessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      session.status === "active"
                        ? "bg-emerald-500"
                        : session.status === "missed"
                          ? "bg-amber-500"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {session.direction === "inbound"
                        ? formatPhoneInput(session.fromNumber) || "Inbound"
                        : formatPhoneInput(session.toNumber) || "Outbound"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.status}
                      {session.durationSeconds != null ? ` · ${session.durationSeconds}s` : ""}
                      {session.disposition ? ` · ${session.disposition}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(phone.active)}
                    onClick={() => {
                      const number =
                        session.direction === "inbound" ? session.fromNumber : session.toNumber;
                      if (!number) return;
                      setDigits(formatPhoneInput(number));
                      void phone.dial(number);
                    }}
                  >
                    Redial
                  </Button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
