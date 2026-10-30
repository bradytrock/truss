"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Plus, XIcon } from "lucide-react";
import { toast } from "sonner";
import { PhoneInput } from "@/components/phone-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPhone } from "@/lib/format";
import { uniqueIds } from "@/lib/job-record";
import { isJobHomeowner } from "@/lib/parties";
import { contactMatchesQuery, formatPhoneInput } from "@/lib/phone";
import type { Contact, Job } from "@/lib/types";
import { cn } from "@/lib/utils";

const MATCH_LIMIT = 8;

export type NewRelatedContact = {
  name: string;
  phone: string;
  email: string;
  title: string;
  isReferralPartner: boolean;
};

export type RelatedContactCreateResult = "added" | "created" | "failed";

function contactById(contacts: Contact[], id: string) {
  return contacts.find((contact) => contact.id === id) ?? null;
}

function contactKind(contact: Contact, job: Job) {
  const title = contact.title ?? "";
  if (job.subcontractorIds?.includes(contact.id)) return "Trade";
  if (contact.isReferralPartner) return title.toLowerCase().includes("adjuster") ? "Adjuster" : "Referral";
  if (title.toLowerCase().includes("adjuster")) return "Adjuster";
  if (contact.clientId) return title || "Company";
  return title || "Homeowner";
}

function peopleOnJob(job: Job) {
  return uniqueIds([...(job.relatedContactIds ?? []), ...(job.subcontractorIds ?? [])]).filter(
    (id) => id !== (job.primaryContactId ?? "").trim(),
  );
}

