"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { looksLikePhone } from "@/lib/phone";
import { copyText } from "@/lib/share";
import type { ShareRecipient } from "@/lib/parties";
import {
  defaultShareEmailHtml,
  defaultShareEmailSubject,
  defaultShareEmailText,
  defaultShareText,
  looksLikeEmail,
  type ShareDocumentKind,
} from "@/lib/share-text";

type SendblueStatus = { configured: boolean; fromNumber: string };
type ResendStatus = { configured: boolean; from: string };

export function ShareLinkDialog({
  open,
  onOpenChange,
  title,
  description,
  url,
  kind = "estimate",
  documentNumber,
  documentName,
  companyName,
  recipients = [],
  onDownloadPdf,
  onTexted,
  onEmailed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  url: string;
  kind?: ShareDocumentKind;
  documentNumber?: string;
  documentName?: string;
  companyName?: string;
  recipients?: ShareRecipient[];
  onDownloadPdf?: () => Promise<void> | void;
  onTexted?: (sent: {
    to: string;
    content: string;
    name: string;
    contactId?: string;
    handle?: string;
  }) => void | Promise<void>;
  onEmailed?: (sent: {
    to: string;
    subject: string;
    name: string;
    url: string;
    contactId?: string;
  }) => void | Promise<void>;
}) {
  const [pending, setPending] = useState<"copy" | "pdf" | "text" | "email" | null>(null);
  const [textStatus, setTextStatus] = useState<SendblueStatus | null>(null);
  const [emailStatus, setEmailStatus] = useState<ResendStatus | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");

  const people = useMemo(
    () => recipients.filter((item) => item.name.trim()),
    [recipients],
  );
  const primary = people[0];
  const recipientKey = people
    .map((item) => `${item.id}:${item.name}:${item.phone}:${item.email}:${item.url ?? ""}`)
    .join("|");
  const perPersonLinks = people.length > 1;

  const composedMessage = useMemo(
    () =>
      defaultShareText({
        kind,
        company: companyName || "the office",
        customer: primary?.name || "there",
        number: documentNumber || "",
        name: documentName || "",
        url,
      }),
    [companyName, documentName, documentNumber, kind, primary?.name, url],
  );

  const composedSubject = useMemo(
    () =>
      defaultShareEmailSubject({
        kind,
        company: companyName || "Office",
        number: documentNumber || "",
        name: documentName || "",
      }),
    [companyName, documentName, documentNumber, kind],
  );

  useEffect(() => {
    if (!open) return;
    const nextPhones: Record<string, string> = {};
    const nextEmails: Record<string, string> = {};
    const nextSelected: Record<string, boolean> = {};
    for (const person of people) {
      nextPhones[person.id] = person.phone;
      nextEmails[person.id] = person.email;
      nextSelected[person.id] = Boolean(person.phone.trim() || person.email.trim());
    }
    if (people.length && !Object.values(nextSelected).some(Boolean)) {
      nextSelected[people[0].id] = true;
    }
    setPhones(nextPhones);
    setEmails(nextEmails);
    setSelected(nextSelected);
    setCustomPhone("");
    setCustomEmail("");
    setMessage(composedMessage);
    setSubject(composedSubject);
    // Snapshot when the dialog opens or the document/recipients change — not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipientKey, composedMessage, composedSubject]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      fetch("/api/share/text")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: SendblueStatus | null) => {
          if (!cancelled && data) setTextStatus(data);
        })
        .catch(() => {
          if (!cancelled) setTextStatus({ configured: false, fromNumber: "" });
        }),
      fetch("/api/share/email")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: ResendStatus | null) => {
          if (!cancelled && data) setEmailStatus(data);
        })
        .catch(() => {
          if (!cancelled) setEmailStatus({ configured: false, from: "" });
        }),
    ]);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const textTargets = useMemo(() => {
    const list = people
      .filter((person) => selected[person.id])
      .map((person) => ({
        id: person.id,
        name: person.name,
        phone: (phones[person.id] ?? person.phone).trim(),
        url: person.url || (perPersonLinks ? "" : url),
      }));
    const extra = customPhone.trim();
    if (extra && !list.some((item) => item.phone === extra)) {
      list.push({ id: "custom-phone", name: primary?.name || "Homeowner", phone: extra, url });
    }
    return list;
  }, [customPhone, people, perPersonLinks, phones, primary?.name, selected, url]);

  const emailTargets = useMemo(() => {
    const list = people
      .filter((person) => selected[person.id])
      .map((person) => ({
        id: person.id,
        name: person.name,
        email: (emails[person.id] ?? person.email).trim(),
        url: person.url || (perPersonLinks ? "" : url),
      }));
    const extra = customEmail.trim();
    if (extra && !list.some((item) => item.email === extra)) {
      list.push({ id: "custom-email", name: primary?.name || "Homeowner", email: extra, url });
    }
    return list;
  }, [customEmail, emails, people, perPersonLinks, primary?.name, selected, url]);

  async function handleCopy(link = url) {
    if (!link) return;
    setPending("copy");
    try {
      const ok = await copyText(link);
      if (ok) toast.success("Link copied.");
      else toast.error("Could not copy the link. Select it and copy it yourself.");
    } finally {
      setPending(null);
    }
  }

  async function handleText() {
    const ready = textTargets.filter((target) => looksLikePhone(target.phone));
    if (ready.length === 0) {
      toast.error("Add a mobile number to text, or copy the link.");
      return;
    }
    if (ready.some((target) => !target.url)) {
      toast.error("Each signer needs their own link. Close this and send the proposal again.");
      return;
    }
    if (!message.includes(url) && !textTargets.some((target) => message.includes(target.url))) {
      toast.error("Keep the share link in the message.");
      return;
    }
    setPending("text");
    try {
      let mocked = false;
      for (const target of ready) {
        const theirUrl = target.url || url;
        const body = defaultShareText({
          kind,
          company: companyName || "the office",
          customer: target.name,
          number: documentNumber || "",
          name: documentName || "",
          url: theirUrl,
        });
        const content =
          ready.length === 1
            ? message.replaceAll(url, theirUrl).trim()
            : message.trim() === composedMessage.trim()
              ? body
              : message.replaceAll(url, theirUrl).trim();
        if (!content.includes(theirUrl)) {
          toast.error("Keep the share link in the message.");
          return;
        }
        const response = await fetch("/api/share/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: target.phone, content, url: theirUrl }),
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; mocked?: boolean; error?: string; handle?: string; to?: string }
          | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || `Could not text ${target.name}.`);
          return;
        }
        mocked = Boolean(data.mocked);
        await onTexted?.({
          to: data.to || target.phone,
          content,
          name: target.name,
          contactId: target.id.startsWith("custom") ? undefined : target.id,
          handle: data.handle,
        });
      }
      if (mocked) {
        toast.message(
          "Sendblue is not connected to this website. Add SENDBLUE_API_KEY_ID, SENDBLUE_API_SECRET_KEY, and SENDBLUE_FROM_NUMBER on the host and redeploy, or deploy supabase/functions/send-text.",
        );
      } else {
        toast.success(
          ready.length === 1
            ? `Texted ${ready[0].name}.`
            : `Texted ${ready.map((item) => item.name).join(" and ")}.`,
        );
      }
    } catch {
      toast.error("Could not reach the texting service.");
    } finally {
      setPending(null);
    }
  }

  async function handleEmail() {
    const ready = emailTargets.filter((target) => looksLikeEmail(target.email));
    if (ready.length === 0) {
      toast.error("Add an email address, or copy the link.");
      return;
    }
    if (ready.some((target) => !target.url)) {
      toast.error("Each signer needs their own link. Close this and send the proposal again.");
      return;
    }
    if (!subject.trim()) {
      toast.error("Add a subject before sending.");
      return;
    }
    setPending("email");
    try {
      let mocked = false;
      for (const target of ready) {
        const theirUrl = target.url || url;
        const payload = {
          kind,
          company: companyName || "the office",
          customer: target.name,
          number: documentNumber || "",
          name: documentName || "",
          url: theirUrl,
        };
        const html = defaultShareEmailHtml(payload);
        const text = defaultShareEmailText(payload);
        const response = await fetch("/api/share/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: target.email,
            subject: subject.trim(),
            html,
            text,
            url: theirUrl,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; mocked?: boolean; error?: string; to?: string }
          | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || `Could not email ${target.name}.`);
          return;
        }
        mocked = Boolean(data.mocked);
        await onEmailed?.({
          to: data.to || target.email,
          subject: subject.trim(),
          name: target.name,
          url: theirUrl,
          contactId: target.id.startsWith("custom") ? undefined : target.id,
        });
      }
      if (mocked) {
        toast.message(
          "Resend is not connected on this host. Add RESEND_API_KEY and RESEND_FROM_EMAIL (verified sender) to the host env and redeploy.",
        );
      } else {
        toast.success(
          ready.length === 1
            ? `Emailed ${ready[0].name}.`
            : `Emailed ${ready.map((item) => item.name).join(" and ")}.`,
        );
      }
    } catch {
      toast.error("Could not reach Resend.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {perPersonLinks ? null : (
            <div className="grid gap-2">
              <Label htmlFor="share-link">Client link</Label>
              <div className="grid gap-2">
                <Input
                  id="share-link"
                  readOnly
                  value={url}
                  onFocus={(event) => event.target.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={!url || pending !== null} onClick={() => void handleCopy()}>
                    <Copy />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!url}
                    onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label>{perPersonLinks ? "Recipients" : "Send to the homeowner"}</Label>
            {perPersonLinks ? (
              <p className="text-xs text-muted-foreground">
                Each homeowner has a unique link. The other person’s link will not let them sign.
              </p>
            ) : null}
            {people.length ? (
              <ul className="grid gap-2">
                {people.map((person) => {
                  const theirUrl = person.url || "";
                  return (
                    <li key={person.id} className="flex items-start gap-2 rounded-md border p-2">
                      <Checkbox
                        className="mt-2"
                        checked={Boolean(selected[person.id])}
                        onCheckedChange={(value) =>
                          setSelected((current) => ({ ...current, [person.id]: Boolean(value) }))
                        }
                        aria-label={`Include ${person.name}`}
                      />
                      <div className="grid min-w-0 flex-1 gap-1">
                        <p className="text-sm font-medium">{person.name}</p>
                        <Input
                          type="tel"
                          value={phones[person.id] ?? person.phone}
                          placeholder="Mobile for text"
                          onChange={(event) =>
                            setPhones((current) => ({ ...current, [person.id]: event.target.value }))
                          }
                        />
                        <Input
                          type="email"
                          value={emails[person.id] ?? person.email}
                          placeholder="Email address"
                          onChange={(event) =>
                            setEmails((current) => ({ ...current, [person.id]: event.target.value }))
                          }
                        />
                        {theirUrl ? (
                          <div className="grid gap-1">
                            <Input
                              readOnly
                              value={theirUrl}
                              aria-label={`Signing link for ${person.name}`}
                              onFocus={(event) => event.target.select()}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={pending !== null}
                                onClick={() => void handleCopy(theirUrl)}
                              >
                                <Copy />
                                Copy {person.name.split(" ")[0] || "link"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(theirUrl, "_blank", "noopener,noreferrer")}
                              >
                                <ExternalLink />
                                Open
                              </Button>
                            </div>
                          </div>
                        ) : perPersonLinks ? (
                          <p className="text-xs text-muted-foreground">
                            No unique signing link for {person.name} yet. Close this and share again.
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="tel"
                value={customPhone}
                placeholder={people.length ? "Or another mobile" : "Homeowner mobile"}
                onChange={(event) => setCustomPhone(event.target.value)}
              />
              <Input
                type="email"
                value={customEmail}
                placeholder={people.length ? "Or another email" : "Homeowner email"}
                onChange={(event) => setCustomEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="share-email-subject">Email subject</Label>
              <Input
                id="share-email-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="share-text-body">Text message</Label>
              <Textarea
                id="share-text-body"
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {perPersonLinks
                ? "Each send includes that person’s own signing link. "
                : null}
              {textStatus?.configured
                ? `Texts go out over Sendblue${textStatus.fromNumber ? ` (${textStatus.fromNumber})` : ""}. `
                : "Texts need SENDBLUE_ keys on the host until then Send text previews without delivering. "}
              {emailStatus?.configured
                ? `Email goes out through Resend${emailStatus.from ? ` from ${emailStatus.from}` : ""}.`
                : "Email needs RESEND_API_KEY and RESEND_FROM_EMAIL on the host — until then Send email previews without delivering."}
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          {onDownloadPdf ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => {
                setPending("pdf");
                void Promise.resolve(onDownloadPdf())
                  .catch(() => toast.error("Could not build the PDF."))
                  .finally(() => setPending(null));
              }}
            >
              <Download />
              Download PDF
            </Button>
          ) : null}
          {perPersonLinks ? null : (
            <>
              <Button type="button" variant="outline" disabled={!url || pending !== null} onClick={() => void handleCopy()}>
                <Copy />
                Copy link
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!url}
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink />
                Open
              </Button>
            </>
          )}
          <Button type="button" variant="outline" disabled={!url || pending !== null} onClick={() => void handleEmail()}>
            <Mail />
            {pending === "email" ? "Emailing…" : "Send email"}
          </Button>
          <Button type="button" disabled={!url || pending !== null} onClick={() => void handleText()}>
            <MessageSquare />
            {pending === "text" ? "Sending…" : "Send text"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
