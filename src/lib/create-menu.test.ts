import assert from "node:assert/strict";
import { createActionForShortcut, createMenuSections } from "./create-menu.ts";

const full = createMenuSections({ bdOnly: false });

assert.deepEqual(
  full.map((section) => section.label),
  ["Customers & jobs", "Money"],
);
assert.deepEqual(
  full[0]?.items.map((item) => [item.label, item.description, item.shortcut]),
  [
    ["New lead", "Homeowner, address, roof issue", "L"],
    ["New contact", "Adjuster, sub, supplier, referral", "C"],
    ["Schedule event", "Inspection, estimate, install day", "E"],
    ["New task", "Follow-up or to-do with a due date", "T"],
  ],
);
assert.deepEqual(
  full[1]?.items.map((item) => [item.label, item.shortcut]),
  [
    ["Log payment", "P"],
    ["Log expense", "X"],
    ["Forecast an expense", "F"],
  ],
);
assert.equal(createActionForShortcut(full, "l"), "opportunity");
assert.equal(createActionForShortcut(full, "X"), "expense");
assert.equal(createActionForShortcut(full, "k"), null);

const bd = createMenuSections({ bdOnly: true });
assert.deepEqual(
  bd.map((section) => section.id),
  ["customers"],
);
assert.deepEqual(
  bd[0]?.items.map((item) => item.label),
  ["New lead", "New contact", "New task"],
);
assert.equal(createActionForShortcut(bd, "e"), null);
assert.equal(createActionForShortcut(bd, "p"), null);
