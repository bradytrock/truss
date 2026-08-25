import { fillEstimate, fillEstimateLine } from "@/lib/estimate-totals";
import { fillEstimateTemplate, fillEstimateTemplateLine } from "@/lib/estimate-templates";
import { parsePageTemplate, parsePhotoReportPages } from "@/lib/photo-report";
import { customFieldsJson, fillJobRecord, parseCustomFields } from "@/lib/job-record";
import { parseMarket } from "@/lib/market";
import type { Database, Json } from "@/lib/supabase/database.types";
import type {
  Activity,
  CalendarAccount,
  CalendarShare,
  CatalogItem,
  Client,
  CompanySettings,
  Contact,
  Estimate,
  EstimateLine,
  EstimateTemplate,
  EstimateTemplateLine,
  Invoice,
  InvoiceLine,
  Job,
  JobFile,
  JobPhoto,
  Opportunity,
  Payment,
  PhotoReport,
  Expense,
  ScheduleEvent,
  StaffMember,
  Task,
  Team,
  TrainingAttempt,
  TrainingBulletin,
  TrainingProgress,
  TextMessage,
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
type EstimateTemplateRow = Database["public"]["Tables"]["estimate_templates"]["Row"];
type EstimateTemplateLineRow = Database["public"]["Tables"]["estimate_template_lines"]["Row"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceLineRow = Database["public"]["Tables"]["invoice_lines"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type EventRow = Database["public"]["Tables"]["schedule_events"]["Row"];
type PhotoRow = Database["public"]["Tables"]["job_photos"]["Row"];
type JobFileRow = Database["public"]["Tables"]["job_files"]["Row"];
type PhotoReportRow = Database["public"]["Tables"]["photo_reports"]["Row"];
type StaffRow = Database["public"]["Tables"]["team_members"]["Row"];
type TeamRow = Database["public"]["Tables"]["teams"]["Row"];
type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CalendarAccountRow = Database["public"]["Tables"]["calendar_accounts"]["Row"];
type CalendarShareRow = Database["public"]["Tables"]["calendar_shares"]["Row"];
type TrainingProgressRow = Database["public"]["Tables"]["training_progress"]["Row"];
type TrainingBulletinRow = Database["public"]["Tables"]["training_bulletins"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

function stringRecord(value: Json | undefined): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

function mapAttempts(value: Json | undefined, staffId: string): TrainingAttempt[] {
  if (!Array.isArray(value)) return [];
  const attempts: TrainingAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind;
    if (kind !== "chapter" && kind !== "practice" && kind !== "exam") continue;
    if (typeof row.id !== "string") continue;
    attempts.push({
      id: row.id,
      staffId: typeof row.staffId === "string" ? row.staffId : staffId,
      kind,
      chapterId: typeof row.chapterId === "string" ? row.chapterId : null,
      score: Number(row.score) || 0,
      correct: Number(row.correct) || 0,
      total: Number(row.total) || 0,
      passed: Boolean(row.passed),
      createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    });
  }
  return attempts;
}

export function mapCompany(row: Pick<CompanyRow, "name"> & Partial<CompanyRow>): CompanySettings {
  return {
    name: row.name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    street: row.street ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    licenseNumber: row.license_number ?? "",
    logoUrl: row.logo_url ?? "",
    logoStoragePath: row.logo_storage_path ?? "",
    defaultEstimateTerms: row.default_estimate_terms ?? null,
    defaultInvoiceTerms: row.default_invoice_terms ?? null,
  };
}

export function mapStaff(row: StaffRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    role: row.role ?? "project_manager",
    teamId: row.team_id,
    initials: row.initials || row.name.slice(0, 2).toUpperCase(),
    email: row.email ?? "",
    phone: row.phone ?? "",
    locked: Boolean(row.locked),
    restricted: Boolean(row.restricted),
    inviteExpiresAt: row.invite_expires_at ?? null,
    inviteToken: null,
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
    code: row.code || "",
    name: row.name,
    clientId: row.client_id,
    primaryContactId: row.primary_contact_id ?? "",
    stage: row.stage,
    value: Number(row.value),
    bidDueAt: row.bid_due_at,
    preBidWalkAt: row.pre_bid_walk_at,
    location: row.location,
    projectType: row.project_type,
    market: parseMarket(row.market, row.project_type),
    deliveryMethod: row.delivery_method,
    estimator: row.estimator,
    winProbability: row.win_probability,
    nextStep: row.next_step,
    createdAt: row.created_at,
    lostReason: row.lost_reason ?? undefined,
    ownerStaffId: row.owner_staff_id ?? "",
    originatorStaffId: row.originator_staff_id ?? row.owner_staff_id ?? "",
    leadSource: (row.lead_source ?? "") as Opportunity["leadSource"],
    referralContactId: row.referral_contact_id,
    street: row.street ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    notes: row.notes ?? "",
  };
}

export function mapJob(row: JobRow): Job {
  return fillJobRecord({
    id: row.id,
    code: row.code || "",
    opportunityId: row.opportunity_id,
    name: row.name,
    clientId: row.client_id,
    primaryContactId: row.primary_contact_id,
    status: row.status,
    contractValue: Number(row.contract_value),
    startDate: row.start_date,
    substantialCompletion: row.substantial_completion,
    superintendent: row.superintendent,
    projectManager: row.project_manager,
    location: row.location,
    ownerStaffId: row.owner_staff_id ?? "",
    description: row.description ?? "",
    tags: row.tags ?? [],
    street: row.street ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    salesRep: row.sales_rep ?? "",
    assigned: row.assigned ?? [],
    subcontractorIds: row.subcontractor_ids ?? [],
    relatedContactIds: row.related_contact_ids ?? [],
    customFields: parseCustomFields(row.custom_fields),
    projectType: row.project_type ?? "",
    market: parseMarket(row.market, row.project_type),
    leadSource: (row.lead_source as Job["leadSource"]) ?? "",
    deletedAt: row.deleted_at ?? null,
    deletedReason: row.deleted_reason ?? "",
    deletedBy: row.deleted_by ?? "",
  });
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
  if (patch.market !== undefined) row.market = patch.market;
  if (patch.deliveryMethod !== undefined) row.delivery_method = patch.deliveryMethod;
  if (patch.estimator !== undefined) row.estimator = patch.estimator;
  if (patch.winProbability !== undefined) row.win_probability = patch.winProbability;
  if (patch.nextStep !== undefined) row.next_step = patch.nextStep;
  if (patch.lostReason !== undefined) row.lost_reason = patch.lostReason ?? null;
  if (patch.ownerStaffId !== undefined) row.owner_staff_id = patch.ownerStaffId || null;
  if (patch.originatorStaffId !== undefined) row.originator_staff_id = patch.originatorStaffId || null;
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.leadSource !== undefined) row.lead_source = patch.leadSource ?? "";
  if (patch.referralContactId !== undefined) row.referral_contact_id = patch.referralContactId || null;
  if (patch.street !== undefined) row.street = patch.street;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.postalCode !== undefined) row.postal_code = patch.postalCode;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}

