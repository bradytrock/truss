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
  CURRENT_USER,
  DELIVERY_LABELS,
  DELIVERY_METHODS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  PROJECT_TYPE_LABELS,
  PROJECT_TYPES,
  TEAM,
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
  const { clients, contacts, addOpportunity } = useCrm();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [value, setValue] = useState("5000000");
  const [location, setLocation] = useState("Denver, CO");
  const [projectType, setProjectType] = useState<ProjectType>("commercial");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("cm_at_risk");
  const [bidDueAt, setBidDueAt] = useState("");
  const [estimator, setEstimator] = useState<string>(CURRENT_USER.name);
  const [nextStep, setNextStep] = useState("Qualify the RFP and assign an estimator.");

  const clientContacts = contacts.filter((contact) => contact.clientId === clientId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !clientId) {
      toast.error("A project name and client are required.");
      return;
    }
    const opportunity = addOpportunity({
      name: name.trim(),
      clientId,
      primaryContactId: clientContacts[0]?.id ?? "",
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
    toast.success(`Pursuit opened: ${opportunity.name}`);
    onOpenChange(false);
    setName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New pursuit</DialogTitle>
          <DialogDescription>
            Log a bid, RFP, or conversation before it hits estimating.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Project" htmlFor="opp-name">
            <Input
              id="opp-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. RiNo Life Science Lab"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              <Select
                value={clientId}
                onValueChange={(value) => setClientId(String(value ?? ""))}
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
            <Field label="Est. contract value" htmlFor="opp-value">
              <Input
                id="opp-value"
                type="number"
                min={0}
                value={value}
                onChange={(event) => setValue(event.target.value)}
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
            <Field label="Delivery">
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
            <Field label="Location" htmlFor="opp-location">
              <Input
                id="opp-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </Field>
            <Field label="Bid due" htmlFor="opp-due">
              <Input
                id="opp-due"
                type="date"
                value={bidDueAt}
                onChange={(event) => setBidDueAt(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Estimator">
            <Select
              value={estimator}
              onValueChange={(value) => setEstimator(String(value ?? ""))}
              items={TEAM.map((person) => ({ value: person, label: person }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM.map((person) => (
                  <SelectItem key={person} value={person}>
                    {person}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
            <Button type="submit">Open pursuit</Button>
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
  const { addClient } = useCrm();
  const [name, setName] = useState("");
  const [type, setType] = useState<ClientType>("owner");
  const [city, setCity] = useState("Denver");
  const [state, setState] = useState("CO");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Company name is required.");
      return;
    }
    addClient({
      name: name.trim(),
      type,
      city,
      state,
      notes,
      contactName: contactName.trim() || undefined,
      contactTitle: contactTitle.trim() || undefined,
    });
    toast.success(`Client added: ${name.trim()}`);
    onOpenChange(false);
    setName("");
    setContactName("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>
            Owners, developers, agencies, and the architects who put you on the list.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Company" htmlFor="cli-name">
            <Input
              id="cli-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Redstone Development"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Primary contact" htmlFor="cli-contact">
              <Input
                id="cli-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Title" htmlFor="cli-title">
              <Input
                id="cli-title"
                value={contactTitle}
                onChange={(event) => setContactTitle(event.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="cli-notes">
            <Textarea
              id="cli-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How they buy work, who actually awards..."
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Add client</Button>
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
  const { clients, addJob } = useCrm();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [value, setValue] = useState("10000000");
  const [location, setLocation] = useState("Denver, CO");
  const [status, setStatus] = useState<JobStatus>("precon");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectManager, setProjectManager] = useState("Luis Ortega");
  const [superintendent, setSuperintendent] = useState("Tom Brennan");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !clientId) {
      toast.error("A job name and client are required.");
      return;
    }
    const job = addJob({
      opportunityId: null,
      name: name.trim(),
      clientId,
      status,
      contractValue: Number(value) || 0,
      startDate,
      substantialCompletion: null,
      superintendent,
      projectManager,
      location,
    });
    toast.success(`Job logged: ${job.name}`);
    onOpenChange(false);
    setName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a job</DialogTitle>
          <DialogDescription>
            For work already under contract that did not come through this pipeline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <Field label="Job name" htmlFor="job-name">
            <Input
              id="job-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. 16th Street Office Core & Shell"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client">
              <Select
                value={clientId}
                onValueChange={(value) => setClientId(String(value ?? ""))}
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
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contract value" htmlFor="job-value">
              <Input
                id="job-value"
                type="number"
                min={0}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
            <Field label="Start date" htmlFor="job-start">
              <Input
                id="job-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Location" htmlFor="job-location">
            <Input
              id="job-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project manager">
              <Select
                value={projectManager}
                onValueChange={(value) => setProjectManager(String(value ?? ""))}
                items={TEAM.map((person) => ({ value: person, label: person }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM.map((person) => (
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
                items={TEAM.map((person) => ({ value: person, label: person }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM.map((person) => (
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
