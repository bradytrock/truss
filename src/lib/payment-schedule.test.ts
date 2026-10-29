import assert from "node:assert/strict";
import {
  blankPaymentRows,
  paymentScheduleFromTerms,
  suggestedPaymentAmounts,
} from "./payment-schedule.ts";

const terms = `1. Scope of work
Locked language.

2. Payment
Payment 1: {{pay_1:5207.10}} due at signing.
Payment 2: $________ on material delivery
Payment 3: {{pay_3}} — balance on completion.`;

const rows = paymentScheduleFromTerms(terms);
assert.equal(rows.length, 3);
assert.deepEqual(
  rows.map((row) => [row.key, row.label, row.detail, row.amount]),
  [
    ["pay_1", "Payment 1", "due at signing", 5207.1],
    ["pay_2", "Payment 2", "on material delivery", null],
    ["pay_3", "Payment 3", "balance on completion", null],
  ],
);

assert.deepEqual(
  blankPaymentRows(rows).map((row) => row.key),
  ["pay_2", "pay_3"],
);

const suggested = suggestedPaymentAmounts(rows, { total: 17357, deposit: 5207.1 });
assert.equal(suggested.pay_1, undefined, "typed amounts are not suggested over");
assert.equal(suggested.pay_2, undefined, "middle payments have no suggestion");
assert.equal(suggested.pay_3, 12149.9);

const blankFirst = paymentScheduleFromTerms("Payment 1: {{pay_1}}\nPayment 2: {{pay_2}}");
const suggestedBlank = suggestedPaymentAmounts(blankFirst, { total: 1000, deposit: 300 });
assert.equal(suggestedBlank.pay_1, 300);
assert.equal(suggestedBlank.pay_2, 700);

const single = paymentScheduleFromTerms("Balance due: {{pay_1}}");
assert.equal(single[0]?.label, "Balance due");
assert.deepEqual(suggestedPaymentAmounts(single, { total: 450, deposit: 0 }), { pay_1: 450 });

assert.deepEqual(paymentScheduleFromTerms("No payment lines here. A deposit of {{deposit}} is due."), []);
assert.deepEqual(paymentScheduleFromTerms(""), []);

console.log("payment-schedule ok");
