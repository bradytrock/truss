import assert from "node:assert/strict";
import { applyLiveChange, applyLiveChanges } from "./live-book.ts";
import { protectLocalRows, resetLocalWriteEchoes } from "./local-writes.ts";
import type { CrmState, EstimateLine } from "@/lib/types";

function book(lines: EstimateLine[]): CrmState {
  return { estimateLines: lines, jobs: [], opportunities: [] } as CrmState;
}

const line = {
  id: "line-1",
  estimateId: "est-1",
  catalogItemId: null,
  title: "Shingles",
  description: "Shingles",
  quantity: 1,
  unit: "SQ",
  unitCost: 10,
  sortOrder: 0,
  groupName: "",
  optional: false,
  selected: true,
  taxable: true,
  quantityFormula: "",
  measurementKeys: [],
  coverageAmount: 1,
  coverageUnit: "squares",
  package: "",
  photoIds: [],
} satisfies EstimateLine;

const row = {
  id: "line-1",
  company_id: "co-1",
  estimate_id: "est-1",
  catalog_item_id: null,
  title: "Shingles",
  description: "Shingles",
  quantity: 4,
  unit: "SQ",
  unit_cost: 25,
  sort_order: 0,
  group_name: "",
  optional: false,
  selected: true,
  taxable: true,
  photo_ids: [],
};

resetLocalWriteEchoes();

const updated = applyLiveChange(
  book([line]),
  { eventType: "UPDATE", table: "estimate_lines", new: row },
  "co-1",
);
assert.equal(updated.estimateLines[0]?.quantity, 4);
assert.equal(updated.estimateLines[0]?.unitCost, 25);

const current = book([line]);
const ignored = applyLiveChange(
  current,
  { eventType: "UPDATE", table: "estimate_lines", new: { ...row, company_id: "other" } },
  "co-1",
);
assert.equal(ignored, current);
assert.equal(ignored.estimateLines[0]?.quantity, 1);

protectLocalRows(["line-1"]);
const held = applyLiveChange(
  book([{ ...line, quantity: 9 }]),
  { eventType: "UPDATE", table: "estimate_lines", new: row },
  "co-1",
);
assert.equal(held.estimateLines[0]?.quantity, 9);

resetLocalWriteEchoes();
const removed = applyLiveChange(
  book([line, { ...line, id: "line-2" }]),
  { eventType: "DELETE", table: "estimate_lines", old: { id: "line-1" } },
  "co-1",
);
assert.deepEqual(
  removed.estimateLines.map((item) => item.id),
  ["line-2"],
);

const filled = applyLiveChanges(
  { jobs: [], opportunities: [] } as CrmState,
  [
    {
      eventType: "INSERT",
      table: "jobs",
      new: {
        id: "job-1",
        company_id: "co-1",
        code: "J1",
        opportunity_id: null,
        name: "Roof",
        client_id: null,
        primary_contact_id: null,
        status: "precon",
        contract_value: 0,
        start_date: null,
        substantial_completion: null,
        superintendent: "",
        project_manager: "",
        location: "",
        owner_staff_id: "",
        description: "",
        tags: [],
        street: "",
        city: "",
        state: "",
        postal_code: "",
        sales_rep: "",
        assigned: [],
        subcontractor_ids: [],
        related_contact_ids: [],
        custom_fields: {},
        project_type: "",
        market: "",
        trades: [],
        lead_source: "",
        deleted_at: null,
        deleted_reason: "",
        deleted_by: "",
      },
    },
  ],
  "co-1",
);
assert.equal(filled.jobs[0]?.id, "job-1");
assert.equal(filled.jobs[0]?.name, "Roof");

console.log("live-book.test.ts ok");
