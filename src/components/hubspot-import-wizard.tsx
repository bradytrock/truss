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
import { downloadCatalogCsv } from "@/lib/catalog-csv";
import { useCrm } from "@/lib/crm-store";
import { formatMoney } from "@/lib/format";
import {
  HUBSPOT_FIELD_LABELS,
  HUBSPOT_SOURCE,
  HUBSPOT_STAGE_TARGETS,
  HUBSPOT_TEMPLATE_CSV,
  applyHubSpotMapping,
  defaultHubSpotMapping,
  hubspotSkippedCsv,
  isReadyHubSpotDraft,
  overrideHubSpotDraft,
  parseHubSpotCsv,
  stageTargetLabel,
  summarizeHubSpotDrafts,
  type HubSpotDealDraft,
  type HubSpotField,
  type HubSpotImportResult,
  type HubSpotMapping,
  type HubSpotParsed,
  type HubSpotRowOverride,
  type HubSpotStageTarget,
} from "@/lib/hubspot-import";
import { leadSourceLabel } from "@/lib/leads";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS, type LeadSource, type StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { companyLeadAssignees, staffAssignmentLabel } from "@/lib/visibility";
import {
  WORK_COLUMNS,
  WORK_COLUMN_LABELS,
  boardCardAddress,
  boardCardCue,
  boardCardName,
  type WorkColumn,
} from "@/lib/work-board";

type Step = "upload" | "map" | "verify" | "import";

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map" },
  { id: "verify", label: "Verify" },
  { id: "import", label: "Import" },
];

const SHOWN_FIELDS: HubSpotField[] = [
  "recordId",
  "dealName",
  "stage",
  "pipeline",
  "amount",
  "createDate",
  "closeDate",
  "owner",
  "pmName",
  "assignees",
  "clientName",
  "clientEmail",
  "clientPhone",
  "clientAddress",
  "source",
  "description",
  "nextStep",
  "lostReason",
  "tags",
];

type RowFilter = "all" | "issues" | "warnings" | "matched" | "updates" | "excluded";

const ROW_FILTERS: Array<{ id: RowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "issues", label: "Needs a fix" },
  { id: "warnings", label: "Has notes" },
  { id: "matched", label: "Existing contact" },
  { id: "updates", label: "Already imported" },
  { id: "excluded", label: "Left out" },
];

const BOARD_COLUMNS = WORK_COLUMNS.filter((column) => column !== "deleted");

const selectClass = cn(
  "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
);

