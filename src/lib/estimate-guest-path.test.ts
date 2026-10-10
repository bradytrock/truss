import assert from "node:assert/strict";
import { estimateIdFromStaffPath, isGuestEstimateSharePath } from "./estimate-guest-path.ts";

const id = "21079a81-a6ec-be49-c637-3083b352d406";

assert.equal(estimateIdFromStaffPath(`/estimates/${id}`), id);
assert.equal(estimateIdFromStaffPath(`/estimates/${id}/`), id);
assert.equal(estimateIdFromStaffPath("/estimates"), null);
assert.equal(estimateIdFromStaffPath("/estimates/templates"), null);
assert.equal(estimateIdFromStaffPath(`/estimates/templates/${id}`), null);
assert.equal(estimateIdFromStaffPath("/share/e/abc123"), null);
assert.equal(estimateIdFromStaffPath("/login"), null);

assert.equal(isGuestEstimateSharePath("/share/e/e5e4bcf982e2178a0b3ff99da687b934"), true);
assert.equal(isGuestEstimateSharePath("/share/e/../login"), false);
assert.equal(isGuestEstimateSharePath("/estimates/" + id), false);
assert.equal(isGuestEstimateSharePath("https://example.com/share/e/abc"), false);
assert.equal(isGuestEstimateSharePath(""), false);

console.log("estimate guest path tests passed");
