"use client";

import { Suspense } from "react";
import { LoadingScreen } from "@/components/page-chrome";
import { MailInbox } from "@/components/mail-inbox";

export default function MailPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MailInbox />
    </Suspense>
  );
}
