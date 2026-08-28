"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { derivedInvoiceStatus, nextNumber } from "@/lib/money";
import { fetchCompanyBook } from "@/lib/supabase/load-book";
import type { Database, Json } from "@/lib/supabase/database.types";
import { retireDemoStaff, scrubNorthlineCrewFromJobs } from "@/lib/supabase/retire-demo-staff";
import { isRequiredClientId, requiredClientIdMessage, isMissingEstimateWriter, missingEstimateWriterMessage, isMissingEstimateLinePhotos, missingEstimateLinePhotosMessage, isMissingShareToken, isInvalidEnumValue, missingResidentialEnumsMessage, legacyDeliveryMethod, legacyProjectType, isMissingFinancials, missingFinancialsMessage, isMissingOriginator, missingOriginatorMessage, isMissingPrimaryContactColumn, missingPrimaryContactMessage, missingJobOverviewMessage, isMissingMarketColumn, missingMarketMessage, isMissingLogoColumn, missingLogoMessage, isMissingCompanyDocumentTermsColumns, isMissingInvoiceTermsColumn, missingDocumentTermsMessage, isMissingSignatureColumn, missingSignatureMessage, isAmbiguousSignJobId, ambiguousSignJobIdMessage, isMissingStaffPhoneColumn, missingStaffPhoneMessage, isMissingSecondSigner, missingSecondSignerMessage, isMissingOwnerSignature, missingOwnerSignatureMessage, isMissingDeletedColumn, missingDeletedColumnMessage, isMissingPhotoCreatedBy, missingPhotoCreatedByMessage, isUuidSyntaxError, actorUuid, isMissingMessages, missingMessagesMessage, isMissingJobFiles, missingJobFilesMessage, isMissingSignerLinks, missingSignerLinksMessage, isMissingQbReview, missingQbReviewMessage, isMissingQbReviewMentions, missingQbReviewMentionsMessage, isMissingMaterialOrders, missingMaterialOrdersMessage } from "@/lib/supabase/schema-errors";
import { insertJobWithFallbacks, jobInsertError, omitPrimaryContact } from "@/lib/supabase/job-insert";
import { newShareToken } from "@/lib/share";
import { fillJobRecord, jobDraftFromOpportunity, jobsFromOpenLeads, parseLocation, type JobDraft, dedupeJobsByOpportunity, duplicateLeadJobs, remapDroppedJobId, jobInsertPayload, jobsFilledFromLeads, jobPatchFromLead, leadOverviewBackfill } from "@/lib/job-record";
import {
  amountForEstimate,
  contractValueForOpportunity,
  fillEstimate,
  fillEstimateLine,
  invoiceLinesFromEstimate,
} from "@/lib/estimate-totals";
import { mergePaymentTerms, lockedTermsChanged, resolveEstimateTerms, resolveInvoiceTerms } from "@/lib/document-terms";
import { matchCatalogItem, type CatalogImportDraft } from "@/lib/catalog-csv";
import { fillMaterialOrder, fillMaterialOrderLine, lineFromCatalogItem } from "@/lib/material-orders";
import {
  fillMaterialOrderTemplate,
  fillMaterialOrderTemplateLine,
  isMissingMaterialOrderTemplates,
  materialOrderLinesFromTemplate,
  missingMaterialOrderTemplatesMessage,
  templateFromMaterialOrder,
  templateLineFromCatalogItem,
} from "@/lib/material-order-templates";
import {
  estimateNeedsSecondSignature,
  mintEstimateSignerTokens,
  nextEstimateSignature,
  resolveProjectOwner,
  type HomeownerSigner,
} from "@/lib/estimate-signers";
import {
  estimateFieldsFromTemplate,
  estimateLinesFromTemplate,
  fillEstimateTemplate,
  fillEstimateTemplateLine,
  isMissingEstimateTemplates,
  missingEstimateTemplatesMessage,
  templateFromEstimate,
} from "@/lib/estimate-templates";
import {
  defaultTitleForRole,
  inviteExpiry,
  inviteSignupUrl,
  isDuplicateStaffEmail,
  isMissingAccountManagement,
  missingAccountManagementMessage,
  newInviteToken,
  normalizeSeatEmail,
  wouldLeaveNoAdmin,
} from "@/lib/accounts";
import { isPublicAppPath } from "@/lib/auth-paths";
import { defaultTaxRateForMarket, isResidentialMarket, marketForEstimate, parseMarket, projectTypeForMarket, workMarket } from "@/lib/market";
import { COMPANY_ASSETS_BUCKET, logoExtension, validateLogoFile } from "@/lib/company-logo";
import {
  isImageFile,
  isMissingStorageBucket,
  isPdfFile,
  readFileDataUrl,
  withJobFileField,
  withoutJobFileId,
} from "@/lib/job-files";
import { patchForWorkColumn, workColumnFor, type WorkColumn } from "@/lib/work-board";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { findStaffForProfile, isUnsignedDemo, namesMatch, staffMemberFromProfile } from "@/lib/seats";
import {
  jobPatch,
  contactPatch,
  estimatePatch,
  estimateLinePatch,
  invoicePatch,
  mapActivity,
  mapClient,
  mapCatalogItem,
  catalogPatch,
  mapCompany,
  mapContact,
  mapEstimate,
  mapEstimateLine,
  mapEstimateTemplate,
  estimateTemplatePatch,
  estimateTemplateLinePatch,
  mapInvoice,
  mapJob,
  mapJobPhoto,
  mapJobFile,
  mapPhotoReport,
  mapOpportunity,
  mapPayment,
  mapExpense,
  expensePatch,
  mapMaterialOrder,
  mapMaterialOrderLine,
  materialOrderPatch,
  materialOrderLinePatch,
  mapMaterialOrderTemplate,
  mapMaterialOrderTemplateLine,
  materialOrderTemplatePatch,
  materialOrderTemplateLinePatch,
  paymentPatch,
  invoiceLinePatch,
  mapQbReviewComment,
  mapScheduleEvent,
  mapStaff,
  mapTask,
  mapTrainingBulletin,
  mapMessage,
  opportunityPatch,
} from "@/lib/supabase/mappers";
import { expenseRequiresJob } from "@/lib/qbwc/work";
import {
  NORTHLINE_COMPANY,
  STAGE_LABELS,
  STAGE_PROBABILITY,
  initialsFromName,
  staffByName,
  type ActivityType,
  type CalendarAccount,
  type CalendarShare,
  type Client,
  type CatalogItem,
  type CatalogKind,
  type CompanySettings,
  type Contact,
  type CrmState,
  type CurrentUser,
  type Estimate,
  type EstimateLine,
  type EstimateTemplate,
  type EstimateTemplateLine,
  type Invoice,
  type Job,
  type JobFile,
  type Opportunity,
  type PhotoCategory,
  type PhotoReport,
  type PipelineStage,
  type ScheduleEvent,
  type SeatRole,
  type StaffMember,
  type TrainingBulletin,
  type TrainingProgress,
  type Expense,
  type ExpenseAccount,
  type ExpenseMethod,
  type MaterialOrder,
  type MaterialOrderLine,
  type MaterialOrderTemplate,
  type MaterialOrderTemplateLine,
  type InvoiceLine,
  type Payment,
  type QbReviewComment,
  type QbReviewIntent,
  type QbReviewKind,
  type QbSyncStatus,
  type TextMessage,
} from "@/lib/types";
import {
  accountForStaff,
  clearLocalCalendar,
  demoGoogleEmail,
  readLocalCalendar,
  writeLocalCalendar,
} from "@/lib/calendar";
import {
  clearLocalTraining,
  readLocalTraining,
  writeLocalTraining,
} from "@/lib/training/persist";
import {
  lessonKey,
  recordAttempt,
  staffProgress,
  type QuizKind,
} from "@/lib/training/engine";
import {
  backfillRecordCodes,
  codeInsertError,
  existingRecordCodes,
  isMissingCodeColumn,
  missingCodeColumnMessage,
  nextJobCode,
  payloadWithoutCode,
} from "@/lib/job-code";
import { formatJobSite } from "@/lib/leads";
import { defaultEstimateValidUntil, localYmd } from "@/lib/format";
import { fillPayment, fileToDataUrl } from "@/lib/job-financials";
import {
  contactForPhone,
  jobForContact,
  opportunityForContact,
  outboundActivityBody,
} from "@/lib/job-messages";
import { toE164 } from "@/lib/phone";
import { resolveCustomerName, type CustomerRecord } from "@/lib/parties";
import { isMissingPhotoReports, missingPhotoReportsMessage, missingPageShareMessage, isMissingPageShare, parsePageTemplate } from "@/lib/photo-report";
import { canDeleteJobs, canLoginAs, canManageSettings, loginAsTargets, scopeBook, scopeDescription } from "@/lib/visibility";

const emptyState: CrmState = {
  staff: [],
  teams: [],
  clients: [],
  contacts: [],
  opportunities: [],
  jobs: [],
  activities: [],
  tasks: [],
  catalog: [],
  estimates: [],
  estimateLines: [],
  estimateTemplates: [],
  estimateTemplateLines: [],
  invoices: [],
  invoiceLines: [],
  payments: [],
  events: [],
  photos: [],
  jobFiles: [],
  photoReports: [],
  expenses: [],
  materialOrders: [],
  materialOrderLines: [],
  materialOrderTemplates: [],
  materialOrderTemplateLines: [],
  qbVendors: [],
  qbReviewComments: [],
  calendarAccounts: [],
  calendarShares: [],
  trainingProgress: [],
  trainingBulletins: [],
  messages: [],
};

function userFromStaff(
  staff: StaffMember,
  extras: { id: string; companyId: string; company: string }
): CurrentUser {
  return {
    id: extras.id,
    companyId: extras.companyId,
    staffId: staff.id,
    name: staff.name,
    title: staff.title,
    company: extras.company,
    initials: staff.initials || initialsFromName(staff.name),
    role: staff.role,
    teamId: staff.teamId,
  };
}

const guestUser: CurrentUser = {
  id: "",
  companyId: "",
  staffId: "",
  name: "Guest",
  title: "",
  company: "Truss",
  initials: "TR",
  role: "project_manager",
  teamId: null,
};

const DEMO_STAFF_KEY = "truss.demoStaffId";
const COMPANY_SETTINGS_KEY = "truss.companySettings";

function allocateCode(
  creatorName: string,
  jobs: Job[],
  opportunities: Opportunity[],
  inherit?: string,
) {
  if (inherit) return inherit;
  return nextJobCode(creatorName, new Date(), existingRecordCodes([...jobs, ...opportunities]));
}

function readLocalCompany(): CompanySettings {
  try {
    const raw = window.localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (!raw) return structuredClone(NORTHLINE_COMPANY);
    const parsed = JSON.parse(raw) as Partial<CompanySettings>;
    return {
      ...NORTHLINE_COMPANY,
      ...parsed,
      name: parsed.name?.trim() || NORTHLINE_COMPANY.name,
    };
  } catch {
    return structuredClone(NORTHLINE_COMPANY);
  }
}

function writeLocalCompany(settings: CompanySettings) {
  try {
    window.localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode
  }
}

function requireClient() {
  if (!isSupabaseConfigured()) {
    toast.message("Connect a Supabase project first, then sign in.");
    return null;
  }
  return createClient();
}

function maybeClient() {
  if (!isSupabaseConfigured()) return null;
  return createClient();
}

function applyPaymentOnlyTerms<T extends object>(
  patch: T,
  existingTerms: string | undefined,
): T | null {
  if (!("terms" in patch) || (patch as { terms?: unknown }).terms === undefined) return patch;
  const proposed = String((patch as { terms?: unknown }).terms ?? "");
  const existing = existingTerms ?? "";
  const merged = mergePaymentTerms(existing, proposed);
  if (merged === existing) {
    if (proposed !== existing && lockedTermsChanged(existing, proposed)) {
      toast.error("Company terms stay locked. Only the payment sections on this document can change.");
    }
    const next = { ...patch };
    delete (next as { terms?: unknown }).terms;
    return Object.keys(next).length > 0 ? next : null;
  }
  if (proposed !== merged && lockedTermsChanged(existing, proposed)) {
    toast.error("Company terms stay locked. Only the payment sections on this document can change.");
  }
  return { ...patch, terms: merged };
}

type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];

async function insertInvoiceRow(
  supabase: NonNullable<ReturnType<typeof maybeClient>>,
  payload: InvoiceInsert,
) {
  let { data, error } = await supabase.from("invoices").insert(payload).select("*").single();
  if (error && isMissingInvoiceTermsColumn(error)) {
    const { terms: _terms, ...rest } = payload;
    const retry = await supabase.from("invoices").insert(rest).select("*").single();
    data = retry.data;
    error = retry.error;
    if (!error) toast.message(missingDocumentTermsMessage());
  }
  if (error && isMissingShareToken(error)) {
    const retry = await supabase
      .from("invoices")
      .insert({
        company_id: payload.company_id,
        number: payload.number,
        name: payload.name,
        client_id: payload.client_id,
        job_id: payload.job_id,
        estimate_id: payload.estimate_id,
        status: payload.status,
        issued_at: payload.issued_at,
        due_at: payload.due_at,
        notes: payload.notes,
      })
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }
  return { data, error };
}

function withCreatedByRetry<T extends { created_by?: string | null }>(
  payload: T,
  user: Pick<CurrentUser, "id" | "staffId">,
  error: { message?: string; code?: string } | null | undefined,
): T | null {
  if (!error || !isUuidSyntaxError(error)) return null;
  const uuid = actorUuid(user);
  if (uuid) return { ...payload, created_by: uuid };
  const { created_by: _createdBy, ...rest } = payload;
  return rest as T;
}

function siteFromLinked(
  jobId: string | null | undefined,
  opportunityId: string | null | undefined,
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const job = jobId ? jobs.find((item) => item.id === jobId) : undefined;
  if (job && (job.street.trim() || job.city.trim() || job.location.trim())) {
    if (job.street.trim() || job.city.trim()) {
      return {
        street: job.street,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
      };
    }
    return parseLocation(job.location);
  }
  const opportunity = opportunityId
    ? opportunities.find((item) => item.id === opportunityId)
    : undefined;
  if (opportunity) {
    if (opportunity.street?.trim() || opportunity.city?.trim()) {
      return {
        street: opportunity.street ?? "",
        city: opportunity.city ?? "",
        state: opportunity.state ?? "",
        postalCode: opportunity.postalCode ?? "",
      };
    }
    return parseLocation(opportunity.location);
  }
  return { street: "", city: "", state: "", postalCode: "" };
}

async function persistOpenLeadJobs(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  opportunities: Opportunity[],
  jobs: Job[],
) {
  const { data: existingRows } = await supabase
    .from("jobs")
    .select("opportunity_id")
    .eq("company_id", companyId);
  const known = [
    ...jobs,
    ...(existingRows ?? [])
      .filter((row) => row.opportunity_id)
      .map((row) => ({ opportunityId: row.opportunity_id as string })),
  ];
  const missing = jobsFromOpenLeads(opportunities, known);
  for (const job of missing) {
    const payload = jobInsertPayload(job, companyId);
    // Unique on opportunity_id (23505) means this lead already has a costing job.
    await insertJobWithFallbacks(payload, async (row) => {
      const { error } = await supabase.from("jobs").insert(row as never);
      return { data: null, error };
    });
  }
  return missing.length;
}

async function persistLeadFieldsOnJobs(
  supabase: ReturnType<typeof createClient>,
  jobs: Job[],
  opportunities: Opportunity[],
) {
  const byId = new Map(opportunities.map((item) => [item.id, item]));
  let updated = 0;
  const nextJobs = [...jobs];
  for (let index = 0; index < nextJobs.length; index += 1) {
    const job = nextJobs[index];
    const opportunity = job.opportunityId ? byId.get(job.opportunityId) : undefined;
    if (!opportunity) continue;
    const patch = leadOverviewBackfill(job, opportunity);
    if (!patch) continue;
    const { error } = await supabase.from("jobs").update(jobPatch(patch)).eq("id", job.id);
    if (error) continue;
    nextJobs[index] = fillJobRecord({ ...job, ...patch }, opportunity);
    updated += 1;
  }
  return { jobs: nextJobs, updated };
}

async function pruneDuplicateLeadJobs(supabase: ReturnType<typeof createClient>, jobs: Job[]) {
  const groups = duplicateLeadJobs(jobs);
  if (groups.length === 0) return { jobs, dropped: new Map<string, string>() };
  const dropped = new Map<string, string>();
  for (const { keep, drop } of groups) {
    for (const extra of drop) {
      dropped.set(extra.id, keep.id);
      const tables = [
        "estimates",
        "invoices",
        "payments",
        "expenses",
        "schedule_events",
        "job_photos",
        "job_files",
        "photo_reports",
        "material_orders",
      ] as const;
      for (const table of tables) {
        const { error } = await supabase.from(table).update({ job_id: keep.id }).eq("job_id", extra.id);
        if (error && error.code !== "PGRST205" && !error.message.includes("Could not find the")) {
          // Keep going so the extra row can still be removed.
        }
      }
      await supabase
        .from("tasks")
        .update({ related_id: keep.id })
        .eq("related_type", "job")
        .eq("related_id", extra.id);
      await supabase.from("jobs").delete().eq("id", extra.id);
    }
  }
  return { jobs: jobs.filter((job) => !dropped.has(job.id)), dropped };
}

function isMissingJobOverview(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("custom_fields") ||
    message.includes("related_contact_ids") ||
    message.includes("postal_code") ||
    message.includes("Could not find the")
  );
}

function isMissingLeadIntake(error: { message?: string; code?: string }) {
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("lead_source") ||
    message.includes("referral_contact_id") ||
    message.includes("Could not find the")
  );
}

function isMissingStaffLink(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("staff_id") ||
    message.includes("schema cache") ||
    message.includes("Could not find the")
  );
}

async function linkProfileStaff(
  supabase: ReturnType<typeof createClient>,
  profileId: string,
  staffId: string,
) {
  const { error } = await supabase.from("profiles").update({ staff_id: staffId }).eq("id", profileId);
  if (error && !isMissingStaffLink(error)) {
    toast.error(error.message);
  }
}

async function ensureSignedInStaff(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  profile: {
    id: string;
    full_name: string;
    title: string;
    initials: string;
    role: SeatRole;
    staff_id?: string | null;
  },
  roster: StaffMember[],
) {
  const matched = findStaffForProfile(roster, profile);
  if (matched) {
    if (profile.staff_id !== matched.id) {
      await linkProfileStaff(supabase, profile.id, matched.id);
    }
    return { roster, matched };
  }

  const { data, error } = await supabase
    .from("team_members")
    .insert({
      company_id: companyId,
      name: profile.full_name,
      title: profile.title || "Company admin",
      role: profile.role || "company_admin",
      team_id: null,
      initials: profile.initials || initialsFromName(profile.full_name),
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error && !isMissingStaffLink(error)) {
      toast.error(error.message);
    }
    return { roster, matched: undefined };
  }

  const inserted = mapStaff(data);
  await linkProfileStaff(supabase, profile.id, inserted.id);
  return { roster: [...roster, inserted], matched: inserted };
}

