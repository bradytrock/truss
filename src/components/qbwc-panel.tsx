"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrm } from "@/lib/crm-store";
import { formatDate } from "@/lib/format";
import { DEFAULT_QB_ITEM, workFromBook, type QbwcStep } from "@/lib/qbwc/work";
import { qbwcFile } from "@/lib/qbwc/soap";
import { requestForStep, STEP_LABELS } from "@/lib/qbwc/steps";
import { missingQbwcMessage } from "@/lib/supabase/schema-errors";
import type { Invoice } from "@/lib/types";

type ConnectorInfo = {
  configured: boolean;
  sql?: string;
  username?: string;
  ownerId?: string;
  fileId?: string;
  itemName?: string;
  lastConnectedAt?: string | null;
  lastError?: string;
  appUrl?: string;
};

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 20);
}

export function QbwcPanel() {
  const crm = useCrm();
  const [info, setInfo] = useState<ConnectorInfo | null>(null);
  const [itemName, setItemName] = useState(DEFAULT_QB_ITEM);
  const [appUrl, setAppUrl] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Invoice | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/qbwc/setup")
      .then((response) => response.json())
      .then((data: ConnectorInfo & { error?: string }) => {
        if (cancelled) return;
        setInfo(data);
        if (data.itemName) setItemName(data.itemName);
        if (data.appUrl) setAppUrl(data.appUrl);
      })
      .catch(() => {
        if (!cancelled) setInfo({ configured: false, sql: missingQbwcMessage() });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextPassword: string) {
    setPending(true);
    try {
      const response = await fetch("/api/qbwc/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword, itemName, appUrl }),
      });
      const data = (await response.json()) as {
        error?: string;
        username?: string;
        ownerId?: string;
        fileId?: string;
        itemName?: string;
        appUrl?: string;
        qwc?: string;
      };
      if (!response.ok) {
        toast.error(data.error || "Could not save the Web Connector.");
        return null;
      }
      setInfo((current) => ({
        configured: true,
        username: data.username,
        ownerId: data.ownerId,
        fileId: data.fileId,
        itemName: data.itemName,
        appUrl: data.appUrl,
        lastConnectedAt: current?.lastConnectedAt ?? null,
        lastError: current?.lastError ?? "",
      }));
      if (data.appUrl) setAppUrl(data.appUrl);
      return data;
    } finally {
      setPending(false);
    }
  }

  async function handleCreate() {
    const next = randomPassword();
    const saved = await save(next);
    if (!saved) return;
    setPassword(next);
    toast.success("Password generated. Copy it into the Web Connector — Truss does not store it in plain text.");
  }

  async function handleSaveItem() {
    const saved = await save("");
    if (saved) toast.success("Saved the QuickBooks item name.");
  }

  function downloadQwc() {
    if (!info?.username || !info.ownerId || !info.fileId) {
      toast.error("Create a connector password first.");
      return;
    }
    const xml = qbwcFile({
      appUrl: appUrl || `${window.location.origin}/api/qbwc`,
      userName: info.username,
      ownerId: info.ownerId,
      fileId: info.fileId,
      supportUrl: window.location.origin,
    });
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "truss-quickbooks.qwc";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>QuickBooks Web Connector</CardTitle>
        <CardDescription>
          Approved invoices with line items post into QuickBooks Desktop on the matching Customer:Job.
          That is the same parsed estimate data — quantities and rates — so nobody retypes the invoice.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4">
        {info?.sql ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{info.sql}</p>
        ) : null}
        {info?.lastError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Last connector error: {info.lastError}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="qb-item">Income item in QuickBooks</Label>
            <Input
              id="qb-item"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              placeholder={DEFAULT_QB_ITEM}
            />
            <p className="text-xs text-muted-foreground">
              Every invoice line uses this item. Descriptions, quantities, and rates come from the
              invoice. Create it in QB or let the connector add it.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qb-url">Connector URL</Label>
            <Input
              id="qb-url"
              value={appUrl}
              onChange={(event) => setAppUrl(event.target.value)}
              placeholder="https://your-host/api/qbwc"
            />
            <p className="text-xs text-muted-foreground">
              QuickBooks Desktop and the Web Connector run on a Windows PC. Use an https URL the office
              machine can reach. Localhost only works if QB is on this same computer.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void handleCreate()} disabled={pending}>
            {info?.configured ? "Rotate password" : "Create connector password"}
          </Button>
          <Button type="button" variant="outline" onClick={() => void handleSaveItem()} disabled={pending}>
            Save item name
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!info?.configured || pending}
            onClick={downloadQwc}
          >
            <Download />
            Download .qwc
          </Button>
        </div>
        {info?.username ? (
          <dl className="grid gap-1 text-sm">
            <div className="flex flex-wrap gap-x-3">
              <dt className="text-muted-foreground">Username</dt>
              <dd className="font-mono">{info.username}</dd>
            </div>
            {password ? (
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-muted-foreground">Password (shown once)</dt>
                <dd className="font-mono">{password}</dd>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The password is hashed. Rotate it if the office PC lost it.
              </p>
            )}
            {info.lastConnectedAt ? (
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-muted-foreground">Last connected</dt>
                <dd>{formatDate(info.lastConnectedAt)}</dd>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Not connected yet. On the office PC: install QuickBooks Web Connector, File → Add an
                application, pick the .qwc, paste the password, keep the company file open, then Update
                Selected.
              </p>
            )}
          </dl>
        ) : null}
        <InvoicePreviewList itemName={itemName} onPreview={setPreview} />
      </CardContent>
      <QbPreviewDialog invoice={preview} itemName={itemName} onClose={() => setPreview(null)} />
    </Card>
  );
}

