"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Clock, Home, Search } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { AddressStreetField } from "@/components/address-street-field";
import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import { moneyAmount } from "@/lib/money-input";
import {
  QuickFooter,
  QuickHeader,
  QuickHint,
  QuickLabel,
  QuickSection,
  Segmented,
  TogglePills,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
} from "@/components/quick-action-form";
import { toggleTrade } from "@/components/trades-field";
import { LeadAssigneeSelect } from "@/components/lead-assignee";
import { useCrm } from "@/lib/crm-store";
import { formatPhone, initials, localYmd } from "@/lib/format";
import {
  DEFAULT_LEAD_STATE,
  defaultDeliveryForSource,
  formatJobSite,
  leadName,
  leadNeedsReferrer,
  matchReferralPartners,
} from "@/lib/leads";
import { projectTypeForMarket } from "@/lib/market";
import {
  JOB_MARKET_LABELS,
  JOB_MARKETS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  TRADE_LABELS,
  type ClientType,
  type Contact,
  type JobMarket,
  type LeadSource,
  SEAT_ROLE_LABELS,
  type Trade,
} from "@/lib/types";
import { assignmentOptions, companyLeadAssignees } from "@/lib/visibility";
import { hasBusinessDevelopmentSeat } from "@/lib/bd";
import { phonesMatch } from "@/lib/job-messages";
import { formatPhoneInput } from "@/lib/phone";
import {
  assignsToPreviousPm,
  emailsMatch,
  findReturningClient,
  returningClientBannerTitle,
  returningClientWhen,
  type ReturningClientMatch,
} from "@/lib/returning-client";

