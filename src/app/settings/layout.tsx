"use client";

import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:flex lg:gap-10">
      <SettingsNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
