"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { LeadAssigneeSelect } from "@/components/lead-assignee";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactSiteAddress } from "@/lib/contact-book";
import { useCrm } from "@/lib/crm-store";
import { parseLocation } from "@/lib/job-record";
import { digitsOnly, formatPhoneInput } from "@/lib/phone";
import type { Contact } from "@/lib/types";
import { assignmentOptions } from "@/lib/visibility";
import { cn } from "@/lib/utils";

const controlClass =
  "rounded-lg border-[rgba(28,25,22,0.14)] bg-white text-[#1d1d1f] shadow-none placeholder:text-[#a1a1a6]";

export function ContactInlineEditor({
  contact,
  initialAddress,
  onCancel,
  onSaved,
  onDirtyChange,
}: {
  contact: Contact;
  initialAddress: string;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const crm = useCrm();
  const owners = useMemo(
    () => assignmentOptions(crm.viewer, crm.book.staff, contact.ownerStaffId, crm.user.role),
    [contact.ownerStaffId, crm.book.staff, crm.user.role, crm.viewer],
  );
  const site = useMemo(
    () => contactSiteAddress(contact, crm.jobs, crm.opportunities),
    [contact, crm.jobs, crm.opportunities],
  );

  const [name, setName] = useState(contact.name);
  const [title, setTitle] = useState(contact.title);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(formatPhoneInput(contact.phone));
  const [address, setAddress] = useState(initialAddress);
  const [clientId, setClientId] = useState(contact.clientId ?? "");
  const [ownerStaffId, setOwnerStaffId] = useState(contact.ownerStaffId);
  const [referral, setReferral] = useState(contact.isReferralPartner);
  const [listingWatchUrl, setListingWatchUrl] = useState(contact.listingWatchUrl ?? "");
  const [listingWatchEnabled, setListingWatchEnabled] = useState(Boolean(contact.listingWatchEnabled));
  const [saving, setSaving] = useState(false);

  const phoneMoved = phoneMovedFrom(contact.phone, phone);
  const addressChanged = address.trim() !== initialAddress.trim();
  const dirty =
    name.trim() !== contact.name.trim() ||
    (title.trim() || "Homeowner") !== (contact.title.trim() || "Homeowner") ||
    email.trim() !== contact.email.trim() ||
    formatPhoneInput(phone) !== formatPhoneInput(contact.phone) ||
    addressChanged ||
    (clientId || "") !== (contact.clientId ?? "") ||
    (owners.length > 0 && ownerStaffId !== contact.ownerStaffId) ||
    referral !== contact.isReferralPartner ||
    (referral ? listingWatchUrl.trim() !== (contact.listingWatchUrl ?? "").trim() : false) ||
    (referral ? listingWatchEnabled !== Boolean(contact.listingWatchEnabled) : false);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const field = document.getElementById("contact-edit-name");
    if (field instanceof HTMLInputElement) field.focus();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      toast.error("A name is required.");
      return;
    }
    if (addressChanged && !site.jobId && !site.opportunityId) {
      toast.error("Add a job before saving an address on this contact.");
      return;
    }
    setSaving(true);
    try {
      const ok = await crm.updateContact(contact.id, {
        name: nextName,
        title: title.trim() || "Homeowner",
        email: email.trim(),
        phone: phone.trim(),
        clientId: clientId || null,
        ownerStaffId: ownerStaffId || contact.ownerStaffId,
        isReferralPartner: referral,
        listingWatchUrl: referral ? listingWatchUrl.trim() : "",
        listingWatchEnabled: referral ? listingWatchEnabled : false,
      });
      if (!ok) return;
      if (addressChanged) {
        const parsed = parseLocation(address.trim());
        const patch = {
          street: parsed.street,
          city: parsed.city,
          state: parsed.state,
          postalCode: parsed.postalCode,
          location: address.trim(),
        };
        const wroteJob = site.jobId ? await crm.updateJob(site.jobId, patch) : true;
        const wroteLead = site.opportunityId ? await crm.updateOpportunity(site.opportunityId, patch) : true;
        if (!wroteJob || !wroteLead) {
          toast.error("Saved the contact, but the address did not update.");
          return;
        }
      }
      toast.success(`Saved ${nextName}`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const companies = [...crm.clients].sort((left, right) => left.name.localeCompare(right.name));
  if (clientId && !companies.some((company) => company.id === clientId)) {
    const current = crm.getClient(clientId);
    if (current) companies.unshift(current);
  }

  return (
    <form
      aria-label="Edit contact"
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || saving) return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-[#6e6e73]">Editing contact</h3>
        {dirty ? (
          <span className="text-xs font-medium text-primary" role="status">
            Unsaved changes
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 rounded-xl border border-primary/70 bg-white p-3.5">
        <EditorField label="Name" htmlFor="contact-edit-name">
          <Input
            id="contact-edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className={cn("h-9", controlClass)}
          />
        </EditorField>
        <div className="grid gap-3 sm:grid-cols-2">
          <EditorField label="Title" htmlFor="contact-edit-title">
            <Input
              id="contact-edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Homeowner"
              className={cn("h-9", controlClass)}
            />
          </EditorField>
          <EditorField label="Mobile" htmlFor="contact-edit-phone">
            <PhoneInput
              id="contact-edit-phone"
              value={phone}
              onValueChange={setPhone}
              placeholder="(214) 555-0100"
              className={cn("h-9", controlClass)}
            />
          </EditorField>
        </div>
        <EditorField label="Email" htmlFor="contact-edit-email">
          <Input
            id="contact-edit-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={cn("h-9", controlClass)}
          />
        </EditorField>
        <EditorField label="Address" htmlFor="contact-edit-address">
          <Textarea
            id="contact-edit-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={2}
            className={cn("field-sizing-fixed min-h-16 resize-y", controlClass)}
          />
        </EditorField>
        <EditorField label="Company" htmlFor="contact-edit-company">
          <select
            id="contact-edit-company"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className={cn("h-9 px-3", controlClass)}
          >
            <option value="">None — homeowner / DTC</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </EditorField>
        {owners.length > 0 ? (
          <EditorField label="Book owner" htmlFor="contact-edit-owner">
            <LeadAssigneeSelect
              id="contact-edit-owner"
              value={ownerStaffId}
              people={owners}
              onChange={setOwnerStaffId}
              className={cn("h-9 rounded-lg px-3", controlClass)}
            />
          </EditorField>
        ) : null}
        <label className="flex items-start gap-2.5 text-sm text-[#1d1d1f]">
          <Checkbox
            className="mt-0.5"
            checked={referral}
            onCheckedChange={(value) => setReferral(value === true)}
          />
          <span>
            <span className="font-medium">Referral partner</span>
            <span className="mt-0.5 block text-xs leading-snug font-normal text-[#6e6e73]">
              Realtor, adjuster, or specifier in this seat’s book
            </span>
          </span>
        </label>
        {referral ? (
          <div className="grid gap-3">
            <EditorField label="Listing watch URL" htmlFor="contact-edit-listing-watch">
              <Input
                id="contact-edit-listing-watch"
                value={listingWatchUrl}
                onChange={(event) => setListingWatchUrl(event.target.value)}
                placeholder="https://www.zillow.com/..."
                className={cn("h-9", controlClass)}
              />
            </EditorField>
            <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
              <Checkbox
                checked={listingWatchEnabled}
                onCheckedChange={(value) => setListingWatchEnabled(value === true)}
              />
              Watch listings daily
            </label>
          </div>
        ) : null}
        {phoneMoved ? (
          <p className="rounded-lg bg-[#fdf0e6] px-3 py-2.5 text-[13px] leading-snug text-[#8a4b12]">
            Text history from the old number stays on this contact.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-0.5">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg border-[rgba(28,25,22,0.12)] bg-white"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" className="rounded-lg" disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save contact"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function phoneMovedFrom(previous: string, next: string) {
  const before = digitsOnly(previous);
  const after = digitsOnly(next);
  return Boolean(before) && before !== after;
}

function EditorField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-[#6e6e73]">
        {label}
      </label>
      {children}
    </div>
  );
}
