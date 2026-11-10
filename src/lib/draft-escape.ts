const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

const USER_DISMISS_REASONS = new Set(["escape-key", "outside-press", "close-press"]);

type FieldLike = {
  tagName?: string;
  type?: string;
  value?: string;
  checked?: boolean;
  name?: string;
  textContent?: string | null;
  closest?: (selector: string) => unknown;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
};

type FieldRoot = {
  querySelectorAll: (selector: string) => Iterable<FieldLike>;
};

function tagNameOf(node: { tagName?: string } | null | undefined) {
  return node?.tagName?.toUpperCase() ?? "";
}

function attr(node: FieldLike, name: string) {
  if (typeof node.getAttribute !== "function") return null;
  return node.getAttribute(name);
}

function collapsed(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function controlOn(node: FieldLike) {
  if (typeof node.hasAttribute === "function" && node.hasAttribute("data-checked")) return true;
  return attr(node, "aria-checked") === "true" || attr(node, "aria-pressed") === "true";
}

/** True when the node is a control the user is typing into. */
export function isTextEntryElement(node: EventTarget | null | undefined): boolean {
  if (!node || typeof node !== "object") return false;
  const el = node as { tagName?: string; isContentEditable?: boolean; type?: string };
  if (el.isContentEditable) return true;
  const tag = tagNameOf(el);
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (el.type || "text").toLowerCase();
  return !NON_TEXT_INPUT_TYPES.has(type);
}

/**
 * Escape may dismiss a window or panel. It must not while a text field is focused,
 * and it must not steal the key from a dialog, sheet, or menu that is already open.
 */
export function escapeDismissesOverlay(event: {
  key: string;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  if (isTextEntryElement(event.target)) return false;
  const target = event.target;
  if (target && typeof target === "object" && "closest" in target) {
    const closest = (target as { closest?: (selector: string) => unknown }).closest;
    if (typeof closest === "function" && closest.call(target, "[data-slot='dialog-content'], [data-slot='sheet-content'], [data-slot='popover-content'], [data-slot='select-content']")) {
      return false;
    }
  }
  return true;
}

function isCommandInput(node: FieldLike) {
  return Boolean(node.closest?.("[data-slot='command-input']"));
}

const FIELD_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-slot='select-trigger']",
  "[data-slot='checkbox']",
  "[data-slot='switch']",
  "[role='radio']",
  "[aria-pressed]",
].join(", ");

/** Snapshot of entered values inside a dialog or sheet. Search boxes are left out. */
export function formSignature(root: FieldRoot): string {
  const parts: string[] = [];
  for (const node of root.querySelectorAll(FIELD_SELECTOR)) {
    if (isCommandInput(node)) continue;
    const slot = attr(node, "data-slot");
    if (slot === "select-trigger") {
      parts.push(collapsed(node.textContent));
      continue;
    }
    if (slot === "checkbox" || slot === "switch") {
      parts.push(controlOn(node) ? "1" : "0");
      continue;
    }
    if (attr(node, "role") === "radio") {
      parts.push(`${collapsed(node.textContent)}:${controlOn(node) ? "1" : "0"}`);
      continue;
    }
    const pressed = attr(node, "aria-pressed");
    if (pressed === "true" || pressed === "false") {
      parts.push(`${collapsed(node.textContent)}:${pressed === "true" ? "1" : "0"}`);
      continue;
    }
    const tag = tagNameOf(node);
    if (tag === "INPUT") {
      const type = (node.type || "text").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset" || type === "file" || type === "image") {
        continue;
      }
      if (type === "checkbox" || type === "radio") {
        parts.push(`${node.name ?? ""}:${node.checked ? "1" : "0"}`);
        continue;
      }
      parts.push(`${node.name ?? ""}:${node.value ?? ""}`);
      continue;
    }
    if (tag === "TEXTAREA" || tag === "SELECT") {
      parts.push(node.value ?? "");
      continue;
    }
    parts.push(node.textContent ?? "");
  }
  return parts.join("\u0001");
}

/** True when a dismiss would throw away typed values. */
export function draftIsDirty(baseline: string | null, current: string | null) {
  if (baseline == null || current == null) return false;
  return baseline !== current;
}

/** Close button, backdrop, and Escape should stay open when the draft changed. */
export function isUserDismiss(reason: string) {
  return USER_DISMISS_REASONS.has(reason);
}

export function dismissKeepsDraft(input: {
  reason: string;
  baseline: string | null;
  current: string | null;
}): boolean {
  if (!isUserDismiss(input.reason)) return false;
  return draftIsDirty(input.baseline, input.current);
}

/** Escape should leave the surface open when the entered values no longer match the open snapshot. */
export function escapeKeepsDraft(input: {
  reason: string;
  baseline: string | null;
  current: string | null;
}): boolean {
  return input.reason === "escape-key" && draftIsDirty(input.baseline, input.current);
}
