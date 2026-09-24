import {
  parseMeasurementKeys,
  serializeMeasurementKeys,
} from "@/lib/eagleview-formulas";
import { fillCatalogItem } from "@/lib/catalog-margin";
import {
  isEagleviewProductId,
  parseEagleviewMeasurements,
  type EagleviewConnection,
  type EagleviewOrder,
  type EagleviewOrderStatus,
} from "@/lib/eagleview";
import { fillMaterialOrder, fillMaterialOrderLine } from "@/lib/material-orders";
import { fillVendorFeedback, fillVendorPrice, fillVendorProfile } from "@/lib/vendor-profile";
import { fillMaterialOrderTemplate, fillMaterialOrderTemplateLine } from "@/lib/material-order-templates";
import { parseContractTypes } from "@/lib/contract-types";
import { fillEstimate, fillEstimateLine } from "@/lib/estimate-totals";
import { parseEstimatePackage, parseEstimatePackageMode, parseLinePackage } from "@/lib/estimate-packages";
import { fillEstimateTemplate, fillEstimateTemplateLine } from "@/lib/estimate-templates";
import { parsePageTemplate, parsePhotoReportPages } from "@/lib/photo-report";
import { customFieldsJson, fillJobRecord, parseCustomFields } from "@/lib/job-record";
import { fillCompanyFile, parseCompanyFileCategory } from "@/lib/company-files";
import { parseMarket } from "@/lib/market";
import { storedPhone } from "@/lib/phone";
import { resolveStoredFileUrl, normalizeObjectKey } from "@/lib/storage/urls";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseQbStatus } from "@/lib/types";
import { parseReturningClientStatus } from "@/lib/returning-client";
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
  EstimateSignatureEvent,
  EstimateTemplate,
  EstimateTemplateLine,
  GoogleLocation,
  Invoice,
  InvoiceLine,
  Job,
  JobFile,
  JobPhoto,
  Opportunity,
  Payment,
  PriceList,
  PhotoReport,
  Expense,
  QbReviewComment,
  QbReviewIntent,
  QbReviewKind,
  QbVendor,
  VendorFeedback,
  VendorPrice,
  VendorProfile,
  ScheduleEvent,
  StaffMember,
  Task,
  Team,
  TrainingAttempt,
  TrainingBulletin,
  TrainingProgress,
  TextMessage,
  CompanyProfile,
  MessageThreadMember,
  MessageThreadOpen,
  SeatRole,
  GmailAccount,
  GmailMessage,
  ReturningClientLead,
  MaterialOrder,
  MaterialOrderLine,
  MaterialOrderTemplate,
  MaterialOrderTemplateLine,
} from "@/lib/types";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_OPERATORS,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_TRIGGERS,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRun,
  type AutomationTemplate,
  type AutomationTriggerKind,
} from "@/lib/automations";
import { isWorkColumn } from "@/lib/work-board";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type CatalogRow = Database["public"]["Tables"]["catalog_items"]["Row"];
type PriceListRow = Database["public"]["Tables"]["price_lists"]["Row"];
type EstimateRow = Database["public"]["Tables"]["estimates"]["Row"];
type EstimateLineRow = Database["public"]["Tables"]["estimate_lines"]["Row"];
type EstimateSignatureEventRow = Database["public"]["Tables"]["estimate_signature_events"]["Row"];
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
type GmailAccountRow = Database["public"]["Tables"]["gmail_accounts"]["Row"];
type GmailMessageRow = Database["public"]["Tables"]["gmail_messages"]["Row"];
type TrainingProgressRow = Database["public"]["Tables"]["training_progress"]["Row"];
type TrainingBulletinRow = Database["public"]["Tables"]["training_bulletins"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type ReturningClientLeadRow = Database["public"]["Tables"]["returning_client_leads"]["Row"];
type MaterialOrderRow = Database["public"]["Tables"]["material_orders"]["Row"];
type MaterialOrderLineRow = Database["public"]["Tables"]["material_order_lines"]["Row"];
type MaterialOrderTemplateRow = Database["public"]["Tables"]["material_order_templates"]["Row"];
type MaterialOrderTemplateLineRow = Database["public"]["Tables"]["material_order_template_lines"]["Row"];

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

function parseCompanyContractTypes(row: Partial<CompanyRow>) {
  if (!("contract_types" in row)) return [];
  return parseContractTypes(row.contract_types);
}

export function mapCompany(row: Pick<CompanyRow, "name"> & Partial<CompanyRow>): CompanySettings {
  return {
    name: row.name,
    slug: "slug" in row ? String(row.slug ?? "") : "",
    phone: storedPhone(row.phone),
    email: row.email ?? "",
    website: row.website ?? "",
    street: row.street ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    licenseNumber: row.license_number ?? "",
    logoUrl: resolveStoredFileUrl({
      storagePath: row.logo_storage_path,
      url: row.logo_url,
      kind: "company-assets",
    }),
    logoStoragePath: row.logo_storage_path ?? "",
    cardLogoUrl: resolveStoredFileUrl({
      storagePath: "card_logo_storage_path" in row ? row.card_logo_storage_path : "",
      url: "card_logo_url" in row ? row.card_logo_url : "",
      kind: "company-assets",
    }),
    cardLogoStoragePath:
      "card_logo_storage_path" in row ? String(row.card_logo_storage_path ?? "") : "",
    paymentVenmo: "payment_venmo" in row ? String(row.payment_venmo ?? "") : "",
    paymentZelle: "payment_zelle" in row ? String(row.payment_zelle ?? "") : "",
    paymentCashapp: "payment_cashapp" in row ? String(row.payment_cashapp ?? "") : "",
    paymentPaypal: "payment_paypal" in row ? String(row.payment_paypal ?? "") : "",
    paymentNote: "payment_note" in row ? String(row.payment_note ?? "") : "",
    socialFacebook: "social_facebook" in row ? String(row.social_facebook ?? "") : "",
    socialInstagram: "social_instagram" in row ? String(row.social_instagram ?? "") : "",
    socialYoutube: "social_youtube" in row ? String(row.social_youtube ?? "") : "",
    socialLinkedin: "social_linkedin" in row ? String(row.social_linkedin ?? "") : "",
    socialTiktok: "social_tiktok" in row ? String(row.social_tiktok ?? "") : "",
    defaultEstimateTerms: row.default_estimate_terms ?? null,
    defaultInvoiceTerms: row.default_invoice_terms ?? null,
    contractTypes: parseCompanyContractTypes(row),
    minimumMarginPercent: Number(row.minimum_margin_percent ?? 0),
    defaultEmailSignature:
      "default_email_signature" in row ? String(row.default_email_signature ?? "") : "",
    defaultMonthlySalesQuota: Number(
      "default_monthly_sales_quota" in row ? (row.default_monthly_sales_quota ?? 0) : 0,
    ),
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
    phone: storedPhone(row.phone),
    cardSlug: "card_slug" in row ? String(row.card_slug ?? "") : "",
    photoUrl: resolveStoredFileUrl({
      storagePath: "photo_storage_path" in row ? row.photo_storage_path : "",
      url: "photo_url" in row ? row.photo_url : "",
      kind: "company-assets",
    }),
    photoStoragePath: normalizeObjectKey(
      "photo_storage_path" in row ? String(row.photo_storage_path ?? "") : "",
      "company-assets",
    ),
    googleLocationId:
      "google_location_id" in row ? ((row.google_location_id as string | null) ?? null) : null,
    emailSignature: "email_signature" in row ? String(row.email_signature ?? "") : "",
    monthlySalesQuota:
      "monthly_sales_quota" in row && row.monthly_sales_quota != null
        ? Number(row.monthly_sales_quota)
        : null,
    locked: Boolean(row.locked),
    restricted: Boolean(row.restricted),
    manageAutomations: "manage_automations" in row ? Boolean(row.manage_automations) : false,
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

export function mapGoogleLocation(row: {
  id: string;
  name: string;
  review_url: string | null;
  is_default: boolean | null;
}): GoogleLocation {
  return {
    id: row.id,
    name: row.name,
    reviewUrl: row.review_url ?? "",
    isDefault: Boolean(row.is_default),
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
    name: row.name ?? "",
    title: row.title ?? "",
    email: row.email ?? "",
    phone: storedPhone(row.phone),
    ownerStaffId: row.owner_staff_id ?? "",
    isReferralPartner: Boolean(row.is_referral_partner),
    listingWatchUrl: row.listing_watch_url ?? "",
    listingWatchEnabled: Boolean(row.listing_watch_enabled),
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
    assignedTo: row.assigned_to ?? undefined,
    createdBy: row.created_by ?? undefined,
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
    lat: "lat" in row ? (((row as { lat?: number | null }).lat) ?? null) : null,
    lng: "lng" in row ? (((row as { lng?: number | null }).lng) ?? null) : null,
    geocodedAt:
      "geocoded_at" in row
        ? (((row as { geocoded_at?: string | null }).geocoded_at) ?? null)
        : null,
    geocodeQuery:
      "geocode_query" in row
        ? String((row as { geocode_query?: string | null }).geocode_query ?? "")
        : "",
    salesRep: row.sales_rep ?? "",
    assigned: row.assigned ?? [],
    subcontractorIds: row.subcontractor_ids ?? [],
    relatedContactIds: Array.isArray(row.related_contact_ids)
      ? row.related_contact_ids.filter((id): id is string => typeof id === "string")
      : [],
    customFields: parseCustomFields(row.custom_fields),
    projectType: row.project_type ?? "",
    market: parseMarket(row.market, row.project_type),
    leadSource: (row.lead_source as Job["leadSource"]) ?? "",
    primaryPhotoId:
      "primary_photo_id" in row
        ? (((row as { primary_photo_id?: string | null }).primary_photo_id) ?? null)
        : null,
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
    notes: "notes" in row && typeof row.notes === "string" ? row.notes : "",
    remindedAt:
      "reminded_at" in row && typeof row.reminded_at === "string" ? row.reminded_at : null,
  };
}

export function taskPatch(patch: Partial<Task>) {
  const row: Database["public"]["Tables"]["tasks"]["Update"] = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.dueAt !== undefined) {
    row.due_at = patch.dueAt;
    row.reminded_at = null;
  }
  if (patch.completed !== undefined) row.completed = patch.completed;
  if (patch.relatedType !== undefined) row.related_type = patch.relatedType;
  if (patch.relatedId !== undefined) row.related_id = patch.relatedId;
  if (patch.assignee !== undefined) row.assignee = patch.assignee;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.remindedAt !== undefined) row.reminded_at = patch.remindedAt;
  return row;
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
  if (patch.listingWatchUrl !== undefined) row.listing_watch_url = patch.listingWatchUrl;
  if (patch.listingWatchEnabled !== undefined) row.listing_watch_enabled = patch.listingWatchEnabled;
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
  if (patch.lat !== undefined) row.lat = patch.lat ?? null;
  if (patch.lng !== undefined) row.lng = patch.lng ?? null;
  if (patch.geocodedAt !== undefined) row.geocoded_at = patch.geocodedAt ?? null;
  if (patch.geocodeQuery !== undefined) row.geocode_query = patch.geocodeQuery;
  if (patch.salesRep !== undefined) row.sales_rep = patch.salesRep;
  if (patch.assigned !== undefined) row.assigned = patch.assigned;
  if (patch.subcontractorIds !== undefined) row.subcontractor_ids = patch.subcontractorIds;
  if (patch.relatedContactIds !== undefined) row.related_contact_ids = patch.relatedContactIds;
  if (patch.customFields !== undefined) row.custom_fields = customFieldsJson(patch.customFields);
  if (patch.projectType !== undefined) row.project_type = patch.projectType || null;
  if (patch.market !== undefined) row.market = patch.market;
  if (patch.leadSource !== undefined) row.lead_source = patch.leadSource ?? "";
  if (patch.primaryPhotoId !== undefined) {
    (row as { primary_photo_id?: string | null }).primary_photo_id = patch.primaryPhotoId;
  }
  if (patch.deletedAt !== undefined) row.deleted_at = patch.deletedAt;
  if (patch.deletedReason !== undefined) row.deleted_reason = patch.deletedReason;
  if (patch.deletedBy !== undefined) row.deleted_by = patch.deletedBy;
  return row;
}

export function mapPriceList(row: PriceListRow): PriceList {
  return {
    id: row.id,
    name: row.name,
    effectiveOn: row.effective_on,
    outdatedAt: row.outdated_at,
    createdAt: row.created_at,
  };
}

export function priceListPatch(patch: Partial<PriceList>) {
  const row: Database["public"]["Tables"]["price_lists"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.effectiveOn !== undefined) row.effective_on = patch.effectiveOn;
  if (patch.outdatedAt !== undefined) row.outdated_at = patch.outdatedAt;
  return row;
}

export function mapCatalogItem(row: CatalogRow): CatalogItem {
  return fillCatalogItem({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    kind: row.kind,
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    marginPercent: Number(row.margin_percent ?? 0),
    costCode: row.cost_code,
    priceListId: row.price_list_id ?? null,
  });
}

export function catalogPatch(patch: Partial<CatalogItem>) {
  const row: Database["public"]["Tables"]["catalog_items"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.marginPercent !== undefined) row.margin_percent = patch.marginPercent;
  if (patch.costCode !== undefined) row.cost_code = patch.costCode;
  if (patch.priceListId !== undefined) row.price_list_id = patch.priceListId;
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
    packageMode: parseEstimatePackageMode("package_mode" in row ? String(row.package_mode ?? "") : ""),
    selectedPackage:
      parseEstimatePackage("selected_package" in row ? String(row.selected_package ?? "") : "") ||
      "better",
    marginPercent: "margin_percent" in row && row.margin_percent != null ? Number(row.margin_percent) : 0,
    subtotalOverride:
      "subtotal_override" in row && row.subtotal_override != null
        ? Number(row.subtotal_override)
        : null,
    hideLinePrices: "hide_line_prices" in row ? Boolean(row.hide_line_prices) : false,
    contractTypeId: "contract_type_id" in row ? String(row.contract_type_id ?? "").trim() || null : null,
    archivedAt: "archived_at" in row ? ((row.archived_at as string | null | undefined) ?? null) : null,
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
    quantityFormula: "quantity_formula" in row && row.quantity_formula != null ? String(row.quantity_formula) : "",
    measurementKeys: parseMeasurementKeys(
      "measurement_key" in row && row.measurement_key != null ? String(row.measurement_key) : "",
    ),
    coverageAmount: "coverage_amount" in row && row.coverage_amount != null ? Number(row.coverage_amount) : 1,
    coverageUnit: "coverage_unit" in row && row.coverage_unit != null ? String(row.coverage_unit) : "squares",
    package: parseLinePackage("package" in row ? String(row.package ?? "") : ""),
    photoIds: Array.isArray(row.photo_ids) ? row.photo_ids.map(String) : [],
  });
}

