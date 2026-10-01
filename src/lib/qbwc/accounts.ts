import type { ExpenseAccount } from "@/lib/types";

/**
 * Chart of accounts in the company file. Job costs must hit these numbered
 * accounts. "Job materials" and "Subcontractors" are stray Expense accounts
 * and are not used.
 *
 * Keep in sync with qbwc_expense_payload in
 * supabase/migrations/20260930120000_qbwc_job_bill_chart_accounts.sql.
 */
export const QB_CHART_ACCOUNTS: Record<ExpenseAccount, { number: string; name: string }> = {
  materials: { number: "50400", name: "Construction Materials Costs" },
  subcontractors: { number: "53600", name: "Subcontractors Expense" },
  equipment_rental: { number: "50800", name: "Equipment Rental for Jobs" },
  dumpsters: { number: "51900", name: "Other Construction Costs" },
  permits: { number: "61000", name: "Business Licenses and Permits" },
  labor: { number: "66000", name: "Payroll Expenses" },
  fuel: { number: "60100", name: "Auto and Truck Expenses" },
  office: { number: "64900", name: "Office Supplies" },
  insurance: { number: "63300", name: "Insurance Expense" },
  other: { number: "51900", name: "Other Construction Costs" },
};

const LEGACY_ACCOUNT_NAMES: Record<string, ExpenseAccount> = {
  "job materials": "materials",
  subcontractors: "subcontractors",
  "equipment rental": "equipment_rental",
  "dumpsters / disposal": "dumpsters",
  "permits & fees": "permits",
  "direct labor": "labor",
  fuel: "fuel",
  "office / overhead": "office",
  insurance: "insurance",
  other: "other",
};

export type QbChartAccount = { number: string; name: string };

export function qbChartAccount(account: ExpenseAccount): QbChartAccount {
  return QB_CHART_ACCOUNTS[account];
}

export function qbChartAccountLabel(account: ExpenseAccount) {
  const chart = QB_CHART_ACCOUNTS[account];
  return `${chart.number} · ${chart.name}`;
}

/** Resolve a queued payload (chart name, legacy label, or account number) to the chart account. */
export function qbChartAccountFor(input: { accountName?: string; accountNumber?: string }): QbChartAccount | null {
  const number = input.accountNumber?.trim() ?? "";
  if (number) {
    const byNumber = Object.values(QB_CHART_ACCOUNTS).find((account) => account.number === number);
    if (byNumber) return byNumber;
  }
  const name = (input.accountName ?? "").trim().toLowerCase();
  if (!name) return null;
  const legacy = LEGACY_ACCOUNT_NAMES[name];
  if (legacy) return QB_CHART_ACCOUNTS[legacy];
  return Object.values(QB_CHART_ACCOUNTS).find((account) => account.name.toLowerCase() === name) ?? null;
}

export type QbAccountRow = {
  listId: string;
  name: string;
  fullName: string;
  accountNumber: string;
  accountType: string;
};

/** Pick the chart account. Account number wins so a stray "Subcontractors" expense account is ignored. */
export function matchQbAccount(accounts: readonly QbAccountRow[], target: QbChartAccount) {
  const number = target.number.trim();
  const byNumber = accounts.find((account) => account.accountNumber.trim() === number);
  if (byNumber?.listId) return byNumber;
  const leaf = target.name.trim().toLowerCase();
  return accounts.find((account) => {
    const name = account.name.trim().toLowerCase();
    const full = account.fullName.trim().toLowerCase();
    const last = full.split(":").pop()?.trim() ?? "";
    return Boolean(account.listId) && (name === leaf || last === leaf);
  });
}

export function qbAccountMissMessage(target: QbChartAccount | null) {
  if (!target) return "That expense has no QuickBooks account. It was not posted.";
  return `QuickBooks has no account ${target.number} ${target.name}. The bill was not posted.`;
}
