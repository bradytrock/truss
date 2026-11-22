import assert from "node:assert/strict";
import { formatPropertyAddress, parseAttomProperty, samplePropertyRecord } from "./property-records-server.ts";

const address = { street: "1420 Elm St", city: "Denver", state: "CO", postalCode: "80205" };
assert.equal(formatPropertyAddress(address), "1420 Elm St, Denver, CO 80205");

// Sample records are deterministic per address and shaped like a real pull.
const a = samplePropertyRecord(address);
const b = samplePropertyRecord(address);
assert.deepEqual({ ...a, fetchedAt: "" }, { ...b, fetchedAt: "" });
assert.ok(a.avmValue && a.avmValue > 100_000);
assert.ok(a.mortgages.length >= 1);
assert.equal(a.mortgages[0]?.position, 1);
assert.ok(a.sourceName.includes("Sample"));
const other = samplePropertyRecord({ ...address, street: "77 Pine Ave" });
assert.notEqual(other.apn, a.apn);
assert.equal(samplePropertyRecord(address, "Dana Ortiz").ownerNames.some((name) => name.includes("Ortiz")), true);

// ATTOM parsing is defensive about shape.
const detail = {
  property: [
    {
      identifier: { apn: "0234-11-009" },
      summary: { propclass: "Single Family Residence / Townhouse", yearbuilt: 1997 },
      building: { size: { universalsize: 2140 }, rooms: { beds: 4, bathstotal: 2.5 } },
      lot: { lotsize2: 7405 },
      owner: {
        owner1: { fullname: "ALVAREZ MARIA" },
        owner2: { lastname: "ALVAREZ", firstnameandmi: "LUIS" },
        absenteeownerstatus: "O",
      },
      sale: { saleTransDate: "2021-11-15", amount: { saleamt: 500000 } },
      assessment: {
        assessed: { assdttlvalue: 480000 },
        market: { mktttlvalue: 600000 },
        tax: { taxamt: 4200, taxdelinquentamt: "1,250", taxdelinquentyear: "2025" },
      },
      mortgage: {
        FirstConcurrent: {
          amount: 400000,
          date: "2021-11-15",
          lender: { lastname: "JPMORGAN CHASE BANK" },
          loantypecode: "CONVENTIONAL",
          interestrate: 3.0,
          term: 30,
        },
        SecondConcurrent: { amount: 50000, date: "2023-05-01", loantypecode: "CREDIT LINE REVOLVING" },
        ThirdConcurrent: {},
      },
      foreclosure: {},
    },
  ],
};
const avm = { property: [{ avm: { amount: { value: 620000, low: 590000, high: 650000, scr: 82 } } }] };
const parsed = parseAttomProperty(detail, avm, address);
assert.ok(parsed);
assert.equal(parsed?.apn, "0234-11-009");
assert.deepEqual(parsed?.ownerNames, ["ALVAREZ MARIA", "LUIS ALVAREZ"]);
assert.equal(parsed?.vesting, "Joint");
assert.equal(parsed?.ownerOccupied, true);
assert.equal(parsed?.avmValue, 620000);
assert.equal(parsed?.avmConfidence, 82);
assert.equal(parsed?.mortgages.length, 2);
assert.equal(parsed?.mortgages[0]?.termMonths, 360);
assert.equal(parsed?.mortgages[0]?.interestRate, 3);
assert.equal(parsed?.mortgages[1]?.isHeloc, true);
assert.equal(parsed?.liens[0]?.kind, "property_tax");
assert.equal(parsed?.liens[0]?.amount, 1250);
assert.equal(parsed?.taxDelinquentAmount, 0); // moved into the lien row so it is not counted twice
assert.equal(parsed?.distress.noticeOfDefault, false);

// Without an AVM the market assessment fills in; empty payloads return null.
const noAvm = parseAttomProperty(detail, null, address);
assert.equal(noAvm?.avmValue, 600000);
assert.equal(parseAttomProperty({ property: [] }, null, address), null);
assert.equal(parseAttomProperty("junk", null, address), null);

// Trust vesting is detected from the owner name.
const trust = parseAttomProperty(
  { property: [{ owner: { owner1: { fullname: "THE REYES FAMILY TRUST" } } }] },
  null,
  address,
);
assert.equal(trust?.vesting, "Trust");

console.log("property-records.test.ts ok");
