import assert from "node:assert/strict";
import { isTransientRequestError, limitBookQuery } from "./load-book.ts";

assert.equal(isTransientRequestError({ message: "TypeError: Failed to fetch" }), true);
assert.equal(isTransientRequestError({ message: "Could not find the table public.messages" }), false);
assert.equal(
  isTransientRequestError({
    code: "PGRST003",
    message: "Timed out acquiring connection from connection pool.",
  }),
  true,
);
assert.equal(isTransientRequestError(null), false);

async function main() {
  let active = 0;
  let max = 0;
  await Promise.all(
    Array.from({ length: 12 }, () =>
      limitBookQuery(async () => {
        active += 1;
        max = Math.max(max, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
        return true;
      }),
    ),
  );
  assert.equal(active, 0);
  assert.ok(max > 1 && max <= 4, `expected at most 4 book queries at once, saw ${max}`);

  console.log("load-book.test.ts ok");
}

void main();
