import { qbChartAccount } from "@/lib/qbwc/accounts";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_ACCOUNTS,
  type CompanyChartAccount,
  type ExpenseAccount,
  type ExpenseCategory,
  type ExpenseCategorySection,
} from "@/lib/types";

/**
 * Seed for a new company. Account numbers and names match QB_CHART_ACCOUNTS.
 * Keep in sync with seed_expense_category_accounts in
 * supabase/migrations/20261022160000_expense_category_accounts.sql.
 */
const CATEGORY_SEED: ReadonlyArray<{
  key: ExpenseAccount;
  number: string;
  name: string;
  section: ExpenseCategorySection;
  requiresJob: boolean;
  sortOrder: number;
}> = [
  { key: "materials", number: "50400", name: "Construction Materials Costs", section: "cost_of_sales", requiresJob: true, sortOrder: 10 },
  { key: "subcontractors", number: "53600", name: "Subcontractors Expense", section: "cost_of_sales", requiresJob: true, sortOrder: 20 },
  { key: "equipment_rental", number: "50800", name: "Equipment Rental for Jobs", section: "cost_of_sales", requiresJob: true, sortOrder: 30 },
  { key: "dumpsters", number: "51900", name: "Other Construction Costs", section: "cost_of_sales", requiresJob: true, sortOrder: 40 },
  { key: "permits", number: "61000", name: "Business Licenses and Permits", section: "cost_of_sales", requiresJob: true, sortOrder: 50 },
  { key: "labor", number: "66000", name: "Payroll Expenses", section: "cost_of_sales", requiresJob: true, sortOrder: 60 },
  { key: "fuel", number: "60100", name: "Auto and Truck Expenses", section: "operating", requiresJob: true, sortOrder: 70 },
  { key: "office", number: "64900", name: "Office Supplies", section: "operating", requiresJob: false, sortOrder: 80 },
  { key: "insurance", number: "63300", name: "Insurance Expense", section: "operating", requiresJob: false, sortOrder: 90 },
  { key: "other", number: "51900", name: "Other Construction Costs", section: "other", requiresJob: true, sortOrder: 100 },
];

const ACCOUNT_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const ACCOUNT_NUMBER = /^[A-Za-z0-9][A-Za-z0-9.-]{0,20}$/;

export function defaultChartId(accountNumber: string) {
  return `default:${accountNumber}`;
}

export function defaultCategoryId(key: string) {
  return `default:${key}`;
}

export function isPersistedId(id: string) {
  return Boolean(id) && !id.startsWith("default:");
}

export function isBuiltinExpenseCategory(key: string) {
  return (EXPENSE_ACCOUNTS as readonly string[]).includes(key);
}

export function defaultChartAccounts(): CompanyChartAccount[] {
  const seen = new Set<string>();
  const accounts: CompanyChartAccount[] = [];
  for (const row of CATEGORY_SEED) {
    if (seen.has(row.number)) continue;
    seen.add(row.number);
    accounts.push({
      id: defaultChartId(row.number),
      accountNumber: row.number,
      name: row.name,
      active: true,
    });
  }
  return sortChartAccounts(accounts);
}

export function defaultExpenseCategories(): ExpenseCategory[] {
  return CATEGORY_SEED.map((row) => ({
    id: defaultCategoryId(row.key),
    key: row.key,
    label: EXPENSE_ACCOUNT_LABELS[row.key],
    chartAccountId: defaultChartId(row.number),
    qbAccountNumber: row.number,
    qbAccountName: row.name,
    section: row.section,
    requiresJob: row.requiresJob,
    sortOrder: row.sortOrder,
    active: true,
  }));
}

export function isBuiltinChartNumber(accountNumber: string) {
  return defaultChartAccounts().some((account) => account.accountNumber === accountNumber);
}