export function JobRelatedContacts({
  job,
  contacts,
  deleted = false,
  onAdd,
  onRemove,
  onCreate,
  onMakePrimary,
}: {
  job: Job;
  contacts: Contact[];
  deleted?: boolean;
  onAdd: (contactId: string) => Promise<boolean>;
  onRemove: (contactId: string) => Promise<boolean>;
  onCreate: (input: NewRelatedContact) => Promise<RelatedContactCreateResult>;
  onMakePrimary: (contactId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [referral, setReferral] = useState(false);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    return peopleOnJob(job).map((id) => ({
      id,
      contact: contactById(contacts, id),
    }));
  }, [contacts, job]);

  const { matches, hiddenCount, candidateCount } = useMemo(() => {
    const taken = new Set(peopleOnJob(job));
    const primary = (job.primaryContactId ?? "").trim();
    if (primary) taken.add(primary);
    const candidates = contacts
      .filter((contact) => contact.id && !taken.has(contact.id))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    const filtered = query.trim()
      ? candidates.filter((contact) => contactMatchesQuery(contact, query))
      : candidates;
    return {
      matches: filtered.slice(0, MATCH_LIMIT),
      hiddenCount: Math.max(0, filtered.length - MATCH_LIMIT),
      candidateCount: candidates.length,
    };
  }, [contacts, job, query]);

  function resetDraft() {
    setName("");
    setPhone("");
    setEmail("");
    setTitle("");
    setReferral(false);
  }

  async function addExisting(contactId: string) {
    if (deleted) return;
    const contact = contactById(contacts, contactId);
    const ok = await onAdd(contactId);
    if (!ok) return;
    setPickerOpen(false);
    setQuery("");
    toast.success(contact?.name ? `${contact.name} is on this job.` : "Contact added.");
  }

  async function removeRelated(contactId: string) {
    if (deleted) return;
    const contact = contactById(contacts, contactId);
    const ok = await onRemove(contactId);
    if (!ok) return;
    toast.success(contact?.name ? `${contact.name} was removed from this job.` : "Contact removed.");
  }

  function openCreate() {
    const typed = query.trim();
    const digits = typed.replace(/\D/g, "");
    setPickerOpen(false);
    setQuery("");
    resetDraft();
    if (typed.includes("@")) setEmail(typed);
    else if (digits.length >= 3 && !/[a-z]/i.test(typed)) setPhone(formatPhoneInput(typed));
    else setName(typed);
    setCreateOpen(true);
  }

  async function createAndAdd(event: FormEvent) {
    event.preventDefault();
    if (deleted || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a name.");
      return;
    }
    setSaving(true);
    try {
      const result = await onCreate({
        name: trimmed,
        phone: phone.trim(),
        email: email.trim(),
        title: title.trim(),
        isReferralPartner: referral,
      });
      if (result === "failed") return;
      setCreateOpen(false);
      resetDraft();
      if (result === "added") toast.success(`${trimmed} is on this job.`);
    } catch {
      // The caller reports create failures.
    } finally {
      setSaving(false);
    }
  }

  const typed = query.trim();

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Related contacts
        </p>
        {deleted ? null : (
          <Popover
            open={pickerOpen}
            onOpenChange={(open) => {
              setPickerOpen(open);
              if (!open) setQuery("");
            }}
          >
            <PopoverTrigger
              className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }))}
              aria-label="Add a related contact"
            >
              <Plus />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-0 p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search name, phone, or email"
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  {matches.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                      {typed
                        ? "No one matches."
                        : contacts.length === 0
                          ? "No contacts in the book yet."
                          : candidateCount === 0
                            ? "Everyone in the book is already on this job."
                            : "No other contacts in the book."}
                    </p>
                  ) : (
                    <CommandGroup>
                      {matches.map((contact) => (
                        <CommandItem
                          key={contact.id}
                          value={`${contact.id} ${contact.name}`}
                          onSelect={() => void addExisting(contact.id)}
                        >
                          <span className="min-w-0 flex-1 truncate">{contact.name}</span>
                          <span className="max-w-28 truncate text-xs text-muted-foreground">
                            {contact.title || (contact.phone ? formatPhone(contact.phone) : contact.email)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {hiddenCount > 0 ? (
                    <p className="px-3 pb-2 text-xs text-muted-foreground">
                      {hiddenCount} more. Keep typing to narrow the list.
                    </p>
                  ) : null}
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem value="new-contact" onSelect={openCreate}>
                      <Plus />
                      {typed ? `New contact “${typed}”` : "New contact"}
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No related contacts on this job yet.</p>
      ) : (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-[12px] border bg-card">
          {rows.map((row) => (
            <RelatedContactRow
              key={row.id}
              job={job}
              contact={row.contact}
              deleted={deleted}
              onRemove={() => void removeRelated(row.id)}
              onMakePrimary={() => onMakePrimary(row.id)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetDraft();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void createAndAdd(event)}>
            <DialogHeader>
              <DialogTitle>Add a related contact</DialogTitle>
              <DialogDescription>
                Creates the person in the contact book and puts them on this job. The homeowner stays primary.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <div>
                <Label htmlFor="related-contact-name">Name</Label>
                <Input
                  id="related-contact-name"
                  value={name}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Jordan Alvarez"
                />
              </div>
              <div>
                <Label htmlFor="related-contact-phone">Phone</Label>
                <PhoneInput
                  id="related-contact-phone"
                  value={phone}
                  onValueChange={setPhone}
                  placeholder="(214) 555-0101"
                />
              </div>
              <div>
                <Label htmlFor="related-contact-email">Email</Label>
                <Input
                  id="related-contact-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="jordan@email.com"
                />
              </div>
              <div>
                <Label htmlFor="related-contact-title">Role</Label>
                <Input
                  id="related-contact-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Spouse, realtor, adjuster"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={referral}
                  onCheckedChange={(value) => setReferral(Boolean(value))}
                />
                Referral partner
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Adding…" : "Add to job"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RelatedContactRow({
  job,
  contact,
  deleted,
  onRemove,
  onMakePrimary,
}: {
  job: Job;
  contact: Contact | null;
  deleted: boolean;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  const label = contact?.name?.trim() || "Unknown contact";
  const canMakePrimary = Boolean(contact && !deleted && isJobHomeowner(contact, job));
  return (
    <li className="flex items-start gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        {contact ? (
          <Link
            href={`/contacts?contact=${contact.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {label}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{label}</p>
        )}
        {contact ? (
          <p className="truncate text-xs text-muted-foreground">
            {contactKind(contact, job)}
            {contact.phone ? (
              <>
                {" · "}
                <a href={`tel:${contact.phone}`} className="hover:underline">
                  {formatPhone(contact.phone)}
                </a>
              </>
            ) : contact.email ? (
              <>
                {" · "}
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              </>
            ) : null}
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">Not in the contact book</p>
        )}
        {contact?.phone || canMakePrimary ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
            {contact?.phone ? (
              <Link href={`/messages?job=${job.id}&contact=${contact.id}`} className="font-medium hover:underline">
                Text
              </Link>
            ) : null}
            {canMakePrimary ? (
              <button type="button" className="font-medium text-primary hover:underline" onClick={onMakePrimary}>
                Make primary
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {deleted ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          <XIcon />
        </Button>
      )}
    </li>
  );
}
