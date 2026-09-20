"use client";

import { isPublicAppPath } from "@/lib/auth-paths";
import { isLegalPath } from "@/lib/legal";
import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { CrmProvider } from "@/lib/crm-store";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delay={200}>
        <div className="flex min-h-dvh flex-1 flex-col">
          <Shell>{children}</Shell>
          <Toaster />
        </div>
      </TooltipProvider>
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
      <AppShell>{children}</AppShell>
    </CrmProvider>
  );
}