export function mapEstimateSignatureEvent(row: EstimateSignatureEventRow): EstimateSignatureEvent {
  const kind = row.kind;
  return {
    id: row.id,
    companyId: row.company_id,
    estimateId: row.estimate_id,
    kind: kind === "sent" || kind === "opened" || kind === "signed" || kind === "declined" ? kind : "opened",
    signerRole:
      row.signer_role === "primary" || row.signer_role === "second" || row.signer_role === "contractor"
        ? row.signer_role
        : "",
    contactId: row.contact_id,
    signerName: row.signer_name,
    tokenSuffix: row.token_suffix,
    tokenSha256: row.token_sha256,
    ipAddress: row.ip_address,
    forwardedFor: row.forwarded_for,
    userAgent: row.user_agent,
    acceptLanguage: row.accept_language,
    timeZone: row.time_zone,
    deliveryChannel: row.delivery_channel,
    deliveryTo: row.delivery_to,
    consentText: row.consent_text,
    consentVersion: row.consent_version,
    documentSha256: row.document_sha256,
    capturedInOffice: row.captured_in_office,
    staffId: row.staff_id,
    createdAt: row.created_at,
  };
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
    packageMode: parseEstimatePackageMode("package_mode" in row ? String(row.package_mode ?? "") : ""),
    selectedPackage:
      parseEstimatePackage("selected_package" in row ? String(row.selected_package ?? "") : "") ||
      "better",
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
    quantityFormula: "quantity_formula" in row && row.quantity_formula != null ? String(row.quantity_formula) : "",
    measurementKeys: parseMeasurementKeys(
      "measurement_key" in row && row.measurement_key != null ? String(row.measurement_key) : "",
    ),
    coverageAmount: "coverage_amount" in row && row.coverage_amount != null ? Number(row.coverage_amount) : 1,
    coverageUnit: "coverage_unit" in row && row.coverage_unit != null ? String(row.coverage_unit) : "squares",
    package: parseLinePackage("package" in row && row.package != null ? String(row.package) : ""),
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
  if (patch.packageMode !== undefined) row.package_mode = patch.packageMode;
  if (patch.selectedPackage !== undefined) row.selected_package = patch.selectedPackage;
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
  if (patch.quantityFormula !== undefined) row.quantity_formula = patch.quantityFormula;
  if (patch.measurementKeys !== undefined) row.measurement_key = serializeMeasurementKeys(patch.measurementKeys);
  if (patch.coverageAmount !== undefined) row.coverage_amount = patch.coverageAmount;
  if (patch.coverageUnit !== undefined) row.coverage_unit = patch.coverageUnit;
  if (patch.package !== undefined) row.package = patch.package;
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
  if (patch.validUntil !== undefined) row.valid_until = patch.validUntil || null;
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
  if (patch.packageMode !== undefined) row.package_mode = patch.packageMode;
  if (patch.selectedPackage !== undefined) row.selected_package = patch.selectedPackage;
  if (patch.marginPercent !== undefined) row.margin_percent = patch.marginPercent;
  if (patch.subtotalOverride !== undefined) row.subtotal_override = patch.subtotalOverride;
  if (patch.hideLinePrices !== undefined) row.hide_line_prices = patch.hideLinePrices;
  if (patch.contractTypeId !== undefined) row.contract_type_id = patch.contractTypeId;
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
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
  if (patch.photoIds !== undefined) row.photo_ids = patch.photoIds;
  if (patch.package !== undefined) row.package = patch.package;
  if (patch.quantityFormula !== undefined) row.quantity_formula = patch.quantityFormula;
  if (patch.measurementKeys !== undefined) row.measurement_key = serializeMeasurementKeys(patch.measurementKeys);
  if (patch.coverageAmount !== undefined) row.coverage_amount = patch.coverageAmount;
  if (patch.coverageUnit !== undefined) row.coverage_unit = patch.coverageUnit;
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
    qbStatus: parseQbStatus(row.qb_status),
    archivedAt: "archived_at" in row ? ((row.archived_at as string | null | undefined) ?? null) : null,
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
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
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

export function invoiceLinePatch(patch: Partial<InvoiceLine>) {
  const row: Database["public"]["Tables"]["invoice_lines"]["Update"] = {};
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
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
    receiptUrl: resolveStoredFileUrl({
      storagePath: row.receipt_storage_path,
      url: row.receipt_url,
      kind: "receipts",
    }),
    receiptStoragePath: row.receipt_storage_path ?? null,
    qbStatus: parseQbStatus(row.qb_status),
    createdBy: row.created_by ?? "",
    estimateId: row.estimate_id ?? (extraPaymentField(row, "estimate_id") || null),
    postingStatus: parsePaymentPosting(row.posting_status ?? extraPaymentField(row, "posting_status")),
    postedAt: row.posted_at ?? (extraPaymentField(row, "posted_at") || null),
    postedBy: row.posted_by ?? extraPaymentField(row, "posted_by"),
    stripePaymentIntentId:
      row.stripe_payment_intent_id ?? extraPaymentField(row, "stripe_payment_intent_id"),
    stripeCheckoutSessionId:
      row.stripe_checkout_session_id ?? extraPaymentField(row, "stripe_checkout_session_id"),
  };
}

