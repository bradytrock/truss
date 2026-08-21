"use client";

import { useEffect, useState } from "react";
import { Minus, Square, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactRecord } from "@/components/contact-record";
import { EditContactDialog } from "@/components/create-records";
import type { Contact } from "@/lib/types";

export function ContactRecordWindow({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (editOpen) return;
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [editOpen, onClose]);

  return (
    <div className="fixed inset-x-0 top-12 bottom-0 z-40 md:left-52">
      <button
        type="button"
        className="absolute inset-0 bg-black/25 supports-backdrop-filter:backdrop-blur-xs"
        aria-label="Close contact"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-window-title"
        className={
          expanded
            ? "absolute inset-3 flex flex-col overflow-hidden rounded-md border bg-popover shadow-lg sm:inset-5"
            : "absolute inset-x-3 top-[8%] bottom-[8%] mx-auto flex max-w-2xl flex-col overflow-hidden rounded-md border bg-popover shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[min(42rem,calc(100%-2.5rem))] sm:-translate-x-1/2"
        }
      >
        <div className="flex shrink-0 items-center gap-2 border-b bg-muted/70 px-2 py-1">
          <p id="contact-window-title" className="min-w-0 flex-1 truncate px-1.5 text-sm font-medium">
            {contact.name}
          </p>
          <Button type="button" variant="outline" size="xs" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Minimize">
              <Minus />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? "Restore window" : "Maximize"}
            >
              <Square />
            </Button>
            <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close">
              <XIcon />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <ContactRecord key={contact.id} contact={contact} />
        </div>
      </div>
      <EditContactDialog contact={contact} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
