"use client";

import { PeopleSettings } from "@/components/people-settings";
import { PeopleSettingsChrome } from "@/components/people-settings-chrome";
import { SettingsAdminGate } from "@/components/settings-nav";
import { INVITE_DAYS } from "@/lib/accounts";
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
    <PeopleSettingsChrome
      title="People"
      description={`Add a roster seat, put them on a team, or email a one-time signup link into this company. Open a person to edit their whole profile — photo, contact, card URL, Google location, and email signature. Invite links join this company — they do not open a second one. Invites expire in ${INVITE_DAYS} days and cannot be reused after setup.`}
    >
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
        hideIntro
      />
    </PeopleSettingsChrome>
  );
}
