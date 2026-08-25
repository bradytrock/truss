export function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function xmlUnescape(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function soapTag(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "i");
  const match = pattern.exec(xml);
  if (!match) return "";
  return xmlUnescape(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

export function soapHas(xml: string, tag: string) {
  const pattern = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?/?>`, "i");
  return pattern.test(xml);
}

export function xmlAttr(xml: string, name: string) {
  const pattern = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  return pattern.exec(xml)?.[1] ?? "";
}
