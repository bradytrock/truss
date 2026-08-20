export const NULLABLE_COMPANY_SQL = "supabase/migrations/20260819280000_nullable_company.sql";

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
