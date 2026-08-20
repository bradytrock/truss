"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
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
import { invoiceBalance } from "@/lib/money";
import {
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type EventKind,
  type PhotoCategory,
} from "@/lib/types";

export function CreateEstimateDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultOpportunityId,
  defaultJobId,
  defaultContactId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string | null;
  defaultOpportunityId?: string;
  defaultJobId?: string;
  defaultContactId?: string | null;
}) {
  const router = useRouter();
  const { contacts, opportunities, jobs, addEstimate } = useCrm();
  const jobDefault = defaultJobId ? jobs.find((job) => job.id === defaultJobId) : undefined;
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState(
    defaultContactId || jobDefault?.primaryContactId || contacts[0]?.id || ""
  );
  const [opportunityId, setOpportunityId] = useState(defaultOpportunityId ?? "");
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  const contact = contacts.find((item) => item.id === contactId);
  const relatedOpps = opportunities.filter(
    (opportunity) =>
      opportunity.primaryContactId === contactId ||
      (contact?.clientId && opportunity.clientId === contact.clientId)
  );
  const relatedJobs = jobs.filter(
    (job) =>
      job.primaryContactId === contactId || (contact?.clientId && job.clientId === contact.clientId)
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contactId) {
      toast.error("A name and homeowner are required.");
      return;
    }
    try {
      const estimate = await addEstimate({
        name: name.trim(),
        clientId: contact?.clientId ?? defaultClientId ?? null,
        opportunityId: opportunityId || null,
        jobId: jobId || null,
        contactId,
        validUntil: validUntil || null,
        notes,
      });
      toast.success(`${estimate.number} drafted.`);
      onOpenChange(false);
      setName("");
      router.push(`/estimates/${estimate.id}`);
    } catch {
      // Store already toasted.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New estimate</DialogTitle>
          <DialogDescription>
            Price from the catalog, send the proposal, then convert it to an invoice when the homeowner signs.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Name" htmlFor="est-name">
            <Input
              id="est-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ellison kitchen — Wash Park"
            />
          </Field>
          <Field label="Homeowner / contact">
            <Select
              value={contactId}
              onValueChange={(value) => {
                setContactId(String(value ?? ""));
                setOpportunityId("");
                setJobId("");
              }}
              items={contacts.map((item) => ({ value: item.id, label: item.name }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lead (optional)">
              <Select
                value={opportunityId || "none"}
                onValueChange={(value) => setOpportunityId(value === "none" ? "" : String(value ?? ""))}
                items={[
                  { value: "none", label: "None" },
                  ...relatedOpps.map((opportunity) => ({
                    value: opportunity.id,
                    label: opportunity.name,
                  })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {relatedOpps.map((opportunity) => (
                    <SelectItem key={opportunity.id} value={opportunity.id}>
                      {opportunity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Job (optional)">
              <Select
                value={jobId || "none"}
                onValueChange={(value) => setJobId(value === "none" ? "" : String(value ?? ""))}
                items={[
                  { value: "none", label: "None" },
                  ...relatedJobs.map((job) => ({ value: job.id, label: job.name })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {relatedJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Valid until" htmlFor="est-valid">
            <Input
              id="est-valid"
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="est-notes">
            <Textarea
              id="est-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Allowances, exclusions, insurance notes..."
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultJobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string | null;
  defaultJobId?: string;
}) {
  const router = useRouter();
  const { jobs, addInvoice, customerName } = useCrm();
  const [name, setName] = useState("");
  const [jobId, setJobId] = useState(defaultJobId ?? jobs[0]?.id ?? "");
  const dueDefault = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return localYmd(date);
  })();
  const [dueAt, setDueAt] = useState(dueDefault);
  const [notes, setNotes] = useState("");

  const job = jobs.find((item) => item.id === jobId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !jobId) {
      toast.error("A name and job are required.");
      return;
    }
    try {
      const invoice = await addInvoice({
        name: name.trim(),
        clientId: job?.clientId ?? defaultClientId ?? null,
        jobId: jobId || null,
        dueAt: dueAt || null,
        notes,
      });
      toast.success(`${invoice.number} drafted.`);
      onOpenChange(false);
      setName("");
      router.push(`/invoices/${invoice.id}`);
    } catch {
      // Store already toasted.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Bill a draw, deposit, or retainage against a job. Homeowners do not need a company on file.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Name" htmlFor="inv-name">
            <Input
              id="inv-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Alvarez roof — progress"
            />
          </Field>
          <Field label="Job">
            <Select
              value={jobId}
              onValueChange={(value) => setJobId(String(value ?? ""))}
              items={jobs.map((item) => ({
                value: item.id,
                label: `${item.name} — ${customerName(item)}`,
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} — {customerName(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due" htmlFor="inv-due">
            <Input
              id="inv-due"
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </Field>
          <Field label="Notes" htmlFor="inv-notes">
            <Textarea
              id="inv-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Create draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateEventDialog({
  open,
  onOpenChange,
  defaultDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDay?: string;
}) {
  const { jobs, opportunities, teamMembers, user, addScheduleEvent } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const day = defaultDay || localYmd(new Date());
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [date, setDate] = useState(day);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [assignee, setAssignee] = useState(user.name || people[0] || "");
  const [jobId, setJobId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Give the event a title.");
      return;
    }
    const job = jobs.find((item) => item.id === jobId);
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    try {
      await addScheduleEvent({
        title: title.trim(),
        kind,
        startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
        endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
        location,
        assignee,
        opportunityId: opportunityId || null,
        jobId: jobId || null,
        clientId: job?.clientId ?? opportunity?.clientId ?? null,
        notes,
      });
      toast.success("Event added to the week.");
      onOpenChange(false);
      setTitle("");
      setNotes("");
    } catch {
      // Store already toasted.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule an event</DialogTitle>
          <DialogDescription>
            Site walks, inspections, production, and owner meetings for the week.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Title" htmlFor="evt-title">
            <Input
              id="evt-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Pre-bid walk"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as EventKind)}
                items={EVENT_KINDS.map((eventKind) => ({
                  value: eventKind,
                  label: EVENT_KIND_LABELS[eventKind],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_KINDS.map((eventKind) => (
                    <SelectItem key={eventKind} value={eventKind}>
                      {EVENT_KIND_LABELS[eventKind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Select
                value={assignee}
                onValueChange={(value) => setAssignee(String(value ?? ""))}
                items={people.map((person) => ({ value: person, label: person }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((person) => (
                    <SelectItem key={person} value={person}>
                      {person}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date" htmlFor="evt-date">
              <Input
                id="evt-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Start" htmlFor="evt-start">
              <Input
                id="evt-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <Field label="End" htmlFor="evt-end">
              <Input
                id="evt-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Location" htmlFor="evt-loc">
            <Input
              id="evt-loc"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Jobsite, trailer, or Teams"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job">
              <Select
                value={jobId || "none"}
                onValueChange={(value) => setJobId(value === "none" ? "" : String(value ?? ""))}
                items={[
                  { value: "none", label: "None" },
                  ...jobs.map((job) => ({ value: job.id, label: job.name })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Pursuit">
              <Select
                value={opportunityId || "none"}
                onValueChange={(value) =>
                  setOpportunityId(value === "none" ? "" : String(value ?? ""))
                }
                items={[
                  { value: "none", label: "None" },
                  ...opportunities.map((opportunity) => ({
                    value: opportunity.id,
                    label: opportunity.name,
                  })),
                ]}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {opportunities.map((opportunity) => (
                    <SelectItem key={opportunity.id} value={opportunity.id}>
                      {opportunity.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="evt-notes">
            <Textarea
              id="evt-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
}) {
  const { invoices, invoiceLines, payments, recordPayment } = useCrm();
  const invoice = invoices.find((item) => item.id === invoiceId);
  const balance = invoice ? invoiceBalance(invoice.id, invoiceLines, payments) : 0;
  const [amount, setAmount] = useState(String(balance || ""));
  const [method, setMethod] = useState("check");
  const [paidAt, setPaidAt] = useState(localYmd(new Date()));
  const [reference, setReference] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!invoice || !value || value <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }
    await recordPayment({
      invoiceId: invoice.id,
      amount: value,
      method,
      paidAt,
      reference,
    });
    toast.success("Payment recorded.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice
              ? `${invoice.number} · ${balance.toLocaleString("en-US", { style: "currency", currency: "USD" })} remaining`
              : "Invoice"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Amount" htmlFor="pay-amt">
            <Input
              id="pay-amt"
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Method">
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
            </Field>
            <Field label="Date" htmlFor="pay-date">
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Reference" htmlFor="pay-ref">
            <Input
              id="pay-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Check number or draw note"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddPhotoDialog({
  open,
  onOpenChange,
  jobId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
}) {
  const { addJobPhoto } = useCrm();
  const [caption, setCaption] = useState("");
  const [category, setCategory] = useState<PhotoCategory>("progress");
  const [takenAt, setTakenAt] = useState(localYmd(new Date()));
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    await addJobPhoto({
      jobId,
      caption,
      category,
      takenAt,
      imageUrl,
      file,
    });
    setPending(false);
    if (file || imageUrl.trim()) {
      toast.success("Photo added to the job.");
      onOpenChange(false);
      setCaption("");
      setImageUrl("");
      setFile(undefined);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add job photo</DialogTitle>
          <DialogDescription>
            Upload from the field or paste a URL. Files go to the company job-photos bucket.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Caption" htmlFor="ph-cap">
            <Input
              id="ph-cap"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="What should the office see?"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as PhotoCategory)}
                items={PHOTO_CATEGORIES.map((item) => ({
                  value: item,
                  label: PHOTO_CATEGORY_LABELS[item],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {PHOTO_CATEGORY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Taken" htmlFor="ph-date">
              <Input
                id="ph-date"
                type="date"
                value={takenAt}
                onChange={(event) => setTakenAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Upload">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </Field>
          <Field label="Or image URL" htmlFor="ph-url">
            <Input
              id="ph-url"
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add photo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
