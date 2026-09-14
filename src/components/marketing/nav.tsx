"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/marketing", label: "Overview", exact: true },
  { href: "/marketing/campaigns", label: "Email" },
  { href: "/marketing/templates", label: "Templates" },
  { href: "/marketing/materials", label: "Print" },
  { href: "/marketing/partners", label: "Partners" },
  { href: "/marketing/reviews", label: "Reviews" },
  { href: "/marketing/leave-behinds", label: "Leave-behinds" },
  { href: "/marketing/assets", label: "Assets" },
] as const;

export function MarketingNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {LINKS.map((link) => {
        const exact = "exact" in link && link.exact;
        const active = exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-[13px] tracking-tight transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
