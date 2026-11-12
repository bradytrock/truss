"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Clock, Home, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { AddressStreetField } from "@/components/address-street-field";
import { CurrencyInput } from "@/components/currency-input";
import { PhoneInput } from "@/components/phone-input";
import {
  QuickFooter,
  QuickHeader,
  QuickHint,
  QuickLabel,
  Segmented,
  TogglePills,
  quickDialogBodyClass,
  quickDialogClass,
  quickFieldClass,
} from "@/components/quick-action-form";
import { toggleTrade } from "@/components/trades-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasBusinessDevelopmentSeat } from "@/lib/bd";
import { useCrm } from "@/lib/crm-store";
import { formatPhone, initials, localYmd } from "@/lib/format";
import { phonesMatch } from "@/lib/job-messages";
import {
  DEFAULT_LEAD_STATE,
  defaultDeliveryForSource,
  formatJobSite,
  leadCustomerHint,
  leadExtraIssue,
  leadIntakeIssue,
  leadPersonName,
  leadRecordName,
  leadNeedsReferrer,
  leadReferrerAllowsFreeText,
  matchReferralPartners,
  resolveLeadReferrer,
  type LeadCustomerKind,
  type LeadExtraDraft,
} from "@/lib/leads";
import { projectTypeForMarket } from "@/lib/market";
import { moneyAmount } from "@/lib/money-input";
import { emailsMatch, assignsToPreviousPm, findReturningClient, returningClientBannerTitle, returningClientWhen, type ReturningClientMatch } from "@/lib/returning-client";
import {
  JOB_MARKET_LABELS,
  JOB_MARKETS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  SEAT_ROLE_LABELS,
  TRADE_LABELS,
  TRADE_MENU_ORDER,
  type Contact,
  type JobMarket,
  type LeadSource,
  type Trade,
} from "@/lib/types";
import { companyLeadAssignees } from "@/lib/visibility";

const BUSINESS_ROLES = [
  "Property manager",
  "Owner",
  "Office manager",
  "Facilities",
  "Tenant",
  "Bookkeeper",
] as const;

const ROLE_OTHER = "other";

