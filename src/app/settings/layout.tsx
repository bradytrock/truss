"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isAutomationBuilderPath, SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isAutomationBuilderPath(pathname)) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <div className="min-h-full bg-[#f6f5f3]">
      <div className="lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
        <aside className="hidden px-4 py-6 lg:block">
          <div className="lg:sticky lg:top-16">
            <SettingsNav variant="rail" />
          </div>
        </aside>
        <div className="min-w-0 px-4 py-6 sm:px-6 lg:py-7 lg:pr-8 lg:pl-2">{children}</div>
      </div>
    </div>
  );
}
