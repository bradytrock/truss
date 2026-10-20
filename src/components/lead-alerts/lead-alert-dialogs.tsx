"use client";

import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSIGN_ERROR,
  ASSIGN_TITLE,
  BOOK_DATE_ERROR,
  BOOK_HELP,
  BOOK_TIME_ERROR,
  BOOK_TITLE,
  BOOK_TITLE_ERROR,
  LEAD_APPOINTMENT_KINDS,
  NOTE_HELP,
  NOTE_TITLE,
  PASS_ALONG_HELP,
  PASS_ALONG_TITLE,
  PASSBACK_REASONS,
  QUICK_REP_NOTES,
  UPDATE_HELP,
  UPDATE_TITLE,
  appointmentKindLabel,
  defaultAppointmentTitle,
  defaultBookAppointment,
  leadEditSeed,
  leadPlaceLine,
  leadServiceChoices,
  passbackSummary,
  serviceTypeLabel,
  type BookAppointmentInput,
  type LeadAppointmentKind,
  type LeadAlert,
  type LeadEditSeed,
  type UpdateLeadInput,
} from "@/lib/lead-alerts";
import { PhoneInput } from "@/components/phone-input";
import { listLeadAssignees, type RepOption } from "@/lib/lead-alerts-api";
import { createClient } from "@/lib/supabase/client";
import { initialsFromName } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PassAlongDialog({
  alert,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert | null;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="pass-along-title" className="sm:max-w-md">
        {alert ? (
          <PassAlongPanel key={alert.id} alert={alert} onClose={onClose} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PassAlongPanel({
  alert,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const place = leadPlaceLine(alert.lead);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          await onSubmit(reason, note);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "");
          setPending(false);
        }
      }}
    >
      <h2 id="pass-along-title" className="font-heading text-base leading-none font-medium">
        {PASS_ALONG_TITLE}
      </h2>
      <p className="mt-2 text-sm font-medium">{alert.lead.homeowner_name || "Homeowner"}</p>
      {place ? <p className="text-sm text-muted-foreground">{place}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">{PASS_ALONG_HELP}</p>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Reason</legend>
        <div role="radiogroup" aria-label="Reason" className="mt-2 flex flex-col gap-1.5">
          {PASSBACK_REASONS.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={reason === item}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                reason === item ? "border-foreground bg-muted" : "border-border",
              )}
              onClick={() => setReason(reason === item ? "" : item)}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="mt-4 block text-sm font-medium" htmlFor="pass-along-note">
        Note for your admin
      </label>
      <Textarea
        id="pass-along-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2"
      />
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Send to admin
        </Button>
      </div>
    </form>
  );
}

