"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-chrome";
import { integrationSettingsTabIsActive, integrationSettingsTabs } from "@/lib/integration-settings";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings } from "@/lib/visibility";
import { cn } from "@/lib/utils";

export function IntegrationSettingsChrome({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const crm = useCrm();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  const tabs = integrationSettingsTabs(admin);

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader eyebrow="Settings" title={title} description={description} actions={actions} />
      <nav aria-label="Integrations" className="-mt-2 border-b">
        <ul className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = integrationSettingsTabIsActive(tab.href, pathname);
            return (
              <li key={tab.href} className="shrink-0">
                <Link
                  href={tab.href}
                  className={cn(
                    "inline-flex items-center border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
