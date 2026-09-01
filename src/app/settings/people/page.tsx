"use client";

import { EmailSignatureRoster } from "@/components/email-signature-settings";
import { PageHeader } from "@/components/page-chrome";
import { PeopleSettings } from "@/components/people-settings";
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
    <div className="max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="People"
        description={`Add a roster seat, put them on a team, send a signup link into this company, set each person’s email signature, restrict someone to their own book, lock a login, or remove them. Invite links join this company — they do not open a second one. Invites expire in ${INVITE_DAYS} days.`}
      />
      <PeopleSettings
        teams={crm.book.teams}
        staff={crm.book.staff}
        viewerId={crm.viewer.id}
        companySlug={crm.company.slug}
        onInvite={crm.inviteStaff}
        onUpdate={crm.updateStaffAccount}
        onRefreshInvite={crm.refreshStaffInvite}
        onRemove={crm.removeStaff}
        hideIntro
      />
      <EmailSignatureRoster />
    </div>
  );
}
