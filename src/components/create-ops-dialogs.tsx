"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { CalendarDays, ClipboardCheck, Flag, Home, MapPin, Search, Users } from "lucide-react";
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
import {
  ChoicePills,
  DateField,
  QuickFooter,
  QuickHeader,
  QuickLabel,
  QuickSection,
  TimeField,
  formatDuration,
  formatWeekdayDate,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
} from "@/components/quick-action-form";
import { initials } from "@/lib/format";
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
import { guestInviteHint, parseGuestEmails, partitionGuestEmails } from "@/lib/calendar-invite";
import { useCrm } from "@/lib/crm-store";
import { localYmd } from "@/lib/format";
import { LogPaymentDialog } from "@/components/log-financial-dialogs";
import {
  EVENT_KIND_LABELS,
  PHOTO_CATEGORIES,
  PHOTO_CATEGORY_LABELS,
  type EventKind,
  type PhotoCategory,
  type ScheduleEvent,
} from "@/lib/types";
import { canCreateInvoices } from "@/lib/visibility";

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
  const { jobs, addInvoice, customerName, effectiveStaff, viewer } = useCrm();
  const [name, setName] = useState("");
  const [jobId, setJobId] = useState(defaultJobId ?? jobs[0]?.id ?? "");
  const dueDefault = (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return localYmd(date);
  })();
  const [dueAt, setDueAt] = useState(dueDefault);
  const [notes, setNotes] = useState("");
  const allowed = canCreateInvoices(effectiveStaff?.role ?? viewer?.role);

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
    if (!allowed) {
      toast.error("This seat cannot create invoices.");
      return;
    }
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
    staff,
    contacts,
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
  const [guestEmails, setGuestEmails] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState("");
  const guestInputId = useId();
  const guestListId = useId();
  const guestHintId = useId();
  const editing = Boolean(event);
  const guestRoster = {
    staffEmails: staff.map((member) => member.email),
  };
  const guestPreview = partitionGuestEmails(parseGuestEmails([...guestEmails, guestDraft]), guestRoster);
  const contactOptions = contacts.filter((contact) => contact.email.trim());

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
      setGuestEmails(parseGuestEmails(event.guestEmails ?? []));
      setGuestDraft("");
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
    setGuestEmails([]);
    setGuestDraft("");
  }, [
    open,
    event,
    defaultDay,
    defaultStart,
    defaultEnd,
    defaultTitle,
    defaultAssignee,
  ]);

  function commitGuestDraft(raw: string, announce = true) {
    const emails = parseGuestEmails(raw);
    if (raw.trim() && emails.length === 0) {
      if (announce) toast.error("Enter an email address.");
      return null;
    }
    const next = parseGuestEmails([...guestEmails, ...emails]);
    setGuestEmails(next);
    setGuestDraft("");
    return next;
  }

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!title.trim()) {
      toast.error("Give the event a title.");
      return;
    }
    const committedGuests = commitGuestDraft(guestDraft);
    if (!committedGuests) return;
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
      guestEmails: committedGuests,
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

  const kindOptions: { value: EventKind; label: string; icon: ReactNode }[] = [
    { value: "site_walk", label: EVENT_KIND_LABELS.site_walk, icon: <MapPin className="size-3.5" /> },
    { value: "inspection", label: EVENT_KIND_LABELS.inspection, icon: <Search className="size-3.5" /> },
    { value: "production", label: EVENT_KIND_LABELS.production, icon: <Home className="size-3.5" /> },
    { value: "meeting", label: EVENT_KIND_LABELS.meeting, icon: <Users className="size-3.5" /> },
    { value: "pre_bid", label: EVENT_KIND_LABELS.pre_bid, icon: <Flag className="size-3.5" /> },
    { value: "punch", label: EVENT_KIND_LABELS.punch, icon: <ClipboardCheck className="size-3.5" /> },
  ];
  const span = formatDuration(startTime, endTime);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("xl")}>
        <QuickHeader
          tone="blue"
          icon={<CalendarDays className="size-5" />}
          title={editing ? "Edit event" : "Schedule an event"}
          description="Site walks, inspections, production days and owner meetings."
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-4 px-5 py-4`}>
          <div>
            <QuickLabel htmlFor="evt-title" required>Title</QuickLabel>
            <Input
              id="evt-title"
              className={quickFieldClass}
              value={title}
              onChange={(formEvent) => setTitle(formEvent.target.value)}
              placeholder="e.g. Pre-bid walk"
              autoFocus
            />
          </div>
          <div>
            <QuickLabel>Type</QuickLabel>
            <ChoicePills
              label="Event type"
              value={kind}
              onChange={setKind}
              options={kindOptions}
            />
          </div>
          <QuickSection>When & where</QuickSection>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <QuickLabel htmlFor="evt-date">Date</QuickLabel>
              <DateField
                id="evt-date"
                label="Date"
                value={date}
                display={formatWeekdayDate}
                onChange={setDate}
              />
            </div>
            <div>
              <QuickLabel htmlFor="evt-start">Start</QuickLabel>
              <TimeField id="evt-start" label="Start" value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <QuickLabel htmlFor="evt-end">End</QuickLabel>
              <TimeField id="evt-end" label="End" value={endTime} onChange={setEndTime} />
            </div>
          </div>
          {span ? <p className="-mt-2 text-xs text-muted-foreground">{span}</p> : null}
          <div>
            <QuickLabel htmlFor="evt-loc">Location</QuickLabel>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="evt-loc"
                className={`${quickFieldClass} pl-9`}
                value={location}
                onChange={(formEvent) => setLocation(formEvent.target.value)}
                placeholder="Jobsite address, trailer or Teams link"
              />
            </div>
          </div>
          <div>
            <QuickLabel>Assignee</QuickLabel>
            <Select
              value={assignee}
              onValueChange={(value) => setAssignee(String(value ?? ""))}
              items={people.map((person) => ({
                value: person,
                label: person === user.name ? `${person} (you)` : person,
              }))}
            >
              <SelectTrigger className="h-10 w-full rounded-lg bg-white data-[size=default]:h-10">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">
                    {initials(assignee)}
                  </span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person} value={person}>
                    {person === user.name ? `${person} (you)` : person}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Link & invite <span className="font-normal tracking-normal normal-case">· optional</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <QuickLabel>Job</QuickLabel>
              <Select
                value={jobId || "none"}
                onValueChange={(value) => setJobId(value === "none" ? "" : String(value ?? ""))}
                items={[
                  { value: "none", label: "None" },
                  ...jobs.map((job) => ({ value: job.id, label: job.name })),
                ]}
              >
                <SelectTrigger className={`${quickFieldClass} w-full`}>
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
            </div>
            <div>
              <QuickLabel>Pursuit</QuickLabel>
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
                <SelectTrigger className={`${quickFieldClass} w-full`}>
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
            </div>
          </div>
          <div>
            <QuickLabel htmlFor={guestInputId}>Invite guests</QuickLabel>
            <Input
              id={guestInputId}
              className={quickFieldClass}
              value={guestDraft}
              list={guestListId}
              onChange={(formEvent) => {
                const value = formEvent.target.value;
                if (/[,\n;]$/.test(value)) {
                  commitGuestDraft(value);
                  return;
                }
                setGuestDraft(value);
              }}
              onKeyDown={(formEvent) => {
                if (formEvent.key === "Enter") {
                  formEvent.preventDefault();
                  commitGuestDraft(guestDraft);
                }
              }}
              onBlur={() => {
                if (guestDraft.trim()) commitGuestDraft(guestDraft, false);
              }}
              aria-describedby={guestHintId}
              placeholder="Add emails, separated by commas"
            />
            <datalist id={guestListId}>
              {contactOptions.map((contact) => (
                <option key={contact.id} value={contact.email}>
                  {contact.name}
                </option>
              ))}
            </datalist>
            {guestEmails.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {guestEmails.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                  >
                    {email}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${email}`}
                      onClick={() => setGuestEmails((current) => current.filter((item) => item !== email))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <p id={guestHintId} className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {guestEmails.length > 0 || guestDraft.trim()
                ? guestInviteHint(guestPreview.outside, guestPreview.inside)
                : "Outside guests get a Google Calendar invite. Teammates already see it here."}
            </p>
          </div>
          <div>
            <QuickLabel htmlFor="evt-notes">Notes</QuickLabel>
            <Textarea
              id="evt-notes"
              className="min-h-20 rounded-lg bg-white"
              value={notes}
              onChange={(formEvent) => setNotes(formEvent.target.value)}
              placeholder="Gate code, who to ask for, what to bring"
              rows={2}
            />
          </div>
          </div>
          <QuickFooter
            onCancel={() => onOpenChange(false)}
            submitLabel={editing ? "Save changes" : "Add event"}
            note={
              editing ? (
                <Button type="button" variant="ghost" className="text-destructive" onClick={() => void handleDelete()}>
                  Delete
                </Button>
              ) : null
            }
          />
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
            <Field label="Tag">
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
