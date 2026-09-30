"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { missingPhotonMessage } from "@/lib/supabase/schema-errors";

type SetupInfo = {
  linked?: boolean;
  projectId?: string;
  fromNumber?: string;
  fromLabel?: string;
  hasProjectSecret?: boolean;
  hasWebhookSecret?: boolean;
  webhookUrl?: string;
  linkedAt?: string | null;
  sql?: string | null;
  error?: string;
  webhookError?: string | null;
};

export default function PhotonSettingsPage() {
  return (
    <SettingsAdminGate
      title="Photon settings are restricted"
      description="Only a company admin can connect this office's Photon project."
    >
      <PhotonSettingsForm />
    </SettingsAdminGate>
  );
}

function PhotonSettingsForm() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [projectId, setProjectId] = useState("");
  const [projectSecret, setProjectSecret] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/photon/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
      if (data.projectId) setProjectId(data.projectId);
      if (data.fromNumber) setFromNumber(data.fromNumber);
    } catch {
      setInfo({ linked: false, sql: missingPhotonMessage() });
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/photon/setup")
      .then((response) => response.json())
      .then((data: SetupInfo) => {
        if (cancelled) return;
        setInfo(data);
        if (data.projectId) setProjectId(data.projectId);
        if (data.fromNumber) setFromNumber(data.fromNumber);
      })
      .catch(() => {
        if (!cancelled) setInfo({ linked: false, sql: missingPhotonMessage() });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(extra?: { disconnect?: boolean; rotateWebhook?: boolean }) {
    if (extra?.disconnect && !window.confirm("Disconnect Photon for this company?")) return;
    setPending(true);
    try {
      const response = await fetch("/api/photon/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          projectSecret: projectSecret.trim() || undefined,
          fromNumber: fromNumber.trim(),
          webhookSecret: webhookSecret.trim() || undefined,
          ...extra,
        }),
      });
      const data = (await response.json()) as SetupInfo & { ok?: boolean };
      if (!response.ok) {
        toast.error(data.error || "Could not save Photon settings.");
        if (data.sql) setInfo((current) => ({ ...current, sql: data.sql }));
        return;
      }
      setProjectSecret("");
      setWebhookSecret("");
      if (extra?.disconnect) {
        setProjectId("");
        setFromNumber("");
        toast.success("Photon disconnected for this company.");
      } else if (data.webhookError) {
        toast.success("Photon saved for this company.");
        toast.error(data.webhookError);
      } else toast.success("Photon saved for this company.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Photon"
        description="Each company uses its own Photon project, line, and webhook. These are not shared across offices."
      />

      {info?.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>This company's Photon project</CardTitle>
          <CardDescription>
            From the Photon dashboard for this business: project id, project secret, and the dedicated
            iMessage line. Truss registers the inbound URL when it can, and stores the signing secret
            on this company.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="photon-project-id">Project id</Label>
              <Input
                id="photon-project-id"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                autoComplete="off"
                placeholder="Spectrum project id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photon-project-secret">
                Project secret{info?.hasProjectSecret ? " (saved — leave blank to keep)" : ""}
              </Label>
              <Input
                id="photon-project-secret"
                type="password"
                value={projectSecret}
                onChange={(event) => setProjectSecret(event.target.value)}
                autoComplete="new-password"
                placeholder={info?.hasProjectSecret ? "••••••••" : "Spectrum project secret"}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="photon-from-number">Dedicated line</Label>
            <Input
              id="photon-from-number"
              value={fromNumber}
              onChange={(event) => setFromNumber(event.target.value)}
              autoComplete="off"
              placeholder="+1 555 123 4567"
            />
            {info?.fromLabel ? (
              <p className="text-xs text-muted-foreground">Texts from this company show {info.fromLabel}.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="photon-webhook-secret">
              Webhook signing secret{info?.hasWebhookSecret ? " (saved — leave blank to keep)" : ""}
            </Label>
            <Input
              id="photon-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              autoComplete="new-password"
              placeholder={info?.hasWebhookSecret ? "••••••••" : "Paste it if automatic registration fails"}
            />
          </div>
          {info?.webhookUrl ? (
            <div className="space-y-2">
              <Label htmlFor="photon-webhook-url">Inbound URL for this company</Label>
              <Input id="photon-webhook-url" readOnly value={info.webhookUrl} />
              <p className="text-xs text-muted-foreground">
                Register this URL on this company's Photon project. Other offices have their own URL.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              Save
            </Button>
            {info?.linked ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void save({ rotateWebhook: true })}>
                Rotate webhook
              </Button>
            ) : null}
            {info?.linked ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => void save({ disconnect: true })}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
