"use client";

import { useMemo, useState } from "react";
import { Clock, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { cardHeaderLogo } from "@/lib/card";
import { shareEmailOwnerFromBook } from "@/lib/document-owner";
import { formatJobSite } from "@/lib/leads";
import { resolveShareContacts } from "@/lib/parties";
import {
  APPLICATION_LINK_DAYS,
  REP_INTERVIEW_STEPS,
  applicationMinutes,
  applicationProgress,
  homeownerCanAnswer,
  interviewAnswered,
  interviewQuestionVisible,
  sendPayAtCloseApplication,
  type JobPayAtClose,
} from "@/lib/pay-at-close";
import { firstName, looksLikePhone } from "@/lib/phone";
import { copyText, displayShareLink, newApplicationToken, shareUrl } from "@/lib/share";
import { defaultShareEmailHtml, defaultShareEmailText, looksLikeEmail } from "@/lib/share-text";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

type Channel = "text" | "email" | "both";

/** First line of the text and the email. Written as the project manager, with the short link the way it reads on a phone. */
export function homeownerInviteMessage(input: { rep: string; company: string; minutes: number; link: string }) {
  const who = input.rep ? `Hi, it’s ${input.rep} with ${input.company}.` : `Hi, it’s ${input.company}.`;
  return `${who} To set up paying for your roof at closing, please answer a few quick questions about your sale (about ${input.minutes} minute${input.minutes === 1 ? "" : "s"}): ${input.link}`;
}

/** What the homeowner never sees: the office-only steps and the required questions only the PM can answer. */
export function pmOnlyLabel() {
  const parts: string[] = [];
  for (const step of REP_INTERVIEW_STEPS) {
    const answerable = step.questions.filter((question) => homeownerCanAnswer(question));
    if (answerable.length === 0) {
      parts.push(step.title);
      continue;
    }
    for (const question of step.questions) {
      if (question.required && !homeownerCanAnswer(question)) parts.push(question.label.toLowerCase());
    }
  }
  return parts.join(", ");
}

/**
 * Send to homeowner: the office side of the `/q/<code>` link. Text, email, or both; what the
 * homeowner will be asked, with how much is still open per page; and the message as it goes out.
 */
export function PayAtCloseSendDialog(props: {
  job: Job;
  record: JobPayAtClose;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persists the record and returns the saved copy (null when the save failed). */
  onSave: (next: JobPayAtClose) => Promise<JobPayAtClose | null>;
}) {
  // Mounted fresh each time it opens so the recipient, toggle, and message start from the file.
  if (!props.open) return null;
  return <SendBody {...props} />;
}

function SendBody({
  job,
  record,
  onOpenChange,
  onSave,
}: {
  job: Job;
  record: JobPayAtClose;
  onOpenChange: (open: boolean) => void;
  onSave: (next: JobPayAtClose) => Promise<JobPayAtClose | null>;
}) {
  const crm = useCrm();
  const recipients = useMemo(() => resolveShareContacts({ jobId: job.id, primaryContactId: job.primaryContactId }, crm), [crm, job.id, job.primaryContactId]);
  const primary = recipients[0];
  const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
  const sender = shareEmailOwnerFromBook({
    job,
    opportunity,
    staff: crm.staff,
    fallbackStaffId: crm.user.staffId,
    senderStaff: crm.effectiveStaff ?? crm.viewer,
    companyPhone: crm.company.phone,
    companyEmail: crm.company.email,
    companySignature: crm.company.defaultEmailSignature,
  });
  const repFirst = firstName(sender?.name || crm.effectiveStaff?.name || "");
  const companyName = crm.company.name;

  const [channel, setChannel] = useState<Channel>(() => (primary?.phone ? "text" : primary?.email ? "email" : "text"));
  const [phone, setPhone] = useState(primary?.phone ?? "");
  const [email, setEmail] = useState(primary?.email ?? "");
  const [onlyOpen, setOnlyOpen] = useState(record.application.askOnlyOpen);
  // Null until the user edits; before that the message follows the toggle and recipient.
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // The code is minted the first time the dialog opens so the message can carry the real link.
  const [minted] = useState(() => newApplicationToken());
  const token = record.application.token || minted;
  const url = shareUrl("q", token);
  const link = displayShareLink(url);

  const progress = applicationProgress(record);
  const shownSections = onlyOpen ? progress.sections.filter((item) => !item.answered) : progress.sections;
  const openCount = shownSections.reduce((sum, item) => sum + item.open, 0);
  const askedCount = onlyOpen ? openCount : progress.total;
  const minutes = applicationMinutes(Math.max(askedCount, shownSections.length || 1));
  const requiredOpenHomeowner = REP_INTERVIEW_STEPS.flatMap((step) => step.questions).filter(
    (question) => question.required && homeownerCanAnswer(question) && interviewQuestionVisible(record, question) && !interviewAnswered(record, question),
  ).length;

  const composed = homeownerInviteMessage({ rep: repFirst, company: companyName, minutes, link });
  const message = customMessage ?? composed;
  const setMessage = (value: string) => setCustomMessage(value);

  const wantsText = channel === "text" || channel === "both";
  const wantsEmail = channel === "email" || channel === "both";

  async function stamp(sentTo: string) {
    const next = sendPayAtCloseApplication(record, token, sentTo, new Date(), { askOnlyOpen: onlyOpen });
    return onSave(next);
  }

  async function copyLink() {
    // Make sure the link opens before it leaves the office.
    const saved = record.application.token && record.application.sentAt ? record : await stamp(record.application.sentTo);
    if (!saved) return;
    const ok = await copyText(link);
    if (ok) toast.success("Link copied.");
    else toast.error("Could not copy. Select the link and copy it by hand.");
  }

  function preview() {
    window.open(`${url}?preview=1`, "_blank", "noopener,noreferrer");
  }

  async function send() {
    const to: string[] = [];
    if (wantsText) {
      if (!looksLikePhone(phone)) {
        toast.error("Enter a mobile number to text.");
        return;
      }
      to.push(phone.trim());
    }
    if (wantsEmail) {
      if (!looksLikeEmail(email)) {
        toast.error("Enter an email address.");
        return;
      }
      if (!sender?.name?.trim() || !looksLikeEmail(sender.email?.trim() || "")) {
        toast.error("Add an email on the project manager’s profile (Settings → People) before emailing. Replies go there.");
        return;
      }
      to.push(email.trim());
    }
    if (!message.includes(link) && !message.includes(url)) {
      toast.error("Keep the link in the message.");
      return;
    }
    setSending(true);
    try {
      const saved = await stamp(to.join(", "));
      if (!saved) return;
      let mocked = false;
      if (wantsText) {
        const response = await fetch("/api/share/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: phone.trim(), content: message.trim(), url }),
        });
        const data = (await response.json().catch(() => null)) as { ok?: boolean; mocked?: boolean; error?: string; handle?: string; to?: string } | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || "Could not send the text.");
          return;
        }
        mocked = Boolean(data.mocked);
        await crm.logOutboundText({
          to: data.to || phone.trim(),
          content: message.trim(),
          name: primary?.name || "Homeowner",
          contactId: primary?.id || job.primaryContactId,
          handle: data.handle,
          jobId: job.id,
          opportunityId: job.opportunityId,
          kind: "pay_at_close_application",
        });
      }
      if (wantsEmail) {
        const subject = "Pay for your roof when your home sells";
        const payload = {
          kind: "page" as const,
          company: companyName,
          customer: primary?.name || "Homeowner",
          number: "",
          name: "Pay at Close questions",
          url,
          logoUrl: cardHeaderLogo(crm.company) || "",
          origin: window.location.origin,
          street: job.street,
          city: job.city,
          state: job.state,
          postalCode: job.postalCode,
          companyWebsite: crm.company.website,
          companyPhone: crm.company.phone,
          owner: sender,
          headline: `Hi ${firstName(primary?.name || "there")}`,
          message: message.trim(),
          buttonLabel: "Answer the questions",
        };
        const response = await fetch("/api/share/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email.trim(),
            subject,
            html: defaultShareEmailHtml(payload),
            text: defaultShareEmailText(payload),
            url,
            senderName: sender?.name ?? "",
            companyName,
            replyTo: sender?.email ?? "",
          }),
        });
        const data = (await response.json().catch(() => null)) as { ok?: boolean; mocked?: boolean; error?: string; to?: string } | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || "Could not send the email.");
          return;
        }
        mocked = mocked || Boolean(data.mocked);
        await crm.logOutboundEmail({
          to: data.to || email.trim(),
          subject,
          url,
          name: primary?.name || "Homeowner",
          contactId: primary?.id || job.primaryContactId,
          jobId: job.id,
          opportunityId: job.opportunityId,
        });
      }
      toast.success(mocked ? "Logged on the job. Connect texting or email under Settings to deliver it." : `Sent to ${primary?.name || "the homeowner"}.`);
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  }

  const sendLabel = channel === "both" ? "Send text and email" : channel === "email" ? "Send email" : "Send text";
  const pmOnly = pmOnlyLabel();
  const propertyAddress = formatJobSite({ street: job.street, city: job.city, state: job.state, postalCode: job.postalCode });

  return (
    <Dialog unsavedGuard={false} open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="font-heading text-2xl font-medium tracking-tight">Send to homeowner</DialogTitle>
          <DialogDescription>They answer on their phone. Answers fill this form as they go.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
            <div className="inline-flex rounded-[10px] border p-0.5" role="radiogroup" aria-label="How to send">
              {(["text", "email", "both"] as Channel[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={channel === option}
                  onClick={() => setChannel(option)}
                  className={cn(
                    "rounded-[8px] px-4 py-2 text-sm font-medium capitalize transition-colors",
                    channel === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">To</p>
              {wantsText ? (
                <div className="flex items-center gap-2">
                  {primary?.name ? <span className="shrink-0 text-sm">{primary.name} ·</span> : null}
                  <PhoneInput value={phone} placeholder="Mobile number" onValueChange={setPhone} />
                </div>
              ) : null}
              {wantsEmail ? (
                <div className="flex items-center gap-2">
                  {primary?.name && !wantsText ? <span className="shrink-0 text-sm">{primary.name} ·</span> : null}
                  <Input type="email" value={email} placeholder="Email address" autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">What they’ll be asked</p>
            <ul className="divide-y rounded-[12px] border">
              {progress.sections.map((item) => {
                const shown = !onlyOpen || !item.answered;
                return (
                  <li key={item.section.id} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", shown ? "" : "text-muted-foreground")}>
                    <Checkbox checked={shown} disabled aria-label={shown ? "Asked" : "Skipped: already answered"} className="data-disabled:opacity-100" />
                    <span className="flex-1">{item.section.officeLabel}</span>
                    <span className="text-xs text-muted-foreground">{item.open > 0 ? `${item.open} open` : "answered"}</span>
                  </li>
                );
              })}
              {pmOnly ? (
                <li className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground">
                  <Lock className="size-4 shrink-0" />
                  <span className="flex-1">
                    {pmOnly.charAt(0).toUpperCase()}
                    {pmOnly.slice(1)}
                  </span>
                  <span className="text-xs">PM only — never shown</span>
                </li>
              ) : null}
            </ul>
            <label className="flex cursor-pointer items-center gap-3 py-1 text-sm">
              <Switch checked={onlyOpen} onChange={setOnlyOpen} />
              <span>
                Only ask what’s still unanswered ({openCount} question{openCount === 1 ? "" : "s"}, about {applicationMinutes(Math.max(openCount, 1))} minute
                {applicationMinutes(Math.max(openCount, 1)) === 1 ? "" : "s"})
              </span>
            </label>
            {requiredOpenHomeowner > 0 && !onlyOpen ? (
              <p className="text-xs text-muted-foreground">
                {requiredOpenHomeowner} required answer{requiredOpenHomeowner === 1 ? "" : "s"} on this file can come from the homeowner.
              </p>
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Message</span>
            <Textarea
              value={message}
              rows={4}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-[10px] bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" />
              {job.postalCode?.trim() ? "Opens after they confirm the property ZIP" : "Add a ZIP to the job site to gate the link"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Expires in {APPLICATION_LINK_DAYS} days
            </span>
            {propertyAddress ? <span className="ml-auto truncate">{propertyAddress}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t px-6 py-4">
          <Button type="button" variant="outline" className="bg-card" disabled={sending} onClick={() => void copyLink()}>
            Copy link
          </Button>
          <Button type="button" variant="link" className="px-0" onClick={preview}>
            Preview as homeowner
          </Button>
          <Button type="button" className="ml-auto" disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : sendLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors", checked ? "border-primary bg-primary" : "border-border bg-muted")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-background shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}
