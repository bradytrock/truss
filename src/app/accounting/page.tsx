"use client";

import { Suspense } from "react";
import { AccountingPortal } from "@/components/accounting-portal";
import { LoadingScreen } from "@/components/page-chrome";

export default function AccountingPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AccountingPortal />
    </Suspense>
  );
}
