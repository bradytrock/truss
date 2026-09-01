import { mailHref } from "@/lib/job-emails";
import { messagesHref } from "@/lib/job-messages";

export type InboxChannel = "texts" | "mail";

export function inboxSwitchHref(
  channel: InboxChannel,
  opts?: {
    contact?: string | null;
    job?: string | null;
    email?: string | null;
    compose?: boolean;
  },
) {
  if (channel === "mail") {
    return mailHref({
      contact: opts?.contact,
      job: opts?.job,
      email: opts?.email,
      compose: opts?.compose,
    });
  }
  return messagesHref({
    contact: opts?.contact,
    job: opts?.job,
    compose: opts?.compose,
  });
}

export function inboxChannelFromPath(pathname: string): InboxChannel {
  return pathname.startsWith("/mail") ? "mail" : "texts";
}

export function isInboxPath(pathname: string) {
  return pathname.startsWith("/messages") || pathname.startsWith("/mail");
}
