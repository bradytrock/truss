import assert from "node:assert/strict";
import {
  callRoomName,
  cellLegIdentity,
  pstnIdentity,
  softphoneIdentity,
} from "./livekit.ts";

const companyId = "11111111-2222-3333-4444-555555555555";
const callId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

assert.equal(
  callRoomName(companyId, callId),
  "call_11111111222233334444555555555555_aaaaaaaabbbbccccddddeeeeeeeeeeee",
);
assert.equal(softphoneIdentity("staff-1"), "staff_staff-1");
assert.match(cellLegIdentity("staff-1", callId), /^cell_staff-1_/);
assert.match(pstnIdentity(callId), /^pstn_/);
