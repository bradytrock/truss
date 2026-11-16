"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, ExternalLink, FileText, Link2, Mail, MessageSquare, Plus, RotateCcw, Send, X } from "lucide-react";
import { SendSignStep } from "@/components/send-sign-step";
import { smsSegmentCount } from "@/lib/automations/merge";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { firstName, formatPhoneInput, looksLikePhone } from "@/lib/phone";
import {
  emailTemplateHasOverride,
  resolveSystemEmail,
  type CompanyEmailTemplates,
  type SystemEmailKind,
} from "@/lib/email-templates";
import { copyText } from "@/lib/share";
import type { ShareRecipient } from "@/lib/parties";
import {
  defaultShareEmailHtml,
  defaultShareEmailSubject,
  defaultShareEmailText,
  defaultShareText,
  looksLikeEmail,
  type ShareDocumentKind,
  type ShareEmailOwner,
} from "@/lib/share-text";
import { formatResendFromDisplay, RESEND_FROM_ADDRESS } from "@/lib/resend-from";

type PhotonTextStatus = { configured: boolean };
type ResendStatus = { configured: boolean; from: string; domain?: string };

function shareEmailKind(kind: ShareDocumentKind): SystemEmailKind {
  if (kind === "invoice") return "invoice";
  if (kind === "page") return "page";
  return "estimate";
}

function shareAddressClause(kind: ShareDocumentKind, propertyAddress: string, documentNumber: string) {
  const address = propertyAddress.trim();
  if (address) return ` for ${address}`;
  if (kind === "invoice" && documentNumber.trim()) return ` (${documentNumber.trim()})`;
  return "";
}

type ChannelChoice = { text: boolean; email: boolean };
type DeliveryReport = { sentIds: string[]; failed: boolean; mocked: boolean };
type SentStatus = "sent" | "failed" | "skipped";
type SentPerson = {
  id: string;
  name: string;
  phone: string;
  email: string;
  url: string;
  textStatus: SentStatus;
  emailStatus: SentStatus;
};

