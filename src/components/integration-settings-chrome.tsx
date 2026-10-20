"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SettingsPageHeader } from "@/components/settings-chrome";

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
  return (
    <div className="space-y-5">
      <Link href="/settings/integrations" className="text-sm text-muted-foreground hover:text-foreground">
        All integrations
      </Link>
      <SettingsPageHeader eyebrow="Operations" title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}
