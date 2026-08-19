import type { Database } from "@/lib/supabase/database.types";
import type {
  Activity,
  CatalogItem,
  Client,
  Contact,
  Estimate,
  EstimateLine,
  Invoice,
  InvoiceLine,
  Job,
  JobPhoto,
  Opportunity,
  Payment,
  ScheduleEvent,
  StaffMember,
  Task,
  Team,
} from "@/lib/types";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type CatalogRow = Database["public"]["Tables"]["catalog_items"]["Row"];
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type EstimateLineRow = Database["public"]["Tables"]["estimate_lines"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLineRow = Database["public"]["Tables"]["invoice_lines"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type EventRow = Database["public"]["Tables"]["schedule_events"]["Row"];
type PhotoRow = Database["public"]["Tables"]["job_photos"]["Row"];
type StaffRow = Database["public"]["Tables"]["team_members"]["Row"];
type TeamRow = Database["public"]["Tables"]["teams"]["Row"];

export function mapStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    role: row.role ?? "project_manager",
    teamId: row.team_id,
    initials: row.initials || row.name.slice(0, 2).toUpperCase(),
  };
}

export function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    leadStaffId: row.lead_staff_id ?? "",
  };
}

export function mapClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    city: row.city,
    state: row.state,
    notes: row.notes,
  };
}

export function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    title: row.title,
    email: row.email,
    phone: row.phone,
    ownerStaffId: row.owner_staff_id ?? "",
    isReferralPartner: row.is_referral_partner,
  };
}

export function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    primaryContactId: row.primary_contact_id ?? "",
    stage: row.stage,
    value: Number(row.value),
    bidDueAt: row.bid_due_at,
    preBidWalkAt: row.pre_bid_walk_at,
    location: row.location,
    projectType: row.project_type,
    deliveryMethod: row.delivery_method,
    estimator: row.estimator,
    winProbability: row.win_probability,
    nextStep: row.next_step,
    createdAt: row.created_at,
    lostReason: row.lost_reason ?? undefined,
    ownerStaffId: row.owner_staff_id ?? "",
  };
}

export function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    name: row.name,
    clientId: row.client_id,
    status: row.status,
    contractValue: Number(row.contract_value),
    startDate: row.start_date,
    substantialCompletion: row.substantial_completion,
    superintendent: row.superintendent,
    projectManager: row.project_manager,
    location: row.location,
    ownerStaffId: row.owner_staff_id ?? "",
  };
}

export function mapActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    body: row.body,
    createdAt: row.created_at,
    author: row.author,
  };
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    completed: row.completed,
    relatedType: row.related_type,
    relatedId: row.related_id,
    assignee: row.assignee,
  };
}

export function opportunityPatch(patch: Partial<Opportunity>) {
  const row: Database["public"]["Tables"]["opportunities"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.primaryContactId !== undefined) {
    row.primary_contact_id = patch.primaryContactId || null;
  }
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.value !== undefined) row.value = patch.value;
  if (patch.bidDueAt !== undefined) row.bid_due_at = patch.bidDueAt;
  if (patch.preBidWalkAt !== undefined) row.pre_bid_walk_at = patch.preBidWalkAt;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.projectType !== undefined) row.project_type = patch.projectType;
  if (patch.deliveryMethod !== undefined) row.delivery_method = patch.deliveryMethod;
  if (patch.estimator !== undefined) row.estimator = patch.estimator;
  if (patch.winProbability !== undefined) row.win_probability = patch.winProbability;
  if (patch.nextStep !== undefined) row.next_step = patch.nextStep;
  if (patch.lostReason !== undefined) row.lost_reason = patch.lostReason ?? null;
  if (patch.ownerStaffId !== undefined) row.owner_staff_id = patch.ownerStaffId || null;
  return row;
}

export function jobPatch(patch: Partial<Job>) {
  const row: Database["public"]["Tables"]["jobs"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.opportunityId !== undefined) row.opportunity_id = patch.opportunityId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.contractValue !== undefined) row.contract_value = patch.contractValue;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.substantialCompletion !== undefined) {
    row.substantial_completion = patch.substantialCompletion;
  }
  if (patch.superintendent !== undefined) row.superintendent = patch.superintendent;
  if (patch.projectManager !== undefined) row.project_manager = patch.projectManager;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.ownerStaffId !== undefined) row.owner_staff_id = patch.ownerStaffId || null;
  return row;
}

export function mapCatalogItem(row: CatalogRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    costCode: row.cost_code,
  };
}

export function mapEstimate(row: EstimateRow): Estimate {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    jobId: row.job_id,
    status: row.status,
    notes: row.notes,
    validUntil: row.valid_until,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

export function mapEstimateLine(row: EstimateLineRow): EstimateLine {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    catalogItemId: row.catalog_item_id,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
  };
}

export function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    clientId: row.client_id,
    jobId: row.job_id,
    estimateId: row.estimate_id,
    status: row.status,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    notes: row.notes,
  };
}

export function mapInvoiceLine(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
  };
}

export function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    amount: Number(row.amount),
    method: row.method,
    paidAt: row.paid_at,
    reference: row.reference,
  };
}

export function mapScheduleEvent(row: EventRow): ScheduleEvent {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    assignee: row.assignee,
    opportunityId: row.opportunity_id,
    jobId: row.job_id,
    clientId: row.client_id,
    notes: row.notes,
  };
}

export function mapJobPhoto(row: PhotoRow): JobPhoto {
  return {
    id: row.id,
    jobId: row.job_id,
    caption: row.caption,
    category: row.category,
    takenAt: row.taken_at,
    imageUrl: row.image_url,
    storagePath: row.storage_path,
  };
}
