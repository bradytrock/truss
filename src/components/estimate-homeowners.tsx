"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
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
import { useCrm } from "@/lib/crm-store";
import { formatPhone, initials } from "@/lib/format";
import { jobPaperHref } from "@/lib/job-record";
import {
  canAddSecondHomeowner,
  homeownersOnJob,
  relatedContactIdsWithHomeowner,
  secondHomeownerDraft,
} from "@/lib/parties";
import type { Contact, Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function EstimateHomeowners({
  job,
  primaryId,
  disabled,
  className,
}: {
  job?: Job;
  primaryId?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const crm = useCrm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const people = homeownersOnJob(job, crm.contacts);
  const primary = (primaryId || job?.primaryContactId || "").trim();
  const ordered = [...people].sort((left, right) => {
    if (left.id === primary && right.id !== primary) return -1;
    if (right.id === primary && left.id !== primary) return 1;
    return left.name.localeCompare(right.name);
  });
  const showAdd = Boolean(job && !disabled && canAddSecondHomeowner(job, crm.contacts));

  async function addSecond(event: FormEvent) {
    event.preventDefault();
    if (!job) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter the second homeowner’s name.");
      return;
    }
    setSaving(true);
    try {
      const primaryContact = primary ? crm.getContact(primary) : undefined;
      const created = await crm.addContact(
        secondHomeownerDraft({
          name: trimmed,
          phone,
          email,
          clientId: primaryContact?.clientId ?? job.clientId ?? null,
          ownerStaffId: primaryContact?.ownerStaffId || crm.user.staffId,
        }),
      );
      const ok = await crm.updateJob(job.id, {
        relatedContactIds: relatedContactIdsWithHomeowner(job.relatedContactIds, created.id),
      });
      if (!ok) return;
      toast.success(`${created.name} is on this job and will sign as the second homeowner.`);
      setOpen(false);
      setName("");
      setPhone("");
      setEmail("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that homeowner.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={cn("rounded-[12px] border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Homeowners</h2>
        {job ? (
          <Link
            href={jobPaperHref(job.id)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open job
          </Link>
        ) : null}
      </div>
      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {job
            ? "This job does not have a homeowner yet. Add them on the job record — they will show up here."
            : "Attach this proposal to a job to pull the homeowner."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {ordered.map((person) => (
            <HomeownerRow key={person.id} person={person} primary={person.id === primary} />
          ))}
        </ul>
      )}
      {showAdd ? (
        <div className="mt-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            <UserPlus data-icon="inline-start" />
            Add co-signer
          </Button>
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void addSecond(event)}>
            <DialogHeader>
              <DialogTitle>Add second homeowner</DialogTitle>
              <DialogDescription>
                Adds them to this job. They get their own signing link on this proposal. The original
                homeowner stays primary.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-3">
              <div>
                <Label htmlFor="second-homeowner-name">Name</Label>
                <Input
                  id="second-homeowner-name"
                  value={name}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Jordan Alvarez"
                />
              </div>
              <div>
                <Label htmlFor="second-homeowner-phone">Phone</Label>
                <Input
                  id="second-homeowner-phone"
                  value={phone}
                  autoComplete="tel"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(214) 555-0101"
                />
              </div>
              <div>
                <Label htmlFor="second-homeowner-email">Email</Label>
                <Input
                  id="second-homeowner-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="jordan@email.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
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

function HomeownerRow({ person, primary }: { person: Contact; primary: boolean }) {
  const bits = [
    person.phone.trim() ? formatPhone(person.phone) : null,
    person.email.trim() || null,
  ].filter(Boolean);
  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground"
        aria-hidden
      >
        {initials(person.name)}
      </span>
      <span className="min-w-0">
        <p className="truncate text-sm font-medium">
          {person.name}
          <span className="ml-1.5 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            {primary ? "Primary" : "Co-owner"}
          </span>
        </p>
        {bits.length > 0 ? (
          <p className="truncate text-xs text-muted-foreground">{bits.join(" · ")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No phone or email on file</p>
        )}
      </span>
    </li>
  );
}
