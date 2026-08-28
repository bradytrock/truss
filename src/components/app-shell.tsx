"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, Plus, Search } from "lucide-react";
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
  DropdownMenuGroup,
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
  CreateEventDialog,
  CreateInvoiceDialog,
} from "@/components/create-ops-dialogs";
import { LogExpenseDialog, LogPaymentDialog } from "@/components/log-financial-dialogs";
import { canViewReports, canManageSettings, canViewAccounting } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";
import { COURSE } from "@/lib/training/engine";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand";
import { AssistantPanel } from "@/components/assistant-panel";
import { useStartEstimate } from "@/lib/start-estimate";

function navItems(options: { showReports: boolean; showAccounting: boolean; bdOnly: boolean }) {
  if (options.bdOnly) {
    return [
      { href: "/", label: "Home" },
      { href: "/jobs", label: "Jobs" },
      { href: "/messages", label: "Messages" },
      { href: "/photos", label: "Photos" },
      { href: "/contacts", label: "Agents & contacts" },
      { href: "/reports", label: "ROI" },
    ];
  }
  return [
    { href: "/", label: "Home" },
    { href: "/jobs", label: "Jobs" },
    { href: "/messages", label: "Messages" },
    { href: "/photos", label: "Photos" },
    { href: "/estimates", label: "Estimates" },
    { href: "/invoices", label: "Invoices" },
    ...(options.showAccounting ? [{ href: "/accounting", label: "Accounting" }] : []),
    { href: "/calendar", label: "Calendar" },
    { href: "/training", label: "Training" },
    { href: "/contacts", label: "Contacts" },
    ...(options.showReports ? [{ href: "/reports", label: "Reports" }] : []),
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { effectiveStaff } = useCrm();
  const { start: startEstimate } = useStartEstimate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [create, setCreate] = useState<
    "opportunity" | "client" | "job" | "invoice" | "event" | "expense" | "payment" | null
  >(null);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <Brand />
        <Nav pathname={pathname} />
        <div className="mt-auto border-t border-sidebar-border px-4 py-3">
          <p className="text-[10px] tracking-[0.14em] text-sidebar-foreground/35 uppercase">
            Restoration · remodel
          </p>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground sm:max-w-72">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Brand />
          <Nav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background px-3 sm:px-5">
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
            <AssistantPanel />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <Plus data-icon="inline-start" />
                Create
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {effectiveStaff && isBusinessDevelopment(effectiveStaff.role) ? (
                  <>
                    <DropdownMenuItem onClick={() => setCreate("opportunity")}>
                      New lead
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCreate("client")}>
                      New contact
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCreate("expense")}>
                      Log expense
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                <DropdownMenuItem onClick={() => setCreate("expense")}>
                  Log expense
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("payment")}>
                  Log payment
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCreate("opportunity")}>
                  New lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void startEstimate()}>
                  New estimate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("invoice")}>
                  New invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("event")}>
                  Calendar event
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("client")}>
                  New contact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCreate("job")}>
                  Log a job
                </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <UserMenu />
          </div>
        </header>
        <ScopeBanners />
        <main className="flex-1 p-5 sm:p-7">{children}</main>
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
      <CreateInvoiceDialog
        open={create === "invoice"}
        onOpenChange={(open) => setCreate(open ? "invoice" : null)}
      />
      <CreateEventDialog
        open={create === "event"}
        onOpenChange={(open) => setCreate(open ? "event" : null)}
      />
      <LogExpenseDialog
        open={create === "expense"}
        onOpenChange={(open) => setCreate(open ? "expense" : null)}
      />
      <LogPaymentDialog
        open={create === "payment"}
        onOpenChange={(open) => setCreate(open ? "payment" : null)}
      />
    </div>
  );
}

function Brand() {
  const { user } = useCrm();
  return (
    <div className="border-b border-sidebar-border px-4 py-4">
      <BrandMark
        className="inline-flex items-center gap-2 text-sidebar-foreground"
        markClassName="size-4 text-primary"
      />
      <p className="mt-2 truncate pl-6 text-[11px] text-sidebar-foreground/45">{user.company}</p>
    </div>
  );
}

