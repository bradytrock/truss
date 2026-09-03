import type { ClientType, DeliveryMethod, ProjectType } from "@/lib/types";

export const NULLABLE_COMPANY_SQL = "supabase/migrations/20260819280000_nullable_company.sql";
export const ESTIMATE_WRITER_SQL = "supabase/migrations/20260819290000_estimate_writer.sql";
export const ESTIMATE_LINE_PHOTOS_SQL = "supabase/migrations/20260825200000_estimate_line_photos.sql";

export function isMissingEstimateLinePhotos(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return (error.message ?? "").toLowerCase().includes("photo_ids");
}

export function missingEstimateLinePhotosMessage() {
  return `Saved in this browser. Run ${ESTIMATE_LINE_PHOTOS_SQL} in the SQL editor so line photos stay on the proposal.`;
}

export const RESIDENTIAL_ENUMS_SQL = "supabase/migrations/20260819200000_residential_homeowners.sql";
export const JOB_OVERVIEW_SQL = "supabase/migrations/20260819270000_job_overview.sql";

export const ESTIMATE_SECOND_SIGNER_SQL = "supabase/migrations/20260819350000_estimate_second_signer.sql";
export const ESTIMATE_OWNER_SIGNATURE_SQL =
  "supabase/migrations/20260819360000_estimate_owner_signature.sql";

export function isMissingSecondSigner(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("second_contact_id") || message.includes("second_accepted_at");
}

export function missingSecondSignerMessage() {
  return `Saved in this browser. Run ${ESTIMATE_SECOND_SIGNER_SQL} in the SQL editor to keep a second homeowner and both signatures in Postgres.`;
}

export function isMissingOwnerSignature(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("owner_signed_at") || message.includes("owner_signed_name");
}

export function missingOwnerSignatureMessage() {
  return `Saved in this browser. Run ${ESTIMATE_OWNER_SIGNATURE_SQL} in the SQL editor so sending a proposal keeps the project owner's signature in Postgres.`;
}

export function isMissingEstimateWriter(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (isMissingSecondSigner(error)) return false;
  if (isMissingOwnerSignature(error)) return false;
  if (isMissingEstimateLinePhotos(error)) return false;
  if (isMissingEstimatePackages(error)) return false;
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

export const ESTIMATE_PACKAGES_SQL = "supabase/migrations/20260831140000_estimate_packages.sql";

export function isMissingEstimatePackages(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("package_mode") ||
    message.includes("selected_package") ||
    message.includes("select_shared_estimate_package") ||
    (message.includes("package") && message.includes("estimate_lines")) ||
    (message.includes("'package'") && message.includes("column")) ||
    (message.includes('"package"') && message.includes("column"))
  );
}

export function missingEstimatePackagesMessage() {
  return `Saved in this browser. Run ${ESTIMATE_PACKAGES_SQL} in the SQL editor so Good / Better / Best packages stay on the proposal.`;
}

export const SHARE_TOKEN_SQL = "supabase/migrations/20260819300000_share_tokens.sql";
export const PROJECT_FINANCIALS_SQL = "supabase/migrations/20260819340000_project_financials.sql";
export const ORIGINATOR_SQL = "supabase/migrations/20260820120000_opportunity_originator.sql";

export function isMissingShareToken(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("second_share_token")) return false;
  return message.includes("share_token");
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

export function isUuidSyntaxError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return (error.message ?? "").toLowerCase().includes("invalid input syntax for type uuid");
}

export function looksLikeUuid(value: string | null | undefined) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Live payments/expenses.created_by is uuid in some projects; prefer the auth user, then the seat. */
export function actorUuid(user: { id: string; staffId: string }) {
  if (looksLikeUuid(user.id)) return user.id;
  if (looksLikeUuid(user.staffId)) return user.staffId;
  return null;
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

export const DOCUMENT_TERMS_SQL = "supabase/migrations/20260825130000_document_terms.sql";

export function isMissingCompanyDocumentTermsColumns(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("default_estimate_terms") || message.includes("default_invoice_terms");
}

export function isMissingInvoiceTermsColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("default_estimate_terms") || message.includes("default_invoice_terms")) return false;
  return message.includes("terms") && (message.includes("invoice") || message.includes("'terms'"));
}

