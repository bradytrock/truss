"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import {
  MYCRMSIM_CHANNEL_LABELS,
  type MycrmsimChannel,
} from "@/lib/mycrmsim";
import { missingMycrmsimMessage } from "@/lib/supabase/schema-errors";

type ChannelOption = { id: MycrmsimChannel; label: string };

type SetupInfo = {
  configured?: boolean;
  linked?: boolean;
  linkedAt?: string | null;
  locationId?: string;
  channel?: MycrmsimChannel;
  webhookToken?: string;
  webhookUrl?: string;
  hostConfigured?: boolean;
  channels?: ChannelOption[];
  sql?: string | null;
  error?: string;
};

export default function TextsSettingsPage() {
  return (
    <SettingsAdminGate
      title="Text settings are restricted"
      description="Only a company admin can connect myCRMSIM for this company."
    >
      <TextsSettingsForm />
    </SettingsAdminGate>
  );
}

function TextsSettingsForm() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [locationId, setLocationId] = useState("");
  const [channel, setChannel] = useState<MycrmsimChannel>("sms");
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/mycrmsim/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
      if (data.locationId) setLocationId(data.locationId);
      if (data.channel) setChannel(data.channel);
    } catch {
      setInfo({ configured: false, sql: missingMycrmsimMessage() });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(extra?: { disconnect?: boolean; rotateWebhook?: boolean }) {
    setPending(true);
    try {
      const response = await fetch("/api/mycrmsim/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, channel, ...extra }),
      });
      const data = (await response.json()) as SetupInfo & { error?: string; ok?: boolean };
      if (!response.ok) {
        toast.error(data.error || "Could not save myCRMSIM settings.");
        return;
      }
      toast.success(extra?.disconnect ? "myCRMSIM disconnected." : "myCRMSIM settings saved.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function copyWebhook() {
    const url = info?.webhookUrl?.trim() ?? "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied.");
    } catch {
      toast.error("Could not copy that URL.");
    }
  }

  const channels = info?.channels?.length
    ? info.channels
    : (Object.entries(MYCRMSIM_CHANNEL_LABELS) as [MycrmsimChannel, string][]).map(([id, label]) => ({
        id,
        label,
      }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Texts"
        description="Inbox texts, share-link texts, automations, and voice-agent staff alerts go out through myCRMSIM."
      />

      {info?.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            In myCRMSIM, open Admin → Workspaces and add a workspace for this company. Paste the
            webhook URL below into that workspace, connect the location, and assign the SIM,
            iMessage, WhatsApp, or RCS device. Then paste the Location ID here.
            {info?.hostConfigured ? " This host also has a MYCRMSIM_LOCATION_ID fallback." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="mycrmsim-location">Location ID</Label>
            <Input
              id="mycrmsim-location"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              placeholder="Workspace location id"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mycrmsim-channel">Channel</Label>
            <select
              id="mycrmsim-channel"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              value={channel}
              onChange={(event) => setChannel(event.target.value as MycrmsimChannel)}
            >
              {channels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The device for this channel has to be assigned on the workspace or the send is accepted
              and then fails.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              {pending ? "Saving…" : "Save connection"}
            </Button>
            {info?.linked ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void save({ disconnect: true })}
              >
                Disconnect
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {info?.linked
              ? "This company is connected. Replies land in Inbox → Texts."
              : info?.hostConfigured
                ? "This host can send with MYCRMSIM_LOCATION_ID. Save the location on this company so replies land in the inbox."
                : "Not connected yet. Sends stay on the job and are not delivered."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook</CardTitle>
          <CardDescription>
            myCRMSIM posts inbound texts, delivery status, and call events here. Save once so the
            token is on the URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="mycrmsim-webhook">Webhook URL</Label>
            <Input id="mycrmsim-webhook" readOnly value={info?.webhookUrl ?? ""} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void copyWebhook()}>
              Copy URL
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !info?.linked}
              onClick={() => void save({ rotateWebhook: true })}
            >
              New token
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional header if you would rather not put the token in the URL:{" "}
            <span className="font-mono">x-webhook-token</span>
            {info?.webhookToken ? (
              <>
                {" "}
                = <span className="font-mono">{info.webhookToken}</span>
              </>
            ) : null}
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
