import assert from "node:assert/strict";
import { formatInboxTime, formatMessageStamp, initials, sameLocalDay } from "./format.ts";

assert.equal(formatInboxTime(null), "—");
assert.equal(formatInboxTime(""), "—");
assert.equal(formatInboxTime("2020-01-15"), "Jan 15");
assert.equal(formatMessageStamp(null), "");
assert.equal(formatMessageStamp("not-a-date"), "");
assert.match(formatMessageStamp("2020-01-15T15:04:00"), /Jan 15/);
assert.equal(sameLocalDay(null, "2020-01-15"), false);
assert.equal(sameLocalDay("2020-01-15", "2020-01-15T18:00:00"), true);
assert.equal(sameLocalDay("2020-01-15", "2020-01-16"), false);
assert.equal(initials(null), "");
assert.equal(initials("Brady Jones"), "BJ");

console.log("format-inbox.test.ts ok");