type HomeExtra = {
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

type BizExtra = {
  key: string;
  name: string;
  role: string;
  roleNote: string;
  phone: string;
  email: string;
};

function newKey() {
  return crypto.randomUUID();
}

function contactRoleTitle(role: string, note: string) {
  if (role === ROLE_OTHER) return note.trim() || "Point of contact";
  return role.trim() || "Point of contact";
}

function blankHome(): HomeExtra {
  return { key: newKey(), firstName: "", lastName: "", phone: "", email: "" };
}

function blankBiz(): BizExtra {
  return { key: newKey(), name: "", role: "", roleNote: "", phone: "", email: "" };
}

function LeadCard({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-[#f6f5f2] px-3 py-3 dark:bg-muted/40">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</p>
        {onRemove ? (
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AddLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary"
    >
      <Plus className="size-3.5" />
      {children}
    </button>
  );
}

function RoleField({
  id,
  role,
  note,
  onRole,
  onNote,
}: {
  id: string;
  role: string;
  note: string;
  onRole: (role: string) => void;
  onNote: (note: string) => void;
}) {
  return (
    <div>
      <QuickLabel htmlFor={id}>Role</QuickLabel>
      <Select
        value={role || null}
        onValueChange={(value) => onRole(String(value ?? ""))}
        items={[
          ...BUSINESS_ROLES.map((item) => ({ value: item, label: item })),
          { value: ROLE_OTHER, label: "Other" },
        ]}
      >
        <SelectTrigger id={id} className={`${quickFieldClass} w-full`}>
          <SelectValue placeholder="Role" />
        </SelectTrigger>
        <SelectContent>
          {BUSINESS_ROLES.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
          <SelectItem value={ROLE_OTHER}>Other</SelectItem>
        </SelectContent>
      </Select>
      {role === ROLE_OTHER ? (
        <Input
          className={`${quickFieldClass} mt-2`}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          placeholder="Role"
          aria-label="Custom role"
        />
      ) : null}
    </div>
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
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Assigned to</dt>
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
  const [customerKind, setCustomerKind] = useState<LeadCustomerKind>("homeowner");
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [pocName, setPocName] = useState("");
  const [pocRole, setPocRole] = useState("");
  const [pocRoleNote, setPocRoleNote] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [homeExtras, setHomeExtras] = useState<HomeExtra[]>([]);
  const [bizExtras, setBizExtras] = useState<BizExtra[]>([]);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState(DEFAULT_LEAD_STATE);
  const [postalCode, setPostalCode] = useState("");
  const [manualAddress, setManualAddress] = useState(false);
  const [source, setSource] = useState<LeadSource | "">("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [market, setMarket] = useState<JobMarket>("residential");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [referralId, setReferralId] = useState("");
  const [referralQuery, setReferralQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const resolvedAssigneeId =
    assigneeId && people.some((member) => member.id === assigneeId) ? assigneeId : defaultAssignee;
  const assignee = people.find((member) => member.id === resolvedAssigneeId);
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

  const referralMatches = useMemo(
    () => matchReferralPartners(crm.book.contacts, referralQuery),
    [crm.book.contacts, referralQuery],
  );
  const referralPartnerCount = useMemo(
    () => crm.book.contacts.filter((contact) => contact.isReferralPartner).length,
    [crm.book.contacts],
  );
  const selectedReferral = crm.book.contacts.find((contact) => contact.id === referralId);

  function extraDrafts(): LeadExtraDraft[] {
    if (customerKind === "homeowner") {
      return homeExtras.map((row) => ({
        name: `${row.firstName.trim()} ${row.lastName.trim()}`.trim(),
        phone: row.phone,
        email: row.email,
      }));
    }
    return bizExtras.map((row) => ({
      name: row.name.trim(),
      phone: row.phone,
      email: row.email,
      started: Boolean(row.role.trim() || row.roleNote.trim()),
    }));
  }

  function reset() {
    setCustomerKind("homeowner");
    setAssigneeId(defaultAssignee);
    setFirstName("");
    setLastName("");
    setBusinessName("");
    setPocName("");
    setPocRole("");
    setPocRoleNote("");
    setPhone("");
    setEmail("");
    setHomeExtras([]);
    setBizExtras([]);
    setStreet("");
    setCity("");
    setRegion(DEFAULT_LEAD_STATE);
    setPostalCode("");
    setManualAddress(false);
    setSource("");
    setEstimatedValue("");
    setMarket("residential");
    setTrades([]);
    setReferralId("");
    setReferralQuery("");
    setNotes("");
    setNotesOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    else setAssigneeId(defaultAssignee);
    onOpenChange(next);
  }

  async function openLead(ownerStaffId: string) {
    const site = formatJobSite({ street, city, state: region, postalCode });
    const person = leadPersonName({
      kind: customerKind,
      firstName,
      lastName,
      contactName: pocName,
    });
    const recordName = leadRecordName({
      kind: customerKind,
      firstName,
      lastName,
      businessName,
      site: site || city.trim(),
    });
    const roleTitle = contactRoleTitle(pocRole, pocRoleNote);
    const owner = people.find((member) => member.id === ownerStaffId) ?? crm.viewer;
    const match = returning;
    const referral = resolveLeadReferrer({
      source,
      contactId: referralId,
      contactName: selectedReferral?.name,
      text: referralQuery,
    });
    if ("error" in referral) {
      toast.error(referral.error);
      return;
    }
    if (!source) return;
    setSaving(true);
    try {
      let clientId: string | null = null;
      if (customerKind === "business") {
        const wanted = businessName.trim().toLowerCase();
        const named = crm.book.clients.find((client) => client.name.trim().toLowerCase() === wanted);
        if (named) clientId = named.id;
        else {
          const created = await crm.addClient({
            name: businessName.trim(),
            type: "owner",
            city: city.trim(),
            state: region.trim(),
            notes: "",
          });
          clientId = created.id;
        }
      }

      const known: Contact[] = [...crm.book.contacts];
      async function ensureContact(input: {
        name: string;
        title: string;
        email: string;
        phone: string;
        clientId: string | null;
        replaceTitle: boolean;
      }) {
        const nextPhone = input.phone.trim();
        const nextEmail = input.email.trim();
        const existing =
          (nextPhone ? known.find((item) => phonesMatch(item.phone, nextPhone)) : undefined) ??
          (nextEmail ? known.find((item) => emailsMatch(item.email, nextEmail)) : undefined);
        if (!existing) {
          const created = await crm.addContact({
            clientId: input.clientId,
            name: input.name,
            title: input.title,
            email: nextEmail,
            phone: nextPhone,
            ownerStaffId: owner?.id || crm.user.staffId,
            isReferralPartner: false,
            listingWatchUrl: "",
            listingWatchEnabled: false,
          });
          known.unshift(created);
          return created;
        }
        await crm.updateContact(existing.id, {
          name: input.name || existing.name,
          ...(input.replaceTitle ? { title: input.title } : {}),
          email: nextEmail || existing.email,
          phone: nextPhone || existing.phone,
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ownerStaffId: owner?.id || existing.ownerStaffId,
        });
        const next = {
          ...existing,
          name: input.name || existing.name,
          title: input.replaceTitle ? input.title : existing.title,
          email: nextEmail || existing.email,
          phone: nextPhone || existing.phone,
          clientId: input.clientId || existing.clientId,
        };
        const index = known.findIndex((item) => item.id === existing.id);
        if (index >= 0) known[index] = next;
        return next;
      }

      const contact = await ensureContact({
        name: person,
        title: customerKind === "business" ? roleTitle : "Homeowner",
        email,
        phone,
        clientId,
        replaceTitle: customerKind === "business",
      });

      const primaryPhone = phone.trim();
      const primaryEmail = email.trim();
      const additional =
        customerKind === "homeowner"
          ? homeExtras
              .map((row) => ({
                name: `${row.firstName.trim()} ${row.lastName.trim()}`.trim(),
                phone: row.phone.trim(),
                email: row.email.trim(),
                title: "Homeowner",
                replaceTitle: false,
              }))
              .filter((row) => row.name)
          : bizExtras
              .map((row) => ({
                name: row.name.trim(),
                phone: row.phone.trim(),
                email: row.email.trim(),
                title: contactRoleTitle(row.role, row.roleNote),
                replaceTitle: true,
              }))
              .filter((row) => row.name);
      const extraContacts: Contact[] = [];
      for (const row of additional) {
        if (primaryPhone && row.phone && phonesMatch(row.phone, primaryPhone)) continue;
        if (!row.phone && primaryEmail && row.email && emailsMatch(row.email, primaryEmail)) continue;
        extraContacts.push(
          await ensureContact({
            ...row,
            clientId,
          }),
        );
      }

      const pipelineValue = Math.max(0, moneyAmount(estimatedValue) ?? 0);
      const opportunity = await crm.addOpportunity({
        name: recordName,
        clientId,
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
        referralContactId: referral.contactId,
        referralName: referral.name,
        street: street.trim(),
        city: city.trim(),
        state: region.trim(),
        postalCode: postalCode.trim(),
        notes: notes.trim(),
      });
      const extraIds = extraContacts.map((item) => item.id);
      const relatedContactIds = [
        ...new Set([...extraIds, ...(referral.contactId ? [referral.contactId] : [])]),
      ];
      if (opportunity.costingJob?.id && (trades.length || extraIds.length)) {
        void crm
          .updateJob(opportunity.costingJob.id, {
            ...(trades.length ? { trades } : {}),
            ...(extraIds.length ? { relatedContactIds } : {}),
          })
          .catch(() => undefined);
      }
      const openedFor =
        customerKind === "business" ? `${businessName.trim()} (${person}, ${roleTitle})` : person;
      const extraNote = extraContacts.length
        ? `Additional contacts: ${extraContacts.map((item) => item.name).join(", ")}.`
        : "";
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
          `Lead opened for ${openedFor}. Lead source: ${LEAD_SOURCE_LABELS[source]}.`,
          referral.name ? `Referred by ${referral.name}.` : "",
          extraNote,
          notes.trim() ? notes.trim() : "",
          returningNote.trim(),
        ]
          .filter(Boolean)
          .join(" "),
      });
      void crm.addTask({
        title: `Call ${person} back`,
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
    const issue =
      leadIntakeIssue({
        kind: customerKind,
        firstName,
        lastName,
        businessName,
        contactName: pocName,
        phone,
        street,
        source,
      }) ?? leadExtraIssue(extraDrafts());
    if (issue) {
      toast.error(issue);
      return;
    }
    const owner = assignee ?? crm.viewer;
    await openLead(owner?.id || crm.user.staffId);
  }

  const youLabel = (name: string, id: string) => `${name}${id === crm.user.staffId ? " (you)" : ""}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={quickDialogClass("lg")}>
        <QuickHeader tone="rose" icon={<Home className="size-5" />} title="New lead" />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className={`${quickDialogBodyClass} flex-1 space-y-5 px-5 py-4`}>
            <div>
              <QuickLabel>Who&apos;s the customer?</QuickLabel>
              <Segmented
                label="Who's the customer?"
                size="lg"
                value={customerKind}
                onChange={setCustomerKind}
                options={[
                  { value: "homeowner", label: "Homeowner", icon: <User className="size-4" /> },
                  { value: "business", label: "LLC / business", icon: <Building2 className="size-4" /> },
                ]}
              />
              <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{leadCustomerHint(customerKind)}</p>
            </div>

            {customerKind === "homeowner" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <QuickLabel htmlFor="lead-first" required>
                      First name
                    </QuickLabel>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <QuickLabel htmlFor="lead-phone" required>
                      Phone
                    </QuickLabel>
                    <PhoneInput
                      id="lead-phone"
                      className={quickFieldClass}
                      value={phone}
                      onValueChange={setPhone}
                      placeholder="(214) 555-0100"
                    />
                  </div>
                  <div>
                    <QuickLabel htmlFor="lead-email" optional>
                      Email
                    </QuickLabel>
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
                </div>
                {homeExtras.map((row, index) => (
                  <LeadCard
                    key={row.key}
                    title="Another contact"
                    onRemove={() => setHomeExtras((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-first`} required>
                          First name
                        </QuickLabel>
                        <Input
                          id={`lead-extra-${row.key}-first`}
                          className={quickFieldClass}
                          value={row.firstName}
                          onChange={(event) =>
                            setHomeExtras((rows) =>
                              rows.map((item) =>
                                item.key === row.key ? { ...item, firstName: event.target.value } : item,
                              ),
                            )
                          }
                          autoComplete="given-name"
                        />
                      </div>
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-last`}>Last name</QuickLabel>
                        <Input
                          id={`lead-extra-${row.key}-last`}
                          className={quickFieldClass}
                          value={row.lastName}
                          onChange={(event) =>
                            setHomeExtras((rows) =>
                              rows.map((item) =>
                                item.key === row.key ? { ...item, lastName: event.target.value } : item,
                              ),
                            )
                          }
                          autoComplete="family-name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-phone`}>Phone</QuickLabel>
                        <PhoneInput
                          id={`lead-extra-${row.key}-phone`}
                          className={quickFieldClass}
                          value={row.phone}
                          onValueChange={(value) =>
                            setHomeExtras((rows) =>
                              rows.map((item) => (item.key === row.key ? { ...item, phone: value } : item)),
                            )
                          }
                          placeholder="(214) 555-0100"
                        />
                      </div>
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-email`} optional>
                          Email
                        </QuickLabel>
                        <Input
                          id={`lead-extra-${row.key}-email`}
                          className={quickFieldClass}
                          type="email"
                          value={row.email}
                          onChange={(event) =>
                            setHomeExtras((rows) =>
                              rows.map((item) =>
                                item.key === row.key ? { ...item, email: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="name@example.com"
                          autoComplete="email"
                        />
                      </div>
                    </div>
                    <span className="sr-only">Additional contact {index + 1}</span>
                  </LeadCard>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <QuickLabel htmlFor="lead-business" required>
                    LLC or business name
                  </QuickLabel>
                  <Input
                    id="lead-business"
                    className={quickFieldClass}
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    autoComplete="organization"
                  />
                </div>
                <LeadCard title="Point of contact">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <QuickLabel htmlFor="lead-poc" required>
                        Name
                      </QuickLabel>
                      <Input
                        id="lead-poc"
                        className={quickFieldClass}
                        value={pocName}
                        onChange={(event) => setPocName(event.target.value)}
                        autoComplete="name"
                      />
                    </div>
                    <RoleField
                      id="lead-poc-role"
                      role={pocRole}
                      note={pocRoleNote}
                      onRole={setPocRole}
                      onNote={setPocRoleNote}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <QuickLabel htmlFor="lead-phone" required>
                        Phone
                      </QuickLabel>
                      <PhoneInput
                        id="lead-phone"
                        className={quickFieldClass}
                        value={phone}
                        onValueChange={setPhone}
                        placeholder="(214) 555-0100"
                      />
                    </div>
                    <div>
                      <QuickLabel htmlFor="lead-email" optional>
                        Email
                      </QuickLabel>
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
                  </div>
                </LeadCard>
                {bizExtras.map((row) => (
                  <LeadCard
                    key={row.key}
                    title="Point of contact"
                    onRemove={() => setBizExtras((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-name`} required>
                          Name
                        </QuickLabel>
                        <Input
                          id={`lead-extra-${row.key}-name`}
                          className={quickFieldClass}
                          value={row.name}
                          onChange={(event) =>
                            setBizExtras((rows) =>
                              rows.map((item) =>
                                item.key === row.key ? { ...item, name: event.target.value } : item,
                              ),
                            )
                          }
                          autoComplete="name"
                        />
                      </div>
                      <RoleField
                        id={`lead-extra-${row.key}-role`}
                        role={row.role}
                        note={row.roleNote}
                        onRole={(role) =>
                          setBizExtras((rows) =>
                            rows.map((item) => (item.key === row.key ? { ...item, role } : item)),
                          )
                        }
                        onNote={(roleNote) =>
                          setBizExtras((rows) =>
                            rows.map((item) => (item.key === row.key ? { ...item, roleNote } : item)),
                          )
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-phone`}>Phone</QuickLabel>
                        <PhoneInput
                          id={`lead-extra-${row.key}-phone`}
                          className={quickFieldClass}
                          value={row.phone}
                          onValueChange={(value) =>
                            setBizExtras((rows) =>
                              rows.map((item) => (item.key === row.key ? { ...item, phone: value } : item)),
                            )
                          }
                          placeholder="(214) 555-0100"
                        />
                      </div>
                      <div>
                        <QuickLabel htmlFor={`lead-extra-${row.key}-email`} optional>
                          Email
                        </QuickLabel>
                        <Input
                          id={`lead-extra-${row.key}-email`}
                          className={quickFieldClass}
                          type="email"
                          value={row.email}
                          onChange={(event) =>
                            setBizExtras((rows) =>
                              rows.map((item) =>
                                item.key === row.key ? { ...item, email: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="name@example.com"
                          autoComplete="email"
                        />
                      </div>
                    </div>
                  </LeadCard>
                ))}
              </div>
            )}

            <AddLink
              onClick={() =>
                customerKind === "homeowner"
                  ? setHomeExtras((rows) => [...rows, blankHome()])
                  : setBizExtras((rows) => [...rows, blankBiz()])
              }
            >
              Add another contact
            </AddLink>

            {returning ? (
              <div className="grid gap-2 rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-sm font-medium">{returningClientBannerTitle(returning)}</p>
                <ReturningClientFacts match={returning} assigneeName={assignee?.name} />
                <p className="text-sm text-muted-foreground">
                  {assignsToPreviousPm(returning, resolvedAssigneeId)
                    ? "This lead will stay with that project manager."
                    : `${returning.previousStaffName || "The previous project manager"} ran the last job. Saving creates this job and notifies company admins.`}
                </p>
              </div>
            ) : null}

            <div className="border-t" />

            <div className="space-y-3">
              <div>
                <QuickLabel
                  htmlFor="lead-street"
                  required
                  aside={
                    <button
                      type="button"
                      className="text-[13px] font-normal text-muted-foreground hover:text-foreground"
                      onClick={() => setManualAddress((current) => !current)}
                    >
                      {manualAddress ? "Search instead" : "Enter manually"}
                    </button>
                  }
                >
                  Property address
                </QuickLabel>
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
                  placeholder={manualAddress ? "Street address" : "Start typing an address"}
                />
              </div>
              {manualAddress ? (
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
              ) : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Segmented
                  fit
                  label="Property type"
                  value={market}
                  onChange={setMarket}
                  options={JOB_MARKETS.map((item) => ({ value: item, label: JOB_MARKET_LABELS[item] }))}
                />
                <p className="text-[13px] text-muted-foreground">
                  {market === "residential"
                    ? "Residential work isn’t taxed."
                    : "Commercial proposals include sales tax."}
                </p>
              </div>
            </div>

            <div className="border-t" />

            <div>
              <QuickLabel>
                Trades <span className="font-normal text-muted-foreground">· pick all that apply</span>
              </QuickLabel>
              <TogglePills
                label="Trades"
                value={trades}
                onToggle={(trade) => setTrades(toggleTrade(trades, trade))}
                options={TRADE_MENU_ORDER.map((trade) => ({ value: trade, label: TRADE_LABELS[trade] }))}
              />
            </div>

            <div className="border-t" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <QuickLabel htmlFor="lead-source">Lead source</QuickLabel>
                <Select
                  value={source || null}
                  onValueChange={(value) => {
                    const next = String(value ?? "") as LeadSource | "";
                    setSource(next);
                    if (!leadNeedsReferrer(next)) {
                      setReferralId("");
                      setReferralQuery("");
                    } else if (!leadReferrerAllowsFreeText(next) && !referralId) {
                      setReferralQuery("");
                    }
                  }}
                  items={LEAD_SOURCES.map((item) => ({
                    value: item,
                    label: LEAD_SOURCE_LABELS[item],
                  }))}
                >
                  <SelectTrigger id="lead-source" className={`${quickFieldClass} w-full`}>
                    <SelectValue placeholder="Where did it come from?" />
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
              <div>
                <QuickLabel
                  htmlFor="lead-assignee"
                  aside={
                    people.some((member) => member.id === crm.user.staffId) && !isMe ? (
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
                  value={resolvedAssigneeId || null}
                  onValueChange={(value) => setAssigneeId(String(value ?? ""))}
                  items={people.map((member) => ({
                    value: member.id,
                    label: youLabel(member.name, member.id),
                  }))}
                >
                  <SelectTrigger
                    id="lead-assignee"
                    className="h-10 w-full rounded-lg bg-white data-[size=default]:h-10"
                  >
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
                        {youLabel(member.name, member.id)}
                        <span className="text-muted-foreground"> · {SEAT_ROLE_LABELS[member.role]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {bdSeat && !isMe ? (
              <QuickHint>You keep credit on this lead. The assignee runs the follow-up.</QuickHint>
            ) : null}

            {leadNeedsReferrer(source) ? (
              <div>
                <QuickLabel htmlFor="lead-referral" required>
                  {leadReferrerAllowsFreeText(source) ? "Referral" : "Who sent this referral"}
                </QuickLabel>
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
                ) : leadReferrerAllowsFreeText(source) ? (
                  <>
                    <Input
                      id="lead-referral"
                      className={quickFieldClass}
                      value={referralQuery}
                      onChange={(event) => {
                        setReferralQuery(event.target.value);
                        setReferralId("");
                      }}
                      placeholder="Name, company, or group"
                    />
                    {referralQuery.trim() && referralMatches.length > 0 ? (
                      <>
                        <QuickHint>Pick a contact, or keep what you typed.</QuickHint>
                        <ul className="mt-2 max-h-52 divide-y overflow-y-auto rounded-lg border">
                          {referralMatches.map((contact) => (
                            <li key={contact.id}>
                              <button
                                type="button"
                                className="flex w-full flex-col items-start px-2.5 py-2 text-left hover:bg-muted/60"
                                onClick={() => {
                                  setReferralId(contact.id);
                                  setReferralQuery(contact.name);
                                }}
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
                      </>
                    ) : (
                      <QuickHint>
                        {referralQuery.trim()
                          ? "Saved as typed. It does not have to be a contact."
                          : "Type a person or a group. Pick a contact if they are already in the book."}
                      </QuickHint>
                    )}
                  </>
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

            {bdSeat ? (
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
                  Pipeline value for this lead. When a project manager prices an estimate, the job value
                  updates from that proposal.
                </QuickHint>
              </div>
            ) : null}

            {notesOpen ? (
              <div>
                <QuickLabel htmlFor="lead-notes" optional>
                  Notes
                </QuickLabel>
                <Textarea
                  id="lead-notes"
                  className="min-h-24 rounded-lg bg-white"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Storm date, roof age, gate code, anything helpful"
                  rows={4}
                />
              </div>
            ) : (
              <AddLink onClick={() => setNotesOpen(true)}>Add notes</AddLink>
            )}
          </div>
          <QuickFooter
            onCancel={() => handleOpenChange(false)}
            pending={saving}
            submitLabel="Save lead"
            pendingLabel="Saving…"
            note={
              <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground/80">
                <Clock className="size-3.5 text-amber-700" />
                5-min response clock starts on save
              </span>
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
