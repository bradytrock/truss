"use client";

import { Suspense } from "react";
import { LoadingScreen } from "@/components/page-chrome";
import { MessagesInbox } from "@/components/messages-inbox";
import { RecordErrorBoundary } from "@/components/record-error-boundary";

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RecordErrorBoundary
        fallbackTitle="Inbox could not open"
        fallbackDescription="Reload the page. One bad text should not hide the rest of the inbox."
      >
        <MessagesInbox />
      </RecordErrorBoundary>
    </Suspense>
  );
}
