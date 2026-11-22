import {
  applyHomeownerAnswers,
  isListingStatus,
  isOwnershipKind,
  parseOtherOwedKinds,
  type InterviewFieldKey,
  type InterviewValue,
  type JobPayAtClose,
  type ListingStatus,
  type OtherOwedKind,
  type OwnershipKind,
} from "./pay-at-close.ts";

/**
 * What the homeowner types on their phone. One field per control on the four pages;
 * `homeownerSubmission` turns it into the answers and record fields the office keeps.
 */
export interface HomeownerAnswers {
  listingStatus: ListingStatus | "";
  /** `YYYY-MM` from the month picker. */
  closeMonth: string;
  closeUnknown: boolean;
  askingPrice: number | null;
  ownership: OwnershipKind | "";
  trustee: string;
  deedNames: string;
  mortgageBalance: number | null;
  noMortgage: boolean;
  mortgageCurrent: boolean | null;
  hasSecondLoan: boolean | null;
  secondLoanBalance: number | null;
  otherOwed: OtherOwedKind[];
  agentName: string;
  agentPhone: string;
  titleCompany: string;
  titleCompanyPending: boolean;
  contactConsent: boolean;
}

export function emptyHomeownerAnswers(): HomeownerAnswers {
  return {
    listingStatus: "",
    closeMonth: "",
    closeUnknown: false,
    askingPrice: null,
    ownership: "",
    trustee: "",
    deedNames: "",
    mortgageBalance: null,
    noMortgage: false,
    mortgageCurrent: null,
    hasSecondLoan: null,
    secondLoanBalance: null,
    otherOwed: [],
    agentName: "",
    agentPhone: "",
    titleCompany: "",
    titleCompanyPending: false,
    contactConsent: false,
  };
}

function str(value: InterviewValue | undefined) {
  return typeof value === "string" ? value : "";
}

function boolOrNull(value: InterviewValue | undefined) {
  return typeof value === "boolean" ? value : null;
}

function positive(value: number | InterviewValue | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Restore the phone's form from what is already on the file (the office's answers count too). */
export function homeownerAnswersFromRecord(record: JobPayAtClose): HomeownerAnswers {
  const a = record.interview.answers;
  const listing = record.listingStatus === "sold" ? "pending" : record.listingStatus === "off_market" ? "" : record.listingStatus;
  const second = boolOrNull(a.has_second_loan);
  const secondBalance = positive(a.heloc_balance);
  return {
    listingStatus: listing,
    closeMonth: record.expectedCloseDate ? record.expectedCloseDate.slice(0, 7) : "",
    closeUnknown: a.close_unknown === true && !record.expectedCloseDate,
    askingPrice: positive(record.listPrice),
    ownership: isOwnershipKind(a.ownership) ? a.ownership : "",
    trustee: str(a.trustee_name),
    deedNames: record.signerNames,
    mortgageBalance: a.no_mortgage === true ? null : positive(a.mortgage_balance),
    noMortgage: a.no_mortgage === true,
    mortgageCurrent: a.no_mortgage === true ? null : boolOrNull(a.mortgage_current),
    hasSecondLoan: second ?? (secondBalance ? true : null),
    secondLoanBalance: secondBalance,
    otherOwed: parseOtherOwedKinds(a.other_liens_kinds),
    agentName: record.listingAgent,
    agentPhone: str(a.agent_phone),
    titleCompany: record.titleCompany,
    titleCompanyPending: a.title_company_pending === true && !record.titleCompany.trim(),
    contactConsent: a.contact_consent === true,
  };
}

export interface HomeownerSubmission {
  answers: Record<string, InterviewValue>;
  fields: Partial<Record<InterviewFieldKey, InterviewValue>>;
}

const OTHER_OWED_TEXT: Record<OtherOwedKind, string> = {
  property_tax: "Back property taxes",
  hoa: "HOA dues",
  tax_lien: "IRS or tax lien",
  judgment: "Court judgment",
  contractor: "Another contractor",
  none: "Nothing else",
};

