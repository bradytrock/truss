"use client";

import { PeopleSettings } from "@/components/people-settings";
import { SettingsAdminGate } from "@/components/settings-nav";
import { useCrm } from "@/lib/crm-store";

export default function PeopleSettingsPage() {
  return (
    <SettingsAdminGate>
      <PeopleSettingsBody />
    </SettingsAdminGate>
  );
}

function PeopleSettingsBody() {
  const crm = useCrm();
  if (!crm.viewer) return null;
  return (
    <PeopleSettings
      teams={crm.book.teams}
      staff={crm.book.staff}
      viewerId={crm.viewer.id}
      companySlug={crm.company.slug}
      googleLocations={crm.googleLocations}
      companySignature={crm.company.defaultEmailSignature ?? ""}
      onInvite={crm.inviteStaff}
      onInviteMany={crm.inviteStaffMany}
      onUpdate={crm.updateStaffAccount}
      onRefreshInvite={crm.refreshStaffInvite}
      onRemove={crm.removeStaff}
    />
  );
}
