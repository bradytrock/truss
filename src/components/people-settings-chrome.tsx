"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-chrome";
import { PEOPLE_SETTINGS_TABS, peopleSettingsTabIsActive } from "@/lib/people-settings";
import { cn } from "@/lib/utils";

export function PeopleSettingsChrome({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader eyebrow="Settings" title={title} description={description} />
      <nav aria-label="People sections" className="-mt-2 border-b">
        <ul className="flex gap-1">
          {PEOPLE_SETTINGS_TABS.map((tab) => {
            const active = peopleSettingsTabIsActive(tab.href, pathname);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={cn(
                    "inline-flex items-center border-b-2 px-3 py-2 text-sm transition-colors",
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
