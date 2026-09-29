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

type FieldLike = {
  tagName?: string;
  type?: string;
  value?: string;
  checked?: boolean;
  name?: string;
  textContent?: string | null;
  closest?: (selector: string) => unknown;
};

type FieldRoot = {
  querySelectorAll: (selector: string) => Iterable<FieldLike>;
};

function tagNameOf(node: { tagName?: string } | null | undefined) {
  return node?.tagName?.toUpperCase() ?? "";
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

/** Snapshot of entered values inside a dialog or sheet. Search boxes are left out. */
export function formSignature(root: FieldRoot): string {
  const parts: string[] = [];
  for (const node of root.querySelectorAll("input, textarea, select, [contenteditable='true']")) {
    if (isCommandInput(node)) continue;
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

/** Escape should leave the surface open when the entered values no longer match the open snapshot. */
export function escapeKeepsDraft(input: {
  reason: string;
  baseline: string | null;
  current: string | null;
}): boolean {
  if (input.reason !== "escape-key") return false;
  if (input.baseline == null || input.current == null) return false;
  return input.baseline !== input.current;
}
