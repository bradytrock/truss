import assert from "node:assert/strict";
import {
  joinCustomerNames,
  nextEstimateSignature,
  signatureCoversBothHomeowners,
  signatureFieldsForRole,
  signingRoleForName,
} from "./estimate-signers.ts";
import type { Estimate } from "./types.ts";

function estimate(partial: Partial<Estimate> & Pick<Estimate, "id" | "status">): Estimate {
  return {
    number: "EST-1057",
    name: "100 Falcon Ct",
    clientId: null,
    opportunityId: null,
    jobId: null,
    contactId: "jenn",
    secondContactId: "tom",
    notes: "",
    validUntil: null,
    sentAt: null,
    acceptedAt: null,
    secondAcceptedAt: null,
    ownerSignedAt: null,
    ownerSignedName: "",
    createdAt: "2026-09-28T21:30:51.000Z",
    taxRate: 0,
    discountKind: "percent",
    discountValue: 0,
    depositKind: "percent",
    depositValue: 0,
    intro: "",
    terms: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    shareToken: "",
    secondShareToken: "",
    signatureName: "",
    signatureImage: "",
    secondSignatureName: "",
    secondSignatureImage: "",
    packageMode: "",
    selectedPackage: "better",
    marginPercent: 0,
    subtotalOverride: null,
    hideLinePrices: false,
    contractTypeId: null,
    archivedAt: null,
    ...partial,
  };
}

const printed = joinCustomerNames("Jenn Whitby", "Tom Whitby");

assert.equal(signatureCoversBothHomeowners(printed, "Jenn Whitby", "Tom Whitby"), true);
assert.equal(signatureCoversBothHomeowners("Jenn Whitby & Tom Whitby", "Jenn Whitby", "Tom Whitby"), true);
assert.equal(signatureCoversBothHomeowners("Tom Whitby and Jenn Whitby", "Jenn Whitby", "Tom Whitby"), true);
assert.equal(signatureCoversBothHomeowners("Jenn Whitby", "Jenn Whitby", "Tom Whitby"), false);
assert.equal(signatureCoversBothHomeowners("Tom Whitby", "Jenn Whitby", "Tom Whitby"), false);

const draft = estimate({ id: "est", status: "draft" });
const both = signingRoleForName(draft, "primary", printed, {
  primary: "Jenn Whitby",
  second: "Tom Whitby",
});
assert.equal(both, "both");
assert.equal(signingRoleForName(draft, "primary", "Jenn Whitby", { primary: "Jenn Whitby", second: "Tom Whitby" }), "primary");

const next = nextEstimateSignature(draft, both, "2026-09-28T21:41:08.000Z");
assert.equal(next.status, "accepted");
assert.equal(next.acceptedAt, "2026-09-28T21:41:08.000Z");
assert.equal(next.secondAcceptedAt, "2026-09-28T21:41:08.000Z");

const onlyPrimary = nextEstimateSignature(draft, "primary", "2026-09-28T21:41:08.000Z");
assert.equal(onlyPrimary.status, "draft");
assert.equal(onlyPrimary.secondAcceptedAt, null);

const fields = signatureFieldsForRole(draft, {
  role: "both",
  name: printed,
  image: "data:image/png;base64," + "a".repeat(120),
  secondName: "Tom Whitby",
});
assert.equal(fields.signatureName, printed);
assert.equal(fields.secondSignatureName, "Tom Whitby");
assert.equal(fields.signatureImage, fields.secondSignatureImage);

console.log("estimate-signers.test.ts ok");
