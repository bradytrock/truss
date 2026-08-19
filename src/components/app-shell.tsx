"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookUser,
  Briefcase,
  BarChart3,
  CalendarDays,
  FileText,
  Kanban,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Search,
} from "lucide-react";
import { useCrm } from "@/lib/crm-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CreateClientDialog,
  CreateJobDialog,
  CreateOpportunityDialog,
} from "@/components/create-records";
import {
  CreateEstimateDialog,
  CreateEventDialog,
  CreateInvoiceDialog,
} from "@/components/create-ops-dialogs";
import { canViewReports } from "@/lib/visibility";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

function navItems(showReports: boolean) {
  return [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/estimates", label: "Estimates", icon: FileText },
    { href: "/jobs", label: "Jobs", icon: Briefcase },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/contacts", label: "Contacts", icon: BookUser },
    ...(showReports ? [{ href: "/reports", label: "Reports", icon: BarChart3 }] : []),
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [create, setCreate] = useState<
    "opportunity" | "client" | "job" | "estimate" | "invoice" | "event" | null
  >(null);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#1c1914] text-[#f4efe6] md:flex">
        <Brand />
        <Nav pathname={pathname} />
        <div className="mt-auto p-3">
          <p className="px-2 text-[11px] leading-relaxed text-[#f4efe6]/50">
            Bid it, send it, bill it, shoot it. Home restoration through job photos.
          </p>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-[#1c1914] p-0 text-[#f4efe6] sm:max-w-72">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Brand />
          <Nav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-md sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <SearchTrigger />
          <div className="ml-auto flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <Plus data-icon="inline-start" />
                Create
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem onClick={() => setCreate("opportunity")}>
                  New lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("estimate")}>
                  New estimate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("invoice")}>
                  New invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("event")}>
                  Schedule event
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("client")}>
                  New contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("job")}>
                  Log a job
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu />
          </div>
        </header>
        <ScopeBanners />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      <CreateOpportunityDialog
        open={create === "opportunity"}
        onOpenChange={(open) => setCreate(open ? "opportunity" : null)}
      />
      <CreateClientDialog
        open={create === "client"}
        onOpenChange={(open) => setCreate(open ? "client" : null)}
      />
      <CreateJobDialog
        open={create === "job"}
        onOpenChange={(open) => setCreate(open ? "job" : null)}
      />
      <CreateEstimateDialog
        open={create === "estimate"}
        onOpenChange={(open) => setCreate(open ? "estimate" : null)}
      />
      <CreateInvoiceDialog
        open={create === "invoice"}
        onOpenChange={(open) => setCreate(open ? "invoice" : null)}
      />
      <CreateEventDialog
        open={create === "event"}
        onOpenChange={(open) => setCreate(open ? "event" : null)}
      />
    </div>
  );
}

function Brand() {
  const { user } = useCrm();
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex size-8 items-center justify-center rounded-md bg-[#c45c26] text-white">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M3 19h18M5 19V9l7-5 7 5v10M9 19v-6h6v6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="font-heading text-sm font-semibold tracking-tight">Truss</p>
        <p className="truncate text-[11px] text-[#f4efe6]/55">{user.company}</p>
      </div>
    </div>
  );
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { viewer } = useCrm();
  const items = navItems(Boolean(viewer && canViewReports(viewer.role)));
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-white/10 text-white"
                : "text-[#f4efe6]/70 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { opportunities, jobs, contacts, estimates, invoices } = useCrm();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        className="h-8 w-full max-w-md justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search data-icon="inline-start" />
        Search pursuits, jobs, contacts
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Truss"
        description="Jump to a pursuit, job, or contact"
        className="sm:max-w-lg"
      >
        <Command>
          <CommandInput placeholder="Search by project, owner, or city..." />
          <CommandList>
            <CommandEmpty>No matching records.</CommandEmpty>
            <CommandGroup heading="Pursuits">
              {opportunities.map((opportunity) => (
                <CommandItem
                  key={opportunity.id}
                  value={`${opportunity.name} ${opportunity.location}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/opportunities/${opportunity.id}`);
                  }}
                >
                  {opportunity.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Jobs">
              {jobs.map((job) => (
                <CommandItem
                  key={job.id}
                  value={`${job.name} ${job.location}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/jobs/${job.id}`);
                  }}
                >
                  {job.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Contacts">
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name} ${contact.title} ${contact.email}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/contacts/${contact.id}`);
                  }}
                >
                  {contact.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Estimates">
              {estimates.map((estimate) => (
                <CommandItem
                  key={estimate.id}
                  value={`${estimate.number} ${estimate.name}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/estimates/${estimate.id}`);
                  }}
                >
                  {estimate.number} · {estimate.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Invoices">
              {invoices.map((invoice) => (
                <CommandItem
                  key={invoice.id}
                  value={`${invoice.number} ${invoice.name}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/invoices/${invoice.id}`);
                  }}
                >
                  {invoice.number} · {invoice.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function ScopeBanners() {
  const { impersonatedStaff, stopLoginAs, scopeLabel, viewer } = useCrm();
  if (!viewer) return null;
  return (
    <div className="space-y-0">
      {impersonatedStaff ? (
        <div className="flex flex-col gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Logged in as <span className="font-medium">{impersonatedStaff.name}</span>
            <span className="text-amber-900/80"> · {SEAT_ROLE_LABELS[impersonatedStaff.role]}</span>
            . You are viewing their jobs and contact book.
          </p>
          <Button size="sm" variant="outline" onClick={stopLoginAs}>
            Exit Login As
          </Button>
        </div>
      ) : (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">{scopeLabel}</p>
      )}
    </div>
  );
}

function UserMenu() {
  const { resetDemo, signOut, user, staff, switchSeat, loginAs, loginAsOptions, viewer, impersonatedStaff, stopLoginAs } =
    useCrm();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account" />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {user.initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm text-foreground">{viewer?.name ?? user.name}</span>
            <span className="text-xs font-normal">
              {viewer ? SEAT_ROLE_LABELS[viewer.role] : user.title}
            </span>
          </div>
        </DropdownMenuLabel>
        {loginAsOptions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Login As…
            </DropdownMenuLabel>
            {loginAsOptions.map((member) => (
              <DropdownMenuItem
                key={member.id}
                onClick={() => loginAs(member.id)}
              >
                {member.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {SEAT_ROLE_LABELS[member.role]}
                </span>
              </DropdownMenuItem>
            ))}
            {impersonatedStaff ? (
              <DropdownMenuItem onClick={() => stopLoginAs()}>Exit Login As</DropdownMenuItem>
            ) : null}
          </>
        ) : null}
        {staff.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Switch seat
            </DropdownMenuLabel>
            {staff.map((member) => (
              <DropdownMenuItem key={member.id} onClick={() => switchSeat(member.id)}>
                {member.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {SEAT_ROLE_LABELS[member.role]}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void resetDemo();
          }}
        >
          Reset demo data
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RecordProperty({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