function InvoicePreviewList({
  itemName,
  onPreview,
}: {
  itemName: string;
  onPreview: (invoice: Invoice) => void;
}) {
  const crm = useCrm();
  const rows = useMemo(() => {
    return crm.invoices
      .filter((invoice) => invoice.status !== "void")
      .map((invoice) => {
        const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
        const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
        const { blocked, work } = workFromBook({
          invoice,
          job,
          lines,
          contacts: crm.contacts,
          clients: crm.clients,
          opportunities: crm.opportunities,
          itemName,
        });
        return { invoice, job, blocked, work };
      });
  }, [crm, itemName]);

  const ready = rows.filter((row) => !row.blocked && row.invoice.qbStatus !== "entered");
  if (ready.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invoices are ready. Send an invoice that has line items and a job — that is what the
        connector will post.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{ready.length} invoice{ready.length === 1 ? "" : "s"} ready for QuickBooks</p>
      <ul className="grid gap-2">
        {ready.slice(0, 8).map(({ invoice, work }) => (
          <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{invoice.number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {work.customerName}:{work.jobCode} · {work.lines.length} line
                {work.lines.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => onPreview(invoice)}>
              Preview what QB will get
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QbPreviewDialog({
  invoice,
  itemName,
  onClose,
}: {
  invoice: Invoice | null;
  itemName: string;
  onClose: () => void;
}) {
  const crm = useCrm();
  const preview = useMemo(() => {
    if (!invoice) return null;
    const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
    const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
    return workFromBook({
      invoice,
      job,
      lines,
      contacts: crm.contacts,
      clients: crm.clients,
      opportunities: crm.opportunities,
      itemName,
    });
  }, [crm, invoice, itemName]);

  const steps = useMemo(() => {
    if (!preview || preview.blocked) return [];
    return (Object.keys(STEP_LABELS) as QbwcStep[]).map((step) => ({
      step,
      label: STEP_LABELS[step],
      xml: requestForStep(step, preview.work),
    }));
  }, [preview]);

  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>QuickBooks payload · {invoice?.number}</DialogTitle>
          <DialogDescription>
            The Web Connector will find or create the customer, then the job under that customer, then
            add the invoice with these parsed lines. Nothing is typed by hand.
          </DialogDescription>
        </DialogHeader>
        {preview?.blocked ? (
          <p className="text-sm">{preview.blocked}</p>
        ) : preview ? (
          <div className="grid gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">Customer:Job</span>{" "}
              <span className="font-mono">
                {preview.work.customerName}:{preview.work.jobCode}
              </span>
            </p>
            <ul className="grid gap-1">
              {preview.work.lines.map((line, index) => (
                <li key={`${line.description}-${index}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {line.quantity} {line.unit} · {line.description}
                  </span>
                  <span className="shrink-0 tabular-nums">{line.unitCost.toFixed(2)}</span>
                </li>
              ))}
            </ul>
            {steps.map((item) => (
              <details key={item.step} className="rounded-md border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{item.label}</summary>
                <pre className="overflow-x-auto border-t bg-muted/40 p-3 text-[11px] leading-snug">
                  {item.xml}
                </pre>
              </details>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
