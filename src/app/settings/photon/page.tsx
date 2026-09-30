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
import { photonNotSetupMessage } from "@/lib/photon";
import { missingPhotonMessage } from "@/lib/supabase/schema-errors";

type SetupInfo = {
  linked?: boolean;
  companyName?: string;
  projectId?: string;
  projectName?: string;
  secretHint?: string;
  linkedAt?: string | null;
  sql?: string | null;
  error?: string;
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
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/photon/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
      if (data.projectId) setProjectId(data.projectId);
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
      })
      .catch(() => {
        if (!cancelled) setInfo({ linked: false, sql: missingPhotonMessage() });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(extra?: { disconnect?: boolean }) {
    if (extra?.disconnect && !window.confirm("Disconnect Photon for this company?")) return;
    setPending(true);
    try {
      const response = await fetch("/api/photon/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          projectSecret: projectSecret.trim(),
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
      if (data.projectId) setProjectId(data.projectId);
      toast.success(extra?.disconnect ? "Photon disconnected." : "Photon project saved.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  const connected = Boolean(info?.linked);
  const companyName = info?.companyName?.trim() || "";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Photon"
        description="Texts, share-link texts, automations, and voice-agent staff alerts go out through this office's Photon project."
      />

      {info?.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{info.sql}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>
            In Photon, open this office&apos;s project and copy the project id and project secret from
            project Settings. They stay on this company and are not shared with other offices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="photon-project-id">Project id</Label>
            <Input
              id="photon-project-id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              autoComplete="off"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              spellCheck={false}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="photon-project-secret">
              {connected && info?.secretHint
                ? `Project secret ending ${info.secretHint} (leave blank to keep)`
                : "Project secret"}
            </Label>
            <Input
              id="photon-project-secret"
              type="password"
              value={projectSecret}
              onChange={(event) => setProjectSecret(event.target.value)}
              autoComplete="new-password"
              placeholder={connected ? "••••••••" : "Paste the project secret"}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {connected
              ? `Connected${info?.projectName ? ` to ${info.projectName}` : ""}${info?.secretHint ? ` · secret ending ${info.secretHint}` : ""}.`
              : `${photonNotSetupMessage(companyName)} Add this office's Photon project below. Texts stay on the job until it is connected.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              {connected ? "Save project" : "Connect Photon"}
            </Button>
            {connected ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void save({ disconnect: true })}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Button nativeButton={false} variant="ghost" render={<Link href="/settings" />}>
        Back to company settings
      </Button>
    </div>
  );
}