export function contactPatch(patch: Partial<Contact>) {
  const row: Database["public"]["Tables"]["contacts"]["Update"] = {};
  if (patch.clientId !== undefined) row.client_id = patch.clientId || null;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.ownerStaffId !== undefined) row.owner_staff_id = patch.ownerStaffId || null;
  if (patch.isReferralPartner !== undefined) row.is_referral_partner = patch.isReferralPartner;
  return row;
}

export function jobPatch(patch: Partial<Job>) {
  const row: Database["public"]["Tables"]["jobs"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.opportunityId !== undefined) row.opportunity_id = patch.opportunityId;
  if (patch.primaryContactId !== undefined) row.primary_contact_id = patch.primaryContactId;
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
  if (patch.code !== undefined) row.code = patch.code;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.street !== undefined) row.street = patch.street;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.postalCode !== undefined) row.postal_code = patch.postalCode;
  if (patch.salesRep !== undefined) row.sales_rep = patch.salesRep;
  if (patch.assigned !== undefined) row.assigned = patch.assigned;
  if (patch.subcontractorIds !== undefined) row.subcontractor_ids = patch.subcontractorIds;
  if (patch.relatedContactIds !== undefined) row.related_contact_ids = patch.relatedContactIds;
  if (patch.customFields !== undefined) row.custom_fields = customFieldsJson(patch.customFields);
  if (patch.projectType !== undefined) row.project_type = patch.projectType || null;
  if (patch.market !== undefined) row.market = patch.market;
  if (patch.leadSource !== undefined) row.lead_source = patch.leadSource ?? "";
  if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt;
  if (patch.deletedReason !== undefined) row.deleted_reason = patch.deletedReason;
  if (patch.deletedBy !== undefined) row.deleted_by = patch.deletedBy;
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

