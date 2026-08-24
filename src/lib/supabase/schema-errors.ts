import type { ClientType, DeliveryMethod, ProjectType } from "@/lib/types";

export const NULLABLE_COMPANY_SQL = "supabase/migrations/20260819280000_nullable_company.sql";
export const ESTIMATE_WRITER_SQL = "supabase/migrations/20260819290000_estimate_writer.sql";
export const RESIDENTIAL_ENUMS_SQL = "supabase/migrations/20260819200000_residential_homeowners.sql";

export const ESTIMATE_SECOND_SIGNER_SQL = "supabase/migrations/20260819350000_estimate_second_signer.sql";

export function isMissingSecondSigner(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("second_contact_id") || message.includes("second_accepted_at");
}

export function missingSecondSignerMessage() {
  return `Saved in this browser. Run ${ESTIMATE_SECOND_SIGNER_SQL} in the SQL editor to keep a second homeowner and both signatures in Postgres.`;
}

export function isMissingEstimateWriter(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (isMissingSecondSigner(error)) return false;
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
