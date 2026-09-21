import assert from "node:assert/strict";
import { createPhotoReport } from "./photo-report.ts";
import { seedState } from "./seed.ts";
import {
  addWorkOrderField,
  addWorkOrderItem,
  canRemoveWorkOrderField,
  canRemoveWorkOrderItem,
  emptyWorkOrderPage,
  fillWorkOrderFromJob,
  parseWorkOrderPage,
  removeWorkOrderField,
  removeWorkOrderItem,
  workOrderCrewFromJob,
  workOrderFieldValue,
  workOrderPropertyFromJob,
} from "./work-order.ts";
import type { Job, PhotoReportWorkOrderPage } from "./types.ts";

function job(partial: Partial<Job> = {}): Job {
  return {
    id: "job_1",
    code: "J-1",
    opportunityId: null,
    name: "Alvarez roof",
    clientId: null,
    primaryContactId: null,
    status: "scheduled",
    contractValue: 0,
    startDate: "2026-09-22",
    substantialCompletion: null,
    superintendent: "Dana Ruiz",
    projectManager: "",
    location: "",
    ownerStaffId: "",
    description: "",
    tags: [],
    street: "4418 E 32nd Ave",
    city: "Denver",
    state: "CO",
    postalCode: "80207",
    salesRep: "",
    assigned: ["Luis Ortega", "Maya Chen"],
    subcontractorIds: [],
    relatedContactIds: [],
    customFields: [],
    projectType: "roofing",
    market: "residential",
    leadSource: "",
    primaryPhotoId: null,
    deletedAt: null,
    deletedReason: "",
    deletedBy: "",
    ...partial,
  };
}

const site = job();
assert.equal(workOrderPropertyFromJob(site), "4418 E 32nd Ave, Denver, CO 80207");
assert.equal(
  workOrderPropertyFromJob(job({ street: "", city: "", state: "", postalCode: "", location: "Park Hill" })),
  "Park Hill",
);
const lead = {
  street: "900 Blake St",
  city: "Denver",
  state: "CO",
  postalCode: "80204",
  location: "Ballpark",
} satisfies Pick<Opportunity, "street" | "city" | "state" | "postalCode" | "location">;
assert.equal(
  workOrderPropertyFromJob(job({ street: "", city: "", state: "", postalCode: "", location: "" }), lead),
  "900 Blake St, Denver, CO 80204",
);
assert.equal(
  workOrderFieldValue(
    { id: "p", key: "property", label: "Property", value: "typed over", locked: true },
    site,
  ),
  "4418 E 32nd Ave, Denver, CO 80207",
);
assert.equal(workOrderCrewFromJob(site), "Luis Ortega, Maya Chen");
assert.equal(workOrderCrewFromJob(job({ assigned: [], superintendent: "Dana Ruiz" })), "Dana Ruiz");

const page = emptyWorkOrderPage(site);
assert.equal(page.type, "work_order");
assert.equal(page.heading, "Work Order");
assert.equal(page.tasksHeading, "Tasks");
assert.equal(page.fields.length, 3);
assert.equal(page.items.length, 4);

const property = page.fields.find((field) => field.key === "property");
const crew = page.fields.find((field) => field.key === "crew");
const start = page.fields.find((field) => field.key === "startDate");
assert.ok(property && crew && start);
assert.equal(property.value, "4418 E 32nd Ave, Denver, CO 80207");
assert.equal(crew.value, "Luis Ortega, Maya Chen");
assert.equal(start.value, "2026-09-22");
assert.equal(property.locked, true);
assert.equal(canRemoveWorkOrderField(property), false);
assert.equal(canRemoveWorkOrderItem(page.items[0]!), false);

const afterLockedRemove = removeWorkOrderField(page, property.id);
assert.equal(afterLockedRemove.fields.length, 3);
assert.equal(removeWorkOrderItem(page, page.items[0]!.id).items.length, 4);

const withExtra = addWorkOrderItem(addWorkOrderField(page, "Gate code"), "Bring extra ridge");
const extraField = withExtra.fields[withExtra.fields.length - 1]!;
const extraItem = withExtra.items[withExtra.items.length - 1]!;
assert.equal(canRemoveWorkOrderField(extraField), true);
assert.equal(canRemoveWorkOrderItem(extraItem), true);
assert.equal(removeWorkOrderField(withExtra, extraField.id).fields.length, 3);
assert.equal(removeWorkOrderItem(withExtra, extraItem.id).items.length, 4);

const emptyBound: PhotoReportWorkOrderPage = {
  ...page,
  fields: page.fields.map((field) => ({ ...field, value: "" })),
};
assert.equal(workOrderFieldValue(emptyBound.fields.find((field) => field.key === "property")!, site), "4418 E 32nd Ave, Denver, CO 80207");
const filled = fillWorkOrderFromJob(emptyBound, site);
assert.equal(filled.fields.find((field) => field.key === "property")?.value, "4418 E 32nd Ave, Denver, CO 80207");
const stale = fillWorkOrderFromJob(
  {
    ...page,
    fields: page.fields.map((field) =>
      field.key === "property" ? { ...field, value: "old address" } : field,
    ),
  },
  site,
);
assert.equal(stale.fields.find((field) => field.key === "property")?.value, "4418 E 32nd Ave, Denver, CO 80207");

const parsed = parseWorkOrderPage(
  {
    type: "work_order",
    heading: "Work Order",
    tasksHeading: "Tasks",
    fields: [{ id: "f1", key: "property", label: "Property", value: "Job site", locked: true }],
    items: [{ id: "i1", text: "Dry-in", done: false, locked: true }],
  },
  "wo_1",
);
assert.ok(parsed);
assert.equal(parsed.fields[0]?.value, "Job site");
assert.equal(parsed.items[0]?.locked, true);
assert.equal(parseWorkOrderPage({ type: "text" }, "x"), null);

const created = createPhotoReport({
  job: site,
  customer: "Alvarez",
  photos: [],
  author: "Brady",
  template: "work_order",
});
assert.equal(created.template, "work_order");
assert.equal(created.pages.length, 1);
assert.equal(created.pages[0]?.type, "work_order");
if (created.pages[0]?.type === "work_order") {
  assert.equal(
    created.pages[0].fields.find((field) => field.key === "property")?.value,
    "4418 E 32nd Ave, Denver, CO 80207",
  );
}
const fromLead = createPhotoReport({
  job: job({ street: "", city: "", state: "", postalCode: "", location: "" }),
  customer: "Alvarez",
  photos: [],
  author: "Brady",
  template: "work_order",
  opportunity: lead,
});
if (fromLead.pages[0]?.type === "work_order") {
  assert.equal(
    fromLead.pages[0].fields.find((field) => field.key === "property")?.value,
    "900 Blake St, Denver, CO 80204",
  );
}

for (const seeded of seedState.jobs.slice(0, 8)) {
  const opportunity = seedState.opportunities.find((item) => item.id === seeded.opportunityId) ?? null;
  const expected = workOrderPropertyFromJob(seeded, opportunity);
  const report = createPhotoReport({
    job: seeded,
    customer: "Customer",
    photos: [],
    author: "Brady",
    template: "work_order",
    opportunity,
  });
  assert.ok(expected, `seed job ${seeded.id} should have a site`);
  if (report.pages[0]?.type === "work_order") {
    assert.equal(report.pages[0].fields.find((field) => field.key === "property")?.value, expected);
  }
}
