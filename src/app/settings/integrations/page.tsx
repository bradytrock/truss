"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/page-chrome";
import { SettingsCard, SettingsPageHeader } from "@/components/settings-chrome";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings, canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

type Connection = {
  id: string;
  name: string;
  detail: string;
  href: string;
  mark: string;
  admin?: boolean;
  status: "unknown" | "on" | "off";
};

const CARDS: Connection[] = [
  {
    id: "eagleview",
    name: "EagleView",
    detail: "Order reports from a job and drop measurements straight into estimates.",
    href: "/settings/integrations/eagleview",
    mark: "EV",
    admin: true,
    status: "unknown",
  },
  {
    id: "companycam",
    name: "CompanyCam",
    detail: "Photos sync to the matching job by address.",
    href: "/settings/integrations/companycam",
    mark: "CC",
    admin: true,
    status: "unknown",
  },
  {
    id: "stripe",
    name: "Stripe",
    detail: "Card and ACH payments on invoices, with payouts to the company account.",
    href: "/settings/integrations/stripe",
    mark: "S",
    admin: true,
    status: "unknown",
  },
  {
    id: "messaging",
    name: "Messaging",
    detail: "Office texts and the mailbox this company sends from.",
    href: "/settings/integrations/messaging",
    mark: "M",
    admin: true,
    status: "unknown",
  },
  {
    id: "quickbooks",
    name: "QuickBooks Desktop",
    detail: "Accounting via Web Connector.",
    href: "/settings/integrations/quickbooks",
    mark: "QB",
    status: "unknown",
  },
  {
    id: "hubspot",
    name: "HubSpot import",
    detail: "Bring deals over as homeowners, leads, and jobs — verified row by row, with no automations firing.",
    href: "/settings/integrations/hubspot",
    mark: "HS",
    admin: true,
    status: "unknown",
  },
];

export default function IntegrationsIndexPage() {
  const crm = useCrm();
  const router = useRouter();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  const accounting = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));

  useEffect(() => {
    if (!crm.hydrated) return;
    if (!admin && !accounting) router.replace("/");
  }, [accounting, admin, crm.hydrated, router]);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!admin && !accounting) return <LoadingScreen />;

  return <IntegrationsHub admin={admin} />;
}

function IntegrationsHub({ admin }: { admin: boolean }) {
  const [cards, setCards] = useState(CARDS.filter((card) => admin || !card.admin));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [eagle, cam, stripe, text] = await Promise.all([
        fetch("/api/eagleview/setup").then((response) => response.json()).catch(() => ({})),
        fetch("/api/companycam/setup").then((response) => response.json()).catch(() => ({})),
        fetch("/api/stripe/company").then((response) => response.json()).catch(() => ({})),
        fetch("/api/share/text").then((response) => response.json()).catch(() => ({})),
      ]);
      if (cancelled) return;
      const linked: Record<string, boolean> = {
        eagleview: Boolean(eagle.linked || eagle.configured),
        companycam: Boolean(cam.linked),
        stripe: Boolean(stripe.connected),
        messaging: Boolean(text.configured),
      };
      setCards((current) =>
        current.map((card) =>
          card.id in linked ? { ...card, status: linked[card.id] ? "on" : "off" } : card,
        ),
      );
    }
    if (admin) void load();
    return () => {
      cancelled = true;
    };
  }, [admin]);

  const connected = cards.filter((card) => card.status === "on");
  const available = cards.filter((card) => card.status !== "on");

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        eyebrow="Operations"
        title="Integrations"
        description="Measurements, photos, payments, accounting, and calendars — connected once for the whole company."
      />

      {connected.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Connected</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {connected.map((card) => (
              <IntegrationCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{connected.length > 0 ? "Available" : "Connect"}</h2>
        <SettingsCard className="divide-y divide-[#f0ece8]">
          {available.map((card) => (
            <div key={card.id} className="flex items-center gap-3 px-4 py-3">
              <Mark letters={card.mark} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{card.name}</p>
                <p className="text-xs text-muted-foreground">{card.detail}</p>
              </div>
              <Button nativeButton={false} size="sm" className="rounded-lg" render={<Link href={card.href} />}>
                {card.status === "unknown" ? "Manage" : "Connect"}
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-4 py-3">
            <Mark letters="GC" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Google Calendar</p>
              <p className="text-xs text-muted-foreground">Inspections and builds on each person’s calendar.</p>
            </div>
            <Button nativeButton={false} size="sm" variant="outline" className="rounded-lg bg-white" render={<Link href="/calendar" />}>
              Connect
            </Button>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Mark letters="GB" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Google Business Profile</p>
              <p className="text-xs text-muted-foreground">Review links and ratings per location.</p>
            </div>
            <Button nativeButton={false} size="sm" variant="outline" className="rounded-lg bg-white" render={<Link href="/settings/locations" />}>
              Manage
            </Button>
          </div>
        </SettingsCard>
      </section>
    </div>
  );
}

function IntegrationCard({ card }: { card: Connection }) {
  return (
    <SettingsCard className="p-4">
      <div className="flex items-start gap-3">
        <Mark letters={card.mark} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{card.name}</p>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              On
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{card.detail}</p>
        </div>
      </div>
      <Button nativeButton={false} size="sm" variant="outline" className="mt-4 rounded-lg bg-white" render={<Link href={card.href} />}>
        Manage
      </Button>
    </SettingsCard>
  );
}

function Mark({ letters }: { letters: string }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f6f4f1] text-[11px] font-semibold tracking-wide text-foreground/80",
      )}
    >
      {letters}
    </span>
  );
}
