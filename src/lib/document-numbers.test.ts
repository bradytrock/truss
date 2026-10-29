import assert from "node:assert/strict";
import {
  allocateEstimateNumber,
  claimEstimateNumber,
  heldEstimateNumbers,
  isDuplicateEstimateNumber,
  nextNumber,
  resetEstimateNumberClaims,
  spareEstimateNumber,
} from "./document-numbers.ts";

resetEstimateNumberClaims();

assert.equal(nextNumber("EST", []), "EST-1001");
assert.equal(nextNumber("EST", ["EST-1001", "EST-1092"]), "EST-1093");
assert.equal(nextNumber("INV", ["INV-1004", "draft"]), "INV-1005");

assert.equal(
  isDuplicateEstimateNumber({
    code: "23505",
    message: 'duplicate key value violates unique constraint "estimates_company_number_idx"',
  }),
  true,
);
assert.equal(
  isDuplicateEstimateNumber({
    code: "23505",
    message: 'duplicate key value violates unique constraint "estimates_share_token_key"',
  }),
  false,
);
assert.equal(isDuplicateEstimateNumber(null), false);

const first = claimEstimateNumber("co-a", ["EST-1091"]);
const second = claimEstimateNumber("co-a", ["EST-1091"]);
assert.equal(first.number, "EST-1092");
assert.equal(second.number, "EST-1093");
assert.deepEqual(heldEstimateNumbers("co-a", first.number), ["EST-1093"]);

assert.equal(first.replace("EST-1094"), "EST-1094");
assert.equal(first.number, "EST-1094");
assert.equal(heldEstimateNumbers("co-a", second.number).includes("EST-1092"), false);
assert.equal(heldEstimateNumbers("co-a", second.number).includes("EST-1094"), true);

const otherCompany = claimEstimateNumber("co-b", []);
assert.equal(otherCompany.number, "EST-1001");

second.release();
const reused = claimEstimateNumber("co-a", ["EST-1091"]);
assert.equal(reused.number, "EST-1095");

assert.equal(spareEstimateNumber("EST-1093", ["EST-1094"]), "EST-1093");
assert.equal(spareEstimateNumber("EST-1093", ["EST-1093", "EST-1094"]), "EST-1095");
assert.equal(spareEstimateNumber("", ["EST-1092"]), "EST-1093");
assert.equal(spareEstimateNumber("nope", ["EST-1001"]), "EST-1002");

resetEstimateNumberClaims();
claimEstimateNumber("co-c", ["EST-1001"]);

const issued = await allocateEstimateNumber(
  {
    rpc: async () => ({ data: "EST-1001", error: null }),
    from: () => {
      throw new Error("fallback should not run");
    },
  } as never,
  "co-c",
  "EST-1002",
  ["EST-1001"],
);
assert.equal(issued, "EST-1002");

const fromBook = await allocateEstimateNumber(
  {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "allocate_estimate_number" } }),
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [{ number: "EST-1092" }, { number: "EST-1080" }], error: null }),
          }),
        }),
      }),
    }),
  } as never,
  "co-c",
  "EST-1002",
  [],
);
assert.equal(fromBook, "EST-1093");
