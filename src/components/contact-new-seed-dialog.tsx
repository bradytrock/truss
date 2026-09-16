"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AddressStreetField } from "@/components/address-street-field";
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
  contactSeedLeadName,
  contactSeedLeadSource,
  hasJobSite,
  previousJobForContact,
  previousJobSite,
  previousJobSiteLabel,
  resolveContactSeedSite,
  type JobSiteFields,
} from "@/lib/contact-seed";
import { useCrm } from "@/lib/crm-store";
import { localYmd } from "@/lib/format";
import { DEFAULT_LEAD_STATE, defaultDeliveryForSource, formatJobSite } from "@/lib/leads";
import { projectTypeForMarket } from "@/lib/market";
import type { Contact } from "@/lib/types";
import { cn } from "@/lib/utils";

const emptySite = (): JobSiteFields => ({
  street: "",
  city: "",
  state: DEFAULT_LEAD_STATE,
  postalCode: "",
});

export function ContactNewSeedDialog({
  contact,
  open,
  onOpenChange,
}: {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const previousJob = useMemo(
    () => (contact ? previousJobForContact(contact, crm.jobs) : null),
    [contact, crm.jobs],
  );
  const previous = previousJobSite(previousJob);
  const previousLabel = previousJobSiteLabel(previousJob);
  const canReuse = hasJobSite(previous);

  const [sameAsPrevious, setSameAsPrevious] = useState(true);
  const [next, setNext] = useState<JobSiteFields>(emptySite);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSameAsPrevious(canReuse);
    setNext(emptySite());
  }, [open, canReuse, contact?.id]);

  function patchNext(partial: Partial<JobSiteFields>) {
    setNext((current) => ({ ...current, ...partial }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!contact) return;
    const resolved = resolveContactSeedSite({
      hasPreviousSite: canReuse,
      sameAsPrevious: canReuse && sameAsPrevious,
      previous,
      next,
    });
    if (resolved.blocked) {
      toast.error(resolved.blocked);
      return;
    }
    const site = resolved.site;
    const source = contactSeedLeadSource(previousJob);
    setSaving(true);
    try {
      const opportunity = await crm.addOpportunity({
        name: contactSeedLeadName(contact.name, site),
        clientId: contact.clientId,
        primaryContactId: contact.id,
        stage: "pursuing",
        value: 0,
        bidDueAt: null,
        preBidWalkAt: null,
        location: formatJobSite(site) || "Address TBD",
        projectType: projectTypeForMarket(previousJob?.market ?? "residential"),
        market: previousJob?.market ?? "residential",
        deliveryMethod: defaultDeliveryForSource(source),
        estimator: crm.user.name,
        ownerStaffId: contact.ownerStaffId || crm.user.staffId,
        originatorStaffId: crm.user.staffId,
        nextStep: "Call back within 5 minutes.",
        leadSource: source,
        referralContactId: null,
        street: site.street,
        city: site.city,
        state: site.state,
        postalCode: site.postalCode,
        notes: "",
      });
      await crm.addActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        body: `Seed opened from Contacts for ${contact.name} at ${formatJobSite(site)}.`,
      });
      await crm.addTask({
        title: `Call ${contact.name} back`,
        dueAt: localYmd(new Date()),
        relatedType: "opportunity",
        relatedId: opportunity.id,
        assignee: crm.user.name,
      });
      toast.success(`Seed opened: ${opportunity.code}.`);
      onOpenChange(false);
    } catch {
      // Store already toasted.
    } finally {
      setSaving(false);
    }
  }

  const showNewAddress = !canReuse || !sameAsPrevious;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New seed</DialogTitle>
          <DialogDescription>
            Opens a seed for {contact?.name || "this contact"} using their phone and email.
            {canReuse
              ? " Use the last job address or enter a new one."
              : " Enter the job site address."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3">
          {canReuse ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Job site</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice
                  selected={sameAsPrevious}
                  title="Same address"
                  detail={previousLabel}
                  onClick={() => setSameAsPrevious(true)}
                />
                <Choice
                  selected={!sameAsPrevious}
                  title="New address"
                  detail="Type the new job site."
                  onClick={() => setSameAsPrevious(false)}
                />
              </div>
            </div>
          ) : null}

          {showNewAddress ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="seed-street">Street</Label>
                <AddressStreetField
                  id="seed-street"
                  street={next.street}
                  city={next.city}
                  state={next.state}
                  withPin
                  onStreetChange={(street) => patchNext({ street })}
                  onPick={(address) =>
                    patchNext({
                      street: address.street,
                      city: address.city,
                      state: address.state || DEFAULT_LEAD_STATE,
                      postalCode: address.postalCode,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="seed-city">City</Label>
                  <Input
                    id="seed-city"
                    value={next.city}
                    onChange={(event) => patchNext({ city: event.target.value })}
                    placeholder="City"
                    autoComplete="address-level2"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="seed-state">State</Label>
                  <Input
                    id="seed-state"
                    value={next.state}
                    onChange={(event) =>
                      patchNext({ state: event.target.value.toUpperCase().slice(0, 2) })
                    }
                    placeholder="ST"
                    autoComplete="address-level1"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="seed-zip">ZIP</Label>
                  <Input
                    id="seed-zip"
                    value={next.postalCode}
                    onChange={(event) => patchNext({ postalCode: event.target.value })}
                    placeholder="12345"
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{previousLabel}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !contact}>
              {saving ? "Opening…" : "Open seed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  selected,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "rounded-md border px-3 py-2.5 text-left transition-colors",
        selected ? "border-foreground/40 bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