export function CreateOpportunityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const crm = useCrm();
  const people = companyLeadAssignees(crm.viewer, crm.book.staff, crm.user.staffId);
  const defaultAssignee = people.find((member) => member.id === crm.user.staffId)?.id ?? people[0]?.id ?? "";
  const bdSeat = hasBusinessDevelopmentSeat(crm.viewer, crm.user.role);
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState(DEFAULT_LEAD_STATE);
  const [postalCode, setPostalCode] = useState("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [market, setMarket] = useState<JobMarket>("residential");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [referralId, setReferralId] = useState("");
  const [referralQuery, setReferralQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const assignee = people.find((member) => member.id === assigneeId);
  const isMe = Boolean(assignee && assignee.id === crm.user.staffId);
  const returning = useMemo(() => {
    if (!phone.trim() && !email.trim()) return null;
    return findReturningClient({
      phone,
      email,
      contacts: crm.book.contacts,
      jobs: crm.book.jobs,
      opportunities: crm.book.opportunities,
      staff: crm.book.staff,
      estimates: crm.book.estimates,
    });
  }, [phone, email, crm.book.contacts, crm.book.jobs, crm.book.opportunities, crm.book.staff, crm.book.estimates]);

  useEffect(() => {
    if (!open) return;
    if (assigneeId && people.some((member) => member.id === assigneeId)) return;
    if (defaultAssignee) setAssigneeId(defaultAssignee);
  }, [assigneeId, defaultAssignee, open, people]);

  const referralMatches = useMemo(
    () => matchReferralPartners(crm.contacts, referralQuery),
    [crm.contacts, referralQuery],
  );
  const referralPartnerCount = useMemo(
    () => crm.contacts.filter((contact) => contact.isReferralPartner).length,
    [crm.contacts],
  );

  const selectedReferral = crm.contacts.find((contact) => contact.id === referralId);

  function reset() {
    setAssigneeId(defaultAssignee);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setStreet("");
    setCity("");
    setRegion(DEFAULT_LEAD_STATE);
    setPostalCode("");
    setSource("");
    setEstimatedValue("");
    setMarket("residential");
    setTrades([]);
    setReferralId("");
    setReferralQuery("");
    setNotes("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    else setAssigneeId(defaultAssignee);
    onOpenChange(next);
  }

  async function openLead(ownerStaffId: string) {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!source) {
      toast.error("Pick a seed.");
      return;
    }
    const site = formatJobSite({ street, city, state: region, postalCode });
    const fullName = `${first} ${last}`;
    const owner = people.find((member) => member.id === ownerStaffId) ?? crm.viewer;
    const match = returning;
    setSaving(true);
    try {
      const existingContact =
        match?.contact ??
        (phone.trim()
          ? crm.book.contacts.find((contact) => phonesMatch(contact.phone, phone.trim()))
          : undefined) ??
        (email.trim()
          ? crm.book.contacts.find((contact) => emailsMatch(contact.email, email.trim()))
          : undefined);
      let contact = existingContact;
      if (!contact) {
        contact = await crm.addContact({
          clientId: null,
          name: fullName,
          title: "Homeowner",
          email: email.trim(),
          phone: phone.trim(),
          ownerStaffId: owner?.id || crm.user.staffId,
          isReferralPartner: false,
          listingWatchUrl: "",
          listingWatchEnabled: false,
        });
      } else {
        await crm.updateContact(contact.id, {
          email: email.trim() || contact.email,
          phone: phone.trim() || contact.phone,
          ownerStaffId: owner?.id || contact.ownerStaffId,
        });
      }
      const pipelineValue = Math.max(0, moneyAmount(estimatedValue) ?? 0);
      const opportunity = await crm.addOpportunity({
        name: leadName(first, last, site || city.trim()),
        clientId: null,
        primaryContactId: contact.id,
        stage: "pursuing",
        value: pipelineValue,
        bidDueAt: null,
        preBidWalkAt: null,
        location: site || city.trim() || "Address TBD",
        projectType: projectTypeForMarket(market),
        market,
        deliveryMethod: defaultDeliveryForSource(source),
        estimator: owner?.name || crm.user.name,
        ownerStaffId: owner?.id,
        originatorStaffId: crm.user.staffId,
        nextStep: "Call back within 5 minutes.",
        leadSource: source,
        referralContactId: leadNeedsReferrer(source) ? referralId : null,
        street: street.trim(),
        city: city.trim(),
        state: region.trim(),
        postalCode: postalCode.trim(),
        notes: notes.trim(),
      });
      if (trades.length && opportunity.costingJob?.id) {
        void crm.updateJob(opportunity.costingJob.id, { trades }).catch(() => undefined);
      }
      const referrer = leadNeedsReferrer(source) ? selectedReferral : undefined;
      const returningNote = match
        ? match.job
          ? ` Returning client: ${match.contact.name}. ${match.previousStaffName || "Previous project manager"} ran ${match.job.code}. ${returningClientWhen(match)}.`
          : ` Returning client: ${match.contact.name} is already in the book.`
        : "";
      void crm.addActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        body: [
          `Lead opened for ${fullName}. Seed: ${LEAD_SOURCE_LABELS[source]}.`,
          referrer ? `Referred by ${referrer.name}.` : "",
          notes.trim() ? notes.trim() : "",
          returningNote.trim(),
        ]
          .filter(Boolean)
          .join(" "),
      });
      void crm.addTask({
        title: `Call ${fullName} back`,
        dueAt: localYmd(new Date()),
        relatedType: "opportunity",
        relatedId: opportunity.id,
        assignee: owner?.name || crm.user.name,
      });
      if (match) {
        void crm
          .fileReturningClientNotice({
            opportunityId: opportunity.id,
            jobId: opportunity.costingJob?.id ?? null,
            contactId: contact.id,
            previous: match,
            assigneeId: owner?.id,
          })
          .catch(() => undefined);
      }
      if (match && assignsToPreviousPm(match, owner?.id)) {
        toast.success(`Lead opened: ${opportunity.code}. Assigned to ${match.previousStaffName}, who ran the last job.`);
      } else {
        toast.success(`Lead opened: ${opportunity.code}. Costs post to this job.`);
      }
      handleOpenChange(false);
    } catch {
      // Store already toasted the error.
    } finally {
      setSaving(false);
    }
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
      toast.error("Pick a seed.");
      return;
    }
    if (leadNeedsReferrer(source) && !referralId) {
      toast.error("Choose the referral partner who sent this lead.");
      return;
    }
    const owner = assignee ?? crm.viewer;
    await openLead(owner?.id || crm.user.staffId);
  }

  const tradeOrder: Trade[] = ["roofing", "gutters", "siding", "fencing", "flooring", "other"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={quickDialogClass("lg")}>
        <QuickHeader tone="rose" icon={<Home className="size-5" />} title="New lead" />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-4 px-5 py-4`}>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm">
              <Clock className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-950">Respond within 5 minutes</p>
                <p className="text-amber-900/80">
                  Your company requires a first response within 5 minutes of saving this lead.
                </p>
              </div>
            </div>

            <div>
              <QuickLabel>Property type</QuickLabel>
              <Segmented
                label="Property type"
                value={market}
                onChange={setMarket}
                options={JOB_MARKETS.map((item) => ({ value: item, label: JOB_MARKET_LABELS[item] }))}
              />
              <QuickHint>
                {market === "residential"
                  ? "Residential work isn’t taxed."
                  : "Commercial proposals include sales tax."}
              </QuickHint>
            </div>

            <div>
              <QuickLabel>
                Trades <span className="font-normal text-muted-foreground">· pick all that apply</span>
              </QuickLabel>
              <TogglePills
                label="Trades"
                value={trades}
                onToggle={(trade) => setTrades(toggleTrade(trades, trade))}
                options={tradeOrder.map((trade) => ({ value: trade, label: TRADE_LABELS[trade] }))}
              />
            </div>

            <QuickSection>Homeowner</QuickSection>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <QuickLabel htmlFor="lead-first" required>First name</QuickLabel>
                <Input
                  id="lead-first"
                  className={quickFieldClass}
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                />
              </div>
              <div>
                <QuickLabel htmlFor="lead-last">Last name</QuickLabel>
                <Input
                  id="lead-last"
                  className={quickFieldClass}
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div>
              <QuickLabel htmlFor="lead-phone" required>Phone</QuickLabel>
              <PhoneInput
                id="lead-phone"
                className={quickFieldClass}
                value={phone}
                onValueChange={setPhone}
                placeholder="(214) 555-0100"
              />
            </div>
            <div>
              <QuickLabel htmlFor="lead-email" optional>Email</QuickLabel>
              <Input
                id="lead-email"
                className={quickFieldClass}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </div>

            {returning ? (
              <div className="grid gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-sm font-medium">{returningClientBannerTitle(returning)}</p>
                <ReturningClientFacts match={returning} assigneeName={assignee?.name} />
                <p className="text-sm text-muted-foreground">
                  {assignsToPreviousPm(returning, assigneeId)
                    ? "This lead will stay with that project manager."
                    : `${returning.previousStaffName || "The previous project manager"} ran the last job. Saving creates this job and notifies company admins.`}
                </p>
              </div>
            ) : null}

            <QuickSection>Property</QuickSection>
            <div>
              <QuickLabel htmlFor="lead-street">Address</QuickLabel>
              <AddressStreetField
                id="lead-street"
                street={street}
                city={city}
                state={region}
                withPin
                onStreetChange={setStreet}
                onPick={(address) => {
                  setStreet(address.street);
                  setCity(address.city);
                  setRegion(address.state || DEFAULT_LEAD_STATE);
                  setPostalCode(address.postalCode);
                }}
                placeholder="Start typing an address"
              />
              <QuickHint>Picking a suggestion fills city, state and ZIP.</QuickHint>
            </div>
            <div className="grid grid-cols-[1fr_4.5rem_6rem] gap-3">
              <div>
                <QuickLabel htmlFor="lead-city">City</QuickLabel>
                <Input
                  id="lead-city"
                  className={quickFieldClass}
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  autoComplete="address-level2"
                />
              </div>
              <div>
                <QuickLabel htmlFor="lead-state">State</QuickLabel>
                <Input
                  id="lead-state"
                  className={quickFieldClass}
                  value={region}
                  onChange={(event) => setRegion(event.target.value.toUpperCase().slice(0, 2))}
                  placeholder="TX"
                  autoComplete="address-level1"
                />
              </div>
              <div>
                <QuickLabel htmlFor="lead-zip">ZIP</QuickLabel>
                <Input
                  id="lead-zip"
                  className={quickFieldClass}
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  autoComplete="postal-code"
                />
              </div>
            </div>

            <QuickSection>Routing</QuickSection>
            <div>
              <QuickLabel>Seed</QuickLabel>
              <Select
                value={source || null}
                onValueChange={(value) => {
                  const next = String(value ?? "") as LeadSource | "";
                  setSource(next);
                  if (!leadNeedsReferrer(next)) {
                    setReferralId("");
                    setReferralQuery("");
                  }
                }}
                items={LEAD_SOURCES.map((item) => ({
                  value: item,
                  label: LEAD_SOURCE_LABELS[item],
                }))}
              >
                <SelectTrigger className={`${quickFieldClass} w-full`}>
                  <SelectValue placeholder="Where did this lead come from?" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {LEAD_SOURCE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bdSeat && source ? (
              <div>
                <QuickLabel htmlFor="lead-estimated-value">Estimated value</QuickLabel>
                <CurrencyInput
                  id="lead-estimated-value"
                  className={quickFieldClass}
                  value={estimatedValue}
                  onValueChange={setEstimatedValue}
                  placeholder="$0.00"
                />
                <QuickHint>
                  Pipeline value for this lead. When a project manager prices an estimate, the job
                  value updates from that proposal.
                </QuickHint>
              </div>
            ) : null}

            {leadNeedsReferrer(source) ? (
              <div>
                <QuickLabel htmlFor="lead-referral" required>Who sent this referral</QuickLabel>
                {selectedReferral ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selectedReferral.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedReferral.title || "Referral partner"}
                        {selectedReferral.phone ? ` · ${formatPhone(selectedReferral.phone)}` : ""}
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
                    <InputGroup className="h-10 rounded-lg bg-white">
                      <InputGroupAddon>
                        <Search />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="lead-referral"
                        value={referralQuery}
                        onChange={(event) => setReferralQuery(event.target.value)}
                        placeholder="Search referral partners"
                      />
                    </InputGroup>
                    {referralPartnerCount === 0 ? (
                      <QuickHint>
                        No referral partners in the contact book yet. Add the realtor or partner as a contact
                        and mark them as a referral partner.
                      </QuickHint>
                    ) : referralMatches.length === 0 ? (
                      <QuickHint>No matching referral partners.</QuickHint>
                    ) : (
                      <ul className="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border">
                        {referralMatches.map((contact) => (
                          <li key={contact.id}>
                            <button
                              type="button"
                              className="flex w-full flex-col items-start px-2.5 py-2 text-left hover:bg-muted/60"
                              onClick={() => setReferralId(contact.id)}
                            >
                              <span className="text-sm font-medium">{contact.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {contact.title || "Referral partner"}
                                {contact.phone ? ` · ${formatPhone(contact.phone)}` : ""}
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

            <div>
              <QuickLabel
                aside={
                  people.some((member) => member.id === crm.user.staffId) ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary"
                      onClick={() => setAssigneeId(crm.user.staffId)}
                    >
                      Assign to me
                    </button>
                  ) : null
                }
              >
                Assigned to
              </QuickLabel>
              <Select
                value={assigneeId || null}
                onValueChange={(value) => setAssigneeId(String(value ?? ""))}
                items={people.map((member) => ({
                  value: member.id,
                  label: `${member.name}${member.id === crm.user.staffId ? " (you)" : ""} · ${SEAT_ROLE_LABELS[member.role]}`,
                }))}
              >
                <SelectTrigger className="h-10 w-full rounded-lg bg-white data-[size=default]:h-10">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-900 text-[10px] font-medium text-white">
                      {initials(assignee?.name || "")}
                    </span>
                    <SelectValue placeholder="Assign someone" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {people.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                      {member.id === crm.user.staffId ? " (you)" : ""} · {SEAT_ROLE_LABELS[member.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bdSeat && !isMe ? (
                <QuickHint>You keep credit on this lead. The assignee runs the follow-up.</QuickHint>
              ) : null}
            </div>

            <div>
              <QuickLabel htmlFor="lead-notes" optional>Notes</QuickLabel>
              <Textarea
                id="lead-notes"
                className="min-h-24 rounded-lg bg-white"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Storm date, roof age, gate code, anything helpful"
                rows={4}
              />
            </div>
          </div>
          <QuickFooter
            onCancel={() => handleOpenChange(false)}
            pending={saving}
            submitLabel="Save lead"
            pendingLabel="Saving…"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

function ReturningClientFacts({
  match,
  assigneeName,
}: {
  match: ReturningClientMatch;
  assigneeName?: string;
}) {
  const pm = match.previousStaffName.trim() || "Not on file";
  return (
    <dl className="grid gap-2 text-sm">
      <div className="grid gap-0.5">
        <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Client</dt>
        <dd className="font-medium">{match.contact.name}</dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Previous project manager
        </dt>
        <dd className="font-medium">{pm}</dd>
      </div>
      {assigneeName ? (
        <div className="grid gap-0.5">
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Assigned to
          </dt>
          <dd>{assigneeName}</dd>
        </div>
      ) : null}
      <div className="grid gap-0.5">
        <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Last job</dt>
        <dd>
          {match.job
            ? [match.job.code || null, returningClientWhen(match)].filter(Boolean).join(" · ")
            : "No past job is linked yet."}
        </dd>
      </div>
    </dl>
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
