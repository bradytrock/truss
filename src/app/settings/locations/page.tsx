"use client";

import { GoogleLocationsSettings } from "@/components/google-locations-settings";
import { SettingsPageHeader } from "@/components/settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";

export default function LocationsSettingsPage() {
  return (
    <SettingsAdminGate>
      <div className="space-y-5">
        <SettingsPageHeader
          eyebrow="Company"
          title="Locations & reviews"
          description="Each location links to a Google Business Profile, so review requests land on the right listing."
        />
        <GoogleLocationsSettings />
      </div>
    </SettingsAdminGate>
  );
}
