"use client";

import { GoogleLocationsSettings } from "@/components/google-locations-settings";
import { PageHeader } from "@/components/page-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function LocationsSettingsPage() {
  return (
    <SettingsAdminGate>
      <div className="max-w-4xl space-y-5">
        <PageHeader
          eyebrow="Settings"
          title="Locations"
          description="Your Google Business Profile listings. Multi-office companies add one per office, then point each person at theirs so reviews land on the right listing."
        />
        <GoogleLocationsSettings />
      </div>
    </SettingsAdminGate>
  );
}