export function missingDocumentTermsMessage() {
  return `Saved in this browser. Run ${DOCUMENT_TERMS_SQL} in the SQL editor so company default terms and invoice terms persist.`;
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

export const SIGN_ESTIMATE_JOB_ID_SQL = "supabase/migrations/20260825150000_fix_sign_shared_estimate_job_id.sql";

export function isAmbiguousSignJobId(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("job_id") && message.includes("ambiguous");
}

export function ambiguousSignJobIdMessage() {
  return `Run ${SIGN_ESTIMATE_JOB_ID_SQL} in the SQL editor so signing a proposal can attach the job.`;
}

export const ESTIMATE_SIGNER_LINKS_SQL = "supabase/migrations/20260825180000_estimate_signer_links.sql";
export const SHARE_LINK_SENDER_SQL = "supabase/migrations/20260825190000_share_link_sender.sql";

export function isMissingSignerLinks(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("second_share_token") ||
    message.includes("second_signature_name") ||
    message.includes("second_signature_image") ||
    message.includes("select_shared_estimate_line")
  );
}

export function missingSignerLinksMessage() {
  return `Saved in this browser. Run ${ESTIMATE_SIGNER_LINKS_SQL} in the SQL editor so each homeowner gets a unique signing link.`;
}

export const STAFF_PROFILE_PHONE_SQL = "supabase/migrations/20260825160000_staff_profile_phone.sql";

export function isMissingStaffPhoneColumn(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("phone") && (message.includes("team_members") || error.code === "PGRST204");
}

export function missingStaffPhoneMessage() {
  return `Saved in this browser. Run ${STAFF_PROFILE_PHONE_SQL} in the SQL editor so a teammate's direct line prints on estimates and invoices.`;
}

export const JOB_FILES_SQL = "supabase/migrations/20260825170000_job_files.sql";

export function isMissingJobFiles(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentionsTable = message.includes("job_files") || message.includes("job_file");
  return (
    (code === "pgrst205" && mentionsTable) ||
    ((message.includes("schema cache") || message.includes("could not find the")) && mentionsTable)
  );
}

export function missingJobFilesMessage() {
  return `Could not save that file to the job. Run ${JOB_FILES_SQL} in the SQL editor if this keeps happening.`;
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

export const MESSAGES_SQL = "supabase/migrations/20260825120000_messages.sql";

export function isMissingMessages(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    message.includes("schema cache") ||
    message.includes("Could not find the")
  ) && message.toLowerCase().includes("messages");
}

export function missingMessagesMessage() {
  return `Saved in this browser. Run ${MESSAGES_SQL} in the SQL editor so texts stay on the job and in Messages.`;
}

export const GMAIL_SQL = "supabase/migrations/20260901120000_gmail.sql";
export const GMAIL_SEND_SQL = "supabase/migrations/20260901140000_gmail_send.sql";

export function isMissingGmail(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    (error.code === "PGRST204" ||
      error.code === "PGRST205" ||
      message.includes("schema cache") ||
      message.includes("could not find the")) &&
    (message.includes("gmail_messages") ||
      message.includes("gmail_accounts") ||
      message.includes("save_gmail_tokens") ||
      message.includes("gmail_credentials") ||
      message.includes("disconnect_gmail") ||
      message.includes("related_contact_ids") ||
      message.includes("cc_email"))
  );
}

export function missingGmailMessage() {
  return `Saved in this browser. Run ${GMAIL_SQL} and ${GMAIL_SEND_SQL} in the SQL editor so Gmail stays linked, send works, and tagged mail stays on the job and contact.`;
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

export const QBWC_SQL = "supabase/migrations/20260825210000_qbwc.sql";
export const QBWC_PGCRYPTO_SQL = "supabase/migrations/20260825220000_qbwc_pgcrypto.sql";
export const QBWC_QUEUE_SQL = "supabase/migrations/20260825230000_qbwc_queue.sql";
export const QBWC_EXPENSES_SQL = "supabase/migrations/20260825240000_qbwc_expenses_payments.sql";
export const QBWC_CUSTOMER_ALIAS_SQL = "supabase/migrations/20260825250000_qbwc_customer_alias.sql";
export const QBWC_VENDORS_SQL = "supabase/migrations/20260825260000_qb_vendors.sql";
export const QB_REVIEW_SQL = "supabase/migrations/20260825270000_qb_review.sql";
export const QB_REVIEW_MENTIONS_SQL = "supabase/migrations/20260827010000_qb_review_mentions.sql";
export const QBWC_EXPENSE_JOB_SQL = "supabase/migrations/20260827020000_qbwc_expense_job.sql";

export function isMissingQbReview(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentions = message.includes("qb_review_comments") || message.includes("qb_review");
  return (
    (code === "pgrst205" && mentions) ||
    ((message.includes("schema cache") || message.includes("could not find the")) && mentions)
  );
}

export function missingQbReviewMessage() {
  return `Saved in this browser. Run ${QB_REVIEW_SQL} in the SQL editor so review comments stay on the invoice, expense, or payment.`;
}

export function isMissingQbReviewMentions(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("mentioned_staff_ids");
}

export function missingQbReviewMentionsMessage() {
  return `Tagged in this browser. Run ${QB_REVIEW_MENTIONS_SQL} in the SQL editor so @mentions on review comments persist.`;
}

export function isMissingQbwcPgcrypto(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("gen_salt") ||
    message.includes("function crypt(") ||
    (error.code === "42883" && (message.includes("crypt") || message.includes("gen_salt")))
  );
}

