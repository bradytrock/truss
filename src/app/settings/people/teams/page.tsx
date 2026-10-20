"use client";

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
    <TeamsSettings
      teams={crm.book.teams}
      staff={crm.book.staff}
      onAdd={crm.addTeam}
      onUpdate={crm.updateTeam}
      onRemove={crm.removeTeam}
      onAssign={(staffId, teamId) => crm.updateStaffAccount(staffId, { teamId })}
    />
  );
}
