import { formatJobSite } from "@/lib/leads";
import { parseMarket, workMarket } from "@/lib/market";
import type { Json } from "@/lib/supabase/database.types";
import {
  STAGE_LABELS,
  isNorthlineDemoName,
  type Job,
  type JobCustomField,
  type LeadSource,
  type Opportunity,
  type ProjectType,
} from "@/lib/types";

export type JobDraft = Omit<
  Job,
  | "code"
  | "description"
  | "tags"
  | "street"
  | "city"
  | "state"
  | "postalCode"
  | "salesRep"
  | "assigned"
  | "subcontractorIds"
  | "relatedContactIds"
  | "customFields"
  | "projectType"
  | "leadSource"
  | "market"
  | "deletedAt"
  | "deletedReason"
  | "deletedBy"
> &
  Partial<
    Pick<
      Job,
      | "code"
      | "description"
      | "tags"
      | "street"
      | "city"
      | "state"
      | "postalCode"
      | "salesRep"
      | "assigned"
      | "subcontractorIds"
      | "relatedContactIds"
      | "customFields"
      | "projectType"
      | "leadSource"
      | "market"
      | "deletedAt"
      | "deletedReason"
      | "deletedBy"
    >
  >;

export function parseLocation(location: string) {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1] ?? "";
    const stateZip = last.split(/\s+/);
    return {
      street: parts[0] ?? "",
      city: parts.slice(1, -1).join(", "),
      state: stateZip[0] ?? "",
      postalCode: stateZip.slice(1).join(" "),
    };
  }
  if (parts.length === 2) {
    const stateZip = parts[1]?.split(/\s+/) ?? [];
    if ((stateZip[0]?.length ?? 0) === 2) {
      return {
        street: "",
        city: parts[0] ?? "",
        state: stateZip[0] ?? "",
        postalCode: stateZip.slice(1).join(" "),
      };
    }
    return { street: parts[0] ?? "", city: parts[1] ?? "", state: "", postalCode: "" };
  }
  return { street: location.trim(), city: "", state: "", postalCode: "" };
}

export function jobAddress(job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location">) {
  return (
    formatJobSite({
      street: job.street,
      city: job.city,
      state: job.state,
      postalCode: job.postalCode,
    }) || job.location.trim()
  );
}

/** Open the job overlay on Paper — estimates, invoices, and material orders live there. */
export function jobPaperHref(jobId: string) {
  return `/jobs?job=${encodeURIComponent(jobId)}&tab=paper`;
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    next.push(trimmed);
  }
  return next;
}

export function uniqueIds(ids: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

export function customFieldsJson(fields: JobCustomField[]): Json {
  return fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: field.value,
  }));
}

export function parseCustomFields(value: unknown): JobCustomField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { id?: unknown; label?: unknown; value?: unknown };
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) return [];
    return [
      {
        id: typeof row.id === "string" && row.id ? row.id : `cf_${index}`,
        label,
        value: typeof row.value === "string" ? row.value : "",
      },
    ];
  });
}

function inferredTags(opportunity?: Opportunity | null): string[] {
  if (!opportunity) return [];
  const tags: string[] = [];
  if (opportunity.deliveryMethod === "insurance_claim") tags.push("insurance");
  if (opportunity.projectType === "roofing") tags.push("roof");
  if (opportunity.projectType === "restoration") tags.push("restoration");
  if (opportunity.projectType === "remodel") tags.push("remodel");
  if (opportunity.leadSource === "referral") tags.push("referral");
  if (String(opportunity.leadSource) === "storm") tags.push("hail");
  return tags;
}

/** Move `nextPrimaryId` to primary; keep the previous primary as a related contact. */
export function primaryHomeownerPatch(
  job: Pick<Job, "primaryContactId" | "relatedContactIds" | "subcontractorIds">,
  nextPrimaryId: string,
): Partial<Job> | null {
  const next = nextPrimaryId.trim();
  if (!next) return null;
  if (next === (job.primaryContactId ?? "").trim()) return null;
  const previous = (job.primaryContactId ?? "").trim();
  return {
    primaryContactId: next,
    relatedContactIds: uniqueIds([
      ...job.relatedContactIds.filter((id) => id !== next),
      previous,
    ]).filter((id) => id && id !== next),
    subcontractorIds: job.subcontractorIds.filter((id) => id !== next),
  };
}

