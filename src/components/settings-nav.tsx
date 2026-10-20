"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Building2,
  FileText,
  Folder,
  History,
  MapPin,
  Phone,
  Plug,
  Search,
  Sparkles,
  Tag,
  Users,
  UsersRound,
} from "lucide-react";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { integrationSettingsHome } from "@/lib/integration-settings";
import { canManageAutomations, canManageSettings, canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  admin: boolean;
  accounting: boolean;
  automations: boolean;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    id: "company",
    label: "Company",
    items: [
      { href: "/settings", label: "Company profile", icon: Building2, admin: true, accounting: false, automations: false },
      { href: "/settings/locations", label: "Locations & reviews", icon: MapPin, admin: true, accounting: false, automations: false },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      { href: "/settings/people", label: "People", icon: Users, admin: true, accounting: false, automations: false },
      { href: "/settings/people/teams", label: "Teams", icon: UsersRound, admin: true, accounting: false, automations: false },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      { href: "/settings/phone", label: "Phone & texting", icon: Phone, admin: true, accounting: false, automations: false },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    items: [
      { href: "/settings/price-book", label: "Price book", icon: Tag, admin: true, accounting: false, automations: false },
      { href: "/settings/documents", label: "Documents & margin", icon: FileText, admin: true, accounting: false, automations: false },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/settings/automations", label: "Automations", icon: Sparkles, admin: true, accounting: false, automations: true },
      { href: "/settings/files", label: "File directory", icon: Folder, admin: true, accounting: false, automations: false },
      { href: "/settings/integrations", label: "Integrations", icon: Plug, admin: true, accounting: true, automations: false },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      { href: "/settings/audit", label: "Audit trail", icon: History, admin: true, accounting: false, automations: false },
    ],
  },
];

const CRUMBS: Array<[string, string]> = [
  ["/settings/people/teams", "Teams"],
  ["/settings/teams", "Teams"],
  ["/settings/people/calling", "Phone & texting"],
  ["/settings/people/voice", "Phone & texting"],
  ["/settings/people", "People"],
  ["/settings/locations", "Locations & reviews"],
  ["/settings/phone", "Phone & texting"],
  ["/settings/calling", "Phone & texting"],
  ["/settings/photon", "Phone & texting"],
  ["/settings/price-book", "Price book"],
  ["/settings/documents", "Documents & margin"],
  ["/settings/files", "File directory"],
  ["/settings/integrations", "Integrations"],
  ["/settings/audit", "Audit trail"],
  ["/settings/cards", "Cards"],
];

export function isAutomationBuilderPath(pathname: string) {
  return /^\/settings\/automations\/(?:new|[^/]+)$/.test(pathname);
}

export function settingsSectionLabel(pathname: string): string | null {
  if (!pathname.startsWith("/settings")) return null;
  if (pathname === "/settings/automations/new") return "New automation";
  if (/^\/settings\/automations\/[^/]+\/runs/.test(pathname)) return "Automation history";
  if (isAutomationBuilderPath(pathname)) return "Automation";
  for (const [href, label] of CRUMBS) {
    if (pathname === href || pathname.startsWith(`${href}/`)) return label;
  }
  if (pathname === "/settings") return "Company profile";
  return "Settings";
}

