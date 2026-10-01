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
