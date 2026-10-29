"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsCard, SettingsCardHeader } from "@/components/settings-chrome";
import { hasBusinessDevelopmentSeat } from "@/lib/bd";
import { downloadCatalogCsv } from "@/lib/catalog-csv";
import { useCrm } from "@/lib/crm-store";
import {
  HUBSPOT_COMPANY_TARGETS,
  HUBSPOT_CONTACTS_TEMPLATE_CSV,
  HUBSPOT_CONTACT_FIELD_LABELS,
  HUBSPOT_SOURCE,
  applyHubSpotContactsMapping,
  companyTargetLabel,
  defaultBdOwnerStaffId,
  defaultHubSpotContactsMapping,
  hubspotCompanyParentOptions,
  hubspotContactsSkippedCsv,
  isReadyHubSpotContactDraft,
  overrideHubSpotContactDraft,
  parseHubSpotContactsCsv,
  sortBdSeatsFirst,
  summarizeHubSpotContactDrafts,
  type HubSpotCompanyTarget,
  type HubSpotContactDraft,
  type HubSpotContactField,
  type HubSpotContactRowOverride,
  type HubSpotContactsImportResult,
  type HubSpotContactsMapping,
  type HubSpotContactsParsed,
} from "@/lib/hubspot-contacts-import";
import { companyNameKey } from "@/lib/company-groups";
import { CLIENT_TYPE_LABELS, type Client, type StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { companyLeadAssignees, staffAssignmentLabel } from "@/lib/visibility";

type Step = "upload" | "map" | "verify" | "import";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map" },
  { id: "verify", label: "Verify" },
  { id: "import", label: "Import" },
];

const SHOWN_FIELDS: HubSpotContactField[] = [
  "recordId",
  "firstName",
  "lastName",
  "email",
  "phone",
  "owner",
  "companyId",
  "companyName",
  "leadStatus",
  "marketingStatus",
  "createDate",
  "lastActivity",
];

type RowFilter = "all" | "issues" | "warnings" | "matched" | "updates" | "partners" | "excluded";

const ROW_FILTERS: Array<{ id: RowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "issues", label: "Needs a fix" },
  { id: "warnings", label: "Has notes" },
  { id: "matched", label: "Already in Contacts" },
  { id: "updates", label: "Already imported" },
  { id: "partners", label: "Referral partners" },
  { id: "excluded", label: "Left out" },
];

const selectClass = cn(
  "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
);