export function fillJobRecord(job: JobDraft, opportunity?: Opportunity | null): Job {
  const parsed = parseLocation(job.location || "");
  const assigned = uniqueNames(
    job.assigned?.length
      ? job.assigned
      : [job.projectManager, job.superintendent, job.salesRep, opportunity?.estimator].filter(
          (name): name is string => typeof name === "string" && Boolean(name) && !isNorthlineDemoName(name),
        ),
  );
  const related = uniqueIds([
    ...(job.relatedContactIds ?? []),
    opportunity?.referralContactId ?? "",
  ]).filter((id) => id && id !== job.primaryContactId);
  return {
    ...job,
    code: job.code ?? "",
    description: job.description?.trim() || opportunity?.notes?.trim() || "",
    tags: uniqueNames(job.tags?.length ? job.tags : inferredTags(opportunity)),
    street: job.street?.trim() || opportunity?.street?.trim() || parsed.street,
    city: job.city?.trim() || opportunity?.city?.trim() || parsed.city,
    state: job.state?.trim() || opportunity?.state?.trim() || parsed.state,
    postalCode: job.postalCode?.trim() || opportunity?.postalCode?.trim() || parsed.postalCode,
    assigned,
    subcontractorIds: uniqueIds(job.subcontractorIds ?? []),
    relatedContactIds: related,
    customFields: job.customFields ?? [],
    projectType: (job.projectType || opportunity?.projectType || "") as ProjectType | "",
    market: workMarket(job, opportunity),
    leadSource: (job.leadSource || opportunity?.leadSource || "") as LeadSource | "",
    deletedAt: job.deletedAt ?? null,
    deletedReason: job.deletedReason ?? "",
    deletedBy: job.deletedBy ?? "",
    superintendent: isNorthlineDemoName(job.superintendent ?? "") ? "" : (job.superintendent ?? ""),
    salesRep:
      job.salesRep?.trim() && !isNorthlineDemoName(job.salesRep)
        ? job.salesRep.trim()
        : opportunity?.estimator && !isNorthlineDemoName(opportunity.estimator)
          ? opportunity.estimator
          : "",
    location:
      formatJobSite({
        street: job.street?.trim() || opportunity?.street?.trim() || parsed.street,
        city: job.city?.trim() || opportunity?.city?.trim() || parsed.city,
        state: job.state?.trim() || opportunity?.state?.trim() || parsed.state,
        postalCode: job.postalCode?.trim() || opportunity?.postalCode?.trim() || parsed.postalCode,
      }) || job.location,
  };
}

/** Open pipeline cards are jobs for costing — dumpsters, permits, and P&L — not only after Job Sold. */
export function jobDraftFromOpportunity(
  opportunity: Opportunity,
  extras?: { id?: string; ownerStaffId?: string; projectManager?: string },
): JobDraft {
  return {
    id: extras?.id ?? `job_lead_${opportunity.id}`,
    code: opportunity.code,
    opportunityId: opportunity.id,
    name: opportunity.name,
    clientId: opportunity.clientId,
    primaryContactId: opportunity.primaryContactId || null,
    status: opportunity.stage === "lost" ? "on_hold" : "precon",
    contractValue: opportunity.value,
    startDate: (opportunity.createdAt || new Date().toISOString()).slice(0, 10),
    substantialCompletion: null,
    superintendent: "",
    projectManager: extras?.projectManager || opportunity.estimator,
    location: opportunity.location,
    ownerStaffId: extras?.ownerStaffId || opportunity.ownerStaffId,
    description: opportunity.notes ?? "",
    street: opportunity.street,
    city: opportunity.city,
    state: opportunity.state,
    postalCode: opportunity.postalCode,
    projectType: opportunity.projectType,
    market: parseMarket(opportunity.market, opportunity.projectType),
    leadSource: opportunity.leadSource,
    relatedContactIds: opportunity.referralContactId ? [opportunity.referralContactId] : [],
  };
}

