"use client";

import { PeopleSettingsChrome } from "@/components/people-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { TeamsSettings } from "@/components/teams-settings";
import { useCrm } from "@/lib/crm-store";

export default function PeopleTeamsSettingsPage() {
  return (
    <SettingsAdminGate>
      <PeopleTeamsSettingsBody />
    </SettingsAdminGate>
  );
}

function PeopleTeamsSettingsBody() {
  const crm = useCrm();
  return (
    <PeopleSettingsChrome
      title="Teams"
      description="Crews that share a book. Team leads and team admins see jobs and contacts owned by people on their team, and can Login As a teammate."
    >
      <TeamsSettings
        teams={crm.book.teams}
        staff={crm.book.staff}
        onAdd={crm.addTeam}
        onUpdate={crm.updateTeam}
        onRemove={crm.removeTeam}
        hideIntro
      />
    </PeopleSettingsChrome>
  );
}
