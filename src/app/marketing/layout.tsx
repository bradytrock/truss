"use client";

import type { ReactNode } from "react";
import { MarketingNav } from "@/components/marketing/nav";
import { PageHeader } from "@/components/page-chrome";
import { MarketingProvider } from "@/lib/marketing/store";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <MarketingProvider>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-5 sm:p-7">
        <PageHeader
          eyebrow="Suite"
          title="Marketing"
          description="Templates, job-backed materials, partner kits, campaigns, reviews, and share links — ready for PMs and BD."
        />
        <MarketingNav />
        {children}
      </div>
    </MarketingProvider>
  );
}