function extraPaymentField(row: PaymentRow, key: string) {
  const value = (row as PaymentRow & Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function parsePaymentPosting(value: string) {
  if (value === "pending" || value === "rejected" || value === "posted") return value;
  return "posted" as const;
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
    receiptUrl: resolveStoredFileUrl({
      storagePath: row.receipt_storage_path,
      url: row.receipt_url,
      kind: "receipts",
    }),
    receiptStoragePath: row.receipt_storage_path,
    qbStatus: parseQbStatus(row.qb_status),
    extractedByAi: Boolean(row.extracted_by_ai),
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function vendorText(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

export function mapQbVendor(row: Database["public"]["Tables"]["qb_vendors"]["Row"]): QbVendor {
  const extra = row as Database["public"]["Tables"]["qb_vendors"]["Row"] & Record<string, unknown>;
  return {
    id: row.id,
    listId: row.list_id,
    name: row.name,
    isActive: row.is_active,
    syncedAt: row.synced_at,
    companyName: vendorText(extra, "company_name"),
    firstName: vendorText(extra, "first_name"),
    lastName: vendorText(extra, "last_name"),
    street: vendorText(extra, "street"),
    street2: vendorText(extra, "street2"),
    city: vendorText(extra, "city"),
    state: vendorText(extra, "state"),
    postalCode: vendorText(extra, "postal_code"),
    phone: vendorText(extra, "phone"),
    altPhone: vendorText(extra, "alt_phone"),
    fax: vendorText(extra, "fax"),
    email: vendorText(extra, "email"),
    contact: vendorText(extra, "contact"),
    accountNumber: vendorText(extra, "account_number"),
    vendorType: vendorText(extra, "vendor_type"),
    terms: vendorText(extra, "terms"),
    taxId: vendorText(extra, "tax_id"),
    creditLimit: vendorText(extra, "credit_limit"),
    balance: vendorText(extra, "balance"),
    notes: vendorText(extra, "notes"),
  };
}

export function mapVendorProfile(row: Database["public"]["Tables"]["vendor_profiles"]["Row"]): VendorProfile {
  return fillVendorProfile({
    id: row.id,
    name: row.name,
    nameKey: row.name_key,
    notes: row.notes,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  });
}

export function mapVendorFeedback(row: Database["public"]["Tables"]["vendor_feedback"]["Row"]): VendorFeedback {
  return fillVendorFeedback({
    id: row.id,
    profileId: row.profile_id,
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
  });
}

export function mapVendorPrice(row: Database["public"]["Tables"]["vendor_prices"]["Row"]): VendorPrice {
  return fillVendorPrice({
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    notes: row.notes,
    sortOrder: row.sort_order,
  });
}

export function vendorProfilePatch(patch: Partial<VendorProfile>) {
  const row: Database["public"]["Tables"]["vendor_profiles"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.nameKey !== undefined) row.name_key = patch.nameKey;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.updatedBy !== undefined) row.updated_by = patch.updatedBy;
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  return row;
}

export function vendorPricePatch(patch: Partial<VendorPrice>) {
  const row: Database["public"]["Tables"]["vendor_prices"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

export function expensePatch(patch: Partial<Expense>) {
  const row: Database["public"]["Tables"]["expenses"]["Update"] = {};
  if (patch.jobId !== undefined) row.job_id = patch.jobId;
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.account !== undefined) row.account = patch.account;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.incurredAt !== undefined) row.incurred_at = patch.incurredAt;
  if (patch.method !== undefined) row.method = patch.method;
  if (patch.memo !== undefined) row.memo = patch.memo;
  if (patch.qbStatus !== undefined) row.qb_status = patch.qbStatus;
  return row;
}

export function paymentPatch(patch: Partial<Payment>) {
  const row: Database["public"]["Tables"]["payments"]["Update"] = {};
  if (patch.invoiceId !== undefined) row.invoice_id = patch.invoiceId;
  if (patch.jobId !== undefined) row.job_id = patch.jobId;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.method !== undefined) row.method = patch.method;
  if (patch.paidAt !== undefined) row.paid_at = patch.paidAt;
  if (patch.reference !== undefined) row.reference = patch.reference;
  if (patch.qbStatus !== undefined) row.qb_status = patch.qbStatus;
  if (patch.postingStatus !== undefined) row.posting_status = patch.postingStatus;
  if (patch.postedAt !== undefined) row.posted_at = patch.postedAt;
  if (patch.postedBy !== undefined) row.posted_by = patch.postedBy;
  if (patch.estimateId !== undefined) row.estimate_id = patch.estimateId;
  return row;
}

function parseReviewKind(value: string): QbReviewKind {
  return value === "expense" || value === "payment" ? value : "invoice";
}

function parseReviewIntent(value: string): QbReviewIntent {
  if (value === "return" || value === "approve" || value === "resubmit") return value;
  return "comment";
}

export function mapQbReviewComment(
  row: Database["public"]["Tables"]["qb_review_comments"]["Row"],
): QbReviewComment {
  return {
    id: row.id,
    kind: parseReviewKind(row.kind),
    recordId: row.record_id,
    body: row.body,
    intent: parseReviewIntent(row.intent),
    authorStaffId: row.author_staff_id,
    authorName: row.author_name,
    mentionedStaffIds: Array.isArray(row.mentioned_staff_ids)
      ? row.mentioned_staff_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    createdAt: row.created_at,
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
    imageUrl: resolveStoredFileUrl({
      storagePath: row.storage_path,
      url: row.image_url,
      kind: "job-photos",
    }),
    storagePath: row.storage_path,
    createdBy: "created_by" in row ? String(row.created_by ?? "") : "",
    deletedAt: "deleted_at" in row ? ((row.deleted_at as string | null) ?? null) : null,
    deletedBy: "deleted_by" in row ? String(row.deleted_by ?? "") : "",
  };
}

export function mapJobFile(row: JobFileRow): JobFile {
  const mimeType =
    "mime_type" in row && typeof row.mime_type === "string"
      ? row.mime_type
      : "content_type" in row && typeof (row as { content_type?: string }).content_type === "string"
        ? String((row as { content_type?: string }).content_type)
        : "";
  const createdBy =
    "created_by" in row && row.created_by != null
      ? String(row.created_by)
      : "uploaded_by" in row && (row as { uploaded_by?: string | null }).uploaded_by
        ? String((row as { uploaded_by?: string | null }).uploaded_by)
        : "";
  return {
    id: row.id,
    jobId: row.job_id ?? "",
    name: row.name,
    mimeType,
    sizeBytes: Number(row.size_bytes) || 0,
    url: resolveStoredFileUrl({
      storagePath: row.storage_path,
      url: row.url,
      kind: "job-files",
    }),
    storagePath: normalizeObjectKey(row.storage_path, "job-files") || row.storage_path,
    createdBy,
    createdAt: row.created_at,
    shareToken:
      "share_token" in row && typeof (row as { share_token?: string | null }).share_token === "string"
        ? String((row as { share_token?: string | null }).share_token ?? "").trim()
        : "",
    sourceCompanyFileId:
      "source_company_file_id" in row
        ? ((row as { source_company_file_id?: string | null }).source_company_file_id ?? null)
        : null,
  };
}

export function mapEstimateFile(row: {
  id: string;
  estimate_id: string;
  name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path: string;
  url: string;
  created_by?: string | null;
  created_at: string;
}): import("@/lib/types").EstimateFile {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    name: row.name,
    mimeType: row.mime_type ?? "",
    sizeBytes: Number(row.size_bytes) || 0,
    url: resolveStoredFileUrl({
      storagePath: row.storage_path,
      url: row.url,
      kind: "estimate-files",
    }),
    storagePath: normalizeObjectKey(row.storage_path, "estimate-files") || row.storage_path,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
  };
}

export function mapInvoiceFile(row: {
  id: string;
  invoice_id: string;
  name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path: string;
  url: string;
  created_by?: string | null;
  created_at: string;
}): import("@/lib/types").InvoiceFile {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    name: row.name,
    mimeType: row.mime_type ?? "",
    sizeBytes: Number(row.size_bytes) || 0,
    url: resolveStoredFileUrl({
      storagePath: row.storage_path,
      url: row.url,
      kind: "invoice-files",
    }),
    storagePath: normalizeObjectKey(row.storage_path, "invoice-files") || row.storage_path,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
  };
}