export function missingQbwcPgcryptoMessage() {
  return `pgcrypto is not on the password function search path. Paste ${QBWC_PGCRYPTO_SQL} in the SQL editor, then create the connector password again.`;
}

export function isMissingQbwc(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (isMissingQbwcPgcrypto(error)) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    message.includes("qbwc_") ||
    message.includes("could not find the function") ||
    message.includes("could not find the table")
  );
}

export function missingQbwcMessage() {
  return `Run ${QBWC_SQL} in the SQL editor (or a fresh bootstrap) so the Web Connector can sign in and post invoices. Expenses and payments also need ${QBWC_EXPENSES_SQL}. Job expenses posting onto Customer:Job need ${QBWC_EXPENSE_JOB_SQL}. If a job parent is already a vendor, run ${QBWC_CUSTOMER_ALIAS_SQL} so the connector can create a customer and hang the job under it. Expense vendor dropdowns need ${QBWC_VENDORS_SQL} so the connector can pull the vendor list from QuickBooks.`;
}

export const MATERIAL_ORDERS_SQL = "supabase/migrations/20260828120000_material_orders.sql";

export function isMissingMaterialOrders(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentionsTable =
    message.includes("material_orders") ||
    message.includes("material_order_lines") ||
    message.includes("material_order");
  return (
    (code === "pgrst205" && mentionsTable) ||
    ((message.includes("schema cache") || message.includes("could not find the")) && mentionsTable)
  );
}

export function missingMaterialOrdersMessage() {
  return `Saved in this browser. Run ${MATERIAL_ORDERS_SQL} in the SQL editor (or a fresh bootstrap) so material orders persist for the office and the field.`;
}

export const CATALOG_MARGIN_SQL = "supabase/migrations/20260828140000_catalog_margin.sql";

export function isMissingCatalogMargin(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("margin_percent") || message.includes("minimum_margin_percent");
}

export function missingCatalogMarginMessage() {
  return `Saved in this browser. Run ${CATALOG_MARGIN_SQL} in the SQL editor (or a fresh bootstrap) so catalog margin and the company minimum persist.`;
}

export const EMAIL_SIGNATURES_SQL = "supabase/migrations/20260901150000_email_signatures.sql";

export function isMissingEmailSignatureColumns(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("default_email_signature") || message.includes("email_signature");
}

export function missingEmailSignatureMessage() {
  return `Saved in this browser. Run ${EMAIL_SIGNATURES_SQL} in the SQL editor (or a fresh bootstrap) so email signatures persist.`;
}

export const PRICE_LISTS_SQL = "supabase/migrations/20260828150000_price_lists.sql";

export function isMissingPriceLists(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentionsTable = message.includes("price_lists") || message.includes("price_list_id");
  return (
    (code === "pgrst205" && mentionsTable) ||
    ((message.includes("schema cache") || message.includes("could not find the")) && mentionsTable) ||
    message.includes("price_list_id")
  );
}

export function missingPriceListsMessage() {
  return `Saved in this browser. Run ${PRICE_LISTS_SQL} in the SQL editor (or a fresh bootstrap) so dated price lists persist. Old lists stay in the book when you outdate them.`;
}

export const ESTIMATE_SIGNATURE_AUDIT_SQL =
  "supabase/migrations/20260829120000_estimate_signature_audit.sql";

export function isMissingSignatureAudit(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentions =
    message.includes("estimate_signature_events") ||
    message.includes("record_estimate_share_event") ||
    message.includes("shared_estimate_audit");
  return (
    mentions &&
    (code === "pgrst205" ||
      code === "pgrst202" ||
      message.includes("schema cache") ||
      message.includes("could not find the") ||
      message.includes("does not exist"))
  );
}