/**
 * Only what the homeowner actually answered goes to the server, so the office's own answers
 * are never re-stamped as the homeowner's. `existing` is the file's current answers; it keeps a
 * rep's "divorce" or "something else" from being flattened by the homeowner's ownership choice.
 */
export function homeownerSubmission(answers: HomeownerAnswers, existing: Record<string, InterviewValue> = {}): HomeownerSubmission {
  const out: Record<string, InterviewValue> = {};
  const fields: Partial<Record<InterviewFieldKey, InterviewValue>> = {};

  if (answers.listingStatus && isListingStatus(answers.listingStatus)) fields.listingStatus = answers.listingStatus;
  if (/^\d{4}-\d{2}$/.test(answers.closeMonth)) {
    fields.expectedCloseDate = `${answers.closeMonth}-01`;
    out.close_unknown = false;
  } else if (answers.closeUnknown) {
    out.close_unknown = true;
  }
  if (answers.askingPrice && answers.askingPrice > 0) fields.listPrice = answers.askingPrice;

  if (answers.ownership) {
    out.ownership = answers.ownership;
    const legal =
      answers.ownership === "trust" ? "trust" : answers.ownership === "llc" ? "llc" : answers.ownership === "estate" ? "estate_probate" : "none";
    const current = existing.legal_situation;
    if (current !== "divorce" && current !== "other") out.legal_situation = legal;
    if (answers.ownership === "trust" && answers.trustee.trim()) out.trustee_name = answers.trustee.trim();
  }
  if (answers.deedNames.trim()) fields.signerNames = answers.deedNames.trim();

  if (answers.noMortgage) {
    out.no_mortgage = true;
    out.mortgage_balance = 0;
    out.mortgage_current = true;
  } else {
    if (answers.mortgageBalance && answers.mortgageBalance > 0) {
      out.no_mortgage = false;
      out.mortgage_balance = answers.mortgageBalance;
    }
    if (answers.mortgageCurrent !== null) out.mortgage_current = answers.mortgageCurrent;
    if (answers.hasSecondLoan !== null) {
      out.has_second_loan = answers.hasSecondLoan;
      if (answers.hasSecondLoan && answers.secondLoanBalance && answers.secondLoanBalance > 0) out.heloc_balance = answers.secondLoanBalance;
      if (!answers.hasSecondLoan) out.heloc_balance = 0;
    }
  }
  if (answers.otherOwed.length) {
    const kinds = answers.otherOwed.includes("none") ? (["none"] as OtherOwedKind[]) : answers.otherOwed;
    out.other_liens_kinds = kinds.join(",");
    out.other_liens = kinds.includes("none") ? "None known" : kinds.map((kind) => OTHER_OWED_TEXT[kind]).join(", ");
  }

  if (answers.agentName.trim()) fields.listingAgent = answers.agentName.trim();
  if (answers.agentPhone.trim()) out.agent_phone = answers.agentPhone.trim();
  if (answers.titleCompany.trim()) {
    fields.titleCompany = answers.titleCompany.trim();
    out.title_company_pending = false;
  } else if (answers.titleCompanyPending) {
    out.title_company_pending = true;
  }
  out.contact_consent = answers.contactConsent;

  return { answers: out, fields };
}

/** The phone's working copy of the file with the current form applied, for the review page and the progress counts. */
export function recordWithHomeownerAnswers(record: JobPayAtClose, answers: HomeownerAnswers): JobPayAtClose {
  return applyHomeownerAnswers(record, homeownerSubmission(answers, record.interview.answers));
}

/** Pick or clear one of the "anything else owed" chips. "Nothing else" clears the rest. */
export function toggleOtherOwed(current: OtherOwedKind[], kind: OtherOwedKind): OtherOwedKind[] {
  if (current.includes(kind)) return current.filter((item) => item !== kind);
  if (kind === "none") return ["none"];
  return [...current.filter((item) => item !== "none"), kind];
}

/** Five digits the homeowner typed, or empty when it is not a ZIP yet. */
export function normalizeZip(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : "";
}
