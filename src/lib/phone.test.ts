import assert from "node:assert/strict";
import { formatPhone } from "./format.ts";
import { formatPhoneInput, looksLikePhone, storedPhone, toE164 } from "./phone.ts";

assert.equal(formatPhoneInput(""), "");
assert.equal(formatPhoneInput("2"), "(2");
assert.equal(formatPhoneInput("214"), "(214");
assert.equal(formatPhoneInput("2145"), "(214) 5");
assert.equal(formatPhoneInput("2145550"), "(214) 555-0");
assert.equal(formatPhoneInput("2145550100"), "(214) 555-0100");
assert.equal(formatPhoneInput("12145550100"), "(214) 555-0100");
assert.equal(formatPhoneInput("+1 (214) 555-0100"), "(214) 555-0100");
assert.equal(formatPhoneInput("214-555-0100"), "(214) 555-0100");
assert.equal(formatPhoneInput("+44 20 7946 0958"), "+44 20 7946 0958");
assert.equal(storedPhone("9725550165"), "(972) 555-0165");
assert.equal(formatPhone(""), "—");
assert.equal(formatPhone("9725550165"), "(972) 555-0165");
assert.equal(formatPhone("(214) 555-0100"), "(214) 555-0100");
assert.equal(toE164("(214) 555-0100"), "+12145550100");
assert.equal(looksLikePhone("(214) 555-0100"), true);
assert.equal(looksLikePhone("(214) 555"), false);

console.log("phone.test.ts ok");
