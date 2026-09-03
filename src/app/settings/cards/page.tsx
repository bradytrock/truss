"use client";

import { CardAnalyticsReport } from "@/components/card-analytics-report";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function CardAnalyticsPage() {
  return (
    <SettingsAdminGate>
      <div className="max-w-5xl space-y-5">
        <PageHeader
          eyebrow="Settings"
          title="Card activity"
          description="What happens after someone opens a digital business card — saves to their phone, taps through to a Google review, calls, texts, and payments."
        />
        <CardAnalyticsReport />
      </div>
    </SettingsAdminGate>
  );
}
