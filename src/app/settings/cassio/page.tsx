"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { ASSISTANT_NAME } from "@/lib/product";
import { ZEROSETTLE_CONSOLE } from "@/lib/zerosettle";

type LineChoice = { id: string; number: string; groupId: string };

type LineStatus = {
  ok?: boolean;
  linked?: boolean;
  lineNumber?: string;
  yourNumber?: string;
  active?: boolean;
  managedBy?: string;
  profileName?: string;
  tokenHint?: string;
  creditsLeft?: number | null;
  crmUpdates?: boolean;
  groupMessages?: boolean;
  bookReady?: boolean;
  seedVerified?: boolean;
  seedPhrase?: string;
  profileWarning?: string;
  sharesSender?: boolean;
  lines?: LineChoice[];
  error?: string;
  sql?: string;
  code?: string;
};

export default function CassioLineSettingsPage() {
  const crm = useCrm();
  const [info, setInfo] = useState<LineStatus | null>(null);
  const [token, setToken] = useState("");
  const [lineId, setLineId] = useState("");
  const [choices, setChoices] = useState<LineChoice[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cassio/line")
      .then((response) => response.json())
      .then((data: LineStatus) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ ok: false, linked: false, error: "Could not load the assistant line." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect(extra?: { refresh?: boolean; disconnect?: boolean }) {
    if (extra?.disconnect && !window.confirm(`Disconnect ${ASSISTANT_NAME} from this ZeroSettle number? The assistant keeps answering there until you turn it off in ZeroSettle.`)) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/cassio/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          lineId,
          ...extra,
        }),
      });
      const data = (await response.json()) as LineStatus;
      if (!response.ok) {
        if (data.code === "choose_line" && data.lines?.length) {
          setChoices(data.lines);
          setLineId(data.lines[0]?.id || data.lines[0]?.number || "");
          toast.error(data.error || "Choose a number.");
          return;
        }
        toast.error(data.error || "Could not connect ZeroSettle.");
        if (data.sql) setInfo((current) => ({ ...current, sql: data.sql, error: data.error }));
        return;
      }
      setToken("");
      setChoices([]);
      setInfo(data);
      if (data.profileWarning) toast.message(data.profileWarning);
      toast.success(extra?.disconnect ? `${ASSISTANT_NAME} disconnected.` : `${ASSISTANT_NAME} is on your ZeroSettle number.`);
    } finally {
      setPending(false);
    }
  }

  async function seed(action: "issue" | "check" | "clear") {
    setPending(true);
    try {
      const response = await fetch("/api/cassio/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as LineStatus;
      if (!response.ok) {
        toast.error(data.error || "Could not verify the Seeds group.");
        return;
      }
      setInfo((current) => ({
        ...current,
        seedVerified: data.seedVerified,
        seedPhrase: data.seedPhrase ?? "",
      }));
      toast.success(
        action === "clear" ? "Seeds group forgotten." : data.seedVerified ? "Seeds group verified." : "Phrase ready.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!crm.hydrated || info === null) return <LoadingScreen />;
  if (!crm.viewer) {
    return (
      <EmptyState
        title={`Sign in to connect ${ASSISTANT_NAME}`}
        description="Each person connects their own ZeroSettle number."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  const linked = Boolean(info.linked);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <SettingsPageHeader
        eyebrow="You"
        title={`${ASSISTANT_NAME} on iMessage`}
        description={`Connect your own ZeroSettle number so ${ASSISTANT_NAME} can text with you. Client texts stay on the office Photon line.`}
      />

      {info.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-[#ebe7e2] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <div>
          <h2 className="text-base font-semibold">Your number</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Paste an API token from your own ZeroSettle account. {ASSISTANT_NAME} on this number is hosted by ZeroSettle.
            It answers you there. It does not send homeowner texts, and it does not use the office line.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Subscribe in the ZeroSettle console, then mint an API token there.</li>
            <li>Paste it here on the live site and press Connect. If it is already connected, leave the token blank and press Update {ASSISTANT_NAME}.</li>
            <li>Text that number from your own phone. Ask whether a homeowner opened an estimate.</li>
            <li>Book questions are answered in that private text and in the verified Seeds group. Any other group stays quiet. Dollar amounts stay in the private text.</li>
          </ol>
        </div>

        {linked ? (
          <div className="space-y-1 text-sm">
            <p>
              Connected to {info.lineNumber}
              {info.profileName ? ` · card name ${info.profileName}` : ""}.
            </p>
            <p className="text-muted-foreground">
              {info.active ? "Paid" : "Not paid"}
              {info.yourNumber ? ` · you text from ${info.yourNumber}` : ""}
              {info.tokenHint ? ` · token ending ${info.tokenHint}` : ""}
              {typeof info.creditsLeft === "number" ? ` · ${info.creditsLeft} assistant credits left` : ""}.
            </p>
            <p className="text-muted-foreground">
              {info.bookReady
                ? `In a private text from your phone, this number can look up estimate opens, draft an estimate for you to review, log a communication, and book an appointment after you reply YES. Dollar amounts stay in that private text.`
                : `Press Update ${ASSISTANT_NAME} on the live site so this number can look up your book.`}
            </p>
            {info.sharesSender ? (
              <p className="text-muted-foreground">
                Other numbers share this sender, so the contact card was left as it was.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No ZeroSettle number is connected for this seat.</p>
        )}

        <div className="space-y-2">
          <Label htmlFor="cassio-zerosettle-token">
            {linked && info.tokenHint ? `API token ending ${info.tokenHint} (leave blank to keep)` : "API token"}
          </Label>
          <Input
            id="cassio-zerosettle-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="new-password"
            placeholder={linked ? "••••••••" : "Paste the ZeroSettle API token"}
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Mint it in the{" "}
            <a className="font-medium text-primary hover:underline" href={ZEROSETTLE_CONSOLE} target="_blank" rel="noreferrer">
              ZeroSettle console
            </a>
            . Subscribe there if the line is not paid yet. The token stays on your seat.
          </p>
        </div>

        {choices.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="cassio-line">Number for {ASSISTANT_NAME}</Label>
            <select
              id="cassio-line"
              className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-sm"
              value={lineId}
              onChange={(event) => setLineId(event.target.value)}
            >
              {choices.map((choice) => (
                <option key={choice.id || choice.number} value={choice.id || choice.number}>
                  {choice.number}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {linked ? (
          <div className="space-y-2 border-t border-[#ebe7e2] pt-4">
            <h3 className="text-sm font-semibold">Seeds group</h3>
            <p className="text-sm text-muted-foreground">
              Add this number to the Seeds group and send the phrase below in that group. Cassio answers book questions
              in that verified group, and lead updates go only there. Dollar amounts stay out of the group.
            </p>
            {info.seedVerified ? (
              <p className="text-sm">Seeds group verified.</p>
            ) : (
              <p className="text-sm text-muted-foreground">No Seeds group is verified for this seat.</p>
            )}
            {info.seedPhrase ? (
              <p className="rounded-md bg-[#f6f4f1] px-3 py-2 font-mono text-sm">{info.seedPhrase}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => void seed("issue")}>
                {info.seedPhrase ? "New phrase" : "Create phrase"}
              </Button>
              {info.seedPhrase ? (
                <Button type="button" disabled={pending} onClick={() => void seed("check")}>
                  I sent it
                </Button>
              ) : null}
              {info.seedVerified ? (
                <Button type="button" variant="outline" disabled={pending} onClick={() => void seed("clear")}>
                  Forget this group
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => void connect(linked && !token.trim() ? { refresh: true } : undefined)}>
            {linked ? `Update ${ASSISTANT_NAME}` : `Connect ${ASSISTANT_NAME}`}
          </Button>
          {linked ? (
            <Button type="button" variant="outline" disabled={pending} onClick={() => void connect({ disconnect: true })}>
              Disconnect
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