type CrmContextValue = CrmState & {
  user: CurrentUser;
  viewer: StaffMember | undefined;
  effectiveStaff: StaffMember | undefined;
  impersonatedStaff: StaffMember | undefined;
  loginAsOptions: StaffMember[];
  scopeLabel: string;
  teamMembers: string[];
  book: CrmState;
  configured: boolean;
  hydrated: boolean;
  hydrateError: string | null;
  switchSeat: (staffId: string) => void;
  loginAs: (staffId: string) => void;
  stopLoginAs: () => void;
  getClient: (id: string | null | undefined) => Client | undefined;
  getContact: (id: string | null | undefined) => Contact | undefined;
  customerName: (record: CustomerRecord) => string;
  getOpportunity: (id: string) => Opportunity | undefined;
  getJob: (id: string) => Job | undefined;
  getEstimate: (id: string) => Estimate | undefined;
  getInvoice: (id: string) => Invoice | undefined;
  getMaterialOrder: (id: string) => MaterialOrder | undefined;
  getMaterialOrderTemplate: (id: string) => MaterialOrderTemplate | undefined;
  jobForOpportunity: (opportunityId: string) => Job | undefined;
  company: CompanySettings;
  canEditCompany: boolean;
  updateCompany: (settings: CompanySettings) => Promise<boolean>;
  uploadCompanyLogo: (file: File) => Promise<CompanySettings | null>;
  removeCompanyLogo: () => Promise<boolean>;
  inviteStaff: (input: {
    name: string;
    email: string;
    role: SeatRole;
    title?: string;
    phone?: string;
  }) => Promise<{ member: StaffMember; inviteUrl: string | null } | null>;
  updateStaffAccount: (
    id: string,
    patch: Partial<Pick<StaffMember, "name" | "title" | "role" | "email" | "phone" | "locked" | "restricted">>,
  ) => Promise<boolean>;
  refreshStaffInvite: (id: string) => Promise<string | null>;
  removeStaff: (id: string) => Promise<boolean>;
  moveOpportunity: (
    id: string,
    stage: PipelineStage,
    lostReason?: string,
    extras?: { contractValue?: number; street?: string; city?: string; state?: string; postalCode?: string }
  ) => Promise<Job | null>;
  moveWork: (jobId: string, column: WorkColumn) => Promise<void>;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => Promise<boolean>;
  assignOpportunityOwner: (id: string, staffId: string) => Promise<boolean>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<boolean>;
  deleteJob: (id: string, reason: string) => Promise<boolean>;
  restoreJob: (id: string) => Promise<boolean>;
  addOpportunity: (
    input: Omit<Opportunity, "id" | "code" | "createdAt" | "winProbability" | "ownerStaffId" | "market"> & {
      ownerStaffId?: string;
      market?: Opportunity["market"];
    }
  ) => Promise<Opportunity & { costingJob?: Job | null }>;
  addClient: (
    input: Omit<Client, "id"> & {
      contactName?: string;
      contactTitle?: string;
      isReferralPartner?: boolean;
    }
  ) => Promise<Client>;
  addContact: (input: Omit<Contact, "id">) => Promise<Contact>;
  updateContact: (id: string, patch: Partial<Omit<Contact, "id">>) => Promise<boolean>;
  addJob: (input: Omit<JobDraft, "id" | "ownerStaffId"> & { ownerStaffId?: string }) => Promise<Job>;
  addActivity: (input: {
    entityType: "opportunity" | "job" | "client";
    entityId: string;
    type: ActivityType;
    body: string;
  }) => Promise<void>;
  sendTextMessage: (input: {
    to: string;
    content: string;
    jobId?: string | null;
    contactId?: string | null;
    opportunityId?: string | null;
    name?: string;
  }) => Promise<boolean>;
  logOutboundText: (input: {
    to: string;
    content: string;
    jobId?: string | null;
    contactId?: string | null;
    opportunityId?: string | null;
    name?: string;
    handle?: string;
  }) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addTask: (input: {
    title: string;
    dueAt: string;
    relatedType: "opportunity" | "job" | "client" | null;
    relatedId: string | null;
    assignee: string;
  }) => Promise<void>;
  addEstimate: (input: {
    name: string;
    clientId: string | null;
    opportunityId: string | null;
    jobId: string | null;
    contactId?: string | null;
    notes?: string;
    validUntil?: string | null;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    intro?: string;
    terms?: string;
    market?: Opportunity["market"];
    templateId?: string | null;
  }) => Promise<Estimate>;
  updateEstimate: (id: string, patch: Partial<Estimate>) => Promise<void>;
  sendEstimate: (id: string) => Promise<void>;
  acceptEstimate: (
    id: string,
    signature?: { name: string; image: string },
    signer?: HomeownerSigner,
  ) => Promise<void>;
  declineEstimate: (id: string) => Promise<void>;
  reopenEstimate: (id: string) => Promise<void>;
  markEstimateViewed: (id: string) => Promise<void>;
  ensureEstimateShareToken: (id: string) => Promise<string>;
  ensureInvoiceShareToken: (id: string) => Promise<string>;
  duplicateEstimate: (id: string) => Promise<Estimate>;
  addEstimateTemplate: (input?: { name?: string; market?: EstimateTemplate["market"] }) => Promise<EstimateTemplate>;
  updateEstimateTemplate: (id: string, patch: Partial<EstimateTemplate>) => Promise<void>;
  removeEstimateTemplate: (id: string) => Promise<void>;
  saveEstimateAsTemplate: (estimateId: string, name: string) => Promise<EstimateTemplate>;
  addCatalogItem: (input: {
    name: string;
    kind: CatalogKind;
    unit: string;
    unitCost: number;
    costCode?: string;
  }) => Promise<CatalogItem>;
  updateCatalogItem: (id: string, patch: Partial<CatalogItem>) => Promise<void>;
  removeCatalogItem: (id: string) => Promise<void>;
  importCatalogItems: (rows: CatalogImportDraft[]) => Promise<{ added: number; updated: number }>;
  addTemplateLineFromCatalog: (templateId: string, catalogItemId: string, groupName?: string) => Promise<void>;
  addCustomTemplateLine: (templateId: string, groupName?: string) => Promise<void>;
  updateTemplateLine: (id: string, patch: Partial<EstimateTemplateLine>) => Promise<void>;
  removeTemplateLine: (id: string) => Promise<void>;
  reorderTemplateLine: (id: string, direction: "up" | "down") => Promise<void>;
  getEstimateTemplate: (id: string) => EstimateTemplate | undefined;
  addEstimateLineFromCatalog: (
    estimateId: string,
    catalogItemId: string,
    groupName?: string
  ) => Promise<EstimateLine | undefined>;
  addCustomEstimateLine: (estimateId: string, groupName?: string) => Promise<EstimateLine | undefined>;
  updateEstimateLine: (id: string, patch: Partial<EstimateLine>) => Promise<void>;
  removeEstimateLine: (id: string) => Promise<void>;
  reorderEstimateLine: (id: string, direction: "up" | "down") => Promise<void>;
  convertEstimateToInvoice: (estimateId: string) => Promise<Invoice>;
  addInvoice: (input: {
    name: string;
    clientId: string | null;
    jobId: string | null;
    dueAt: string | null;
    notes?: string;
    terms?: string;
  }) => Promise<Invoice>;
  updateInvoice: (id: string, patch: Partial<Invoice>) => Promise<void>;
  sendInvoice: (id: string) => Promise<void>;
  voidInvoice: (id: string) => Promise<void>;
  recordPayment: (input: {
    invoiceId?: string | null;
    jobId?: string | null;
    amount: number;
    method: string;
    paidAt: string;
    reference: string;
    receiptUrl?: string;
    file?: File;
  }) => Promise<void>;
  addExpense: (input: {
    jobId: string | null;
    vendor: string;
    account: ExpenseAccount;
    amount: number;
    incurredAt: string;
    method: ExpenseMethod;
    memo: string;
    receiptUrl?: string;
    file?: File;
    extractedByAi?: boolean;
  }) => Promise<Expense | null>;
  addMaterialOrder: (input: {
    jobId: string;
    vendor?: string;
    notes?: string;
    neededBy?: string | null;
    templateId?: string | null;
  }) => Promise<MaterialOrder>;
  updateMaterialOrder: (id: string, patch: Partial<MaterialOrder>) => Promise<boolean>;
  addMaterialOrderLineFromCatalog: (orderId: string, catalogItemId: string) => Promise<MaterialOrderLine | undefined>;
  addCustomMaterialOrderLine: (orderId: string) => Promise<MaterialOrderLine | undefined>;
  updateMaterialOrderLine: (id: string, patch: Partial<MaterialOrderLine>) => Promise<void>;
  removeMaterialOrderLine: (id: string) => Promise<void>;
  addMaterialOrderTemplate: (input?: { name?: string }) => Promise<MaterialOrderTemplate>;
  updateMaterialOrderTemplate: (id: string, patch: Partial<MaterialOrderTemplate>) => Promise<void>;
  removeMaterialOrderTemplate: (id: string) => Promise<void>;
  saveMaterialOrderAsTemplate: (orderId: string, name: string) => Promise<MaterialOrderTemplate>;
  addMaterialOrderTemplateLineFromCatalog: (templateId: string, catalogItemId: string) => Promise<MaterialOrderTemplateLine | undefined>;
  addCustomMaterialOrderTemplateLine: (templateId: string) => Promise<MaterialOrderTemplateLine | undefined>;
  updateMaterialOrderTemplateLine: (id: string, patch: Partial<MaterialOrderTemplateLine>) => Promise<void>;
  removeMaterialOrderTemplateLine: (id: string) => Promise<void>;
  updateExpense: (id: string, patch: Partial<Expense>) => Promise<boolean>;
  updatePayment: (id: string, patch: Partial<Payment>) => Promise<boolean>;
  updateInvoiceLine: (id: string, patch: Partial<InvoiceLine>) => Promise<boolean>;
  setQbStatus: (
    kind: "invoice" | "payment" | "expense",
    id: string,
    status: QbSyncStatus,
  ) => Promise<boolean>;
  addQbReviewComment: (input: {
    kind: QbReviewKind;
    recordId: string;
    body: string;
    intent?: QbReviewIntent;
    mentionedStaffIds?: string[];
  }) => Promise<QbReviewComment | null>;
  addScheduleEvent: (input: Omit<ScheduleEvent, "id">) => Promise<ScheduleEvent>;
  linkDemoCalendar: () => Promise<void>;
  markCalendarLinked: (staffId: string, googleEmail: string, source: "google" | "demo") => Promise<void>;
  disconnectCalendar: () => Promise<void>;
  setShareWithTeam: (shareWithTeam: boolean) => Promise<void>;
  setCalendarShare: (viewerStaffId: string, shared: boolean) => Promise<void>;
  progressFor: (staffId: string) => TrainingProgress;
  markLessonRead: (chapterId: string, index: number) => Promise<void>;
  submitQuiz: (input: {
    kind: QuizKind;
    chapterId: string | null;
    score: number;
    correct: number;
    total: number;
  }) => Promise<TrainingProgress>;
  addTrainingBulletin: (title: string, body: string) => Promise<void>;
  addJobPhoto: (input: {
    jobId: string;
    caption: string;
    category: PhotoCategory;
    takenAt: string;
    imageUrl?: string;
    file?: File;
  }) => Promise<void>;
  addJobFiles: (jobId: string, files: File[]) => Promise<JobFile[]>;
  deleteJobFile: (id: string) => Promise<boolean>;
  addPhotoReport: (report: PhotoReport) => Promise<PhotoReport>;
  updatePhotoReport: (id: string, patch: Partial<Omit<PhotoReport, "id" | "jobId" | "createdAt">>) => Promise<boolean>;
  deletePhotoReport: (id: string) => Promise<boolean>;
  ensurePageShareToken: (id: string) => Promise<string>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<CrmState>(emptyState);
  const [user, setUser] = useState<CurrentUser>(guestUser);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(NORTHLINE_COMPANY);
  const [impersonatedStaffId, setImpersonatedStaffId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const seeding = useRef(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setHydrated(true);
      return;
    }
    const supabase = createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !authUser) {
      setCompanySettings(NORTHLINE_COMPANY);
      setState(emptyState);
      setUser(guestUser);
      setHydrateError(null);
      setHydrated(true);
      const here = `${window.location.pathname}${window.location.search}`;
      if (!isPublicAppPath(window.location.pathname)) {
        router.replace(here && here !== "/" ? `/login?next=${encodeURIComponent(here)}` : "/login");
      }
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError || !profile) {
      const local = readLocalCompany();
      const metaName =
        (typeof authUser.user_metadata?.full_name === "string" && authUser.user_metadata.full_name.trim()) ||
        authUser.email ||
        "Signed in";
      setCompanySettings(local);
      setState(emptyState);
      setUser({
        id: authUser.id,
        companyId: "",
        staffId: "",
        name: metaName,
        title:
          (typeof authUser.user_metadata?.title === "string" && authUser.user_metadata.title.trim()) ||
          "Company admin",
        company: local.name,
        initials: initialsFromName(metaName),
        role: "company_admin",
        teamId: null,
      });
      const missingSchema =
        profileError?.message?.includes("schema cache") ||
        profileError?.code === "PGRST205" ||
        profileError?.message?.includes("Could not find the table");
      setHydrateError(
        missingSchema
          ? "Signed in, but this project is missing the Truss tables. Run the files in supabase/migrations in the SQL editor (in order), then sign out and back in."
          : profileError?.message ??
            "No profile yet. Create an account after the migrations have been applied."
      );
      setHydrated(true);
      return;
    }

    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle();
    const settings = companyRow
      ? mapCompany(companyRow)
      : companyError
        ? NORTHLINE_COMPANY
        : { ...NORTHLINE_COMPANY, name: "Truss" };

    const companyId = profile.company_id;
    try {
      let book = await fetchCompanyBook(supabase, companyId);
      let ensured = await ensureSignedInStaff(
        supabase,
        companyId,
        {
          id: profile.id,
          full_name: profile.full_name,
          title: profile.title,
          initials: profile.initials,
          role: (profile.role as SeatRole | undefined) ?? "company_admin",
          staff_id: profile.staff_id,
        },
        book.state.staff,
      );
      if (ensured.matched) {
        const removed = await retireDemoStaff(supabase, companyId, {
          staffId: ensured.matched.id,
          name: profile.full_name,
        });
        if (removed) {
          book = await fetchCompanyBook(supabase, companyId);
          ensured = await ensureSignedInStaff(
            supabase,
            companyId,
            {
              id: profile.id,
              full_name: profile.full_name,
              title: profile.title,
              initials: profile.initials,
              role: (profile.role as SeatRole | undefined) ?? "company_admin",
              staff_id: profile.staff_id,
            },
            book.state.staff,
          );
        }
      }
      const matched = ensured.matched;
      const roster = ensured.roster;
      if (matched?.locked) {
        await supabase.auth.signOut();
        setHydrateError(null);
        setHydrated(true);
        toast.error("This account is locked. Ask a company admin to unlock it.");
        router.replace("/login?error=" + encodeURIComponent("This account is locked. Ask a company admin to unlock it."));
        return;
      }
      const role = (profile.role as SeatRole | undefined) ?? matched?.role ?? "company_admin";
      setCompanySettings(settings);
      setUser({
        id: profile.id,
        companyId,
        staffId: matched?.id ?? "",
        name: profile.full_name,
        title: profile.title,
        company: settings.name,
        initials: profile.initials || initialsFromName(profile.full_name),
        role,
        teamId: matched?.teamId ?? null,
      });
      const stamped = backfillRecordCodes(
        book.state.opportunities,
        book.state.jobs,
        roster,
      );
      let opportunities = stamped.opportunities;
      let jobs = stamped.jobs;
      if (jobsFromOpenLeads(opportunities, jobs).length > 0 && !seeding.current) {
        seeding.current = true;
        try {
          const added = await persistOpenLeadJobs(supabase, companyId, opportunities, jobs);
          if (added) {
            book = await fetchCompanyBook(supabase, companyId);
            const restamped = backfillRecordCodes(
              book.state.opportunities,
              book.state.jobs,
              roster,
            );
            opportunities = restamped.opportunities;
            jobs = restamped.jobs;
          }
        } finally {
          seeding.current = false;
        }
      }
      const pruned = await pruneDuplicateLeadJobs(supabase, jobs);
      jobs = await scrubNorthlineCrewFromJobs(supabase, pruned.jobs, profile.full_name);
      const backfilled = await persistLeadFieldsOnJobs(supabase, jobs, opportunities);
      jobs = jobsFilledFromLeads(backfilled.jobs, opportunities);
      const remapJob = (jobId: string | null) => remapDroppedJobId(jobId, pruned.dropped);
      setState({
        ...book.state,
        staff: roster,
        opportunities,
        jobs,
        estimates: book.state.estimates.map((estimate) => ({
          ...estimate,
          jobId: remapJob(estimate.jobId),
        })),
        invoices: book.state.invoices.map((invoice) => ({
          ...invoice,
          jobId: remapJob(invoice.jobId),
        })),
        expenses: book.state.expenses.map((expense) => ({
          ...expense,
          jobId: remapJob(expense.jobId),
        })),
        payments: book.state.payments.map((payment) => ({
          ...payment,
          jobId: remapJob(payment.jobId),
        })),
        events: book.state.events.map((event) => ({
          ...event,
          jobId: remapJob(event.jobId),
        })),
        photos: book.state.photos.map((photo) => ({
          ...photo,
          jobId: remapDroppedJobId(photo.jobId, pruned.dropped) ?? photo.jobId,
        })),
        jobFiles: (book.state.jobFiles ?? []).map((file) => ({
          ...file,
          jobId: remapDroppedJobId(file.jobId, pruned.dropped) ?? file.jobId,
        })),
        photoReports: book.state.photoReports.map((report) => ({
          ...report,
          jobId: remapDroppedJobId(report.jobId, pruned.dropped) ?? report.jobId,
          template: parsePageTemplate(report.template),
          shareToken: report.shareToken ?? "",
        })),
        materialOrders: (book.state.materialOrders ?? []).map((order) => ({
          ...order,
          jobId: remapDroppedJobId(order.jobId, pruned.dropped) ?? order.jobId,
        })),
        materialOrderLines: book.state.materialOrderLines ?? [],
      });
      setHydrateError(null);
      setHydrated(true);
    } catch (error) {
      setHydrateError(error instanceof Error ? error.message : "Could not load the book of work.");
      setHydrated(true);
    }
  }, [router]);

  useEffect(() => {
    if (!configured) {
      setHydrated(true);
      return;
    }
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [configured, load]);

  useEffect(() => {
    if (!configured) return;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void load();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [configured, load]);

  useEffect(() => {
    if (!configured || !user.companyId) return;
    const supabase = createClient();
    const tables = [
      "clients",
      "contacts",
      "opportunities",
      "jobs",
      "activities",
      "tasks",
      "team_members",
      "teams",
      "catalog_items",
      "estimates",
      "estimate_lines",
      "estimate_templates",
      "estimate_template_lines",
      "invoices",
      "invoice_lines",
      "payments",
      "schedule_events",
      "job_photos",
      "job_files",
      "expenses",
      "calendar_accounts",
      "calendar_shares",
      "training_progress",
      "training_bulletins",
      "account_invites",
      "photo_reports",
      "messages",
      "material_orders",
      "material_order_lines",
      "material_order_templates",
      "material_order_template_lines",
    ] as const;
    let timer: number | undefined;
    const channel = supabase.channel(`truss-company-${user.companyId}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `company_id=eq.${user.companyId}` },
        () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            void load();
          }, 200);
        }
      );
    }
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "companies", filter: `id=eq.${user.companyId}` },
      () => {
        void load();
      }
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
      () => {
        void load();
      }
    );
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [configured, load, user.companyId, user.id]);

  const viewer = useMemo(() => {
    const byId = user.staffId ? state.staff.find((member) => member.id === user.staffId) : undefined;
    // The linked seat is the source of truth, even when the profile name drifted.
    if (byId) return byId;
    const byName = user.name.trim()
      ? state.staff.find((member) => namesMatch(member.name, user.name))
      : undefined;
    if (byName) return byName;
    if (!isUnsignedDemo(user) && user.name.trim()) {
      return staffMemberFromProfile({
        id: user.staffId || user.id,
        name: user.name,
        title: user.title || "Company admin",
        role: user.role,
        initials: user.initials,
      });
    }
    return state.staff[0];
  }, [state.staff, user]);
  const impersonatedStaff = useMemo(
    () => state.staff.find((member) => member.id === impersonatedStaffId),
    [impersonatedStaffId, state.staff]
  );
  const effectiveStaff = impersonatedStaff ?? viewer;
  const scoped = useMemo(() => scopeBook(state, effectiveStaff), [effectiveStaff, state]);
  const loginAsOptions = useMemo(
    () => (viewer ? loginAsTargets(viewer, state.staff) : []),
    [state.staff, viewer]
  );
  const teamMembers = useMemo(() => state.staff.map((member) => member.name), [state.staff]);
  const displayUser = useMemo(() => {
    if (!effectiveStaff) return user;
    return {
      ...user,
      staffId: effectiveStaff.id,
      name: effectiveStaff.name,
      title: impersonatedStaff
        ? `${effectiveStaff.title} · via ${viewer?.name ?? user.name}`
        : effectiveStaff.title,
      initials: effectiveStaff.initials,
      role: effectiveStaff.role,
      teamId: effectiveStaff.teamId,
    };
  }, [effectiveStaff, impersonatedStaff, user, viewer]);

  const switchSeat = useCallback(
    (staffId: string) => {
      if (!isUnsignedDemo(user)) return;
      const member = state.staff.find((item) => item.id === staffId);
      if (!member) return;
      setImpersonatedStaffId(null);
      setUser(
        userFromStaff(member, {
          id: user.id || "local",
          companyId: user.companyId || "local",
          company: user.company || "Northline Construction",
        })
      );
      try {
        window.localStorage.setItem(DEMO_STAFF_KEY, member.id);
      } catch {
        // ignore
      }
      toast.success(`Viewing as ${member.name}`);
    },
    [state.staff, user]
  );

  const loginAs = useCallback(
    (staffId: string) => {
      if (!viewer || !canLoginAs(viewer)) {
        toast.error("Your seat cannot log in as another user.");
        return;
      }
      const allowed = loginAsTargets(viewer, state.staff).some((member) => member.id === staffId);
      if (!allowed) {
        toast.error("You can only log in as someone on your team.");
        return;
      }
      const member = state.staff.find((item) => item.id === staffId);
      if (!member) return;
      setImpersonatedStaffId(member.id);
      toast.success(`Logged in as ${member.name}`);
    },
    [state.staff, viewer]
  );

  const stopLoginAs = useCallback(() => {
    setImpersonatedStaffId(null);
  }, []);

  const getClient = useCallback(
    (id: string | null | undefined) =>
      id ? scoped.clients.find((client) => client.id === id) : undefined,
    [scoped.clients]
  );
  const getContact = useCallback(
    (id: string | null | undefined) =>
      id ? scoped.contacts.find((contact) => contact.id === id) : undefined,
    [scoped.contacts]
  );
  const customerName = useCallback(
    (record: CustomerRecord) => resolveCustomerName(record, scoped),
    [scoped]
  );
  const getOpportunity = useCallback(
    (id: string) => scoped.opportunities.find((opportunity) => opportunity.id === id),
    [scoped.opportunities]
  );
  const getJob = useCallback(
    (id: string) => scoped.jobs.find((job) => job.id === id),
    [scoped.jobs]
  );
  const getEstimate = useCallback(
    (id: string) => scoped.estimates.find((estimate) => estimate.id === id),
    [scoped.estimates]
  );
  const getEstimateTemplate = useCallback(
    (id: string) => scoped.estimateTemplates.find((template) => template.id === id),
    [scoped.estimateTemplates]
  );
  const getInvoice = useCallback(
    (id: string) => scoped.invoices.find((invoice) => invoice.id === id),
    [scoped.invoices]
  );
  const getMaterialOrder = useCallback(
    (id: string) => (scoped.materialOrders ?? []).find((order) => order.id === id),
    [scoped.materialOrders]
  );
  const getMaterialOrderTemplate = useCallback(
    (id: string) => (scoped.materialOrderTemplates ?? []).find((template) => template.id === id),
    [scoped.materialOrderTemplates]
  );
  const jobForOpportunity = useCallback(
    (opportunityId: string) =>
      scoped.jobs.find((job) => job.opportunityId === opportunityId),
    [scoped.jobs]
  );

  const addActivity = useCallback(
    async (input: {
      entityType: "opportunity" | "job" | "client";
      entityId: string;
      type: ActivityType;
      body: string;
    }) => {
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          activities: [
            {
              id: crypto.randomUUID(),
              ...input,
              createdAt: new Date().toISOString(),
              author: user.name,
            },
            ...prev.activities,
          ],
        }));
        return;
      }
      let { data, error } = await supabase
        .from("activities")
        .insert({
          company_id: user.companyId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          type: input.type,
          body: input.body,
          author: user.name,
        })
        .select("*")
        .single();
      if (error && (input.type === "audit" || input.type === "text") && isInvalidEnumValue(error)) {
        const retry = await supabase
          .from("activities")
          .insert({
            company_id: user.companyId,
            entity_type: input.entityType,
            entity_id: input.entityId,
            type: input.type === "text" ? "call" : "stage_change",
            body: input.body,
            author: user.name,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not log activity.");
        return;
      }
      setState((prev) => ({
        ...prev,
        activities: [mapActivity(data), ...prev.activities],
      }));
    },
    [user.companyId, user.name]
  );

  const logOutboundText = useCallback(
    async (input: {
      to: string;
      content: string;
      jobId?: string | null;
      contactId?: string | null;
      opportunityId?: string | null;
      name?: string;
      handle?: string;
    }) => {
      const phone = toE164(input.to) || input.to.trim();
      const content = input.content.trim();
      if (!phone || !content) return;
      const contact =
        (input.contactId ? state.contacts.find((item) => item.id === input.contactId) : undefined) ??
        contactForPhone(state.contacts, phone);
      const job =
        (input.jobId ? state.jobs.find((item) => item.id === input.jobId) : undefined) ??
        (contact ? jobForContact(state.jobs, state.opportunities, contact.id) : undefined);
      const opportunityId =
        input.opportunityId ||
        job?.opportunityId ||
        (contact ? opportunityForContact(state.opportunities, contact.id)?.id : null) ||
        null;
      const who = input.name?.trim() || contact?.name || "homeowner";
      const message: TextMessage = {
        id: crypto.randomUUID(),
        contactId: contact?.id ?? null,
        jobId: job?.id ?? null,
        opportunityId,
        direction: "outbound",
        phone,
        body: content,
        handle: input.handle?.trim() ?? "",
        status: "sent",
        mediaUrl: "",
        createdAt: new Date().toISOString(),
        createdBy: user.name,
      };
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, messages: [message, ...prev.messages] }));
      } else {
        const { data, error } = await supabase
          .from("messages")
          .insert({
            id: message.id,
            company_id: user.companyId,
            contact_id: message.contactId,
            job_id: message.jobId,
            opportunity_id: message.opportunityId,
            direction: message.direction,
            phone: message.phone,
            body: message.body,
            handle: message.handle,
            status: message.status,
            media_url: message.mediaUrl,
            created_by: message.createdBy,
          })
          .select("*")
          .single();
        if (error) {
          if (isMissingMessages(error)) toast.message(missingMessagesMessage());
          else toast.error(error.message);
          setState((prev) => ({ ...prev, messages: [message, ...prev.messages] }));
        } else if (data) {
          setState((prev) => ({ ...prev, messages: [mapMessage(data), ...prev.messages] }));
        }
      }
      const activityBody = outboundActivityBody(who, phone, content);
      if (job) {
        await addActivity({ entityType: "job", entityId: job.id, type: "text", body: activityBody });
      } else if (opportunityId) {
        await addActivity({
          entityType: "opportunity",
          entityId: opportunityId,
          type: "text",
          body: activityBody,
        });
      }
    },
    [addActivity, state.contacts, state.jobs, state.opportunities, user.companyId, user.name],
  );

  const sendTextMessage = useCallback(
    async (input: {
      to: string;
      content: string;
      jobId?: string | null;
      contactId?: string | null;
      opportunityId?: string | null;
      name?: string;
    }) => {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: input.to, content: input.content }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; mocked?: boolean; error?: string; handle?: string; to?: string }
        | null;
      if (!response.ok || !data?.ok) {
        toast.error(data?.error || "Could not send that text.");
        return false;
      }
      await logOutboundText({
        ...input,
        to: data.to || input.to,
        handle: data.handle,
      });
      if (data.mocked) {
        toast.message(
          "Sendblue is not connected on this host. The text is logged on the job. Add SENDBLUE_API_KEY_ID, SENDBLUE_API_SECRET_KEY, and SENDBLUE_FROM_NUMBER on Vercel, or deploy supabase/functions/send-text.",
        );
      } else {
        toast.success("Text sent.");
      }
      return true;
    },
    [logOutboundText],
  );

  const moveOpportunity = useCallback(
    async (
      id: string,
      stage: PipelineStage,
      lostReason?: string,
      extras?: { contractValue?: number; street?: string; city?: string; state?: string; postalCode?: string }
    ) => {
      let createdJob: Job | null = null;
      const current = state.opportunities.find((opportunity) => opportunity.id === id);
      if (!current) {
        return state.jobs.find((job) => job.opportunityId === id) ?? null;
      }
      const contractValue =
        extras?.contractValue ??
        contractValueForOpportunity(
          id,
          state.estimates,
          state.estimateLines,
          current.value,
          parseMarket(current.market, current.projectType),
        );
      const existingJob = state.jobs.find((job) => job.opportunityId === id) ?? null;
      if (current.stage === stage) {
        if (stage === "awarded" && extras?.contractValue != null) {
          const supabaseClient = maybeClient();
          if (!supabaseClient) {
            setState((prev) => ({
              ...prev,
              opportunities: prev.opportunities.map((opportunity) =>
                opportunity.id === id ? { ...opportunity, value: contractValue } : opportunity,
              ),
              jobs: prev.jobs.map((job) =>
                job.opportunityId === id ? { ...job, contractValue } : job,
              ),
            }));
            return existingJob ? { ...existingJob, contractValue } : null;
          }
          const { error: valueError } = await supabaseClient
            .from("opportunities")
            .update({ value: contractValue })
            .eq("id", id);
          if (valueError) toast.error(valueError.message);
          if (existingJob) {
            const { error: jobValueError } = await supabaseClient
              .from("jobs")
              .update({ contract_value: contractValue })
              .eq("id", existingJob.id);
            if (jobValueError) toast.error(jobValueError.message);
          }
          setState((prev) => ({
            ...prev,
            opportunities: prev.opportunities.map((opportunity) =>
              opportunity.id === id ? { ...opportunity, value: contractValue } : opportunity,
            ),
            jobs: prev.jobs.map((job) =>
              job.opportunityId === id ? { ...job, contractValue } : job,
            ),
          }));
          return existingJob ? { ...existingJob, contractValue } : null;
        }
        return existingJob;
      }
      const street = extras?.street ?? current.street ?? "";
      const city = extras?.city ?? current.city ?? "";
      const stateCode = extras?.state ?? current.state ?? "";
      const postalCode = extras?.postalCode ?? current.postalCode ?? "";
      const location =
        formatJobSite({ street, city, state: stateCode, postalCode }) || current.location;

      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => {
          const jobs = [...prev.jobs];
          let nextJobs = jobs;
          if (stage !== "lost" && !jobs.some((job) => job.opportunityId === id)) {
            nextJobs = [
              fillJobRecord(
                jobDraftFromOpportunity(current, {
                  id: crypto.randomUUID(),
                  ownerStaffId: user.staffId,
                  projectManager: user.name || current.estimator,
                }),
                current
              ),
              ...jobs,
            ];
            createdJob = nextJobs[0];
          } else {
            createdJob = jobs.find((job) => job.opportunityId === id) ?? null;
            nextJobs = jobs.map((job) => {
              if (job.opportunityId !== id) return job;
              if (stage === "lost") return { ...job, status: "on_hold" as const };
              if (stage === "awarded") return { ...job, contractValue, street, city, state: stateCode, postalCode, location };
              return job;
            });
          }
          return {
            ...prev,
            opportunities: prev.opportunities.map((opportunity) =>
              opportunity.id === id
                ? {
                    ...opportunity,
                    stage,
                    value: stage === "awarded" ? contractValue : opportunity.value,
                    winProbability: STAGE_PROBABILITY[stage],
                    lostReason: stage === "lost" ? lostReason ?? opportunity.lostReason : opportunity.lostReason,
                    street: street || opportunity.street,
                    city: city || opportunity.city,
                    state: stateCode || opportunity.state,
                    postalCode: postalCode || opportunity.postalCode,
                    location,
                  }
                : opportunity
            ),
            jobs: nextJobs,
            activities: [
              {
                id: crypto.randomUUID(),
                entityType: "opportunity" as const,
                entityId: id,
                type: "stage_change" as const,
                body: `Moved from ${STAGE_LABELS[current.stage]} to ${STAGE_LABELS[stage]}.${
                  stage === "lost" && lostReason ? ` ${lostReason}` : ""
                }`,
                createdAt: new Date().toISOString(),
                author: user.name,
              },
              ...prev.activities,
            ],
          };
        });
        return createdJob;
      }
      const { error } = await supabase
        .from("opportunities")
        .update({
          stage,
          win_probability: STAGE_PROBABILITY[stage],
          value: stage === "awarded" ? contractValue : current.value,
          lost_reason: stage === "lost" ? lostReason ?? current.lostReason ?? null : null,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return null;
      }

      await addActivity({
        entityType: "opportunity",
        entityId: id,
        type: "stage_change",
        body: `Moved from ${STAGE_LABELS[current.stage]} to ${STAGE_LABELS[stage]}.${
          stage === "lost" && lostReason ? ` ${lostReason}` : ""
        }`,
      });

      if (stage !== "lost") {
        const already = state.jobs.find((job) => job.opportunityId === id);
        if (already) {
          createdJob = already;
          if (stage === "awarded") {
            const { error: jobValueError } = await supabase
              .from("jobs")
              .update({
                contract_value: contractValue,
                street,
                city,
                state: stateCode,
                postal_code: postalCode,
                location,
              })
              .eq("id", already.id);
            if (jobValueError) toast.error(jobValueError.message);
            const awardedJob = {
              ...already,
              contractValue,
              street,
              city,
              state: stateCode,
              postalCode,
              location,
            };
            createdJob = awardedJob;
            setState((prev) => ({
              ...prev,
              opportunities: prev.opportunities.map((opportunity) =>
                opportunity.id === id ? { ...opportunity, value: contractValue, stage } : opportunity,
              ),
              jobs: prev.jobs.map((job) => (job.id === already.id ? awardedJob : job)),
            }));
          }
        } else {
          const awarded = fillJobRecord(
            jobDraftFromOpportunity(
              { ...current, value: stage === "awarded" ? contractValue : current.value, street, city, state: stateCode, postalCode, location },
              {
                id: crypto.randomUUID(),
                ownerStaffId: user.staffId,
                projectManager: user.name || current.estimator,
              },
            ),
            current
          );
          const payload = jobInsertPayload(awarded, user.companyId, {
            code: allocateCode(user.name, state.jobs, state.opportunities, current.code),
          });
          const inserted = await insertJobWithFallbacks(payload, async (row) => {
            const result = await supabase.from("jobs").insert(row as never).select("*").single();
            return { data: result.data, error: result.error };
          });
          if (inserted.hint) toast.message(inserted.hint);
          const data = inserted.data;
          const jobError = inserted.error;
          if (jobError) {
            toast.error(jobInsertError(jobError, "Could not open the job."));
          } else if (data) {
            createdJob = fillJobRecord(
              { ...mapJob(data), code: data.code || payload.code },
              current,
            );
            await addActivity({
              entityType: "job",
              entityId: data.id,
              type: "note",
              body: "Job opened from the pipeline. Costs and receipts post to this job.",
            });
          }
        }
      }

      if (stage === "lost") {
        const existing = state.jobs.find((job) => job.opportunityId === id);
        if (existing) {
          await supabase.from("jobs").update({ status: "on_hold" }).eq("id", existing.id);
        }
      }

      await load();
      return createdJob;
    },
    [addActivity, load, state.estimateLines, state.estimates, state.jobs, state.opportunities, user.companyId, user.name, user.staffId]
  );

  const updateOpportunity = useCallback(
    async (id: string, patch: Partial<Opportunity>) => {
      const linked = state.jobs.find((job) => job.opportunityId === id);
      const jobUpdates = jobPatchFromLead(patch, linked);
      const apply = () =>
        setState((prev) => ({
          ...prev,
          opportunities: prev.opportunities.map((opportunity) =>
            opportunity.id === id ? { ...opportunity, ...patch } : opportunity
          ),
          jobs:
            linked && Object.keys(jobUpdates).length
              ? prev.jobs.map((job) =>
                  job.id === linked.id ? fillJobRecord({ ...job, ...jobUpdates }) : job,
                )
              : prev.jobs,
        }));
      const supabase = requireClient();
      if (!supabase) {
        apply();
        return true;
      }
      const { error } = await supabase.from("opportunities").update(opportunityPatch(patch)).eq("id", id);
      if (error) {
        if (isMissingMarketColumn(error)) {
          apply();
          toast.message(missingMarketMessage());
          return true;
        }
        toast.error(error.message);
        return false;
      }
      if (linked && Object.keys(jobUpdates).length) {
        const jobError = (await supabase.from("jobs").update(jobPatch(jobUpdates)).eq("id", linked.id)).error;
        if (jobError && !isMissingJobOverview(jobError) && !isMissingMarketColumn(jobError)) {
          toast.error(jobError.message);
        }
      }
      apply();
      return true;
    },
    [state.jobs]
  );

  const updateJob = useCallback(async (id: string, patch: Partial<Job>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.id === id ? fillJobRecord({ ...job, ...patch }) : job)),
      }));
    const supabase = requireClient();
    if (!supabase) {
      apply();
      return true;
    }
    let { error } = await supabase.from("jobs").update(jobPatch(patch)).eq("id", id);
    if (error && isMissingDeletedColumn(error)) {
      apply();
      toast.message(missingDeletedColumnMessage());
      return true;
    }
    if (error && isMissingMarketColumn(error)) {
      apply();
      toast.message(missingMarketMessage());
      return true;
    }
    if (error && isMissingPrimaryContactColumn(error)) {
      error = (await supabase.from("jobs").update(omitPrimaryContact(jobPatch(patch)) as never).eq("id", id)).error;
      if (!error) {
        apply();
        toast.message(missingPrimaryContactMessage());
        return true;
      }
    }
    if (error) {
      if (isMissingJobOverview(error)) {
        apply();
        toast.message(missingJobOverviewMessage());
        return true;
      }
      toast.error(error.message);
      return false;
    }
    apply();
    return true;
  }, []);

  const deleteJob = useCallback(
    async (id: string, reason: string) => {
      const trimmed = reason.trim();
      if (!trimmed) {
        toast.error("Write why this job is being deleted.");
        return false;
      }
      if (!canDeleteJobs(viewer) || impersonatedStaff) {
        toast.error("Only a company admin can delete a job.");
        return false;
      }
      const job = state.jobs.find((item) => item.id === id);
      if (!job) return false;
      if (job.deletedAt) {
        toast.message("This job is already in Deleted.");
        return false;
      }
      const ok = await updateJob(id, {
        deletedAt: new Date().toISOString(),
        deletedReason: trimmed,
        deletedBy: user.name,
      });
      if (!ok) return false;
      await addActivity({
        entityType: "job",
        entityId: id,
        type: "audit",
        body: `Deleted this job. Reason: ${trimmed}`,
      });
      return true;
    },
    [addActivity, impersonatedStaff, state.jobs, updateJob, user.name, viewer],
  );

  const restoreJob = useCallback(
    async (id: string) => {
      if (!canDeleteJobs(viewer) || impersonatedStaff) {
        toast.error("Only a company admin can restore a job.");
        return false;
      }
      const job = state.jobs.find((item) => item.id === id);
      if (!job?.deletedAt) return false;
      const ok = await updateJob(id, {
        deletedAt: null,
        deletedReason: "",
        deletedBy: "",
      });
      if (!ok) return false;
      await addActivity({
        entityType: "job",
        entityId: id,
        type: "audit",
        body: "Restored this job to the board.",
      });
      return true;
    },
    [addActivity, impersonatedStaff, state.jobs, updateJob, viewer],
  );

  const moveWork = useCallback(
    async (jobId: string, column: WorkColumn) => {
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job) return;
      if (column === "deleted") return;
      if (job.deletedAt) {
        const restored = await restoreJob(jobId);
        if (!restored) return;
      }
      const opportunity = job.opportunityId
        ? state.opportunities.find((item) => item.id === job.opportunityId)
        : undefined;
      if (workColumnFor({ ...job, deletedAt: null }, opportunity) === column) return;
      const next = patchForWorkColumn(column);
      if (opportunity && next.stage && opportunity.stage !== next.stage) {
        await moveOpportunity(opportunity.id, next.stage);
      }
      if (job.status !== next.status) {
        await updateJob(jobId, { status: next.status });
      }
    },
    [moveOpportunity, restoreJob, state.jobs, state.opportunities, updateJob],
  );

  const addOpportunity = useCallback(
    async (
      input: Omit<Opportunity, "id" | "code" | "createdAt" | "winProbability" | "ownerStaffId" | "market"> & {
        ownerStaffId?: string;
        market?: Opportunity["market"];
      }
    ) => {
      const ownerStaffId =
        input.ownerStaffId ||
        staffByName(input.estimator, state.staff)?.id ||
        user.staffId;
      const originatorStaffId = input.originatorStaffId || user.staffId;
      const code = allocateCode(user.name, state.jobs, state.opportunities);
      const supabase = maybeClient();
      if (!supabase) {
        const opportunity: Opportunity = {
          ...input,
          id: crypto.randomUUID(),
          code,
          createdAt: new Date().toISOString(),
          winProbability: STAGE_PROBABILITY[input.stage],
          ownerStaffId,
          originatorStaffId,
          leadSource: input.leadSource ?? "",
          market: parseMarket(input.market, input.projectType),
          referralContactId: input.referralContactId ?? null,
          street: input.street ?? "",
          city: input.city ?? "",
          state: input.state ?? "",
          postalCode: input.postalCode ?? "",
          notes: input.notes ?? "",
        };
        const pipelineJob =
          input.stage === "lost"
            ? null
            : fillJobRecord(
                jobDraftFromOpportunity(opportunity, {
                  ownerStaffId,
                  projectManager: opportunity.estimator,
                }),
                opportunity,
              );
        setState((prev) => ({
          ...prev,
          opportunities: [opportunity, ...prev.opportunities],
          jobs: pipelineJob ? dedupeJobsByOpportunity([pipelineJob, ...prev.jobs]) : prev.jobs,
        }));
        return Object.assign(opportunity, { costingJob: pipelineJob });
      }
      const base = {
        company_id: user.companyId,
        name: input.name,
        client_id: input.clientId || null,
        primary_contact_id: input.primaryContactId || null,
        stage: input.stage,
        value: input.value,
        bid_due_at: input.bidDueAt,
        pre_bid_walk_at: input.preBidWalkAt,
        location: input.location,
        project_type: input.projectType,
        market: parseMarket(input.market, input.projectType),
        delivery_method: input.deliveryMethod,
        estimator: input.estimator,
        owner_staff_id: ownerStaffId || null,
        originator_staff_id: originatorStaffId || null,
        win_probability: STAGE_PROBABILITY[input.stage],
        next_step: input.nextStep,
        code,
        lead_source: input.leadSource ?? "",
        referral_contact_id: input.referralContactId || null,
        street: input.street ?? "",
        city: input.city ?? "",
        state: input.state ?? "",
        postal_code: input.postalCode ?? "",
        notes: input.notes ?? "",
      };
      let { data, error } = await supabase.from("opportunities").insert(base).select("*").single();
      if (error && isInvalidEnumValue(error)) {
        const retry = await supabase
          .from("opportunities")
          .insert({
            ...base,
            project_type: legacyProjectType(base.project_type),
            delivery_method: legacyDeliveryMethod(base.delivery_method),
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error && data) {
          toast.message(missingResidentialEnumsMessage());
        }
      }
      if (error && isMissingCodeColumn(error)) {
        const retry = await supabase.from("opportunities").insert(payloadWithoutCode(base)).select("*").single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingCodeColumnMessage());
      }
      if (error && isMissingOriginator(error)) {
        const { originator_staff_id: _originator, ...withoutOriginator } = base;
        const retry = await supabase.from("opportunities").insert(withoutOriginator).select("*").single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingOriginatorMessage());
      }
      if (error && isMissingMarketColumn(error)) {
        const { market: _market, ...withoutMarket } = base;
        const retry = await supabase.from("opportunities").insert(withoutMarket).select("*").single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingMarketMessage());
      }
      if (error && isMissingLeadIntake(error)) {
        const slim = {
          company_id: base.company_id,
          name: base.name,
          client_id: base.client_id,
          primary_contact_id: base.primary_contact_id,
          stage: base.stage,
          value: base.value,
          bid_due_at: base.bid_due_at,
          pre_bid_walk_at: base.pre_bid_walk_at,
          location: base.location,
          project_type: isInvalidEnumValue(error)
            ? legacyProjectType(base.project_type)
            : base.project_type,
          delivery_method: isInvalidEnumValue(error)
            ? legacyDeliveryMethod(base.delivery_method)
            : base.delivery_method,
          estimator: base.estimator,
          owner_staff_id: base.owner_staff_id,
          win_probability: base.win_probability,
          next_step: base.next_step,
          code: base.code,
        };
        const retry = await supabase.from("opportunities").insert(slim).select("*").single();
        data = retry.data;
        error = retry.error;
        if (error && isInvalidEnumValue(error)) {
          const enumRetry = await supabase
            .from("opportunities")
            .insert({
              ...slim,
              project_type: legacyProjectType(base.project_type),
              delivery_method: legacyDeliveryMethod(base.delivery_method),
            })
            .select("*")
            .single();
          data = enumRetry.data;
          error = enumRetry.error;
          if (!error && data) toast.message(missingResidentialEnumsMessage());
        }
        if (error && isMissingCodeColumn(error)) {
          const withoutCode = await supabase
            .from("opportunities")
            .insert(payloadWithoutCode(slim))
            .select("*")
            .single();
          data = withoutCode.data;
          error = withoutCode.error;
          if (!error) toast.message(missingCodeColumnMessage());
        }
        if (error) {
          toast.error(
            isInvalidEnumValue(error)
              ? missingResidentialEnumsMessage()
              : "Run supabase/migrations/20260819250000_lead_intake.sql in the SQL editor, then try again.",
          );
          throw error;
        }
      }
      if (error || !data) {
        toast.error(
          isInvalidEnumValue(error)
            ? missingResidentialEnumsMessage()
            : codeInsertError(error, "Could not open the pursuit.")
        );
        throw error ?? new Error("Could not open the pursuit.");
      }
      const opportunity = {
        ...mapOpportunity(data),
        code: data.code || code,
        originatorStaffId: data.originator_staff_id || originatorStaffId,
      };
      const pipelineJob =
        opportunity.stage === "lost"
          ? null
          : fillJobRecord(
              jobDraftFromOpportunity(opportunity, {
                id: crypto.randomUUID(),
                ownerStaffId,
                projectManager: opportunity.estimator,
              }),
              opportunity,
            );
      if (pipelineJob) {
        const jobPayload = jobInsertPayload(pipelineJob, user.companyId, { id: pipelineJob.id });
        const inserted = await insertJobWithFallbacks(jobPayload, async (row) => {
          const result = await supabase.from("jobs").insert(row as never).select("*").single();
          return { data: result.data, error: result.error };
        });
        if (inserted.hint) toast.message(inserted.hint);
        const jobRow = inserted.data;
        const jobError = inserted.error;
        if (!jobError && jobRow) {
          Object.assign(
            pipelineJob,
            fillJobRecord({ ...mapJob(jobRow), code: jobRow.code || pipelineJob.code }, opportunity),
          );
        } else if (jobError?.code === "23505") {
          const existing = await supabase
            .from("jobs")
            .select("*")
            .eq("opportunity_id", opportunity.id)
            .maybeSingle();
          if (existing.data) {
            Object.assign(
              pipelineJob,
              fillJobRecord(
                { ...mapJob(existing.data), code: existing.data.code || pipelineJob.code },
                opportunity,
              ),
            );
          }
        } else if (jobError) {
          toast.error(jobInsertError(jobError, "Lead opened. Could not open the job for costing."));
        }
      }
      setState((prev) => ({
        ...prev,
        opportunities: [opportunity, ...prev.opportunities],
        jobs: pipelineJob ? dedupeJobsByOpportunity([pipelineJob, ...prev.jobs]) : prev.jobs,
      }));
      await addActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        body: `Opened pursuit. Next step: ${opportunity.nextStep || "qualify the bid."}`,
      });
      return Object.assign(opportunity, { costingJob: pipelineJob });
    },
    [addActivity, state.jobs, state.opportunities, state.staff, user.companyId, user.name, user.staffId]
  );

  const ensureLeadForEstimate = useCallback(
    async (input: {
      name: string;
      clientId: string | null;
      opportunityId: string | null;
      jobId: string | null;
      contactId?: string | null;
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      market?: Opportunity["market"];
    }) => {
      if (input.opportunityId) return input.opportunityId;
      const job = input.jobId ? state.jobs.find((item) => item.id === input.jobId) : undefined;
      if (job?.opportunityId) return job.opportunityId;
      const site =
        formatJobSite({
          street: input.street,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
        }) ||
        job?.location ||
        "";
      if (input.contactId) {
        const sameSite = state.opportunities.find(
          (opportunity) =>
            opportunity.stage !== "lost" &&
            opportunity.primaryContactId === input.contactId &&
            Boolean(site) &&
            (formatJobSite(opportunity) === site || opportunity.location === site),
        );
        if (sameSite) return sameSite.id;
        const openLead = state.opportunities.find(
          (opportunity) =>
            opportunity.stage !== "lost" && opportunity.primaryContactId === input.contactId,
        );
        if (openLead) return openLead.id;
        const openJob = state.jobs.find(
          (item) =>
            item.primaryContactId === input.contactId &&
            item.status !== "complete" &&
            item.opportunityId,
        );
        if (openJob?.opportunityId) return openJob.opportunityId;
      }
      const opportunity = await addOpportunity({
        name: input.name,
        clientId: input.clientId ?? job?.clientId ?? null,
        primaryContactId: input.contactId || job?.primaryContactId || "",
        stage: "pursuing",
        value: 0,
        bidDueAt: null,
        preBidWalkAt: null,
        location: site || "Address TBD",
        projectType: job?.projectType || projectTypeForMarket(input.market ?? job?.market ?? "residential"),
        market: input.market ?? workMarket(job, undefined),
        deliveryMethod: "fixed_price",
        estimator: user.name,
        nextStep: "Write and send the proposal.",
        leadSource: job?.leadSource || "",
        referralContactId: null,
        street: input.street ?? job?.street ?? "",
        city: input.city ?? job?.city ?? "",
        state: input.state ?? job?.state ?? "",
        postalCode: input.postalCode ?? job?.postalCode ?? "",
        notes: "",
      });
      return opportunity.id;
    },
    [addOpportunity, state.jobs, state.opportunities, user.name]
  );

  const addClient = useCallback(
    async (input: Omit<Client, "id"> & {
      contactName?: string;
      contactTitle?: string;
      isReferralPartner?: boolean;
    }) => {
      const { contactName, contactTitle, isReferralPartner, ...clientInput } = input;
      const supabase = requireClient();
      if (!supabase) {
        const client: Client = { ...clientInput, id: crypto.randomUUID() };
        const contacts = contactName
          ? [
              {
                id: crypto.randomUUID(),
                clientId: client.id,
                name: contactName,
                title: contactTitle || "Primary contact",
                email: "",
                phone: "",
                ownerStaffId: user.staffId,
                isReferralPartner: Boolean(isReferralPartner),
              } satisfies Contact,
            ]
          : [];
        setState((prev) => ({
          ...prev,
          clients: [client, ...prev.clients],
          contacts: [...contacts, ...prev.contacts],
        }));
        return client;
      }
      const { data, error } = await supabase
        .from("clients")
        .insert({
          company_id: user.companyId,
          ...clientInput,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the client.");
        throw error ?? new Error("Could not add the client.");
      }
      const client = mapClient(data);
      setState((prev) => ({ ...prev, clients: [client, ...prev.clients] }));
      if (contactName) {
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            company_id: user.companyId,
            client_id: client.id,
            name: contactName,
            title: contactTitle || "Primary contact",
            owner_staff_id: user.staffId || null,
            is_referral_partner: Boolean(isReferralPartner),
          })
          .select("*")
          .single();
        if (contactError) toast.error(contactError.message);
        else if (contact) {
          setState((prev) => ({ ...prev, contacts: [mapContact(contact), ...prev.contacts] }));
        }
      }
      return client;
    },
    [user.companyId, user.staffId]
  );

  const addContact = useCallback(
    async (input: Omit<Contact, "id">) => {
      const contact: Contact = {
        id: "",
        ...input,
        ownerStaffId: input.ownerStaffId || user.staffId,
      };
      const supabase = requireClient();
      if (!supabase) {
        const created = { ...contact, id: crypto.randomUUID() };
        setState((prev) => ({ ...prev, contacts: [created, ...prev.contacts] }));
        return created;
      }
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          company_id: user.companyId,
          client_id: contact.clientId || null,
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          owner_staff_id: contact.ownerStaffId || null,
          is_referral_partner: contact.isReferralPartner,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(
          isRequiredClientId(error) ? requiredClientIdMessage() : error?.message ?? "Could not add the contact."
        );
        throw error ?? new Error("Could not add the contact.");
      }
      const mapped = mapContact(data);
      setState((prev) => ({ ...prev, contacts: [mapped, ...prev.contacts] }));
      return mapped;
    },
    [user.companyId, user.staffId]
  );

  const updateContact = useCallback(
    async (id: string, patch: Partial<Omit<Contact, "id">>) => {
      const apply = () =>
        setState((prev) => ({
          ...prev,
          contacts: prev.contacts.map((contact) =>
            contact.id === id ? { ...contact, ...patch } : contact
          ),
        }));
      const supabase = requireClient();
      if (!supabase) {
        apply();
        return true;
      }
      const { error } = await supabase.from("contacts").update(contactPatch(patch)).eq("id", id);
      if (error) {
        toast.error(
          isRequiredClientId(error) ? requiredClientIdMessage() : error.message || "Could not save the contact."
        );
        return false;
      }
      apply();
      return true;
    },
    []
  );

  const assignOpportunityOwner = useCallback(
    async (id: string, staffId: string) => {
      const member = state.staff.find((item) => item.id === staffId);
      if (!member || member.locked) {
        toast.error("Pick someone with an active seat.");
        return false;
      }
      const opportunity = state.opportunities.find((item) => item.id === id);
      if (!opportunity) return false;
      const previousOwnerId = opportunity.ownerStaffId;
      const ok = await updateOpportunity(id, { ownerStaffId: staffId, estimator: member.name });
      if (!ok) return false;
      const job = state.jobs.find((item) => item.opportunityId === id);
      if (job) {
        await updateJob(job.id, { ownerStaffId: staffId, projectManager: member.name });
      }
      const contact = opportunity.primaryContactId
        ? state.contacts.find((item) => item.id === opportunity.primaryContactId)
        : undefined;
      if (
        contact &&
        !contact.isReferralPartner &&
        (!contact.ownerStaffId || contact.ownerStaffId === previousOwnerId)
      ) {
        await updateContact(contact.id, { ownerStaffId: staffId });
      }
      return true;
    },
    [state.contacts, state.jobs, state.opportunities, state.staff, updateContact, updateJob, updateOpportunity]
  );

  const addJob = useCallback(
    async (input: Omit<JobDraft, "id" | "ownerStaffId"> & { ownerStaffId?: string }) => {
      const ownerStaffId =
        input.ownerStaffId ||
        staffByName(input.projectManager, state.staff)?.id ||
        user.staffId;
      const linked = input.opportunityId
        ? state.opportunities.find((opportunity) => opportunity.id === input.opportunityId)
        : undefined;
      const code = allocateCode(user.name, state.jobs, state.opportunities, linked?.code);
      const job = fillJobRecord({ ...input, id: crypto.randomUUID(), ownerStaffId, code }, linked);
      const supabase = requireClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, jobs: [job, ...prev.jobs] }));
        return job;
      }
      const payload = jobInsertPayload(job, user.companyId, { code });
      const inserted = await insertJobWithFallbacks(payload, async (row) => {
        const result = await supabase.from("jobs").insert(row as never).select("*").single();
        return { data: result.data, error: result.error };
      });
      if (inserted.hint) toast.message(inserted.hint);
      const data = inserted.data;
      const error = inserted.error;
      if (error || !data) {
        toast.error(jobInsertError(error, "Could not log the job."));
        throw error ?? new Error("Could not log the job.");
      }
      const mapped = fillJobRecord({ ...job, id: data.id, code: data.code || code }, linked);
      setState((prev) => ({ ...prev, jobs: [mapped, ...prev.jobs] }));
      await addActivity({
        entityType: "job",
        entityId: mapped.id,
        type: "note",
        body: "Job logged. Set the field team and confirm contract value.",
      });
      return mapped;
    },
    [addActivity, state.jobs, state.opportunities, state.staff, user.companyId, user.name, user.staffId]
  );

  const toggleTask = useCallback(async (id: string) => {
    const current = state.tasks.find((task) => task.id === id);
    if (!current) return;
    const supabase = requireClient();
    if (!supabase) {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === id ? { ...task, completed: !task.completed } : task
        ),
      }));
      return;
    }
    const { error } = await supabase.from("tasks").update({ completed: !current.completed }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      ),
    }));
  }, [state.tasks]);

  const addTask = useCallback(
    async (input: {
      title: string;
      dueAt: string;
      relatedType: "opportunity" | "job" | "client" | null;
      relatedId: string | null;
      assignee: string;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          company_id: user.companyId,
          title: input.title,
          due_at: input.dueAt,
          related_type: input.relatedType,
          related_id: input.relatedId,
          assignee: input.assignee,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the task.");
        return;
      }
      setState((prev) => ({ ...prev, tasks: [mapTask(data), ...prev.tasks] }));
    },
    [user.companyId]
  );

  const addEstimate = useCallback(
    async (input: {
      name: string;
      clientId: string | null;
      opportunityId: string | null;
      jobId: string | null;
      contactId?: string | null;
      notes?: string;
      validUntil?: string | null;
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      intro?: string;
      terms?: string;
      market?: import("@/lib/types").JobMarket;
      templateId?: string | null;
    }) => {
      const opportunityId = await ensureLeadForEstimate(input);
      const number = nextNumber("EST", state.estimates.map((estimate) => estimate.number));
      const pipelineJobId =
        input.jobId ||
        state.jobs.find((job) => job.opportunityId === opportunityId)?.id ||
        null;
      const linked = siteFromLinked(pipelineJobId, opportunityId, state.jobs, state.opportunities);
      const template = input.templateId
        ? state.estimateTemplates.find((item) => item.id === input.templateId)
        : undefined;
      const templateFields = template ? estimateFieldsFromTemplate(template) : null;
      const market =
        input.market ??
        templateFields?.market ??
        workMarket(
          pipelineJobId ? state.jobs.find((item) => item.id === pipelineJobId) : undefined,
          state.opportunities.find((item) => item.id === opportunityId),
        );
      const estimate = fillEstimate({
        id: crypto.randomUUID(),
        number,
        name: input.name,
        clientId: input.clientId,
        opportunityId,
        jobId: pipelineJobId,
        contactId: input.contactId || null,
        status: "draft",
        notes: input.notes || templateFields?.notes || "",
        validUntil: input.validUntil || defaultEstimateValidUntil(),
        sentAt: null,
        acceptedAt: null,
        createdAt: new Date().toISOString(),
        intro: input.intro || templateFields?.intro || "",
        terms: resolveEstimateTerms({
          explicit: input.terms,
          templateTerms: templateFields?.terms,
          companyDefault: companySettings.defaultEstimateTerms,
        }),
        street: input.street ?? linked.street,
        city: input.city ?? linked.city,
        state: input.state ?? linked.state,
        postalCode: input.postalCode ?? linked.postalCode,
        shareToken: newShareToken(),
        taxRate: defaultTaxRateForMarket(market) === 0 ? 0 : templateFields?.taxRate ?? defaultTaxRateForMarket(market),
        discountKind: templateFields?.discountKind,
        discountValue: templateFields?.discountValue,
        depositKind: templateFields?.depositKind,
        depositValue: templateFields?.depositValue,
      });
      const copiedLines = template
        ? estimateLinesFromTemplate(template.id, estimate.id, state.estimateTemplateLines)
        : [];
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          estimates: [estimate, ...prev.estimates],
          estimateLines: [...prev.estimateLines, ...copiedLines],
        }));
        return estimate;
      }
      const payload = {
        company_id: user.companyId,
        number,
        name: estimate.name,
        client_id: estimate.clientId || null,
        opportunity_id: estimate.opportunityId || null,
        job_id: estimate.jobId || null,
        contact_id: estimate.contactId || null,
        notes: estimate.notes,
        valid_until: estimate.validUntil,
        tax_rate: estimate.taxRate,
        discount_kind: estimate.discountKind,
        discount_value: estimate.discountValue,
        deposit_kind: estimate.depositKind,
        deposit_value: estimate.depositValue,
        intro: estimate.intro,
        terms: estimate.terms,
        street: estimate.street,
        city: estimate.city,
        state: estimate.state,
        postal_code: estimate.postalCode,
        share_token: estimate.shareToken,
      };
      let { data, error } = await supabase.from("estimates").insert(payload).select("*").single();
      if (error && isMissingEstimateWriter(error)) {
        const retry = await supabase
          .from("estimates")
          .insert({
            company_id: payload.company_id,
            number: payload.number,
            name: payload.name,
            client_id: payload.client_id,
            opportunity_id: payload.opportunity_id,
            job_id: payload.job_id,
            notes: payload.notes,
            valid_until: payload.valid_until,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error && data) toast.message(missingEstimateWriterMessage());
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not create the estimate.");
        throw error ?? new Error("Could not create the estimate.");
      }
      const mapped = fillEstimate({ ...estimate, ...mapEstimate(data), id: data.id, number: data.number || number });
      const lines = copiedLines.map((line) => ({ ...line, estimateId: mapped.id }));
      if (lines.length) {
        const linePayload = lines.map((line) => ({
          id: line.id,
          company_id: user.companyId,
          estimate_id: mapped.id,
          catalog_item_id: line.catalogItemId,
          title: line.title,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
          group_name: line.groupName,
          optional: line.optional,
          selected: line.selected,
          taxable: line.taxable,
          photo_ids: line.photoIds,
        }));
        const inserted = await supabase.from("estimate_lines").insert(linePayload);
        if (inserted.error && isMissingEstimateLinePhotos(inserted.error)) {
          toast.message(missingEstimateLinePhotosMessage());
        } else if (inserted.error && !isMissingEstimateWriter(inserted.error)) {
          toast.error(inserted.error.message);
        }
      }
      setState((prev) => ({
        ...prev,
        estimates: [mapped, ...prev.estimates],
        estimateLines: [...prev.estimateLines, ...lines],
      }));
      return mapped;
    },
    [
      ensureLeadForEstimate,
      state.estimateTemplateLines,
      state.estimateTemplates,
      state.estimates,
      state.jobs,
      state.opportunities,
      user.companyId,
      companySettings.defaultEstimateTerms,
    ]
  );

  const updateEstimate = useCallback(async (id: string, patch: Partial<Estimate>) => {
    const current = state.estimates.find((estimate) => estimate.id === id);
    const allowed = applyPaymentOnlyTerms(patch, current?.terms);
    if (!allowed) return;
    patch = allowed;
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? fillEstimate({ ...estimate, ...patch }) : estimate
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimates").update(estimatePatch(patch)).eq("id", id);
    if (error) {
      if (isMissingSignerLinks(error)) {
        apply();
        toast.message(missingSignerLinksMessage());
        return;
      }
      if (isMissingSignatureColumn(error) && (patch.signatureName !== undefined || patch.signatureImage !== undefined)) {
        apply();
        toast.message(missingSignatureMessage());
        return;
      }
      if (isMissingEstimateWriter(error)) {
        apply();
        toast.message(missingEstimateWriterMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, [state.estimates]);

  const sendEstimate = useCallback(
    async (id: string) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) return;
      const sentAt = new Date().toISOString();
      const tokens = mintEstimateSignerTokens(current);
      const owner = resolveProjectOwner({
        estimate: current,
        jobs: state.jobs,
        opportunities: state.opportunities,
        staff: state.staff,
        user,
        companyName: companySettings.name,
      });
      const ownerSignedAt = current.ownerSignedAt || sentAt;
      const ownerSignedName = current.ownerSignedName.trim() || owner.name;
      const apply = () =>
        setState((prev) => ({
          ...prev,
          estimates: prev.estimates.map((estimate) =>
            estimate.id === id
              ? {
                  ...estimate,
                  status: "sent" as const,
                  sentAt,
                  shareToken: tokens.shareToken,
                  secondShareToken: tokens.secondShareToken,
                  ownerSignedAt,
                  ownerSignedName,
                }
              : estimate
          ),
        }));
      const supabase = maybeClient();
      if (supabase) {
        const payload: {
          status: "sent";
          sent_at: string;
          share_token?: string;
          second_share_token?: string;
          owner_signed_at?: string;
          owner_signed_name?: string;
        } = {
          status: "sent",
          sent_at: sentAt,
          share_token: tokens.shareToken,
          second_share_token: tokens.secondShareToken,
          owner_signed_at: ownerSignedAt,
          owner_signed_name: ownerSignedName,
        };
        let { error } = await supabase.from("estimates").update(payload).eq("id", id);
        if (error && isMissingSignerLinks(error)) {
          const retry = await supabase.from("estimates").update({
            status: "sent",
            sent_at: sentAt,
            share_token: tokens.shareToken,
            owner_signed_at: ownerSignedAt,
            owner_signed_name: ownerSignedName,
          }).eq("id", id);
          error = retry.error;
          if (!error) toast.message(missingSignerLinksMessage());
        }
        if (error && isMissingOwnerSignature(error)) {
          const retry = await supabase.from("estimates").update({
            status: "sent",
            sent_at: sentAt,
            share_token: tokens.shareToken,
          }).eq("id", id);
          error = retry.error;
          if (!error) toast.message(missingOwnerSignatureMessage());
        }
        if (error && isMissingShareToken(error)) {
          const retry = await supabase
            .from("estimates")
            .update({ status: "sent", sent_at: sentAt })
            .eq("id", id);
          error = retry.error;
        }
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      apply();
      const opportunityId = current.opportunityId || (await ensureLeadForEstimate(current));
      if (opportunityId && opportunityId !== current.opportunityId) {
        await updateEstimate(id, { opportunityId });
      }
      if (opportunityId) {
        const opportunity = state.opportunities.find((item) => item.id === opportunityId);
        if (
          opportunity &&
          (opportunity.stage === "pursuing" || opportunity.stage === "estimating")
        ) {
          await moveOpportunity(opportunityId, "bid_submitted");
        }
        await addActivity({
          entityType: "opportunity",
          entityId: opportunityId,
          type: "email",
          body: `Sent proposal ${current.number} — ${current.name}.`,
        });
      }
    },
    [
      addActivity,
      companySettings.name,
      ensureLeadForEstimate,
      moveOpportunity,
      state.estimates,
      state.jobs,
      state.opportunities,
      state.staff,
      updateEstimate,
      user,
    ]
  );

  const acceptEstimate = useCallback(
    async (
      id: string,
      signature?: { name: string; image: string },
      signer: HomeownerSigner = "primary",
    ) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) return;
      const role: HomeownerSigner =
        signer === "second" && estimateNeedsSecondSignature(current) ? "second" : "primary";
      const now = new Date().toISOString();
      const next = nextEstimateSignature(current, role, now);
      const signatureName = signature?.name.trim() || (role === "second" ? current.secondSignatureName : current.signatureName);
      const signatureImage = signature?.image || (role === "second" ? current.secondSignatureImage : current.signatureImage);
      const patch =
        role === "second"
          ? {
              ...next,
              secondSignatureName: signatureName,
              secondSignatureImage: signatureImage,
            }
          : {
              ...next,
              signatureName,
              signatureImage,
            };
      const apply = () =>
        setState((prev) => ({
          ...prev,
          estimates: prev.estimates.map((estimate) =>
            estimate.id === id ? fillEstimate({ ...estimate, ...patch }) : estimate,
          ),
        }));
      const supabase = maybeClient();
      if (supabase) {
        let { error } = await supabase.from("estimates").update(estimatePatch(patch)).eq("id", id);
        if (error && isMissingSignerLinks(error) && role === "second") {
          apply();
          toast.message(missingSignerLinksMessage());
          return;
        }
        if (error && isMissingSignatureColumn(error)) {
          const retry = await supabase
            .from("estimates")
            .update({
              status: patch.status,
              accepted_at: patch.acceptedAt,
            })
            .eq("id", id);
          error = retry.error;
          if (!retry.error) toast.message(missingSignatureMessage());
        }
        if (error) {
          toast.error(isAmbiguousSignJobId(error) ? ambiguousSignJobIdMessage() : error.message);
          return;
        }
      }
      apply();
      const opportunityId = current.opportunityId || (await ensureLeadForEstimate(current));
      if (opportunityId && opportunityId !== current.opportunityId) {
        await updateEstimate(id, { opportunityId });
      }
      if (opportunityId && next.status !== "accepted") {
        await addActivity({
          entityType: "opportunity",
          entityId: opportunityId,
          type: "note",
          body: signatureName
            ? `${signatureName} signed proposal ${current.number}. Waiting on the other homeowner.`
            : `A homeowner signed proposal ${current.number}. Waiting on the other homeowner.`,
        });
        return;
      }
      if (current.status === "accepted" || next.status !== "accepted") return;
      const total = amountForEstimate(
        current,
        state.estimateLines,
        marketForEstimate(current, state.jobs, state.opportunities),
      );
      if (opportunityId) {
        await updateOpportunity(opportunityId, { value: total });
      }
      const linkedJob =
        state.jobs.find((job) => job.id === current.jobId) ??
        state.jobs.find((job) => Boolean(opportunityId && job.opportunityId === opportunityId)) ??
        null;
      if (linkedJob) {
        await updateJob(linkedJob.id, { contractValue: total });
      }
      const job = opportunityId
        ? await moveOpportunity(opportunityId, "awarded", undefined, {
            contractValue: total,
            street: current.street,
            city: current.city,
            state: current.state,
            postalCode: current.postalCode,
          })
        : linkedJob;
      const opened = job ?? linkedJob;
      if (opened && opened.id !== current.jobId) {
        await updateEstimate(id, { jobId: opened.id, opportunityId });
      }
      if (opportunityId) {
        await addActivity({
          entityType: "opportunity",
          entityId: opportunityId,
          type: "note",
          body: signatureName
            ? `${signatureName} signed proposal ${current.number}. Job value updated from the signed estimate.`
            : `Proposal ${current.number} is signed. Job value updated from the signed estimate.`,
        });
      }
    },
    [
      addActivity,
      ensureLeadForEstimate,
      moveOpportunity,
      state.estimateLines,
      state.estimates,
      state.jobs,
      state.opportunities,
      updateEstimate,
      updateJob,
      updateOpportunity,
    ]
  );

  const declineEstimate = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, status: "declined" as const } : estimate
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimates").update({ status: "declined" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const reopenEstimate = useCallback(
    async (id: string) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) throw new Error("Estimate not found.");
      if (current.status !== "declined") {
        toast.error("Only a declined proposal can be reopened.");
        throw new Error("Estimate is not declined.");
      }
      if (state.invoices.some((invoice) => invoice.estimateId === id)) {
        toast.error("This proposal already has an invoice and cannot be reopened.");
        throw new Error("Estimate has a related invoice.");
      }
      const patch = {
        status: "draft" as const,
        sentAt: null,
        acceptedAt: null,
        secondAcceptedAt: null,
        ownerSignedAt: null,
        ownerSignedName: "",
        signatureName: "",
        signatureImage: "",
        secondSignatureName: "",
        secondSignatureImage: "",
      };
      const apply = () =>
        setState((prev) => ({
          ...prev,
          estimates: prev.estimates.map((estimate) =>
            estimate.id === id ? fillEstimate({ ...estimate, ...patch }) : estimate
          ),
        }));
      const supabase = maybeClient();
      if (supabase) {
        let { error } = await supabase.from("estimates").update(estimatePatch(patch)).eq("id", id);
        if (error && isMissingSecondSigner(error)) {
          const retry = await supabase
            .from("estimates")
            .update({
              status: "draft",
              sent_at: null,
              accepted_at: null,
              owner_signed_at: null,
              signature_name: "",
              signature_image: "",
            })
            .eq("id", id);
          error = retry.error;
          if (!error) toast.message(missingSecondSignerMessage());
        }
        if (error && isMissingOwnerSignature(error)) {
          const retry = await supabase
            .from("estimates")
            .update({
              status: "draft",
              sent_at: null,
              accepted_at: null,
              signature_name: "",
              signature_image: "",
            })
            .eq("id", id);
          error = retry.error;
          if (!error) toast.message(missingOwnerSignatureMessage());
        }
        if (error && isMissingSignatureColumn(error)) {
          const retry = await supabase
            .from("estimates")
            .update({ status: "draft", sent_at: null, accepted_at: null })
            .eq("id", id);
          error = retry.error;
          if (!error) toast.message(missingSignatureMessage());
        }
        if (error) {
          toast.error(error.message);
          throw error;
        }
      }
      apply();
      if (current.opportunityId) {
        await addActivity({
          entityType: "opportunity",
          entityId: current.opportunityId,
          type: "note",
          body: `Reopened declined proposal ${current.number} as a draft.`,
        });
      }
    },
    [addActivity, state.estimates, state.invoices]
  );

  const markEstimateViewed = useCallback(async (id: string) => {
    const current = state.estimates.find((estimate) => estimate.id === id);
    if (!current || current.status !== "sent") return;
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, status: "viewed" as const } : estimate
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimates").update({ status: "viewed" }).eq("id", id);
    if (error) return;
    apply();
  }, [state.estimates]);

  const ensureEstimateShareToken = useCallback(
    async (id: string) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) throw new Error("Estimate not found.");
      const tokens = mintEstimateSignerTokens(current);
      if (
        tokens.shareToken === current.shareToken &&
        tokens.secondShareToken === current.secondShareToken
      ) {
        return tokens.shareToken;
      }
      await updateEstimate(id, tokens);
      return tokens.shareToken;
    },
    [state.estimates, updateEstimate]
  );

  const duplicateEstimate = useCallback(
    async (id: string) => {
      const source = state.estimates.find((estimate) => estimate.id === id);
      if (!source) throw new Error("Estimate not found.");
      const lines = state.estimateLines.filter((line) => line.estimateId === source.id);
      const copy = await addEstimate({
        name: source.name.endsWith("(copy)") ? source.name : `${source.name} (copy)`,
        clientId: source.clientId,
        opportunityId: source.opportunityId,
        jobId: source.jobId,
        contactId: source.contactId,
        notes: source.notes,
        validUntil: source.validUntil,
        street: source.street,
        city: source.city,
        state: source.state,
        postalCode: source.postalCode,
        intro: source.intro,
        terms: source.terms,
      });
      const market = marketForEstimate(source, state.jobs, state.opportunities);
      const taxRate = isResidentialMarket(market)
        ? 0
        : source.taxRate || defaultTaxRateForMarket("commercial");
      await updateEstimate(copy.id, {
        taxRate,
        discountKind: source.discountKind,
        discountValue: source.discountValue,
        depositKind: source.depositKind,
        depositValue: source.depositValue,
      });
      const copied = lines
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((line) =>
          fillEstimateLine({
            ...line,
            id: crypto.randomUUID(),
            estimateId: copy.id,
          }),
        );
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, estimateLines: [...prev.estimateLines, ...copied] }));
        return fillEstimate({
          ...copy,
          taxRate,
          discountKind: source.discountKind,
          discountValue: source.discountValue,
          depositKind: source.depositKind,
          depositValue: source.depositValue,
        });
      }
      if (copied.length) {
        const payload = copied.map((line) => ({
          id: line.id,
          company_id: user.companyId,
          estimate_id: copy.id,
          catalog_item_id: line.catalogItemId,
          title: line.title,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
          group_name: line.groupName,
          optional: line.optional,
          selected: line.selected,
          taxable: line.taxable,
          photo_ids: line.photoIds,
        }));
        let { error } = await supabase.from("estimate_lines").insert(payload);
        if (error && isMissingEstimateLinePhotos(error)) {
          const retry = await supabase.from("estimate_lines").insert(
            payload.map(({ photo_ids: _photos, ...row }) => row),
          );
          error = retry.error;
          if (!error) toast.message(missingEstimateLinePhotosMessage());
        }
        if (error && isMissingEstimateWriter(error)) {
          const retry = await supabase.from("estimate_lines").insert(
            payload.map((row) => ({
              id: row.id,
              company_id: row.company_id,
              estimate_id: row.estimate_id,
              catalog_item_id: row.catalog_item_id,
              description: row.description,
              quantity: row.quantity,
              unit: row.unit,
              unit_cost: row.unit_cost,
              sort_order: row.sort_order,
            })),
          );
          error = retry.error;
        }
        if (error) {
          toast.error(error.message);
          throw error;
        }
      }
      setState((prev) => ({ ...prev, estimateLines: [...prev.estimateLines, ...copied] }));
      return fillEstimate({
        ...copy,
        taxRate,
        discountKind: source.discountKind,
        discountValue: source.discountValue,
        depositKind: source.depositKind,
        depositValue: source.depositValue,
      });
    },
    [addEstimate, state.estimateLines, state.estimates, state.jobs, state.opportunities, updateEstimate, user.companyId]
  );

  const touchTemplate = (id: string) => {
    const updatedAt = new Date().toISOString();
    return (prev: CrmState): CrmState => ({
      ...prev,
      estimateTemplates: prev.estimateTemplates.map((template) =>
        template.id === id ? { ...template, updatedAt } : template,
      ),
    });
  };

  const addEstimateTemplate = useCallback(
    async (input?: { name?: string; market?: EstimateTemplate["market"] }) => {
      const now = new Date().toISOString();
      const template = fillEstimateTemplate({
        id: crypto.randomUUID(),
        name: input?.name?.trim() || "New template",
        market: input?.market ?? "residential",
        createdAt: now,
        updatedAt: now,
        terms: resolveEstimateTerms({ companyDefault: companySettings.defaultEstimateTerms }),
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, estimateTemplates: [template, ...prev.estimateTemplates] }));
        return template;
      }
      const { data, error } = await supabase
        .from("estimate_templates")
        .insert({
          id: template.id,
          company_id: user.companyId,
          name: template.name,
          description: template.description,
          market: template.market,
          intro: template.intro,
          terms: template.terms,
          notes: template.notes,
          tax_rate: template.taxRate,
          discount_kind: template.discountKind,
          discount_value: template.discountValue,
          deposit_kind: template.depositKind,
          deposit_value: template.depositValue,
        })
        .select("*")
        .single();
      if (error) {
        if (isMissingEstimateTemplates(error)) {
          setState((prev) => ({ ...prev, estimateTemplates: [template, ...prev.estimateTemplates] }));
          toast.message(missingEstimateTemplatesMessage());
          return template;
        }
        toast.error(error.message);
        throw error;
      }
      const mapped = data ? mapEstimateTemplate(data) : template;
      setState((prev) => ({ ...prev, estimateTemplates: [mapped, ...prev.estimateTemplates] }));
      return mapped;
    },
    [user.companyId, companySettings.defaultEstimateTerms],
  );

  const updateEstimateTemplate = useCallback(async (id: string, patch: Partial<EstimateTemplate>) => {
    const current = state.estimateTemplates.find((template) => template.id === id);
    const allowed = applyPaymentOnlyTerms(patch, current?.terms);
    if (!allowed) return;
    patch = allowed;
    const updatedAt = new Date().toISOString();
    const next = { ...patch, updatedAt };
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimateTemplates: prev.estimateTemplates.map((template) =>
          template.id === id ? fillEstimateTemplate({ ...template, ...next }) : template,
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_templates").update(estimateTemplatePatch(next)).eq("id", id);
    if (error) {
      if (isMissingEstimateTemplates(error)) {
        apply();
        toast.message(missingEstimateTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, [state.estimateTemplates]);

  const removeEstimateTemplate = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimateTemplates: prev.estimateTemplates.filter((template) => template.id !== id),
        estimateTemplateLines: prev.estimateTemplateLines.filter((line) => line.templateId !== id),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_templates").delete().eq("id", id);
    if (error) {
      if (isMissingEstimateTemplates(error)) {
        apply();
        toast.message(missingEstimateTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const saveEstimateAsTemplate = useCallback(
    async (estimateId: string, name: string) => {
      const estimate = state.estimates.find((item) => item.id === estimateId);
      if (!estimate) throw new Error("Estimate not found.");
      const { template, lines } = templateFromEstimate(estimate, state.estimateLines, {
        id: crypto.randomUUID(),
        name,
        market: marketForEstimate(estimate, state.jobs, state.opportunities),
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          estimateTemplates: [template, ...prev.estimateTemplates],
          estimateTemplateLines: [...prev.estimateTemplateLines, ...lines],
        }));
        return template;
      }
      const { data, error } = await supabase
        .from("estimate_templates")
        .insert({
          id: template.id,
          company_id: user.companyId,
          name: template.name,
          description: template.description,
          market: template.market,
          intro: template.intro,
          terms: template.terms,
          notes: template.notes,
          tax_rate: template.taxRate,
          discount_kind: template.discountKind,
          discount_value: template.discountValue,
          deposit_kind: template.depositKind,
          deposit_value: template.depositValue,
        })
        .select("*")
        .single();
      if (error) {
        if (isMissingEstimateTemplates(error)) {
          setState((prev) => ({
            ...prev,
            estimateTemplates: [template, ...prev.estimateTemplates],
            estimateTemplateLines: [...prev.estimateTemplateLines, ...lines],
          }));
          toast.message(missingEstimateTemplatesMessage());
          return template;
        }
        toast.error(error.message);
        throw error;
      }
      const mapped = data ? mapEstimateTemplate(data) : template;
      if (lines.length) {
        const payload = lines.map((line) => ({
          id: line.id,
          company_id: user.companyId,
          template_id: mapped.id,
          catalog_item_id: line.catalogItemId,
          title: line.title,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
          group_name: line.groupName,
          optional: line.optional,
          selected: line.selected,
          taxable: line.taxable,
        }));
        const inserted = await supabase.from("estimate_template_lines").insert(payload);
        if (inserted.error && !isMissingEstimateTemplates(inserted.error)) {
          toast.error(inserted.error.message);
        }
      }
      setState((prev) => ({
        ...prev,
        estimateTemplates: [mapped, ...prev.estimateTemplates],
        estimateTemplateLines: [...prev.estimateTemplateLines, ...lines],
      }));
      return mapped;
    },
    [state.estimateLines, state.estimates, state.jobs, state.opportunities, user.companyId],
  );

  const addTemplateLineFromCatalog = useCallback(
    async (templateId: string, catalogItemId: string, groupName?: string) => {
      const item = state.catalog.find((entry) => entry.id === catalogItemId);
      if (!item) return;
      const sortOrder =
        Math.max(
          0,
          ...state.estimateTemplateLines.filter((line) => line.templateId === templateId).map((line) => line.sortOrder),
        ) + 1;
      const line = fillEstimateTemplateLine({
        id: crypto.randomUUID(),
        templateId,
        catalogItemId: item.id,
        title: item.name,
        description: item.name,
        quantity: 1,
        unit: item.unit,
        unitCost: item.unitCost,
        sortOrder,
        groupName: groupName ?? "",
      });
      await persistTemplateLine(line);
    },
    [state.catalog, state.estimateTemplateLines, user.companyId],
  );

  const addCustomTemplateLine = useCallback(
    async (templateId: string, groupName?: string) => {
      const sortOrder =
        Math.max(
          0,
          ...state.estimateTemplateLines.filter((line) => line.templateId === templateId).map((line) => line.sortOrder),
        ) + 1;
      const line = fillEstimateTemplateLine({
        id: crypto.randomUUID(),
        templateId,
        catalogItemId: null,
        title: "New item",
        description: "",
        quantity: 1,
        unit: "LS",
        unitCost: 0,
        sortOrder,
        groupName: groupName ?? "",
      });
      await persistTemplateLine(line);
    },
    [state.estimateTemplateLines, user.companyId],
  );

  async function persistTemplateLine(line: EstimateTemplateLine) {
    const supabase = maybeClient();
    if (!supabase) {
      setState((prev) => ({
        ...touchTemplate(line.templateId)(prev),
        estimateTemplateLines: [...prev.estimateTemplateLines, line],
      }));
      return;
    }
    const { error } = await supabase.from("estimate_template_lines").insert({
      id: line.id,
      company_id: user.companyId,
      template_id: line.templateId,
      catalog_item_id: line.catalogItemId,
      title: line.title,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unitCost,
      sort_order: line.sortOrder,
      group_name: line.groupName,
      optional: line.optional,
      selected: line.selected,
      taxable: line.taxable,
    });
    if (error) {
      if (isMissingEstimateTemplates(error)) {
        setState((prev) => ({
          ...touchTemplate(line.templateId)(prev),
          estimateTemplateLines: [...prev.estimateTemplateLines, line],
        }));
        toast.message(missingEstimateTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...touchTemplate(line.templateId)(prev),
      estimateTemplateLines: [...prev.estimateTemplateLines, line],
    }));
  }

  const updateTemplateLine = useCallback(async (id: string, patch: Partial<EstimateTemplateLine>) => {
    const current = state.estimateTemplateLines.find((line) => line.id === id);
    const apply = () =>
      setState((prev) => {
        const lines = prev.estimateTemplateLines.map((line) =>
          line.id === id ? fillEstimateTemplateLine({ ...line, ...patch }) : line,
        );
        const templateId = lines.find((line) => line.id === id)?.templateId;
        return templateId
          ? { ...touchTemplate(templateId)(prev), estimateTemplateLines: lines }
          : { ...prev, estimateTemplateLines: lines };
      });
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_template_lines").update(estimateTemplateLinePatch(patch)).eq("id", id);
    if (error) {
      if (isMissingEstimateTemplates(error)) {
        apply();
        toast.message(missingEstimateTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
    if (current) {
      const { error: stampError } = await supabase
        .from("estimate_templates")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", current.templateId);
      if (stampError && !isMissingEstimateTemplates(stampError)) toast.error(stampError.message);
    }
  }, [state.estimateTemplateLines]);

  const removeTemplateLine = useCallback(async (id: string) => {
    const current = state.estimateTemplateLines.find((line) => line.id === id);
    const apply = () =>
      setState((prev) => {
        const lines = prev.estimateTemplateLines.filter((line) => line.id !== id);
        return current ? { ...touchTemplate(current.templateId)(prev), estimateTemplateLines: lines } : { ...prev, estimateTemplateLines: lines };
      });
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_template_lines").delete().eq("id", id);
    if (error) {
      if (isMissingEstimateTemplates(error)) {
        apply();
        toast.message(missingEstimateTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, [state.estimateTemplateLines]);

  const reorderTemplateLine = useCallback(
    async (id: string, direction: "up" | "down") => {
      const current = state.estimateTemplateLines.find((line) => line.id === id);
      if (!current) return;
      const siblings = state.estimateTemplateLines
        .filter((line) => line.templateId === current.templateId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = siblings.findIndex((line) => line.id === id);
      const swapWith = direction === "up" ? siblings[index - 1] : siblings[index + 1];
      if (!swapWith) return;
      await updateTemplateLine(id, { sortOrder: swapWith.sortOrder });
      await updateTemplateLine(swapWith.id, { sortOrder: current.sortOrder });
    },
    [state.estimateTemplateLines, updateTemplateLine],
  );

  const addCatalogItem = useCallback(
    async (input: {
      name: string;
      kind: CatalogKind;
      unit: string;
      unitCost: number;
      costCode?: string;
    }) => {
      const name = input.name.trim();
      if (!name) {
        toast.error("Name the item so estimators can find it.");
        throw new Error("Name is required.");
      }
      const item: CatalogItem = {
        id: crypto.randomUUID(),
        name,
        kind: input.kind,
        unit: input.unit.trim() || "ea",
        unitCost: Math.max(0, Math.round(input.unitCost * 100) / 100),
        costCode: input.costCode?.trim() ?? "",
      };
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, catalog: [item, ...prev.catalog] }));
        return item;
      }
      const { data, error } = await supabase
        .from("catalog_items")
        .insert({
          id: item.id,
          company_id: user.companyId,
          name: item.name,
          kind: item.kind,
          unit: item.unit,
          unit_cost: item.unitCost,
          cost_code: item.costCode,
        })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        throw error;
      }
      const mapped = data ? mapCatalogItem(data) : item;
      setState((prev) => ({ ...prev, catalog: [mapped, ...prev.catalog] }));
      return mapped;
    },
    [user.companyId],
  );

  const updateCatalogItem = useCallback(async (id: string, patch: Partial<CatalogItem>) => {
    const next: Partial<CatalogItem> = { ...patch };
    if (next.name !== undefined) next.name = next.name.trim();
    if (next.unit !== undefined) next.unit = next.unit.trim() || "ea";
    if (next.costCode !== undefined) next.costCode = next.costCode.trim();
    if (next.unitCost !== undefined) next.unitCost = Math.max(0, Math.round(next.unitCost * 100) / 100);
    if (next.name === "") {
      toast.error("Name the item so estimators can find it.");
      return;
    }
    const apply = () =>
      setState((prev) => ({
        ...prev,
        catalog: prev.catalog.map((item) => (item.id === id ? { ...item, ...next } : item)),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("catalog_items").update(catalogPatch(next)).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const removeCatalogItem = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        catalog: prev.catalog.filter((item) => item.id !== id),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("catalog_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const importCatalogItems = useCallback(
    async (rows: CatalogImportDraft[]) => {
      const working = [...state.catalog];
      const toInsert: CatalogItem[] = [];
      const toUpdate: Array<{ id: string; patch: CatalogImportDraft }> = [];
      for (const row of rows) {
        const next = {
          name: row.name.trim(),
          kind: row.kind,
          unit: row.unit.trim() || "ea",
          unitCost: Math.max(0, Math.round(row.unitCost * 100) / 100),
          costCode: row.costCode.trim(),
        };
        if (!next.name) continue;
        const existing = matchCatalogItem(working, next);
        if (existing) {
          const same =
            existing.name === next.name &&
            existing.kind === next.kind &&
            existing.unit === next.unit &&
            existing.unitCost === next.unitCost &&
            existing.costCode === next.costCode;
          if (!same) {
            toUpdate.push({ id: existing.id, patch: next });
            Object.assign(existing, next);
          }
          continue;
        }
        const item: CatalogItem = { id: crypto.randomUUID(), ...next };
        toInsert.push(item);
        working.unshift(item);
      }

      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => {
          const byId = new Map(prev.catalog.map((item) => [item.id, item]));
          for (const change of toUpdate) {
            const current = byId.get(change.id);
            if (current) byId.set(change.id, { ...current, ...change.patch });
          }
          return { ...prev, catalog: [...toInsert, ...byId.values()] };
        });
        return { added: toInsert.length, updated: toUpdate.length };
      }

      const chunkSize = 80;
      const inserted: CatalogItem[] = [];
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("catalog_items")
          .insert(
            chunk.map((item) => ({
              id: item.id,
              company_id: user.companyId,
              name: item.name,
              kind: item.kind,
              unit: item.unit,
              unit_cost: item.unitCost,
              cost_code: item.costCode,
            })),
          )
          .select("*");
        if (error) {
          toast.error(error.message);
          throw error;
        }
        inserted.push(...(data ?? []).map(mapCatalogItem));
      }

      for (const change of toUpdate) {
        const { error } = await supabase
          .from("catalog_items")
          .update(catalogPatch(change.patch))
          .eq("id", change.id);
        if (error) {
          toast.error(error.message);
          throw error;
        }
      }

      setState((prev) => {
        const byId = new Map(prev.catalog.map((item) => [item.id, item]));
        for (const change of toUpdate) {
          const current = byId.get(change.id);
          if (current) byId.set(change.id, { ...current, ...change.patch });
        }
        for (const item of inserted.length > 0 ? inserted : toInsert) {
          byId.set(item.id, item);
        }
        return { ...prev, catalog: [...byId.values()] };
      });
      return { added: inserted.length || toInsert.length, updated: toUpdate.length };
    },
    [state.catalog, user.companyId],
  );

  const addEstimateLineFromCatalog = useCallback(
    async (estimateId: string, catalogItemId: string, groupName?: string) => {
      const item = state.catalog.find((entry) => entry.id === catalogItemId);
      if (!item) return;
      const sortOrder =
        Math.max(
          0,
          ...state.estimateLines
            .filter((line) => line.estimateId === estimateId)
            .map((line) => line.sortOrder)
        ) + 1;
      const line = fillEstimateLine({
        id: crypto.randomUUID(),
        estimateId,
        catalogItemId: item.id,
        title: item.name,
        description: item.name,
        quantity: 1,
        unit: item.unit,
        unitCost: item.unitCost,
        sortOrder,
        groupName: groupName ?? "",
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, estimateLines: [...prev.estimateLines, line] }));
        return line;
      }
      const payload = {
        company_id: user.companyId,
        estimate_id: estimateId,
        catalog_item_id: item.id,
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: sortOrder,
        group_name: line.groupName,
        optional: line.optional,
        selected: line.selected,
        taxable: line.taxable,
      };
      let { data, error } = await supabase.from("estimate_lines").insert(payload).select("*").single();
      if (error && isMissingEstimateWriter(error)) {
        const retry = await supabase
          .from("estimate_lines")
          .insert({
            company_id: payload.company_id,
            estimate_id: payload.estimate_id,
            catalog_item_id: payload.catalog_item_id,
            description: payload.description,
            quantity: payload.quantity,
            unit: payload.unit,
            unit_cost: payload.unit_cost,
            sort_order: payload.sort_order,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingEstimateWriterMessage());
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the line.");
        return;
      }
      const saved = fillEstimateLine({ ...line, ...mapEstimateLine(data), id: data.id });
      setState((prev) => ({
        ...prev,
        estimateLines: [...prev.estimateLines, saved],
      }));
      return saved;
    },
    [state.catalog, state.estimateLines, user.companyId]
  );

  const addCustomEstimateLine = useCallback(
    async (estimateId: string, groupName?: string) => {
      const sortOrder =
        Math.max(
          0,
          ...state.estimateLines
            .filter((line) => line.estimateId === estimateId)
            .map((line) => line.sortOrder)
        ) + 1;
      const line = fillEstimateLine({
        id: crypto.randomUUID(),
        estimateId,
        catalogItemId: null,
        title: "New item",
        description: "",
        quantity: 1,
        unit: "LS",
        unitCost: 0,
        sortOrder,
        groupName: groupName ?? "",
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, estimateLines: [...prev.estimateLines, line] }));
        return line;
      }
      const payload = {
        company_id: user.companyId,
        estimate_id: estimateId,
        title: line.title,
        description: line.description || line.title,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: sortOrder,
        group_name: line.groupName,
        optional: line.optional,
        selected: line.selected,
        taxable: line.taxable,
      };
      let { data, error } = await supabase.from("estimate_lines").insert(payload).select("*").single();
      if (error && isMissingEstimateWriter(error)) {
        const retry = await supabase
          .from("estimate_lines")
          .insert({
            company_id: payload.company_id,
            estimate_id: payload.estimate_id,
            description: payload.description,
            quantity: payload.quantity,
            unit: payload.unit,
            unit_cost: payload.unit_cost,
            sort_order: payload.sort_order,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingEstimateWriterMessage());
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the line.");
        return;
      }
      const saved = fillEstimateLine({ ...line, ...mapEstimateLine(data), id: data.id });
      setState((prev) => ({
        ...prev,
        estimateLines: [...prev.estimateLines, saved],
      }));
      return saved;
    },
    [state.estimateLines, user.companyId]
  );

  const updateEstimateLine = useCallback(async (id: string, patch: Partial<EstimateLine>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimateLines: prev.estimateLines.map((line) =>
          line.id === id ? fillEstimateLine({ ...line, ...patch }) : line
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_lines").update(estimateLinePatch(patch)).eq("id", id);
    if (error) {
      if (isMissingEstimateLinePhotos(error)) {
        apply();
        toast.message(missingEstimateLinePhotosMessage());
        return;
      }
      if (isMissingEstimateWriter(error)) {
        apply();
        toast.message(missingEstimateWriterMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const removeEstimateLine = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        estimateLines: prev.estimateLines.filter((line) => line.id !== id),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("estimate_lines").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const reorderEstimateLine = useCallback(
    async (id: string, direction: "up" | "down") => {
      const current = state.estimateLines.find((line) => line.id === id);
      if (!current) return;
      const siblings = state.estimateLines
        .filter((line) => line.estimateId === current.estimateId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = siblings.findIndex((line) => line.id === id);
      const swap = direction === "up" ? siblings[index - 1] : siblings[index + 1];
      if (!swap) return;
      const firstOrder = current.sortOrder;
      const secondOrder = swap.sortOrder;
      await updateEstimateLine(current.id, { sortOrder: secondOrder });
      await updateEstimateLine(swap.id, { sortOrder: firstOrder });
    },
    [state.estimateLines, updateEstimateLine]
  );

  const convertEstimateToInvoice = useCallback(
    async (estimateId: string) => {
      const estimate = state.estimates.find((item) => item.id === estimateId);
      if (!estimate) throw new Error("Estimate not found.");
      const billed = invoiceLinesFromEstimate(
        estimate,
        state.estimateLines,
        marketForEstimate(estimate, state.jobs, state.opportunities),
      );
      if (billed.length === 0) {
        toast.error("Add at least one included line before converting.");
        throw new Error("No included lines.");
      }
      const number = nextNumber("INV", state.invoices.map((invoice) => invoice.number));
      const issuedAt = new Date().toISOString().slice(0, 10);
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const dueAt = due.toISOString().slice(0, 10);
      const notes = estimate.notes.trim();
      const terms = resolveInvoiceTerms({ companyDefault: companySettings.defaultInvoiceTerms });
      const supabase = maybeClient();
      if (!supabase) {
        const invoice = {
          id: crypto.randomUUID(),
          number,
          name: estimate.name,
          clientId: estimate.clientId,
          jobId: estimate.jobId,
          estimateId: estimate.id,
          status: "draft" as const,
          issuedAt,
          dueAt,
          notes,
          terms,
          shareToken: newShareToken(),
          qbStatus: "not_in_qb" as const,
        };
        const mappedLines = billed.map((line) => ({
          id: crypto.randomUUID(),
          invoiceId: invoice.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          sortOrder: line.sortOrder,
        }));
        setState((prev) => ({
          ...prev,
          invoices: [invoice, ...prev.invoices],
          invoiceLines: [...prev.invoiceLines, ...mappedLines],
        }));
        return invoice;
      }
      const payload = {
        company_id: user.companyId,
        number,
        name: estimate.name,
        client_id: estimate.clientId,
        job_id: estimate.jobId,
        estimate_id: estimate.id,
        status: "draft" as const,
        issued_at: issuedAt,
        due_at: dueAt,
        notes,
        terms,
        share_token: newShareToken(),
        qb_status: "not_in_qb",
      };
      const { data, error } = await insertInvoiceRow(supabase, payload);
      if (error || !data) {
        toast.error(error?.message ?? "Could not convert the estimate.");
        throw error ?? new Error("Could not convert the estimate.");
      }
      const { error: lineError } = await supabase.from("invoice_lines").insert(
        billed.map((line) => ({
          company_id: user.companyId,
          invoice_id: data.id,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
        }))
      );
      if (lineError) {
        toast.error(lineError.message);
        throw lineError;
      }
      const invoice = mapInvoice(data);
      if (!Object.prototype.hasOwnProperty.call(data, "terms")) invoice.terms = terms;
      const mappedLines = billed.map((line) => ({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        sortOrder: line.sortOrder,
      }));
      setState((prev) => ({
        ...prev,
        invoices: [invoice, ...prev.invoices],
        invoiceLines: [...prev.invoiceLines, ...mappedLines],
      }));
      await load();
      return invoice;
    },
    [load, state.estimateLines, state.estimates, state.invoices, user.companyId, companySettings.defaultInvoiceTerms]
  );

  const addInvoice = useCallback(
    async (input: {
      name: string;
      clientId: string | null;
      jobId: string | null;
      dueAt: string | null;
      notes?: string;
      terms?: string;
    }) => {
      const number = nextNumber("INV", state.invoices.map((invoice) => invoice.number));
      const invoice = {
        id: crypto.randomUUID(),
        number,
        name: input.name,
        clientId: input.clientId,
        jobId: input.jobId,
        estimateId: null,
        status: "draft" as const,
        issuedAt: new Date().toISOString().slice(0, 10),
        dueAt: input.dueAt,
        notes: input.notes ?? "",
        terms: resolveInvoiceTerms({
          explicit: input.terms,
          companyDefault: companySettings.defaultInvoiceTerms,
        }),
        shareToken: newShareToken(),
        qbStatus: "not_in_qb" as const,
      };
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({ ...prev, invoices: [invoice, ...prev.invoices] }));
        return invoice;
      }
      const payload = {
        company_id: user.companyId,
        number,
        name: invoice.name,
        client_id: invoice.clientId || null,
        job_id: invoice.jobId,
        notes: invoice.notes,
        terms: invoice.terms,
        due_at: invoice.dueAt,
        share_token: invoice.shareToken,
        qb_status: invoice.qbStatus,
      };
      const { data, error } = await insertInvoiceRow(supabase, payload);
      if (error || !data) {
        toast.error(error?.message ?? "Could not create the invoice.");
        throw error ?? new Error("Could not create the invoice.");
      }
      const mapped = { ...invoice, ...mapInvoice(data), id: data.id, number: data.number || number };
      if (!Object.prototype.hasOwnProperty.call(data, "terms")) mapped.terms = invoice.terms;
      setState((prev) => ({ ...prev, invoices: [mapped, ...prev.invoices] }));
      return mapped;
    },
    [state.invoices, user.companyId, companySettings.defaultInvoiceTerms]
  );

  const updateInvoice = useCallback(async (id: string, patch: Partial<Invoice>) => {
    const current = state.invoices.find((invoice) => invoice.id === id);
    const allowed = applyPaymentOnlyTerms(patch, current?.terms);
    if (!allowed) return;
    patch = allowed;
    const apply = () =>
      setState((prev) => ({
        ...prev,
        invoices: prev.invoices.map((invoice) => (invoice.id === id ? { ...invoice, ...patch } : invoice)),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("invoices").update(invoicePatch(patch)).eq("id", id);
    if (error) {
      if (isMissingInvoiceTermsColumn(error) && patch.terms !== undefined) {
        apply();
        toast.message(missingDocumentTermsMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, [state.invoices]);

  const sendInvoice = useCallback(async (id: string) => {
    const current = state.invoices.find((invoice) => invoice.id === id);
    if (!current) return;
    const shareToken = current.shareToken || newShareToken();
    const apply = () =>
      setState((prev) => ({
        ...prev,
        invoices: prev.invoices.map((invoice) =>
          invoice.id === id ? { ...invoice, status: "sent" as const, shareToken } : invoice
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    let { error } = await supabase
      .from("invoices")
      .update({ status: "sent", share_token: shareToken })
      .eq("id", id);
    if (error && isMissingShareToken(error)) {
      const retry = await supabase.from("invoices").update({ status: "sent" }).eq("id", id);
      error = retry.error;
    }
    if (error) {
      toast.error(error.message);
      return;
    }
    apply();
  }, [state.invoices]);

  const ensureInvoiceShareToken = useCallback(async (id: string) => {
    const current = state.invoices.find((invoice) => invoice.id === id);
    if (!current) throw new Error("Invoice not found.");
    if (current.shareToken) return current.shareToken;
    const shareToken = newShareToken();
    const apply = () =>
      setState((prev) => ({
        ...prev,
        invoices: prev.invoices.map((invoice) =>
          invoice.id === id ? { ...invoice, shareToken } : invoice
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return shareToken;
    }
    const { error } = await supabase.from("invoices").update(invoicePatch({ shareToken })).eq("id", id);
    if (error) {
      if (isMissingShareToken(error)) {
        apply();
        return shareToken;
      }
      toast.error(error.message);
      throw error;
    }
    apply();
    return shareToken;
  }, [state.invoices]);

  const voidInvoice = useCallback(async (id: string) => {
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === id ? { ...invoice, status: "void" } : invoice
      ),
    }));
  }, []);

  const recordPayment = useCallback(
    async (input: {
      invoiceId?: string | null;
      jobId?: string | null;
      amount: number;
      method: string;
      paidAt: string;
      reference: string;
      receiptUrl?: string;
      file?: File;
    }) => {
      const invoice = input.invoiceId
        ? state.invoices.find((item) => item.id === input.invoiceId)
        : undefined;
      const jobId = input.jobId ?? invoice?.jobId ?? null;
      if (!input.invoiceId && !jobId) {
        toast.error("Tie the payment to a job or an invoice.");
        return;
      }
      let receiptUrl = input.receiptUrl?.trim() ?? "";
      let receiptStoragePath: string | null = null;
      const supabase = maybeClient();
      if (input.file) {
        if (supabase) {
          const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
          receiptStoragePath = `${user.companyId}/payments/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("receipts")
            .upload(receiptStoragePath, input.file, { contentType: input.file.type, upsert: false });
          if (uploadError) {
            toast.error(uploadError.message);
            return;
          }
          receiptUrl = supabase.storage.from("receipts").getPublicUrl(receiptStoragePath).data.publicUrl;
        } else {
          receiptUrl = await fileToDataUrl(input.file);
        }
      }
      if (!receiptUrl) {
        toast.error("Photograph the check, remit, or deposit slip. Every payment keeps the image.");
        return;
      }
      const payment = fillPayment({
        id: crypto.randomUUID(),
        invoiceId: invoice?.id ?? null,
        jobId,
        amount: input.amount,
        method: input.method,
        paidAt: input.paidAt,
        reference: input.reference,
        receiptUrl,
        receiptStoragePath,
        qbStatus: "not_in_qb",
        createdBy: user.name,
      });
      if (!supabase) {
        setState((prev) => {
          let invoices = prev.invoices;
          if (invoice) {
            const nextPayments = [payment, ...prev.payments];
            const nextStatus = derivedInvoiceStatus(
              {
                ...invoice,
                status:
                  invoice.status === "void"
                    ? "void"
                    : invoice.status === "draft"
                      ? "sent"
                      : invoice.status,
              },
              prev.invoiceLines,
              nextPayments,
            );
            invoices = prev.invoices.map((item) =>
              item.id === invoice.id ? { ...item, status: nextStatus } : item,
            );
          }
          return { ...prev, payments: [payment, ...prev.payments], invoices };
        });
        toast.success("Payment recorded with the receipt.");
        return;
      }
      const payload = {
        id: payment.id,
        company_id: user.companyId,
        invoice_id: payment.invoiceId,
        job_id: payment.jobId,
        amount: payment.amount,
        method: payment.method,
        paid_at: payment.paidAt,
        reference: payment.reference,
        receipt_url: payment.receiptUrl,
        receipt_storage_path: payment.receiptStoragePath,
        qb_status: payment.qbStatus,
        created_by: payment.createdBy,
      };
      let { data, error } = await supabase.from("payments").insert(payload).select("*").single();
      const uuidRetry = withCreatedByRetry(payload, user, error);
      if (uuidRetry) {
        const retryUuid = await supabase.from("payments").insert(uuidRetry).select("*").single();
        data = retryUuid.data;
        error = retryUuid.error;
      }
      if (error && isMissingFinancials(error)) {
        if (!payment.invoiceId) {
          toast.error(missingFinancialsMessage());
          setState((prev) => ({ ...prev, payments: [payment, ...prev.payments] }));
          return;
        }
        const retry = await supabase
          .from("payments")
          .insert({
            company_id: user.companyId,
            invoice_id: payment.invoiceId,
            amount: payment.amount,
            method: payment.method,
            paid_at: payment.paidAt,
            reference: payment.reference,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingFinancialsMessage());
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not record the payment.");
        return;
      }
      const saved = { ...mapPayment(data), createdBy: user.name };
      const nextPayments = [saved, ...state.payments];
      let nextStatus = invoice?.status;
      if (invoice) {
        nextStatus = derivedInvoiceStatus(
          {
            ...invoice,
            status: invoice.status === "void" ? "void" : invoice.status === "draft" ? "sent" : invoice.status,
          },
          state.invoiceLines,
          nextPayments,
        );
        const { error: statusError } = await supabase
          .from("invoices")
          .update({ status: nextStatus })
          .eq("id", invoice.id);
        if (statusError) toast.error(statusError.message);
      }
      setState((prev) => ({
        ...prev,
        payments: [saved, ...prev.payments],
        invoices: invoice
          ? prev.invoices.map((item) =>
              item.id === invoice.id ? { ...item, status: nextStatus ?? item.status } : item,
            )
          : prev.invoices,
      }));
      if (jobId) {
        await addActivity({
          entityType: "job",
          entityId: jobId,
          type: "note",
          body: `Payment of ${input.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} recorded${invoice ? ` on ${invoice.number}` : ""}.`,
        });
      }
      toast.success("Payment recorded with the receipt.");
    },
    [addActivity, state.invoiceLines, state.invoices, state.payments, user.companyId, user.id, user.name, user.staffId]
  );

  const addExpense = useCallback(
    async (input: {
      jobId: string | null;
      vendor: string;
      account: ExpenseAccount;
      amount: number;
      incurredAt: string;
      method: ExpenseMethod;
      memo: string;
      receiptUrl?: string;
      file?: File;
      extractedByAi?: boolean;
    }) => {
      if (!input.amount || input.amount <= 0) {
        toast.error("Enter an amount.");
        return null;
      }
      if (!input.vendor.trim()) {
        toast.error("Enter the vendor.");
        return null;
      }
      if (expenseRequiresJob(input.account) && !input.jobId) {
        toast.error("Assign this expense to a job so QuickBooks costs it to Customer:Job, not company overhead.");
        return null;
      }
      let receiptUrl = input.receiptUrl?.trim() ?? "";
      let receiptStoragePath: string | null = null;
      const supabase = maybeClient();
      if (input.file) {
        if (supabase) {
          const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
          receiptStoragePath = `${user.companyId}/expenses/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("receipts")
            .upload(receiptStoragePath, input.file, { contentType: input.file.type, upsert: false });
          if (uploadError) {
            toast.error(uploadError.message);
            return null;
          }
          receiptUrl = supabase.storage.from("receipts").getPublicUrl(receiptStoragePath).data.publicUrl;
        } else {
          receiptUrl = await fileToDataUrl(input.file);
        }
      }
      if (!receiptUrl) {
        toast.error("Photograph the receipt. Every expense keeps the image.");
        return null;
      }
      const expense: Expense = {
        id: crypto.randomUUID(),
        number: nextNumber("EXP", state.expenses.map((item) => item.number)),
        jobId: input.jobId,
        vendor: input.vendor.trim(),
        account: input.account,
        amount: input.amount,
        incurredAt: input.incurredAt,
        method: input.method,
        memo: input.memo.trim(),
        receiptUrl,
        receiptStoragePath,
        qbStatus: "not_in_qb",
        extractedByAi: Boolean(input.extractedByAi),
        createdAt: new Date().toISOString(),
        createdBy: user.name,
      };
      if (!supabase) {
        setState((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }));
        if (expense.jobId) {
          await addActivity({
            entityType: "job",
            entityId: expense.jobId,
            type: "note",
            body: `${expense.number} · ${expense.vendor} · ${expense.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
          });
        }
        toast.success(`${expense.number} saved with the receipt.`);
        return expense;
      }
      const expensePayload = {
        id: expense.id,
        company_id: user.companyId,
        number: expense.number,
        job_id: expense.jobId,
        vendor: expense.vendor,
        account: expense.account,
        amount: expense.amount,
        incurred_at: expense.incurredAt,
        method: expense.method,
        memo: expense.memo,
        receipt_url: expense.receiptUrl,
        receipt_storage_path: expense.receiptStoragePath,
        qb_status: expense.qbStatus,
        extracted_by_ai: expense.extractedByAi,
        created_by: expense.createdBy,
      };
      let { data: savedRow, error: saveError } = await supabase
        .from("expenses")
        .insert(expensePayload)
        .select("*")
        .single();
      const uuidRetry = withCreatedByRetry(expensePayload, user, saveError);
      if (uuidRetry) {
        const retry = await supabase.from("expenses").insert(uuidRetry).select("*").single();
        savedRow = retry.data;
        saveError = retry.error;
      }
      if (saveError || !savedRow) {
        if (saveError && isMissingFinancials(saveError)) {
          toast.message(missingFinancialsMessage());
          setState((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }));
          return expense;
        }
        toast.error(saveError?.message ?? "Could not save the expense.");
        return null;
      }
      const saved = { ...mapExpense(savedRow), createdBy: user.name };
      setState((prev) => ({ ...prev, expenses: [saved, ...prev.expenses] }));
      if (saved.jobId) {
        await addActivity({
          entityType: "job",
          entityId: saved.jobId,
          type: "note",
          body: `${saved.number} · ${saved.vendor} · ${saved.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
        });
      }
      toast.success(`${saved.number} saved with the receipt.`);
      return saved;
    },
    [addActivity, state.expenses, user.companyId, user.id, user.name, user.staffId],
  );

  const addMaterialOrder = useCallback(
    async (input: {
      jobId: string;
      vendor?: string;
      notes?: string;
      neededBy?: string | null;
      templateId?: string | null;
    }) => {
      const template = input.templateId
        ? (state.materialOrderTemplates ?? []).find((item) => item.id === input.templateId)
        : undefined;
      const order = fillMaterialOrder({
        id: crypto.randomUUID(),
        number: nextNumber("MO", (state.materialOrders ?? []).map((item) => item.number)),
        jobId: input.jobId,
        vendor: input.vendor ?? template?.vendor ?? "",
        notes: input.notes ?? template?.notes ?? "",
        neededBy: input.neededBy ?? null,
        createdBy: user.name,
        createdAt: new Date().toISOString(),
      });
      const copiedLines = template
        ? materialOrderLinesFromTemplate(
            template.id,
            order.id,
            state.materialOrderTemplateLines ?? [],
          ).map((line) => fillMaterialOrderLine(line))
        : [];
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          materialOrders: [order, ...(prev.materialOrders ?? [])],
          materialOrderLines: [...(prev.materialOrderLines ?? []), ...copiedLines],
        }));
        return order;
      }
      const payload = {
        id: order.id,
        company_id: user.companyId,
        number: order.number,
        job_id: order.jobId,
        vendor: order.vendor,
        notes: order.notes,
        needed_by: order.neededBy,
        created_by: order.createdBy,
      };
      const { data, error } = await supabase.from("material_orders").insert(payload).select("*").single();
      if (error || !data) {
        if (error && isMissingMaterialOrders(error)) {
          toast.message(missingMaterialOrdersMessage());
          setState((prev) => ({
            ...prev,
            materialOrders: [order, ...(prev.materialOrders ?? [])],
            materialOrderLines: [...(prev.materialOrderLines ?? []), ...copiedLines],
          }));
          return order;
        }
        toast.error(error?.message ?? "Could not save the material order.");
        throw error ?? new Error("Could not save the material order.");
      }
      const saved = mapMaterialOrder(data);
      if (copiedLines.length) {
        const inserted = await supabase.from("material_order_lines").insert(
          copiedLines.map((line) => ({
            id: line.id,
            company_id: user.companyId,
            material_order_id: saved.id,
            catalog_item_id: line.catalogItemId,
            name: line.name || "Custom item",
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unitCost,
            sort_order: line.sortOrder,
          })),
        );
        if (inserted.error && !isMissingMaterialOrders(inserted.error)) {
          toast.error(inserted.error.message);
        }
      }
      setState((prev) => ({
        ...prev,
        materialOrders: [saved, ...(prev.materialOrders ?? [])],
        materialOrderLines: [...(prev.materialOrderLines ?? []), ...copiedLines],
      }));
      return saved;
    },
    [
      state.materialOrders,
      state.materialOrderTemplates,
      state.materialOrderTemplateLines,
      user.companyId,
      user.name,
    ],
  );

  const updateMaterialOrder = useCallback(async (id: string, patch: Partial<MaterialOrder>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        materialOrders: (prev.materialOrders ?? []).map((order) =>
          order.id === id ? fillMaterialOrder({ ...order, ...patch }) : order,
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return true;
    }
    const { error } = await supabase.from("material_orders").update(materialOrderPatch(patch)).eq("id", id);
    if (error) {
      if (isMissingMaterialOrders(error)) {
        toast.message(missingMaterialOrdersMessage());
        apply();
        return true;
      }
      toast.error(error.message);
      return false;
    }
    apply();
    return true;
  }, []);

  const addMaterialOrderLineFromCatalog = useCallback(
    async (orderId: string, catalogItemId: string) => {
      const item = state.catalog.find((entry) => entry.id === catalogItemId);
      if (!item) return;
      const sortOrder =
        Math.max(
          0,
          ...(state.materialOrderLines ?? [])
            .filter((line) => line.materialOrderId === orderId)
            .map((line) => line.sortOrder),
        ) + 1;
      const line = lineFromCatalogItem(orderId, item, sortOrder);
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          materialOrderLines: [...(prev.materialOrderLines ?? []), line],
        }));
        return line;
      }
      const payload = {
        id: line.id,
        company_id: user.companyId,
        material_order_id: orderId,
        catalog_item_id: item.id,
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: sortOrder,
      };
      const { data, error } = await supabase.from("material_order_lines").insert(payload).select("*").single();
      if (error || !data) {
        if (error && isMissingMaterialOrders(error)) {
          toast.message(missingMaterialOrdersMessage());
          setState((prev) => ({
            ...prev,
            materialOrderLines: [...(prev.materialOrderLines ?? []), line],
          }));
          return line;
        }
        toast.error(error?.message ?? "Could not add that catalog item.");
        return;
      }
      const saved = mapMaterialOrderLine(data);
      setState((prev) => ({
        ...prev,
        materialOrderLines: [...(prev.materialOrderLines ?? []), saved],
      }));
      return saved;
    },
    [state.catalog, state.materialOrderLines, user.companyId],
  );

  const addCustomMaterialOrderLine = useCallback(
    async (orderId: string) => {
      const sortOrder =
        Math.max(
          0,
          ...(state.materialOrderLines ?? [])
            .filter((line) => line.materialOrderId === orderId)
            .map((line) => line.sortOrder),
        ) + 1;
      const line = fillMaterialOrderLine({
        id: crypto.randomUUID(),
        materialOrderId: orderId,
        name: "",
        quantity: 1,
        unit: "EA",
        unitCost: 0,
        sortOrder,
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          materialOrderLines: [...(prev.materialOrderLines ?? []), line],
        }));
        return line;
      }
      const payload = {
        id: line.id,
        company_id: user.companyId,
        material_order_id: orderId,
        catalog_item_id: null,
        name: line.name || "Custom item",
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: sortOrder,
      };
      const { data, error } = await supabase.from("material_order_lines").insert(payload).select("*").single();
      if (error || !data) {
        if (error && isMissingMaterialOrders(error)) {
          toast.message(missingMaterialOrdersMessage());
          setState((prev) => ({
            ...prev,
            materialOrderLines: [...(prev.materialOrderLines ?? []), line],
          }));
          return line;
        }
        toast.error(error?.message ?? "Could not add a line.");
        return;
      }
      const saved = mapMaterialOrderLine(data);
      setState((prev) => ({
        ...prev,
        materialOrderLines: [...(prev.materialOrderLines ?? []), saved],
      }));
      return saved;
    },
    [state.materialOrderLines, user.companyId],
  );

  const updateMaterialOrderLine = useCallback(async (id: string, patch: Partial<MaterialOrderLine>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        materialOrderLines: (prev.materialOrderLines ?? []).map((line) =>
          line.id === id ? fillMaterialOrderLine({ ...line, ...patch }) : line,
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("material_order_lines").update(materialOrderLinePatch(patch)).eq("id", id);
    if (error) {
      if (isMissingMaterialOrders(error)) {
        toast.message(missingMaterialOrdersMessage());
        apply();
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const removeMaterialOrderLine = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        materialOrderLines: (prev.materialOrderLines ?? []).filter((line) => line.id !== id),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("material_order_lines").delete().eq("id", id);
    if (error) {
      if (isMissingMaterialOrders(error)) {
        toast.message(missingMaterialOrdersMessage());
        apply();
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const touchMaterialOrderTemplate = (id: string) => {
    const updatedAt = new Date().toISOString();
    return (prev: CrmState): CrmState => ({
      ...prev,
      materialOrderTemplates: (prev.materialOrderTemplates ?? []).map((template) =>
        template.id === id ? { ...template, updatedAt } : template,
      ),
    });
  };

  const addMaterialOrderTemplate = useCallback(
    async (input?: { name?: string }) => {
      const now = new Date().toISOString();
      const template = fillMaterialOrderTemplate({
        id: crypto.randomUUID(),
        name: input?.name?.trim() || "New template",
        createdAt: now,
        updatedAt: now,
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          materialOrderTemplates: [template, ...(prev.materialOrderTemplates ?? [])],
        }));
        return template;
      }
      const { data, error } = await supabase
        .from("material_order_templates")
        .insert({
          id: template.id,
          company_id: user.companyId,
          name: template.name,
          description: template.description,
          vendor: template.vendor,
          notes: template.notes,
        })
        .select("*")
        .single();
      if (error) {
        if (isMissingMaterialOrderTemplates(error)) {
          setState((prev) => ({
            ...prev,
            materialOrderTemplates: [template, ...(prev.materialOrderTemplates ?? [])],
          }));
          toast.message(missingMaterialOrderTemplatesMessage());
          return template;
        }
        toast.error(error.message);
        throw error;
      }
      const mapped = data ? mapMaterialOrderTemplate(data) : template;
      setState((prev) => ({
        ...prev,
        materialOrderTemplates: [mapped, ...(prev.materialOrderTemplates ?? [])],
      }));
      return mapped;
    },
    [user.companyId],
  );

  const updateMaterialOrderTemplate = useCallback(async (id: string, patch: Partial<MaterialOrderTemplate>) => {
    const updatedAt = new Date().toISOString();
    const next = { ...patch, updatedAt };
    const apply = () =>
      setState((prev) => ({
        ...prev,
        materialOrderTemplates: (prev.materialOrderTemplates ?? []).map((template) =>
          template.id === id ? fillMaterialOrderTemplate({ ...template, ...next }) : template,
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase
      .from("material_order_templates")
      .update(materialOrderTemplatePatch(next))
      .eq("id", id);
    if (error) {
      if (isMissingMaterialOrderTemplates(error)) {
        apply();
        toast.message(missingMaterialOrderTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const removeMaterialOrderTemplate = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        materialOrderTemplates: (prev.materialOrderTemplates ?? []).filter((template) => template.id !== id),
        materialOrderTemplateLines: (prev.materialOrderTemplateLines ?? []).filter(
          (line) => line.templateId !== id,
        ),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("material_order_templates").delete().eq("id", id);
    if (error) {
      if (isMissingMaterialOrderTemplates(error)) {
        apply();
        toast.message(missingMaterialOrderTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const saveMaterialOrderAsTemplate = useCallback(
    async (orderId: string, name: string) => {
      const order = (state.materialOrders ?? []).find((item) => item.id === orderId);
      if (!order) throw new Error("Material order not found.");
      const { template, lines } = templateFromMaterialOrder(order, state.materialOrderLines ?? [], {
        id: crypto.randomUUID(),
        name,
      });
      const supabase = maybeClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          materialOrderTemplates: [template, ...(prev.materialOrderTemplates ?? [])],
          materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), ...lines],
        }));
        return template;
      }
      const { data, error } = await supabase
        .from("material_order_templates")
        .insert({
          id: template.id,
          company_id: user.companyId,
          name: template.name,
          description: template.description,
          vendor: template.vendor,
          notes: template.notes,
        })
        .select("*")
        .single();
      if (error) {
        if (isMissingMaterialOrderTemplates(error)) {
          setState((prev) => ({
            ...prev,
            materialOrderTemplates: [template, ...(prev.materialOrderTemplates ?? [])],
            materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), ...lines],
          }));
          toast.message(missingMaterialOrderTemplatesMessage());
          return template;
        }
        toast.error(error.message);
        throw error;
      }
      const mapped = data ? mapMaterialOrderTemplate(data) : template;
      if (lines.length) {
        const inserted = await supabase.from("material_order_template_lines").insert(
          lines.map((line) => ({
            id: line.id,
            company_id: user.companyId,
            template_id: mapped.id,
            catalog_item_id: line.catalogItemId,
            name: line.name || "Custom item",
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unitCost,
            sort_order: line.sortOrder,
          })),
        );
        if (inserted.error && !isMissingMaterialOrderTemplates(inserted.error)) {
          toast.error(inserted.error.message);
        }
      }
      setState((prev) => ({
        ...prev,
        materialOrderTemplates: [mapped, ...(prev.materialOrderTemplates ?? [])],
        materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), ...lines],
      }));
      return mapped;
    },
    [state.materialOrderLines, state.materialOrders, user.companyId],
  );

  const addMaterialOrderTemplateLineFromCatalog = useCallback(
    async (templateId: string, catalogItemId: string) => {
      const item = state.catalog.find((entry) => entry.id === catalogItemId);
      if (!item) return;
      const sortOrder =
        Math.max(
          0,
          ...(state.materialOrderTemplateLines ?? [])
            .filter((line) => line.templateId === templateId)
            .map((line) => line.sortOrder),
        ) + 1;
      const line = templateLineFromCatalogItem(templateId, item, sortOrder);
      await persistMaterialOrderTemplateLine(line);
      return line;
    },
    [state.catalog, state.materialOrderTemplateLines, user.companyId],
  );

  const addCustomMaterialOrderTemplateLine = useCallback(
    async (templateId: string) => {
      const sortOrder =
        Math.max(
          0,
          ...(state.materialOrderTemplateLines ?? [])
            .filter((line) => line.templateId === templateId)
            .map((line) => line.sortOrder),
        ) + 1;
      const line = fillMaterialOrderTemplateLine({
        id: crypto.randomUUID(),
        templateId,
        name: "",
        quantity: 1,
        unit: "EA",
        unitCost: 0,
        sortOrder,
      });
      await persistMaterialOrderTemplateLine(line);
      return line;
    },
    [state.materialOrderTemplateLines, user.companyId],
  );

  async function persistMaterialOrderTemplateLine(line: MaterialOrderTemplateLine) {
    const supabase = maybeClient();
    if (!supabase) {
      setState((prev) => ({
        ...touchMaterialOrderTemplate(line.templateId)(prev),
        materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), line],
      }));
      return;
    }
    const { error } = await supabase.from("material_order_template_lines").insert({
      id: line.id,
      company_id: user.companyId,
      template_id: line.templateId,
      catalog_item_id: line.catalogItemId,
      name: line.name || "Custom item",
      quantity: line.quantity,
      unit: line.unit,
      unit_cost: line.unitCost,
      sort_order: line.sortOrder,
    });
    if (error) {
      if (isMissingMaterialOrderTemplates(error)) {
        setState((prev) => ({
          ...touchMaterialOrderTemplate(line.templateId)(prev),
          materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), line],
        }));
        toast.message(missingMaterialOrderTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...touchMaterialOrderTemplate(line.templateId)(prev),
      materialOrderTemplateLines: [...(prev.materialOrderTemplateLines ?? []), line],
    }));
  }

  const updateMaterialOrderTemplateLine = useCallback(
    async (id: string, patch: Partial<MaterialOrderTemplateLine>) => {
      const apply = () =>
        setState((prev) => {
          const lines = (prev.materialOrderTemplateLines ?? []).map((line) =>
            line.id === id ? fillMaterialOrderTemplateLine({ ...line, ...patch }) : line,
          );
          const templateId = lines.find((line) => line.id === id)?.templateId;
          return templateId
            ? { ...touchMaterialOrderTemplate(templateId)(prev), materialOrderTemplateLines: lines }
            : { ...prev, materialOrderTemplateLines: lines };
        });
      const supabase = maybeClient();
      if (!supabase) {
        apply();
        return;
      }
      const { error } = await supabase
        .from("material_order_template_lines")
        .update(materialOrderTemplateLinePatch(patch))
        .eq("id", id);
      if (error) {
        if (isMissingMaterialOrderTemplates(error)) {
          apply();
          toast.message(missingMaterialOrderTemplatesMessage());
          return;
        }
        toast.error(error.message);
        return;
      }
      apply();
    },
    [],
  );

  const removeMaterialOrderTemplateLine = useCallback(async (id: string) => {
    const apply = () =>
      setState((prev) => {
        const current = (prev.materialOrderTemplateLines ?? []).find((line) => line.id === id);
        const lines = (prev.materialOrderTemplateLines ?? []).filter((line) => line.id !== id);
        return current
          ? { ...touchMaterialOrderTemplate(current.templateId)(prev), materialOrderTemplateLines: lines }
          : { ...prev, materialOrderTemplateLines: lines };
      });
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return;
    }
    const { error } = await supabase.from("material_order_template_lines").delete().eq("id", id);
    if (error) {
      if (isMissingMaterialOrderTemplates(error)) {
        apply();
        toast.message(missingMaterialOrderTemplatesMessage());
        return;
      }
      toast.error(error.message);
      return;
    }
    apply();
  }, []);

  const setQbStatus = useCallback(
    async (kind: "invoice" | "payment" | "expense", id: string, status: QbSyncStatus) => {
      const supabase = maybeClient();
      if (kind === "invoice") {
        if (!supabase) {
          setState((prev) => ({
            ...prev,
            invoices: prev.invoices.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
          }));
          return true;
        }
        const { error } = await supabase.from("invoices").update({ qb_status: status }).eq("id", id);
        if (error && isMissingFinancials(error)) {
          toast.message(missingFinancialsMessage());
          setState((prev) => ({
            ...prev,
            invoices: prev.invoices.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
          }));
          return true;
        }
        if (error) {
          toast.error(error.message);
          return false;
        }
        setState((prev) => ({
          ...prev,
          invoices: prev.invoices.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
        }));
        return true;
      }
      if (kind === "payment") {
        if (!supabase) {
          setState((prev) => ({
            ...prev,
            payments: prev.payments.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
          }));
          return true;
        }
        const { error } = await supabase.from("payments").update({ qb_status: status }).eq("id", id);
        if (error && isMissingFinancials(error)) {
          toast.message(missingFinancialsMessage());
          setState((prev) => ({
            ...prev,
            payments: prev.payments.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
          }));
          return true;
        }
        if (error) {
          toast.error(error.message);
          return false;
        }
        setState((prev) => ({
          ...prev,
          payments: prev.payments.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
        }));
        return true;
      }
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          expenses: prev.expenses.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
        }));
        return true;
      }
      const { error } = await supabase.from("expenses").update({ qb_status: status }).eq("id", id);
      if (error && isMissingFinancials(error)) {
        toast.message(missingFinancialsMessage());
        setState((prev) => ({
          ...prev,
          expenses: prev.expenses.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
        }));
        return true;
      }
      if (error) {
        toast.error(error.message);
        return false;
      }
      setState((prev) => ({
        ...prev,
        expenses: prev.expenses.map((item) => (item.id === id ? { ...item, qbStatus: status } : item)),
      }));
      return true;
    },
    [],
  );

  const updateExpense = useCallback(async (id: string, patch: Partial<Expense>) => {
    const current = state.expenses.find((item) => item.id === id);
    if (current) {
      const next = { ...current, ...patch };
      if (expenseRequiresJob(next.account) && !next.jobId) {
        toast.error("Assign this expense to a job so QuickBooks costs it to Customer:Job, not company overhead.");
        return false;
      }
    }
    const apply = () =>
      setState((prev) => ({
        ...prev,
        expenses: prev.expenses.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return true;
    }
    const { error } = await supabase.from("expenses").update(expensePatch(patch)).eq("id", id);
    if (error && isMissingFinancials(error)) {
      toast.message(missingFinancialsMessage());
      apply();
      return true;
    }
    if (error) {
      toast.error(error.message);
      return false;
    }
    apply();
    return true;
  }, [state.expenses]);

  const updatePayment = useCallback(async (id: string, patch: Partial<Payment>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        payments: prev.payments.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return true;
    }
    const { error } = await supabase.from("payments").update(paymentPatch(patch)).eq("id", id);
    if (error && isMissingFinancials(error)) {
      toast.message(missingFinancialsMessage());
      apply();
      return true;
    }
    if (error) {
      toast.error(error.message);
      return false;
    }
    apply();
    return true;
  }, []);

  const updateInvoiceLine = useCallback(async (id: string, patch: Partial<InvoiceLine>) => {
    const apply = () =>
      setState((prev) => ({
        ...prev,
        invoiceLines: prev.invoiceLines.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
    const supabase = maybeClient();
    if (!supabase) {
      apply();
      return true;
    }
    const { error } = await supabase.from("invoice_lines").update(invoiceLinePatch(patch)).eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    apply();
    return true;
  }, []);

  const addQbReviewComment = useCallback(
    async (input: {
      kind: QbReviewKind;
      recordId: string;
      body: string;
      intent?: QbReviewIntent;
      mentionedStaffIds?: string[];
    }) => {
      const body = input.body.trim();
      if (!body) {
        toast.error("Write a note first.");
        return null;
      }
      const mentionedStaffIds = [...new Set((input.mentionedStaffIds ?? []).filter(Boolean))];
      const comment: QbReviewComment = {
        id: crypto.randomUUID(),
        kind: input.kind,
        recordId: input.recordId,
        body,
        intent: input.intent ?? "comment",
        authorStaffId: user.staffId,
        authorName: user.name,
        mentionedStaffIds,
        createdAt: new Date().toISOString(),
      };
      const apply = (saved: QbReviewComment) =>
        setState((prev) => ({
          ...prev,
          qbReviewComments: [...(prev.qbReviewComments ?? []), saved],
        }));
      const tagged = state.staff.filter((member) => mentionedStaffIds.includes(member.id));
      const notify = (saved: QbReviewComment) => {
        if (tagged.length === 0) return saved;
        toast.success(
          tagged.length === 1
            ? `${tagged[0].name} will see this on Home and on the file.`
            : `Tagged ${tagged.map((member) => member.name.split(" ")[0]).join(", ")}.`,
        );
        return saved;
      };
      const supabase = maybeClient();
      if (!supabase) {
        apply(comment);
        return notify(comment);
      }
      const payload = {
        id: comment.id,
        company_id: user.companyId,
        kind: comment.kind,
        record_id: comment.recordId,
        body: comment.body,
        intent: comment.intent,
        author_staff_id: comment.authorStaffId,
        author_name: comment.authorName,
        mentioned_staff_ids: comment.mentionedStaffIds,
      };
      let { data, error } = await supabase.from("qb_review_comments").insert(payload).select("*").single();
      if (error && isMissingQbReviewMentions(error)) {
        toast.message(missingQbReviewMentionsMessage());
        const retry = await supabase
          .from("qb_review_comments")
          .insert({
            id: comment.id,
            company_id: user.companyId,
            kind: comment.kind,
            record_id: comment.recordId,
            body: comment.body,
            intent: comment.intent,
            author_staff_id: comment.authorStaffId,
            author_name: comment.authorName,
          })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        if (isMissingQbReview(error)) {
          toast.message(missingQbReviewMessage());
          apply(comment);
          return notify(comment);
        }
        toast.error(error.message);
        return null;
      }
      if (!data) {
        apply(comment);
        return notify(comment);
      }
      const saved = mapQbReviewComment(data);
      const kept = { ...saved, mentionedStaffIds: saved.mentionedStaffIds.length ? saved.mentionedStaffIds : mentionedStaffIds };
      apply(kept);
      return notify(kept);
    },
    [state.staff, user.companyId, user.name, user.staffId],
  );

  const persistCalendar = useCallback(
    (accounts: CalendarAccount[], shares: CalendarShare[]) => {
      if (!isSupabaseConfigured()) {
        writeLocalCalendar({ calendarAccounts: accounts, calendarShares: shares });
      }
    },
    []
  );

  const persistTraining = useCallback(
    (progress: TrainingProgress[], bulletins: TrainingBulletin[]) => {
      if (!isSupabaseConfigured()) {
        writeLocalTraining({ trainingProgress: progress, trainingBulletins: bulletins });
      }
    },
    []
  );

  const addScheduleEvent = useCallback(
    async (input: Omit<ScheduleEvent, "id">) => {
      const supabase = requireClient();
      if (!supabase) {
        const event: ScheduleEvent = { ...input, id: crypto.randomUUID() };
        setState((prev) => ({ ...prev, events: [...prev.events, event] }));
        return event;
      }
      const { data, error } = await supabase
        .from("schedule_events")
        .insert({
          company_id: user.companyId,
          title: input.title,
          kind: input.kind,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          location: input.location,
          assignee: input.assignee,
          opportunity_id: input.opportunityId,
          job_id: input.jobId,
          client_id: input.clientId,
          notes: input.notes,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the event.");
        throw error ?? new Error("Could not add the event.");
      }
      const event = mapScheduleEvent(data);
      setState((prev) => ({ ...prev, events: [...prev.events, event] }));
      return event;
    },
    [user.companyId]
  );

  const upsertAccount = useCallback(
    async (account: CalendarAccount) => {
      setState((prev) => {
        const exists = prev.calendarAccounts.some((item) => item.staffId === account.staffId);
        const calendarAccounts = exists
          ? prev.calendarAccounts.map((item) => (item.staffId === account.staffId ? account : item))
          : [...prev.calendarAccounts, account];
        persistCalendar(calendarAccounts, prev.calendarShares);
        return { ...prev, calendarAccounts };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") return;
      const { error } = await supabase.from("calendar_accounts").upsert(
        {
          company_id: user.companyId,
          staff_id: account.staffId,
          google_email: account.googleEmail,
          google_calendar_id: account.calendarId,
          linked: account.linked,
          linked_at: account.linkedAt,
          share_with_team: account.shareWithTeam,
          source: account.source,
        },
        { onConflict: "company_id,staff_id" }
      );
      if (error) toast.error(error.message);
    },
    [persistCalendar, user.companyId]
  );

  const linkDemoCalendar = useCallback(async () => {
    const staffId = user.staffId;
    if (!staffId) return;
    const current = accountForStaff(state.calendarAccounts, staffId);
    await upsertAccount({
      ...current,
      staffId,
      googleEmail: demoGoogleEmail(user.name),
      calendarId: "primary",
      linked: true,
      linkedAt: new Date().toISOString(),
      source: "demo",
    });
    toast.success("Demo Google Calendar linked.");
  }, [state.calendarAccounts, upsertAccount, user.name, user.staffId]);

  const markCalendarLinked = useCallback(
    async (staffId: string, googleEmail: string, source: "google" | "demo") => {
      const current = accountForStaff(state.calendarAccounts, staffId);
      await upsertAccount({
        ...current,
        staffId,
        googleEmail,
        linked: true,
        linkedAt: new Date().toISOString(),
        source,
      });
    },
    [state.calendarAccounts, upsertAccount]
  );

  const disconnectCalendar = useCallback(async () => {
    const staffId = user.staffId;
    if (!staffId) return;
    try {
      await fetch("/api/google/calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
    } catch {
      // Local demo still unlinks below.
    }
    const current = accountForStaff(state.calendarAccounts, staffId);
    await upsertAccount({
      ...current,
      googleEmail: "",
      linked: false,
      linkedAt: null,
      source: "demo",
    });
    toast.message("Google Calendar disconnected.");
  }, [state.calendarAccounts, upsertAccount, user.staffId]);

  const setShareWithTeam = useCallback(
    async (shareWithTeam: boolean) => {
      const staffId = user.staffId;
      if (!staffId) return;
      const current = accountForStaff(state.calendarAccounts, staffId);
      await upsertAccount({ ...current, staffId, shareWithTeam });
    },
    [state.calendarAccounts, upsertAccount, user.staffId]
  );

  const setCalendarShare = useCallback(
    async (viewerStaffId: string, shared: boolean) => {
      const ownerStaffId = user.staffId;
      if (!ownerStaffId || viewerStaffId === ownerStaffId) return;
      let nextShares: CalendarShare[] = [];
      setState((prev) => {
        const filtered = prev.calendarShares.filter(
          (share) => !(share.ownerStaffId === ownerStaffId && share.viewerStaffId === viewerStaffId)
        );
        nextShares = shared
          ? [...filtered, { ownerStaffId, viewerStaffId }]
          : filtered;
        persistCalendar(prev.calendarAccounts, nextShares);
        return { ...prev, calendarShares: nextShares };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") return;
      if (shared) {
        const { error } = await supabase.from("calendar_shares").insert({
          company_id: user.companyId,
          owner_staff_id: ownerStaffId,
          viewer_staff_id: viewerStaffId,
        });
        if (error && !error.message.toLowerCase().includes("duplicate")) toast.error(error.message);
      } else {
        const { error } = await supabase
          .from("calendar_shares")
          .delete()
          .eq("owner_staff_id", ownerStaffId)
          .eq("viewer_staff_id", viewerStaffId);
        if (error) toast.error(error.message);
      }
    },
    [persistCalendar, user.companyId, user.staffId]
  );

  const progressFor = useCallback(
    (staffId: string) => staffProgress(state.trainingProgress, staffId),
    [state.trainingProgress],
  );

  const upsertProgress = useCallback(
    async (next: TrainingProgress) => {
      setState((prev) => {
        const exists = prev.trainingProgress.some((item) => item.staffId === next.staffId);
        const trainingProgress = exists
          ? prev.trainingProgress.map((item) => (item.staffId === next.staffId ? next : item))
          : [...prev.trainingProgress, next];
        persistTraining(trainingProgress, prev.trainingBulletins);
        return { ...prev, trainingProgress };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") return;
      const { error } = await supabase.from("training_progress").upsert(
        {
          company_id: user.companyId,
          staff_id: next.staffId,
          read: next.read as Json,
          badges: next.badges as Json,
          attempts: next.attempts as unknown as Json,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,staff_id" },
      );
      if (error) {
        const missing =
          error.message.includes("schema cache") ||
          error.code === "PGRST205" ||
          error.message.includes("Could not find the table");
        toast.error(
          missing
            ? "Run supabase/migrations/20260819240000_training.sql in the SQL editor, then try again."
            : error.message,
        );
      }
    },
    [persistTraining, user.companyId],
  );

  const markLessonRead = useCallback(
    async (chapterId: string, index: number) => {
      const staffId = user.staffId;
      if (!staffId) return;
      const key = lessonKey(chapterId, index);
      const current = staffProgress(state.trainingProgress, staffId);
      if (current.read[key]) return;
      await upsertProgress({
        ...current,
        read: { ...current.read, [key]: new Date().toISOString() },
      });
    },
    [state.trainingProgress, upsertProgress, user.staffId],
  );

  const submitQuiz = useCallback(
    async (input: {
      kind: QuizKind;
      chapterId: string | null;
      score: number;
      correct: number;
      total: number;
    }) => {
      const staffId = user.staffId;
      if (!staffId) {
        throw new Error("No seat is selected.");
      }
      const next = recordAttempt(staffProgress(state.trainingProgress, staffId), {
        kind: input.kind,
        chapterId: input.chapterId,
        score: input.score,
        correct: input.correct,
        total: input.total,
        createdAt: new Date().toISOString(),
      });
      await upsertProgress(next);
      return next;
    },
    [state.trainingProgress, upsertProgress, user.staffId],
  );

  const addTrainingBulletin = useCallback(
    async (title: string, body: string) => {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      if (!trimmedTitle || !trimmedBody) {
        toast.error("A title and note are required.");
        return;
      }
      const bulletin: TrainingBulletin = {
        id: crypto.randomUUID(),
        title: trimmedTitle,
        body: trimmedBody,
        author: user.name,
        createdAt: new Date().toISOString(),
      };
      setState((prev) => {
        const trainingBulletins = [bulletin, ...prev.trainingBulletins];
        persistTraining(prev.trainingProgress, trainingBulletins);
        return { ...prev, trainingBulletins };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") {
        toast.success("Training bulletin posted.");
        return;
      }
      const { data, error } = await supabase
        .from("training_bulletins")
        .insert({
          id: bulletin.id,
          company_id: user.companyId,
          title: bulletin.title,
          body: bulletin.body,
          author: bulletin.author,
          created_at: bulletin.createdAt,
        })
        .select("*")
        .single();
      if (error || !data) {
        const missing =
          error?.message.includes("schema cache") ||
          error?.code === "PGRST205" ||
          error?.message.includes("Could not find the table");
        toast.error(
          missing
            ? "Run supabase/migrations/20260819240000_training.sql in the SQL editor, then try again."
            : error?.message ?? "Could not post the bulletin.",
        );
        return;
      }
      setState((prev) => ({
        ...prev,
        trainingBulletins: prev.trainingBulletins.map((item) =>
          item.id === bulletin.id ? mapTrainingBulletin(data) : item,
        ),
      }));
      toast.success("Training bulletin posted.");
    },
    [persistTraining, user.companyId, user.name],
  );

  const addJobPhoto = useCallback(
    async (input: {
      jobId: string;
      caption: string;
      category: PhotoCategory;
      takenAt: string;
      imageUrl?: string;
      file?: File;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      let imageUrl = input.imageUrl?.trim() ?? "";
      let storagePath: string | null = null;
      if (input.file) {
        const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
        storagePath = `${user.companyId}/${input.jobId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
        if (uploadError) {
          toast.error(uploadError.message);
          return;
        }
        imageUrl = supabase.storage.from("job-photos").getPublicUrl(storagePath).data.publicUrl;
      }
      if (!imageUrl) {
        toast.error("Add a photo file or an image URL.");
        return;
      }
      let takenAt = input.takenAt;
      if (/^\d{4}-\d{2}-\d{2}$/.test(takenAt)) {
        takenAt =
          takenAt === localYmd(new Date()) ? new Date().toISOString() : `${takenAt}T12:00:00`;
      }
      const photographer = (effectiveStaff?.name || user.name).trim();
      const payload = {
        company_id: user.companyId,
        job_id: input.jobId,
        caption: input.caption,
        category: input.category,
        taken_at: takenAt,
        image_url: imageUrl,
        storage_path: storagePath,
        created_by: photographer,
      };
      let { data, error } = await supabase.from("job_photos").insert(payload).select("*").single();
      if (error && isMissingPhotoCreatedBy(error)) {
        const { created_by: _createdBy, ...without } = payload;
        const retry = await supabase.from("job_photos").insert(without).select("*").single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingPhotoCreatedByMessage());
      }
      if (error || !data) {
        toast.error(error?.message ?? "Could not save the photo.");
        return;
      }
      const mapped = mapJobPhoto(data);
      setState((prev) => ({
        ...prev,
        photos: [{ ...mapped, createdBy: mapped.createdBy?.trim() || photographer }, ...prev.photos],
      }));
    },
    [effectiveStaff?.name, user.companyId, user.name]
  );

  const addJobFiles = useCallback(
    async (jobId: string, files: File[]) => {
      const supabase = requireClient();
      if (!supabase) throw new Error("Connect a Supabase project to save.");
      if (!user.companyId || user.companyId === "local") {
        toast.error("Connect a Supabase project to attach files.");
        return [];
      }
      const client = supabase;
      const author = (effectiveStaff?.name || user.name).trim();
      const saved: JobFile[] = [];
      const job = state.jobs.find((item) => item.id === jobId);
      let fields = job?.customFields ?? [];

      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`${file.name} is over 25 MB.`);
          continue;
        }
        const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
        const ext = rawExt && rawExt.length <= 8 && /^[a-z0-9]+$/.test(rawExt) ? rawExt : "bin";
        const fileId = crypto.randomUUID();
        const storagePath = `${user.companyId}/${jobId}/${fileId}.${ext}`;
        const contentType = file.type || "application/octet-stream";

        async function tryUpload(bucket: string, path: string) {
          const { error } = await client.storage.from(bucket).upload(path, file, {
            contentType,
            upsert: false,
          });
          if (error) return { ok: false as const, error };
          return {
            ok: true as const,
            bucket,
            storagePath: path,
            url: client.storage.from(bucket).getPublicUrl(path).data.publicUrl,
          };
        }

        let uploaded: { bucket: string; storagePath: string; url: string } | null = null;
        let lastError: { message?: string; code?: string } | null = null;

        const primary = await tryUpload("job-files", storagePath);
        if (primary.ok) {
          uploaded = primary;
        } else {
          lastError = primary.error;
          if (isMissingStorageBucket(primary.error)) {
            await client.storage.createBucket("job-files", {
              public: true,
              fileSizeLimit: 25 * 1024 * 1024,
            });
            const retry = await tryUpload("job-files", storagePath);
            if (retry.ok) uploaded = retry;
            else lastError = retry.error;
          }
        }

        const fallbackPath = `${user.companyId}/job-files/${jobId}/${fileId}.${ext}`;
        if (!uploaded && file.size <= 10 * 1024 * 1024) {
          if (isPdfFile(file) || isImageFile(file)) {
            const receipts = await tryUpload("receipts", fallbackPath);
            if (receipts.ok) uploaded = receipts;
            else lastError = receipts.error;
          }
          if (!uploaded && isImageFile(file)) {
            const photos = await tryUpload("job-photos", storagePath);
            if (photos.ok) uploaded = photos;
            else lastError = photos.error;
          }
          if (!uploaded) {
            const anyReceipts = await tryUpload("receipts", fallbackPath);
            if (anyReceipts.ok) uploaded = anyReceipts;
            else lastError = anyReceipts.error;
          }
        }

        if (!uploaded && file.size <= 1_000_000) {
          try {
            uploaded = { bucket: "inline", storagePath: "", url: await readFileDataUrl(file) };
          } catch {
            /* keep lastError */
          }
        }

        if (!uploaded) {
          toast.error(lastError?.message ?? `Could not attach ${file.name}.`);
          continue;
        }

        const record: JobFile = {
          id: fileId,
          jobId,
          name: file.name.replace(/^.*[/\\]/, "").trim() || "Untitled",
          mimeType: file.type || "",
          sizeBytes: file.size,
          url: uploaded.url,
          storagePath: uploaded.storagePath,
          createdBy: author,
          createdAt: new Date().toISOString(),
          bucket: uploaded.bucket,
        };

        const payload = {
          id: record.id,
          company_id: user.companyId,
          job_id: record.jobId,
          name: record.name,
          mime_type: record.mimeType,
          size_bytes: record.sizeBytes,
          storage_path: record.storagePath,
          url: record.url,
          created_by: record.createdBy,
        };
        const { data, error } = await supabase.from("job_files").insert(payload).select("*").single();
        if (data && !error) {
          saved.push({ ...mapJobFile(data), bucket: uploaded.bucket });
          continue;
        }

        fields = withJobFileField(fields, record);
        if (job) {
          await updateJob(jobId, { customFields: fields });
        }
        saved.push(record);
      }
      if (saved.length > 0) {
        setState((prev) => ({ ...prev, jobFiles: [...saved, ...(prev.jobFiles ?? [])] }));
      }
      return saved;
    },
    [effectiveStaff?.name, state.jobs, updateJob, user.companyId, user.name],
  );

  const deleteJobFile = useCallback(
    async (id: string) => {
      const current = state.jobFiles.find((file) => file.id === id);
      if (!current) return false;
      const supabase = maybeClient();
      if (supabase) {
        if (current.storagePath && current.bucket !== "inline") {
          const buckets = current.bucket
            ? [current.bucket]
            : ["job-files", "receipts", "job-photos"];
          for (const bucket of buckets) {
            const { error: removeError } = await supabase.storage.from(bucket).remove([current.storagePath]);
            if (!removeError || isMissingStorageBucket(removeError) || isMissingJobFiles(removeError)) {
              break;
            }
          }
        }
        const { error } = await supabase.from("job_files").delete().eq("id", id);
        if (error && !isMissingJobFiles(error)) {
          toast.error(error.message);
          return false;
        }
      }
      const job = state.jobs.find((item) => item.id === current.jobId);
      if (job?.customFields.some((field) => field.id === id)) {
        await updateJob(job.id, { customFields: withoutJobFileId(job.customFields, id) });
      }
      setState((prev) => ({
        ...prev,
        jobFiles: prev.jobFiles.filter((file) => file.id !== id),
      }));
      return true;
    },
    [state.jobFiles, state.jobs, updateJob],
  );

  const addPhotoReport = useCallback(
    async (report: PhotoReport) => {
      const next: PhotoReport = {
        ...report,
        template: parsePageTemplate(report.template),
        shareToken: report.shareToken || newShareToken(),
        updatedAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, photoReports: [next, ...prev.photoReports] }));
      const supabase = maybeClient();
      if (!supabase || !user.companyId || user.companyId === "local") return next;
      const payload = {
        id: next.id,
        company_id: user.companyId,
        job_id: next.jobId,
        title: next.title,
        pages: next.pages as unknown as Json,
        template: next.template,
        share_token: next.shareToken,
        created_by: next.createdBy,
        created_at: next.createdAt,
        updated_at: next.updatedAt,
      };
      let { data, error } = await supabase.from("photo_reports").insert(payload).select("*").single();
      if (error && isMissingPageShare(error)) {
        const { template: _template, share_token: _share, ...legacy } = payload;
        const retry = await supabase.from("photo_reports").insert(legacy).select("*").single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.error(missingPageShareMessage());
      }
      if (error || !data) {
        toast.error(
          isMissingPageShare(error)
            ? missingPageShareMessage()
            : isMissingPhotoReports(error)
              ? missingPhotoReportsMessage()
              : error?.message ?? "Could not save the page.",
        );
        return next;
      }
      const saved = mapPhotoReport(data);
      const merged: PhotoReport = {
        ...saved,
        shareToken: saved.shareToken || next.shareToken,
        template: "template" in data && data.template ? parsePageTemplate(data.template) : next.template,
      };
      setState((prev) => ({
        ...prev,
        photoReports: prev.photoReports.map((item) => (item.id === next.id ? merged : item)),
      }));
      return merged;
    },
    [user.companyId],
  );

  const updatePhotoReport = useCallback(
    async (id: string, patch: Partial<Omit<PhotoReport, "id" | "jobId" | "createdAt">>) => {
      const updatedAt = patch.updatedAt || new Date().toISOString();
      let next: PhotoReport | undefined;
      setState((prev) => {
        next = prev.photoReports.find((item) => item.id === id);
        if (!next) return prev;
        next = { ...next, ...patch, updatedAt };
        return {
          ...prev,
          photoReports: prev.photoReports.map((item) => (item.id === id ? next! : item)),
        };
      });
      if (!next) return false;
      const supabase = maybeClient();
      if (!supabase || !user.companyId || user.companyId === "local") return true;
      const payload = {
        title: next.title,
        pages: next.pages as unknown as Json,
        template: next.template,
        share_token: next.shareToken,
        updated_at: next.updatedAt,
        created_by: next.createdBy,
      };
      let { error } = await supabase.from("photo_reports").update(payload).eq("id", id);
      if (error && isMissingPageShare(error)) {
        const { template: _template, share_token: _share, ...legacy } = payload;
        const retry = await supabase.from("photo_reports").update(legacy).eq("id", id);
        error = retry.error;
        if (!error) toast.error(missingPageShareMessage());
      }
      if (error) {
        toast.error(
          isMissingPageShare(error)
            ? missingPageShareMessage()
            : isMissingPhotoReports(error)
              ? missingPhotoReportsMessage()
              : error.message || "Could not save the page.",
        );
        return false;
      }
      return true;
    },
    [user.companyId],
  );

  const deletePhotoReport = useCallback(
    async (id: string) => {
      setState((prev) => ({
        ...prev,
        photoReports: prev.photoReports.filter((item) => item.id !== id),
      }));
      const supabase = maybeClient();
      if (!supabase || !user.companyId || user.companyId === "local") return true;
      const { error } = await supabase.from("photo_reports").delete().eq("id", id);
      if (error && !isMissingPhotoReports(error)) {
        toast.error(error.message || "Could not delete the page.");
        return false;
      }
      return true;
    },
    [user.companyId],
  );

  const ensurePageShareToken = useCallback(
    async (id: string) => {
      const current = state.photoReports.find((report) => report.id === id);
      if (!current) throw new Error("Page not found.");
      if (current.shareToken) return current.shareToken;
      const shareToken = newShareToken();
      await updatePhotoReport(id, { shareToken });
      return shareToken;
    },
    [state.photoReports, updatePhotoReport],
  );

  const canEditCompany = Boolean(viewer && canManageSettings(viewer.role, viewer));

  const persistCompany = useCallback(
    async (next: CompanySettings, quiet = false) => {
      const name = next.name.trim();
      if (!name) {
        toast.error("Company name is required.");
        return null;
      }
      if (!canEditCompany) {
        toast.error("Only a company admin can change business settings.");
        return null;
      }
      const settings: CompanySettings = {
        name,
        phone: next.phone.trim(),
        email: next.email.trim(),
        website: next.website.trim(),
        street: next.street.trim(),
        city: next.city.trim(),
        state: next.state.trim(),
        postalCode: next.postalCode.trim(),
        licenseNumber: next.licenseNumber.trim(),
        logoUrl: next.logoUrl?.trim() ?? "",
        logoStoragePath: next.logoStoragePath?.trim() ?? "",
        defaultEstimateTerms: next.defaultEstimateTerms ?? null,
        defaultInvoiceTerms: next.defaultInvoiceTerms ?? null,
      };
      if (!isSupabaseConfigured() || !user.companyId || user.companyId === "local") {
        setCompanySettings(settings);
        setUser((current) => ({ ...current, company: settings.name }));
        writeLocalCompany(settings);
        if (!quiet) toast.success("Business settings saved.");
        return settings;
      }
      const supabase = createClient();
      const payload = {
        name: settings.name,
        phone: settings.phone,
        email: settings.email,
        website: settings.website,
        street: settings.street,
        city: settings.city,
        state: settings.state,
        postal_code: settings.postalCode,
        license_number: settings.licenseNumber,
        logo_url: settings.logoUrl,
        logo_storage_path: settings.logoStoragePath,
        default_estimate_terms: settings.defaultEstimateTerms,
        default_invoice_terms: settings.defaultInvoiceTerms,
        updated_at: new Date().toISOString(),
      };
      let { data, error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", user.companyId)
        .select("*")
        .single();
      let attempted: Record<string, unknown> = payload;
      if (error && isMissingLogoColumn(error)) {
        const { logo_url: _logoUrl, logo_storage_path: _logoPath, ...rest } = attempted;
        attempted = rest;
        const retry = await supabase
          .from("companies")
          .update(rest as typeof payload)
          .eq("id", user.companyId)
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingLogoMessage());
      }
      if (error && isMissingCompanyDocumentTermsColumns(error)) {
        const { default_estimate_terms: _estimateTerms, default_invoice_terms: _invoiceTerms, ...rest } = attempted;
        const retry = await supabase
          .from("companies")
          .update(rest as typeof payload)
          .eq("id", user.companyId)
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
        if (!error) toast.message(missingDocumentTermsMessage());
      }
      if (error || !data) {
        const missingColumn =
          error?.message?.includes("schema cache") ||
          error?.code === "PGRST204" ||
          error?.message?.includes("Could not find the");
        toast.error(
          missingColumn
            ? "Run supabase/bootstrap.sql (or 20260825130000_document_terms.sql) in the SQL editor, then try again."
            : error?.message ?? "Could not save business settings."
        );
        return null;
      }
      const mapped = mapCompany(data);
      const saved = {
        ...mapped,
        logoUrl: settings.logoUrl,
        logoStoragePath: settings.logoStoragePath,
        defaultEstimateTerms: mapped.defaultEstimateTerms ?? settings.defaultEstimateTerms,
        defaultInvoiceTerms: mapped.defaultInvoiceTerms ?? settings.defaultInvoiceTerms,
      };
      setCompanySettings(saved);
      setUser((current) => ({ ...current, company: saved.name }));
      if (!quiet) toast.success("Business settings saved.");
      return saved;
    },
    [canEditCompany, user.companyId]
  );

  const updateCompany = useCallback(
    async (next: CompanySettings) => Boolean(await persistCompany(next)),
    [persistCompany]
  );

  const uploadCompanyLogo = useCallback(
    async (file: File) => {
      const invalid = validateLogoFile(file);
      if (invalid) {
        toast.error(invalid);
        return null;
      }
      if (!canEditCompany) {
        toast.error("Only a company admin can change business settings.");
        return null;
      }
      const previousPath = companySettings.logoStoragePath?.trim() ?? "";
      let logoUrl = "";
      let logoStoragePath = "";
      const supabase = maybeClient();
      if (supabase && user.companyId && user.companyId !== "local") {
        const path = `${user.companyId}/logo/${crypto.randomUUID()}.${logoExtension(file)}`;
        const { error } = await supabase.storage
          .from(COMPANY_ASSETS_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          const missingBucket =
            /bucket/i.test(error.message) || /not found/i.test(error.message) || error.message.includes("404");
          toast.error(missingBucket ? missingLogoMessage() : error.message);
          return null;
        }
        logoUrl = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
        logoStoragePath = path;
        if (previousPath && previousPath !== path) {
          void supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([previousPath]);
        }
      } else {
        logoUrl = await fileToDataUrl(file);
      }
      const saved = await persistCompany(
        { ...companySettings, logoUrl, logoStoragePath },
        true,
      );
      if (saved) toast.success("Logo added to estimates, invoices, and reports.");
      return saved;
    },
    [canEditCompany, companySettings, persistCompany, user.companyId]
  );

  const removeCompanyLogo = useCallback(async () => {
    if (!canEditCompany) {
      toast.error("Only a company admin can change business settings.");
      return false;
    }
    const previousPath = companySettings.logoStoragePath?.trim() ?? "";
    const supabase = maybeClient();
    if (previousPath && supabase) {
      void supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([previousPath]);
    }
    const saved = await persistCompany({ ...companySettings, logoUrl: "", logoStoragePath: "" }, true);
    if (saved) toast.success("Logo removed.");
    return Boolean(saved);
  }, [canEditCompany, companySettings, persistCompany]);

  const persistStaffFields = useCallback(
    async (
      member: StaffMember,
      extras?: { inviteToken?: string | null; inviteExpiresAt?: string | null },
    ) => {
      if (!isSupabaseConfigured() || !user.companyId || user.companyId === "local") return true;
      const supabase = createClient();
      const inviteToken = extras?.inviteToken ?? member.inviteToken;
      const inviteExpiresAt = extras?.inviteExpiresAt ?? member.inviteExpiresAt;
      const payload = {
        id: member.id,
        company_id: user.companyId,
        name: member.name,
        title: member.title,
        role: member.role,
        team_id: member.teamId,
        initials: member.initials || initialsFromName(member.name),
        email: member.email,
        phone: member.phone,
        locked: member.locked,
        restricted: member.restricted,
        invite_expires_at: inviteExpiresAt,
      };
      let { error } = await supabase.from("team_members").upsert(payload);
      if (error && isMissingStaffPhoneColumn(error)) {
        const { phone: _phone, ...withoutPhone } = payload;
        const retry = await supabase.from("team_members").upsert(withoutPhone);
        error = retry.error;
        if (!retry.error) toast.message(missingStaffPhoneMessage());
      }
      if (error) {
        toast.error("Could not save teammate", {
          description: isDuplicateStaffEmail(error)
            ? "That email already belongs to someone on this company."
            : isMissingAccountManagement(error)
              ? missingAccountManagementMessage()
              : error.message,
        });
        return false;
      }
      if (inviteToken && member.email) {
        const { error: inviteError } = await supabase.from("account_invites").upsert(
          {
            token: inviteToken,
            company_id: user.companyId,
            staff_id: member.id,
            email: member.email,
            expires_at: inviteExpiresAt ?? inviteExpiry(),
            created_by: user.id || null,
          },
          { onConflict: "staff_id" },
        );
        if (inviteError) {
          toast.error("Teammate saved, invite link did not", {
            description: isMissingAccountManagement(inviteError)
              ? missingAccountManagementMessage()
              : inviteError.message,
          });
          return false;
        }
      } else {
        const { error: clearInvite } = await supabase.from("account_invites").delete().eq("staff_id", member.id);
        if (clearInvite && !isMissingAccountManagement(clearInvite)) {
          toast.error("Could not clear the old invite", { description: clearInvite.message });
        }
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ role: member.role, full_name: member.name, title: member.title })
        .eq("staff_id", member.id);
      if (profileError && !isMissingAccountManagement(profileError) && profileError.code !== "PGRST116") {
        toast.error("Seat saved, login role did not update", { description: profileError.message });
      }
      return true;
    },
    [user.companyId, user.id],
  );

  const inviteStaff = useCallback(
    async (input: { name: string; email: string; role: SeatRole; title?: string; phone?: string }) => {
      if (!canEditCompany) {
        toast.error("Only a company admin can add people.");
        return null;
      }
      const name = input.name.trim();
      const email = normalizeSeatEmail(input.email);
      if (!name) {
        toast.error("Name is required.");
        return null;
      }
      if (email && state.staff.some((member) => normalizeSeatEmail(member.email) === email)) {
        toast.error("That email already belongs to someone on this company.");
        return null;
      }
      const token = email ? newInviteToken() : null;
      const expires = email ? inviteExpiry() : null;
      const member: StaffMember = {
        id: crypto.randomUUID(),
        name,
        title: input.title?.trim() || defaultTitleForRole(input.role),
        role: input.role,
        teamId: null,
        initials: initialsFromName(name),
        email,
        phone: input.phone?.trim() ?? "",
        locked: false,
        restricted: false,
        inviteToken: token,
        inviteExpiresAt: expires,
      };
      const ok = await persistStaffFields(member, { inviteToken: token, inviteExpiresAt: expires });
      if (!ok) return null;
      setState((current) => ({ ...current, staff: [...current.staff, member] }));
      const inviteUrl = token ? inviteSignupUrl(window.location.origin, token) : null;
      toast.success(email ? `Invite ready for ${name}` : `${name} added to the roster`);
      return { member, inviteUrl };
    },
    [canEditCompany, persistStaffFields, state.staff],
  );

  const updateStaffAccount = useCallback(
    async (
      id: string,
      patch: Partial<Pick<StaffMember, "name" | "title" | "role" | "email" | "phone" | "locked" | "restricted">>,
    ) => {
      const profileKeys = new Set(["name", "title", "phone"]);
      const onlyOwnProfile = Object.keys(patch).every((key) => profileKeys.has(key));
      const editingSelf = id === viewer?.id;
      if (!canEditCompany && !(editingSelf && onlyOwnProfile)) {
        toast.error(
          editingSelf
            ? "Only a company admin can change login, role, or email."
            : "Only a company admin can change other accounts.",
        );
        return false;
      }
      const current = state.staff.find((member) => member.id === id);
      if (!current) return false;
      const next: StaffMember = {
        ...current,
        ...patch,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        title: patch.title !== undefined ? patch.title.trim() : current.title,
        email: patch.email !== undefined ? normalizeSeatEmail(patch.email) : current.email,
        phone: patch.phone !== undefined ? patch.phone.trim() : current.phone,
        initials:
          patch.name !== undefined ? initialsFromName(patch.name.trim() || current.name) : current.initials,
      };
      if (!next.name) {
        toast.error("Name is required.");
        return false;
      }
      if (wouldLeaveNoAdmin(state.staff, id, next)) {
        toast.error("Keep at least one unlocked company admin.");
        return false;
      }
      if (id === viewer?.id && (next.locked || Boolean(patch.restricted && next.restricted))) {
        toast.error("You cannot lock or restrict your own seat.");
        return false;
      }
      if (
        next.email &&
        state.staff.some((member) => member.id !== id && normalizeSeatEmail(member.email) === next.email)
      ) {
        toast.error("That email already belongs to someone on this company.");
        return false;
      }
      if (!next.email) {
        next.inviteToken = null;
        next.inviteExpiresAt = null;
      }
      const ok = await persistStaffFields(next);
      if (!ok) return false;
      setState((currentBook) => ({
        ...currentBook,
        staff: currentBook.staff.map((member) => (member.id === id ? next : member)),
      }));
      if (id === user.staffId) {
        setUser((currentUser) => ({
          ...currentUser,
          name: next.name,
          title: next.title,
          role: next.role,
        }));
      }
      toast.success(`${next.name} updated`);
      return true;
    },
    [canEditCompany, persistStaffFields, state.staff, user.staffId, viewer?.id],
  );

  const refreshStaffInvite = useCallback(
    async (id: string) => {
      if (!canEditCompany) {
        toast.error("Only a company admin can send invites.");
        return null;
      }
      const current = state.staff.find((member) => member.id === id);
      if (!current) return null;
      if (!current.email) {
        toast.error("Add an email before sending an invite.");
        return null;
      }
      if (current.locked) {
        toast.error("Unlock this account before sending an invite.");
        return null;
      }
      const token = newInviteToken();
      const expires = inviteExpiry();
      const next: StaffMember = { ...current, inviteToken: token, inviteExpiresAt: expires };
      const ok = await persistStaffFields(next, { inviteToken: token, inviteExpiresAt: expires });
      if (!ok) return null;
      setState((currentBook) => ({
        ...currentBook,
        staff: currentBook.staff.map((member) => (member.id === id ? next : member)),
      }));
      toast.success(`Invite refreshed for ${current.name}`);
      return inviteSignupUrl(window.location.origin, token);
    },
    [canEditCompany, persistStaffFields, state.staff],
  );

  const removeStaff = useCallback(
    async (id: string) => {
      if (!canEditCompany) {
        toast.error("Only a company admin can remove people.");
        return false;
      }
      const current = state.staff.find((member) => member.id === id);
      if (!current) return false;
      if (id === viewer?.id || id === user.staffId) {
        toast.error("You cannot remove your own seat.");
        return false;
      }
      if (wouldLeaveNoAdmin(state.staff, id, { role: "project_manager", locked: true, restricted: true })) {
        toast.error("Keep at least one unlocked company admin.");
        return false;
      }
      const fallbackId = viewer?.id || user.staffId;
      const applyLocalRemove = () => {
        setState((currentBook) => ({
          ...currentBook,
          staff: currentBook.staff.filter((member) => member.id !== id),
          contacts: currentBook.contacts.map((contact) =>
            contact.ownerStaffId === id ? { ...contact, ownerStaffId: fallbackId } : contact,
          ),
          opportunities: currentBook.opportunities.map((opportunity) => ({
            ...opportunity,
            ownerStaffId: opportunity.ownerStaffId === id ? fallbackId : opportunity.ownerStaffId,
            originatorStaffId:
              opportunity.originatorStaffId === id ? fallbackId : opportunity.originatorStaffId,
          })),
          jobs: currentBook.jobs.map((job) =>
            job.ownerStaffId === id ? { ...job, ownerStaffId: fallbackId } : job,
          ),
          teams: currentBook.teams.map((team) =>
            team.leadStaffId === id ? { ...team, leadStaffId: fallbackId } : team,
          ),
        }));
      };
      if (!isSupabaseConfigured() || !user.companyId || user.companyId === "local") {
        applyLocalRemove();
        toast.success(`${current.name} removed`);
        return true;
      }
      const supabase = createClient();
      const reassign = async (table: "contacts" | "opportunities" | "jobs" | "teams", column: string) => {
        const { error } = await supabase
          .from(table)
          .update({ [column]: fallbackId } as never)
          .eq("company_id", user.companyId)
          .eq(column, id);
        if (error && !isMissingAccountManagement(error) && error.code !== "PGRST204") {
          toast.error(`Could not reassign ${table}`, { description: error.message });
        }
      };
      await reassign("contacts", "owner_staff_id");
      await reassign("opportunities", "owner_staff_id");
      await reassign("opportunities", "originator_staff_id");
      await reassign("jobs", "owner_staff_id");
      await reassign("teams", "lead_staff_id");
      await supabase.from("account_invites").delete().eq("staff_id", id);
      const { error: profileError } = await supabase.from("profiles").delete().eq("staff_id", id);
      if (profileError && !isMissingAccountManagement(profileError)) {
        const locked: StaffMember = { ...current, locked: true };
        const ok = await persistStaffFields(locked);
        if (ok) {
          setState((currentBook) => ({
            ...currentBook,
            staff: currentBook.staff.map((member) => (member.id === id ? locked : member)),
          }));
        }
        toast.error("Could not remove their login, so the seat was locked instead", {
          description: profileError.message,
        });
        return false;
      }
      const { error } = await supabase.from("team_members").delete().eq("id", id);
      if (error) {
        toast.error("Could not remove teammate", { description: error.message });
        return false;
      }
      applyLocalRemove();
      toast.success(`${current.name} removed`);
      return true;
    },
    [canEditCompany, persistStaffFields, state.staff, user.companyId, user.staffId, viewer?.id],
  );

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo<CrmContextValue>(
    () => ({
      ...scoped,
      user: displayUser,
      viewer,
      effectiveStaff,
      impersonatedStaff,
      loginAsOptions,
      scopeLabel: viewer
        ? scopeDescription(effectiveStaff ?? viewer, viewer, Boolean(impersonatedStaff), state.teams)
        : "",
      teamMembers,
      book: state,
      configured,
      hydrated,
      hydrateError,
      switchSeat,
      loginAs,
      stopLoginAs,
      getClient,
      getContact,
      customerName,
      getOpportunity,
      getJob,
      getEstimate,
      getEstimateTemplate,
      getInvoice,
      getMaterialOrder,
      getMaterialOrderTemplate,
      jobForOpportunity,
      company: companySettings,
      canEditCompany,
      updateCompany,
      uploadCompanyLogo,
      removeCompanyLogo,
      inviteStaff,
      updateStaffAccount,
      refreshStaffInvite,
      removeStaff,
      moveOpportunity,
      moveWork,
      updateOpportunity,
      assignOpportunityOwner,
      updateJob,
      deleteJob,
      restoreJob,
      addOpportunity,
      addClient,
      addContact,
      updateContact,
      addJob,
      addActivity,
      sendTextMessage,
      logOutboundText,
      toggleTask,
      addTask,
      addEstimate,
      updateEstimate,
      sendEstimate,
      acceptEstimate,
      declineEstimate,
      reopenEstimate,
      markEstimateViewed,
      ensureEstimateShareToken,
      addEstimateLineFromCatalog,
      addCustomEstimateLine,
      updateEstimateLine,
      removeEstimateLine,
      reorderEstimateLine,
      duplicateEstimate,
      addEstimateTemplate,
      updateEstimateTemplate,
      removeEstimateTemplate,
      saveEstimateAsTemplate,
      addCatalogItem,
      updateCatalogItem,
      removeCatalogItem,
      importCatalogItems,
      addTemplateLineFromCatalog,
      addCustomTemplateLine,
      updateTemplateLine,
      removeTemplateLine,
      reorderTemplateLine,
      convertEstimateToInvoice,
      addInvoice,
      updateInvoice,
      sendInvoice,
      ensureInvoiceShareToken,
      voidInvoice,
      recordPayment,
      addExpense,
      addMaterialOrder,
      updateMaterialOrder,
      addMaterialOrderLineFromCatalog,
      addCustomMaterialOrderLine,
      updateMaterialOrderLine,
      removeMaterialOrderLine,
      addMaterialOrderTemplate,
      updateMaterialOrderTemplate,
      removeMaterialOrderTemplate,
      saveMaterialOrderAsTemplate,
      addMaterialOrderTemplateLineFromCatalog,
      addCustomMaterialOrderTemplateLine,
      updateMaterialOrderTemplateLine,
      removeMaterialOrderTemplateLine,
      updateExpense,
      updatePayment,
      updateInvoiceLine,
      setQbStatus,
      addQbReviewComment,
      addScheduleEvent,
      linkDemoCalendar,
      markCalendarLinked,
      disconnectCalendar,
      setShareWithTeam,
      setCalendarShare,
      progressFor,
      markLessonRead,
      submitQuiz,
      addTrainingBulletin,
      addJobPhoto,
      addJobFiles,
      deleteJobFile,
      addPhotoReport,
      updatePhotoReport,
      deletePhotoReport,
      ensurePageShareToken,
      reload,
      signOut,
    }),
    [
      scoped,
      displayUser,
      viewer,
      effectiveStaff,
      impersonatedStaff,
      loginAsOptions,
      state,
      teamMembers,
      configured,
      hydrated,
      hydrateError,
      switchSeat,
      loginAs,
      stopLoginAs,
      getClient,
      getContact,
      customerName,
      getOpportunity,
      getJob,
      getEstimate,
      getEstimateTemplate,
      getInvoice,
      getMaterialOrder,
      getMaterialOrderTemplate,
      jobForOpportunity,
      companySettings,
      canEditCompany,
      updateCompany,
      uploadCompanyLogo,
      removeCompanyLogo,
      inviteStaff,
      updateStaffAccount,
      refreshStaffInvite,
      removeStaff,
      moveOpportunity,
      moveWork,
      updateOpportunity,
      assignOpportunityOwner,
      updateJob,
      deleteJob,
      restoreJob,
      addOpportunity,
      addClient,
      addContact,
      updateContact,
      addJob,
      addActivity,
      sendTextMessage,
      logOutboundText,
      toggleTask,
      addTask,
      addEstimate,
      updateEstimate,
      sendEstimate,
      acceptEstimate,
      declineEstimate,
      reopenEstimate,
      markEstimateViewed,
      ensureEstimateShareToken,
      addEstimateLineFromCatalog,
      addCustomEstimateLine,
      updateEstimateLine,
      removeEstimateLine,
      reorderEstimateLine,
      duplicateEstimate,
      addEstimateTemplate,
      updateEstimateTemplate,
      removeEstimateTemplate,
      saveEstimateAsTemplate,
      addCatalogItem,
      updateCatalogItem,
      removeCatalogItem,
      importCatalogItems,
      addTemplateLineFromCatalog,
      addCustomTemplateLine,
      updateTemplateLine,
      removeTemplateLine,
      reorderTemplateLine,
      convertEstimateToInvoice,
      addInvoice,
      updateInvoice,
      sendInvoice,
      ensureInvoiceShareToken,
      voidInvoice,
      recordPayment,
      addExpense,
      addMaterialOrder,
      updateMaterialOrder,
      addMaterialOrderLineFromCatalog,
      addCustomMaterialOrderLine,
      updateMaterialOrderLine,
      removeMaterialOrderLine,
      addMaterialOrderTemplate,
      updateMaterialOrderTemplate,
      removeMaterialOrderTemplate,
      saveMaterialOrderAsTemplate,
      addMaterialOrderTemplateLineFromCatalog,
      addCustomMaterialOrderTemplateLine,
      updateMaterialOrderTemplateLine,
      removeMaterialOrderTemplateLine,
      updateExpense,
      updatePayment,
      updateInvoiceLine,
      setQbStatus,
      addQbReviewComment,
      addScheduleEvent,
      linkDemoCalendar,
      markCalendarLinked,
      disconnectCalendar,
      setShareWithTeam,
      setCalendarShare,
      progressFor,
      markLessonRead,
      submitQuiz,
      addTrainingBulletin,
      addJobPhoto,
      addJobFiles,
      deleteJobFile,
      addPhotoReport,
      updatePhotoReport,
      deletePhotoReport,
      ensurePageShareToken,
      reload,
      signOut,
    ]
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error("useCrm must be used within CrmProvider");
  }
  return context;
}

export function useCrmOptional() {
  return useContext(CrmContext);
}