export function catalogPatch(patch: Partial<CatalogItem>) {
  const row: Database["public"]["Tables"]["catalog_items"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.costCode !== undefined) row.cost_code = patch.costCode;
  return row;
}

function adjustmentKind(value: string | null | undefined): "percent" | "amount" {
  return value === "amount" ? "amount" : "percent";
}

export function mapEstimate(row: EstimateRow): Estimate {
  return fillEstimate({
    id: row.id,
    number: row.number,
    name: row.name,
    clientId: row.client_id,
    opportunityId: row.opportunity_id,
    jobId: row.job_id,
    contactId: row.contact_id ?? null,
    secondContactId: row.second_contact_id ?? null,
    status: row.status,
    notes: row.notes,
    validUntil: row.valid_until,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    secondAcceptedAt: row.second_accepted_at ?? null,
    ownerSignedAt: row.owner_signed_at ?? null,
    ownerSignedName: row.owner_signed_name ?? "",
    createdAt: row.created_at,
    taxRate: Number(row.tax_rate ?? 0),
    discountKind: adjustmentKind(row.discount_kind),
    discountValue: Number(row.discount_value ?? 0),
    depositKind: adjustmentKind(row.deposit_kind),
    depositValue: Number(row.deposit_value ?? 0),
    intro: row.intro ?? "",
    terms: row.terms ?? "",
    street: row.street ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    shareToken: row.share_token ?? "",
    secondShareToken: "second_share_token" in row ? String(row.second_share_token ?? "") : "",
    signatureName: row.signature_name ?? "",
    signatureImage: row.signature_image ?? "",
    secondSignatureName: "second_signature_name" in row ? String(row.second_signature_name ?? "") : "",
    secondSignatureImage: "second_signature_image" in row ? String(row.second_signature_image ?? "") : "",
  });
}

export function mapEstimateLine(row: EstimateLineRow): EstimateLine {
  return fillEstimateLine({
    id: row.id,
    estimateId: row.estimate_id,
    catalogItemId: row.catalog_item_id,
    title: row.title ?? "",
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
    groupName: row.group_name ?? "",
    optional: Boolean(row.optional),
    selected: row.selected ?? true,
    taxable: row.taxable ?? true,
  });
}

