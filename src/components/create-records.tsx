"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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
import { PhoneInput } from "@/components/phone-input";
import {
  QuickFooter,
  QuickHeader,
  QuickHint,
  QuickLabel,
  Segmented,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
} from "@/components/quick-action-form";
import { LeadAssigneeSelect } from "@/components/lead-assignee";
import { useCrm } from "@/lib/crm-store";
import { formatPhoneInput } from "@/lib/phone";
import { assignmentOptions } from "@/lib/visibility";
import { type ClientType, type Contact } from "@/lib/types";

export { CreateOpportunityDialog } from "@/components/new-lead-dialog";

type Who = "homeowner" | "realtor" | "adjuster" | "commercial";

const WHO_OPTIONS: { id: Who; label: string; title: string; type: ClientType }[] = [
  { id: "homeowner", label: "Homeowner", title: "Homeowner", type: "owner" },
  { id: "realtor", label: "Realtor", title: "Realtor", type: "realtor" },
  { id: "adjuster", label: "Adjuster", title: "Adjuster", type: "insurance" },
  { id: "commercial", label: "Commercial", title: "Commercial", type: "owner" },
];

export function CreateClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addClient, addContact, clients, user } = useCrm();
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyMode, setCompanyMode] = useState<"none" | "existing" | "new">("none");
  const [existingClientId, setExistingClientId] = useState(clients[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("Denver");
  const [state, setState] = useState("CO");
  const [notes, setNotes] = useState("");
  const [referral, setReferral] = useState(false);
  const [who, setWho] = useState<Who>("homeowner");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!contactName.trim()) {
      toast.error("A name is required. A company is not.");
      return;
    }
    try {
      const choice = WHO_OPTIONS.find((item) => item.id === who) ?? WHO_OPTIONS[0];
      if (who !== "homeowner" && companyMode === "new" && companyName.trim()) {
        await addClient({
          name: companyName.trim(),
          type: choice.type,
          city,
          state,
          notes,
          contactName: contactName.trim(),
          contactTitle: choice.title,
          email: email.trim(),
          phone: phone.trim(),
          isReferralPartner: referral,
        });
      } else {
        await addContact({
          clientId:
            who !== "homeowner" && companyMode === "existing" && existingClientId
              ? existingClientId
              : null,
          name: contactName.trim(),
          title: choice.title,
          email: email.trim(),
          phone: phone.trim(),
          ownerStaffId: user.staffId,
          isReferralPartner: referral,
          listingWatchUrl: "",
          listingWatchEnabled: false,
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
      setWho("homeowner");
    } catch {
      // Store already toasted the error.
    }
  }

  const companyValue =
    who === "homeowner" || companyMode === "none"
      ? "none"
      : companyMode === "new"
        ? "new"
        : existingClientId || "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={quickDialogClass("lg")}>
        <QuickHeader
          tone="slate"
          icon={<UserIcon />}
          title="New contact"
          description="Most contacts are homeowners. Realtors, adjusters and commercial owners can be tied to a company."
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-4 px-5 py-4`}>
            <div>
              <QuickLabel>Who is this?</QuickLabel>
              <Segmented
                label="Who is this?"
                value={who}
                onChange={(next) => {
                  setWho(next);
                  if (next === "homeowner") setCompanyMode("none");
                }}
                options={WHO_OPTIONS.map((item) => ({ value: item.id, label: item.label }))}
              />
            </div>
            <div>
              <QuickLabel htmlFor="cli-contact" required>Name</QuickLabel>
              <Input
                id="cli-contact"
                className={quickFieldClass}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="First and last name"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <QuickLabel htmlFor="cli-phone">Phone</QuickLabel>
                <PhoneInput
                  id="cli-phone"
                  className={quickFieldClass}
                  value={phone}
                  onValueChange={setPhone}
                  placeholder="(214) 555-0100"
                />
              </div>
              <div>
                <QuickLabel htmlFor="cli-email">Email</QuickLabel>
                <Input
                  id="cli-email"
                  className={quickFieldClass}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </div>
            <div>
              <QuickLabel>Company</QuickLabel>
              <Select
                value={companyValue}
                disabled={who === "homeowner"}
                onValueChange={(value) => {
                  const next = String(value ?? "none");
                  if (next === "none") setCompanyMode("none");
                  else if (next === "new") setCompanyMode("new");
                  else {
                    setCompanyMode("existing");
                    setExistingClientId(next);
                  }
                }}
                items={[
                  { value: "none", label: who === "homeowner" ? "None — homeowner" : "No company" },
                  ...clients.map((client) => ({ value: client.id, label: client.name })),
                  { value: "new", label: "Add a company" },
                ]}
              >
                <SelectTrigger className={`${quickFieldClass} w-full`}>
                  <SelectValue placeholder="None — homeowner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{who === "homeowner" ? "None — homeowner" : "No company"}</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="new">Add a company</SelectItem>
                </SelectContent>
              </Select>
              <QuickHint>Opens up when you pick Realtor, Adjuster or Commercial.</QuickHint>
            </div>
            {who !== "homeowner" && companyMode === "new" ? (
              <div className="grid gap-3">
                <div>
                  <QuickLabel htmlFor="cli-name" required>Company name</QuickLabel>
                  <Input
                    id="cli-name"
                    className={quickFieldClass}
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="e.g. Summit Claims Group"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <QuickLabel htmlFor="cli-city">City</QuickLabel>
                    <Input
                      id="cli-city"
                      className={quickFieldClass}
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                    />
                  </div>
                  <div>
                    <QuickLabel htmlFor="cli-state">State</QuickLabel>
                    <Input
                      id="cli-state"
                      className={quickFieldClass}
                      value={state}
                      onChange={(event) => setState(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-3">
              <span>
                <span className="block text-sm font-semibold">Referral partner</span>
                <span className="block text-xs text-muted-foreground">
                  Track referrals from this person in your book.
                </span>
              </span>
              <Checkbox checked={referral} onCheckedChange={(value) => setReferral(Boolean(value))} />
            </label>
          </div>
          <QuickFooter onCancel={() => onOpenChange(false)} submitLabel="Add contact" />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.2c1.4-2.6 3.7-3.7 6.5-3.7s5.1 1.1 6.5 3.7" />
    </svg>
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
  const { updateContact, clients, viewer, book, user } = useCrm();
  const owners = useMemo(
    () => assignmentOptions(viewer, book.staff, contact.ownerStaffId, user.role),
    [book.staff, contact.ownerStaffId, user.role, viewer],
  );

  const [name, setName] = useState(contact.name);
  const [title, setTitle] = useState(contact.title);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(formatPhoneInput(contact.phone));
  const [companyMode, setCompanyMode] = useState<"none" | "existing">(
    contact.clientId ? "existing" : "none"
  );
  const [existingClientId, setExistingClientId] = useState(contact.clientId ?? clients[0]?.id ?? "");
  const [ownerStaffId, setOwnerStaffId] = useState(contact.ownerStaffId);
  const [referral, setReferral] = useState(contact.isReferralPartner);
  const [listingWatchUrl, setListingWatchUrl] = useState(contact.listingWatchUrl ?? "");
  const [listingWatchEnabled, setListingWatchEnabled] = useState(Boolean(contact.listingWatchEnabled));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(contact.name);
    setTitle(contact.title);
    setEmail(contact.email);
    setPhone(formatPhoneInput(contact.phone));
    setCompanyMode(contact.clientId ? "existing" : "none");
    setExistingClientId(contact.clientId ?? clients[0]?.id ?? "");
    setOwnerStaffId(contact.ownerStaffId);
    setReferral(contact.isReferralPartner);
    setListingWatchUrl(contact.listingWatchUrl ?? "");
    setListingWatchEnabled(Boolean(contact.listingWatchEnabled));
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
        listingWatchUrl: referral ? listingWatchUrl.trim() : "",
        listingWatchEnabled: referral ? listingWatchEnabled : false,
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
              <PhoneInput
                id="edit-contact-phone"
                value={phone}
                onValueChange={setPhone}
                placeholder="(214) 555-0100"
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
              <LeadAssigneeSelect
                value={ownerStaffId}
                people={owners}
                onChange={setOwnerStaffId}
              />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={referral}
              onCheckedChange={(value) => setReferral(Boolean(value))}
            />
            Referral partner — realtor, adjuster, or specifier in this seat’s book
          </label>
          {referral ? (
            <>
              <Field label="Listing watch URL" htmlFor="edit-contact-listing-watch-url">
                <Input
                  id="edit-contact-listing-watch-url"
                  value={listingWatchUrl}
                  onChange={(event) => setListingWatchUrl(event.target.value)}
                  placeholder="https://www.zillow.com/..."
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={listingWatchEnabled}
                  onCheckedChange={(value) => setListingWatchEnabled(Boolean(value))}
                />
                Watch listings daily
              </label>
            </>
          ) : null}
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