export function NoteToAdminDialog({
  alert,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert | null;
  onClose: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="note-to-admin-title" className="sm:max-w-md">
        {alert ? (
          <NoteToAdminPanel key={alert.id} onClose={onClose} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function NoteToAdminPanel({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState<string>(QUICK_REP_NOTES[0]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) return;
        setPending(true);
        setError("");
        try {
          await onSubmit(body);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "");
          setPending(false);
        }
      }}
    >
      <h2 id="note-to-admin-title" className="font-heading text-base leading-none font-medium">
        {NOTE_TITLE}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{NOTE_HELP}</p>
      <div className="mt-4">
        <p className="text-sm font-medium" id="quick-notes-label">
          Quick notes
        </p>
        <div aria-labelledby="quick-notes-label" className="mt-2 flex flex-col gap-1.5">
          {QUICK_REP_NOTES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={body === item}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                body === item ? "border-foreground bg-muted" : "border-border",
              )}
              onClick={() => setBody(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="note-to-admin-body">
        Your note
      </label>
      <Textarea
        id="note-to-admin-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="mt-2"
      />
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !body.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}

export function AssignRepDialog({
  alert,
  companyId,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert | null;
  companyId: string;
  onClose: () => void;
  onSubmit: (repId: string, note: string) => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="assign-rep-title" className="sm:max-w-md">
        {alert ? (
          <AssignRepPanel key={alert.id} alert={alert} companyId={companyId} onClose={onClose} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AssignRepPanel({
  alert,
  companyId,
  reps,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert;
  companyId: string;
  reps?: RepOption[];
  onClose: () => void;
  onSubmit: (repId: string, note: string) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<RepOption[] | null>(reps ?? null);
  const [query, setQuery] = useState("");
  const [repId, setRepId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const place = leadPlaceLine(alert.lead);
  const passedBack = Boolean(alert.lead.passed_back_by);
  const summary = passbackSummary(alert.lead);

  useEffect(() => {
    if (reps) return;
    let cancelled = false;
    const supabase = createClient();
    listLeadAssignees(supabase, companyId)
      .then((rows) => {
        if (!cancelled) setLoaded(rows);
      })
      .catch(() => {
        if (!cancelled) setError(ASSIGN_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reps]);

  const choices = useMemo(() => {
    const excluded = alert.lead.passed_back_by;
    const needle = query.trim().toLowerCase();
    return (loaded ?? []).filter((rep) => {
      if (excluded && rep.id === excluded) return false;
      if (!needle) return true;
      return rep.fullName.toLowerCase().includes(needle);
    });
  }, [alert.lead.passed_back_by, loaded, query]);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!repId) return;
        setPending(true);
        setError("");
        try {
          await onSubmit(repId, note);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : ASSIGN_ERROR);
          setPending(false);
        }
      }}
    >
      <h2 id="assign-rep-title" className="font-heading text-base leading-none font-medium">
        {ASSIGN_TITLE}
      </h2>
      <p className="mt-2 text-sm font-medium">{alert.lead.homeowner_name || "Homeowner"}</p>
      {place ? <p className="text-sm text-muted-foreground">{place}</p> : null}
      {passedBack ? (
        <div className="mt-3 text-sm text-[#E0302E]">
          <p className="flex items-start gap-1.5">
            <Undo2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Passed back by {alert.lead.passed_back_by_name || "a rep"}
              {alert.lead.passback_reason ? `: ${alert.lead.passback_reason}` : ""}
            </span>
          </p>
          {alert.lead.handoff_note ? (
            <blockquote className="mt-1 border-l-2 border-[#E0302E]/40 pl-3">
              {`"${alert.lead.handoff_note}"`}
            </blockquote>
          ) : summary && !alert.lead.passback_reason ? (
            <p className="mt-1">{summary}</p>
          ) : null}
        </div>
      ) : null}
      <label className="mt-4 block text-sm font-medium" htmlFor="assign-rep-search">
        Assign to
      </label>
      <Input
        id="assign-rep-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="mt-2"
        autoComplete="off"
      />
      <div role="radiogroup" aria-label="Assign to" className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto">
        {loaded === null ? <p className="text-sm text-muted-foreground">Loading people…</p> : null}
        {loaded && choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one to assign.</p>
        ) : null}
        {choices.map((rep) => {
          const initials = rep.initials.trim() || initialsFromName(rep.fullName);
          const selected = repId === rep.id;
          return (
            <button
              key={rep.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                selected ? "border-foreground bg-muted" : "border-transparent hover:bg-muted/60",
              )}
              onClick={() => setRepId(rep.id)}
            >
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span>{rep.fullName}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="assign-rep-note">
        Note for the rep
      </label>
      <Textarea
        id="assign-rep-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="mt-2"
      />
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !repId}>
          Assign
        </Button>
      </div>
    </form>
  );
}

const fieldClass =
  "mt-2 h-8 w-full rounded-md border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export function BookAppointmentDialog({
  alert,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert | null;
  onClose: () => void;
  onSubmit: (input: BookAppointmentInput) => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="book-appointment-title" className="sm:max-w-md">
        {alert ? (
          <BookAppointmentPanel key={alert.id} alert={alert} onClose={onClose} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function BookAppointmentPanel({
  alert,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert;
  onClose: () => void;
  onSubmit: (input: BookAppointmentInput) => Promise<void>;
}) {
  const seed = defaultBookAppointment(alert.lead);
  const [title, setTitle] = useState(seed.title);
  const [kind, setKind] = useState<LeadAppointmentKind>(seed.kind);
  const [date, setDate] = useState(seed.date);
  const [startTime, setStartTime] = useState(seed.startTime);
  const [endTime, setEndTime] = useState(seed.endTime);
  const [location, setLocation] = useState(seed.location);
  const [notes, setNotes] = useState(seed.notes);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const place = leadPlaceLine(alert.lead);

  function chooseKind(next: LeadAppointmentKind) {
    setTitle((current) => {
      const previous = defaultAppointmentTitle(alert.lead.homeowner_name, kind);
      if (!current.trim() || current === previous) return defaultAppointmentTitle(alert.lead.homeowner_name, next);
      return current;
    });
    setKind(next);
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim()) {
          setError(BOOK_TITLE_ERROR);
          return;
        }
        if (!date || !startTime || !endTime) {
          setError(BOOK_DATE_ERROR);
          return;
        }
        if (new Date(`${date}T${endTime}:00`).getTime() <= new Date(`${date}T${startTime}:00`).getTime()) {
          setError(BOOK_TIME_ERROR);
          return;
        }
        setPending(true);
        setError("");
        try {
          await onSubmit({ title, kind, date, startTime, endTime, location, notes });
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : BOOK_DATE_ERROR);
          setPending(false);
        }
      }}
    >
      <h2 id="book-appointment-title" className="font-heading text-base leading-none font-medium">
        {BOOK_TITLE}
      </h2>
      <p className="mt-2 text-sm font-medium">{alert.lead.homeowner_name || "Homeowner"}</p>
      {place ? <p className="text-sm text-muted-foreground">{place}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">{BOOK_HELP}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="book-appointment-title-field">
        Title
      </label>
      <Input
        id="book-appointment-title-field"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="mt-2"
      />
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Type</legend>
        <div role="radiogroup" aria-label="Appointment type" className="mt-2 flex flex-col gap-1.5">
          {LEAD_APPOINTMENT_KINDS.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={kind === item}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                kind === item ? "border-foreground bg-muted" : "border-border",
              )}
              onClick={() => chooseKind(item)}
            >
              {appointmentKindLabel(item)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium" htmlFor="book-appointment-date">Date</label>
          <Input id="book-appointment-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-2" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="book-appointment-start">Start</label>
          <Input id="book-appointment-start" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="book-appointment-end">End</label>
          <Input id="book-appointment-end" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2" />
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="book-appointment-location">
        Location
      </label>
      <Input
        id="book-appointment-location"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        className="mt-2"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="book-appointment-notes">
        Notes
      </label>
      <Textarea
        id="book-appointment-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="mt-2"
      />
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Book
        </Button>
      </div>
    </form>
  );
}

export function UpdateLeadDialog({
  alert,
  seed,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert | null;
  seed?: LeadEditSeed | null;
  onClose: () => void;
  onSubmit: (input: UpdateLeadInput) => Promise<void>;
}) {
  return (
    <Dialog open={Boolean(alert)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-labelledby="update-lead-title" className="sm:max-w-md">
        {alert ? (
          <UpdateLeadPanel key={alert.id} alert={alert} seed={seed} onClose={onClose} onSubmit={onSubmit} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function UpdateLeadPanel({
  alert,
  seed,
  onClose,
  onSubmit,
}: {
  alert: LeadAlert;
  seed?: LeadEditSeed | null;
  onClose: () => void;
  onSubmit: (input: UpdateLeadInput) => Promise<void>;
}) {
  const initial = seed ?? leadEditSeed(alert.lead);
  const [homeownerName, setHomeownerName] = useState(initial.homeownerName);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [street, setStreet] = useState(initial.street);
  const [city, setCity] = useState(initial.city);
  const [state, setRegion] = useState(initial.state);
  const [postalCode, setPostalCode] = useState(initial.postalCode);
  const [serviceType, setServiceType] = useState(initial.serviceType);
  const [nextStep, setNextStep] = useState(initial.nextStep);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const services = leadServiceChoices(serviceType);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        try {
          await onSubmit({
            homeownerName,
            phone,
            email,
            street,
            city,
            state,
            postalCode,
            serviceType,
            nextStep,
            notes,
          });
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "");
          setPending(false);
        }
      }}
    >
      <h2 id="update-lead-title" className="font-heading text-base leading-none font-medium">
        {UPDATE_TITLE}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{UPDATE_HELP}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="update-lead-name">
        Homeowner
      </label>
      <Input
        id="update-lead-name"
        value={homeownerName}
        onChange={(event) => setHomeownerName(event.target.value)}
        className="mt-2"
        autoComplete="name"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium" htmlFor="update-lead-phone">Phone</label>
          <PhoneInput id="update-lead-phone" value={phone} onValueChange={setPhone} className="mt-2" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="update-lead-email">Email</label>
          <Input
            id="update-lead-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2"
            autoComplete="email"
          />
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="update-lead-street">
        Street
      </label>
      <Input
        id="update-lead-street"
        value={street}
        onChange={(event) => setStreet(event.target.value)}
        className="mt-2"
        autoComplete="street-address"
      />
      <div className="mt-4 grid grid-cols-[1fr_4.5rem_6rem] gap-3">
        <div>
          <label className="block text-sm font-medium" htmlFor="update-lead-city">City</label>
          <Input id="update-lead-city" value={city} onChange={(event) => setCity(event.target.value)} className="mt-2" autoComplete="address-level2" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="update-lead-state">State</label>
          <Input
            id="update-lead-state"
            value={state}
            onChange={(event) => setRegion(event.target.value.toUpperCase().slice(0, 2))}
            className="mt-2"
            autoComplete="address-level1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="update-lead-zip">ZIP</label>
          <Input
            id="update-lead-zip"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            className="mt-2"
            autoComplete="postal-code"
          />
        </div>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="update-lead-service">
        Service
      </label>
      <select
        id="update-lead-service"
        value={serviceType}
        onChange={(event) => setServiceType(event.target.value)}
        className={fieldClass}
      >
        <option value="">Select service</option>
        {services.map((item) => (
          <option key={item} value={item}>
            {serviceTypeLabel(item)}
          </option>
        ))}
      </select>
      <label className="mt-4 block text-sm font-medium" htmlFor="update-lead-next">
        Next step
      </label>
      <Input
        id="update-lead-next"
        value={nextStep}
        onChange={(event) => setNextStep(event.target.value)}
        className="mt-2"
        placeholder="Site walk Thursday at 9"
      />
      <label className="mt-4 block text-sm font-medium" htmlFor="update-lead-notes">
        Notes
      </label>
      <Textarea
        id="update-lead-notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        className="mt-2"
      />
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}
