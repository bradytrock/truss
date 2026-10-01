import assert from "node:assert/strict";
import {
  isSipTrunkNumberConflict,
  pickDispatchRuleForTrunk,
  pickTrunkForNumber,
  trunkListsNumber,
} from "./trunks.ts";

const existing = {
  sipTrunkId: "ST_YFepUmEBVc8D",
  numbers: ["+19453823773"],
};
const other = {
  sipTrunkId: "ST_other",
  numbers: ["+12145550100"],
};

assert.equal(trunkListsNumber(existing, "(945) 382-3773"), true);
assert.equal(trunkListsNumber(other, "+19453823773"), false);

assert.equal(
  pickTrunkForNumber([other, existing], "+19453823773")?.sipTrunkId,
  "ST_YFepUmEBVc8D",
);
assert.equal(
  pickTrunkForNumber([existing, { sipTrunkId: "ST_preferred", numbers: ["+1 945 382 3773"] }], "+19453823773", "ST_preferred")
    ?.sipTrunkId,
  "ST_preferred",
);
assert.equal(pickTrunkForNumber([other], "+19453823773"), undefined);

assert.equal(
  pickDispatchRuleForTrunk(
    [
      { sipDispatchRuleId: "SDR_all", trunkIds: [] },
      { sipDispatchRuleId: "SDR_office", trunkIds: ["ST_YFepUmEBVc8D"] },
    ],
    "ST_YFepUmEBVc8D",
  )?.sipDispatchRuleId,
  "SDR_office",
);

const conflict = new Error(
  'Conflicting inbound SIP Trunks: "<new>" and "ST_YFepUmEBVc8D", using the same number(s) ["+19453823773"] without AllowedNumbers set',
);
assert.equal(isSipTrunkNumberConflict(conflict), true);
assert.equal(isSipTrunkNumberConflict(new Error("Photon is not connected.")), false);
