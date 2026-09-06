"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { LogPaymentDialog } from "@/components/log-financial-dialogs";
import {
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type EventKind,
  type PhotoCategory,
  type ScheduleEvent,
} from "@/lib/types";

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultJobId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultClientId?: string | null;
  defaultJobId?: string;
  onCreated?: (invoiceId: string) => void;
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

  const fallbackJobId = jobs[0]?.id ?? "";

  useEffect(() => {
    if (!open) return;
    setName("");
    setJobId(defaultJobId ?? fallbackJobId);
    const date = new Date();
    date.setDate(date.getDate() + 30);
    setDueAt(localYmd(date));
    setNotes("");
  }, [defaultJobId, fallbackJobId, open]);

  const job = jobs.find((item) => item.id === jobId);
  const lockedToJob = Boolean(defaultJobId);

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
      if (onCreated) onCreated(invoice.id);
      else router.push(`/invoices/${invoice.id}`);
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
              disabled={lockedToJob}
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
              placeholder="Prints after the total on the invoice and PDF."
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

function timeFromIso(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CreateEventDialog({
  open,
  onOpenChange,
  defaultDay,
  defaultStart,
  defaultEnd,
  defaultTitle,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDay?: string;
  defaultStart?: string;
  defaultEnd?: string;
  defaultTitle?: string;
  event?: ScheduleEvent | null;
}) {
  const {
    jobs,
    opportunities,
    teamMembers,
    user,
    addScheduleEvent,
    updateScheduleEvent,
    deleteScheduleEvent,
  } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const defaultAssignee = user.name || people[0] || "";
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<EventKind>("meeting");
  const [date, setDate] = useState(localYmd(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [assignee, setAssignee] = useState(defaultAssignee);
  const [jobId, setJobId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [notes, setNotes] = useState("");
  const editing = Boolean(event);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setKind(event.kind);
      setDate(localYmd(new Date(event.startsAt)));
      setStartTime(timeFromIso(event.startsAt));
      setEndTime(timeFromIso(event.endsAt));
      setLocation(event.location);
      setAssignee(event.assignee || defaultAssignee);
      setJobId(event.jobId ?? "");
      setOpportunityId(event.opportunityId ?? "");
      setNotes(event.notes);
      return;
    }
    setTitle(defaultTitle ?? "");
    setKind("meeting");
    setDate(defaultDay || localYmd(new Date()));
    setStartTime(defaultStart || "09:00");
    setEndTime(defaultEnd || "10:00");
    setLocation("");
    setAssignee(defaultAssignee);
    setJobId("");
    setOpportunityId("");
    setNotes("");
  }, [
    open,
    event,
    defaultDay,
    defaultStart,
    defaultEnd,
    defaultTitle,
    defaultAssignee,
  ]);

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!title.trim()) {
      toast.error("Give the event a title.");
      return;
    }
    const job = jobs.find((item) => item.id === jobId);
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    const payload = {
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
    };
    try {
      if (event) {
        await updateScheduleEvent(event.id, payload);
        toast.success("Event updated.");
      } else {
        await addScheduleEvent(payload);
        toast.success("Event added to the week.");
      }
      onOpenChange(false);
    } catch {
      // Store already toasted.
    }
  }

  async function handleDelete() {
    if (!event) return;
    try {
      await deleteScheduleEvent(event.id);
      toast.success("Event deleted.");
      onOpenChange(false);
    } catch {
      // Store already toasted.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit event" : "Schedule an event"}</DialogTitle>
          <DialogDescription>
            Site walks, inspections, production, and owner meetings for the week.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Title" htmlFor="evt-title">
            <Input
              id="evt-title"
              value={title}
              onChange={(formEvent) => setTitle(formEvent.target.value)}
              placeholder="e.g. Pre-bid walk"
              autoFocus
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
                onChange={(formEvent) => setDate(formEvent.target.value)}
              />
            </Field>
            <Field label="Start" htmlFor="evt-start">
              <Input
                id="evt-start"
                type="time"
                value={startTime}
                onChange={(formEvent) => setStartTime(formEvent.target.value)}
              />
            </Field>
            <Field label="End" htmlFor="evt-end">
              <Input
                id="evt-end"
                type="time"
                value={endTime}
                onChange={(formEvent) => setEndTime(formEvent.target.value)}
              />
            </Field>
          </div>
          <Field label="Location" htmlFor="evt-loc">
            <Input
              id="evt-loc"
              value={location}
              onChange={(formEvent) => setLocation(formEvent.target.value)}
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
              onChange={(formEvent) => setNotes(formEvent.target.value)}
              rows={2}
            />
          </Field>
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="outline" className="text-destructive" onClick={() => void handleDelete()}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{editing ? "Save changes" : "Add event"}</Button>
            </div>
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
  const { invoices } = useCrm();
  const invoice = invoices.find((item) => item.id === invoiceId);
  return (
    <LogPaymentDialog
      open={open}
      onOpenChange={onOpenChange}
      defaultInvoiceId={invoiceId}
      defaultJobId={invoice?.jobId}
    />
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
