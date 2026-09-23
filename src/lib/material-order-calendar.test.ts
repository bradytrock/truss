import assert from "node:assert/strict";
import {
  findMaterialOrderEvent,
  isMaterialOrderEvent,
  materialOrderDeliveryDraft,
  materialOrderDeliveryNotes,
  materialOrderDeliveryTitle,
  materialOrderDeliveryWindow,
  materialOrderEventMarker,
} from "./material-order-calendar.ts";

assert.equal(materialOrderEventMarker(" mo-1 "), "material-order:mo-1");
assert.equal(isMaterialOrderEvent("material-order:mo-1\nMO-1044", "mo-1"), true);
assert.equal(isMaterialOrderEvent("material-order:mo-10\nMO-1044", "mo-1"), false);
assert.equal(isMaterialOrderEvent("other note", "mo-1"), false);
assert.equal(
  findMaterialOrderEvent(
    [{ id: "a", notes: "nope" }, { id: "b", notes: "material-order:mo-1\nMO-1044" }],
    "mo-1",
  )?.id,
  "b",
);

assert.equal(materialOrderDeliveryWindow(""), null);
assert.equal(materialOrderDeliveryWindow("Tuesday"), null);
const window = materialOrderDeliveryWindow("2026-10-02");
assert.ok(window);
assert.equal(new Date(window.startsAt).getHours(), 8);
assert.equal(new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime(), 2 * 60 * 60 * 1000);

assert.equal(materialOrderDeliveryTitle({ number: "MO-1044", vendor: "ABC Supply" }), "Material delivery · ABC Supply");
assert.equal(materialOrderDeliveryTitle({ number: "MO-1044", vendor: "  " }), "Material delivery · MO-1044");
assert.match(materialOrderDeliveryNotes({ orderId: "mo-1", number: "MO-1044", notes: "Will-call" }), /material-order:mo-1/);
assert.match(materialOrderDeliveryNotes({ orderId: "mo-1", number: "MO-1044", notes: "Will-call" }), /Will-call/);

const draft = materialOrderDeliveryDraft({
  order: {
    id: "mo-1",
    number: "MO-1044",
    vendor: "ABC Supply",
    notes: "Stage in driveway",
    neededBy: "2026-10-02",
    jobId: "job-1",
  },
  location: "100 Main, Plano, TX",
  assignee: "Alex Rivera",
  opportunityId: "opp-1",
  clientId: null,
});
assert.ok(draft);
assert.equal(draft.kind, "production");
assert.equal(draft.jobId, "job-1");
assert.equal(draft.assignee, "Alex Rivera");
assert.equal(draft.location, "100 Main, Plano, TX");
assert.match(draft.notes, /material-order:mo-1/);

assert.equal(
  materialOrderDeliveryDraft({
    order: {
      id: "mo-1",
      number: "MO-1044",
      vendor: "",
      notes: "",
      neededBy: null,
      jobId: "job-1",
    },
    location: "",
    assignee: "Alex",
    opportunityId: null,
    clientId: null,
  }),
  null,
);

console.log("material-order-calendar.test.ts ok");
