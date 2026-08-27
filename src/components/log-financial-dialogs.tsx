"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Camera, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { localYmd } from "@/lib/format";
import { compressReceipt, isReceiptPhoto } from "@/lib/job-financials";
import { costCenterLabel } from "@/lib/job-record";
import { invoiceBalance } from "@/lib/money";
import { matchVendorName, vendorChoices } from "@/lib/qb-vendors";
import { VendorPicker } from "@/components/vendor-picker";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_ACCOUNTS,
  EXPENSE_METHOD_LABELS,
  EXPENSE_METHODS,
  type ExpenseAccount,
  type ExpenseMethod,
} from "@/lib/types";

function jobChoices(crm: ReturnType<typeof useCrm>) {
  return [...crm.jobs]
    .filter((job) => !job.deletedAt)
    .sort((a, b) =>
      costCenterLabel(a, crm.opportunities).localeCompare(costCenterLabel(b, crm.opportunities)),
    )
    .map((job) => ({
      value: job.id,
      label: costCenterLabel(job, crm.opportunities),
    }));
}

async function extractReceipt(imageDataUrl: string, kind: "expense" | "payment") {
  const response = await fetch("/api/receipts/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl, kind }),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return body ?? { error: "Could not read the receipt." };
}

function extractError(result: Record<string, unknown>) {
  if (typeof result.error === "string" && result.error) return result.error;
  if (typeof result.message === "string" && result.message) return result.message;
  return "Fill the fields from the photo.";
}

function ReceiptFields({
  previewUrl,
  onFile,
}: {
  previewUrl: string;
  onFile: (file: File, dataUrl: string) => void;
}) {
  async function handle(file: File | undefined) {
    if (!file) return;
    if (!isReceiptPhoto(file) && file.type !== "application/pdf") {
      toast.error("Use a photo of the receipt.");
      return;
    }
    try {
      const next = await compressReceipt(file);
      onFile(next.file, next.dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that photo.");
    }
  }

  return (
    <div className="grid gap-2">
      <Label>Receipt photo</Label>
      <p className="text-xs text-muted-foreground">
        Required. Camera or library. The image stays on the record.
      </p>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="Receipt" className="max-h-48 w-full border object-contain bg-muted" />
      ) : (
        <div className="flex h-32 items-center justify-center border border-dashed text-sm text-muted-foreground">
          No photo yet
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => void handle(event.target.files?.[0])}
        />
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={(event) => void handle(event.target.files?.[0])}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">First field opens the camera on a phone. Second is the library.</p>
    </div>
  );
}

export function LogExpenseDialog({
  open,
  onOpenChange,
  defaultJobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultJobId?: string | null;
}) {
  const crm = useCrm();
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(localYmd(new Date()));
  const [account, setAccount] = useState<ExpenseAccount>("materials");
  const [method, setMethod] = useState<ExpenseMethod>("credit_card");
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [memo, setMemo] = useState("");
  const [extractedByAi, setExtractedByAi] = useState(false);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const vendorNames = [...vendors.fromQb.map((item) => item.name), ...vendors.extras];

  useEffect(() => {
    if (!open) return;
    setFile(undefined);
    setPreview("");
    setVendor("");
    setAmount("");
    setIncurredAt(localYmd(new Date()));
    setAccount("materials");
    setMethod("credit_card");
    setJobId(defaultJobId ?? "");
    setMemo("");
    setExtractedByAi(false);
    void fetch("/api/receipts/extract", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { openai?: boolean; anthropic?: boolean }) => {
        setAiReady(Boolean(body.openai || body.anthropic));
      })
      .catch(() => setAiReady(null));
  }, [open, defaultJobId]);

  async function applyExpenseExtract(dataUrl: string) {
    setReading(true);
    try {
      const result = await extractReceipt(dataUrl, "expense");
      if (result.ok) {
        if (typeof result.vendor === "string") {
          setVendor(matchVendorName(result.vendor, vendorNames) || result.vendor);
        }
        if (typeof result.amount === "number" && result.amount) setAmount(String(result.amount));
        if (typeof result.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.date)) {
          setIncurredAt(result.date);
        }
        if (typeof result.memo === "string") setMemo(result.memo);
        if (typeof result.account === "string") setAccount(result.account as ExpenseAccount);
        if (typeof result.method === "string") setMethod(result.method as ExpenseMethod);
        setExtractedByAi(true);
        toast.success("Read the receipt. Check the fields before you save.");
      } else {
        toast.message(extractError(result));
      }
    } catch {
      toast.error("Could not read the receipt.");
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!file && !preview) {
      toast.error("Photograph the receipt.");
      return;
    }
    setPending(true);
    try {
      const saved = await crm.addExpense({
        jobId: jobId || null,
        vendor,
        account,
        amount: value,
        incurredAt,
        method,
        memo,
        file,
        receiptUrl: file ? undefined : preview,
        extractedByAi,
      });
      if (saved) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log expense</DialogTitle>
          <DialogDescription>
            Same idea as a QuickBooks check or credit-card expense: vendor, account, job, and the
            receipt. The photo is required even if you type the numbers.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <ReceiptFields
            previewUrl={preview}
            onFile={(nextFile, dataUrl) => {
              setFile(nextFile);
              setPreview(dataUrl);
              setExtractedByAi(false);
              if (!isReceiptPhoto(nextFile)) {
                toast.message("AI reads a photo of the receipt, not a PDF. You can still type the fields and save.");
                return;
              }
              void applyExpenseExtract(dataUrl);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!preview || reading || Boolean(file && !isReceiptPhoto(file))}
            onClick={() => void applyExpenseExtract(preview)}
          >
            {reading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {reading ? "Reading…" : "Read receipt with AI"}
          </Button>
          {aiReady === false ? (
            <p className="text-xs text-muted-foreground">
              This host has no OPENAI_API_KEY, so AI cannot fill the fields. The photo still saves on the
              expense.
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Vendor</Label>
            <p className="text-xs text-muted-foreground">
              Pick the payee as it appears in QuickBooks so the connector does not create a second
              vendor. Type a new name only when it is not in the company file yet.
            </p>
            <VendorPicker
              value={vendor}
              onChange={setVendor}
              names={vendors.fromQb.map((item) => item.name)}
              extraNames={vendors.extras}
              emptyHint={
                vendors.fromQb.length === 0
                  ? "No vendors pulled yet. Run the Web Connector (or Pull vendors in Settings), or type the payee."
                  : "No matching vendor. Type the name QuickBooks should use."
              }
            />
            <input type="text" value={vendor} onChange={() => undefined} required className="sr-only" tabIndex={-1} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="exp-amt">Amount</Label>
              <Input
                id="exp-amt"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="exp-date">Date</Label>
              <Input
                id="exp-date"
                type="date"
                value={incurredAt}
                onChange={(event) => setIncurredAt(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Account</Label>
              <Select
                value={account}
                onValueChange={(value) => setAccount(value as ExpenseAccount)}
                items={EXPENSE_ACCOUNTS.map((item) => ({
                  value: item,
                  label: EXPENSE_ACCOUNT_LABELS[item],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_ACCOUNTS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {EXPENSE_ACCOUNT_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Paid with</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as ExpenseMethod)}
                items={EXPENSE_METHODS.map((item) => ({
                  value: item,
                  label: EXPENSE_METHOD_LABELS[item],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_METHODS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {EXPENSE_METHOD_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Job</Label>
            <p className="text-xs text-muted-foreground">
              Pipeline leads are jobs. Use Overhead only for office costs.
            </p>
            <Select
              value={jobId || "none"}
              onValueChange={(value) => setJobId(value === "none" ? "" : String(value))}
              items={[
                { value: "none", label: "Overhead — not a job" },
                ...jobChoices(crm),
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Overhead — not a job</SelectItem>
                {jobChoices(crm).map((job) => (
                  <SelectItem key={job.value} value={job.value}>
                    {job.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="exp-memo">Memo</Label>
            <Textarea
              id="exp-memo"
              rows={3}
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="What this is for, in QuickBooks language."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LogPaymentDialog({
  open,
  onOpenChange,
  defaultJobId,
  defaultInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultJobId?: string | null;
  defaultInvoiceId?: string | null;
}) {
  const crm = useCrm();
  const [file, setFile] = useState<File | undefined>();
  const [preview, setPreview] = useState("");
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("check");
  const [paidAt, setPaidAt] = useState(localYmd(new Date()));
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  const invoices = crm.invoices.filter((invoice) => {
    if (invoice.status === "void" || invoice.status === "draft") return false;
    if (jobId && invoice.jobId !== jobId) return false;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    setFile(undefined);
    setPreview("");
    setJobId(defaultJobId ?? "");
    setInvoiceId(defaultInvoiceId ?? "");
    setAmount("");
    setMethod("check");
    setPaidAt(localYmd(new Date()));
    setReference("");
    void fetch("/api/receipts/extract", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { openai?: boolean; anthropic?: boolean }) => {
        setAiReady(Boolean(body.openai || body.anthropic));
      })
      .catch(() => setAiReady(null));
  }, [open, defaultJobId, defaultInvoiceId]);

  useEffect(() => {
    const invoice = crm.invoices.find((item) => item.id === invoiceId);
    if (!invoice) return;
    const balance = invoiceBalance(invoice.id, crm.invoiceLines, crm.payments);
    setAmount(String(balance || ""));
    if (invoice.jobId) setJobId(invoice.jobId);
  }, [invoiceId, crm.invoices, crm.invoiceLines, crm.payments]);

  async function applyPaymentExtract(dataUrl: string) {
    setReading(true);
    try {
      const result = await extractReceipt(dataUrl, "payment");
      if (result.ok) {
        if (typeof result.amount === "number" && result.amount) setAmount(String(result.amount));
        if (typeof result.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.date)) {
          setPaidAt(result.date);
        }
        if (typeof result.method === "string" && result.method) setMethod(result.method);
        if (typeof result.reference === "string") setReference(result.reference);
        toast.success("Read the slip. Check the fields before you save.");
      } else {
        toast.message(extractError(result));
      }
    } catch {
      toast.error("Could not read the photo.");
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }
    if (!file && !preview) {
      toast.error("Photograph the check, remit, or deposit slip.");
      return;
    }
    setPending(true);
    try {
      await crm.recordPayment({
        invoiceId: invoiceId || null,
        jobId: jobId || null,
        amount: value,
        method,
        paidAt,
        reference,
        file,
        receiptUrl: file ? undefined : preview,
      });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log payment</DialogTitle>
          <DialogDescription>
            Receive payment like QuickBooks: apply it to an invoice when you can, keep the check
            image either way.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          <ReceiptFields
            previewUrl={preview}
            onFile={(nextFile, dataUrl) => {
              setFile(nextFile);
              setPreview(dataUrl);
              if (!isReceiptPhoto(nextFile)) {
                toast.message("AI reads a photo of the check, not a PDF. You can still type the fields and save.");
                return;
              }
              void applyPaymentExtract(dataUrl);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!preview || reading || Boolean(file && !isReceiptPhoto(file))}
            onClick={() => void applyPaymentExtract(preview)}
          >
            {reading ? <LoaderCircle className="animate-spin" /> : <Camera />}
            {reading ? "Reading…" : "Read check / remit with AI"}
          </Button>
          {aiReady === false ? (
            <p className="text-xs text-muted-foreground">
              This host has no OPENAI_API_KEY, so AI cannot fill the fields. The photo still saves on the
              payment.
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label>Job</Label>
            <p className="text-xs text-muted-foreground">
              Pipeline leads are jobs. Pick the stage-labeled row when the check is for a bid still in play.
            </p>
            <Select
              value={jobId || "none"}
              onValueChange={(value) => setJobId(value === "none" ? "" : String(value))}
              items={[
                { value: "none", label: "Select a job" },
                ...jobChoices(crm),
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a job" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a job</SelectItem>
                {jobChoices(crm).map((job) => (
                  <SelectItem key={job.value} value={job.value}>
                    {job.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Invoice</Label>
            <Select
              value={invoiceId || "none"}
              onValueChange={(value) => setInvoiceId(value === "none" ? "" : String(value))}
              items={[
                { value: "none", label: "Unapplied — deposit only" },
                ...invoices.map((invoice) => ({
                  value: invoice.id,
                  label: `${invoice.number} · ${invoice.name}`,
                })),
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Apply to invoice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unapplied — deposit only</SelectItem>
                {invoices.map((invoice) => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.number} · {invoice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pay2-amt">Amount</Label>
              <Input
                id="pay2-amt"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay2-date">Date</Label>
              <Input
                id="pay2-date"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Method</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(String(value ?? "check"))}
                items={[
                  { value: "check", label: "Check" },
                  { value: "ACH", label: "ACH" },
                  { value: "wire", label: "Wire" },
                  { value: "card", label: "Card" },
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="ACH">ACH</SelectItem>
                  <SelectItem value="wire">Wire</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pay2-ref">Reference</Label>
              <Input
                id="pay2-ref"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Check number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
