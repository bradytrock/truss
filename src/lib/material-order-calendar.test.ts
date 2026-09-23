import assert from "node:assert/strict";
import {
  applyMaterialOrderDeliverySync,
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

const order = {
  id: "mo-1",
  number: "MO-1044",
  vendor: "ABC Supply",
  notes: "Stage in driveway",
  neededBy: "2026-10-02",
  jobId: "job-1",
};
const context = {
  location: "100 Main, Plano, TX",
  assignee: "Alex Rivera",
  opportunityId: "opp-1" as string | null,
  clientId: null as string | null,
};

{
  const added: string[] = [];
  const createdId = await applyMaterialOrderDeliverySync({
    order,
    events: [],
    ...context,
    add: async (next) => {
      added.push(next.title);
      return { id: "evt-1" };
    },
    update: async () => {
      throw new Error("should create, not update");
    },
    remove: async () => {
      throw new Error("should create, not remove");
    },
  });
  assert.equal(createdId, "evt-1");
  assert.equal(added.length, 1);
}

{
  const updated: string[] = [];
  const id = await applyMaterialOrderDeliverySync({
    order: { ...order, neededBy: "2026-10-09", vendor: "SRS" },
    events: [{ id: "evt-1", notes: "material-order:mo-1\nMO-1044" }],
    existingId: "evt-1",
    ...context,
    add: async () => {
      throw new Error("should update, not create");
    },
    update: async (eventId, next) => {
      updated.push(`${eventId}:${next.title}`);
    },
    remove: async () => {
      throw new Error("should update, not remove");
    },
  });
  assert.equal(id, "evt-1");
  assert.deepEqual(updated, ["evt-1:Material delivery · SRS"]);
}

{
  const removed: string[] = [];
  const id = await applyMaterialOrderDeliverySync({
    order: { ...order, neededBy: null },
    events: [{ id: "evt-1", notes: "material-order:mo-1\nMO-1044" }],
    existingId: "evt-1",
    ...context,
    add: async () => {
      throw new Error("should remove, not create");
    },
    update: async () => {
      throw new Error("should remove, not update");
    },
    remove: async (eventId) => {
      removed.push(eventId);
    },
  });
  assert.equal(id, null);
  assert.deepEqual(removed, ["evt-1"]);
}

{
  const id = await applyMaterialOrderDeliverySync({
    order: { ...order, neededBy: null },
    events: [],
    ...context,
    add: async () => {
      throw new Error("should no-op");
    },
    update: async () => {
      throw new Error("should no-op");
    },
    remove: async () => {
      throw new Error("should no-op");
    },
  });
  assert.equal(id, null);
}

console.log("material-order-calendar.test.ts ok");