export function mapCompanyFile(
  row: Database["public"]["Tables"]["company_files"]["Row"],
): import("@/lib/types").CompanyFile {
  const mimeType =
    typeof row.content_type === "string" && row.content_type.trim()
      ? row.content_type
      : "application/octet-stream";
  const storagePath =
    normalizeObjectKey(row.storage_path || "", "company-files") || row.storage_path || "";
  return fillCompanyFile({
    id: row.id,
    name: row.name ?? "",
    category: parseCompanyFileCategory(row.category),
    mimeType,
    sizeBytes: Number(row.size_bytes) || 0,
    url: resolveStoredFileUrl({
      storagePath,
      url: row.url,
      kind: "company-files",
    }),
    storagePath,
    notes: row.notes ?? "",
    createdBy: row.uploaded_by ? String(row.uploaded_by) : "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? row.created_at ?? "",
  });
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
  const record = row as CalendarShareRow & { owner_id?: string | null; viewer_id?: string | null };
  return {
    ownerStaffId: record.owner_staff_id || record.owner_id || "",
    viewerStaffId: record.viewer_staff_id || record.viewer_id || "",
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
    fromNumber: row.from_number ?? "",
    toNumber: row.to_number ?? "",
    body: row.body,
    handle: row.handle,
    status: row.status,
    mediaUrl: row.media_url,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function mapCompanyProfile(row: Database["public"]["Tables"]["profiles"]["Row"]): CompanyProfile {
  return {
    id: row.id,
    staffId: row.staff_id,
    name: row.full_name,
    title: row.title,
    role: row.role as SeatRole,
  };
}

export function mapMessageThreadMember(
  row: Database["public"]["Tables"]["message_thread_members"]["Row"],
): MessageThreadMember {
  return {
    id: row.id,
    companyId: row.company_id,
    threadKey: row.thread_key,
    profileId: row.profile_id,
    addedBy: row.added_by ?? "",
  };
}

export function mapMessageThreadOpen(
  row: Database["public"]["Tables"]["message_thread_opens"]["Row"],
): MessageThreadOpen {
  return {
    id: row.id,
    companyId: row.company_id,
    profileId: row.profile_id,
    threadKey: row.thread_key,
    openedAt: row.opened_at,
  };
}

export function mapGmailAccount(row: GmailAccountRow): GmailAccount {
  return {
    id: row.id,
    staffId: row.staff_id,
    googleEmail: row.google_email,
    linked: row.linked,
    linkedAt: row.linked_at,
    source: row.source === "google" ? "google" : "demo",
  };
}

export function mapGmailMessage(row: GmailMessageRow): GmailMessage {
  return {
    id: row.id,
    accountId: row.account_id,
    gmailId: row.gmail_id,
    threadId: row.thread_id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    ccEmail: "cc_email" in row ? String(row.cc_email ?? "") : "",
    subject: row.subject,
    snippet: row.snippet,
    bodyText: row.body_text,
    receivedAt: row.received_at,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    jobId: row.job_id,
    contactId: row.contact_id,
    relatedContactIds: Array.isArray(row.related_contact_ids) ? row.related_contact_ids : [],
  };
}

export function mapReturningClientLead(row: ReturningClientLeadRow): ReturningClientLead {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    jobId: row.job_id,
    contactId: row.contact_id,
    previousJobId: row.previous_job_id,
    previousStaffId: row.previous_staff_id ?? "",
    previousStaffName: row.previous_staff_name,
    previousJobCode: row.previous_job_code,
    completedAt: row.completed_at,
    openedByStaffId: row.opened_by_staff_id ?? "",
    openedByName: row.opened_by_name,
    status: parseReturningClientStatus(row.status),
    decidedByStaffId: row.decided_by_staff_id,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export function mapMaterialOrder(row: MaterialOrderRow): MaterialOrder {
  return fillMaterialOrder({
    id: row.id,
    number: row.number,
    jobId: row.job_id,
    vendor: row.vendor,
    notes: row.notes,
    neededBy: row.needed_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    archivedAt: "archived_at" in row ? ((row.archived_at as string | null | undefined) ?? null) : null,
  });
}

export function materialOrderPatch(patch: Partial<MaterialOrder>) {
  const row: Database["public"]["Tables"]["material_orders"]["Update"] = {};
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.neededBy !== undefined) row.needed_by = patch.neededBy;
  if (patch.archivedAt !== undefined) row.archived_at = patch.archivedAt;
  return row;
}

export function mapMaterialOrderLine(row: MaterialOrderLineRow): MaterialOrderLine {
  return fillMaterialOrderLine({
    id: row.id,
    materialOrderId: row.material_order_id,
    catalogItemId: row.catalog_item_id,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
  });
}

export function materialOrderLinePatch(patch: Partial<MaterialOrderLine>) {
  const row: Database["public"]["Tables"]["material_order_lines"]["Update"] = {};
  if (patch.catalogItemId !== undefined) row.catalog_item_id = patch.catalogItemId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

export function mapMaterialOrderTemplate(row: MaterialOrderTemplateRow): MaterialOrderTemplate {
  return fillMaterialOrderTemplate({
    id: row.id,
    name: row.name,
    description: row.description,
    vendor: row.vendor,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function materialOrderTemplatePatch(patch: Partial<MaterialOrderTemplate>) {
  const row: Database["public"]["Tables"]["material_order_templates"]["Update"] = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  return row;
}

export function mapMaterialOrderTemplateLine(row: MaterialOrderTemplateLineRow): MaterialOrderTemplateLine {
  return fillMaterialOrderTemplateLine({
    id: row.id,
    templateId: row.template_id,
    catalogItemId: row.catalog_item_id,
    name: row.name,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    sortOrder: row.sort_order,
  });
}

export function materialOrderTemplateLinePatch(patch: Partial<MaterialOrderTemplateLine>) {
  const row: Database["public"]["Tables"]["material_order_template_lines"]["Update"] = {};
  if (patch.catalogItemId !== undefined) row.catalog_item_id = patch.catalogItemId;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.unitCost !== undefined) row.unit_cost = patch.unitCost;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  return row;
}

type EagleviewConnectionRow = Database["public"]["Tables"]["eagleview_connections"]["Row"];
type EagleviewOrderRow = Database["public"]["Tables"]["eagleview_orders"]["Row"];

function parseEagleviewStatus(value: string): EagleviewOrderStatus {
  if (
    value === "queued" ||
    value === "in_progress" ||
    value === "ready" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "queued";
}

export function mapEagleviewConnection(row: EagleviewConnectionRow): EagleviewConnection {
  const product = isEagleviewProductId(row.default_product)
    ? row.default_product
    : "premium_residential";
  return {
    companyId: row.company_id,
    clientId: row.client_id ?? "",
    hasSecret: Boolean(row.client_secret?.trim()),
    sandbox: Boolean(row.sandbox),
    defaultProduct: product,
    webhookToken: row.webhook_token ?? "",
    linked: Boolean(row.linked),
    linkedAt: row.linked_at,
  };
}

export function mapEagleviewOrder(row: EagleviewOrderRow): EagleviewOrder {
  const product = isEagleviewProductId(row.product) ? row.product : "premium_residential";
  const measurements = parseEagleviewMeasurements(row.measurements);
  return {
    id: row.id,
    companyId: row.company_id,
    jobId: row.job_id,
    estimateId: row.estimate_id,
    referenceId: row.reference_id ?? "",
    eagleviewOrderId: row.eagleview_order_id ?? "",
    eagleviewReportId: row.eagleview_report_id ?? "",
    product,
    status: parseEagleviewStatus(row.status),
    statusDetail: row.status_detail ?? "",
    addressLine: row.address_line ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postal_code ?? "",
    claimNumber: row.claim_number ?? "",
    totalSquares: row.total_squares == null ? null : Number(row.total_squares),
    wastePercent: row.waste_percent == null ? null : Number(row.waste_percent),
    pitchSummary: row.pitch_summary ?? measurements.pitchSummary ?? "",
    measurements,
    reportFileId: row.report_file_id,
    reportUrl: row.report_url ?? "",
    appliedEstimateId: row.applied_estimate_id,
    appliedAt: row.applied_at,
    mocked: Boolean(row.mocked),
    orderedBy: row.ordered_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];
type AutomationRunRow = Database["public"]["Tables"]["automation_runs"]["Row"];
type AutomationTemplateRow = Database["public"]["Tables"]["automation_templates"]["Row"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseTriggerKind(value: string): AutomationTriggerKind {
  return (AUTOMATION_TRIGGERS as readonly string[]).includes(value)
    ? (value as AutomationTriggerKind)
    : "job_created";
}

function parseConditions(raw: Json): AutomationCondition[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    const row = asRecord(item);
    const field = String(row.field ?? "");
    const operator = String(row.operator ?? "eq");
    if (!(AUTOMATION_CONDITION_FIELDS as readonly string[]).includes(field)) return [];
    if (!(AUTOMATION_OPERATORS as readonly string[]).includes(operator)) return [];
    return [{
      id: String(row.id ?? `c${index}`),
      field: field as AutomationCondition["field"],
      operator: operator as AutomationCondition["operator"],
      value: String(row.value ?? ""),
    }];
  });
}

function parseActions(raw: Json): AutomationAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index) => {
    const row = asRecord(item);
    const kind = String(row.kind ?? "");
    if (!(AUTOMATION_ACTIONS as readonly string[]).includes(kind)) return [];
    return [{
      id: String(row.id ?? `a${index}`),
      kind: kind as AutomationAction["kind"],
      to: row.to === "rep" || row.to === "staff" || row.to === "customer" ? row.to : undefined,
      staffId: typeof row.staffId === "string" ? row.staffId : undefined,
      body: typeof row.body === "string" ? row.body : undefined,
      subject: typeof row.subject === "string" ? row.subject : undefined,
      title: typeof row.title === "string" ? row.title : undefined,
      dueInDays: typeof row.dueInDays === "number" ? row.dueInDays : undefined,
      url: typeof row.url === "string" ? row.url : undefined,
    }];
  });
}

function parseTriggerConfig(raw: Json): Automation["triggerConfig"] {
  const row = asRecord(raw);
  const stage = typeof row.stage === "string" && isWorkColumn(row.stage) ? row.stage : undefined;
  const days = typeof row.days === "number" ? row.days : Number(row.days);
  return {
    ...(stage ? { stage } : {}),
    ...(Number.isFinite(days) && days > 0 ? { days } : {}),
  };
}

export function mapAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description ?? "",
    triggerKind: parseTriggerKind(row.trigger_kind),
    triggerConfig: parseTriggerConfig(row.trigger_config),
    conditions: parseConditions(row.conditions),
    actions: parseActions(row.actions),
    requiresConfirmation: Boolean(row.requires_confirmation),
    oncePerJob: Boolean(row.once_per_job),
    enabled: Boolean(row.enabled),
    createdByStaffId: row.created_by_staff_id,
    lastFiredAt: row.last_fired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAutomationRun(row: AutomationRunRow): AutomationRun {
  const status = (AUTOMATION_RUN_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as AutomationRun["status"])
    : "scheduled";
  return {
    id: row.id,
    companyId: row.company_id,
    automationId: row.automation_id,
    jobId: row.job_id,
    invoiceId: row.invoice_id,
    estimateId: row.estimate_id,
    eventId: row.event_id,
    status,
    scheduledFor: row.scheduled_for,
    renderedPreview: row.rendered_preview ?? "",
    deliveryStatus: row.delivery_status ?? "",
    errorText: row.error_text ?? "",
    confirmedByStaffId: row.confirmed_by_staff_id,
    confirmedByName: row.confirmed_by_name ?? "",
    decidedAt: row.decided_at,
    dryRun: Boolean(row.dry_run),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAutomationTemplate(row: AutomationTemplateRow): AutomationTemplate {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    triggerKind: parseTriggerKind(row.trigger_kind),
    triggerConfig: parseTriggerConfig(row.trigger_config),
    conditions: parseConditions(row.conditions),
    actions: parseActions(row.actions),
    requiresConfirmation: Boolean(row.requires_confirmation),
    oncePerJob: Boolean(row.once_per_job),
    sortOrder: row.sort_order,
  };
}

export function automationInsertPayload(automation: Automation, companyId: string) {
  return {
    id: automation.id,
    company_id: companyId,
    name: automation.name,
    description: automation.description,
    trigger_kind: automation.triggerKind,
    trigger_config: automation.triggerConfig as Json,
    conditions: automation.conditions as unknown as Json,
    actions: automation.actions as unknown as Json,
    requires_confirmation: automation.requiresConfirmation,
    once_per_job: automation.oncePerJob,
    enabled: automation.enabled,
    created_by_staff_id: automation.createdByStaffId,
    last_fired_at: automation.lastFiredAt,
    updated_at: new Date().toISOString(),
  };
}

export function automationRunInsertPayload(run: AutomationRun) {
  return {
    id: run.id,
    company_id: run.companyId,
    automation_id: run.automationId,
    job_id: run.jobId,
    invoice_id: run.invoiceId,
    estimate_id: run.estimateId,
    event_id: run.eventId,
    status: run.status,
    scheduled_for: run.scheduledFor,
    rendered_preview: run.renderedPreview,
    delivery_status: run.deliveryStatus,
    error_text: run.errorText,
    confirmed_by_staff_id: run.confirmedByStaffId,
    confirmed_by_name: run.confirmedByName,
    decided_at: run.decidedAt,
    dry_run: run.dryRun,
  };
}

