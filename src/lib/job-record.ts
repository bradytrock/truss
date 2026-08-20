import { formatJobSite } from "@/lib/leads";
import type { Json } from "@/lib/supabase/database.types";
import {
  STAGE_LABELS,
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
  if (opportunity.leadSource === "storm") tags.push("hail");
  if (opportunity.leadSource === "referral") tags.push("referral");
  return tags;
}

export function fillJobRecord(job: JobDraft, opportunity?: Opportunity | null): Job {
  const parsed = parseLocation(job.location || "");
  const assigned = uniqueNames(
    job.assigned?.length
      ? job.assigned
      : [job.projectManager, job.superintendent]
  );
  const related = uniqueIds(job.relatedContactIds ?? []).filter(
    (id) => id && id !== job.primaryContactId
  );
  return {
    ...job,
    code: job.code ?? "",
    description: job.description?.trim() ?? "",
    tags: uniqueNames(job.tags?.length ? job.tags : inferredTags(opportunity)),
    street: job.street?.trim() || opportunity?.street?.trim() || parsed.street,
    city: job.city?.trim() || opportunity?.city?.trim() || parsed.city,
    state: job.state?.trim() || opportunity?.state?.trim() || parsed.state,
    postalCode: job.postalCode?.trim() || opportunity?.postalCode?.trim() || parsed.postalCode,
    salesRep: job.salesRep?.trim() || opportunity?.estimator || "",
    assigned,
    subcontractorIds: uniqueIds(job.subcontractorIds ?? []),
    relatedContactIds: related,
    customFields: job.customFields ?? [],
    projectType: (job.projectType || opportunity?.projectType || "") as ProjectType | "",
    leadSource: (job.leadSource || opportunity?.leadSource || "") as LeadSource | "",
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
    superintendent: "Tom Brennan",
    projectManager: extras?.projectManager || opportunity.estimator,
    location: opportunity.location,
    ownerStaffId: extras?.ownerStaffId || opportunity.ownerStaffId,
    description: opportunity.notes ?? "",
    street: opportunity.street,
    city: opportunity.city,
    state: opportunity.state,
    postalCode: opportunity.postalCode,
    projectType: opportunity.projectType,
    leadSource: opportunity.leadSource,
    relatedContactIds: opportunity.referralContactId ? [opportunity.referralContactId] : [],
  };
}

export function jobsFromOpenLeads(opportunities: Opportunity[], jobs: Job[]): Job[] {
  const linked = new Set(jobs.map((job) => job.opportunityId).filter(Boolean));
  return opportunities
    .filter((opportunity) => opportunity.stage !== "lost" && !linked.has(opportunity.id))
    .map((opportunity) => fillJobRecord(jobDraftFromOpportunity(opportunity), opportunity));
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
    leadSource: "storm",
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
    leadSource: "insurance",
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
    leadSource: "insurance",
  },
  job_whitfield_bsmt: {
    description: "Bonnie Brae basement finish. Framing is up; mechanical rough next week.",
    tags: ["remodel", "basement"],
    postalCode: "80209",
    salesRep: "Maya Chen",
    projectType: "remodel",
    leadSource: "repeat",
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
    leadSource: "storm",
  },
};
