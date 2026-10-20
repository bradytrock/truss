"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { useCrm } from "@/lib/crm-store";
import { peopleSettingsTabIsActive } from "@/lib/people-settings";
import { cn } from "@/lib/utils";

const DIRECTORY_TABS = [
  { href: "/settings/people", label: "People", count: "people" as const },
  { href: "/settings/people/teams", label: "Teams", count: "teams" as const },
];

export function TeamPeopleTabs() {
  const pathname = usePathname();
  const crm = useCrm();
  const counts = {
    people: crm.book.staff.length,
    teams: crm.book.teams.length,
  };

  return (
    <nav aria-label="People sections" className="border-b border-[#e7e2dc]">
      <ul className="flex gap-6">
        {DIRECTORY_TABS.map((tab) => {
          const active = peopleSettingsTabIsActive(tab.href, pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 pb-2.5 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    active ? "bg-primary/10 text-primary" : "bg-black/5 text-muted-foreground",
                  )}
                >
                  {counts[tab.count]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PeopleSettingsChrome({
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
  return (
    <div className="space-y-5">
      <SettingsPageHeader eyebrow="Team" title={title} description={description} actions={actions} />
      <TeamPeopleTabs />
      {children}
    </div>
  );
}
