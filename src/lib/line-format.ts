export type InlineRun = { text: string; bold?: boolean };

export type FormatBlock =
  | { type: "p"; runs: InlineRun[] }
  | { type: "li"; ordered?: boolean; runs: InlineRun[] };

const ALLOWED_TAGS = new Set(["p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "div", "span"]);
const BLOCK_TAGS = new Set(["p", "div", "ul", "ol", "li"]);

function looksLikeHtml(value: string) {
  return /<\/?(?:p|br|ul|ol|li|strong|b|em|i|div|span)\b/i.test(value);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function mergeRuns(runs: InlineRun[]): InlineRun[] {
  const merged: InlineRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const prev = merged[merged.length - 1];
    if (prev && Boolean(prev.bold) === Boolean(run.bold)) {
      prev.text += run.text;
    } else {
      merged.push(run.bold ? { text: run.text, bold: true } : { text: run.text });
    }
  }
  return merged;
}

function parseInlineMarkdown(value: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const source = value.replace(/\r\n/g, "\n");
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    if (match.index > last) runs.push({ text: source.slice(last, match.index) });
    runs.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < source.length) runs.push({ text: source.slice(last) });
  return mergeRuns(runs.filter((run) => run.text));
}

function parseMarkdownLite(text: string): FormatBlock[] {
  const blocks: FormatBlock[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = line.match(/^\s*(?:[-*•]|(?:\d+[.)]))\s+(.*)$/);
    if (bullet) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      blocks.push({ type: "li", ordered, runs: parseInlineMarkdown(bullet[1]) });
      continue;
    }
    if (!line.trim()) continue;
    blocks.push({ type: "p", runs: parseInlineMarkdown(line) });
  }
  return blocks;
}

function promoteBoldSpans(html: string) {
  return html.replace(
    /<span\b([^>]*)>([\s\S]*?)<\/span>/gi,
    (full, attrs: string, inner: string) => {
      if (/font-weight\s*:\s*(bold|[7-9]00)/i.test(attrs)) {
        return `<strong>${inner}</strong>`;
      }
      return inner;
    },
  );
}

function sanitizeLineHtml(html: string) {
  let value = String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  value = promoteBoldSpans(value);
  value = value.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (full, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(name) || name === "span") return "";
    if (name === "br") return "<br>";
    if (full.startsWith("</")) return `</${name}>`;
    return `<${name}>`;
  });
  return value;
}

type HtmlToken =
  | { type: "text"; value: string }
  | { type: "open"; name: string }
  | { type: "close"; name: string };

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match.index > last) tokens.push({ type: "text", value: html.slice(last, match.index) });
    const name = match[1].toLowerCase();
    if (name === "br") {
      tokens.push({ type: "open", name: "br" });
    } else if (match[0].startsWith("</")) {
      tokens.push({ type: "close", name });
    } else {
      tokens.push({ type: "open", name });
    }
    last = match.index + match[0].length;
  }
  if (last < html.length) tokens.push({ type: "text", value: html.slice(last) });
  return tokens;
}

function parseHtml(html: string): FormatBlock[] {
  const tokens = tokenizeHtml(sanitizeLineHtml(html));
  const blocks: FormatBlock[] = [];
  let current: InlineRun[] = [];
  let bold = 0;
  let listOrdered = false;
  let inListItem = false;

  function pushRun(text: string) {
    if (!text) return;
    current.push(bold > 0 ? { text, bold: true } : { text });
  }

  function flushParagraph() {
    const runs = mergeRuns(current);
    current = [];
    if (!runs.some((run) => run.text.replace(/\s+/g, ""))) return;
    blocks.push({ type: "p", runs });
  }

  function flushListItem() {
    const runs = mergeRuns(current);
    current = [];
    if (!runs.some((run) => run.text.replace(/\s+/g, ""))) {
      inListItem = false;
      return;
    }
    blocks.push({ type: "li", ordered: listOrdered, runs });
    inListItem = false;
  }

  for (const token of tokens) {
    if (token.type === "text") {
      pushRun(decodeEntities(token.value.replace(/\u00a0/g, " ")));
      continue;
    }
    if (token.type === "open") {
      if (token.name === "strong" || token.name === "b") bold += 1;
      else if (token.name === "br") pushRun("\n");
      else if (token.name === "ul") {
        if (inListItem) flushListItem();
        else flushParagraph();
        listOrdered = false;
      } else if (token.name === "ol") {
        if (inListItem) flushListItem();
        else flushParagraph();
        listOrdered = true;
      } else if (token.name === "li") {
        flushParagraph();
        inListItem = true;
      } else if (BLOCK_TAGS.has(token.name)) {
        if (inListItem) flushListItem();
        else flushParagraph();
      }
      continue;
    }
    if (token.name === "strong" || token.name === "b") bold = Math.max(0, bold - 1);
    else if (token.name === "li") flushListItem();
    else if (token.name === "ul" || token.name === "ol") {
      if (inListItem) flushListItem();
      else flushParagraph();
    } else if (BLOCK_TAGS.has(token.name)) {
      if (inListItem) flushListItem();
      else flushParagraph();
    }
  }
  if (inListItem) flushListItem();
  else flushParagraph();
  return blocks;
}

