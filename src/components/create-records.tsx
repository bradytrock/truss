"use client";

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
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  CLIENT_TYPE_LABELS,
  CLIENT_TYPES,
  DELIVERY_LABELS,
  DELIVERY_METHODS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  type ClientType,
  type DeliveryMethod,
  type JobStatus,
  type ProjectType,
} from "@/lib/types";

export function CreateOpportunityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { clients, contacts, addOpportunity, user, teamMembers } = useCrm();
  const people = teamMembers.length > 0 ? teamMembers : [user.name].filter(Boolean);
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [value, setValue] = useState("28000");
  const [location, setLocation] = useState("Denver, CO");
  const [projectType, setProjectType] = useState<ProjectType>("restoration");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("fixed_price");
  const [bidDueAt, setBidDueAt] = useState("");
  const [estimator, setEstimator] = useState<string>(user.name || people[0] || "");
  const [nextStep, setNextStep] = useState("Schedule a site visit and write the proposal.");

  const contact = contacts.find((item) => item.id === contactId);
  const company = contact?.clientId ? clients.find((item) => item.id === contact.clientId) : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contactId) {
      toast.error("A project name and homeowner (or contact) are required.");
      return;
    }
    try {
      const opportunity = await addOpportunity({
        name: name.trim(),
        clientId: contact?.clientId ?? null,
        primaryContactId: contactId,
        stage: "pursuing",
        value: Number(value) || 0,
        bidDueAt: bidDueAt || null,
        preBidWalkAt: null,
        location,
        projectType,
        deliveryMethod,
        estimator,
        nextStep,
      });
      toast.success(`Lead opened: ${opportunity.code}`);
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
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Log a homeowner, insurance claim, or conversation before it hits estimating. A company is optional.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Project" htmlFor="opp-name">
            <Input
              id="opp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Alvarez hail roof — Park Hill"
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
            {company ? (
              <p className="text-xs text-muted-foreground">Company on file: {company.name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Direct to consumer — no company required.</p>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Est. contract value" htmlFor="opp-value">
              <Input
                id="opp-value"
                type="number"
                min={0}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
            <Field label="Location" htmlFor="opp-location">
              <Input
                id="opp-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Street, city"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project type">
              <Select
                value={projectType}
                onValueChange={(value) => setProjectType(value as ProjectType)}
                items={PROJECT_TYPES.map((type) => ({
                  value: type,
                  label: PROJECT_TYPE_LABELS[type],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PROJECT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="How they buy">
              <Select
                value={deliveryMethod}
                onValueChange={(value) => setDeliveryMethod(value as DeliveryMethod)}
                items={DELIVERY_METHODS.map((method) => ({
                  value: method,
                  label: DELIVERY_LABELS[method],
                }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {DELIVERY_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proposal due" htmlFor="opp-due">
              <Input
                id="opp-due"
                type="date"
                value={bidDueAt}
                onChange={(event) => setBidDueAt(event.target.value)}
              />
            </Field>
            <Field label="Estimator">
              <Select
                value={estimator}
                onValueChange={(value) => setEstimator(String(value ?? ""))}
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
          <Field label="Next step" htmlFor="opp-next">
            <Textarea
              id="opp-next"
              value={nextStep}
              onChange={(event) => setNextStep(event.target.value)}
              rows={2}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Open lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
