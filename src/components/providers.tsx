"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { CrmProvider } from "@/lib/crm-store";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delay={200}>
        <CrmProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </CrmProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
