import assert from "node:assert/strict";
import {
  outboundSendKey,
  resetOutboundSendGuard,
  withOutboundSendGuard,
} from "./outbound-send-guard.ts";

resetOutboundSendGuard();

assert.equal(outboundSendKey(" 2145550101 ", " Hi "), "2145550101|Hi");

let runs = 0;
const slow = () =>
  new Promise<boolean>((resolve) => {
    runs += 1;
    setTimeout(() => resolve(true), 20);
  });

const first = withOutboundSendGuard("a|same", slow);
const second = withOutboundSendGuard("a|same", slow);
assert.equal(first, second);
assert.equal(await first, true);
assert.equal(await second, true);
assert.equal(runs, 1);

const third = withOutboundSendGuard("a|same", slow);
assert.notEqual(third, first);
assert.equal(await third, true);
assert.equal(runs, 2);

const other = withOutboundSendGuard("b|other", async () => false);
assert.equal(await other, false);

resetOutboundSendGuard();
console.log("outbound-send-guard.test.ts ok");
