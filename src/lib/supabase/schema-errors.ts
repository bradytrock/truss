import type { ClientType, DeliveryMethod, ProjectType } from "@/lib/types";

export const NULLABLE_COMPANY_SQL = "supabase/migrations/20260819280000_nullable_company.sql";
export const ESTIMATE_WRITER_SQL = "supabase/migrations/20260819290000_estimate_writer.sql";
export const RESIDENTIAL_ENUMS_SQL = "supabase/migrations/20260819200000_residential_homeowners.sql";
export const JOB_OVERVIEW_SQL = "supabase/migrations/20260819270000_job_overview.sql";

export function isMissingEstimateWriter(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("tax_rate") ||
    message.includes("discount_kind") ||
    message.includes("deposit_kind") ||
    message.includes("group_name") ||
    message.includes("contact_id")
  );
}

export function missingEstimateWriterMessage() {
  return `Saved in this browser. Run ${ESTIMATE_WRITER_SQL} in the SQL editor to keep tax, optional lines, and terms in Postgres.`;
}

export const SHARE_TOKEN_SQL = "supabase/migrations/20260819300000_share_tokens.sql";
export const PROJECT_FINANCIALS_SQL = "supabase/migrations/20260819340000_project_financials.sql";
export const ORIGINATOR_SQL = "supabase/migrations/20260820120000_opportunity_originator.sql";

export function isMissingShareToken(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("share_token")
  );
}

export function isMissingFinancials(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("qb_status") ||
    message.includes("receipt_url") ||
    message.includes("expenses") ||
    message.includes("extracted_by_ai")
  );
}

export function missingFinancialsMessage() {
  return `Saved in this browser. Run ${PROJECT_FINANCIALS_SQL} in the SQL editor to keep receipts and the QuickBooks queue in Postgres.`;
}

export function isMissingOriginator(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the") ||
    message.includes("originator_staff_id")
  );
}

export function missingOriginatorMessage() {
  return `Saved in this browser. Run ${ORIGINATOR_SQL} in the SQL editor so sourced-by stays on the lead after you assign it.`;
}

export function isRequiredClientId(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "23502" && message.includes("client_id")) ||
    message.includes('null value in column "client_id"')
  );
}

export function requiredClientIdMessage() {
  return `Homeowners do not have a company. Run ${NULLABLE_COMPANY_SQL} in the SQL editor, then reset demo data.`;
}

export function isInvalidEnumValue(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "22P02" || message.includes("invalid input value for enum");
}

export function missingResidentialEnumsMessage() {
  return `Run ${RESIDENTIAL_ENUMS_SQL} in the SQL editor so fixed-price, insurance claims, and residential work types store correctly.`;
}

export function isMissingPrimaryContactColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return /primary_contact_id/i.test(error.message ?? "");
}

export function missingPrimaryContactMessage() {
  return `Saved. Run ${RESIDENTIAL_ENUMS_SQL} in the SQL editor so the homeowner stays on the job in Postgres.`;
}

export function missingJobOverviewMessage() {
  return `Saved in this browser. Run ${JOB_OVERVIEW_SQL} in the SQL editor to keep it in Postgres.`;
}

export const JOB_MARKET_SQL = "supabase/migrations/20260821160000_job_market.sql";

export function isMissingMarketColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" || error.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the")) &&
    message.toLowerCase().includes("market")
  );
}

export function missingMarketMessage() {
  return `Saved in this browser. Run ${JOB_MARKET_SQL} in the SQL editor so residential vs commercial persists.`;
}

export const COMPANY_LOGO_SQL = "supabase/migrations/20260821180000_company_logo.sql";

export function isMissingLogoColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      message.includes("schema cache") ||
      message.includes("Could not find the")) &&
    message.toLowerCase().includes("logo")
  );
}

export function missingLogoMessage() {
  return `Saved in this browser. Run ${COMPANY_LOGO_SQL} in the SQL editor so the logo persists and prints on documents.`;
}

export const ESTIMATE_SIGNATURE_SQL = "supabase/migrations/20260821200000_estimate_signature.sql";

export function isMissingSignatureColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  if (message.includes("signature_name") || message.includes("signature_image")) return true;
  return (
    message.includes("sign_shared_estimate") &&
    (error.code === "PGRST202" ||
      error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      message.includes("schema cache") ||
      message.includes("Could not find the"))
  );
}

export function missingSignatureMessage() {
  return `Saved in this browser. Run ${ESTIMATE_SIGNATURE_SQL} in the SQL editor so the client signature stays on the estimate and PDF.`;
}

export const JOB_SOFT_DELETE_SQL = "supabase/migrations/20260821220000_job_soft_delete.sql";

export function isMissingDeletedColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("deleted_at") ||
    message.includes("deleted_reason") ||
    message.includes("deleted_by")
  );
}

export function missingDeletedColumnMessage() {
  return `Saved in this browser. Run ${JOB_SOFT_DELETE_SQL} in the SQL editor so deleted jobs stay in Postgres and can be restored.`;
}

export const JOB_PHOTO_CREATED_BY_SQL = "supabase/migrations/20260821230000_job_photo_created_by.sql";

export function isMissingPhotoCreatedBy(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("created_by");
}

export function missingPhotoCreatedByMessage() {
  return `Saved in this browser. Run ${JOB_PHOTO_CREATED_BY_SQL} in the SQL editor so the Photos feed can show who took each shot.`;
}

export function missingPrimaryContactHint() {
  return `Run ${RESIDENTIAL_ENUMS_SQL} in the SQL editor so jobs can store a homeowner, then try again.`;
}

export function legacyDeliveryMethod(value: string): DeliveryMethod {
  if (value === "insurance_claim" || value === "fixed_price") return "design_bid_build";
  if (value === "time_and_materials") return "design_build";
  return value as DeliveryMethod;
}

export function legacyProjectType(value: string): ProjectType {
  if (value === "remodel") return "tenant_improvement";
  if (
    value === "restoration" ||
    value === "roofing" ||
    value === "exterior" ||
    value === "addition"
  ) {
    return "commercial";
  }
  return value as ProjectType;
}

export function legacyClientType(value: string): ClientType {
  if (value === "insurance") return "owner";
  if (value === "realtor" || value === "trade_partner") return "architect";
  return value as ClientType;
}
