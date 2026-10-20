"use client";

import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/shell";
import { MarketingProvider } from "@/lib/marketing/store";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingProvider>
      <MarketingShell>{children}</MarketingShell>
    </MarketingProvider>
  );
}