export function HubSpotContactsImportWizard() {
  const crm = useCrm();
  const people = useMemo(
    () => sortBdSeatsFirst(companyLeadAssignees(crm.viewer, crm.book.staff, crm.user.staffId)),
    [crm.book.staff, crm.user.staffId, crm.viewer],
  );
  const fallbackOwnerId = useMemo(
    () => defaultBdOwnerStaffId(people, crm.user.staffId),
    [crm.user.staffId, people],
  );

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<HubSpotContactsParsed | null>(null);
  const [mapping, setMapping] = useState<HubSpotContactsMapping | null>(null);
  const [overrides, setOverrides] = useState<Record<number, HubSpotContactRowOverride>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<HubSpotContactsImportResult | null>(null);
  const [importedDrafts, setImportedDrafts] = useState<HubSpotContactDraft[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const importedRecordIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const contact of crm.book.contacts) {
      if (contact.externalSource === HUBSPOT_SOURCE && contact.externalId) map.set(contact.externalId, contact.id);
    }
    return map;
  }, [crm.book.contacts]);

  const baseDrafts = useMemo(() => {
    if (!parsed || !mapping) return [];
    return applyHubSpotContactsMapping(parsed, mapping, {
      staff: crm.book.staff,
      contacts: crm.book.contacts,
      clients: crm.book.clients,
      importedRecordIds,
    });
  }, [crm.book.clients, crm.book.contacts, crm.book.staff, importedRecordIds, mapping, parsed]);

  const drafts = useMemo(
    () => baseDrafts.map((draft) => overrideHubSpotContactDraft(draft, overrides[draft.line], crm.book.staff)),
    [baseDrafts, crm.book.staff, overrides],
  );

  const summary = useMemo(() => summarizeHubSpotContactDrafts(drafts), [drafts]);

  const readFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        toast.error("That is an Excel workbook. In HubSpot, export as CSV — or open it in Excel and Save As → CSV UTF-8.");
        return;
      }
      if (file.size > 25_000_000) {
        toast.error("Keep the export under 25 MB. Filter the HubSpot view and export again.");
        return;
      }
      setReading(true);
      try {
        const text = await file.text();
        const next = parseHubSpotContactsCsv(text);
        if (next.rows.length === 0) {
          toast.error("No contact rows in that file — only a header.");
          return;
        }
        setParsed(next);
        setFileName(file.name);
        setMapping(defaultHubSpotContactsMapping(next, crm.book.staff, fallbackOwnerId, crm.book.clients));
        setOverrides({});
        setResult(null);
        setProgress(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not read that file.");
      } finally {
        setReading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [crm.book.clients, crm.book.staff, fallbackOwnerId],
  );

  function reset() {
    setStep("upload");
    setParsed(null);
    setMapping(null);
    setOverrides({});
    setFileName("");
    setProgress(null);
    setResult(null);
    setImportedDrafts([]);
  }

  function setOverride(line: number, patch: HubSpotContactRowOverride) {
    setOverrides((current) => ({ ...current, [line]: { ...current[line], ...patch } }));
  }

  async function runImport() {
    if (summary.blocked > 0) {
      toast.error("Fix or leave out the rows that need attention first.");
      return;
    }
    if (summary.ready === 0) {
      toast.error("Nothing to import.");
      return;
    }
    setStep("import");
    setProgress({ done: 0, total: 1 });
    try {
      const outcome = await crm.importHubSpotContacts(drafts, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);
      setImportedDrafts(drafts);
      toast.success(
        `HubSpot contacts import done: ${outcome.created} added${outcome.updated ? `, ${outcome.updated} updated` : ""}.`,
      );
    } catch {
      // The store already toasted the reason.
      setStep("verify");
      setProgress(null);
    }
  }

  const stepIndex = STEPS.findIndex((item) => item.id === step);

  return (
    <div className="space-y-5">
      <Stepper current={stepIndex} />

      {step === "upload" ? (
        <UploadStep
          fileName={fileName}
          parsed={parsed}
          reading={reading}
          fileRef={fileRef}
          onFile={readFile}
          onNext={() => setStep("map")}
          onReset={reset}
        />
      ) : null}

      {step === "map" && parsed && mapping ? (
        <MapStep
          parsed={parsed}
          mapping={mapping}
          people={people}
          clients={crm.book.clients}
          onChange={setMapping}
          onBack={() => setStep("upload")}
          onNext={() => setStep("verify")}
        />
      ) : null}

      {step === "verify" && parsed && mapping ? (
        <VerifyStep
          drafts={drafts}
          summary={summary}
          people={people}
          staff={crm.book.staff}
          onOverride={setOverride}
          onExcludeBlocked={() =>
            setOverrides((current) => {
              const next = { ...current };
              for (const draft of drafts) {
                if (!draft.excluded && draft.issues.length > 0) next[draft.line] = { ...next[draft.line], excluded: true };
              }
              return next;
            })
          }
          onBack={() => setStep("map")}
          onImport={runImport}
        />
      ) : null}

      {step === "import" ? (
        <ImportStep progress={progress} result={result} drafts={importedDrafts} onReset={reset} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((item, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={item.id} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                active ? "bg-foreground text-background" : done ? "bg-emerald-600 text-white" : "bg-[#f0ece8] text-muted-foreground",
              )}
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={cn(active ? "font-medium" : "text-muted-foreground")}>{item.label}</span>
            {index < STEPS.length - 1 ? <span className="mx-1 h-px w-6 bg-[#e5e0da]" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function UploadStep({
  fileName,
  parsed,
  reading,
  fileRef,
  onFile,
  onNext,
  onReset,
}: {
  fileName: string;
  parsed: HubSpotContactsParsed | null;
  reading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
  onNext: () => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const blocked = Boolean(parsed && parsed.missingRequired.length > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <SettingsCard>
        <SettingsCardHeader
          title="Upload the HubSpot contacts export"
          description="Contacts come in as people in the contact book, each marked as a referral partner on a business development seat. Nothing is written until you confirm on the Verify step."
        />
        <div className="space-y-4 p-5">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) onFile(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-foreground bg-[#f6f4f1]" : "border-[#d9d3cc] hover:bg-[#faf8f6]",
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
              }}
            />
            <span className="text-sm font-medium">{reading ? "Reading…" : "Drop the CSV here, or click to choose it"}</span>
            <span className="text-xs text-muted-foreground">
              HubSpot → CRM → Contacts → Export → File format CSV, include all properties.
            </span>
          </label>

          {parsed ? (
            <div className="space-y-3 rounded-xl bg-[#f6f4f1] p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{fileName}</p>
                  <p className="text-muted-foreground">
                    {parsed.rows.length} contact{parsed.rows.length === 1 ? "" : "s"} ·{" "}
                    {parsed.owners.length} owner{parsed.owners.length === 1 ? "" : "s"} ·{" "}
                    {parsed.companies.length} compan{parsed.companies.length === 1 ? "y" : "ies"}
                    {parsed.leadStatuses.length
                      ? ` · ${parsed.leadStatuses.length} lead status${parsed.leadStatuses.length === 1 ? "" : "es"}`
                      : ""}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={onReset}>
                  Start over
                </Button>
              </div>
              {parsed.missingRequired.length > 0 ? (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                  Missing column{parsed.missingRequired.length === 1 ? "" : "s"}: {parsed.missingRequired.join(", ")}. Add
                  them to the HubSpot export and upload again.
                </p>
              ) : null}
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Columns we read</p>
                <div className="flex flex-wrap gap-1.5">
                  {SHOWN_FIELDS.map((field) => {
                    const header = parsed.columns[field];
                    return (
                      <Badge
                        key={field}
                        variant={header ? "secondary" : "outline"}
                        className={cn("font-normal", !header && "text-muted-foreground/70 line-through")}
                        title={header ? `From “${header}”` : "Not in this file"}
                      >
                        {HUBSPOT_CONTACT_FIELD_LABELS[field]}
                      </Badge>
                    );
                  })}
                </div>
                {parsed.ignoredColumns.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {parsed.ignoredColumns.length} other column{parsed.ignoredColumns.length === 1 ? "" : "s"} (associations,
                    analytics, email events) are ignored.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => downloadCatalogCsv("hubspot-contacts-import-template.csv", HUBSPOT_CONTACTS_TEMPLATE_CSV)}
            >
              Download sample CSV
            </Button>
            <Button onClick={onNext} disabled={!parsed || blocked}>
              Next: Map owners and companies
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader title="What happens" />
        <ul className="space-y-3 p-5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">People.</span> First Name, Last Name, Email, and Phone Number
            become a contact. A phone or email that is already in Contacts updates that person instead of adding a
            second one.
          </li>
          <li>
            <span className="font-medium text-foreground">Business development.</span> Every contact comes in with the
            Referral partner toggle on, so the relationship shows in the owning seat’s business development book and
            their referred leads count toward that person’s tracking. You can turn it off for a single row on Verify.
          </li>
          <li>
            <span className="font-medium text-foreground">Owners.</span> Contact owner is matched to a seat. Anyone that
            does not match goes to the default seat — the first business development seat unless you pick another.
          </li>
          <li>
            <span className="font-medium text-foreground">Companies.</span> Associated Company becomes a company on file
            (realtor, adjuster, trade partner, and so on) and the contact is linked to it. One that already exists by name
            is reused.
          </li>
          <li>
            <span className="font-medium text-foreground">Parent companies.</span> Offices of one business roll up under
            a parent company — Keller Williams and Keller Williams Realty under Keller Williams, every eXp office under
            eXp Realty — so pipeline, jobs, and referred leads read together and ROI can be tracked for the whole
            business. The parent is created for you when it is not on file yet; you pick or change it on Map.
          </li>
          <li>
            <span className="font-medium text-foreground">Quiet and repeatable.</span> No emails, texts, tasks, or
            automations fire. Record ID is remembered, so uploading the same export later updates people rather than
            duplicating them.
          </li>
        </ul>
        <div className="border-t border-[#f0ece8] px-5 py-4 text-xs text-muted-foreground">
          Importing deals instead?{" "}
          <Link href="/settings/integrations/hubspot" className="underline underline-offset-2 hover:text-foreground">
            Open the HubSpot deals import
          </Link>
          .
        </div>
      </SettingsCard>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapStep({
  parsed,
  mapping,
  people,
  clients,
  onChange,
  onBack,
  onNext,
}: {
  parsed: HubSpotContactsParsed;
  mapping: HubSpotContactsMapping;
  people: StaffMember[];
  clients: Client[];
  onChange: (mapping: HubSpotContactsMapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const unmatchedOwners = parsed.owners.filter((owner) => !mapping.owners[owner.value]).length;
  const includedStatuses = parsed.leadStatuses.filter((status) => mapping.leadStatuses[status.value] !== false).length;
  const linkedCompanies = parsed.companies.filter((company) => mapping.companies[company.value] !== "skip").length;
  const parentOptions = hubspotCompanyParentOptions(mapping);
  const clientKeys = useMemo(() => new Set(clients.map((client) => companyNameKey(client.name))), [clients]);
  const groupedCompanies = parsed.companies.filter((company) => {
    const parent = (mapping.companyParents[company.value] ?? "").trim();
    return parent && companyNameKey(parent) !== companyNameKey(company.value) && mapping.companies[company.value] !== "skip";
  }).length;
  const newParents = parentOptions.filter((option) => !clientKeys.has(companyNameKey(option.name))).length;
  /** Companies in the file that other rows roll up under, so the row can say so instead of offering a parent. */
  const parentKeysInFile = useMemo(() => {
    const keys = new Map<string, number>();
    for (const [company, parent] of Object.entries(mapping.companyParents)) {
      const key = companyNameKey(parent.trim());
      if (!key || key === companyNameKey(company)) continue;
      keys.set(key, (keys.get(key) ?? 0) + 1);
    }
    return keys;
  }, [mapping.companyParents]);
  const bdSeats = people.filter((member) => hasBusinessDevelopmentSeat(member));
  const defaultOwner = people.find((member) => member.id === mapping.defaultOwnerStaffId);
  const defaultIsBd = Boolean(defaultOwner && hasBusinessDevelopmentSeat(defaultOwner));

  return (
    <div className="space-y-5">
      <SettingsCard>
        <SettingsCardHeader
          title="Business development tracking"
          description="This is the Referral partner toggle on each contact. It puts the relationship in the owning seat’s business development book."
        />
        <div className="space-y-4 p-5">
          <label className="flex items-start justify-between gap-3 rounded-lg border border-[#f0ece8] px-3 py-3 text-sm sm:max-w-xl">
            <span>
              <span className="block font-medium">Mark every contact as a referral partner</span>
              <span className="block text-xs text-muted-foreground">
                Realtors, adjusters, and other partners show under Partners in Contacts, can be picked as the referral
                source on new leads, and roll into business development ROI for the seat that owns them.
              </span>
            </span>
            <Checkbox
              className="mt-0.5"
              checked={mapping.referralPartner}
              onCheckedChange={(value) => onChange({ ...mapping, referralPartner: Boolean(value) })}
            />
          </label>

          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="hubspot-contacts-default-owner">Default seat</Label>
            <select
              id="hubspot-contacts-default-owner"
              className={selectClass}
              value={mapping.defaultOwnerStaffId}
              onChange={(event) => onChange({ ...mapping, defaultOwnerStaffId: event.target.value })}
            >
              <option value="">Pick someone…</option>
              {people.map((member) => (
                <option key={member.id} value={member.id}>
                  {staffAssignmentLabel(member)}
                </option>
              ))}
            </select>
            {!mapping.defaultOwnerStaffId ? (
              <p className="text-xs text-destructive">Required — every imported contact has to belong to a seat.</p>
            ) : bdSeats.length === 0 ? (
              <p className="text-xs text-amber-700">
                No one has a Business development seat yet. These relationships will sit on {defaultOwner?.name}’s book
                until a seat is set up under Settings → People.
              </p>
            ) : !defaultIsBd ? (
              <p className="text-xs text-amber-700">
                {defaultOwner?.name} is not a business development seat. Contacts with a blank or unmatched owner will
                not count toward BD tracking unless you pick {bdSeats.map((member) => member.name).join(" or ")}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Contacts with a blank or unmatched Contact owner land on this seat. You can still change single rows on
                Verify.
              </p>
            )}
          </div>
        </div>
      </SettingsCard>

      {parsed.leadStatuses.length > 0 ? (
        <SettingsCard>
          <SettingsCardHeader
            title="Lead statuses"
            description={`${includedStatuses} of ${parsed.leadStatuses.length} included. Untick a status to leave those contacts out.`}
          />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {parsed.leadStatuses.map((status) => {
              const checked = mapping.leadStatuses[status.value] !== false;
              return (
                <label key={status.value} className="flex items-center gap-3 rounded-lg border border-[#f0ece8] px-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      onChange({ ...mapping, leadStatuses: { ...mapping.leadStatuses, [status.value]: Boolean(value) } })
                    }
                  />
                  <span className="flex-1">{status.value}</span>
                  <span className="text-xs text-muted-foreground">{status.count}</span>
                </label>
              );
            })}
          </div>
        </SettingsCard>
      ) : null}

      <SettingsCard>
        <SettingsCardHeader
          title="Contact owners → seats"
          description={
            unmatchedOwners
              ? `${unmatchedOwners} owner${unmatchedOwners === 1 ? "" : "s"} did not match a seat and will use the default seat.`
              : parsed.owners.length
                ? "Every owner matched a seat."
                : "No owner column in this file."
          }
        />
        {parsed.owners.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Everything goes to the default seat.</p>
        ) : (
          <MappingTable
            headers={["HubSpot owner", "Contacts", "Seat"]}
            rows={parsed.owners.map((owner) => ({
              key: owner.value,
              label: owner.value,
              count: owner.count,
              tone: mapping.owners[owner.value] ? undefined : "warn",
              control: (
                <select
                  className={selectClass}
                  aria-label={`Seat for ${owner.value}`}
                  value={mapping.owners[owner.value] ?? ""}
                  onChange={(event) =>
                    onChange({ ...mapping, owners: { ...mapping.owners, [owner.value]: event.target.value } })
                  }
                >
                  <option value="">Use default seat</option>
                  {people.map((member) => (
                    <option key={member.id} value={member.id}>
                      {staffAssignmentLabel(member)}
                    </option>
                  ))}
                </select>
              ),
            }))}
          />
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title="Associated companies → companies on file"
          description={
            parsed.companies.length
              ? `${linkedCompanies} of ${parsed.companies.length} will be linked. Pick what kind of company each one is, or leave it unlinked.${
                  groupedCompanies
                    ? ` ${groupedCompanies} roll${groupedCompanies === 1 ? "s" : ""} up under ${parentOptions.length} parent compan${parentOptions.length === 1 ? "y" : "ies"}${
                        newParents ? ` (${newParents} new)` : ""
                      }.`
                    : ""
                }`
              : "No company column in this file."
          }
          actions={
            parsed.companies.length && groupedCompanies ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const cleared: Record<string, string> = {};
                  for (const company of parsed.companies) cleared[company.value] = "";
                  onChange({ ...mapping, companyParents: cleared });
                }}
              >
                Clear all parents
              </Button>
            ) : null
          }
        />
        {parsed.companies.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Contacts come in without a company.</p>
        ) : (
          <>
            <p className="border-b border-[#f0ece8] px-5 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Group under</span> puts offices of one business under a parent
              company — Keller Williams and Keller Williams Realty under Keller Williams, every eXp office under eXp Realty
              — so pipeline, jobs, and referred leads from all of them read together on the parent’s page. Brands we
              recognize are filled in; type a name to make a new parent, or pick one already on file.
            </p>
            <MappingTable
              headers={["HubSpot company", "Contacts", "Company type", "Group under"]}
              rows={parsed.companies.map((company) => {
                const skip = mapping.companies[company.value] === "skip";
                const ownKey = companyNameKey(company.value);
                const parentOf = parentKeysInFile.get(ownKey) ?? 0;
                return {
                  key: company.value,
                  label: company.value,
                  sub: company.hubspotId ? `HubSpot company ${company.hubspotId}` : undefined,
                  count: company.count,
                  tone: skip ? "muted" : undefined,
                  control: (
                    <select
                      className={selectClass}
                      aria-label={`Company type for ${company.value}`}
                      value={mapping.companies[company.value] ?? "owner"}
                      onChange={(event) =>
                        onChange({
                          ...mapping,
                          companies: { ...mapping.companies, [company.value]: event.target.value as HubSpotCompanyTarget },
                        })
                      }
                    >
                      {HUBSPOT_COMPANY_TARGETS.map((target) => (
                        <option key={target} value={target}>
                          {companyTargetLabel(target)}
                        </option>
                      ))}
                    </select>
                  ),
                  extra: skip ? (
                    <span className="text-xs text-muted-foreground">Not linked</span>
                  ) : parentOf ? (
                    <span className="text-xs text-muted-foreground">
                      Parent of {parentOf} other{parentOf === 1 ? "" : "s"} in this file
                    </span>
                  ) : (
                    <ParentPicker
                      company={company.value}
                      value={mapping.companyParents[company.value] ?? ""}
                      options={parentOptions}
                      clients={clients}
                      onChange={(value) =>
                        onChange({ ...mapping, companyParents: { ...mapping.companyParents, [company.value]: value } })
                      }
                    />
                  ),
                };
              })}
            />
          </>
        )}
      </SettingsCard>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" className="bg-white" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!mapping.defaultOwnerStaffId}>
          Next: Verify
        </Button>
      </div>
    </div>
  );
}

function MappingTable({
  headers,
  rows,
}: {
  headers: [string, string, string] | [string, string, string, string];
  rows: Array<{
    key: string;
    label: string;
    sub?: string;
    count: number;
    tone?: "warn" | "muted";
    control: React.ReactNode;
    extra?: React.ReactNode;
  }>;
}) {
  const extraHeader = headers[3];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#f0ece8] text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-medium">{headers[0]}</th>
            <th className="px-3 py-2 text-right font-medium">{headers[1]}</th>
            <th className={cn(extraHeader ? "w-[26%] px-3" : "w-[40%] px-5", "py-2 font-medium")}>{headers[2]}</th>
            {extraHeader ? <th className="w-[30%] px-5 py-2 font-medium">{extraHeader}</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f6f3f0]">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-5 py-2">
                <div className="flex items-center gap-2">
                  {row.tone === "warn" ? <span className="size-1.5 rounded-full bg-amber-500" aria-hidden /> : null}
                  <span className={cn(row.tone === "muted" && "text-muted-foreground")}>{row.label}</span>
                </div>
                {row.sub ? <p className="text-xs text-muted-foreground">{row.sub}</p> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.count}</td>
              <td className={cn(extraHeader ? "px-3" : "px-5", "py-2")}>{row.control}</td>
              {extraHeader ? <td className="px-5 py-2">{row.extra}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NEW_PARENT = "__new__";

/**
 * Pick the parent company an office rolls up under: none, a parent already
 * chosen for another row, a company on file, or a new name typed in.
 */
function ParentPicker({
  company,
  value,
  options,
  clients,
  onChange,
}: {
  company: string;
  value: string;
  options: Array<{ name: string; count: number }>;
  clients: Client[];
  onChange: (value: string) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const ownKey = companyNameKey(company);
  const clientKeys = useMemo(() => new Set(clients.map((client) => companyNameKey(client.name))), [clients]);
  const optionKeys = new Set(options.map((option) => companyNameKey(option.name)));
  const onFile = clients
    .filter((client) => {
      const key = companyNameKey(client.name);
      return key !== ownKey && !optionKeys.has(key);
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  const valueKey = companyNameKey(value);
  const isNew = Boolean(value) && !clientKeys.has(valueKey);

  function commit() {
    const next = draft.replace(/\s+/g, " ").trim();
    setTyping(false);
    setDraft("");
    if (!next || companyNameKey(next) === ownKey) return;
    onChange(next);
  }

  if (typing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              setTyping(false);
              setDraft("");
            }
          }}
          onBlur={commit}
          placeholder="Parent company name"
          aria-label={`New parent company for ${company}`}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      <select
        className={selectClass}
        aria-label={`Parent company for ${company}`}
        value={value}
        onChange={(event) => {
          if (event.target.value === NEW_PARENT) {
            setDraft("");
            setTyping(true);
            return;
          }
          onChange(event.target.value);
        }}
      >
        <option value="">No parent company</option>
        {options.length > 0 ? (
          <optgroup label="In this import">
            {options
              .filter((option) => companyNameKey(option.name) !== ownKey)
              .map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                  {clientKeys.has(companyNameKey(option.name)) ? "" : " (new)"} · {option.count}
                </option>
              ))}
          </optgroup>
        ) : null}
        {onFile.length > 0 ? (
          <optgroup label="On file">
            {onFile.map((client) => (
              <option key={client.id} value={client.name}>
                {client.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value={NEW_PARENT}>New parent company…</option>
      </select>
      {value ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{isNew ? "Will be added as a new company" : "Already on file"}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function VerifyStep({
  drafts,
  summary,
  people,
  staff,
  onOverride,
  onExcludeBlocked,
  onBack,
  onImport,
}: {
  drafts: HubSpotContactDraft[];
  summary: ReturnType<typeof summarizeHubSpotContactDrafts>;
  people: StaffMember[];
  staff: StaffMember[];
  onOverride: (line: number, patch: HubSpotContactRowOverride) => void;
  onExcludeBlocked: () => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drafts.filter((draft) => {
      if (filter === "issues" && (draft.excluded || draft.issues.length === 0)) return false;
      if (filter === "warnings" && draft.warnings.length === 0) return false;
      if (filter === "matched" && !(draft.existingId && draft.matchedBy !== "record")) return false;
      if (filter === "updates" && draft.matchedBy !== "record") return false;
      if (filter === "partners" && !draft.isReferralPartner) return false;
      if (filter === "excluded" && !draft.excluded) return false;
      if (ownerFilter && draft.ownerStaffId !== ownerFilter) return false;
      if (needle) {
        const hay = `${draft.name} ${draft.phone} ${draft.email} ${draft.company?.name ?? ""} ${draft.company?.parent?.name ?? ""} ${draft.recordId} ${draft.leadStatus}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [drafts, filter, ownerFilter, query]);

  const canImport = summary.blocked === 0 && summary.ready > 0;
  const partnersOff = summary.ready - summary.referralPartners;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Stat label="Ready" value={summary.ready} tone="good" />
        <Stat label="Needs a fix" value={summary.blocked} tone={summary.blocked ? "bad" : undefined} />
        <Stat label="Left out" value={summary.excluded} />
        <Stat label="Updates" value={summary.updates} hint="already in Contacts" />
        <Stat label="Referral partners" value={summary.referralPartners} hint="tracked in BD" />
        <Stat label="New companies" value={summary.newCompanies} hint={summary.matchedCompanies ? `${summary.matchedCompanies} matched` : undefined} />
        <Stat
          label="Parent companies"
          value={summary.byParent.length}
          hint={
            summary.byParent.length
              ? `${summary.newParents} new · ${summary.groupedCompanies} grouped`
              : "none grouped"
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SettingsCard>
          <SettingsCardHeader
            title="Where the contacts land"
            description={`${summary.newContacts} new, ${summary.updates} updated, across ${summary.byOwner.length} seat${summary.byOwner.length === 1 ? "" : "s"}.`}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By seat</p>
              <ul className="space-y-1.5 text-sm">
                {summary.byOwner.length === 0 ? <li className="text-muted-foreground">Nothing yet.</li> : null}
                {summary.byOwner.map((entry) => {
                  const member = staff.find((item) => item.id === entry.staffId);
                  const bd = member ? hasBusinessDevelopmentSeat(member) : false;
                  return (
                    <li key={entry.staffId || "none"} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        {entry.name || "No seat"}
                        {bd ? (
                          <Badge variant="secondary" className="font-normal">
                            BD
                          </Badge>
                        ) : null}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {entry.count}
                        {entry.partners !== entry.count ? ` · ${entry.partners} partner${entry.partners === 1 ? "" : "s"}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By lead status</p>
              <ul className="space-y-1.5 text-sm">
                {summary.byLeadStatus.length === 0 ? <li className="text-muted-foreground">Nothing yet.</li> : null}
                {summary.byLeadStatus.map((entry) => (
                  <li key={entry.status || "blank"} className="flex items-center justify-between gap-3">
                    <span className={cn(!entry.status && "text-muted-foreground")}>{entry.status || "No status"}</span>
                    <span className="tabular-nums text-muted-foreground">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard>
          <SettingsCardHeader title="Business development" description="How these relationships will be tracked." />
          <div className="space-y-3 p-5 text-sm">
            <p>
              <span className="font-medium">{summary.referralPartners}</span> of {summary.ready} ready contact
              {summary.ready === 1 ? "" : "s"} come in as referral partners
              {partnersOff ? `; ${partnersOff} ${partnersOff === 1 ? "is" : "are"} a plain contact` : ""}.
            </p>
            <p className="text-muted-foreground">
              A referral partner sits in the business development book of the seat that owns them. Leads that name them
              as the referral source count toward that person’s BD ROI, and they appear under Partners in Contacts.
            </p>
          </div>
          <div className="border-t border-[#f0ece8] px-5 py-4 text-xs text-muted-foreground">
            Quiet import: no emails, texts, tasks, or automations. People already in Contacts are updated — the toggle is
            turned on and blanks are filled, their name is kept.
          </div>
        </SettingsCard>
      </div>

      {summary.byParent.length > 0 ? (
        <SettingsCard>
          <SettingsCardHeader
            title="Parent companies"
            description="Offices roll up under these, so pipeline, jobs, and referred leads from every office read together on the parent’s page. Change a grouping on the Map step."
          />
          <ul className="divide-y divide-[#f6f3f0]">
            {summary.byParent.map((parent) => (
              <li key={parent.key} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {parent.name}
                    <Badge variant={parent.existingId ? "secondary" : "outline"} className="font-normal">
                      {parent.existingId ? "On file" : "New"}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{parent.companies.join(" · ")}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {parent.companies.length} compan{parent.companies.length === 1 ? "y" : "ies"} · {parent.contacts} contact
                  {parent.contacts === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      <SettingsCard>
        <SettingsCardHeader
          title="Every row"
          description="Change the seat, the referral partner toggle, or the company on a single row, or untick it to leave it out. Rows marked red cannot import until fixed."
          actions={
            summary.blocked > 0 ? (
              <Button size="sm" variant="outline" className="bg-white" onClick={onExcludeBlocked}>
                Leave out all {summary.blocked} that need a fix
              </Button>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-2 border-b border-[#f0ece8] px-5 py-3">
          {ROW_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === item.id ? "border-foreground bg-foreground text-background" : "border-[#e5e0da] bg-white hover:bg-[#f6f4f1]",
              )}
            >
              {item.label}
            </button>
          ))}
          <select
            className={cn(selectClass, "h-7 w-auto text-xs")}
            aria-label="Filter by seat"
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
          >
            <option value="">Any seat</option>
            {people.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email, company…"
            className="h-7 w-full max-w-xs text-xs sm:ml-auto"
          />
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-[#f0ece8] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Seat</th>
                <th className="px-3 py-2 font-medium">Referral partner</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f6f3f0]">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">
                    No rows match this filter.
                  </td>
                </tr>
              ) : null}
              {visible.map((draft) => (
                <VerifyRow key={draft.line} draft={draft} people={people} staff={staff} onOverride={onOverride} />
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="bg-white" onClick={onBack}>
          Back to mapping
        </Button>
        <div className="flex items-center gap-3">
          {!canImport && summary.blocked > 0 ? (
            <span className="text-sm text-destructive">
              {summary.blocked} row{summary.blocked === 1 ? "" : "s"} need{summary.blocked === 1 ? "s" : ""} a fix or to be left out.
            </span>
          ) : null}
          <Button onClick={onImport} disabled={!canImport}>
            Import {summary.ready} contact{summary.ready === 1 ? "" : "s"}
            {summary.excluded ? `, leave out ${summary.excluded}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VerifyRow({
  draft,
  people,
  staff,
  onOverride,
}: {
  draft: HubSpotContactDraft;
  people: StaffMember[];
  staff: StaffMember[];
  onOverride: (line: number, patch: HubSpotContactRowOverride) => void;
}) {
  const blocked = !draft.excluded && draft.issues.length > 0;
  const seatOptions = people.some((member) => member.id === draft.ownerStaffId)
    ? people
    : [...people, ...staff.filter((member) => member.id === draft.ownerStaffId)];
  return (
    <tr className={cn(draft.excluded && "opacity-50", blocked && "bg-destructive/5")}>
      <td className="px-3 py-2 align-top">
        <Checkbox
          checked={!draft.excluded}
          aria-label={`Include line ${draft.line}`}
          onCheckedChange={(value) => onOverride(draft.line, { excluded: !value })}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium">{draft.name || <span className="text-muted-foreground">—</span>}</p>
        <p className="text-xs text-muted-foreground">{[draft.phone, draft.email].filter(Boolean).join(" · ")}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {draft.matchedBy === "record" ? (
            <Badge variant="secondary" className="font-normal">
              Updates existing
            </Badge>
          ) : draft.existingId ? (
            <Badge variant="secondary" className="font-normal">
              Existing · {draft.matchedBy}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              New contact
            </Badge>
          )}
          {draft.recordId ? <span className="text-xs text-muted-foreground">#{draft.recordId}</span> : null}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {draft.company ? (
          <>
            <p>{draft.company.name}</p>
            <select
              className={cn(selectClass, "mt-1 h-7 text-xs")}
              aria-label={`Company type for ${draft.company.name}`}
              value={draft.company.type}
              onChange={(event) => onOverride(draft.line, { companyType: event.target.value as HubSpotCompanyTarget })}
            >
              {HUBSPOT_COMPANY_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {target === "skip" ? "Don’t link" : CLIENT_TYPE_LABELS[target]}
                </option>
              ))}
            </select>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {draft.company.type === "skip" ? "Not linked" : draft.company.existingId ? "On file" : "New company"}
              {draft.company.type !== "skip" && draft.company.parent ? ` · under ${draft.company.parent.name}` : ""}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <select
          className={cn(selectClass, "h-7 text-xs", !draft.ownerStaffId && "border-destructive")}
          aria-label="Seat"
          value={draft.ownerStaffId}
          onChange={(event) => onOverride(draft.line, { ownerStaffId: event.target.value })}
        >
          {!draft.ownerStaffId ? <option value="">Pick a seat…</option> : null}
          {seatOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
              {hasBusinessDevelopmentSeat(member) ? " · BD" : ""}
            </option>
          ))}
        </select>
        {draft.ownerLabel ? <p className="mt-0.5 text-xs text-muted-foreground">was “{draft.ownerLabel}”</p> : null}
      </td>
      <td className="px-3 py-2 align-top">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={draft.isReferralPartner}
            aria-label={`Referral partner for line ${draft.line}`}
            onCheckedChange={(value) => onOverride(draft.line, { isReferralPartner: Boolean(value) })}
          />
          <span className={cn(!draft.isReferralPartner && "text-muted-foreground")}>
            {draft.isReferralPartner ? "Tracked in BD" : "Plain contact"}
          </span>
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{draft.title}</p>
      </td>
      <td className="px-3 py-2 align-top text-xs">
        <p>{draft.leadStatus || <span className="text-muted-foreground">—</span>}</p>
        {draft.marketingStatus ? <p className="text-muted-foreground">{draft.marketingStatus}</p> : null}
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        <p>{draft.createdAt.slice(0, 10)}</p>
        {draft.lastActivityAt ? <p>active {draft.lastActivityAt.slice(0, 10)}</p> : null}
      </td>
      <td className="px-3 py-2 align-top text-xs">
        {draft.issues.map((issue) => (
          <p key={issue} className="text-destructive">
            {issue}
          </p>
        ))}
        {draft.warnings.map((warning) => (
          <p key={warning} className="text-amber-700">
            {warning}
          </p>
        ))}
        {draft.issues.length === 0 && draft.warnings.length === 0 ? <span className="text-muted-foreground">—</span> : null}
      </td>
    </tr>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "good" | "bad" }) {
  return (
    <SettingsCard className="px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone === "good" && "text-emerald-700", tone === "bad" && "text-destructive")}>
        {value}
      </p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </SettingsCard>
  );
}

// ---------------------------------------------------------------------------

function ImportStep({
  progress,
  result,
  drafts,
  onReset,
}: {
  progress: { done: number; total: number } | null;
  result: HubSpotContactsImportResult | null;
  drafts: HubSpotContactDraft[];
  onReset: () => void;
}) {
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const skipped = drafts.filter((draft) => !isReadyHubSpotContactDraft(draft));
  return (
    <SettingsCard>
      <SettingsCardHeader
        title={result ? "Import finished" : "Importing…"}
        description={
          result
            ? "Everyone is in Contacts, and the referral partners are on their seats’ business development books."
            : "Keep this tab open until it finishes."
        }
      />
      <div className="space-y-5 p-5">
        {!result ? (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f0ece8]">
              <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {progress ? `${progress.done} of ${progress.total}` : "Starting…"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-5">
              <Stat label="Contacts added" value={result.created} tone="good" />
              <Stat label="Contacts updated" value={result.updated} />
              <Stat label="Companies added" value={result.companiesCreated} />
              <Stat label="Companies matched" value={result.companiesMatched} />
              <Stat
                label="Parent companies"
                value={result.parentsCreated}
                hint={result.companiesGrouped ? `${result.companiesGrouped} grouped under a parent` : "none grouped"}
              />
            </div>
            {skipped.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6f4f1] px-4 py-3 text-sm">
                <span>
                  {skipped.length} row{skipped.length === 1 ? " was" : "s were"} left out.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white"
                  onClick={() => downloadCatalogCsv("hubspot-contacts-import-skipped.csv", hubspotContactsSkippedCsv(drafts))}
                >
                  Download the skipped rows
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href="/contacts" />}>
                Open Contacts
              </Button>
              <Button nativeButton={false} variant="outline" className="bg-white" render={<Link href="/clients" />}>
                Open Companies
              </Button>
              <Button variant="ghost" onClick={onReset}>
                Import another file
              </Button>
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  );
}