function Nav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { effectiveStaff } = useCrm();
  const items = navItems({
    showReports: Boolean(effectiveStaff && canViewReports(effectiveStaff.role)),
    showAccounting: Boolean(effectiveStaff && canViewAccounting(effectiveStaff.role)),
    bdOnly: Boolean(effectiveStaff && isBusinessDevelopment(effectiveStaff.role)),
  });
  return (
    <nav className="flex flex-col px-2 py-3">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : item.href === "/accounting"
              ? pathname === "/accounting" || pathname.startsWith("/accounting/")
              : item.href === "/jobs"
                ? pathname.startsWith("/jobs") || pathname.startsWith("/material-orders")
                : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "border-l-2 px-3 py-[7px] text-[13px] tracking-tight transition-colors",
              active
                ? "border-primary bg-white/6 font-medium text-white"
                : "border-transparent text-sidebar-foreground/58 hover:bg-white/4 hover:text-white"
            )}
          >
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
  const { opportunities, jobs, contacts, estimates, invoices, materialOrders, viewer } = useCrm();

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
        className="h-8 w-full max-w-sm justify-start rounded-md font-normal text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search data-icon="inline-start" />
        Search jobs, people, estimates
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search TheRoofingCRM"
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
                  value={`${opportunity.code} ${opportunity.name} ${opportunity.location}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/opportunities/${opportunity.id}`);
                  }}
                >
                  <span className="min-w-0 truncate">{opportunity.name}</span>
                  {opportunity.code ? (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {opportunity.code}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Jobs">
              {jobs.map((job) => (
                <CommandItem
                  key={job.id}
                  value={`${job.code} ${job.name} ${job.location}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/jobs/${job.id}`);
                  }}
                >
                  <span className="min-w-0 truncate">{job.name}</span>
                  {job.code ? (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{job.code}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Messages">
              <CommandItem
                value="messages texts sms sendblue homeowner"
                onSelect={() => {
                  setOpen(false);
                  router.push("/messages");
                }}
              >
                Texts with homeowners
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Photos">
              <CommandItem
                value="photos company feed field"
                onSelect={() => {
                  setOpen(false);
                  router.push("/photos");
                }}
              >
                All company photos
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Contacts">
              {contacts.map((contact) => (
                <CommandItem
                  key={contact.id}
                  value={`${contact.name} ${contact.title} ${contact.email}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/contacts?contact=${contact.id}`);
                  }}
                >
                  {contact.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Estimates">
              {viewer && canManageSettings(viewer.role, viewer) ? (
                <CommandItem
                  value="price book catalog labor material settings"
                  onSelect={() => {
                    setOpen(false);
                    router.push("/settings/price-book");
                  }}
                >
                  Price book
                </CommandItem>
              ) : null}
              <CommandItem
                value="estimate templates company"
                onSelect={() => {
                  setOpen(false);
                  router.push("/estimates/templates");
                }}
              >
                Company templates
              </CommandItem>
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
            <CommandGroup heading="Material orders">
              {(materialOrders ?? []).map((order) => (
                <CommandItem
                  key={order.id}
                  value={`${order.number} ${order.vendor} material order`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/material-orders/${order.id}`);
                  }}
                >
                  {order.number}
                  {order.vendor.trim() ? ` · ${order.vendor}` : ""}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Training">
              {COURSE.chapters.map((chapter) => (
                <CommandItem
                  key={chapter.id}
                  value={`${chapter.title} ${chapter.tagline} training ${chapter.id}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(`/training/${chapter.id}`);
                  }}
                >
                  {chapter.title}
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
        <div className="flex flex-col gap-2 border-b border-primary/20 bg-primary/8 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Logged in as <span className="font-medium">{impersonatedStaff.name}</span>
            <span className="text-muted-foreground"> · {SEAT_ROLE_LABELS[impersonatedStaff.role]}</span>
            . You are viewing their jobs and contact book.
          </p>
          <Button size="sm" variant="outline" onClick={stopLoginAs}>
            Exit Login As
          </Button>
        </div>
      ) : (
        <p className="border-b px-4 py-1.5 text-[11px] text-muted-foreground">{scopeLabel}</p>
      )}
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const { signOut, user, loginAs, loginAsOptions, viewer, impersonatedStaff, stopLoginAs } =
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm text-foreground">{viewer?.name ?? user.name}</span>
              <span className="text-xs font-normal">
                {viewer ? SEAT_ROLE_LABELS[viewer.role] : user.title}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {loginAsOptions.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
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
            </DropdownMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/profile")}>Profile</DropdownMenuItem>
        {viewer && canManageSettings(viewer.role, viewer) ? (
          <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
        ) : null}
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
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}
