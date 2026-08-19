"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Building2,
  Briefcase,
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
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/estimates", label: "Estimates", icon: FileText },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/clients", label: "Clients", icon: Building2 },
];

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
            Bid it, send it, bill it, shoot it. Pipeline through job photos.
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
                  New pursuit
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
                  New client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("job")}>
                  Log a job
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu />
          </div>
        </header>
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
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {nav.map((item) => {
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
  const { opportunities, jobs, clients, estimates, invoices } = useCrm();

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
        Search pursuits, jobs, estimates
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search Truss"
        description="Jump to a pursuit, job, or client"
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
            <CommandGroup heading="Clients">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`${client.name} ${client.city}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/clients/${client.id}`);
                  }}
                >
                  {client.name}
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

function UserMenu() {
  const { resetDemo, signOut, user } = useCrm();

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
            <span className="text-sm text-foreground">{user.name}</span>
            <span className="text-xs font-normal">{user.title}</span>
          </div>
        </DropdownMenuLabel>
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
