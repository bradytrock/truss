"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { revokeIsPending } from "@/lib/stripe-company";

type StripeInfo = {
  connected?: boolean;
  revokeAt?: string | null;
  revokeRequestedBy?: string;
  webhookUrl?: string;
  emailed?: number;
  emailConfigured?: boolean;
  error?: string;
};

export function CompanyStripeSettings() {
  const [info, setInfo] = useState<StripeInfo | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [pending, setPending] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/stripe/company");
      const data = (await response.json()) as StripeInfo;
      if (!response.ok) {
        setInfo({ error: data.error || "Could not load Stripe settings." });
        return;
      }
      setInfo(data);
    } catch {
      setInfo({ error: "Could not load Stripe settings." });
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function save() {
    setPending(true);
    try {
      const response = await fetch("/api/stripe/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", secretKey, webhookSecret }),
      });
      const data = (await response.json()) as StripeInfo;
      if (!response.ok) {
        toast.error(data.error || "Could not save Stripe keys.");
        return;
      }
      setSecretKey("");
      setWebhookSecret("");
      setInfo(data);
      toast.success("Stripe is connected. This section is now locked.");
    } finally {
      setPending(false);
    }
  }

  async function requestRemoval() {
    if (
      !window.confirm(
        "Remove Stripe keys in 24 hours? Every company admin will be emailed. Card Pay stays on until then.",
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/stripe/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const data = (await response.json()) as StripeInfo;
      if (!response.ok) {
        toast.error(data.error || "Could not start Stripe key removal.");
        return;
      }
      setInfo(data);
      if (data.emailConfigured === false) {
        toast.message("Removal is scheduled. Resend is not connected, so admins were not emailed.");
      } else {
        toast.success("Removal is scheduled. Every company admin was emailed.");
      }
    } finally {
      setPending(false);
    }
  }

  const connected = Boolean(info?.connected);
  const pendingRevoke = revokeIsPending(info?.revokeAt ?? null);
  const revokeLabel = info?.revokeAt
    ? new Date(info.revokeAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Stripe</CardTitle>
        <CardDescription>
          This company’s card keys. After they are saved, the form disappears. Changing them starts a
          24-hour wait and emails every company admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {info === null ? <p className="text-sm text-muted-foreground">Loading Stripe…</p> : null}
        {info?.error ? <p className="text-sm text-destructive">{info.error}</p> : null}

        {info && !info.error && connected ? (
          <div className="space-y-3">
            <p className="text-sm">
              Stripe is connected. Card Pay is on for invoices and optional deposits. The keys are
              locked and cannot be viewed.
            </p>
            <CompanyWebhookUrl url={info.webhookUrl} />
            {pendingRevoke ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {info?.revokeRequestedBy || "A company admin"} scheduled removal. Keys come off{" "}
                {revokeLabel}. Every company admin was emailed.
              </p>
            ) : (
              <Button type="button" variant="outline" disabled={pending} onClick={() => void requestRemoval()}>
                {pending ? "Starting…" : "Remove Stripe keys"}
              </Button>
            )}
          </div>
        ) : info && !info.error ? (
          <div className="space-y-4">
            <CompanyWebhookUrl url={info.webhookUrl} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="stripe-secret">Secret key</Label>
                <Input
                  id="stripe-secret"
                  type="password"
                  autoComplete="off"
                  value={secretKey}
                  onChange={(event) => setSecretKey(event.target.value)}
                  placeholder="sk_live_…"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="stripe-webhook">Webhook signing secret</Label>
                <Input
                  id="stripe-webhook"
                  type="password"
                  autoComplete="off"
                  value={webhookSecret}
                  onChange={(event) => setWebhookSecret(event.target.value)}
                  placeholder="whsec_…"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              In Stripe, add an endpoint at this company’s URL for{" "}
              <span className="font-mono">checkout.session.completed</span>. Then paste both keys
              here. After save, this form locks. Do not use another office’s webhook URL.
            </p>
            <Button
              type="button"
              disabled={pending || !secretKey.trim() || !webhookSecret.trim()}
              onClick={() => void save()}
            >
              {pending ? "Saving…" : "Save and lock Stripe keys"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CompanyWebhookUrl({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="stripe-webhook-url">This company’s webhook URL</Label>
      <Input
        id="stripe-webhook-url"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <p className="text-xs text-muted-foreground">
        Unique to this office. Stripe events posted here cannot land on another company.
      </p>
    </div>
  );
}
