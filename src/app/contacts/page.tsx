"use client";

import { Suspense } from "react";
import { ContactsDesk } from "@/components/contacts-desk";
import { LoadingScreen } from "@/components/page-chrome";

export default function ContactsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ContactsDesk />
    </Suspense>
  );
}
