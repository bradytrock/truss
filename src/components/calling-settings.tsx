"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/phone-input";
import { copyText } from "@/lib/share";
import { formatPhoneInput } from "@/lib/phone";
import { missingCallingMessage } from "@/lib/supabase/schema-errors";

type SetupInfo = {
  livekitConfigured?: boolean;
  livekitUrl?: string;
  enabled?: boolean;
  configured?: boolean;
  officeLine?: string;
  livekitOutboundTrunkId?: string;
  livekitInboundTrunkId?: string;
  livekitDispatchRuleId?: string;
  webhookUrl?: string;
  inboundSipUriHint?: string;
  photonLinked?: boolean;
  photonProjectId?: string;
  sql?: string | null;
  error?: string;
};

export function CallingSettingsForm() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [officeLine, setOfficeLine] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/calls/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
      if (data.officeLine) setOfficeLine(formatPhoneInput(data.officeLine));
      if (typeof data.enabled === "boolean") setEnabled(data.enabled);
    } catch {
      setInfo({ sql: missingCallingMessage() });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(provisionTrunks: boolean) {
    setPending(true);
    try {
      const response = await fetch("/api/calls/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeLine, enabled, provisionTrunks }),
      });
      const data = (await response.json()) as SetupInfo & { ok?: boolean; error?: string };
      if (!response.ok) {
        toast.error(data.error || "Could not save calling settings.");
        return;
      }
      setInfo(data);
      toast.success(provisionTrunks ? "LiveKit SIP trunks provisioned." : "Calling settings saved.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  if (!info) {
    return <p className="text-sm text-muted-foreground">Loading calling settings…</p>;
  }

  if (info.sql) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Run the calling migration</CardTitle>
          <CardDescription>{info.sql}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Office calling line</CardTitle>
          <CardDescription>
            Uses this office&apos;s Photon project as the SIP trunk (same iMessage line people text).
            LiveKit Cloud bridges SIP to the web softphone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!info.livekitConfigured ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              Set <code className="font-mono text-xs">LIVEKIT_URL</code>,{" "}
              <code className="font-mono text-xs">LIVEKIT_API_KEY</code>, and{" "}
              <code className="font-mono text-xs">LIVEKIT_API_SECRET</code> on the host before
              provisioning trunks.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              LiveKit project: <span className="font-mono text-xs">{info.livekitUrl}</span>
            </p>
          )}
          {!info.photonLinked ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              Connect Photon under Settings → Photon first so outbound SIP can authenticate with the
              project id and secret.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="office-line">Office line (E.164 / Photon iMessage number)</Label>
            <PhoneInput id="office-line" value={officeLine} onValueChange={setOfficeLine} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
            Enable inbound and outbound calling for this office
          </label>

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => void save(false)}>
              Save
            </Button>
            <Button
              disabled={pending || !info.livekitConfigured || !info.photonLinked}
              variant="secondary"
              onClick={() => void save(true)}
            >
              Save and provision LiveKit SIP trunks
            </Button>
          </div>

          {info.configured ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Outbound trunk</dt>
                <dd className="font-mono text-xs break-all">{info.livekitOutboundTrunkId || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Inbound trunk</dt>
                <dd className="font-mono text-xs break-all">{info.livekitInboundTrunkId || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dispatch rule</dt>
                <dd className="font-mono text-xs break-all">{info.livekitDispatchRuleId || "—"}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photon inbound SIP URI</CardTitle>
          <CardDescription>
            In the Photon dashboard, point the line&apos;s inbound voice route at LiveKit over TLS
            (`sips:`). Registration stays off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
              {info.inboundSipUriHint}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void copyText(info.inboundSipUriHint || "").then((ok) =>
                  ok ? toast.success("Copied SIP URI hint.") : toast.error("Could not copy."),
                );
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Confirm the exact hostname in your LiveKit Cloud SIP settings if it differs from this
            hint. Audio uses RTP on Photon&apos;s side — trunks are provisioned with media encryption
            disabled so calls can negotiate.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>LiveKit webhook</CardTitle>
          <CardDescription>
            Point LiveKit room/participant webhooks here so inbound SIP callers start multi-ring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
              {info.webhookUrl}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void copyText(info.webhookUrl || "").then((ok) =>
                  ok ? toast.success("Copied webhook URL.") : toast.error("Could not copy."),
                );
              }}
            >
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
