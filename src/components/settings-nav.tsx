"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings, canViewAccounting } from "@/lib/visibility";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "/settings", label: "Company", hint: "Name, logo, office", admin: true, accounting: false },
  { href: "/settings/documents", label: "Documents", hint: "Terms and margin", admin: true, accounting: false },
  { href: "/settings/teams", label: "Teams", hint: "Crews and leads", admin: true, accounting: false },
  { href: "/settings/people", label: "People", hint: "Seats and invites", admin: true, accounting: false },
  { href: "/settings/price-book", label: "Price book", hint: "Catalog and lists", admin: true, accounting: false },
  { href: "/settings/quickbooks", label: "QuickBooks", hint: "Web Connector", admin: true, accounting: true },
] as const;

function sectionIsActive(href: string, pathname: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const crm = useCrm();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  const accounting = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));
  const items = SECTIONS.filter((item) => (item.admin && admin) || (item.accounting && accounting));

  useEffect(() => {
    if (!crm.hydrated) return;
    if (pathname !== "/settings") return;
    if (admin) return;
    if (accounting) router.replace("/settings/quickbooks");
  }, [admin, accounting, crm.hydrated, pathname, router]);

  if (!crm.hydrated || items.length === 0) return null;

  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-12 z-20 -mx-5 mb-4 border-b bg-background px-5 py-2 sm:-mx-7 sm:px-7 lg:static lg:mx-0 lg:mb-0 lg:w-52 lg:shrink-0 lg:self-stretch lg:border-b-0 lg:px-0 lg:py-0"
    >
      <div className="lg:sticky lg:top-16">
        <p className="mb-2 hidden text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase lg:block">
          Settings
        </p>
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const active = sectionIsActive(item.href, pathname);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {item.label}
                  <span className="hidden text-xs font-normal text-muted-foreground lg:block">{item.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export function SettingsAdminGate({
  children,
  title = "Settings are restricted",
  description = "Only a company admin can change the business name, name teams, invite people, or lock accounts.",
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const crm = useCrm();

  if (!crm.hydrated) return <LoadingScreen />;

  if (!crm.viewer || !canManageSettings(crm.viewer.role, crm.viewer)) {
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
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      {children}
    </div>
  );
}
