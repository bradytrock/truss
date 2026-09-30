import assert from "node:assert/strict";
import {
  caretAfterMoneyChars,
  completeMoneyDraft,
  formatMoneyDraft,
  formatMoneyField,
  formatMoneyGrouping,
  moneyAmount,
  moneyDraft,
  moneyDraftFromValue,
} from "./money-input.ts";

assert.equal(moneyDraft(""), "");
assert.equal(moneyDraft("1441.20"), "1441.20");
assert.equal(moneyDraft("$1,441.20"), "1441.20");
assert.equal(moneyDraft("1441.239"), "1441.23");
assert.equal(moneyDraft("."), "0.");
assert.equal(moneyDraft("00012"), "12");
assert.equal(moneyDraft("00.5"), "0.5");
assert.equal(moneyDraft("-40"), "40");

assert.equal(formatMoneyDraft(""), "");
assert.equal(formatMoneyDraft("1441"), "$1,441");
assert.equal(formatMoneyDraft("1441."), "$1,441.");
assert.equal(formatMoneyDraft("1441.2"), "$1,441.2");
assert.equal(formatMoneyDraft("0."), "$0.");

assert.equal(formatMoneyGrouping("1441.2"), "1,441.2");
assert.equal(formatMoneyField(1441.2), "$1,441.20");
assert.equal(formatMoneyField("1441.2"), "$1,441.20");
assert.equal(formatMoneyField(""), "");
assert.equal(formatMoneyField(null), "");

assert.equal(moneyDraftFromValue(1441.2), "1441.20");
assert.equal(moneyDraftFromValue("1441.20"), "1441.20");
assert.equal(moneyDraftFromValue(""), "");
assert.equal(completeMoneyDraft("1441.2"), "1441.20");
assert.equal(completeMoneyDraft("1441."), "1441.00");
assert.equal(completeMoneyDraft(""), "");

assert.equal(moneyAmount("$1,441.20"), 1441.2);
assert.equal(moneyAmount(""), null);
assert.equal(moneyAmount("14."), 14);

assert.equal(caretAfterMoneyChars("$1,441.20", 0), 1);
assert.equal(caretAfterMoneyChars("$1,441.20", 4), 6);
assert.equal(caretAfterMoneyChars("$1,441.20", 5), 7);

console.log("money-input.test.ts ok");