export function mapEstimateTemplate(row: EstimateTemplateRow): EstimateTemplate {
  return fillEstimateTemplate({
    id: row.id,
    name: row.name,
    description: row.description,
    market: parseMarket(row.market),
    intro: row.intro,
    terms: row.terms,
    notes: row.notes,
    taxRate: Number(row.tax_rate ?? 0),
    discountKind: adjustmentKind(row.discount_kind),
    discountValue: Number(row.discount_value ?? 0),
    depositKind: adjustmentKind(row.deposit_kind),
    depositValue: Number(row.deposit_value ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function mapEstimateTemplateLine(row: EstimateTemplateLineRow): EstimateTemplateLine {
  return fillEstimateTemplateLine({
    id: row.id,
    templateId: row.template_id,
    catalogItemId: row.catalog_item_id,
    title: row.title ?? "",
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
    groupName: row.group_name ?? "",
    optional: Boolean(row.optional),
    selected: row.selected ?? true,
    taxable: row.taxable ?? true,
  });
}

export function estimateTemplatePatch(patch: Partial<EstimateTemplate>) {
  const row: Database["public"]["Tables"]["estimate_templates"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.market !== undefined) row.market = patch.market;
  if (patch.intro !== undefined) row.intro = patch.intro;
  if (patch.terms !== undefined) row.terms = patch.terms;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.taxRate !== undefined) row.tax_rate = patch.taxRate;
  if (patch.discountKind !== undefined) row.discount_kind = patch.discountKind;
  if (patch.discountValue !== undefined) row.discount_value = patch.discountValue;
  if (patch.depositKind !== undefined) row.deposit_kind = patch.depositKind;
  if (patch.depositValue !== undefined) row.deposit_value = patch.depositValue;
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  return row;
}

export function estimateTemplateLinePatch(patch: Partial<EstimateTemplateLine>) {
  const row: Database["public"]["Tables"]["estimate_template_lines"]["Update"] = {};
  if (patch.catalogItemId !== undefined) row.catalog_item_id = patch.catalogItemId;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.groupName !== undefined) row.group_name = patch.groupName;
  if (patch.optional !== undefined) row.optional = patch.optional;
  if (patch.selected !== undefined) row.selected = patch.selected;
  if (patch.taxable !== undefined) row.taxable = patch.taxable;
  return row;
}

export function estimatePatch(patch: Partial<Estimate>) {
  const row: Database["public"]["Tables"]["estimates"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.opportunityId !== undefined) row.opportunity_id = patch.opportunityId;
  if (patch.jobId !== undefined) row.job_id = patch.jobId;
  if (patch.contactId !== undefined) row.contact_id = patch.contactId;
  if (patch.secondContactId !== undefined) row.second_contact_id = patch.secondContactId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.validUntil !== undefined) row.valid_until = patch.validUntil;
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
  if (patch.acceptedAt !== undefined) row.accepted_at = patch.acceptedAt;
  if (patch.secondAcceptedAt !== undefined) row.second_accepted_at = patch.secondAcceptedAt;
  if (patch.ownerSignedAt !== undefined) row.owner_signed_at = patch.ownerSignedAt;
  if (patch.ownerSignedName !== undefined) row.owner_signed_name = patch.ownerSignedName;
  if (patch.taxRate !== undefined) row.tax_rate = patch.taxRate;
  if (patch.discountKind !== undefined) row.discount_kind = patch.discountKind;
  if (patch.discountValue !== undefined) row.discount_value = patch.discountValue;
  if (patch.depositKind !== undefined) row.deposit_kind = patch.depositKind;
  if (patch.depositValue !== undefined) row.deposit_value = patch.depositValue;
  if (patch.intro !== undefined) row.intro = patch.intro;
  if (patch.terms !== undefined) row.terms = patch.terms;
  if (patch.street !== undefined) row.street = patch.street;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.postalCode !== undefined) row.postal_code = patch.postalCode;
  if (patch.shareToken !== undefined) row.share_token = patch.shareToken;
  if (patch.secondShareToken !== undefined) row.second_share_token = patch.secondShareToken;
  if (patch.signatureName !== undefined) row.signature_name = patch.signatureName;
  if (patch.signatureImage !== undefined) row.signature_image = patch.signatureImage;
  if (patch.secondSignatureName !== undefined) row.second_signature_name = patch.secondSignatureName;
  if (patch.secondSignatureImage !== undefined) row.second_signature_image = patch.secondSignatureImage;
  return row;
}

export function estimateLinePatch(patch: Partial<EstimateLine>) {
  const row: Database["public"]["Tables"]["estimate_lines"]["Update"] = {};
  if (patch.catalogItemId !== undefined) row.catalog_item_id = patch.catalogItemId;
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.groupName !== undefined) row.group_name = patch.groupName;
  if (patch.optional !== undefined) row.optional = patch.optional;
  if (patch.selected !== undefined) row.selected = patch.selected;
  if (patch.taxable !== undefined) row.taxable = patch.taxable;
  return row;
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
    terms: row.terms ?? "",
    shareToken: row.share_token?.trim() || "",
    qbStatus: row.qb_status === "entered" ? "entered" : "not_in_qb",
  };
}

