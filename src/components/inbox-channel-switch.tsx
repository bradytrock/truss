"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Mail, MessageSquare } from "lucide-react";
import { inboxChannelFromPath, inboxSwitchHref } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export function InboxChannelSwitch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const channel = inboxChannelFromPath(pathname);
  const contact = params.get("contact");
  const job = params.get("job");
  const email = params.get("email");
  const compose = params.get("compose") === "1";
  const carry = { contact, job, email, compose };

  return (
    <div
      role="tablist"
      aria-label="Inbox channel"
      className="grid grid-cols-2 rounded-md bg-muted p-[3px]"
    >
      <Link
        role="tab"
        aria-selected={channel === "texts"}
        href={inboxSwitchHref("texts", carry)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium",
          channel === "texts"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MessageSquare className="size-3.5" />
        Texts
      </Link>
      <Link
        role="tab"
        aria-selected={channel === "mail"}
        href={inboxSwitchHref("mail", carry)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium",
          channel === "mail"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Mail className="size-3.5" />
        Mail
      </Link>
    </div>
  );
}
