"use client";

import Link from "next/link";
import { NotificationSettings } from "@/components/notification-settings";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";

export default function NotificationSettingsPage() {
  const crm = useCrm();
  if (!crm.hydrated) return <LoadingScreen />;
  const member = crm.viewer;
  if (!member) {
    return (
      <EmptyState
        title="Sign in to choose notifications"
        description="Lead, job, and weather alerts are saved on your profile."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  const profileUserId = crm.user.staffId === member.id ? crm.user.id : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <NotificationSettings
        key={member.id}
        member={member}
        teams={crm.book.teams}
        companyId={crm.user.companyId}
        self
        profileUserId={profileUserId}
      />
    </div>
  );
}
