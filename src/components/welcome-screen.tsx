"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WelcomeScreen } from "@/components/auth-welcome-preview";
import { cardHeaderLogo } from "@/lib/card";
import { useCrmOptional } from "@/lib/crm-store";
import { PRODUCT_NAME } from "@/lib/product";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  clearWelcomePending,
  hasSeenWelcome,
  isWelcomePendingMetadata,
  markWelcomeSeen,
  peekWelcomePending,
  shouldOpenWelcome,
} from "@/lib/welcome";

export function FirstWelcomeHost() {
  return (
    <Suspense fallback={null}>
      <FirstWelcomeGate />
    </Suspense>
  );
}

function FirstWelcomeGate() {
  const crm = useCrmOptional();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const force = searchParams.get("welcome") === "1";
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (crm && !crm.hydrated) return;
    let cancelled = false;
    void (async () => {
      const sessionPending = peekWelcomePending();
      let metadataPending = false;
      let nextUserId = crm?.user.id ?? "";
      if (isSupabaseConfigured()) {
        try {
          const supabase = createClient();
          const { data } = await supabase.auth.getUser();
          nextUserId = data.user?.id ?? nextUserId;
          metadataPending = isWelcomePendingMetadata(data.user?.user_metadata);
        } catch {
          metadataPending = false;
        }
      }
      const alreadySeen = nextUserId ? hasSeenWelcome(nextUserId) : false;
      const show = shouldOpenWelcome({
        alreadySeen,
        sessionPending,
        metadataPending,
        force,
      });
      if (cancelled) return;
      setUserId(nextUserId);
      setOpen(show);
    })();
    return () => {
      cancelled = true;
    };
  }, [crm?.hydrated, crm?.user.id, force]);

  if (!open) return null;

  const companyName = crm?.company.name?.trim() || crm?.user.company?.trim() || PRODUCT_NAME;
  const logoUrl = crm?.company ? cardHeaderLogo(crm.company) : "";
  const firstName = (crm?.user.name ?? "").trim().split(/\s+/)[0] ?? "";

  async function onContinue() {
    if (userId) markWelcomeSeen(userId);
    else clearWelcomePending();
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.auth.updateUser({ data: { welcome_pending: false } });
      } catch {
        // Local or missing session — the seen flag is enough.
      }
    }
    setOpen(false);
    if (force) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("welcome");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }
  }

  return (
    <WelcomeScreen
      companyName={companyName}
      logoUrl={logoUrl}
      firstName={firstName}
      onContinue={() => void onContinue()}
    />
  );
}
