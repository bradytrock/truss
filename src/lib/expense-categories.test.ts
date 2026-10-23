import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accountsForPnlSection,
  applyCategoryEdit,
  applyChartAccountEdit,
  categoryKeyFromLabel,
  chartAccountsOrDefaults,
  defaultExpenseCategories,
  storedCategoryRows,
  expenseCategoriesOrDefaults,
  expenseChartLabel,
  mergeExpenseCategories,
  removeCategoryEdit,
} from "./expense-categories.ts";
import { buildProfitAndLoss } from "./profit-and-loss.ts";
import { QB_CHART_ACCOUNTS } from "./qbwc/accounts.ts";
import { expenseRequiresJob } from "./qbwc/work.ts";
import {
  EXPENSE_ACCOUNT_LABELS,
  EXPENSE_ACCOUNTS,
  type Expense,
  type ExpenseCategory,
} from "./types.ts";

const categorySql = readFileSync(
  new URL("../../supabase/migrations/20261022160000_expense_category_accounts.sql", import.meta.url),
  "utf8",
);
for (const category of defaultExpenseCategories()) {
  assert.ok(
    categorySql.includes(
      `('${category.key}'::text, '${category.label}'::text, '${category.qbAccountNumber}'::text, '${category.qbAccountName}'::text`,
    ),
    category.key,
  );
}

for (const account of EXPENSE_ACCOUNTS) {
  const category = defaultExpenseCategories().find((item) => item.key === account);
  assert.ok(category, account);
  assert.equal(category.label, EXPENSE_ACCOUNT_LABELS[account]);
  assert.equal(category.qbAccountNumber, QB_CHART_ACCOUNTS[account].number);
  assert.equal(category.qbAccountName, QB_CHART_ACCOUNTS[account].name);
  assert.equal(category.requiresJob, expenseRequiresJob(account));
}

assert.deepEqual(
  defaultExpenseCategories().filter((item) => item.section === "cost_of_sales").map((item) => item.key),
  ["materials", "subcontractors", "equipment_rental", "dumpsters", "permits", "labor"],
);
assert.deepEqual(
  defaultExpenseCategories().filter((item) => item.section === "operating").map((item) => item.key),
  ["fuel", "office", "insurance"],
);

const taken = new Set(defaultExpenseCategories().map((item) => item.key));
assert.equal(categoryKeyFromLabel("Warranty work", taken), "warranty_work");
assert.equal(categoryKeyFromLabel("R&R", taken), "r_and_r");
assert.equal(categoryKeyFromLabel("Job materials", taken), "job_materials");
taken.add("warranty_work");
assert.equal(categoryKeyFromLabel("Warranty work", taken), "warranty_work_2");

const charts = chartAccountsOrDefaults([]);
const categories = expenseCategoriesOrDefaults([]);
const added = applyCategoryEdit(categories, charts, {
  label: "Warranty work",
  chartAccountId: charts.find((item) => item.accountNumber === "51900")!.id,
  section: "cost_of_sales",
  requiresJob: true,
  active: true,
});
assert.equal(added.ok, true);
if (added.ok) {
  assert.equal(added.category.key, "warranty_work");
  assert.equal(added.category.qbAccountNumber, "51900");
  assert.equal(expenseChartLabel("warranty_work", added.categories), "51900 · Other Construction Costs");
}

const renamed = applyChartAccountEdit(charts, categories, {
  id: charts.find((item) => item.accountNumber === "50400")!.id,
  accountNumber: "50400",
  name: "Materials",
});
assert.equal(renamed.ok, true);
if (renamed.ok) {
  assert.equal(renamed.categories.find((item) => item.key === "materials")?.qbAccountName, "Materials");
}

const renamedNumber = applyChartAccountEdit(charts, categories, {
  id: charts.find((item) => item.accountNumber === "50400")!.id,
  accountNumber: "50410",
  name: "Materials",
});
assert.equal(renamedNumber.ok, true);
if (renamedNumber.ok) {
  const storedCategories = storedCategoryRows(renamedNumber.categories);
  const visibleCategories = expenseCategoriesOrDefaults(storedCategories);
  const visible = chartAccountsOrDefaults([renamedNumber.account], visibleCategories);
  assert.equal(visible.some((item) => item.accountNumber === "50400"), false);
  assert.equal(visible.some((item) => item.accountNumber === "50410"), true);
  assert.equal(visible.some((item) => item.accountNumber === "53600"), true);
  assert.equal(visibleCategories.find((item) => item.key === "materials")?.qbAccountNumber, "50410");
  assert.equal(visibleCategories.find((item) => item.key === "materials")?.qbAccountName, "Materials");
  assert.equal(visibleCategories.find((item) => item.key === "fuel")?.label, "Fuel");
  assert.equal(storedCategories.some((item) => item.key === "fuel"), false);
}

const blocked = removeCategoryEdit(categories, categories[0]!.id, false);
assert.equal(blocked.ok, false);

const custom = added.ok ? added.category : null;
assert.ok(custom);
if (custom && added.ok) {
  const removed = removeCategoryEdit(added.categories, custom.id, true);
  assert.equal(removed.ok, false);
  const gone = removeCategoryEdit(added.categories, custom.id, false);
  assert.equal(gone.ok, true);
}

const savedMaterials: ExpenseCategory = {
  ...categories.find((item) => item.key === "materials")!,
  id: "real-materials",
  label: "Materials",
  qbAccountName: "Materials",
};
const merged = mergeExpenseCategories([savedMaterials]);
assert.equal(merged.find((item) => item.key === "materials")?.label, "Materials");
assert.equal(merged.find((item) => item.key === "fuel")?.label, "Fuel");
assert.equal(merged.length, EXPENSE_ACCOUNTS.length);

assert.equal(expenseRequiresJob("office", categories), false);
assert.equal(expenseRequiresJob("warranty_work", added.ok ? added.categories : categories), true);

const warranty: ExpenseCategory = {
  id: "cat-warranty",
  key: "warranty_work",
  label: "Warranty work",
  chartAccountId: "chart-52000",
  qbAccountNumber: "52000",
  qbAccountName: "Warranty Expense",
  section: "cost_of_sales",
  requiresJob: true,
  sortOrder: 110,
  active: true,
};
const expense = {
  id: "exp-warranty",
  number: "EXP-1",
  invoiceNumber: "",
  jobId: null,
  vendor: "ABC",
  account: "warranty_work",
  amount: 40,
  incurredAt: "2026-09-02",
  method: "check",
  memo: "",
  receiptUrl: "",
  receiptStoragePath: null,
  qbStatus: "not_in_qb",
  extractedByAi: false,
  createdAt: "2026-09-02T12:00:00.000Z",
  createdBy: "",
} satisfies Expense;

const statement = buildProfitAndLoss({
  companyName: "Northline",
  jobs: [],
  invoices: [],
  invoiceLines: [],
  payments: [],
  expenses: [expense],
  basis: "accrual",
  from: "2026-01-01",
  to: "2026-12-31",
  periodLabel: "2026",
  categories: [...defaultExpenseCategories(), warranty],
});
assert.equal(
  statement.costOfSales.lines.some((line) => line.label === "Warranty work" && line.amount === 40),
  true,
);
assert.equal(statement.otherExpenses.total, 0);
assert.deepEqual(accountsForPnlSection("other", [], ["warranty_work"]), ["other", "warranty_work"]);
