"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ConfettiFall } from "@/components/confetti-fall";
import { TheRoofingCrmMark } from "@/components/brand";
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

export function WelcomeScreen({
  companyName,
  logoUrl,
  firstName,
  onContinue,
}: {
  companyName: string;
  logoUrl?: string;
  firstName?: string;
  onContinue: () => void;
}) {
  const greeting = firstName?.trim() ? `Welcome, ${firstName.trim()}` : "Welcome";
  const logo = logoUrl?.trim() ?? "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#141414]/92 px-6 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(200,16,46,0.22),transparent_55%)]" />
      <ConfettiFall active />
      <div className="welcome-rise relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="welcome-pop flex min-h-28 items-center justify-center">
          {logo ? (
            <img
              src={logo}
              alt={companyName}
              className="max-h-24 w-auto max-w-[16rem] object-contain drop-shadow-lg"
            />
          ) : (
            <TheRoofingCrmMark className="size-14 text-[#c8102e]" />
          )}
        </div>
        <p className="font-script mt-6 text-[3.1rem] leading-none text-white">{greeting}</p>
        <h1 id="welcome-title" className="mt-4 font-heading text-2xl font-medium tracking-tight">
          {companyName || PRODUCT_NAME}
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/70">
          You are in. This is your company desk — leads, paper, and the field in one place.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-8 h-12 w-full max-w-xs rounded-full bg-gradient-to-r from-[#3d5a7a] to-[#2a4058] text-base font-medium text-white transition-opacity hover:opacity-95"
        >
          Enter workspace
        </button>
      </div>
    </div>
  );
}

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

export function AuthWelcomePreview({
  companyName,
  logoUrl,
  firstName,
}: {
  companyName?: string;
  logoUrl?: string;
  firstName?: string;
}) {
  return (
    <Suspense fallback={null}>
      <AuthWelcomePreviewInner
        companyName={companyName}
        logoUrl={logoUrl}
        firstName={firstName}
      />
    </Suspense>
  );
}

function AuthWelcomePreviewInner({
  companyName,
  logoUrl,
  firstName,
}: {
  companyName?: string;
  logoUrl?: string;
  firstName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (searchParams.get("welcome") !== "1") return null;
  return (
    <WelcomeScreen
      companyName={companyName?.trim() || PRODUCT_NAME}
      logoUrl={logoUrl}
      firstName={firstName}
      onContinue={() => router.replace(pathname)}
    />
  );
}
