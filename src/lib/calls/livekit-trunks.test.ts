import assert from "node:assert/strict";
import {
  conflictingInboundTrunkId,
  pickTrunkForNumber,
  reuseOrCreateTrunk,
  trunkOwnsNumber,
} from "./livekit-trunks.ts";

const conflict =
  'Conflicting inbound SIP Trunks: "<new>" and "ST_YFepUmEBVc8D", using the same number(s) ["+19453823773"] without AllowedNumbers set';

assert.equal(conflictingInboundTrunkId(conflict), "ST_YFepUmEBVc8D");
assert.equal(conflictingInboundTrunkId("something else"), "");
assert.equal(
  conflictingInboundTrunkId(
    'Conflicting inbound SIP Trunks: "ST_existing" and "ST_other", using the same number(s) ["+19453823773"] without AllowedNumbers set',
  ),
  "ST_other",
);

assert.equal(trunkOwnsNumber({ numbers: ["(945) 382-3773"] }, "+19453823773"), true);
assert.equal(trunkOwnsNumber({ numbers: ["+19455550100"] }, "+19453823773"), false);

const open = { sipTrunkId: "ST_YFepUmEBVc8D", numbers: ["+19453823773"], allowedNumbers: [] as string[] };
const restricted = {
  sipTrunkId: "ST_restricted",
  numbers: ["+19453823773"],
  allowedNumbers: ["+12145550100"],
};
assert.equal(pickTrunkForNumber([restricted, open, null], "+19453823773")?.sipTrunkId, "ST_YFepUmEBVc8D");
assert.equal(pickTrunkForNumber([restricted], "+1 945 382 3773")?.sipTrunkId, "ST_restricted");

const office = "+19453823773";
const existing = { sipTrunkId: "ST_YFepUmEBVc8D", numbers: [office] };

let creates = 0;
const reused = await reuseOrCreateTrunk({
  number: office,
  listByNumber: async () => [existing],
  getById: async () => null,
  create: async () => {
    creates += 1;
    return { sipTrunkId: "ST_should_not_create", numbers: [office] };
  },
});
assert.equal(reused.sipTrunkId, "ST_YFepUmEBVc8D");
assert.equal(creates, 0);

let fetched = "";
const recovered = await reuseOrCreateTrunk({
  number: office,
  listByNumber: async () => [],
  getById: async (id) => {
    fetched = id;
    return id === "ST_YFepUmEBVc8D" ? existing : null;
  },
  create: async () => {
    throw new Error(conflict);
  },
});
assert.equal(recovered.sipTrunkId, "ST_YFepUmEBVc8D");
assert.equal(fetched, "ST_YFepUmEBVc8D");

const saved = await reuseOrCreateTrunk({
  number: office,
  existingTrunkId: "ST_saved",
  listByNumber: async () => {
    throw new Error("should not list when the saved trunk still owns the number");
  },
  getById: async (id) => (id === "ST_saved" ? { sipTrunkId: id, numbers: [office] } : null),
  create: async () => {
    throw new Error("should not create");
  },
});
assert.equal(saved.sipTrunkId, "ST_saved");

let createdFor = "";
const replaced = await reuseOrCreateTrunk({
  number: "+19455550199",
  existingTrunkId: "ST_old_line",
  listByNumber: async () => [],
  getById: async (id) => (id === "ST_old_line" ? { sipTrunkId: id, numbers: [office] } : null),
  create: async () => {
    createdFor = "+19455550199";
    return { sipTrunkId: "ST_new_line", numbers: ["+19455550199"] };
  },
});
assert.equal(replaced.sipTrunkId, "ST_new_line");
assert.equal(createdFor, "+19455550199");