function displayShareUrl(value: string) {
  const stripped = value.trim().replace(/^https?:\/\//, "");
  if (stripped.length <= 34) return stripped;
  return `${stripped.slice(0, 33)}…`;
}

function sheetAddress(input: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyAddress?: string;
  fallback: string;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const postal = input.postalCode?.trim() ?? "";
  const locality = [[city, state].filter(Boolean).join(", "), postal].filter(Boolean).join(" ");
  if (street || locality) {
    return { title: street || locality, subtitle: street ? locality : "" };
  }
  const full = input.propertyAddress?.trim() ?? "";
  if (!full) return { title: input.fallback, subtitle: "" };
  const comma = full.indexOf(",");
  if (comma <= 0) return { title: full, subtitle: "" };
  return { title: full.slice(0, comma).trim(), subtitle: full.slice(comma + 1).trim() };
}

function sendActionLabel(textCount: number, emailCount: number, sending: boolean) {
  if (sending) return "Sending…";
  if (textCount > 0 && emailCount > 0) return "Send text & email";
  if (textCount > 0) return "Send text";
  if (emailCount > 0) return "Send email";
  return "Send";
}

function joinedFirstNames(names: string[]) {
  const firsts = names.map((name) => firstName(name)).filter((name) => name && name !== "there");
  if (firsts.length === 0) return "them";
  if (firsts.length === 1) return firsts[0];
  if (firsts.length === 2) return `${firsts[0]} and ${firsts[1]}`;
  return `${firsts.slice(0, -1).join(", ")}, and ${firsts[firsts.length - 1]}`;
}

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
  companyLogoUrl,
  propertyAddress,
  /** Project manager on the job — From name, Reply-To, sign-off, and contact block. */
  sender,
  recipients = [],
  jobStreet,
  jobCity,
  jobState,
  jobPostalCode,
  validUntil,
  companyWebsite,
  companyPhone,
  companyStreet,
  companyCity,
  companyState,
  companyPostalCode,
  emailTemplates,
  onDownloadPdf,
  onAddSigner,
  contractorSign,
  onTexted,
  onEmailed,
  unsavedGuard = true,
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
  /** Wide card logo (same as the business card header). */
  companyLogoUrl?: string;
  /** Job site / property address for the email subject. */
  propertyAddress?: string;
  sender?: ShareEmailOwner | null;
  recipients?: ShareRecipient[];
  jobStreet?: string;
  jobCity?: string;
  jobState?: string;
  jobPostalCode?: string;
  validUntil?: string | null;
  companyWebsite?: string;
  companyPhone?: string;
  companyStreet?: string;
  companyCity?: string;
  companyState?: string;
  companyPostalCode?: string;
  emailTemplates?: CompanyEmailTemplates;
  onDownloadPdf?: () => Promise<void> | void;
  /** Creates the next homeowner on the job and returns false when it did not stick. */
  onAddSigner?: (input: { name: string; phone: string; email: string }) => Promise<boolean | void> | boolean | void;
  /**
   * Estimate send flow. Present only when sending (not when copying a link).
   * The sheet opens on Sign until `onSign` saves the contractor signature.
   */
  contractorSign?: {
    signed: boolean;
    signer: { name: string; title: string } | null;
    assignees: string[];
    signedAt?: string | null;
    signedName?: string | null;
    signedTitle?: string | null;
    consentText: string;
    onSign: (input: { image: string }) => Promise<boolean | void> | boolean | void;
  };
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
  unsavedGuard?: boolean;
}) {
  const [pending, setPending] = useState<"copy" | "pdf" | "text" | "email" | "send" | null>(null);
  const [textStatus, setTextStatus] = useState<PhotonTextStatus | null>(null);
  const [emailStatus, setEmailStatus] = useState<ResendStatus | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [channels, setChannels] = useState<Record<string, ChannelChoice>>({});
  const [phase, setPhase] = useState<"sign" | "compose" | "sent">("compose");
  const [signedLocally, setSignedLocally] = useState(false);
  const [signSession, setSignSession] = useState(0);
  const [signing, setSigning] = useState(false);
  const [sentPeople, setSentPeople] = useState<SentPerson[]>([]);
  const [sentNotes, setSentNotes] = useState<{ textMocked: boolean; emailMocked: boolean }>({
    textMocked: false,
    emailMocked: false,
  });
  const [messageMode, setMessageMode] = useState<"text" | "email">("text");
  const [editingMessage, setEditingMessage] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [addingSigner, setAddingSigner] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [addingPending, setAddingPending] = useState(false);
  const [messageBaseline, setMessageBaseline] = useState("");
  const [subjectBaseline, setSubjectBaseline] = useState("");
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  const sheet = kind === "estimate" || kind === "invoice";

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
        propertyAddress,
      }),
    [companyName, documentName, documentNumber, kind, primary?.name, propertyAddress, url],
  );

  const composedSubject = useMemo(() => {
    const company = companyName?.trim() || "Office";
    const copy = resolveSystemEmail(shareEmailKind(kind), emailTemplates, {
      name: firstName(primary?.name || ""),
      company,
      address: propertyAddress?.trim() || "",
      addressClause: shareAddressClause(kind, propertyAddress || "", documentNumber || ""),
      number: documentNumber?.trim() || "",
      nameLabel: documentName?.trim() ? ` (${documentName.trim()})` : "",
      document: documentName?.trim() || "a document",
      managerLine: sender?.name?.trim()
        ? `${firstName(sender.name)} put this together after walking your roof. `
        : "",
    });
    if (!emailTemplates?.[shareEmailKind(kind)]?.subject?.trim()) {
      return defaultShareEmailSubject({
        kind,
        company,
        number: documentNumber || "",
        name: documentName || "",
        propertyAddress: propertyAddress || "",
      });
    }
    return copy.subject;
  }, [
    companyName,
    documentName,
    documentNumber,
    emailTemplates,
    kind,
    primary?.name,
    propertyAddress,
    sender?.name,
  ]);

  const sheetKey = sheet && open ? `${recipientKey}\n${composedMessage}\n${composedSubject}` : null;
  if (sheetKey !== appliedKey) {
    setAppliedKey(sheetKey);
    if (sheetKey) {
      const seed = people.length > 0 ? people : [{ id: "adhoc", phone: "", email: "" }];
      const justOpened = appliedKey === null;
      if (justOpened) {
        const nextPhones: Record<string, string> = {};
        const nextEmails: Record<string, string> = {};
        const nextChannels: Record<string, ChannelChoice> = {};
        for (const person of seed) {
          nextPhones[person.id] = person.phone;
          nextEmails[person.id] = person.email;
          nextChannels[person.id] = {
            text: Boolean(person.phone.trim()),
            email: Boolean(person.email.trim()),
          };
        }
        setPhones(nextPhones);
        setEmails(nextEmails);
        setChannels(nextChannels);
        setMessage(composedMessage);
        setSubject(composedSubject);
        setMessageBaseline(composedMessage);
        setSubjectBaseline(composedSubject);
        setPhase(contractorSign && !contractorSign.signed ? "sign" : "compose");
        setSignedLocally(false);
        setSignSession(0);
        setSigning(false);
        setSentPeople([]);
        setSentNotes({ textMocked: false, emailMocked: false });
        setMessageMode("text");
        setEditingMessage(false);
        setEditingChannel(null);
        setAddingSigner(false);
        setDraftName("");
        setDraftPhone("");
        setDraftEmail("");
        setAddingPending(false);
        setPending(null);
      } else {
        setPhones((current) => {
          let changed = false;
          const next = { ...current };
          for (const person of seed) {
            if (next[person.id] === undefined) {
              next[person.id] = person.phone;
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setEmails((current) => {
          let changed = false;
          const next = { ...current };
          for (const person of seed) {
            if (next[person.id] === undefined) {
              next[person.id] = person.email;
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setChannels((current) => {
          let changed = false;
          const next = { ...current };
          for (const person of seed) {
            if (!next[person.id]) {
              next[person.id] = {
                text: Boolean(person.phone.trim()),
                email: Boolean(person.email.trim()),
              };
              changed = true;
            }
          }
          return changed ? next : current;
        });
        setMessage((current) => (current === messageBaseline ? composedMessage : current));
        setSubject((current) => (current === subjectBaseline ? composedSubject : current));
        setMessageBaseline(composedMessage);
        setSubjectBaseline(composedSubject);
      }
    }
  }

  useEffect(() => {
    if (!open || kind !== "page") return;
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
  }, [open, kind, recipientKey, composedMessage, composedSubject]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      fetch("/api/share/text")
        .then((response) => (response.ok ? response.json() : null))
        .then((data: PhotonTextStatus | null) => {
          if (!cancelled && data) setTextStatus(data);
        })
        .catch(() => {
          if (!cancelled) setTextStatus({ configured: false });
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

  const roster = useMemo(() => {
    if (!sheet || people.length > 0) return people;
    return [
      {
        id: "adhoc",
        name: kind === "invoice" ? "Recipient" : "Homeowner",
        phone: "",
        email: "",
        url,
        role: kind === "invoice" ? "Recipient" : "Homeowner",
      },
    ];
  }, [sheet, people, kind, url]);

  const textTargets = useMemo(() => {
    const source = sheet ? roster : people;
    const list = source
      .filter((person) => (sheet ? channels[person.id]?.text : selected[person.id]))
      .map((person) => ({
        id: person.id,
        name: person.name,
        phone: (phones[person.id] ?? person.phone).trim(),
        url: person.url || (sheet && kind === "invoice" ? url : perPersonLinks ? "" : url),
      }));
    if (!sheet) {
      const extra = customPhone.trim();
      if (extra && !list.some((item) => item.phone === extra)) {
        list.push({ id: "custom-phone", name: primary?.name || "Homeowner", phone: extra, url });
      }
    }
    return list;
  }, [channels, customPhone, kind, people, perPersonLinks, phones, primary?.name, roster, selected, sheet, url]);

  const emailTargets = useMemo(() => {
    const source = sheet ? roster : people;
    const list = source
      .filter((person) => (sheet ? channels[person.id]?.email : selected[person.id]))
      .map((person) => ({
        id: person.id,
        name: person.name,
        email: (emails[person.id] ?? person.email).trim(),
        url: person.url || (sheet && kind === "invoice" ? url : perPersonLinks ? "" : url),
      }));
    if (!sheet) {
      const extra = customEmail.trim();
      if (extra && !list.some((item) => item.email === extra)) {
        list.push({ id: "custom-email", name: primary?.name || "Homeowner", email: extra, url });
      }
    }
    return list;
  }, [channels, customEmail, emails, kind, people, perPersonLinks, primary?.name, roster, selected, sheet, url]);

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

  function loggedContactId(id: string) {
    if (id === "adhoc" || id.startsWith("custom")) return undefined;
    return id;
  }

  function textProblem(ready: typeof textTargets) {
    if (ready.length === 0) return "Add a mobile number to text, or copy the link.";
    if (sheet && textTargets.some((target) => !looksLikePhone(target.phone))) {
      return "Add a mobile number for each text.";
    }
    if (ready.some((target) => !target.url)) {
      return "Each signer needs their own link. Close this and send the proposal again.";
    }
    if (!message.includes(url) && !ready.some((target) => target.url && message.includes(target.url))) {
      return "Keep the share link in the message.";
    }
    return "";
  }

  function emailProblem(ready: typeof emailTargets) {
    if (ready.length === 0) return "Add an email address, or copy the link.";
    if (sheet && emailTargets.some((target) => !looksLikeEmail(target.email))) {
      return "Add an email for each person you’re emailing.";
    }
    if (ready.some((target) => !target.url)) {
      return "Each signer needs their own link. Close this and send the proposal again.";
    }
    if (!subject.trim()) return "Add a subject before sending.";
    if (!sender?.name?.trim()) return "This document needs a project manager before you can email it.";
    if (!looksLikeEmail(sender?.email?.trim() || "")) {
      return "Add an email on the project manager’s profile (Settings → People). Replies go there. Your login email is used automatically once it is saved on that seat.";
    }
    return "";
  }

  async function deliverText(ready: typeof textTargets): Promise<DeliveryReport> {
    const sentIds: string[] = [];
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
        propertyAddress,
      });
      const content =
        ready.length === 1
          ? message.replaceAll(url, theirUrl).trim()
          : message.trim() === composedMessage.trim()
            ? body
            : message.replaceAll(url, theirUrl).trim();
      if (!content.includes(theirUrl)) {
        toast.error("Keep the share link in the message.");
        return { sentIds, failed: true, mocked };
      }
      try {
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
          return { sentIds, failed: true, mocked };
        }
        mocked = Boolean(data.mocked);
        sentIds.push(target.id);
        await onTexted?.({
          to: data.to || target.phone,
          content,
          name: target.name,
          contactId: loggedContactId(target.id),
          handle: data.handle,
        });
      } catch {
        toast.error("Could not reach the texting service.");
        return { sentIds, failed: true, mocked };
      }
    }
    return { sentIds, failed: false, mocked };
  }

  async function handleText() {
    const ready = textTargets.filter((target) => looksLikePhone(target.phone));
    const problem = textProblem(ready);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPending("text");
    try {
      const report = await deliverText(ready);
      if (report.failed) return;
      if (report.mocked) {
        toast.message(
          "Photon is not connected for this company. The text is logged on the job. Add this office's Photon project under Settings → Photon.",
        );
      } else {
        toast.success(
          ready.length === 1
            ? `Texted ${ready[0].name}.`
            : `Texted ${ready.map((item) => item.name).join(" and ")}.`,
        );
      }
    } finally {
      setPending(null);
    }
  }

  function emailPayload(customer: string, theirUrl: string) {
    const senderName = sender?.name?.trim() || "";
    const replyTo = sender?.email?.trim() || "";
    const company = companyName?.trim() || "the office";
    const emailKind = shareEmailKind(kind);
    const copy = emailTemplateHasOverride(emailTemplates, emailKind)
      ? resolveSystemEmail(emailKind, emailTemplates, {
          name: firstName(customer),
          company,
          address: propertyAddress?.trim() || "",
          addressClause: shareAddressClause(kind, propertyAddress || "", documentNumber || ""),
          number: documentNumber?.trim() || "",
          nameLabel: documentName?.trim() ? ` (${documentName.trim()})` : "",
          document: documentName?.trim() || "a document",
          managerLine: senderName ? `${firstName(senderName)} put this together after walking your roof. ` : "",
        })
      : null;
    const payload = {
      kind,
      company,
      customer,
      ...(copy ? { headline: copy.headline, message: copy.message, buttonLabel: copy.button } : {}),
      number: documentNumber || "",
      name: documentName || "",
      url: theirUrl,
      logoUrl: companyLogoUrl || "",
      origin: typeof window !== "undefined" ? window.location.origin : "",
      street: jobStreet || "",
      city: jobCity || "",
      state: jobState || "",
      postalCode: jobPostalCode || "",
      validUntil: validUntil || null,
      companyWebsite: companyWebsite || "",
      companyPhone: companyPhone || "",
      companyStreet: companyStreet || "",
      companyCity: companyCity || "",
      companyState: companyState || "",
      companyPostalCode: companyPostalCode || "",
      owner: {
        name: senderName,
        title: sender?.title || "",
        email: replyTo,
        phone: sender?.phone || "",
        signature: sender?.signature || "",
        photoUrl: sender?.photoUrl || "",
      },
    };
    return {
      html: defaultShareEmailHtml(payload),
      text: defaultShareEmailText(payload),
      senderName,
      replyTo,
      company,
    };
  }

  async function deliverEmail(ready: typeof emailTargets): Promise<DeliveryReport> {
    const sentIds: string[] = [];
    let mocked = false;
    for (const target of ready) {
      const theirUrl = target.url || url;
      const built = emailPayload(target.name, theirUrl);
      try {
        const response = await fetch("/api/share/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: target.email,
            subject: subject.trim(),
            html: built.html,
            text: built.text,
            url: theirUrl,
            senderName: built.senderName,
            companyName: companyName || "the office",
            replyTo: built.replyTo,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; mocked?: boolean; error?: string; to?: string }
          | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || `Could not email ${target.name}.`);
          return { sentIds, failed: true, mocked };
        }
        mocked = Boolean(data.mocked);
        sentIds.push(target.id);
        await onEmailed?.({
          to: data.to || target.email,
          subject: subject.trim(),
          name: target.name,
          url: theirUrl,
          contactId: loggedContactId(target.id),
        });
      } catch {
        toast.error("Could not reach Resend.");
        return { sentIds, failed: true, mocked };
      }
    }
    return { sentIds, failed: false, mocked };
  }

  async function handleEmail() {
    const ready = emailTargets.filter((target) => looksLikeEmail(target.email));
    const problem = emailProblem(ready);
    if (problem) {
      toast.error(problem);
      return;
    }
    setPending("email");
    try {
      const report = await deliverEmail(ready);
      if (report.failed) return;
      if (report.mocked) {
        toast.message(
          "Resend is not connected on this host. Add RESEND_API_KEY on the host (and verify trockroofer.com in Resend) and redeploy.",
        );
      } else {
        toast.success(
          ready.length === 1
            ? `Emailed ${ready[0].name}.`
            : `Emailed ${ready.map((item) => item.name).join(" and ")}.`,
        );
      }
    } finally {
      setPending(null);
    }
  }

  function markDelivery(
    ready: Array<{ id: string; name: string; url: string }>,
    report: DeliveryReport,
    apply: (row: SentPerson, status: SentStatus) => void,
    rows: Map<string, SentPerson>,
    phoneFor: (id: string) => string,
    emailFor: (id: string) => string,
  ) {
    let markedFailure = false;
    for (const target of ready) {
      const current = rows.get(target.id) ?? {
        id: target.id,
        name: target.name,
        phone: phoneFor(target.id),
        email: emailFor(target.id),
        url: target.url || url,
        textStatus: "skipped" as SentStatus,
        emailStatus: "skipped" as SentStatus,
      };
      if (target.url) current.url = target.url;
      current.phone = phoneFor(target.id) || current.phone;
      current.email = emailFor(target.id) || current.email;
      if (report.sentIds.includes(target.id)) apply(current, "sent");
      else if (report.failed && !markedFailure) {
        apply(current, "failed");
        markedFailure = true;
      }
      rows.set(target.id, current);
    }
  }

  async function handleSend() {
    const texts = textTargets.filter((target) => looksLikePhone(target.phone));
    const emails = emailTargets.filter((target) => looksLikeEmail(target.email));
    if (textTargets.length === 0 && emailTargets.length === 0) {
      toast.error("Choose a text or an email.");
      return;
    }
    if (textTargets.length > 0) {
      const problem = textProblem(texts);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    if (emailTargets.length > 0) {
      const problem = emailProblem(emails);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setPending("send");
    const rows = new Map<string, SentPerson>();
    let textMocked = false;
    let emailMocked = false;
    try {
      if (texts.length > 0) {
        const report = await deliverText(texts);
        textMocked = report.mocked;
        markDelivery(
          texts,
          report,
          (row, status) => {
            row.textStatus = status;
          },
          rows,
          (id) => formatPhoneInput(texts.find((item) => item.id === id)?.phone || ""),
          () => "",
        );
      }
      if (emails.length > 0) {
        const report = await deliverEmail(emails);
        emailMocked = report.mocked;
        markDelivery(
          emails,
          report,
          (row, status) => {
            row.emailStatus = status;
          },
          rows,
          () => "",
          (id) => emails.find((item) => item.id === id)?.email || "",
        );
      }
      const sent = [...rows.values()].filter(
        (row) => row.textStatus !== "skipped" || row.emailStatus !== "skipped",
      );
      const anySent = sent.some((row) => row.textStatus === "sent" || row.emailStatus === "sent");
      if (!anySent) return;
      setSentPeople(sent);
      setSentNotes({ textMocked, emailMocked });
      setPhase("sent");
      setEditingMessage(false);
    } finally {
      setPending(null);
    }
  }

  async function submitSigner(event: FormEvent) {
    event.preventDefault();
    if (!onAddSigner) return;
    const name = draftName.trim();
    if (!name) {
      toast.error("Enter their name.");
      return;
    }
    if (!draftPhone.trim() && !draftEmail.trim()) {
      toast.error("Add a mobile number or an email.");
      return;
    }
    if (draftPhone.trim() && !looksLikePhone(draftPhone)) {
      toast.error("That mobile number doesn’t look right.");
      return;
    }
    if (draftEmail.trim() && !looksLikeEmail(draftEmail)) {
      toast.error("That email doesn’t look right.");
      return;
    }
    setAddingPending(true);
    try {
      const ok = await onAddSigner({ name, phone: draftPhone, email: draftEmail });
      if (ok === false) return;
      setAddingSigner(false);
      setDraftName("");
      setDraftPhone("");
      setDraftEmail("");
    } finally {
      setAddingPending(false);
    }
  }

  function resetMessage() {
    setMessage(composedMessage);
    setSubject(composedSubject);
    setMessageBaseline(composedMessage);
    setSubjectBaseline(composedSubject);
    setEditingMessage(false);
  }

  async function continueFromSign(image: string) {
    if (!contractorSign) return;
    setSigning(true);
    try {
      const ok = await contractorSign.onSign({ image });
      if (ok === false) return;
      setSignedLocally(true);
      setPhase("compose");
    } finally {
      setSigning(false);
    }
  }

  if (sheet) {
    const place = sheetAddress({
      street: jobStreet,
      city: jobCity,
      state: jobState,
      postalCode: jobPostalCode,
      propertyAddress,
      fallback: documentName?.trim() || (kind === "invoice" ? "Invoice" : "Proposal"),
    });
    const eyebrow = `${kind === "invoice" ? "SEND INVOICE" : "PROPOSAL"}${
      documentNumber?.trim() ? ` · ${documentNumber.trim()}` : ""
    }`;
    const peopleLabel = kind === "invoice" ? "Recipients" : "Homeowner signers";
    const peopleHint =
      kind === "invoice" ? "Each person gets a private link · no login" : "Each gets a private link · no login";
    const addLabel = kind === "invoice" ? "Add another recipient" : "Add another signer";
    const previewUrl = primary?.url || url;
    const sms = smsSegmentCount(message);
    const emailPreview = emailPayload(primary?.name || "there", previewUrl).text;
    const previewNote =
      messageMode === "text"
        ? textStatus && !textStatus.configured
          ? "Preview · Photon isn’t connected, so this is logged on the job"
          : "Preview · from your office number"
        : looksLikeEmail(sender?.email || "")
          ? `Preview · replies go to ${sender?.email?.trim()}`
          : "Preview · add the project manager’s email before this can send";
    const delivered = sentPeople.filter((person) => person.textStatus === "sent" || person.emailStatus === "sent");
    const sentTo = joinedFirstNames(delivered.map((person) => person.name));
    const contractorSigned = Boolean(contractorSign && (contractorSign.signed || signedLocally));
    const signedName = (contractorSign?.signedName || contractorSign?.signer?.name || "").trim();
    const signedTitle = (contractorSign?.signedTitle || contractorSign?.signer?.title || "").trim();
    const signedWhen = contractorSign?.signedAt || (signedLocally ? new Date().toISOString() : "");
    const sentHeadline = `${
      kind === "invoice" ? "Invoice" : contractorSigned ? "Signed proposal" : "Proposal"
    } sent to ${sentTo}`;
    const sentDetail =
      kind === "invoice"
        ? delivered.length > 1
          ? "Each of them can open it from their phone — no login needed."
          : "They can open it from their phone — no login needed."
        : contractorSigned
          ? delivered.length > 1
            ? "Each of them can review and countersign from their phone — no login needed."
            : "They can review and countersign from their phone — no login needed."
          : delivered.length > 1
            ? "Each of them can review and sign from their phone — no login needed."
            : "They can review and sign from their phone — no login needed.";
    const sending = pending === "send";

    function setChannel(id: string, field: "text" | "email", checked: boolean) {
      setChannels((current) => {
        const previous = current[id] ?? { text: false, email: false };
        return {
          ...current,
          [id]: { ...previous, [field]: checked },
        };
      });
      const currentValue = field === "text" ? (phones[id] ?? "") : (emails[id] ?? "");
      if (checked && !currentValue.trim()) setEditingChannel(`${id}:${field}`);
    }

    function updatePhone(id: string, value: string) {
      setPhones((current) => ({ ...current, [id]: value }));
      if (looksLikePhone(value)) {
        setChannels((current) => {
          const previous = current[id] ?? { text: false, email: false };
          return { ...current, [id]: { ...previous, text: true } };
        });
      }
    }

    function updateEmail(id: string, value: string) {
      setEmails((current) => ({ ...current, [id]: value }));
      if (looksLikeEmail(value)) {
        setChannels((current) => {
          const previous = current[id] ?? { text: false, email: false };
          return { ...current, [id]: { ...previous, email: true } };
        });
      }
    }

    return (
      <Dialog unsavedGuard={false} open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(90dvh,44rem)] min-w-0 flex-col gap-0 overflow-x-hidden overflow-y-auto p-0 shadow-[0_24px_70px_-28px_rgba(0,0,0,0.45)] sm:max-w-[440px] rounded-[22px]"
        >
          <DialogClose className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
          <div className="flex items-start gap-3 px-5 pt-5 pr-12">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{eyebrow}</p>
              <DialogTitle className="mt-1 font-sans text-[1.45rem] leading-tight font-semibold tracking-tight">
                {place.title}
              </DialogTitle>
              {place.subtitle ? <p className="mt-1 text-sm text-muted-foreground">{place.subtitle}</p> : null}
              <DialogDescription className="sr-only">
                {phase === "sign"
                  ? "Sign this proposal before it can be sent. The homeowner signs separately from their own link."
                  : kind === "invoice"
                    ? "Send this invoice by text or email. Each person gets a private link."
                    : "Send this proposal by text or email. Each signer gets a private link."}
              </DialogDescription>
            </div>
          </div>

          {contractorSign ? (
            <div className="px-5 pt-4">
              <FlowSteps
                stage={phase === "sent" ? "sent" : phase === "sign" ? "sign" : "compose"}
                sendLabel="Send to homeowner"
              />
              {phase === "compose" && contractorSigned && signedName ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                    Signed by {signedName}
                    {signedTitle ? ` · ${signedTitle}` : ""}
                    {signedWhen ? ` · ${formatDate(signedWhen)}` : ""}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-primary"
                    onClick={() => {
                      setSignSession((value) => value + 1);
                      setPhase("sign");
                    }}
                  >
                    Re-sign
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "sent" ? (
            <div className="px-5 pt-6 pb-5">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="size-7" strokeWidth={2.5} />
              </div>
              <h2 className="mt-4 text-center text-xl font-semibold tracking-tight">{sentHeadline}</h2>
              <p className="mt-1.5 text-center text-sm text-muted-foreground">{sentDetail}</p>
              {sentNotes.textMocked ? (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Photon isn’t connected, so the text is logged on the job.
                </p>
              ) : null}
              {sentNotes.emailMocked ? (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Resend isn’t connected on this host, so the email was not delivered.
                </p>
              ) : null}
              <div className="mt-5 min-w-0 overflow-hidden rounded-[12px] border">
                {contractorSigned && signedName ? (
                  <div className="flex items-center gap-3 border-b px-3 py-2.5">
                    <span className="w-14 shrink-0 text-sm text-muted-foreground">Signed</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {signedName}
                      {signedWhen ? ` · ${formatDate(signedWhen)}` : ""}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      Done
                    </span>
                  </div>
                ) : null}
                {sentPeople.map((person, index) => {
                  const theirUrl = person.url || url;
                  return (
                    <div key={person.id} className={cn(index > 0 && "border-t")}>
                      {sentPeople.length > 1 ? (
                        <p className="bg-muted/40 px-3 py-1.5 text-xs font-medium">{person.name}</p>
                      ) : null}
                      {person.textStatus !== "skipped" ? (
                        <div className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
                          <span className="w-14 shrink-0 text-sm text-muted-foreground">Text</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{person.phone || "—"}</span>
                          <StatusPill status={person.textStatus} />
                        </div>
                      ) : null}
                      {person.emailStatus !== "skipped" ? (
                        <div className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
                          <span className="w-14 shrink-0 text-sm text-muted-foreground">Email</span>
                          <span className="min-w-0 flex-1 truncate text-sm">{person.email || "—"}</span>
                          <StatusPill status={person.emailStatus} />
                        </div>
                      ) : null}
                      <div className="flex items-center gap-3 border-t px-3 py-2.5 first:border-t-0">
                        <span className="w-14 shrink-0 text-sm text-muted-foreground">Link</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                          {theirUrl ? displayShareUrl(theirUrl) : "Preparing link"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!theirUrl || pending !== null}
                          onClick={() => void handleCopy(theirUrl)}
                        >
                          Copy link
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPhase("compose")}>
                  Send again
                </Button>
                <Button
                  type="button"
                  className="bg-foreground text-background hover:bg-foreground/90"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : phase === "sign" && contractorSign ? (
            <SendSignStep
              key={signSession}
              signer={
                contractorSign.signer
                  ? {
                      name: contractorSign.signer.name,
                      title: contractorSign.signer.title,
                      company: companyName?.trim() || "",
                    }
                  : null
              }
              notice={signStepNotice({
                number: documentNumber || "",
                signer: contractorSign.signer,
                assignees: contractorSign.assignees,
                homeowners: people
                  .map((person) => firstName(person.name))
                  .filter((name) => name && name !== "there"),
              })}
              consentText={contractorSign.consentText}
              pending={signing}
              onCancel={() => {
                if (contractorSigned) setPhase("compose");
                else onOpenChange(false);
              }}
              onSubmit={continueFromSign}
            />
          ) : (
            <>
              <div className="px-5 pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold">{peopleLabel}</h2>
                  <p className="text-right text-[11px] text-muted-foreground">{peopleHint}</p>
                </div>
                <ul className="mt-3 space-y-4">
                  {roster.map((person) => {
                    const theirUrl = person.url || (kind === "invoice" || !perPersonLinks ? url : "");
                    const phoneValue = phones[person.id] ?? person.phone;
                    const emailValue = emails[person.id] ?? person.email;
                    const choice = channels[person.id] ?? { text: false, email: false };
                    return (
                      <li key={person.id}>
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold text-background">
                            {initials(person.name) || "•"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{person.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {person.role?.trim() || (kind === "invoice" ? "Recipient" : "Homeowner")}
                            </p>
                          </div>
                          {theirUrl ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground"
                              disabled={pending !== null}
                              onClick={() => void handleCopy(theirUrl)}
                            >
                              <Link2 />
                              Copy link
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Preparing link</span>
                          )}
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          <ChannelField
                            label="Text"
                            kind="tel"
                            placeholder="Add mobile"
                            value={phoneValue ? formatPhoneInput(phoneValue) : ""}
                            checked={choice.text}
                            editing={editingChannel === `${person.id}:text`}
                            onCheckedChange={(checked) => setChannel(person.id, "text", checked)}
                            onEdit={() => setEditingChannel(`${person.id}:text`)}
                            onBlur={() =>
                              setEditingChannel((current) => (current === `${person.id}:text` ? null : current))
                            }
                            onValueChange={(value) => updatePhone(person.id, value)}
                          />
                          <ChannelField
                            label="Email"
                            kind="email"
                            placeholder="Add email"
                            value={emailValue}
                            checked={choice.email}
                            editing={editingChannel === `${person.id}:email`}
                            onCheckedChange={(checked) => setChannel(person.id, "email", checked)}
                            onEdit={() => setEditingChannel(`${person.id}:email`)}
                            onBlur={() =>
                              setEditingChannel((current) => (current === `${person.id}:email` ? null : current))
                            }
                            onValueChange={(value) => updateEmail(person.id, value)}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {addingSigner ? (
                  <form className="mt-3 grid gap-2 rounded-[12px] border p-3" onSubmit={(event) => void submitSigner(event)}>
                    <Input
                      autoFocus
                      value={draftName}
                      placeholder="Name"
                      aria-label="Signer name"
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <PhoneInput
                        value={draftPhone}
                        placeholder="Mobile"
                        aria-label="Signer mobile"
                        onValueChange={setDraftPhone}
                      />
                      <Input
                        type="email"
                        value={draftEmail}
                        placeholder="Email"
                        aria-label="Signer email"
                        onChange={(event) => setDraftEmail(event.target.value)}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAddingSigner(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" disabled={addingPending}>
                        {addingPending ? "Adding…" : "Add"}
                      </Button>
                    </div>
                  </form>
                ) : onAddSigner ? (
                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary"
                    onClick={() => setAddingSigner(true)}
                  >
                    <Plus className="size-3.5" />
                    {addLabel}
                  </button>
                ) : null}
              </div>

              <div className="px-5 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Message</h2>
                  <div className="inline-flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Message preview">
                    {(
                      [
                        ["text", "Text"],
                        ["email", "Email"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={messageMode === key}
                        className={cn(
                          "rounded-md px-3 py-1 text-xs font-medium",
                          messageMode === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                        )}
                        onClick={() => {
                          setMessageMode(key);
                          setEditingMessage(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 rounded-[14px] bg-muted/70 px-3.5 py-3">
                  {editingMessage && messageMode === "text" ? (
                    <Textarea
                      aria-label="Text message"
                      rows={5}
                      value={message}
                      className="min-h-28 resize-none rounded-md bg-card px-2.5 py-2 shadow-none ring-1 ring-border focus-visible:ring-2"
                      onChange={(event) => setMessage(event.target.value)}
                    />
                  ) : messageMode === "text" ? (
                    <PreviewMessage text={message} url={previewUrl} />
                  ) : editingMessage ? (
                    <Input
                      aria-label="Email subject"
                      value={subject}
                      className="bg-card shadow-none ring-1 ring-border focus-visible:ring-2"
                      onChange={(event) => setSubject(event.target.value)}
                    />
                  ) : (
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium break-words">{subject}</p>
                      <PreviewMessage text={emailPreview} url={previewUrl} className="mt-2 line-clamp-6 text-muted-foreground" />
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-muted-foreground">{previewNote}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 px-0.5">
                  {messageMode === "text" ? (
                    <p className="text-xs text-muted-foreground">
                      {sms.chars} characters · {sms.segments} SMS
                    </p>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="text-xs font-medium text-primary"
                    onClick={() => setEditingMessage((current) => !current)}
                  >
                    {editingMessage ? "Done" : "Edit message"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 px-3 pt-3 pb-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={!url || pending !== null}
                  onClick={() => void handleCopy(primary?.url || url)}
                >
                  <Link2 />
                  Copy link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label="Reset message"
                  title="Reset message"
                  disabled={pending !== null}
                  onClick={resetMessage}
                >
                  <RotateCcw />
                </Button>
                {onDownloadPdf ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    aria-label="Download PDF"
                    title="Download PDF"
                    disabled={pending !== null}
                    onClick={() => {
                      setPending("pdf");
                      void Promise.resolve(onDownloadPdf())
                        .catch(() => toast.error("Could not build the PDF."))
                        .finally(() => setPending(null));
                    }}
                  >
                    <Download />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="ml-auto h-10 rounded-[10px] px-3.5"
                  disabled={!url || pending !== null || (textTargets.length === 0 && emailTargets.length === 0)}
                  onClick={() => void handleSend()}
                >
                  <Send />
                  {sendActionLabel(textTargets.length, emailTargets.length, sending)}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog unsavedGuard={unsavedGuard} open={open} onOpenChange={onOpenChange}>
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
                        <PhoneInput
                          value={phones[person.id] ?? formatPhoneInput(person.phone)}
                          placeholder="Mobile for text"
                          onValueChange={(value) =>
                            setPhones((current) => ({ ...current, [person.id]: value }))
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
              <PhoneInput
                value={customPhone}
                placeholder={people.length ? "Or another mobile" : "Homeowner mobile"}
                onValueChange={setCustomPhone}
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
                ? "Texts go out through this office's Photon project. "
                : "Photon is not set up for this company. Send text logs the message on the job until you add the project under Settings → Photon. "}
              {(() => {
                const fromLabel =
                  sender?.name?.trim() && companyName?.trim()
                    ? formatResendFromDisplay(sender.name, companyName)
                    : "";
                const reply = sender?.email?.trim() || "";
                if (emailStatus?.configured) {
                  if (fromLabel && looksLikeEmail(reply)) {
                    return `Email shows as ${fromLabel} from ${RESEND_FROM_ADDRESS}; replies go to ${reply}.`;
                  }
                  if (fromLabel) {
                    return `Email shows as ${fromLabel} from ${RESEND_FROM_ADDRESS}. Add the project manager’s email on their profile for Reply-To.`;
                  }
                  return `Email goes out through Resend from ${RESEND_FROM_ADDRESS}.`;
                }
                return `Email needs RESEND_API_KEY on the host (from ${RESEND_FROM_ADDRESS}${fromLabel ? `, as ${fromLabel}` : ""}) — until then Send email previews without delivering.`;
              })()}
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

function signStepNotice(input: {
  number: string;
  signer: { name: string } | null;
  assignees: string[];
  homeowners: string[];
}) {
  const label = input.number.trim() || "This proposal";
  if (!input.signer) {
    if (!input.assignees.length) {
      return `Assign someone to this job before sending ${label}. It stays a draft until they sign.`;
    }
    const who = input.assignees.join(", ");
    const verb = input.assignees.length === 1 ? "has" : "have";
    return `${label} stays a draft and can’t be shared until it’s signed. ${who} ${verb} to sign it before it can be sent.`;
  }
  const names = input.homeowners.filter(Boolean);
  const separate =
    names.length === 0
      ? "the homeowner signs separately from their own link"
      : names.length === 1
        ? `${names[0]} signs separately from a private link`
        : `${joinedFirstNames(names)} sign separately from their own links`;
  return `${label} stays a draft and can’t be shared until it’s signed. Your signature goes on the proposal as the contractor; ${separate}.`;
}

function FlowSteps({ stage, sendLabel }: { stage: "sign" | "compose" | "sent"; sendLabel: string }) {
  const signDone = stage !== "sign";
  const sendDone = stage === "sent";
  const sendCurrent = stage === "compose";
  return (
    <div className="flex items-center gap-2">
      <StepMark done={signDone} current={stage === "sign"} />
      <span className="text-xs font-medium text-foreground">Sign estimate</span>
      <span className="relative mx-1 h-0.5 min-w-6 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "absolute inset-y-0 left-0 bg-emerald-500",
            sendDone ? "w-full" : signDone ? "w-1/2" : "w-0",
          )}
        />
      </span>
      <StepMark done={sendDone} current={sendCurrent} />
      <span className={cn("text-xs font-medium", stage === "sign" ? "text-muted-foreground" : "text-foreground")}>
        {sendLabel}
      </span>
    </div>
  );
}

function StepMark({ done, current }: { done: boolean; current: boolean }) {
  if (done) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (current) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary">
        <span className="size-1.5 rounded-full bg-white" />
      </span>
    );
  }
  return <span className="size-4 shrink-0 rounded-full bg-muted" />;
}

function StatusPill({ status }: { status: SentStatus }) {
  if (status === "skipped") return null;
  if (status === "sent") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Sent</span>
    );
  }
  return (
    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
      Not sent
    </span>
  );
}

function PreviewMessage({ text, url, className }: { text: string; url: string; className?: string }) {
  const link = url.trim();
  const index = link ? text.indexOf(link) : -1;
  if (index < 0) {
    return <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", className)}>{text}</p>;
  }
  return (
    <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", className)}>
      {text.slice(0, index)}
      <span className="break-all text-primary">{displayShareUrl(link)}</span>
      {text.slice(index + link.length)}
    </p>
  );
}

function ChannelField({
  label,
  kind,
  value,
  placeholder,
  checked,
  editing,
  onCheckedChange,
  onEdit,
  onBlur,
  onValueChange,
}: {
  label: string;
  kind: "tel" | "email";
  value: string;
  placeholder: string;
  checked: boolean;
  editing: boolean;
  onCheckedChange: (checked: boolean) => void;
  onEdit: () => void;
  onBlur: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 rounded-[10px] border px-2.5 py-2",
        checked ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        aria-label={label}
        onCheckedChange={(next) => onCheckedChange(Boolean(next))}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-none font-semibold">{label}</p>
        {editing ? (
          kind === "tel" ? (
            <PhoneInput
              autoFocus
              value={value}
              aria-label={`${label} number`}
              placeholder={placeholder}
              className="mt-1 h-6 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
              onValueChange={onValueChange}
              onBlur={onBlur}
            />
          ) : (
            <Input
              autoFocus
              type="email"
              value={value}
              aria-label={`${label} address`}
              placeholder={placeholder}
              className="mt-1 h-6 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
              onChange={(event) => onValueChange(event.target.value)}
              onBlur={onBlur}
            />
          )
        ) : (
          <button
            type="button"
            className={cn(
              "mt-1 block w-full truncate text-left text-[13px] leading-none",
              value ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={onEdit}
          >
            {value || placeholder}
          </button>
        )}
      </div>
    </div>
  );
}