export function missingSignatureAuditMessage() {
  return `The signature is on the proposal. Run ${ESTIMATE_SIGNATURE_AUDIT_SQL} in the SQL editor (or a fresh bootstrap) so IP address, consent, and the document hash stay in the office certificate.`;
}

export const RETURNING_CLIENT_LEADS_SQL = "supabase/migrations/20260830120000_returning_client_leads.sql";
export const RETURNING_CLIENT_NOTICE_FLOW_SQL =
  "supabase/migrations/20260830130000_returning_client_notice_flow.sql";

export function isMissingReturningClientLeads(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const mentions = message.includes("returning_client_leads");
  return (
    mentions &&
    (code === "pgrst205" ||
      code === "pgrst202" ||
      code === "pgrst204" ||
      message.includes("schema cache") ||
      message.includes("could not find the") ||
      message.includes("does not exist") ||
      message.includes("status_check") ||
      message.includes("violates check constraint"))
  );
}

export function missingReturningClientLeadsMessage() {
  return `Lead opened. Run ${RETURNING_CLIENT_LEADS_SQL} then ${RETURNING_CLIENT_NOTICE_FLOW_SQL} in the SQL editor so the previous project manager is asked first.`;
}

export const BUSINESS_CARDS_SQL = "supabase/migrations/20260831130000_business_cards.sql";

export function isMissingCompanySlug(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("slug") &&
    (error.code === "PGRST204" ||
      message.includes("schema cache") ||
      message.includes("could not find the") ||
      message.includes("column"))
  );
}

export function isMissingCardSlug(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("card_slug") &&
    (error.code === "PGRST204" ||
      message.includes("schema cache") ||
      message.includes("could not find the") ||
      message.includes("column"))
  );
}

export function isReservedCompanySlugError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("company slug is reserved") || message.includes("slug is reserved");
}

export function isDuplicateCardSlug(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  return (
    (code === "23505" || message.includes("duplicate")) &&
    (message.includes("slug") || message.includes("card_slug") || message.includes("_uidx"))
  );
}

export function missingBusinessCardsMessage() {
  return `Saved in this browser. Run ${BUSINESS_CARDS_SQL} in the SQL editor so public cards at /company/card/first.last stay in Postgres.`;
}

export const CARD_PHOTOS_SQL = "supabase/migrations/20260903150000_card_photos.sql";

export function isMissingCardPhotoColumns(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("card_logo_url") ||
    message.includes("card_logo_storage_path") ||
    message.includes("photo_url") ||
    message.includes("photo_storage_path")
  );
}

export function missingCardPhotoMessage() {
  return `Saved in this browser. Run ${CARD_PHOTOS_SQL} in the SQL editor (or a fresh bootstrap) so card logos and seat photos persist.`;
}

export const PAYMENTS_REVIEWS_SQL = "supabase/migrations/20260903170000_payments_reviews.sql";
export const GOOGLE_LOCATIONS_SQL = "supabase/migrations/20260903190000_google_locations.sql";

export function isMissingPaymentReviewColumns(
  error: { message?: string; code?: string } | null | undefined,
) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("payment_") ||
    message.includes("google_review_url") ||
    message.includes("google_location_id") ||
    message.includes("google_locations")
  );
}

export function missingPaymentReviewMessage() {
  return `Saved in this browser. Run ${PAYMENTS_REVIEWS_SQL} and ${GOOGLE_LOCATIONS_SQL} in the SQL editor (or a fresh bootstrap) so payment options and Google locations persist.`;
}

export const CARD_SLUG_TRIGGER_SQL = "supabase/migrations/20260831150000_card_slug_trigger_rights.sql";

export function isCardSlugPrivilegeError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  if (!message.includes("permission denied")) return false;
  return (
    message.includes("normalize_person_card_slug") ||
    message.includes("normalize_company_slug") ||
    message.includes("person_card_slug") ||
    message.includes("next_person_card_slug") ||
    message.includes("next_company_slug") ||
    message.includes("company_slug_is_reserved") ||
    message.includes("team_members_mint_card_slug") ||
    message.includes("companies_mint_slug")
  );
}

export function cardSlugPrivilegeMessage() {
  return `Run ${CARD_SLUG_TRIGGER_SQL} in the SQL editor so adding a person can mint their card URL.`;
}
