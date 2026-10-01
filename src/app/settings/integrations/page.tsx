"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingScreen } from "@/components/page-chrome";
import { integrationSettingsHome } from "@/lib/integration-settings";
import { useCrm } from "@/lib/crm-store";
import { canManageSettings, canViewAccounting } from "@/lib/visibility";

export default function IntegrationsIndexPage() {
  const crm = useCrm();
  const router = useRouter();
  const admin = Boolean(crm.viewer && canManageSettings(crm.viewer.role, crm.viewer));
  const accounting = Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role));

  useEffect(() => {
    if (!crm.hydrated) return;
    if (admin || accounting) router.replace(integrationSettingsHome(admin));
    else router.replace("/");
  }, [accounting, admin, crm.hydrated, router]);

  return <LoadingScreen />;
}