export function sortExpenseCategories(categories: readonly ExpenseCategory[]) {
  return categories.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

export function sortChartAccounts(accounts: readonly CompanyChartAccount[]) {
  return accounts
    .slice()
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

/** Saved rows win. Missing built-in categories stay available until the table is seeded. */
export function mergeExpenseCategories(saved: readonly ExpenseCategory[] | null | undefined): ExpenseCategory[] {
  const rows = saved ?? [];
  if (rows.length === 0) return defaultExpenseCategories();
  const byKey = new Map(rows.map((item) => [item.key, item]));
  const defaults = defaultExpenseCategories();
  const merged = defaults.map((item) => byKey.get(item.key) ?? item);
  const extras = rows.filter((item) => !defaults.some((fallback) => fallback.key === item.key));
  return sortExpenseCategories([...merged, ...extras]);
}

export function mergeChartAccounts(
  saved: readonly CompanyChartAccount[] | null | undefined,
  categories?: readonly { qbAccountNumber: string }[] | null,
): CompanyChartAccount[] {
  const rows = saved ?? [];
  if (rows.length === 0) return defaultChartAccounts();
  const byNumber = new Map(rows.map((item) => [item.accountNumber, item]));
  const defaults = defaultChartAccounts();
  const referenced =
    categories && categories.length > 0 ? new Set(categories.map((item) => item.qbAccountNumber)) : null;
  const merged = defaults.flatMap((item) => {
    const hit = byNumber.get(item.accountNumber);
    if (hit) return [hit];
    // A renamed built-in number is already in `rows`. Don't put the old number back
    // once no category still posts to it.
    if (referenced && !referenced.has(item.accountNumber)) return [];
    return [item];
  });
  const extras = rows.filter((item) => !defaults.some((fallback) => fallback.accountNumber === item.accountNumber));
  return sortChartAccounts([...merged, ...extras]);
}

export function expenseCategoriesOrDefaults(rows: readonly ExpenseCategory[] | null | undefined) {
  return mergeExpenseCategories(rows);
}

export function chartAccountsOrDefaults(
  rows: readonly CompanyChartAccount[] | null | undefined,
  categories?: readonly { qbAccountNumber: string }[] | null,
) {
  return mergeChartAccounts(rows, categories);
}

/** Rows worth keeping in app state. Untouched built-ins stay implied by the defaults. */
export function storedCategoryRows(categories: readonly ExpenseCategory[]) {
  const defaults = new Map(defaultExpenseCategories().map((item) => [item.key, item]));
  return sortExpenseCategories(
    categories.filter((item) => {
      const fallback = defaults.get(item.key);
      if (!fallback) return true;
      return (
        fallback.label !== item.label ||
        fallback.chartAccountId !== item.chartAccountId ||
        fallback.qbAccountNumber !== item.qbAccountNumber ||
        fallback.qbAccountName !== item.qbAccountName ||
        fallback.section !== item.section ||
        fallback.requiresJob !== item.requiresJob ||
        fallback.active !== item.active ||
        fallback.sortOrder !== item.sortOrder
      );
    }),
  );
}

export function categoryKeyFromLabel(label: string, taken: ReadonlySet<string>) {
  const words = label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let base = words.replace(/ +/g, "_");
  if (!base || !/^[a-z]/.test(base)) base = `category_${base}`.replace(/^category_$/, "category");
  base = base.slice(0, 40).replace(/_+$/g, "");
  if (!ACCOUNT_KEY.test(base)) base = "category";
  let key = base;
  let n = 2;
  while (taken.has(key)) {
    const suffix = `_${n}`;
    key = `${base.slice(0, 63 - suffix.length)}${suffix}`;
    n += 1;
  }
  return key;
}

export function nextCategorySort(categories: readonly ExpenseCategory[]) {
  return categories.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10;
}

export function storedExpenseAccount(value: string) {
  const key = value.trim();
  if (ACCOUNT_KEY.test(key)) return key;
  return "other";
}

export function expenseCategoryLabel(
  account: string,
  categories?: readonly { key: string; label: string }[],
) {
  const match = categories?.find((item) => item.key === account);
  if (match?.label.trim()) return match.label.trim();
  if (isBuiltinExpenseCategory(account)) return EXPENSE_ACCOUNT_LABELS[account as ExpenseAccount];
  return account.trim() || "Other";
}

export function expenseChartAccount(
  account: string,
  categories?: readonly { key: string; qbAccountNumber: string; qbAccountName: string }[],
) {
  const match = categories?.find((item) => item.key === account);
  if (match && (match.qbAccountNumber.trim() || match.qbAccountName.trim())) {
    return { number: match.qbAccountNumber.trim(), name: match.qbAccountName.trim() };
  }
  return qbChartAccount(account);
}

export function expenseChartLabel(
  account: string,
  categories?: readonly { key: string; qbAccountNumber: string; qbAccountName: string }[],
) {
  const chart = expenseChartAccount(account, categories);
  return chart.number ? `${chart.number} · ${chart.name}` : chart.name;
}

export function categoryChoices(
  categories: readonly ExpenseCategory[],
  options?: { overheadOnly?: boolean; current?: string },
) {
  return sortExpenseCategories(
    categories.filter((item) => {
      if (item.key === options?.current) return true;
      if (!item.active) return false;
      if (options?.overheadOnly && item.requiresJob) return false;
      return true;
    }),
  );
}

export function accountsForPnlSection(
  section: ExpenseCategorySection,
  categories: readonly ExpenseCategory[] | null | undefined,
  used: readonly string[],
) {
  const rows = categories ?? [];
  if (rows.length === 0) {
    const fallback =
      section === "cost_of_sales"
        ? ["materials", "subcontractors", "equipment_rental", "dumpsters", "permits", "labor"]
        : section === "operating"
          ? ["fuel", "office", "insurance"]
          : ["other"];
    if (section !== "other") return fallback;
    const known = new Set(["materials", "subcontractors", "equipment_rental", "dumpsters", "permits", "labor", "fuel", "office", "insurance", "other"]);
    const extras = [...new Set(used.filter((key) => key && !known.has(key)))].sort();
    return [...fallback, ...extras];
  }
  const keys = sortExpenseCategories(rows.filter((item) => item.section === section)).map((item) => item.key);
  if (section !== "other") return keys;
  const known = new Set(rows.map((item) => item.key));
  const extras = [...new Set(used.filter((key) => key && !known.has(key)))].sort();
  return [...keys, ...extras];
}

export function expenseCategoryInUse(
  key: string,
  expenses: readonly { account: string }[],
  forecasts: readonly { account: string }[],
) {
  return expenses.some((item) => item.account === key) || forecasts.some((item) => item.account === key);
}

/** Deferred load keeps an edit that landed before the book finished loading. */
export function preferLocalChartAccounts(
  local: readonly CompanyChartAccount[] | null | undefined,
  incoming: readonly CompanyChartAccount[] | null | undefined,
) {
  const remote = incoming ?? [];
  const current = local ?? [];
  if (current.length === 0) return remote.slice();
  if (remote.length === 0) return current.slice();
  const byNumber = new Map(current.map((item) => [item.accountNumber, item]));
  const merged = remote.map((item) => byNumber.get(item.accountNumber) ?? item);
  const extras = current.filter((item) => !remote.some((row) => row.accountNumber === item.accountNumber));
  return sortChartAccounts([...merged, ...extras]);
}

export function preferLocalExpenseCategories(
  local: readonly ExpenseCategory[] | null | undefined,
  incoming: readonly ExpenseCategory[] | null | undefined,
) {
  const remote = incoming ?? [];
  const current = local ?? [];
  if (current.length === 0) return remote.slice();
  if (remote.length === 0) return current.slice();
  const byKey = new Map(current.map((item) => [item.key, item]));
  const merged = remote.map((item) => byKey.get(item.key) ?? item);
  const extras = current.filter((item) => !remote.some((row) => row.key === item.key));
  return sortExpenseCategories([...merged, ...extras]);
}

export function installCategory(categories: readonly ExpenseCategory[], category: ExpenseCategory) {
  const rest = categories.filter((item) => item.key !== category.key && item.id !== category.id);
  return sortExpenseCategories([...rest, category]);
}

export function installChartAccount(
  charts: readonly CompanyChartAccount[],
  account: CompanyChartAccount,
  previousId?: string,
) {
  const rest = charts.filter(
    (item) => item.id !== account.id && item.id !== previousId && item.accountNumber !== account.accountNumber,
  );
  return sortChartAccounts([...rest, account]);
}

export function retargetChartAccount(
  categories: readonly ExpenseCategory[],
  previous: CompanyChartAccount,
  account: CompanyChartAccount,
) {
  return categories.map((category) => {
    if (category.chartAccountId !== previous.id && category.qbAccountNumber !== previous.accountNumber) return category;
    return {
      ...category,
      chartAccountId: account.id,
      qbAccountNumber: account.accountNumber,
      qbAccountName: account.name,
    };
  });
}

export type CategoryDraft = {
  id?: string;
  label: string;
  chartAccountId: string;
  section: ExpenseCategorySection;
  requiresJob: boolean;
  active: boolean;
};

export function applyCategoryEdit(
  categories: readonly ExpenseCategory[],
  charts: readonly CompanyChartAccount[],
  draft: CategoryDraft,
): { ok: true; categories: ExpenseCategory[]; category: ExpenseCategory } | { ok: false; error: string } {
  const label = draft.label.trim();
  if (!label) return { ok: false, error: "Name the category." };
  const chart = charts.find((item) => item.id === draft.chartAccountId);
  if (!chart || !chart.active) return { ok: false, error: "Pick the QuickBooks account this category posts to." };
  const existing = draft.id ? categories.find((item) => item.id === draft.id) : undefined;
  if (draft.id && !existing) return { ok: false, error: "That category is no longer on the list." };
  const taken = new Set(categories.filter((item) => item.id !== existing?.id).map((item) => item.key));
  const category: ExpenseCategory = {
    id: existing?.id ?? crypto.randomUUID(),
    key: existing?.key ?? categoryKeyFromLabel(label, taken),
    label,
    chartAccountId: chart.id,
    qbAccountNumber: chart.accountNumber,
    qbAccountName: chart.name,
    section: draft.section,
    requiresJob: draft.requiresJob,
    sortOrder: existing?.sortOrder ?? nextCategorySort(categories),
    active: draft.active,
  };
  const next = existing
    ? categories.map((item) => (item.id === existing.id ? category : item))
    : [...categories, category];
  return { ok: true, categories: sortExpenseCategories(next), category };
}

export function removeCategoryEdit(
  categories: readonly ExpenseCategory[],
  categoryId: string,
  inUse: boolean,
): { ok: true; categories: ExpenseCategory[]; category: ExpenseCategory } | { ok: false; error: string } {
  const existing = categories.find((item) => item.id === categoryId);
  if (!existing) return { ok: false, error: "That category is no longer on the list." };
  if (isBuiltinExpenseCategory(existing.key)) {
    return {
      ok: false,
      error: `${existing.label} is one of the original categories. Hide it if you don't want it on new receipts.`,
    };
  }
  if (inUse) {
    return { ok: false, error: "Receipts already use this category. Hide it so new expenses can't pick it." };
  }
  return { ok: true, categories: categories.filter((item) => item.id !== categoryId), category: existing };
}

export type ChartDraft = {
  id?: string;
  accountNumber: string;
  name: string;
};

export function applyChartAccountEdit(
  charts: readonly CompanyChartAccount[],
  categories: readonly ExpenseCategory[],
  draft: ChartDraft,
):
  | {
      ok: true;
      charts: CompanyChartAccount[];
      categories: ExpenseCategory[];
      account: CompanyChartAccount;
      previous: CompanyChartAccount | null;
    }
  | { ok: false; error: string } {
  const accountNumber = draft.accountNumber.trim();
  const name = draft.name.trim();
  if (!accountNumber) return { ok: false, error: "Enter the account number from the QuickBooks chart." };
  if (!ACCOUNT_NUMBER.test(accountNumber)) {
    return { ok: false, error: "Use the account number as it appears in QuickBooks." };
  }
  if (!name) return { ok: false, error: "Enter the account name from the QuickBooks chart." };
  const existing = draft.id ? charts.find((item) => item.id === draft.id) : undefined;
  if (draft.id && !existing) return { ok: false, error: "That account is no longer on the chart." };
  const duplicate = charts.find((item) => item.accountNumber === accountNumber && item.id !== existing?.id);
  if (duplicate) return { ok: false, error: `${accountNumber} is already ${duplicate.name}.` };
  const account: CompanyChartAccount = {
    id: existing?.id ?? crypto.randomUUID(),
    accountNumber,
    name,
    active: existing?.active ?? true,
  };
  const nextCharts = existing
    ? charts.map((item) => (item.id === existing.id ? account : item))
    : [...charts, account];
  const nextCategories = existing ? retargetChartAccount(categories, existing, account) : categories.slice();
  return {
    ok: true,
    charts: sortChartAccounts(nextCharts),
    categories: nextCategories,
    account,
    previous: existing ?? null,
  };
}

export function removeChartAccountEdit(
  charts: readonly CompanyChartAccount[],
  categories: readonly ExpenseCategory[],
  accountId: string,
): { ok: true; charts: CompanyChartAccount[]; account: CompanyChartAccount } | { ok: false; error: string } {
  const existing = charts.find((item) => item.id === accountId);
  if (!existing) return { ok: false, error: "That account is no longer on the chart." };
  if (isBuiltinChartNumber(existing.accountNumber)) {
    return {
      ok: false,
      error: `${existing.accountNumber} is part of the original chart. Leave it, or stop mapping categories to it.`,
    };
  }
  const used = categories.some(
    (item) => item.chartAccountId === existing.id || item.qbAccountNumber === existing.accountNumber,
  );
  if (used) {
    return { ok: false, error: "A category still posts to this account. Point that category somewhere else first." };
  }
  return { ok: true, charts: charts.filter((item) => item.id !== accountId), account: existing };
}
