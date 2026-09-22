import assert from "node:assert/strict";
import {
  applyCompanyTermsToOpenDocuments,
  estimateFollowsCompanyTerms,
  invoiceFollowsCompanyTerms,
  isProductDefaultEstimateTerms,
  liveEstimateTerms,
  liveInvoiceTerms,
  mergePaymentTerms,
} from "./document-terms.ts";
import { DEFAULT_ESTIMATE_TERMS } from "./estimate-totals.ts";

const company =
  "1. Scope of work\nNew scope language.\n\n2. Payment\nPayment 1: {{pay_1:500}}\nPayment 2: {{pay_2}}";
const stored =
  "1. Scope of work\nOld scope language.\n\n2. Payment\nPayment 1: {{pay_1:250}}\nPayment 2: {{pay_2:1000}}";

assert.equal(estimateFollowsCompanyTerms({ status: "draft", acceptedAt: null, secondAcceptedAt: null }), true);
assert.equal(estimateFollowsCompanyTerms({ status: "sent", acceptedAt: null, secondAcceptedAt: null }), true);
assert.equal(estimateFollowsCompanyTerms({ status: "viewed", acceptedAt: null, secondAcceptedAt: null }), true);
assert.equal(estimateFollowsCompanyTerms({ status: "declined", acceptedAt: null, secondAcceptedAt: null }), true);
assert.equal(estimateFollowsCompanyTerms({ status: "accepted", acceptedAt: "2026-09-18T12:00:00.000Z", secondAcceptedAt: null }), false);
assert.equal(
  estimateFollowsCompanyTerms({
    status: "sent",
    acceptedAt: "2026-09-18T12:00:00.000Z",
    secondAcceptedAt: null,
  }),
  false,
);

assert.equal(invoiceFollowsCompanyTerms({ status: "draft" }), true);
assert.equal(invoiceFollowsCompanyTerms({ status: "sent" }), false);
assert.equal(invoiceFollowsCompanyTerms({ status: "paid" }), false);

const live = liveEstimateTerms({
  estimate: { status: "draft", terms: stored, acceptedAt: null, secondAcceptedAt: null },
  companyDefault: company,
});
assert.match(live, /New scope language/);
assert.doesNotMatch(live, /Old scope language/);
assert.match(live, /pay_1:250/);

const frozen = liveEstimateTerms({
  estimate: {
    status: "accepted",
    terms: stored,
    acceptedAt: "2026-09-18T12:00:00.000Z",
    secondAcceptedAt: null,
  },
  companyDefault: company,
});
assert.match(frozen, /Old scope language/);
assert.doesNotMatch(frozen, /New scope language/);

const invoiceLive = liveInvoiceTerms({
  invoice: { status: "draft", terms: stored },
  companyDefault: company,
});
assert.match(invoiceLive, /New scope language/);
assert.match(invoiceLive, /pay_1:250/);

const invoiceFrozen = liveInvoiceTerms({
  invoice: { status: "sent", terms: stored },
  companyDefault: company,
});
assert.match(invoiceFrozen, /Old scope language/);

const shareUnsigned = liveEstimateTerms({
  estimate: { status: "sent", terms: stored, acceptedAt: null, secondAcceptedAt: null },
});
assert.match(shareUnsigned, /Old scope language/);
assert.doesNotMatch(shareUnsigned, /New scope language/);

assert.equal(isProductDefaultEstimateTerms(DEFAULT_ESTIMATE_TERMS), true);
assert.equal(isProductDefaultEstimateTerms(stored), false);

const noFlash = liveEstimateTerms({
  estimate: { status: "sent", terms: stored, acceptedAt: null, secondAcceptedAt: null },
  companyDefault: DEFAULT_ESTIMATE_TERMS,
});
assert.match(noFlash, /Old scope language/);
assert.doesNotMatch(noFlash, /1\. Contract price/);

const holdGeneric = liveEstimateTerms({
  estimate: { status: "draft", terms: DEFAULT_ESTIMATE_TERMS, acceptedAt: null, secondAcceptedAt: null },
});
assert.equal(holdGeneric, "");

const companyReady = liveEstimateTerms({
  estimate: { status: "draft", terms: DEFAULT_ESTIMATE_TERMS, acceptedAt: null, secondAcceptedAt: null },
  companyDefault: company,
});
assert.match(companyReady, /New scope language/);
assert.doesNotMatch(companyReady, /1\. Contract price/);

const shareDraftInvoice = liveInvoiceTerms({
  invoice: { status: "draft", terms: stored },
});
assert.match(shareDraftInvoice, /Old scope language/);

const applied = applyCompanyTermsToOpenDocuments(
  {
    estimates: [
      {
        id: "e-open",
        status: "sent",
        terms: stored,
        acceptedAt: null,
        secondAcceptedAt: null,
      },
      {
        id: "e-signed",
        status: "accepted",
        terms: stored,
        acceptedAt: "2026-09-18T12:00:00.000Z",
        secondAcceptedAt: null,
      },
    ],
    invoices: [
      { id: "i-draft", status: "draft", terms: stored },
      { id: "i-sent", status: "sent", terms: stored },
    ],
  },
  { defaultEstimateTerms: company, defaultInvoiceTerms: company },
);
assert.equal(applied.estimateCount, 1);
assert.equal(applied.invoiceCount, 1);
assert.match(applied.estimates[0]?.terms ?? "", /New scope language/);
assert.match(applied.estimates[1]?.terms ?? "", /Old scope language/);
assert.match(applied.invoices[0]?.terms ?? "", /New scope language/);
assert.match(applied.invoices[1]?.terms ?? "", /Old scope language/);

assert.match(mergePaymentTerms(company, stored), /New scope language/);

const insurance =
  "1. Scope of work\nInsurance scope.\n\n2. Payment\nPayment 1: {{pay_1:100}}";
const perType = applyCompanyTermsToOpenDocuments(
  {
    estimates: [
      {
        id: "e-ins",
        status: "sent",
        terms: stored,
        contractTypeId: "ct-ins",
        acceptedAt: null,
        secondAcceptedAt: null,
      },
    ],
    invoices: [],
  },
  {
    defaultEstimateTerms: company,
    contractTypes: [
      { id: "ct-std", name: "Standard", body: company, isDefault: true },
      { id: "ct-ins", name: "Insurance", body: insurance, isDefault: false },
    ],
  },
);
assert.match(perType.estimates[0]?.terms ?? "", /Insurance scope/);
assert.doesNotMatch(perType.estimates[0]?.terms ?? "", /New scope language/);
assert.match(perType.estimates[0]?.terms ?? "", /pay_1:250/);

const skippedGeneric = applyCompanyTermsToOpenDocuments(
  {
    estimates: [
      {
        id: "e-keep",
        status: "sent",
        terms: stored,
        acceptedAt: null,
        secondAcceptedAt: null,
      },
    ],
    invoices: [],
  },
  { defaultEstimateTerms: DEFAULT_ESTIMATE_TERMS, contractTypes: [] },
);
assert.equal(skippedGeneric.estimateCount, 0);
assert.equal(skippedGeneric.estimates[0]?.terms, stored);

console.log("document-terms.test.ts ok");
