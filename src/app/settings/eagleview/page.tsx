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
import { EAGLEVIEW_PRODUCTS, type EagleviewProductId } from "@/lib/eagleview";
import { missingEagleviewMessage } from "@/lib/supabase/schema-errors";

type SetupInfo = {
  configured?: boolean;
  linked?: boolean;
  linkedAt?: string | null;
  clientId?: string;
  hasSecret?: boolean;
  sandbox?: boolean;
  defaultProduct?: EagleviewProductId;
  webhookToken?: string;
  webhookUrl?: string;
  hostConfigured?: boolean;
  live?: boolean;
  sql?: string | null;
  error?: string;
};

export default function EagleviewSettingsPage() {
  return (
    <SettingsAdminGate
      title="EagleView settings are restricted"
      description="Only a company admin can connect EagleView credentials for the office."
    >
      <EagleviewSettingsForm />
    </SettingsAdminGate>
  );
}

function EagleviewSettingsForm() {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const [defaultProduct, setDefaultProduct] = useState<EagleviewProductId>("premium_residential");
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/eagleview/setup");
      const data = (await response.json()) as SetupInfo;
      setInfo(data);
      if (data.clientId) setClientId(data.clientId);
      if (typeof data.sandbox === "boolean") setSandbox(data.sandbox);
      if (data.defaultProduct) setDefaultProduct(data.defaultProduct);
    } catch {
      setInfo({ configured: false, sql: missingEagleviewMessage() });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save(extra?: { disconnect?: boolean; rotateWebhook?: boolean }) {
    setPending(true);
    try {
      const response = await fetch("/api/eagleview/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          clientSecret: clientSecret.trim() || undefined,
          sandbox,
          defaultProduct,
          ...extra,
        }),
      });
      const data = (await response.json()) as SetupInfo & { error?: string; ok?: boolean };
      if (!response.ok) {
        toast.error(data.error || "Could not save EagleView settings.");
        return;
      }
      setClientSecret("");
      toast.success(extra?.disconnect ? "EagleView disconnected." : "EagleView settings saved.");
      await refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="EagleView"
        description="Order roof measurement reports from EagleView on a job. Reports land in Files; squares can be applied to estimate lines."
      />

      {info?.sql ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {info.sql}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>API credentials</CardTitle>
          <CardDescription>
            Company credentials from your EagleView developer account. Without them, Truss places
            mock reports so you can try the flow. Host env{" "}
            <code className="text-xs">EAGLEVIEW_CLIENT_ID</code> /{" "}
            <code className="text-xs">EAGLEVIEW_CLIENT_SECRET</code> also work
            {info?.hostConfigured ? " (detected on this host)." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ev-client-id">Client ID</Label>
              <Input
                id="ev-client-id"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
                placeholder="EagleView client id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-client-secret">
                Client secret{info?.hasSecret ? " (saved — leave blank to keep)" : ""}
              </Label>
              <Input
                id="ev-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                autoComplete="new-password"
                placeholder={info?.hasSecret ? "••••••••" : "EagleView client secret"}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ev-product">Default product</Label>
            <select
              id="ev-product"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
              value={defaultProduct}
              onChange={(event) => setDefaultProduct(event.target.value as EagleviewProductId)}
            >
              {EAGLEVIEW_PRODUCTS.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Product IDs map to EagleView catalog values — confirm them in your EagleView account.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sandbox}
              onChange={(event) => setSandbox(event.target.checked)}
              className="size-4 rounded border"
            />
            Use EagleView sandbox API
          </label>
          <p className="text-xs text-muted-foreground">
            Sandbox is often unreliable. For real job addresses, leave this unchecked (production API).
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void save()}>
              Save connection
            </Button>
            {info?.linked || info?.hasSecret || clientId ? (
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

          <p className="text-sm text-muted-foreground">
            Status:{" "}
            {info?.live
              ? "Live credentials available — orders go to EagleView."
              : "Mock mode — orders complete instantly with sample squares."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status webhook</CardTitle>
          <CardDescription>
            Point EagleView status notifications at this URL. Include the token so Truss can match
            the company.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input readOnly value={info?.webhookUrl || ""} onFocus={(event) => event.target.select()} />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void save({ rotateWebhook: true })}
          >
            Rotate webhook token
          </Button>
          <p className="text-sm text-muted-foreground">
            After a report is ready, open the job and use <strong>Pull report</strong> if
            measurements are not filled yet, then <strong>Apply to estimate</strong>.
          </p>
          <Button nativeButton={false} variant="ghost" render={<Link href="/settings" />}>
            Back to company settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
