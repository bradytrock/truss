"use client";

import { Menu } from "@base-ui/react/menu";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar,
  ChartLine,
  ChevronDown,
  Home,
  Plus,
  Sparkles,
  SquareCheck,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { openCassio } from "@/lib/assistant/ask";
import {
  createActionForShortcut,
  createMenuSections,
  type CreateAction,
  type CreateMenuIcon,
  type CreateMenuItem,
} from "@/lib/create-menu";
import { ASSISTANT_NAME } from "@/lib/product";
import { cn } from "@/lib/utils";

const ICONS: Record<CreateMenuIcon, LucideIcon> = {
  lead: Home,
  contact: UserRoundPlus,
  event: Calendar,
  task: SquareCheck,
  payment: ArrowDownToLine,
  expense: ArrowUpFromLine,
  forecast: ChartLine,
};

export function CreateMenu({
  bdOnly,
  onCreate,
}: {
  bdOnly: boolean;
  onCreate: (action: CreateAction) => void;
}) {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => createMenuSections({ bdOnly }), [bdOnly]);

  function choose(action: CreateAction) {
    setOpen(false);
    onCreate(action);
  }

  function ask() {
    setOpen(false);
    openCassio();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) return;
    const action = createActionForShortcut(sections, event.key);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    choose(action);
  }

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        render={
          <Button
            size="sm"
            aria-label="Create"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          />
        }
      >
        <Plus data-icon="inline-start" />
        <span className="hidden sm:inline">Create</span>
        <ChevronDown
          data-icon="inline-end"
          className="transition-transform duration-150 group-data-[popup-open]/button:rotate-180"
        />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="isolate z-50 outline-none" align="end" sideOffset={8}>
          <Menu.Popup
            className="z-50 w-[min(20.5rem,calc(100vw-1.5rem))] origin-(--transform-origin) overflow-hidden rounded-[14px] bg-popover text-popover-foreground shadow-[0_16px_40px_-16px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.06)] ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
            onKeyDownCapture={onKeyDown}
          >
            <div className="px-1.5 pt-1.5 pb-1">
              {sections.map((section, index) => (
                <Menu.Group key={section.id}>
                  {index > 0 ? <div className="-mx-1.5 my-1 h-px bg-[#ececec] dark:bg-border" /> : null}
                  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#8d8d8d] uppercase">
                    {section.label}
                  </div>
                  {section.items.map((item) => (
                    <CreateMenuRow key={item.action} item={item} onChoose={choose} />
                  ))}
                </Menu.Group>
              ))}
            </div>
            <div className="border-t border-[#ececeb] bg-[#f9f9f8] p-1.5 dark:border-border dark:bg-white/4">
              <Menu.Item
                className="flex cursor-default items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] outline-none select-none data-highlighted:bg-black/5 dark:data-highlighted:bg-white/8"
                onClick={ask}
              >
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">Or just tell {ASSISTANT_NAME} what to create</span>
                <Shortcut>⌘K</Shortcut>
              </Menu.Item>
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function CreateMenuRow({
  item,
  onChoose,
}: {
  item: CreateMenuItem;
  onChoose: (action: CreateAction) => void;
}) {
  const Icon = ICONS[item.icon];
  return (
    <Menu.Item
      className="group flex w-full cursor-default items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left outline-none select-none data-highlighted:bg-[#fbebea] dark:data-highlighted:bg-primary/15"
      onClick={() => onChoose(item.action)}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#efefed] text-[#1a1a1a]",
          "group-data-[highlighted]:bg-primary group-data-[highlighted]:text-white",
          "dark:bg-white/8 dark:text-foreground",
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-4 font-semibold">{item.label}</span>
        {item.description ? (
          <span className="mt-0.5 block text-[12px] leading-4 text-[#8a8a8a]">{item.description}</span>
        ) : null}
      </span>
      <Shortcut>{item.shortcut}</Shortcut>
    </Menu.Item>
  );
}

function Shortcut({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-[5px] border border-[#e3e3e1] bg-white px-1 font-sans text-[11px] leading-none font-medium text-[#8a8a8a] dark:border-border dark:bg-transparent dark:text-muted-foreground">
      {children}
    </kbd>
  );
}
