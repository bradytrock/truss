"use client";

import { Suspense } from "react";
import { LoadingScreen } from "@/components/page-chrome";
import { MessagesInbox } from "@/components/messages-inbox";

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MessagesInbox />
    </Suspense>
  );
}
