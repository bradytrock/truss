import assert from "node:assert/strict";
import {
  amountForTemplate,
  estimateFieldsFromTemplate,
  estimateLinesFromTemplate,
  fillEstimateTemplate,
  fillEstimateTemplateLine,
  templateFromEstimate,
} from "./estimate-templates.ts";
import type { Estimate, EstimateLine } from "./types.ts";

const now = "2026-09-21T00:00:00.000Z";

const gbbTemplate = fillEstimateTemplate({
  id: "tpl_gbb",
  name: "Hail roof GBB",
  market: "residential",
  packageMode: "gbb",
  selectedPackage: "better",
  createdAt: now,
});

assert.equal(gbbTemplate.packageMode, "gbb");
assert.equal(gbbTemplate.selectedPackage, "better");
assert.equal(fillEstimateTemplate({ id: "tpl", name: "Blank", market: "residential", createdAt: now }).packageMode, "");

const shared = fillEstimateTemplateLine({
  id: "tl_shared",
  templateId: gbbTemplate.id,
  catalogItemId: null,
  title: "Tear-off",
  quantity: 1,
  unit: "SQ",
  unitCost: 100,
  sortOrder: 1,
});
assert.equal(shared.package, "");

const better = fillEstimateTemplateLine({
  id: "tl_better",
  templateId: gbbTemplate.id,
  catalogItemId: null,
  title: "Architectural",
  quantity: 1,
  unit: "SQ",
  unitCost: 400,
  sortOrder: 2,
  groupName: "Better",
  package: "better",
});
const best = fillEstimateTemplateLine({
  id: "tl_best",
  templateId: gbbTemplate.id,
  catalogItemId: null,
  title: "Designer",
  quantity: 1,
  unit: "SQ",
  unitCost: 700,
  sortOrder: 3,
  groupName: "Best",
  package: "best",
});

assert.equal(amountForTemplate(gbbTemplate, [shared, better, best]), 500);
assert.equal(amountForTemplate({ ...gbbTemplate, selectedPackage: "best" }, [shared, better, best]), 800);
assert.equal(amountForTemplate({ ...gbbTemplate, packageMode: "" }, [shared, better, best]), 1200);

const fields = estimateFieldsFromTemplate(gbbTemplate);
assert.equal(fields.packageMode, "gbb");
assert.equal(fields.selectedPackage, "better");

const copied = estimateLinesFromTemplate(gbbTemplate.id, "est_1", [shared, better, best]);
assert.deepEqual(
  copied.map((line) => `${line.title}:${line.package || "all"}`),
  ["Tear-off:all", "Architectural:better", "Designer:best"],
);

const estimate = {
  id: "est_src",
  number: "EST-100",
  name: "Source",
  clientId: null,
  opportunityId: null,
  jobId: null,
  contactId: null,
  secondContactId: null,
  status: "draft",
  notes: "",
  validUntil: null,
  sentAt: null,
  acceptedAt: null,
  secondAcceptedAt: null,
  ownerSignedAt: null,
  ownerSignedName: "",
  createdAt: now,
  taxRate: 0,
  discountKind: "percent",
  discountValue: 0,
  depositKind: "percent",
  depositValue: 0,
  intro: "Cover",
  terms: "Terms",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  shareToken: "tok",
  secondShareToken: "",
  signatureName: "",
  signatureImage: "",
  secondSignatureName: "",
  secondSignatureImage: "",
  packageMode: "gbb",
  selectedPackage: "best",
  marginPercent: 0,
  subtotalOverride: null,
  hideLinePrices: false,
} satisfies Estimate;

const estimateLines = [
  {
    id: "el_1",
    estimateId: estimate.id,
    catalogItemId: null,
    title: "Tear-off",
    description: "",
    quantity: 1,
    unit: "SQ",
    unitCost: 100,
    sortOrder: 1,
    groupName: "Demo",
    optional: false,
    selected: true,
    taxable: true,
    package: "",
    photoIds: [],
  },
  {
    id: "el_2",
    estimateId: estimate.id,
    catalogItemId: null,
    title: "Designer",
    description: "",
    quantity: 1,
    unit: "SQ",
    unitCost: 700,
    sortOrder: 2,
    groupName: "Best",
    optional: false,
    selected: true,
    taxable: true,
    package: "best",
    photoIds: [],
  },
] satisfies EstimateLine[];

const saved = templateFromEstimate(estimate, estimateLines, {
  id: "tpl_from",
  name: "From estimate",
  market: "residential",
});
assert.equal(saved.template.packageMode, "gbb");
assert.equal(saved.template.selectedPackage, "best");
assert.deepEqual(
  saved.lines.map((line) => `${line.title}:${line.package || "all"}`),
  ["Tear-off:all", "Designer:best"],
);

console.log("estimate-templates.test.ts ok");
