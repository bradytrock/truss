"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { missingCompanyCamMessage } from "@/lib/supabase/schema-errors";

type SetupInfo = {
  linked?: boolean;
  companyName?: string;
  tokenHint?: string;
  linkedAt?: string | null;
  webhookRegistered?: boolean;
  webhookUrl?: string;
  sql?: string | null;
  error?: string;
  webhookError?: string | null;
};

export default function CompanyCamSettingsPage() {
  return (
    <SettingsAdminGate
      title="CompanyCam settings are restricted"
      description="Only a company admin can connect this office's CompanyCam account."
    >
      <CompanyCamSettingsForm />
    </SettingsAdminGate>
  );
}

function CompanyCamSettingsForm() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/companycam/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
    } catch {
      setInfo({ linked: false, sql: missingCompanyCamMessage() });
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/companycam/setup")
      .then((response) => response.json())
      .then((data: SetupInfo) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo({ linked: false, sql: missingCompanyCamMessage() });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(extra?: { disconnect?: boolean; rotateWebhook?: boolean }) {
    if (extra?.disconnect && !window.confirm("Disconnect CompanyCam for this company?")) return;
    setPending(true);
    try {
      const response = await fetch("/api/companycam/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: accessToken.trim() || undefined,
          ...extra,
        }),
      });
      const data = (await response.json()) as SetupInfo & { ok?: boolean };
      if (!response.ok) {
        toast.error(data.error || "Could not save CompanyCam settings.");
        if (data.sql) setInfo((current) => ({ ...current, sql: data.sql }));
        return;
      }
      setAccessToken("");
      if (extra?.disconnect) toast.success("CompanyCam disconnected.");
      else if (data.webhookError) {
        toast.success(`Connected to ${data.companyName || "CompanyCam"}.`);
        toast.error(data.webhookError);
      } else toast.success(`Connected to ${data.companyName || "CompanyCam"}.`);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  const connected = Boolean(info?.linked);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="CompanyCam"
        description="Connect this company's own CompanyCam account. Jobs can link a project and pull those photos into the gallery."
      />

      {info?.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Access token</CardTitle>
          <CardDescription>
            In CompanyCam, open Integrations, then Access Tokens. Create an Application Key (or a
            personal access token) with Read &amp; Write, and paste it here. The key stays on this
            company and is not shared with other offices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cc-token">
              {connected && info?.tokenHint
                ? `Token ending ${info.tokenHint} (leave blank to keep)`
                : "CompanyCam token"}
            </Label>
            <Input
              id="cc-token"
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              autoComplete="new-password"
              placeholder={connected ? "••••••••" : "Paste the Application Key"}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {connected
              ? `Connected to ${info?.companyName || "CompanyCam"}${info?.tokenHint ? ` · token ending ${info.tokenHint}` : ""}.`
              : "Not connected. Photos stay in CompanyCam until you link a project on a job and pull them."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              {connected ? "Save connection" : "Connect CompanyCam"}
            </Button>
            {connected ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void save({ disconnect: true })}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photo webhook</CardTitle>
          <CardDescription>
            Saving a token registers this URL with that CompanyCam account. New photos on a linked
            project land on the job. Keys expire in CompanyCam, so paste a fresh one before the
            current key stops working.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cc-webhook">Webhook URL</Label>
            <Input
              id="cc-webhook"
              readOnly
              value={info?.webhookUrl || ""}
              onFocus={(event) => event.target.select()}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {info?.webhookRegistered
              ? "Webhook is registered with CompanyCam."
              : "Webhook is not registered yet. Save the connection to register it, or pull photos from the job."}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !connected}
            onClick={() => void save({ rotateWebhook: true })}
          >
            Register webhook again
          </Button>
          <Button nativeButton={false} variant="ghost" render={<Link href="/settings" />}>
            Back to company settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
