import assert from "node:assert/strict";
import { dismissKeepsDraft, escapeDismissesOverlay, escapeKeepsDraft, formSignature, isTextEntryElement } from "./draft-escape.ts";

assert.equal(isTextEntryElement(null), false);
assert.equal(isTextEntryElement({ tagName: "input", type: "text" }), true);
assert.equal(isTextEntryElement({ tagName: "INPUT", type: "email" }), true);
assert.equal(isTextEntryElement({ tagName: "INPUT", type: "checkbox" }), false);
assert.equal(isTextEntryElement({ tagName: "INPUT", type: "hidden" }), false);
assert.equal(isTextEntryElement({ tagName: "TEXTAREA" }), true);
assert.equal(isTextEntryElement({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(isTextEntryElement({ tagName: "BUTTON" }), false);

assert.equal(
  escapeDismissesOverlay({ key: "Escape", target: { tagName: "INPUT", type: "text" } }),
  false,
);
assert.equal(escapeDismissesOverlay({ key: "Escape", target: { tagName: "BUTTON" } }), true);
assert.equal(escapeDismissesOverlay({ key: "Enter", target: { tagName: "BUTTON" } }), false);
assert.equal(
  escapeDismissesOverlay({ key: "Escape", defaultPrevented: true, target: { tagName: "BUTTON" } }),
  false,
);
assert.equal(
  escapeDismissesOverlay({
    key: "Escape",
    target: {
      tagName: "BUTTON",
      closest: (selector: string) => (selector.includes("dialog-content") ? {} : null),
    },
  }),
  false,
);

assert.equal(escapeKeepsDraft({ reason: "escape-key", baseline: "", current: "Ada" }), true);
assert.equal(escapeKeepsDraft({ reason: "escape-key", baseline: "Ada", current: "Ada" }), false);
assert.equal(escapeKeepsDraft({ reason: "outside-press", baseline: "", current: "Ada" }), false);
assert.equal(escapeKeepsDraft({ reason: "escape-key", baseline: null, current: "Ada" }), false);
assert.equal(escapeKeepsDraft({ reason: "close-press", baseline: "", current: "Ada" }), false);

assert.equal(dismissKeepsDraft({ reason: "outside-press", baseline: "", current: "Ada" }), true);
assert.equal(dismissKeepsDraft({ reason: "close-press", baseline: "", current: "Ada" }), true);
assert.equal(dismissKeepsDraft({ reason: "close-press", baseline: "Ada", current: "Ada" }), false);
assert.equal(dismissKeepsDraft({ reason: "imperative-action", baseline: "", current: "Ada" }), false);
assert.equal(dismissKeepsDraft({ reason: "none", baseline: "", current: "Ada" }), false);

const root = {
  querySelectorAll() {
    return [
      { tagName: "INPUT", type: "text", name: "first", value: "Ada", closest: () => null },
      { tagName: "INPUT", type: "hidden", name: "seed", value: "referral", closest: () => null },
      { tagName: "INPUT", type: "checkbox", name: "rush", checked: true, closest: () => null },
      { tagName: "INPUT", type: "submit", value: "Save", closest: () => null },
      {
        tagName: "INPUT",
        type: "search",
        value: "shingle",
        closest: (selector: string) => (selector.includes("command-input") ? {} : null),
      },
      { tagName: "TEXTAREA", value: "Call back", closest: () => null },
      { tagName: "DIV", textContent: "Bold line", closest: () => null },
    ];
  },
};

assert.equal(formSignature(root), "first:Ada\u0001seed:referral\u0001rush:1\u0001Call back\u0001Bold line");

const choices = {
  querySelectorAll() {
    return [
      {
        tagName: "BUTTON",
        textContent: "Residential",
        getAttribute: (name: string) => (name === "role" ? "radio" : name === "aria-checked" ? "true" : null),
        closest: () => null,
      },
      {
        tagName: "BUTTON",
        textContent: "Roofing",
        getAttribute: (name: string) => (name === "aria-pressed" ? "true" : null),
        closest: () => null,
      },
      {
        tagName: "BUTTON",
        textContent: "Referral",
        getAttribute: (name: string) => (name === "data-slot" ? "select-trigger" : null),
        closest: () => null,
      },
      {
        tagName: "BUTTON",
        getAttribute: (name: string) => (name === "data-slot" ? "checkbox" : null),
        hasAttribute: (name: string) => name === "data-checked",
        closest: () => null,
      },
    ];
  },
};
assert.equal(formSignature(choices), "Residential:1\u0001Roofing:1\u0001Referral\u00011");

const unchanged = {
  querySelectorAll() {
    return [{ tagName: "INPUT", type: "text", name: "first", value: "", closest: () => null }];
  },
};
assert.equal(
  escapeKeepsDraft({
    reason: "escape-key",
    baseline: formSignature(unchanged),
    current: formSignature(unchanged),
  }),
  false,
);