export function parseLineFormat(input: string): FormatBlock[] {
  const text = String(input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];
  return looksLikeHtml(text) ? parseHtml(text) : parseMarkdownLite(text);
}

function runsToHtml(runs: InlineRun[]) {
  return runs
    .map((run) => {
      const text = escapeHtml(run.text).replace(/\n/g, "<br>");
      return run.bold ? `<strong>${text}</strong>` : text;
    })
    .join("");
}

export function blocksToHtml(blocks: FormatBlock[]) {
  const parts: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) {
      parts.push(`</${list}>`);
      list = null;
    }
  };
  for (const block of blocks) {
    if (block.type === "li") {
      const tag = block.ordered ? "ol" : "ul";
      if (list !== tag) {
        closeList();
        parts.push(`<${tag}>`);
        list = tag;
      }
      parts.push(`<li>${runsToHtml(block.runs)}</li>`);
      continue;
    }
    closeList();
    parts.push(`<p>${runsToHtml(block.runs)}</p>`);
  }
  closeList();
  return parts.join("");
}

function runsToMarkdown(runs: InlineRun[]) {
  return runs.map((run) => (run.bold ? `**${run.text}**` : run.text)).join("");
}

export function blocksToMarkdown(blocks: FormatBlock[]) {
  return blocks
    .map((block) => {
      const inline = runsToMarkdown(block.runs).replace(/\n+/g, " ").trim();
      if (block.type === "li") return block.ordered ? `1. ${inline}` : `- ${inline}`;
      return inline;
    })
    .join("\n");
}

export function lineTextToSafeHtml(input: string) {
  return blocksToHtml(parseLineFormat(input));
}

export function linePlainText(input: string) {
  return parseLineFormat(input)
    .map((block) => block.runs.map((run) => run.text).join(""))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function firstPlainLine(input: string) {
  const [first] = linePlainText(input).split("\n");
  return first?.trim() ?? "";
}

export function lineHeading(line: { title?: string | null; description?: string | null }) {
  const title = String(line.title ?? "").trim();
  if (title) return title;
  return firstPlainLine(String(line.description ?? "")) || "Item";
}

function formatProposalQuantity(value: number) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

/** Client-facing line label: "Architectural shingles · 32 sq". Drops 1 LS / 1 EA. */
export function proposalLineSummary(line: {
  title?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
}) {
  const title = lineHeading(line);
  const qty = Number(line.quantity);
  const unit = String(line.unit ?? "").trim();
  if (!Number.isFinite(qty) || qty <= 0) return title;
  const lump = qty === 1 && /^(ls|ea)$/i.test(unit);
  if (lump) return title;
  const qtyLabel = formatProposalQuantity(qty);
  return unit ? `${title} · ${qtyLabel} ${unit}` : `${title} · ${qtyLabel}`;
}

export function shouldShowLineDescription(line: { title?: string | null; description?: string | null }) {
  const title = String(line.title ?? "").trim();
  const description = String(line.description ?? "").trim();
  if (!description) return false;
  const plain = linePlainText(description);
  if (!plain) return false;
  return !title || plain !== title;
}

export function invoiceLineDescription(line: { title?: string | null; description?: string | null }) {
  const title = String(line.title ?? "").trim();
  const description = String(line.description ?? "").trim();
  if (title && description && linePlainText(description) !== title) {
    return `${title}\n\n${description}`;
  }
  return title || description || "Item";
}

export function storageToEditorHtml(storage: string) {
  return lineTextToSafeHtml(storage);
}

export function editorHtmlToStorage(html: string) {
  const markdown = blocksToMarkdown(parseLineFormat(html)).trim();
  return markdown;
}