export function invoicePatch(patch: Partial<Invoice>) {
  const row: Database["public"]["Tables"]["invoices"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.clientId !== undefined) row.client_id = patch.clientId;
  if (patch.jobId !== undefined) row.job_id = patch.jobId;
  if (patch.estimateId !== undefined) row.estimate_id = patch.estimateId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.issuedAt !== undefined) row.issued_at = patch.issuedAt;
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.terms !== undefined) row.terms = patch.terms;
  if (patch.shareToken !== undefined) row.share_token = patch.shareToken;
  if (patch.qbStatus !== undefined) row.qb_status = patch.qbStatus;
  return row;
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
    jobId: row.job_id ?? null,
    amount: Number(row.amount),
    method: row.method,
    paidAt: row.paid_at,
    reference: row.reference,
    receiptUrl: row.receipt_url ?? "",
    receiptStoragePath: row.receipt_storage_path ?? null,
    qbStatus: row.qb_status === "entered" ? "entered" : "not_in_qb",
    createdBy: row.created_by ?? "",
  };
}

export function mapExpense(row: Database["public"]["Tables"]["expenses"]["Row"]): Expense {
  const account = row.account;
  const method = row.method;
  return {
    id: row.id,
    number: row.number,
    jobId: row.job_id,
    vendor: row.vendor,
    account:
      account === "materials" ||
      account === "subcontractors" ||
      account === "equipment_rental" ||
      account === "dumpsters" ||
      account === "permits" ||
      account === "labor" ||
      account === "fuel" ||
      account === "office" ||
      account === "insurance" ||
      account === "other"
        ? account
        : "other",
    amount: Number(row.amount),
    incurredAt: row.incurred_at,
    method:
      method === "credit_card" ||
      method === "debit" ||
      method === "check" ||
      method === "ach" ||
      method === "cash"
        ? method
        : "credit_card",
    memo: row.memo,
    receiptUrl: row.receipt_url,
    receiptStoragePath: row.receipt_storage_path,
    qbStatus: row.qb_status === "entered" ? "entered" : "not_in_qb",
    extractedByAi: Boolean(row.extracted_by_ai),
    createdAt: row.created_at,
    createdBy: row.created_by,
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
    createdBy: "created_by" in row ? String(row.created_by ?? "") : "",
  };
}

export function mapJobFile(row: JobFileRow): JobFile {
  return {
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    mimeType: row.mime_type ?? "",
    sizeBytes: Number(row.size_bytes) || 0,
    url: row.url,
    storagePath: row.storage_path,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
  };
}

export function mapPhotoReport(row: PhotoReportRow): PhotoReport {
  return {
    id: row.id,
    jobId: row.job_id,
    title: row.title,
    pages: parsePhotoReportPages(row.pages),
    template: parsePageTemplate("template" in row ? row.template : "photos"),
    shareToken: "share_token" in row ? String(row.share_token ?? "") : "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  };
}

export function mapCalendarAccount(row: CalendarAccountRow): CalendarAccount {
  return {
    staffId: row.staff_id,
    googleEmail: row.google_email,
    calendarId: row.google_calendar_id,
    linked: row.linked,
    linkedAt: row.linked_at,
    shareWithTeam: row.share_with_team,
    source: row.source,
  };
}

export function mapCalendarShare(row: CalendarShareRow): CalendarShare {
  return {
    ownerStaffId: row.owner_staff_id,
    viewerStaffId: row.viewer_staff_id,
  };
}

export function mapTrainingProgress(row: TrainingProgressRow): TrainingProgress {
  return {
    staffId: row.staff_id,
    read: stringRecord(row.read),
    badges: stringRecord(row.badges),
    attempts: mapAttempts(row.attempts, row.staff_id),
  };
}

export function mapTrainingBulletin(row: TrainingBulletinRow): TrainingBulletin {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    author: row.author,
    createdAt: row.created_at,
  };
}

export function mapMessage(row: MessageRow): TextMessage {
  return {
    id: row.id,
    contactId: row.contact_id,
    jobId: row.job_id,
    opportunityId: row.opportunity_id,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    phone: row.phone,
    body: row.body,
    handle: row.handle,
    status: row.status,
    mediaUrl: row.media_url,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}
