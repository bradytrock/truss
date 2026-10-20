"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ImageIcon,
  LayoutGrid,
  Mail,
  Megaphone,
  Printer,
  Share2,
  Sparkles,
  Star,
  Users,
  DoorOpen,
  Plus,
} from "lucide-react";
import { SearchTrigger, UserMenu } from "@/components/app-shell";
import { NotificationsMenu } from "@/components/notifications-menu";
import { AssistantPanel } from "@/components/assistant-panel";
import { TheRoofingCrmMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCrm } from "@/lib/crm-store";
import { cn } from "@/lib/utils";

const EMAIL_LINKS = [
  { href: "/marketing/campaigns", label: "Campaigns" },
  { href: "/marketing/quick-send", label: "Quick send" },
  { href: "/marketing/automations", label: "Automations" },
  { href: "/marketing/contacts", label: "Contacts & segments" },
  { href: "/marketing/reports", label: "Reports" },
];

function activePath(pathname: string, href: string) {
  if (href === "/marketing") return pathname === "/marketing";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMarketingCanvas(pathname: string) {
  return pathname.startsWith("/marketing/campaigns/design") || pathname.startsWith("/marketing/social/compose");
}

export function MarketingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const crm = useCrm();
  const [emailOpen, setEmailOpen] = useState(EMAIL_LINKS.some((link) => activePath(pathname, link.href)));
  const canvas = isMarketingCanvas(pathname);
  const roleLine = crm.user.title?.trim()
    ? `${crm.user.title} — every job, contact, and report in the company.`
    : "Company admin — every job, contact, and report in the company.";

  if (canvas) {
    return <div className="flex h-dvh min-h-0 flex-col bg-[#ebe6df]">{children}</div>;
  }

  return (
    <div className="grid h-dvh min-h-0 grid-cols-1 bg-[#2a2a2a] md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden h-full min-h-0 flex-col bg-[#2a2a2a] text-white md:flex">
        <Link href="/marketing" className="flex items-start gap-2.5 px-4 py-4">
          <span className="mt-0.5 grid size-8 place-items-center rounded-md bg-white/8">
            <TheRoofingCrmMark className="size-4 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] text-white/50">TheRoofingCRM</span>
            <span className="font-heading block text-[1.35rem] leading-none font-medium tracking-tight">Marketing</span>
            <span className="mt-1 block truncate text-[11px] text-white/45">{crm.company.name}</span>
          </span>
        </Link>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          <NavLink href="/marketing" label="Overview" icon={LayoutGrid} pathname={pathname} />
          <div>
            <p className="px-2 pb-1.5 text-[10px] tracking-[0.16em] text-white/35 uppercase">Outreach</p>
            <button
              type="button"
              onClick={() => setEmailOpen((open) => !open)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                EMAIL_LINKS.some((link) => activePath(pathname, link.href)) ? "bg-white/10" : "hover:bg-white/6",
              )}
            >
              <Mail className="size-3.5 text-white/70" />
              <span className="flex-1">Email</span>
              <ChevronDown className={cn("size-3.5 text-white/50 transition-transform", emailOpen && "rotate-180")} />
            </button>
            {emailOpen ? (
              <div className="mt-0.5 space-y-0.5 pl-6">
                {EMAIL_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "block rounded-md px-2 py-1.5 text-[13px] text-white/75 hover:bg-white/6 hover:text-white",
                      activePath(pathname, link.href) && "bg-white/12 text-white",
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="mt-0.5 space-y-0.5">
              <NavLink href="/marketing/social" label="Social" icon={Share2} pathname={pathname} />
              <NavLink href="/marketing/print" label="Print" icon={Printer} pathname={pathname} />
              <NavLink href="/marketing/leave-behinds" label="Leave-behinds" icon={DoorOpen} pathname={pathname} />
            </div>
          </div>
          <div>
            <p className="px-2 pb-1.5 text-[10px] tracking-[0.16em] text-white/35 uppercase">Relationships</p>
            <NavLink href="/marketing/partners" label="Partners" icon={Users} pathname={pathname} />
            <NavLink href="/marketing/reviews" label="Reviews" icon={Star} pathname={pathname} />
          </div>
          <div>
            <p className="px-2 pb-1.5 text-[10px] tracking-[0.16em] text-white/35 uppercase">Library</p>
            <NavLink href="/marketing/templates" label="Templates" icon={Megaphone} pathname={pathname} />
            <NavLink href="/marketing/assets" label="Assets" icon={ImageIcon} pathname={pathname} />
          </div>
        </nav>
        <div className="space-y-1 border-t border-white/10 px-3 py-3">
          <Link
            href="/marketing/settings"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/80 hover:bg-white/6",
              activePath(pathname, "/marketing/settings") && "bg-white/10 text-white",
            )}
          >
            <Sparkles className="size-3.5" />
            Marketing settings
          </Link>
          <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/70 hover:bg-white/6">
            <ChevronLeft className="size-3.5" />
            Back to CRM
          </Link>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col bg-[#f4f3f1]">
        <header className="shrink-0 border-b border-[#e6e4e0] bg-white">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
            <MobileLinks pathname={pathname} />
            <SearchTrigger />
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationsMenu />
              <AssistantPanel className="border border-primary bg-white text-primary hover:bg-red-50 hover:text-primary" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" />}
                >
                  <Plus data-icon="inline-start" />
                  <span className="hidden sm:inline">Create</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuItem render={<Link href="/marketing/campaigns/design" />}>New campaign</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/marketing/quick-send" />}>Quick send</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/marketing/templates" />}>Template</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/marketing/social/compose" />}>Social post</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/marketing/print" />}>Print piece</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <UserMenu />
            </div>
          </div>
          <p className="border-t border-[#f0eeeb] px-4 py-2 text-[12px] text-[#8a8680] sm:px-6">{roleLine}</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: typeof Mail;
  pathname: string;
}) {
  const on = activePath(pathname, href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/80 hover:bg-white/6 hover:text-white",
        on && "bg-white/10 text-white",
      )}
    >
      <Icon className="size-3.5 text-white/70" />
      {label}
    </Link>
  );
}

function MobileLinks({ pathname }: { pathname: string }) {
  const links = [
    { href: "/marketing", label: "Overview" },
    { href: "/marketing/quick-send", label: "Email" },
    { href: "/marketing/templates", label: "Templates" },
    { href: "/marketing/print", label: "Print" },
    { href: "/marketing/social", label: "Social" },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto md:hidden">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "shrink-0 rounded-md px-2 py-1 text-xs",
            activePath(pathname, link.href) ? "bg-foreground text-background" : "text-muted-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
