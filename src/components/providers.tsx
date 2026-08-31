"use client";

import { isPublicAppPath } from "@/lib/auth-paths";
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
        <Shell>{children}</Shell>
        <Toaster />
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
      pathname.startsWith("/auth");
    if (isAuth) return children;
    return <CrmProvider>{children}</CrmProvider>;
  }

  return (
    <CrmProvider>
      <AppShell>{children}</AppShell>
    </CrmProvider>
  );
}