export function HubSpotImportWizard() {
  const crm = useCrm();
  const people = useMemo(
    () => companyLeadAssignees(crm.viewer, crm.book.staff, crm.user.staffId),
    [crm.book.staff, crm.user.staffId, crm.viewer],
  );
  const fallbackOwnerId = people.find((member) => member.id === crm.user.staffId)?.id ?? people[0]?.id ?? "";

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<HubSpotParsed | null>(null);
  const [mapping, setMapping] = useState<HubSpotMapping | null>(null);
  const [overrides, setOverrides] = useState<Record<number, HubSpotRowOverride>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<HubSpotImportResult | null>(null);
  const [importedDrafts, setImportedDrafts] = useState<HubSpotDealDraft[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const importedRecordIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const opportunity of crm.book.opportunities) {
      if (opportunity.externalSource === HUBSPOT_SOURCE && opportunity.externalId) {
        map.set(opportunity.externalId, opportunity.id);
      }
    }
    return map;
  }, [crm.book.opportunities]);

  const baseDrafts = useMemo(() => {
    if (!parsed || !mapping) return [];
    return applyHubSpotMapping(parsed, mapping, {
      staff: crm.book.staff,
      contacts: crm.book.contacts,
      importedRecordIds,
    });
  }, [crm.book.contacts, crm.book.staff, importedRecordIds, mapping, parsed]);

  const drafts = useMemo(
    () => baseDrafts.map((draft) => overrideHubSpotDraft(draft, overrides[draft.line], crm.book.staff)),
    [baseDrafts, crm.book.staff, overrides],
  );

  const summary = useMemo(() => summarizeHubSpotDrafts(drafts), [drafts]);

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
        const next = parseHubSpotCsv(text);
        if (next.rows.length === 0) {
          toast.error("No deal rows in that file — only a header.");
          return;
        }
        setParsed(next);
        setFileName(file.name);
        setMapping(defaultHubSpotMapping(next, crm.book.staff, fallbackOwnerId));
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
    [crm.book.staff, fallbackOwnerId],
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

  function setOverride(line: number, patch: HubSpotRowOverride) {
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
      const outcome = await crm.importHubSpotDeals(drafts, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(outcome);
      setImportedDrafts(drafts);
      toast.success(
        `HubSpot import done: ${outcome.created} added${outcome.updated ? `, ${outcome.updated} updated` : ""}.`,
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
  parsed: HubSpotParsed | null;
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
          title="Upload the HubSpot export"
          description="Deals come in as homeowners, leads, and jobs. Nothing is written until you confirm on the Verify step."
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
              HubSpot → Sales → Deals → Export → File format CSV, include all properties.
            </span>
          </label>

          {parsed ? (
            <div className="space-y-3 rounded-xl bg-[#f6f4f1] p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{fileName}</p>
                  <p className="text-muted-foreground">
                    {parsed.rows.length} deal{parsed.rows.length === 1 ? "" : "s"} ·{" "}
                    {parsed.pipelines.length || 1} pipeline{parsed.pipelines.length === 1 ? "" : "s"} ·{" "}
                    {parsed.stages.length} stage{parsed.stages.length === 1 ? "" : "s"} ·{" "}
                    {parsed.owners.length} owner{parsed.owners.length === 1 ? "" : "s"}
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
                        {HUBSPOT_FIELD_LABELS[field]}
                      </Badge>
                    );
                  })}
                </div>
                {parsed.ignoredColumns.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {parsed.ignoredColumns.length} other column{parsed.ignoredColumns.length === 1 ? "" : "s"} (forecasts,
                    associations, traffic sources) are ignored.
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
              onClick={() => downloadCatalogCsv("hubspot-import-template.csv", HUBSPOT_TEMPLATE_CSV)}
            >
              Download sample CSV
            </Button>
            <Button onClick={onNext} disabled={!parsed || blocked}>
              Next: Map stages and owners
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader title="What happens" />
        <ul className="space-y-3 p-5 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Homeowners.</span> Client Name, Phone, Email, and Address become a
            contact. A phone or email that is already in Contacts reuses that person.
          </li>
          <li>
            <span className="font-medium text-foreground">Leads and jobs.</span> Each deal becomes one card on the Jobs board
            in the column you choose for its Deal Stage, with the Amount, Create Date, Close Date, description, and next
            step.
          </li>
          <li>
            <span className="font-medium text-foreground">People.</span> Deal owner becomes the seat. A project manager,
            an Also assigned column, or several names separated by semicolons are put on the job too. Nothing sits
            unassigned.
          </li>
          <li>
            <span className="font-medium text-foreground">Quiet.</span> No texts, emails, call tasks, or automations fire
            for imported records. Each job gets one timeline note saying where it came from.
          </li>
          <li>
            <span className="font-medium text-foreground">Repeatable.</span> Record ID is remembered. Upload the same export
            later and matching deals are updated, not duplicated.
          </li>
        </ul>
      </SettingsCard>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MapStep({
  parsed,
  mapping,
  people,
  onChange,
  onBack,
  onNext,
}: {
  parsed: HubSpotParsed;
  mapping: HubSpotMapping;
  people: StaffMember[];
  onChange: (mapping: HubSpotMapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const unmatchedOwners = parsed.owners.filter((owner) => !mapping.owners[owner.value]).length;
  const includedPipelines = parsed.pipelines.filter((pipeline) => mapping.pipelines[pipeline.value] !== false).length;

  return (
    <div className="space-y-5">
      <SettingsCard>
        <SettingsCardHeader
          title="Default owner"
          description="Deals with a blank or unmatched owner go on this person’s book. You can still change single rows on Verify."
        />
        <div className="grid gap-2 p-5 sm:max-w-md">
          <Label htmlFor="hubspot-default-owner">Seat</Label>
          <select
            id="hubspot-default-owner"
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
            <p className="text-xs text-destructive">Required — every imported card has to belong to a seat.</p>
          ) : null}
        </div>
      </SettingsCard>

      {parsed.pipelines.length > 1 ? (
        <SettingsCard>
          <SettingsCardHeader
            title="Pipelines"
            description={`${includedPipelines} of ${parsed.pipelines.length} included. Untick a pipeline to leave its deals out.`}
          />
          <div className="grid gap-2 p-5 sm:grid-cols-2">
            {parsed.pipelines.map((pipeline) => {
              const checked = mapping.pipelines[pipeline.value] !== false;
              return (
                <label key={pipeline.value} className="flex items-center gap-3 rounded-lg border border-[#f0ece8] px-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      onChange({ ...mapping, pipelines: { ...mapping.pipelines, [pipeline.value]: Boolean(value) } })
                    }
                  />
                  <span className="flex-1">{pipeline.value}</span>
                  <span className="text-xs text-muted-foreground">{pipeline.count}</span>
                </label>
              );
            })}
          </div>
        </SettingsCard>
      ) : null}

      <SettingsCard>
        <SettingsCardHeader
          title="Deal stages → board columns"
          description="Closed won is set to Complete. Pick In progress instead for deals still being built."
        />
        <MappingTable
          headers={["HubSpot stage", "Deals", "Lands in"]}
          rows={parsed.stages.map((stage) => ({
            key: stage.value,
            label: stage.value,
            sub: parsed.pipelines.length > 1 ? stage.pipeline : undefined,
            count: stage.count,
            control: (
              <select
                className={selectClass}
                aria-label={`Column for ${stage.value}`}
                value={mapping.stages[stage.value] ?? "lead"}
                onChange={(event) =>
                  onChange({ ...mapping, stages: { ...mapping.stages, [stage.value]: event.target.value as HubSpotStageTarget } })
                }
              >
                {HUBSPOT_STAGE_TARGETS.map((target) => (
                  <option key={target} value={target}>
                    {stageTargetLabel(target)}
                  </option>
                ))}
              </select>
            ),
          }))}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader
          title="Deal owners → seats"
          description={
            unmatchedOwners
              ? `${unmatchedOwners} name${unmatchedOwners === 1 ? "" : "s"} did not match a seat. The deal owner falls back to the default; anyone else is left off that job.`
              : "Every name matched a seat. The deal owner is the book, and everyone else named is assigned to the job too."
          }
        />
        {parsed.owners.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No owner column in this file. Everything goes to the default owner.</p>
        ) : (
          <MappingTable
            headers={["HubSpot owner", "Deals", "Seat"]}
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
                  <option value="">Use default owner</option>
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
          title="“How Did They Find Us?” → seeds"
          description="Seeds feed the lead-source reports. Leave one blank to import without a seed."
        />
        {parsed.sources.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No source column in this file. Seeds stay blank.</p>
        ) : (
          <MappingTable
            headers={["HubSpot value", "Deals", "Seed"]}
            rows={parsed.sources.map((source) => ({
              key: source.value,
              label: source.value,
              count: source.count,
              tone: mapping.sources[source.value] ? undefined : "muted",
              control: (
                <select
                  className={selectClass}
                  aria-label={`Seed for ${source.value}`}
                  value={mapping.sources[source.value] ?? ""}
                  onChange={(event) =>
                    onChange({ ...mapping, sources: { ...mapping.sources, [source.value]: event.target.value as LeadSource | "" } })
                  }
                >
                  <option value="">No seed</option>
                  {LEAD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {LEAD_SOURCE_LABELS[source]}
                    </option>
                  ))}
                </select>
              ),
            }))}
          />
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
  headers: [string, string, string];
  rows: Array<{
    key: string;
    label: string;
    sub?: string;
    count: number;
    tone?: "warn" | "muted";
    control: React.ReactNode;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#f0ece8] text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2 font-medium">{headers[0]}</th>
            <th className="px-3 py-2 text-right font-medium">{headers[1]}</th>
            <th className="w-[40%] px-5 py-2 font-medium">{headers[2]}</th>
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
              <td className="px-5 py-2">{row.control}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  drafts: HubSpotDealDraft[];
  summary: ReturnType<typeof summarizeHubSpotDrafts>;
  people: StaffMember[];
  staff: StaffMember[];
  onOverride: (line: number, patch: HubSpotRowOverride) => void;
  onExcludeBlocked: () => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const [filter, setFilter] = useState<RowFilter>("all");
  const [columnFilter, setColumnFilter] = useState<WorkColumn | "">("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drafts.filter((draft) => {
      if (filter === "issues" && (draft.excluded || draft.issues.length === 0)) return false;
      if (filter === "warnings" && draft.warnings.length === 0) return false;
      if (filter === "matched" && !draft.contact.existingId) return false;
      if (filter === "updates" && !draft.existingOpportunityId) return false;
      if (filter === "excluded" && !draft.excluded) return false;
      if (columnFilter && draft.column !== columnFilter) return false;
      if (ownerFilter && draft.ownerStaffId !== ownerFilter && !draft.assigneeStaffIds.includes(ownerFilter)) return false;
      if (needle) {
        const hay = `${draft.name} ${draft.contact.name} ${draft.contact.phone} ${draft.contact.email} ${draft.address.raw} ${draft.recordId}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [columnFilter, drafts, filter, ownerFilter, query]);

  const sample = drafts.find(isReadyHubSpotDraft) ?? drafts[0];
  const canImport = summary.blocked === 0 && summary.ready > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Ready" value={summary.ready} tone="good" />
        <Stat label="Needs a fix" value={summary.blocked} tone={summary.blocked ? "bad" : undefined} />
        <Stat label="Left out" value={summary.excluded} />
        <Stat label="Updates" value={summary.updates} hint="already imported" />
        <Stat label="New contacts" value={summary.newContacts} />
        <Stat label="Matched contacts" value={summary.matchedContacts} hint="by phone or email" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SettingsCard>
          <SettingsCardHeader title="Where the deals land" description={`${formatMoney(summary.totalAmount)} across ${summary.ready} deals.`} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By column</p>
              <ul className="space-y-1.5 text-sm">
                {summary.byColumn.length === 0 ? <li className="text-muted-foreground">Nothing yet.</li> : null}
                {summary.byColumn.map((entry) => (
                  <li key={entry.column} className="flex items-center justify-between gap-3">
                    <span>{WORK_COLUMN_LABELS[entry.column]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {entry.count} · {formatMoney(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">By seat</p>
              <ul className="space-y-1.5 text-sm">
                {summary.byOwner.length === 0 ? <li className="text-muted-foreground">Nothing yet.</li> : null}
                {summary.byOwner.map((entry) => (
                  <li key={entry.staffId || "none"} className="flex items-center justify-between gap-3">
                    <span>{entry.name || "No seat"}</span>
                    <span className="tabular-nums text-muted-foreground">{entry.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard>
          <SettingsCardHeader title="Sample board card" description="How the first ready row will look on Jobs." />
          <div className="p-5">{sample ? <SampleCard draft={sample} /> : <p className="text-sm text-muted-foreground">No rows.</p>}</div>
          <div className="border-t border-[#f0ece8] px-5 py-4 text-xs text-muted-foreground">
            Quiet import: no homeowner texts or emails, no owner pings, no call tasks, no automations. Each job gets one
            timeline note naming the HubSpot record, stage, and owner it came from.
          </div>
        </SettingsCard>
      </div>

      <SettingsCard>
        <SettingsCardHeader
          title="Every row"
          description="Change a column, seat, or seed, add or remove people on a job, or untick a row to leave it out. Rows marked red cannot import until fixed."
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
            aria-label="Filter by column"
            value={columnFilter}
            onChange={(event) => setColumnFilter(event.target.value as WorkColumn | "")}
          >
            <option value="">Any column</option>
            {BOARD_COLUMNS.map((column) => (
              <option key={column} value={column}>
                {WORK_COLUMN_LABELS[column]}
              </option>
            ))}
          </select>
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
            placeholder="Search name, phone, address, record…"
            className="h-7 w-full max-w-xs text-xs sm:ml-auto"
          />
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-[#f0ece8] text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">In</th>
                <th className="px-3 py-2 font-medium">Homeowner</th>
                <th className="px-3 py-2 font-medium">Job</th>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">People</th>
                <th className="px-3 py-2 font-medium">Seed</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f6f3f0]">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-muted-foreground">
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
            Import {summary.ready} deal{summary.ready === 1 ? "" : "s"}
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
  draft: HubSpotDealDraft;
  people: StaffMember[];
  staff: StaffMember[];
  onOverride: (line: number, patch: HubSpotRowOverride) => void;
}) {
  const blocked = !draft.excluded && draft.issues.length > 0;
  const assigned = new Set(draft.assigneeStaffIds);
  const seatOptions = people.some((member) => member.id === draft.ownerStaffId)
    ? people
    : [...people, ...staff.filter((member) => member.id === draft.ownerStaffId)];
  const extras = draft.assigneeStaffIds
    .filter((id) => id !== draft.ownerStaffId)
    .map((id) => staff.find((member) => member.id === id) ?? people.find((member) => member.id === id))
    .filter((member): member is StaffMember => Boolean(member));
  const available = people.filter((member) => !assigned.has(member.id));
  const locality = [draft.address.city, draft.address.state].filter(Boolean).join(", ");
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
        <p className="font-medium">{draft.contact.name || <span className="text-muted-foreground">—</span>}</p>
        <p className="text-xs text-muted-foreground">{[draft.contact.phone, draft.contact.email].filter(Boolean).join(" · ")}</p>
        {draft.contact.existingId ? (
          <Badge variant="secondary" className="mt-1 font-normal">
            Existing · {draft.contact.matchedBy}
          </Badge>
        ) : (
          <Badge variant="outline" className="mt-1 font-normal text-muted-foreground">
            New contact
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <p>{draft.name}</p>
        <p className="text-xs text-muted-foreground">
          {draft.stageLabel || "No stage"}
          {draft.pipeline ? ` · ${draft.pipeline}` : ""}
          {draft.recordId ? ` · #${draft.recordId}` : ""}
        </p>
        {draft.existingOpportunityId ? (
          <Badge variant="secondary" className="mt-1 font-normal">
            Updates existing
          </Badge>
        ) : null}
      </td>
      <td className="px-3 py-2 align-top">
        <p>{draft.address.street || <span className="text-muted-foreground">—</span>}</p>
        <p className="text-xs text-muted-foreground">{[locality, draft.address.postalCode].filter(Boolean).join(" ")}</p>
      </td>
      <td className="px-3 py-2 align-top">
        <select
          className={cn(selectClass, "h-7 text-xs")}
          aria-label="Column"
          value={draft.column}
          onChange={(event) => onOverride(draft.line, { column: event.target.value as WorkColumn })}
        >
          {BOARD_COLUMNS.map((column) => (
            <option key={column} value={column}>
              {WORK_COLUMN_LABELS[column]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="min-w-40 space-y-1">
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
              </option>
            ))}
          </select>
          {draft.ownerLabel ? <p className="text-xs text-muted-foreground">was “{draft.ownerLabel}”</p> : null}
          {extras.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {member.name}
                {member.name === draft.projectManagerName ? <span className="text-muted-foreground"> · PM</span> : null}
              </span>
              <button
                type="button"
                className="text-muted-foreground underline-offset-2 hover:underline"
                aria-label={`Remove ${member.name} from this job`}
                onClick={() =>
                  onOverride(draft.line, {
                    assigneeStaffIds: draft.assigneeStaffIds.filter((id) => id !== member.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          {available.length > 0 ? (
            <select
              className={cn(selectClass, "h-7 text-xs")}
              aria-label="Add a person to this job"
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                onOverride(draft.line, { assigneeStaffIds: [...draft.assigneeStaffIds, id] });
              }}
            >
              <option value="">Add a person…</option>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <select
          className={cn(selectClass, "h-7 text-xs")}
          aria-label="Seed"
          value={draft.leadSource}
          onChange={(event) => onOverride(draft.line, { leadSource: event.target.value as LeadSource | "" })}
        >
          <option value="">No seed</option>
          {LEAD_SOURCES.map((source) => (
            <option key={source} value={source}>
              {LEAD_SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
        {draft.sourceLabel ? <p className="mt-0.5 text-xs text-muted-foreground">was “{draft.sourceLabel}”</p> : null}
      </td>
      <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(draft.amount)}</td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        <p>{draft.createdAt.slice(0, 10)}</p>
        {draft.closeDate ? <p>closed {draft.closeDate}</p> : null}
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

function SampleCard({ draft }: { draft: HubSpotDealDraft }) {
  const cue = boardCardCue({
    column: draft.column,
    openedAt: draft.createdAt,
    startedAt: draft.closeDate ?? draft.createdAt,
  });
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{WORK_COLUMN_LABELS[draft.column]}</p>
      <div className="rounded-xl border border-[#ebe7e2] bg-[#fcfbfa] p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{boardCardName(draft.contact.name, draft.name)}</p>
          <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(draft.amount)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {boardCardAddress({ street: draft.address.street, city: draft.address.city, state: draft.address.state }) || draft.name}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{cue.label}</span>
          <span>{draft.assigneeNames.join(", ") || "No seat"}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Seed: {leadSourceLabel(draft.leadSource) || "none"} · from HubSpot stage “{draft.stageLabel || "blank"}”
      </p>
    </div>
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
  result: HubSpotImportResult | null;
  drafts: HubSpotDealDraft[];
  onReset: () => void;
}) {
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const skipped = drafts.filter((draft) => !isReadyHubSpotDraft(draft));
  return (
    <SettingsCard>
      <SettingsCardHeader
        title={result ? "Import finished" : "Importing…"}
        description={result ? "Everything is on the Jobs board and in Contacts." : "Keep this tab open until it finishes."}
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
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Deals added" value={result.created} tone="good" />
              <Stat label="Deals updated" value={result.updated} />
              <Stat label="Contacts added" value={result.contactsCreated} />
              <Stat label="Contacts matched" value={result.contactsMatched} />
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
                  onClick={() => downloadCatalogCsv("hubspot-import-skipped.csv", hubspotSkippedCsv(drafts))}
                >
                  Download the skipped rows
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href="/jobs" />}>
                Open Jobs
              </Button>
              <Button nativeButton={false} variant="outline" className="bg-white" render={<Link href="/contacts" />}>
                Open Contacts
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