export function jobsFromOpenLeads(
  opportunities: Opportunity[],
  jobs: Pick<Job, "opportunityId">[],
): Job[] {
  const linked = new Set(jobs.map((job) => job.opportunityId).filter(Boolean));
  return opportunities
    .filter((opportunity) => opportunity.stage !== "lost" && !linked.has(opportunity.id))
    .map((opportunity) => fillJobRecord(jobDraftFromOpportunity(opportunity), opportunity));
}

export function jobInsertPayload(job: Job, companyId: string, extras?: { id?: string; code?: string }) {
  return {
    ...(extras?.id ? { id: extras.id } : {}),
    company_id: companyId,
    opportunity_id: job.opportunityId,
    name: job.name,
    client_id: job.clientId || null,
    primary_contact_id: job.primaryContactId || null,
    status: job.status,
    contract_value: job.contractValue,
    start_date: job.startDate,
    substantial_completion: job.substantialCompletion,
    superintendent: job.superintendent,
    project_manager: job.projectManager,
    location: job.location,
    owner_staff_id: job.ownerStaffId || null,
    code: extras?.code ?? job.code,
    description: job.description,
    tags: job.tags,
    street: job.street,
    city: job.city,
    state: job.state,
    postal_code: job.postalCode,
    sales_rep: job.salesRep,
    assigned: job.assigned,
    subcontractor_ids: job.subcontractorIds,
    related_contact_ids: job.relatedContactIds,
    custom_fields: customFieldsJson(job.customFields),
    project_type: job.projectType || null,
    lead_source: job.leadSource ?? "",
    market: job.market,
  };
}

export function jobsFilledFromLeads(jobs: Job[], opportunities: Opportunity[]): Job[] {
  const byId = new Map(opportunities.map((item) => [item.id, item]));
  return jobs.map((job) =>
    fillJobRecord(job, job.opportunityId ? (byId.get(job.opportunityId) ?? null) : null),
  );
}

export function jobPatchFromLead(patch: Partial<Opportunity>, job?: Job | null): Partial<Job> {
  const next: Partial<Job> = {};
  if (patch.market !== undefined) next.market = parseMarket(patch.market, patch.projectType ?? job?.projectType);
  if (patch.projectType !== undefined) next.projectType = patch.projectType;
  if (patch.leadSource !== undefined) next.leadSource = patch.leadSource ?? "";
  if (patch.estimator !== undefined) {
    next.salesRep = patch.estimator;
    const currentPm = job?.projectManager?.trim() ?? "";
    const currentRep = job?.salesRep?.trim() ?? "";
    if (!currentPm || currentPm.toLowerCase() === currentRep.toLowerCase()) {
      next.projectManager = patch.estimator;
    }
    if (job) {
      next.assigned = uniqueNames([
        patch.estimator,
        ...job.assigned.filter((name) => {
          const lower = name.trim().toLowerCase();
          return lower !== currentPm.toLowerCase() && lower !== currentRep.toLowerCase();
        }),
      ]);
    }
  }
  if (patch.notes !== undefined) next.description = patch.notes;
  if (patch.street !== undefined) next.street = patch.street;
  if (patch.city !== undefined) next.city = patch.city;
  if (patch.state !== undefined) next.state = patch.state;
  if (patch.postalCode !== undefined) next.postalCode = patch.postalCode;
  if (patch.location !== undefined) next.location = patch.location;
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.value !== undefined) next.contractValue = patch.value;
  if (patch.ownerStaffId !== undefined) next.ownerStaffId = patch.ownerStaffId;
  if (patch.referralContactId !== undefined) {
    next.relatedContactIds = uniqueIds([...(job?.relatedContactIds ?? []), patch.referralContactId ?? ""]);
  }
  return next;
}

export function leadOverviewBackfill(job: Job, opportunity: Opportunity): Partial<Job> | null {
  const filled = fillJobRecord(job, opportunity);
  const next: Partial<Job> = {};
  if (!job.leadSource && filled.leadSource) next.leadSource = filled.leadSource;
  if (!job.projectType && filled.projectType) next.projectType = filled.projectType;
  if (filled.market && filled.market !== job.market) next.market = filled.market;
  if (!job.salesRep && filled.salesRep) next.salesRep = filled.salesRep;
  if (!job.street && filled.street) next.street = filled.street;
  if (!job.city && filled.city) next.city = filled.city;
  if (!job.state && filled.state) next.state = filled.state;
  if (!job.postalCode && filled.postalCode) next.postalCode = filled.postalCode;
  if (!job.description && filled.description) next.description = filled.description;
  if ((!job.assigned || job.assigned.length === 0) && filled.assigned.length) next.assigned = filled.assigned;
  if (filled.relatedContactIds.some((id) => !job.relatedContactIds.includes(id))) {
    next.relatedContactIds = filled.relatedContactIds;
  }
  return Object.keys(next).length ? next : null;
}

