"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, MessageSquare } from "lucide-react";
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
import { defaultShareText, type ShareDocumentKind } from "@/lib/share-text";

type SendblueStatus = { configured: boolean; fromNumber: string };

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
}) {
  const [pending, setPending] = useState<"copy" | "pdf" | "text" | null>(null);
  const [status, setStatus] = useState<SendblueStatus | null>(null);
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [customPhone, setCustomPhone] = useState("");
  const [message, setMessage] = useState("");

  const people = useMemo(
    () => recipients.filter((item) => item.name.trim()),
    [recipients]
  );
  const primary = people[0];
  const recipientKey = people.map((item) => `${item.id}:${item.name}:${item.phone}`).join("|");

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
    [companyName, documentName, documentNumber, kind, primary?.name, url]
  );

  useEffect(() => {
    if (!open) return;
    const nextPhones: Record<string, string> = {};
    const nextSelected: Record<string, boolean> = {};
    for (const person of people) {
      nextPhones[person.id] = person.phone;
      nextSelected[person.id] = Boolean(person.phone.trim());
    }
    if (people.length && !Object.values(nextSelected).some(Boolean)) {
      nextSelected[people[0].id] = true;
    }
    setPhones(nextPhones);
    setSelected(nextSelected);
    setCustomPhone("");
    setMessage(composedMessage);
    // Snapshot when the dialog opens or the document/recipients change — not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipientKey, composedMessage]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/share/text")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SendblueStatus | null) => {
        if (!cancelled && data) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, fromNumber: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const targets = useMemo(() => {
    const list = people
      .filter((person) => selected[person.id])
      .map((person) => ({
        id: person.id,
        name: person.name,
        phone: (phones[person.id] ?? person.phone).trim(),
      }));
    const extra = customPhone.trim();
    if (extra && !list.some((item) => item.phone === extra)) {
      list.push({ id: "custom", name: primary?.name || "Homeowner", phone: extra });
    }
    return list;
  }, [customPhone, people, phones, primary?.name, selected]);

  async function handleCopy() {
    setPending("copy");
    try {
      const ok = await copyText(url);
      if (ok) toast.success("Link copied.");
      else toast.error("Could not copy the link. Select it and copy it yourself.");
    } finally {
      setPending(null);
    }
  }

  async function handleText() {
    const ready = targets.filter((target) => looksLikePhone(target.phone));
    if (ready.length === 0) {
      toast.error("Add a mobile number to text, or copy the link.");
      return;
    }
    if (!message.includes(url)) {
      toast.error("Keep the share link in the message.");
      return;
    }
    setPending("text");
    try {
      let mocked = false;
      for (const target of ready) {
        const body = defaultShareText({
          kind,
          company: companyName || "the office",
          customer: target.name,
          number: documentNumber || "",
          name: documentName || "",
          url,
        });
        const content =
          ready.length === 1
            ? message.trim()
            : message.trim() === composedMessage.trim()
              ? body
              : message.trim();
        const response = await fetch("/api/share/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: target.phone, content, url }),
        });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; mocked?: boolean; error?: string }
          | null;
        if (!response.ok || !data?.ok) {
          toast.error(data?.error || `Could not text ${target.name}.`);
          return;
        }
        mocked = Boolean(data.mocked);
      }
      if (mocked) {
        toast.message(
          "Sendblue is not connected to this website. Supabase Secrets are not read here — add SENDBLUE_API_KEY_ID, SENDBLUE_API_SECRET_KEY, and SENDBLUE_FROM_NUMBER on the host (Vercel → Environment Variables) and redeploy, or deploy the send-text Edge Function if those keys live in Supabase."
        );
      } else {
        toast.success(
          ready.length === 1
            ? `Texted ${ready[0].name}.`
            : `Texted ${ready.map((item) => item.name).join(" and ")}.`
        );
      }
    } catch {
      toast.error("Could not reach the texting service.");
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
          <div className="grid gap-2">
            <Label htmlFor="share-link">Client link</Label>
            <div className="flex gap-2">
              <Input
                id="share-link"
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
              />
              <Button type="button" variant="outline" disabled={!url || pending !== null} onClick={() => void handleCopy()}>
                <Copy />
                Copy
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Text to the homeowner</Label>
            {people.length ? (
              <ul className="grid gap-2">
                {people.map((person) => (
                  <li key={person.id} className="flex items-start gap-2 rounded-md border p-2">
                    <Checkbox
                      className="mt-2"
                      checked={Boolean(selected[person.id])}
                      onCheckedChange={(value) =>
                        setSelected((current) => ({ ...current, [person.id]: Boolean(value) }))
                      }
                      aria-label={`Text ${person.name}`}
                    />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="text-sm font-medium">{person.name}</p>
                      <Input
                        type="tel"
                        value={phones[person.id] ?? person.phone}
                        placeholder="(303) 555-0100"
                        onChange={(event) =>
                          setPhones((current) => ({ ...current, [person.id]: event.target.value }))
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            <Input
              type="tel"
              value={customPhone}
              placeholder={people.length ? "Or another mobile" : "Homeowner mobile"}
              onChange={(event) => setCustomPhone(event.target.value)}
            />
            <Textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {status?.configured
                ? `Texts go out over Sendblue${status.fromNumber ? ` (${status.fromNumber})` : ""}. Copy the link if you would rather send it yourself.`
                : "Copy the link anytime. This website does not read Supabase Secrets. Put the three SENDBLUE_ variables on the host (Vercel) or deploy supabase/functions/send-text — until then, Send previews the message without delivering it."}
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
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
          <Button type="button" variant="outline" disabled={!url || pending !== null} onClick={() => void handleCopy()}>
            <Copy />
            Copy link
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
