"use client";

import { useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Phone,
  Plus,
  ReceiptText,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NewMenuAction = {
  id: string;
  title: string;
  detail: string;
  icon: LucideIcon;
  shortcut?: string;
  onSelect: () => void;
};

const rowClass =
  "items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-primary/10 hover:text-foreground focus:bg-primary/10 focus:text-foreground data-highlighted:bg-primary/10 data-highlighted:text-foreground";

const iconClass =
  "flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f2f2f2] text-[#5c5c5c] transition-colors group-hover/dropdown-menu-item:bg-primary! group-hover/dropdown-menu-item:text-primary-foreground! group-focus/dropdown-menu-item:bg-primary! group-focus/dropdown-menu-item:text-primary-foreground! group-data-[highlighted]/dropdown-menu-item:bg-primary! group-data-[highlighted]/dropdown-menu-item:text-primary-foreground! dark:bg-muted dark:text-muted-foreground";

const glyphClass =
  "size-4 group-hover/dropdown-menu-item:text-primary-foreground! group-focus/dropdown-menu-item:text-primary-foreground! group-data-[highlighted]/dropdown-menu-item:text-primary-foreground!";

const copyClass =
  "mt-0.5 block text-xs leading-4 text-muted-foreground group-hover/dropdown-menu-item:text-muted-foreground! group-focus/dropdown-menu-item:text-muted-foreground! group-data-[highlighted]/dropdown-menu-item:text-muted-foreground!";

const shortcutClass =
  "ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-border bg-popover font-sans text-[11px] font-medium text-muted-foreground group-hover/dropdown-menu-item:text-muted-foreground! group-focus/dropdown-menu-item:text-muted-foreground! group-data-[highlighted]/dropdown-menu-item:text-muted-foreground!";

export function JobNewMenu({
  pending = false,
  showEstimate,
  showInvoice,
  showMaterialOrder,
  showExpense,
  onEstimate,
  onInvoice,
  onMaterialOrder,
  onMaterialTemplate,
  onInteraction,
  onExpense,
}: {
  pending?: boolean;
  showEstimate: boolean;
  showInvoice: boolean;
  showMaterialOrder: boolean;
  showExpense: boolean;
  onEstimate: () => void;
  onInvoice: () => void;
  onMaterialOrder: () => void;
  onMaterialTemplate: () => void;
  onInteraction: () => void;
  onExpense: () => void;
}) {
  const [open, setOpen] = useState(false);

  const sales: NewMenuAction[] = [];
  if (showEstimate) {
    sales.push({
      id: "estimate",
      title: "Estimate",
      detail: "Scope and price for the homeowner",
      icon: FileText,
      shortcut: "E",
      onSelect: onEstimate,
    });
  }
  if (showInvoice) {
    sales.push({
      id: "invoice",
      title: "Invoice",
      detail: "Bill the homeowner or carrier",
      icon: ReceiptText,
      shortcut: "I",
      onSelect: onInvoice,
    });
  }

  const material: NewMenuAction | null = showMaterialOrder
    ? {
        id: "materials",
        title: "Material order",
        detail: "Blank order to supplier",
        icon: Truck,
        onSelect: onMaterialOrder,
      }
    : null;

  const log: NewMenuAction[] = [
    {
      id: "interaction",
      title: "Interaction",
      detail: "Call, visit or note",
      icon: Phone,
      shortcut: "N",
      onSelect: onInteraction,
    },
  ];
  if (showExpense) {
    log.push({
      id: "expense",
      title: "Expense",
      detail: "Job cost: dump fee, permit, labor",
      icon: ArrowUp,
      shortcut: "X",
      onSelect: onExpense,
    });
  }

  const groups = [
    sales.length ? { id: "sales", label: "Sales & billing", items: sales } : null,
    material ? { id: "materials", label: "Materials", items: [material] } : null,
    { id: "log", label: "Log on this job", items: log },
  ].filter((group) => group != null);

  const shortcuts = new Map<string, () => void>();
  for (const group of groups) {
    for (const item of group.items) {
      if (item.shortcut) shortcuts.set(item.shortcut.toLowerCase(), item.onSelect);
    }
  }

  function choose(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="sm"
            className="rounded-lg"
            disabled={pending}
            aria-label="Create on this job"
          />
        }
      >
        <Plus data-icon="inline-start" />
        {pending ? "Opening…" : "New"}
        <ChevronDown
          data-icon="inline-end"
          className={cn("transition-transform duration-150", open && "rotate-180")}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        style={{ width: "min(23rem, calc(100vw - 2rem))" }}
        className="rounded-[16px] p-2 shadow-xl"
        onKeyDownCapture={(event) => {
          if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
          const run = shortcuts.get(event.key.toLowerCase());
          if (!run) return;
          event.preventDefault();
          event.stopPropagation();
          choose(run);
        }}
      >
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.id}>
            {index > 0 ? <DropdownMenuSeparator className="mx-1 my-1.5" /> : null}
            <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) =>
              item.id === "materials" ? (
                <div key={item.id} className="relative">
                  <NewMenuRow item={item} className="pr-32" onSelect={() => choose(item.onSelect)} />
                  <DropdownMenuItem
                    className="absolute top-1/2 right-2 z-10 h-7 w-auto -translate-y-1/2 rounded-full border border-border bg-popover px-2.5 py-0 text-[13px] font-medium text-foreground hover:bg-accent focus:bg-accent focus:text-foreground data-highlighted:bg-accent data-highlighted:text-foreground"
                    onClick={() => choose(onMaterialTemplate)}
                  >
                    From template
                  </DropdownMenuItem>
                </div>
              ) : (
                <NewMenuRow key={item.id} item={item} onSelect={() => choose(item.onSelect)} />
              ),
            )}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NewMenuRow({
  item,
  className,
  onSelect,
}: {
  item: NewMenuAction;
  className?: string;
  onSelect: () => void;
}) {
  const Icon = item.icon;
  return (
    <DropdownMenuItem
      className={cn(rowClass, className)}
      aria-keyshortcuts={item.shortcut}
      onClick={onSelect}
    >
      <span data-slot="new-menu-icon" className={iconClass}>
        <Icon className={glyphClass} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-5 font-medium">{item.title}</span>
        <span data-slot="new-menu-copy" className={copyClass}>
          {item.detail}
        </span>
      </span>
      {item.shortcut ? (
        <span data-slot="new-menu-shortcut" aria-hidden="true" className={shortcutClass}>
          {item.shortcut}
        </span>
      ) : null}
    </DropdownMenuItem>
  );
}
