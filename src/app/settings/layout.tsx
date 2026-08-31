"use client";

import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:flex lg:gap-10">
      <div className="hidden lg:block lg:w-52 lg:shrink-0">
        <div className="lg:sticky lg:top-16">
          <SettingsNav variant="rail" />
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
