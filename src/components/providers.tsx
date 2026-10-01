"use client";

import { isPublicAppPath } from "@/lib/auth-paths";
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

  return (
    <CrmProvider>
      <TooltipProvider delay={200}>
        <AppShell>{children}</AppShell>
      </TooltipProvider>
    </CrmProvider>
  );
}