function isSyntheticLeadJob(job: Pick<Job, "id">) {
  return job.id.startsWith("job_lead_");
}

export function preferLeadJob(a: Job, b: Job) {
  const aSynth = isSyntheticLeadJob(a) ? 1 : 0;
  const bSynth = isSyntheticLeadJob(b) ? 1 : 0;
  if (aSynth !== bSynth) return aSynth < bSynth ? a : b;
  if (a.contractValue !== b.contractValue) return a.contractValue >= b.contractValue ? a : b;
  return a.id.localeCompare(b.id) <= 0 ? a : b;
}

export function duplicateLeadJobs(jobs: Job[]) {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    if (!job.opportunityId) continue;
    const list = groups.get(job.opportunityId) ?? [];
    list.push(job);
    groups.set(job.opportunityId, list);
  }
  return [...groups.values()]
    .map((group) => {
      const keep = group.reduce(preferLeadJob);
      return { keep, drop: group.filter((job) => job.id !== keep.id) };
    })
    .filter((group) => group.drop.length > 0);
}

/** One board card per lead. A costing job is created with the lead; a reload must not add a second. */
export function dedupeJobsByOpportunity(jobs: Job[]) {
  const extras = new Set(duplicateLeadJobs(jobs).flatMap((group) => group.drop.map((job) => job.id)));
  if (extras.size === 0) return jobs;
  return jobs.filter((job) => !extras.has(job.id));
}

export function remapDroppedJobId(jobId: string | null | undefined, dropped: Map<string, string>) {
  if (!jobId) return jobId ?? null;
  return dropped.get(jobId) ?? jobId;
}

export function isDeletedJob(job: Pick<Job, "deletedAt">) {
  return Boolean(job.deletedAt);
}

/** Drop sample Northline names that leaked onto a live company's jobs. */
export function stripNorthlineCrew(job: Job, keepName: string): Job {
  const assigned = uniqueNames(job.assigned).filter((name) => !isNorthlineDemoName(name));
  const superintendent = isNorthlineDemoName(job.superintendent) ? "" : job.superintendent;
  const projectManager = isNorthlineDemoName(job.projectManager)
    ? keepName.trim() || assigned[0] || ""
    : job.projectManager;
  const salesRep = isNorthlineDemoName(job.salesRep) ? keepName.trim() || "" : job.salesRep;
  if (
    assigned.length === job.assigned.length &&
    assigned.every((name, index) => name === job.assigned[index]) &&
    superintendent === job.superintendent &&
    projectManager === job.projectManager &&
    salesRep === job.salesRep
  ) {
    return job;
  }
  return { ...job, assigned, superintendent, projectManager, salesRep };
}

export function costCenterLabel(job: Job, opportunities: Opportunity[]) {
  const lead = job.opportunityId
    ? opportunities.find((opportunity) => opportunity.id === job.opportunityId)
    : undefined;
  const pipeline =
    lead && lead.stage !== "awarded" && lead.stage !== "lost" ? `${STAGE_LABELS[lead.stage]} · ` : "";
  return `${pipeline}${job.code ? `${job.code} · ` : ""}${job.name}`;
}

export function assignedCrewPatch(assigned: string[], staff: { name: string; role: string }[]): Partial<Job> {
  const names = uniqueNames(assigned);
  const members = names
    .map((name) => staff.find((item) => item.name === name))
    .filter((item): item is { name: string; role: string } => Boolean(item));
  const pm =
    members.find(
      (item) =>
        item.role === "project_manager" ||
        item.role === "company_admin" ||
        item.role === "team_lead" ||
        item.role === "team_admin"
    ) ?? members[0];
  const superintendent =
    members.find((item) => item.role === "superintendent") ?? members[1] ?? members[0];
  return {
    assigned: names,
    projectManager: pm?.name ?? names[0] ?? "",
    superintendent: superintendent?.name ?? names[1] ?? names[0] ?? "",
  };
}