function sectionIsActive(href: string, pathname: string) {
  if (href === "/settings") return pathname === "/settings";
  if (href === "/settings/people") {
    return pathname === "/settings/people" || pathname === "/settings/people/";
  }
  if (href === "/settings/people/teams") {
    return pathname.startsWith("/settings/people/teams") || pathname.startsWith("/settings/teams");
  }
  if (href === "/settings/phone") {
    return (
      pathname.startsWith("/settings/phone") ||
      pathname.startsWith("/settings/calling") ||
      pathname.startsWith("/settings/photon") ||
      pathname.startsWith("/settings/people/calling") ||
      pathname.startsWith("/settings/people/voice")
    );
  }
  if (href === "/settings/automations") {
    return pathname.startsWith("/settings/automations");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemVisible(
  item: NavItem,
  access: { admin: boolean; accounting: boolean; automations: boolean },
) {
  return (
    (item.admin && access.admin) ||
    (item.accounting && access.accounting) ||
    (item.automations && access.automations)
  );
}

export function SettingsNav({ variant }: { variant: "bar" | "rail" }) {
  const pathname = usePathname();
  const router = useRouter();
  const crm = useCrm();
  const [query, setQuery] = useState("");
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  const automations = Boolean(crm.viewer && canManageAutomations(crm.viewer.role, crm.viewer));
  const accounting = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));
  const access = { admin, accounting, automations };
  const needle = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!itemVisible(item, access)) return false;
          if (!needle) return true;
          return (
            item.label.toLowerCase().includes(needle) ||
            group.label.toLowerCase().includes(needle)
          );
        }),
      })).filter((group) => group.items.length > 0),
    // access fields are the real deps; the object is rebuilt each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [admin, accounting, automations, needle],
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    if (pathname !== "/settings") return;
    if (admin) return;
    if (accounting) router.replace(integrationSettingsHome(false));
    else if (automations) router.replace("/settings/automations");
  }, [admin, accounting, automations, crm.hydrated, pathname, router]);

  if (!crm.hydrated || (groups.length === 0 && !needle)) return null;

  const bar = variant === "bar";
  const company = crm.company.name || crm.user.company;

  if (bar) {
    return (
      <nav aria-label="Settings sections" className="px-3 py-2 sm:px-5">
        <ul className="flex gap-1 overflow-x-auto">
          {groups.flatMap((group) =>
            group.items.map((item) => {
              const href =
                item.href === "/settings/integrations" && !admin
                  ? integrationSettingsHome(false)
                  : item.href;
              const active = sectionIsActive(item.href, pathname);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={href}
                    prefetch
                    className={cn(
                      "inline-flex rounded-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-white font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-white/70 hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            }),
          )}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Settings sections">
      <p className="text-lg font-semibold tracking-tight">Settings</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{company}</p>
      <label className="mt-3 flex items-center gap-2 rounded-xl border border-[#e6e1db] bg-white px-3 py-2 text-sm text-muted-foreground">
        <Search className="size-3.5 shrink-0" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a setting"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.id}>
            <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const href =
                  item.href === "/settings/integrations" && !admin
                    ? integrationSettingsHome(false)
                    : item.href;
                const active = sectionIsActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={href}
                      prefetch
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-white font-medium text-foreground shadow-[0_1px_2px_rgba(28,25,23,0.06)]"
                          : "text-foreground/80 hover:bg-white/70",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {groups.length === 0 ? (
          <p className="px-2.5 text-sm text-muted-foreground">No settings match that search.</p>
        ) : null}
      </div>
    </nav>
  );
}

export function SettingsMobileBar() {
  const pathname = usePathname();
  if (!pathname.startsWith("/settings")) return null;
  if (isAutomationBuilderPath(pathname)) return null;
  return (
    <div className="border-t bg-[#f6f5f3] lg:hidden">
      <SettingsNav variant="bar" />
    </div>
  );
}

export function SettingsAdminGate({
  children,
  title = "Settings are restricted",
  description = "Only a company admin can change the business name, name teams, invite people, or lock accounts.",
  allowAutomations = false,
  flush = false,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  allowAutomations?: boolean;
  flush?: boolean;
}) {
  const crm = useCrm();

  if (!crm.hydrated) return <LoadingScreen />;

  const allowed =
    crm.viewer &&
    (canManageSettings(crm.viewer.role, crm.viewer) ||
      (allowAutomations && canManageAutomations(crm.viewer.role, crm.viewer)));
  if (!crm.viewer || !allowed) {
    return (
      <EmptyState
        title={title}
        description={description}
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  return (
    <div className={flush ? undefined : "space-y-5"}>
      {crm.hydrateError ? (
        <div className={flush ? "mb-4" : undefined}>
          <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
        </div>
      ) : null}
      {children}
    </div>
  );
}
