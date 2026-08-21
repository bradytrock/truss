"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { MapPin, Search, User, XIcon } from "lucide-react";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useCrm } from "@/lib/crm-store";
import { localYmd } from "@/lib/format";
import {
  defaultDeliveryForSource,
  formatJobSite,
  leadName,
} from "@/lib/leads";
import {
  CLIENT_TYPE_LABELS,
  CLIENT_TYPES,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  type ClientType,
  type Contact,
  type JobStatus,
  type LeadSource,
} from "@/lib/types";
import { assignmentOptions, staffAssignmentLabel } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";

export function CreateOpportunityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const people = assignmentOptions(crm.viewer, crm.book.staff, crm.user.staffId);
  const defaultAssignee = people.find((member) => member.id === crm.user.staffId)?.id ?? people[0]?.id ?? "";
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [referralId, setReferralId] = useState("");
  const [referralQuery, setReferralQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const assignee = people.find((member) => member.id === assigneeId);
  const isMe = Boolean(assignee && assignee.id === crm.user.staffId);

  const referralMatches = useMemo(() => {
    const needle = referralQuery.trim().toLowerCase();
    const visible = [...crm.contacts].sort((a, b) => {
      if (a.isReferralPartner !== b.isReferralPartner) return a.isReferralPartner ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!needle) return visible.slice(0, 8);
    return visible
      .filter((contact) => {
        const haystack = `${contact.name} ${contact.title} ${contact.email} ${contact.phone}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 8);
  }, [crm.contacts, referralQuery]);

  const selectedReferral = crm.contacts.find((contact) => contact.id === referralId);

  function reset() {
    setAssigneeId(defaultAssignee);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setStreet("");
    setCity("");
    setRegion("");
    setPostalCode("");
    setSource("");
    setReferralId("");
    setReferralQuery("");
    setNotes("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    else setAssigneeId(defaultAssignee);
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      toast.error("First and last name are required.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      toast.error("Add a phone or email so the assigned person can respond in five minutes.");
      return;
    }
    if (!source) {
      toast.error("How did they hear about us?");
      return;
    }
    if (source === "referral" && !referralId) {
      toast.error("Search your contacts and connect the person who sent this lead.");
      return;
    }
    const site = formatJobSite({ street, city, state: region, postalCode });
    const fullName = `${first} ${last}`;
    const owner = assignee ?? crm.viewer;
    setSaving(true);
    try {
      const contact = await crm.addContact({
        clientId: null,
        name: fullName,
        title: "Homeowner",
        email: email.trim(),
        phone: phone.trim(),
        ownerStaffId: owner?.id || crm.user.staffId,
        isReferralPartner: false,
      });
      const opportunity = await crm.addOpportunity({
        name: leadName(first, last, site || city.trim()),
        clientId: null,
        primaryContactId: contact.id,
        stage: "pursuing",
        value: 0,
        bidDueAt: null,
        preBidWalkAt: null,
        location: site || city.trim() || "Address TBD",
        projectType: "restoration",
        deliveryMethod: defaultDeliveryForSource(source),
        estimator: owner?.name || crm.user.name,
        ownerStaffId: owner?.id,
        originatorStaffId: crm.user.staffId,
        nextStep: "Call back within 5 minutes.",
        leadSource: source,
        referralContactId: source === "referral" ? referralId : null,
        street: street.trim(),
        city: city.trim(),
        state: region.trim(),
        postalCode: postalCode.trim(),
        notes: notes.trim(),
      });
      const referrer = source === "referral" ? selectedReferral : undefined;
      await crm.addActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        body: [
          `Lead opened for ${fullName}. Source: ${LEAD_SOURCE_LABELS[source]}.`,
          referrer ? `Referred by ${referrer.name}.` : "",
          notes.trim() ? notes.trim() : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
      await crm.addTask({
        title: `Call ${fullName} back`,
        dueAt: localYmd(new Date()),
        relatedType: "opportunity",
        relatedId: opportunity.id,
        assignee: owner?.name || crm.user.name,
      });
      toast.success(`Lead opened: ${opportunity.code}. Costs post to this job.`);
      handleOpenChange(false);
    } catch {
      // Store already toasted the error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-y-auto sm:max-w-[28rem]"
      >
        <SheetHeader className="relative border-b pr-14">
          <SheetTitle className="font-heading text-xl">New Lead</SheetTitle>
          <SheetDescription>
            {crm.viewer && isBusinessDevelopment(crm.viewer.role)
              ? "You keep credit on this lead. Assign it to the estimator or PM who will run it."
              : "This slides in so you can finish a quick task without leaving your page."}
          </SheetDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3 size-8 rounded-full bg-muted hover:bg-muted/80"
            onClick={() => handleOpenChange(false)}
            aria-label="Close"
          >
            <XIcon />
          </Button>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="grid gap-3.5 px-4 py-4">
            <div className="grid gap-1.5">
              <div className="flex items-end justify-between gap-2">
                <Label htmlFor="lead-assignee">Assigned to</Label>
                {isMe ? (
                  <span className="text-[11px] text-muted-foreground">Me</span>
                ) : crm.viewer && isBusinessDevelopment(crm.viewer.role) ? (
                  <span className="text-[11px] text-muted-foreground">You still keep the numbers</span>
                ) : null}
              </div>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setAssigneeId(String(value ?? ""))}
                  items={people.map((member) => ({
                    value: member.id,
                    label: staffAssignmentLabel(member),
                  }))}
                >
                  <SelectTrigger id="lead-assignee" className="w-full pl-8">
                    <SelectValue placeholder="Select a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {staffAssignmentLabel(member)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="lead-first">
                <Input
                  id="lead-first"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="John"
                  autoComplete="given-name"
                />
              </Field>
              <Field label="Last name" htmlFor="lead-last">
                <Input
                  id="lead-last"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Smith"
                  autoComplete="family-name"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="lead-phone">
                <Input
                  id="lead-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                />
              </Field>
              <Field label="Email" htmlFor="lead-email">
                <Input
                  id="lead-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="john@example.com"
                  autoComplete="email"
                />
              </Field>
            </div>

            <Field label="Address" htmlFor="lead-street">
              <InputGroup>
                <InputGroupAddon>
                  <MapPin />
                </InputGroupAddon>
                <InputGroupInput
                  id="lead-street"
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  placeholder="Start typing an address..."
                  autoComplete="street-address"
                />
              </InputGroup>
            </Field>

            <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-3">
              <Field label="City" htmlFor="lead-city">
                <Input
                  id="lead-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="State" htmlFor="lead-state">
                <Input
                  id="lead-state"
                  value={region}
                  onChange={(event) => setRegion(event.target.value.toUpperCase().slice(0, 2))}
                  placeholder="ST"
                  autoComplete="address-level1"
                />
              </Field>
              <Field label="ZIP" htmlFor="lead-zip">
                <Input
                  id="lead-zip"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder="12345"
                  autoComplete="postal-code"
                />
              </Field>
            </div>

            <Field label="How did they hear about us?">
              <Select
                value={source || null}
                onValueChange={(value) => {
                  const next = String(value ?? "") as LeadSource | "";
                  setSource(next);
                  if (next !== "referral") {
                    setReferralId("");
                    setReferralQuery("");
                  }
                }}
                items={LEAD_SOURCES.map((item) => ({
                  value: item,
                  label: LEAD_SOURCE_LABELS[item],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {LEAD_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {source === "referral" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="lead-referral">Referred by</Label>
                {selectedReferral ? (
                  <div className="flex items-center justify-between gap-2 border bg-muted/40 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selectedReferral.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedReferral.title || "Contact"}
                        {selectedReferral.isReferralPartner ? " · Referral partner" : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setReferralId("");
                        setReferralQuery("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <InputGroup>
                      <InputGroupAddon>
                        <Search />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="lead-referral"
                        value={referralQuery}
                        onChange={(event) => setReferralQuery(event.target.value)}
                        placeholder="Search contacts you can see..."
                      />
                    </InputGroup>
                    {crm.contacts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No contacts in this seat’s book. Team leads can Login As a project manager, or add the
                        referrer as a contact first.
                      </p>
                    ) : referralMatches.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No matching contacts in your book.</p>
                    ) : (
                      <ul className="max-h-40 divide-y overflow-y-auto border">
                        {referralMatches.map((contact) => (
                          <li key={contact.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start px-2.5 py-2 text-left hover:bg-muted/60"
                              onClick={() => setReferralId(contact.id)}
                            >
                              <span className="text-sm font-medium">{contact.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {contact.title || "Contact"}
                                {contact.isReferralPartner ? " · Referral partner" : ""}
                                {contact.phone ? ` · ${contact.phone}` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ) : null}

            <Field label="Notes" htmlFor="lead-notes">
              <Textarea
                id="lead-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything helpful..."
                rows={4}
              />
            </Field>

            <div className="border border-destructive/25 bg-destructive/5 px-3 py-2.5">
              <p className="text-sm font-medium text-destructive">Lead response required</p>
              <p className="mt-0.5 text-sm text-destructive">Your org requires a response within 5 minutes.</p>
            </div>
          </div>
          <SheetFooter className="border-t">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save lead"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function CreateClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addClient, addContact, clients, user } = useCrm();
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("Homeowner");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyMode, setCompanyMode] = useState<"none" | "existing" | "new">("none");
  const [existingClientId, setExistingClientId] = useState(clients[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [type, setType] = useState<ClientType>("owner");
  const [city, setCity] = useState("Denver");
  const [state, setState] = useState("CO");
  const [notes, setNotes] = useState("");
  const [referral, setReferral] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!contactName.trim()) {
      toast.error("A name is required. A company is not.");
      return;
    }
    try {
      if (companyMode === "new" && companyName.trim()) {
        await addClient({
          name: companyName.trim(),
          type,
          city,
          state,
          notes,
          contactName: contactName.trim(),
          contactTitle: contactTitle.trim() || "Homeowner",
          isReferralPartner: referral,
        });
      } else {
        await addContact({
          clientId: companyMode === "existing" && existingClientId ? existingClientId : null,
          name: contactName.trim(),
          title: contactTitle.trim() || "Homeowner",
          email: email.trim(),
          phone: phone.trim(),
          ownerStaffId: user.staffId,
          isReferralPartner: referral,
        });
      }
      toast.success(`Contact added: ${contactName.trim()}`);
      onOpenChange(false);
      setContactName("");
      setEmail("");
      setPhone("");
      setCompanyName("");
      setNotes("");
      setReferral(false);
      setCompanyMode("none");
    } catch {
      // Store already toasted the error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
          <DialogDescription>
            Most Northline work is the homeowner. Add a company only if they actually have one — realtor, adjuster, or the occasional commercial owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Name" htmlFor="cli-contact">
            <Input
              id="cli-contact"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              placeholder="e.g. Dana Alvarez"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="cli-title">
              <Input
                id="cli-title"
                value={contactTitle}
                onChange={(event) => setContactTitle(event.target.value)}
                placeholder="Homeowner"
              />
            </Field>
            <Field label="Phone" htmlFor="cli-phone">
              <Input
                id="cli-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(303) 555-0100"
              />
            </Field>
          </div>
          <Field label="Email" htmlFor="cli-email">
            <Input
              id="cli-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="dana@example.com"
            />
          </Field>
          <Field label="Company">
            <Select
              value={companyMode}
              onValueChange={(value) => setCompanyMode((value as typeof companyMode) ?? "none")}
              items={[
                { value: "none", label: "None — homeowner / DTC" },
                { value: "existing", label: "Existing company" },
                { value: "new", label: "Add a company" },
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — homeowner / DTC</SelectItem>
                <SelectItem value="existing">Existing company</SelectItem>
                <SelectItem value="new">Add a company</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {companyMode === "existing" ? (
            <Field label="Which company">
              <Select
                value={existingClientId}
                onValueChange={(value) => setExistingClientId(String(value ?? ""))}
                items={clients.map((client) => ({ value: client.id, label: client.name }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {companyMode === "new" ? (
            <>
              <Field label="Company name" htmlFor="cli-name">
                <Input
                  id="cli-name"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="e.g. Summit Claims Group"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Type">
                  <Select
                    value={type}
                    onValueChange={(value) => setType(value as ClientType)}
                    items={CLIENT_TYPES.map((clientType) => ({
                      value: clientType,
                      label: CLIENT_TYPE_LABELS[clientType],
                    }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((clientType) => (
                        <SelectItem key={clientType} value={clientType}>
                          {CLIENT_TYPE_LABELS[clientType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="City" htmlFor="cli-city">
                  <Input id="cli-city" value={city} onChange={(event) => setCity(event.target.value)} />
                </Field>
                <Field label="State" htmlFor="cli-state">
                  <Input
                    id="cli-state"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={referral}
              onCheckedChange={(value) => setReferral(Boolean(value))}
            />
            Referral partner — realtor, adjuster, or specifier in this seat’s book
          </label>
          {companyMode === "new" ? (
            <Field label="Notes" htmlFor="cli-notes">
              <Textarea
                id="cli-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="How they send work..."
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add contact</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditContactDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { updateContact, clients, viewer, book } = useCrm();
  const owners = useMemo(
    () => assignmentOptions(viewer, book.staff, contact.ownerStaffId),
    [book.staff, contact.ownerStaffId, viewer],
  );

  const [name, setName] = useState(contact.name);
  const [title, setTitle] = useState(contact.title);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);
  const [companyMode, setCompanyMode] = useState<"none" | "existing">(
    contact.clientId ? "existing" : "none"
  );
  const [existingClientId, setExistingClientId] = useState(contact.clientId ?? clients[0]?.id ?? "");
  const [ownerStaffId, setOwnerStaffId] = useState(contact.ownerStaffId);
  const [referral, setReferral] = useState(contact.isReferralPartner);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact.name);
    setTitle(contact.title);
    setEmail(contact.email);
    setPhone(contact.phone);
    setCompanyMode(contact.clientId ? "existing" : "none");
    setExistingClientId(contact.clientId ?? clients[0]?.id ?? "");
    setOwnerStaffId(contact.ownerStaffId);
    setReferral(contact.isReferralPartner);
  }, [open, contact, clients]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      toast.error("A name is required.");
      return;
    }
    if (companyMode === "existing" && !existingClientId) {
      toast.error("Pick a company, or set company to none.");
      return;
    }
    setSaving(true);
    try {
      const ok = await updateContact(contact.id, {
        name: nextName,
        title: title.trim() || "Homeowner",
        email: email.trim(),
        phone: phone.trim(),
        clientId: companyMode === "existing" ? existingClientId || null : null,
        ownerStaffId: ownerStaffId || contact.ownerStaffId,
        isReferralPartner: referral,
      });
      if (!ok) return;
      toast.success(`Saved ${nextName}`);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>
            Update this person’s details, company, and who owns them in the book.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Name" htmlFor="edit-contact-name">
            <Input
              id="edit-contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Dana Alvarez"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="edit-contact-title">
              <Input
                id="edit-contact-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Homeowner"
              />
            </Field>
            <Field label="Phone" htmlFor="edit-contact-phone">
              <Input
                id="edit-contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="(303) 555-0100"
              />
            </Field>
          </div>
          <Field label="Email" htmlFor="edit-contact-email">
            <Input
              id="edit-contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="dana@example.com"
            />
          </Field>
          <Field label="Company">
            <Select
              value={companyMode}
              onValueChange={(value) => setCompanyMode((value as typeof companyMode) ?? "none")}
              items={[
                { value: "none", label: "None — homeowner / DTC" },
                { value: "existing", label: "Existing company" },
              ]}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — homeowner / DTC</SelectItem>
                <SelectItem value="existing">Existing company</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {companyMode === "existing" ? (
            <Field label="Which company">
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No companies in this book yet. Set company to none, or add a company from New contact.
                </p>
              ) : (
                <Select
                  value={existingClientId}
                  onValueChange={(value) => setExistingClientId(String(value ?? ""))}
                  items={clients.map((client) => ({ value: client.id, label: client.name }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ) : null}
          {owners.length > 0 ? (
            <Field label="Book owner">
              <Select
                value={ownerStaffId}
                onValueChange={(value) => setOwnerStaffId(String(value ?? ""))}
                items={owners.map((member) => ({
                  value: member.id,
                  label: staffAssignmentLabel(member),
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {staffAssignmentLabel(member)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={referral}
              onCheckedChange={(value) => setReferral(Boolean(value))}
            />
            Referral partner — realtor, adjuster, or specifier in this seat’s book
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateJobDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { contacts, addJob, teamMembers, user } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [value, setValue] = useState("28000");
  const [location, setLocation] = useState("Denver, CO");
  const [status, setStatus] = useState<JobStatus>("precon");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectManager, setProjectManager] = useState(user.name || "Elena Voss");
  const [superintendent, setSuperintendent] = useState("Tom Brennan");

  const contact = contacts.find((item) => item.id === contactId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contactId) {
      toast.error("A job name and homeowner are required.");
      return;
    }
    try {
      const job = await addJob({
        opportunityId: null,
        name: name.trim(),
        clientId: contact?.clientId ?? null,
        primaryContactId: contactId,
        status,
        contractValue: Number(value) || 0,
        startDate,
        substantialCompletion: null,
        superintendent,
        projectManager,
        location,
      });
      toast.success(`Job logged: ${job.code}`);
      onOpenChange(false);
      setName("");
    } catch {
      // Store already toasted the error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a job</DialogTitle>
          <DialogDescription>
            For work already under contract — a sold restoration, remodel, or roof that did not come through this pipeline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Job name" htmlFor="job-name">
            <Input
              id="job-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Hart water restoration"
            />
          </Field>
          <Field label="Homeowner / contact">
            <Select
              value={contactId}
              onValueChange={(value) => setContactId(String(value ?? ""))}
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
            <Field label="Status">
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as JobStatus)}
                items={JOB_STATUSES.map((jobStatus) => ({
                  value: jobStatus,
                  label: JOB_STATUS_LABELS[jobStatus],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_STATUSES.map((jobStatus) => (
                    <SelectItem key={jobStatus} value={jobStatus}>
                      {JOB_STATUS_LABELS[jobStatus]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contract value" htmlFor="job-value">
              <Input
                id="job-value"
                type="number"
                min={0}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date" htmlFor="job-start">
              <Input
                id="job-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field label="Location" htmlFor="job-location">
              <Input
                id="job-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project manager">
              <Select
                value={projectManager}
                onValueChange={(value) => setProjectManager(String(value ?? ""))}
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
            <Field label="Superintendent">
              <Select
                value={superintendent}
                onValueChange={(value) => setSuperintendent(String(value ?? ""))}
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Log job</Button>
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
