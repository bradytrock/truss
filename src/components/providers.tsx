"use client";

import { isPublicAppPath } from "@/lib/auth-paths";
import { isDialerPopupPath } from "@/lib/calls/popup";
import { isLegalPath } from "@/lib/legal";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

const Toaster = dynamic(() => import("@/components/ui/sonner").then((mod) => mod.Toaster));
const TooltipProvider = dynamic(() =>
  import("@/components/ui/tooltip").then((mod) => mod.TooltipProvider),
);
const AppShell = dynamic(() => import("@/components/app-shell").then((mod) => mod.AppShell));
const CrmProvider = dynamic(() => import("@/lib/crm-store").then((mod) => mod.CrmProvider));
const SoftphoneBar = dynamic(() => import("@/components/softphone-bar").then((mod) => mod.SoftphoneBar));
const SoftphoneProvider = dynamic(() =>
  import("@/lib/calls/softphone").then((mod) => mod.SoftphoneProvider),
);

function subscribeToClient() {
  return () => {};
}

export function Providers({ children }: { children: ReactNode }) {
  const clientReady = useSyncExternalStore(subscribeToClient, () => true, () => false);
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <div className="flex min-h-dvh flex-1 flex-col">
        <Shell>{children}</Shell>
        {clientReady ? <Toaster /> : null}
      </div>
    </ThemeProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPublicAppPath(pathname) && !pathname.startsWith("/api/")) {
    const isAuth =
      pathname.startsWith("/login") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/auth") ||
      isLegalPath(pathname);
    if (isAuth) return children;
    return <CrmProvider>{children}</CrmProvider>;
  }

  // Compact dialer popup: softphone only, no app chrome, so the main window stays usable.
  if (isDialerPopupPath(pathname)) {
    return (
      <CrmProvider>
        <SoftphoneProvider>{children}</SoftphoneProvider>
      </CrmProvider>
    );
  }

  return (
    <CrmProvider>
      <SoftphoneProvider>
        <TooltipProvider delay={200}>
          <AppShell>{children}</AppShell>
          <SoftphoneBar />
        </TooltipProvider>
      </SoftphoneProvider>
    </CrmProvider>
  );
}
