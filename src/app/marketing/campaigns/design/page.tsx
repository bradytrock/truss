"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EmailStudio } from "@/components/marketing/email-editor";

function DesignClient() {
  const params = useSearchParams();
  return <EmailStudio documentId={params.get("doc") || undefined} />;
}

export default function MarketingDesignPage() {
  return (
    <Suspense fallback={<div className="grid h-dvh place-items-center text-sm text-[#6f6a64]">Opening the editor…</div>}>
      <DesignClient />
    </Suspense>
  );
}
