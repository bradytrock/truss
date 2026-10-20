"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CommissionsDesk } from "@/components/commissions-desk";
import { LoadingScreen } from "@/components/page-chrome";
import { isBusinessDevelopment } from "@/lib/bd";
import { useCrm } from "@/lib/crm-store";

export default function CommissionsPage() {
  const crm = useCrm();
  const router = useRouter();
  const hidden = Boolean(crm.effectiveStaff && isBusinessDevelopment(crm.effectiveStaff.role));

  useEffect(() => {
    if (crm.hydrated && hidden) router.replace("/");
  }, [crm.hydrated, hidden, router]);

  if (!crm.hydrated || hidden) return <LoadingScreen />;
  return <CommissionsDesk />;
}
