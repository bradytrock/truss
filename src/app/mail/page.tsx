"use client";

import { Suspense } from "react";
import { LoadingScreen } from "@/components/page-chrome";
import { MailInbox } from "@/components/mail-inbox";
import { RecordErrorBoundary } from "@/components/record-error-boundary";

export default function MailPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RecordErrorBoundary
        fallbackTitle="Mail could not open"
        fallbackDescription="Reload the page. One bad message should not hide the rest of the inbox."
      >
        <MailInbox />
      </RecordErrorBoundary>
    </Suspense>
  );
}
