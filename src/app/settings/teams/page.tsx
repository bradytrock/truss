"use client";

import { PageHeader } from "@/components/page-chrome";
import { TeamsSettings } from "@/components/teams-settings";
import { SettingsAdminGate } from "@/components/settings-nav";
import { useCrm } from "@/lib/crm-store";

export default function TeamsSettingsPage() {
  return (
    <SettingsAdminGate>
      <TeamsSettingsBody />
    </SettingsAdminGate>
  );
}

function TeamsSettingsBody() {
  const crm = useCrm();
  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Teams"
        description="Crews that share a book. Team leads and team admins see jobs and contacts owned by people on their team, and can Login As a teammate."
      />
      <TeamsSettings
        teams={crm.book.teams}
        staff={crm.book.staff}
        onAdd={crm.addTeam}
        onUpdate={crm.updateTeam}
        onRemove={crm.removeTeam}
        hideIntro
      />
    </div>
  );
}
