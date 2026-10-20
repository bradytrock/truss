"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Camera, LoaderCircle, Sparkles, TrendingUp, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/currency-input";
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
import { compressReceipt } from "@/lib/job-financials";
import { isPdfFile } from "@/lib/job-files";
import { isReceiptUpload } from "@/lib/receipt-extract";
import { costCenterLabel } from "@/lib/job-record";
import { invoiceBalance } from "@/lib/money";
import { matchVendorName, vendorChoices } from "@/lib/qb-vendors";
import { VendorPicker } from "@/components/vendor-picker";
import {
  DateField,
  InfoNote,
  QuickFooter,
  QuickHeader,
  QuickHint,
  QuickLabel,
  QuickSection,
  RecordSearch,
  Segmented,
  SyncBadge,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
} from "@/components/quick-action-form";
import { formatDate, formatMoney } from "@/lib/format";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_ACCOUNTS,
  type ExpenseAccount,
  type ExpenseMethod,
} from "@/lib/types";
import { expenseRequiresJob } from "@/lib/qbwc/work";

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
  fileName,
  onFile,
  title,
  detail,
  label,
}: {
  previewUrl: string;
  fileName?: string;
  onFile: (file: File, dataUrl: string) => void;
  title: string;
  detail: string;
  label: string;
}) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const showingPdf = fileName
    ? isPdfFile({ name: fileName, type: "" })
    : previewUrl.startsWith("data:application/pdf");

  async function handle(file: File | undefined) {
    if (!file) return;
    if (!isReceiptUpload(file)) {
      toast.error("Use a photo or PDF.");
      return;
    }
    const receipt =
      isPdfFile(file) && file.type !== "application/pdf"
        ? new File([file], file.name, { type: "application/pdf", lastModified: file.lastModified })
        : file;
    try {
      const next = await compressReceipt(receipt);
      onFile(next.file, next.dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that file.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Label htmlFor={inputId} className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label} <span className="text-primary">*</span>
      </Label>
      <div
        className={`flex min-h-64 flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-white px-6 py-8 text-center ${
          dragOver ? "border-primary bg-primary/5" : "border-neutral-300"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handle(event.dataTransfer.files?.[0]);
        }}
      >
        {previewUrl ? (
          showingPdf ? (
            <div className="grid gap-1">
              <p className="text-sm font-medium">PDF attached</p>
              {fileName ? (
                <p className="max-w-full truncate text-xs text-muted-foreground">{fileName}</p>
              ) : null}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="max-h-56 w-full object-contain" />
          )
        ) : (
          <>
            <span className="grid size-14 place-items-center rounded-full bg-neutral-100 text-neutral-500">
              <Camera className="size-6" />
            </span>
            <p className="mt-4 text-sm font-semibold">{title}</p>
            <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">{detail}</p>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          className="mt-4 h-9 rounded-lg bg-white px-4"
          onClick={() => document.getElementById(inputId)?.click()}
        >
          Choose file
        </Button>
        <Input
          id={inputId}
          type="file"
          accept="image/*,application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => void handle(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}

function ReadWithAi({
  title,
  detail,
  ready,
  reading,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  ready: boolean | null;
  reading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={disabled || reading}
        onClick={onClick}
        className="flex items-start gap-2.5 rounded-xl border bg-white px-3 py-3 text-left disabled:opacity-60"
      >
        {reading ? (
          <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
        ) : (
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        )}
        <span>
          <span className="block text-sm font-semibold">{reading ? "Reading…" : title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
        </span>
      </button>
      {ready === false ? (
        <p className="text-xs text-muted-foreground">
          This host has no AI key, so the fields stay blank. The photo still saves on the record.
        </p>
      ) : null}
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
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredAt, setIncurredAt] = useState(localYmd(new Date()));
  const [account, setAccount] = useState<ExpenseAccount>("materials");
  const [method, setMethod] = useState<ExpenseMethod>("credit_card");
  const [posting, setPosting] = useState<"job" | "overhead">("job");
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
    setInvoiceNumber("");
    setAmount("");
    setIncurredAt(localYmd(new Date()));
    setAccount("materials");
    setMethod("credit_card");
    setPosting("job");
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
        if (typeof result.invoiceNumber === "string" && result.invoiceNumber.trim()) {
          setInvoiceNumber(result.invoiceNumber.trim());
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
      toast.error("Add a photo or PDF of the receipt.");
      return;
    }
    const assignedJobId = posting === "overhead" ? "" : defaultJobId || jobId;
    if (posting === "job" && !assignedJobId) {
      toast.error("Pick the job. QuickBooks costs this to Customer:Job.");
      return;
    }
    if (posting === "overhead" && expenseRequiresJob(account)) {
      toast.error("Office and insurance can stay on the company. Switch the account, or post this as a job cost.");
      return;
    }
    setPending(true);
    try {
      const saved = await crm.addExpense({
        jobId: assignedJobId || null,
        vendor,
        invoiceNumber,
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

  const paidWith: { value: ExpenseMethod; label: string }[] = [
    { value: "credit_card", label: "Card" },
    { value: "check", label: "Check" },
    { value: "cash", label: "Cash" },
  ];
  if (method === "debit") paidWith.splice(1, 0, { value: "debit", label: "Debit" });
  if (method === "ach") paidWith.push({ value: "ach", label: "ACH" });
  const jobs = jobChoices(crm);
  const logger = crm.effectiveStaff?.name.trim() || crm.user.name.trim() || "you";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("wide")}>
        <QuickHeader
          tone="rose"
          icon={<ReceiptIcon />}
          title="Log expense"
          description="Posts to QuickBooks as a card charge or check, with the receipt attached."
          aside={<SyncBadge />}
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} grid flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]`}>
            <div className="flex flex-col gap-3 border-b bg-[#f7f6f3] p-4 lg:border-r lg:border-b-0">
              <ReceiptFields
                label="Receipt"
                title="Snap or drop the receipt"
                detail="Photo or PDF. Required even if you type the numbers. It stays on the record."
                previewUrl={preview}
                fileName={file?.name}
                onFile={(nextFile, dataUrl) => {
                  setFile(nextFile);
                  setPreview(dataUrl);
                  setExtractedByAi(false);
                  void applyExpenseExtract(dataUrl);
                }}
              />
              <ReadWithAi
                title="Read receipt with AI"
                detail="Fills vendor, amount, date and invoice # once a receipt is attached."
                ready={aiReady}
                reading={reading}
                disabled={!preview}
                onClick={() => void applyExpenseExtract(preview)}
              />
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <QuickSection>Vendor & amount</QuickSection>
              <div>
                <QuickLabel required>Vendor</QuickLabel>
                <VendorPicker
                  appearance="search"
                  placeholder="Search QuickBooks vendors"
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
                <QuickHint>
                  Pick the vendor as it appears in QuickBooks. Type a new name only if they’re not there yet.
                </QuickHint>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <QuickLabel htmlFor="exp-amt" required>Amount</QuickLabel>
                  <CurrencyInput id="exp-amt" className={quickFieldClass} value={amount} onValueChange={setAmount} required />
                </div>
                <div>
                  <QuickLabel htmlFor="exp-date">Date</QuickLabel>
                  <DateField
                    id="exp-date"
                    label="Date"
                    value={incurredAt}
                    display={formatDate}
                    onChange={setIncurredAt}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <QuickLabel htmlFor="exp-invoice" optional>Invoice #</QuickLabel>
                  <Input
                    id="exp-invoice"
                    className={quickFieldClass}
                    value={invoiceNumber}
                    onChange={(event) => setInvoiceNumber(event.target.value)}
                    placeholder="From the receipt"
                    autoComplete="off"
                  />
                  <QuickHint>First 11 characters sync.</QuickHint>
                </div>
                <div>
                  <QuickLabel>Paid with</QuickLabel>
                  <Segmented
                    label="Paid with"
                    value={method}
                    onChange={setMethod}
                    options={paidWith}
                  />
                </div>
              </div>
              <QuickSection>Where it posts</QuickSection>
              <div>
                <Segmented
                  label="Where it posts"
                  value={posting}
                  onChange={setPosting}
                  options={[
                    { value: "job", label: "Job cost" },
                    { value: "overhead", label: "Company overhead" },
                  ]}
                />
                <QuickHint>
                  Job costs post to Customer:Job. Switch to overhead for office, insurance and other company costs.
                </QuickHint>
              </div>
              <div className={posting === "job" ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
                <div>
                  <QuickLabel>Account</QuickLabel>
                  <Select
                    value={account}
                    onValueChange={(value) => setAccount(value as ExpenseAccount)}
                    items={EXPENSE_ACCOUNTS.map((item) => ({
                      value: item,
                      label: EXPENSE_ACCOUNT_LABELS[item],
                    }))}
                  >
                    <SelectTrigger className={`${quickFieldClass} w-full`}>
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
                {posting === "job" ? (
                  <div>
                    <QuickLabel required>Job</QuickLabel>
                    <RecordSearch
                      label="Job"
                      placeholder="Search jobs"
                      value={jobId}
                      onChange={setJobId}
                      disabled={Boolean(defaultJobId)}
                      options={jobs}
                      emptyText="No matching jobs."
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <QuickLabel htmlFor="exp-memo" optional>Memo</QuickLabel>
                <Textarea
                  id="exp-memo"
                  rows={3}
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="What it was for, the way you’d write it in QuickBooks"
                  className="min-h-20 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>
          <QuickFooter
            onCancel={() => onOpenChange(false)}
            pending={pending}
            submitLabel="Save expense"
            note={
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5" />
                Logged by {logger}
              </span>
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 3.5h10a1 1 0 0 1 1 1V20l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V4.5a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
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
  const [applyTo, setApplyTo] = useState<"invoice" | "deposit">("invoice");
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("check");
  const [paidAt, setPaidAt] = useState(localYmd(new Date()));
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  const invoices = crm.invoices.filter((invoice) => {
    if (invoice.archivedAt) return false;
    if (invoice.status === "void" || invoice.status === "draft") return false;
    if (jobId && invoice.jobId !== jobId) return false;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    setFile(undefined);
    setPreview("");
    setJobId(defaultJobId ?? "");
    setApplyTo("invoice");
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
      toast.error("Add a photo or PDF of the check, remit, or deposit slip.");
      return;
    }
    if (!jobId) {
      toast.error("Pick the job.");
      return;
    }
    if (applyTo === "invoice" && !invoiceId) {
      toast.error("Choose an open invoice, or switch to deposit only.");
      return;
    }
    setPending(true);
    try {
      const saved = await crm.recordPayment({
        invoiceId: applyTo === "deposit" ? null : invoiceId || null,
        jobId: jobId || null,
        amount: value,
        method,
        paidAt,
        reference,
        file,
        receiptUrl: file ? undefined : preview,
      });
      if (saved) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  const methods = [
    { value: "check", label: "Check" },
    { value: "ACH", label: "ACH" },
    { value: "card", label: "Card" },
    { value: "cash", label: "Cash" },
  ];
  if (method && !methods.some((item) => item.value === method)) {
    methods.push({ value: method, label: method === "wire" ? "Wire" : method });
  }
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId) ?? null;
  const balance =
    applyTo === "invoice" && selectedInvoice
      ? invoiceBalance(selectedInvoice.id, crm.invoiceLines, crm.payments)
      : null;
  const paymentValue = Number(amount) || 0;
  const leftAfter = balance == null ? null : balance - paymentValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("wide")}>
        <QuickHeader
          tone="green"
          icon={<DollarIcon />}
          title="Log payment"
          description="Receive a payment and apply it to an invoice. The check image stays on the record either way."
          aside={<SyncBadge />}
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} grid flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]`}>
            <div className="flex flex-col gap-3 border-b bg-[#f7f6f3] p-4 lg:border-r lg:border-b-0">
              <ReceiptFields
                label="Check or remittance"
                title="Snap or drop the check"
                detail="Front of the check, or the remittance slip. Photo or PDF."
                previewUrl={preview}
                fileName={file?.name}
                onFile={(nextFile, dataUrl) => {
                  setFile(nextFile);
                  setPreview(dataUrl);
                  void applyPaymentExtract(dataUrl);
                }}
              />
              <ReadWithAi
                title="Read check with AI"
                detail="Fills amount, date and check # once an image is attached."
                ready={aiReady}
                reading={reading}
                disabled={!preview}
                onClick={() => void applyPaymentExtract(preview)}
              />
            </div>
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <QuickSection>Job & invoice</QuickSection>
              <div>
                <QuickLabel required>Job</QuickLabel>
                <RecordSearch
                  label="Job"
                  placeholder="Search jobs and pipeline leads"
                  value={jobId}
                  onChange={(next) => {
                    setJobId(next);
                    if (invoiceId) {
                      const invoice = crm.invoices.find((item) => item.id === invoiceId);
                      if (invoice && invoice.jobId !== next) setInvoiceId("");
                    }
                  }}
                  disabled={Boolean(defaultJobId)}
                  options={jobChoices(crm)}
                  emptyText="No matching jobs."
                />
                <QuickHint>Leads in the pipeline count as jobs. Bids still in play show their stage.</QuickHint>
              </div>
              <div>
                <QuickLabel>Apply to</QuickLabel>
                <Segmented
                  label="Apply to"
                  value={applyTo}
                  onChange={(next) => {
                    setApplyTo(next);
                    if (next === "deposit") setInvoiceId("");
                  }}
                  options={[
                    { value: "invoice", label: "An open invoice" },
                    { value: "deposit", label: "Deposit only" },
                  ]}
                />
              </div>
              <div>
                <QuickLabel>Invoice</QuickLabel>
                <Select
                  value={invoiceId || null}
                  onValueChange={(value) => setInvoiceId(value ? String(value) : "")}
                  disabled={applyTo === "deposit"}
                  items={invoices.map((invoice) => ({
                    value: invoice.id,
                    label: `${invoice.number} · ${invoice.name}`,
                  }))}
                >
                  <SelectTrigger className={`${quickFieldClass} w-full`}>
                    <SelectValue placeholder="Choose an open invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((invoice) => (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        {invoice.number} · {invoice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <QuickSection>Payment</QuickSection>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <QuickLabel htmlFor="pay2-amt" required>Amount</QuickLabel>
                  <CurrencyInput id="pay2-amt" className={quickFieldClass} value={amount} onValueChange={setAmount} required />
                </div>
                <div>
                  <QuickLabel htmlFor="pay2-date">Date received</QuickLabel>
                  <DateField
                    id="pay2-date"
                    label="Date received"
                    value={paidAt}
                    display={formatDate}
                    onChange={setPaidAt}
                  />
                </div>
              </div>
              <div>
                <QuickLabel>Method</QuickLabel>
                <Segmented label="Method" value={method} onChange={setMethod} options={methods} />
              </div>
              <div>
                <QuickLabel htmlFor="pay2-ref" optional>Check #</QuickLabel>
                <Input
                  id="pay2-ref"
                  className={quickFieldClass}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Printed top right of the check"
                />
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-[#fafaf8]">
                <div className="px-3 py-3">
                  <p className="text-xs text-muted-foreground">Invoice balance</p>
                  <p className="mt-1 text-sm">{balance == null ? "—" : formatMoney(balance)}</p>
                </div>
                <div className="border-l px-3 py-3">
                  <p className="text-xs text-muted-foreground">This payment</p>
                  <p className="mt-1 text-sm font-semibold">{formatMoney(paymentValue)}</p>
                </div>
                <div className="border-l px-3 py-3">
                  <p className="text-xs text-muted-foreground">Left after</p>
                  <p className="mt-1 text-sm">{leftAfter == null ? "—" : formatMoney(leftAfter)}</p>
                </div>
              </div>
            </div>
          </div>
          <QuickFooter
            onCancel={() => onOpenChange(false)}
            pending={pending}
            submitLabel="Save payment"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3v18M16.5 7.5c0-1.7-1.8-3-4.5-3S7.5 5.8 7.5 7.5 9.3 10.5 12 10.5s4.5 1.2 4.5 3-1.8 3-4.5 3-4.5-1.3-4.5-3" />
    </svg>
  );
}

export function LogForecastedExpenseDialog({
  open,
  onOpenChange,
  defaultJobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultJobId?: string | null;
}) {
  const crm = useCrm();
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [expectedAt, setExpectedAt] = useState(localYmd(new Date()));
  const [account, setAccount] = useState<ExpenseAccount>("materials");
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const jobs = jobChoices(crm);

  useEffect(() => {
    if (!open) return;
    setVendor("");
    setAmount("");
    setExpectedAt(localYmd(new Date()));
    setAccount("materials");
    setJobId(defaultJobId ?? "");
    setMemo("");
  }, [open, defaultJobId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const assignedJobId = defaultJobId || jobId;
    if (!assignedJobId) {
      toast.error("Pick the job. Forecasted expenses stay on that job’s financials.");
      return;
    }
    setPending(true);
    try {
      const saved = await crm.addForecastedExpense({
        jobId: assignedJobId,
        vendor,
        account,
        amount: Number(amount),
        expectedAt,
        memo,
      });
      if (saved) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("xl")}>
        <QuickHeader
          tone="blue"
          icon={<TrendingUp className="size-5" />}
          title="Forecast an expense"
          description="Plan a cost that hasn’t happened yet. It rolls into the job’s projected column."
        />
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-4 px-5 py-4`}>
            <InfoNote>No receipt needed. Forecasts don’t post to QuickBooks.</InfoNote>
            <div>
              <QuickLabel required>Job</QuickLabel>
              <RecordSearch
                label="Job"
                placeholder="Search jobs"
                value={jobId}
                onChange={setJobId}
                disabled={Boolean(defaultJobId)}
                options={jobs}
                emptyText="No matching jobs."
              />
              <QuickHint>Shows under Forecasted expenses on this job.</QuickHint>
            </div>
            <div>
              <QuickLabel optional>Vendor</QuickLabel>
              <VendorPicker
                appearance="search"
                placeholder="Search QuickBooks vendors"
                value={vendor}
                onChange={setVendor}
                names={vendors.fromQb.map((item) => item.name)}
                extraNames={vendors.extras}
                emptyHint={
                  vendors.fromQb.length === 0
                    ? "No vendors pulled yet. Type the payee you expect to use."
                    : "No matching vendor. Type the name you expect to pay."
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <QuickLabel htmlFor="fest-amt" required>Estimated amount</QuickLabel>
                <CurrencyInput id="fest-amt" className={quickFieldClass} value={amount} onValueChange={setAmount} required />
              </div>
              <div>
                <QuickLabel htmlFor="fest-date">Expected date</QuickLabel>
                <DateField
                  id="fest-date"
                  label="Expected date"
                  value={expectedAt}
                  display={formatDate}
                  onChange={setExpectedAt}
                />
              </div>
            </div>
            <div>
              <QuickLabel>Account</QuickLabel>
              <Select
                value={account}
                onValueChange={(value) => setAccount(value as ExpenseAccount)}
                items={EXPENSE_ACCOUNTS.map((item) => ({
                  value: item,
                  label: EXPENSE_ACCOUNT_LABELS[item],
                }))}
              >
                <SelectTrigger className={`${quickFieldClass} w-full`}>
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
            <div>
              <QuickLabel htmlFor="fest-memo" optional>Memo</QuickLabel>
              <Textarea
                id="fest-memo"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="What you expect to spend, and why"
                rows={3}
                className="min-h-24 rounded-lg bg-white"
              />
            </div>
          </div>
          <QuickFooter
            onCancel={() => onOpenChange(false)}
            pending={pending}
            submitLabel="Save forecast"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