export const JOB_RECORD_EXTRAS: Record<string, Partial<Job>> = {
  job_alvarez_roof: {
    description:
      "Park Hill hail roof. South slope torn off; ice-and-water in the valleys. Dana is out of town until Friday — text photos.",
    tags: ["hail", "insurance", "Park Hill"],
    postalCode: "80207",
    salesRep: "Priya Shah",
    subcontractorIds: ["con_trade_ruiz"],
    relatedContactIds: ["con_summit_al"],
    customFields: [
      { id: "cf_alvarez_claim", label: "Claim number", value: "CLM-4418-19" },
      { id: "cf_alvarez_carrier", label: "Carrier", value: "State Farm" },
      { id: "cf_alvarez_deductible", label: "Deductible", value: "$2,500" },
    ],
    projectType: "roofing",
    leadSource: "sales_team",
  },
  job_hart_water: {
    description:
      "Supply line failed in the upstairs bath. Dry-out is done; kitchen cabinets are a total loss. Rebuild in progress.",
    tags: ["water", "insurance", "Highlands"],
    postalCode: "80211",
    salesRep: "Elena Voss",
    subcontractorIds: ["con_trade_vale"],
    relatedContactIds: ["con_summit_nina"],
    customFields: [
      { id: "cf_hart_claim", label: "Claim number", value: "CLM-8821-04" },
      { id: "cf_hart_carrier", label: "Carrier", value: "USAA" },
      { id: "cf_hart_deductible", label: "Deductible", value: "$1,000" },
    ],
    projectType: "restoration",
    leadSource: "phone",
  },
  job_solano_fire: {
    description: "Kitchen fire. Contents out. Waiting on the engineer letter before we open walls in the addition.",
    tags: ["fire", "insurance"],
    postalCode: "80011",
    salesRep: "Priya Shah",
    relatedContactIds: ["con_summit_al"],
    customFields: [
      { id: "cf_solano_claim", label: "Claim number", value: "CLM-1102-77" },
      { id: "cf_solano_carrier", label: "Carrier", value: "Farmers" },
    ],
    projectType: "restoration",
    leadSource: "phone",
  },
  job_whitfield_bsmt: {
    description: "Bonnie Brae basement finish. Framing is up; mechanical rough next week.",
    tags: ["remodel", "basement"],
    postalCode: "80209",
    salesRep: "Maya Chen",
    projectType: "remodel",
    leadSource: "past_client",
  },
  job_calder_siding: {
    description: "Boulder north elevation at punch. Two window wraps remaining.",
    tags: ["siding", "punch"],
    postalCode: "80302",
    salesRep: "Luis Ortega",
    projectType: "exterior",
    leadSource: "referral",
  },
  job_blake_kitchen: {
    description: "Congress Park kitchen. Temporary kitchen in the dining room until cabinets land Thursday.",
    tags: ["kitchen", "remodel"],
    postalCode: "80206",
    salesRep: "Priya Shah",
    relatedContactIds: ["con_re_brook"],
    projectType: "remodel",
    leadSource: "referral",
  },
  job_redmond_add: {
    description: "Cherry Creek rear addition. Permit set is with Hale + Moss.",
    tags: ["addition", "permit"],
    postalCode: "80206",
    salesRep: "Maya Chen",
    relatedContactIds: ["con_hale_sam"],
    projectType: "addition",
    leadSource: "referral",
  },
  job_ortiz_hail: {
    description: "RiNo hail. On hold — waiting on the carrier to release the supplement.",
    tags: ["hail", "insurance", "on hold"],
    postalCode: "80205",
    salesRep: "Luis Ortega",
    relatedContactIds: ["con_summit_al"],
    customFields: [
      { id: "cf_ortiz_claim", label: "Claim number", value: "CLM-3309-12" },
      { id: "cf_ortiz_carrier", label: "Carrier", value: "Allstate" },
    ],
    projectType: "roofing",
    leadSource: "sales_team",
  },
};
