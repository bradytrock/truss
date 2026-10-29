import type { Client } from "@/lib/types";

/**
 * Parent companies ("brands").
 *
 * "Keller Williams" and "Keller Williams Realty" are two offices of one
 * business, every eXp office is eXp Realty, and so on. A parent company is a
 * normal company on file that other companies point at through
 * parentClientId, so pipeline, jobs, and referred leads from every office can
 * be read together and ROI tracked for the whole brand.
 *
 * Everything here is pure: the HubSpot contacts import uses it to pre-fill the
 * "Group under" column, and the company page uses it to suggest a parent.
 */

/** Franchise brands whose offices show up under many local names. */
const KNOWN_BRANDS: Array<{ test: RegExp; name: string }> = [
  { test: /\bkeller\s*williams\b|\bkw\b/i, name: "Keller Williams" },
  { test: /\be?xp\s*realty\b|\bexp\s*(realty|real\s*estate)\b|^exp$/i, name: "eXp Realty" },
  { test: /\bre\s*\/?\s*max\b/i, name: "RE/MAX" },
  { test: /\bcoldwell\s*banker\b/i, name: "Coldwell Banker" },
  { test: /\bcentury\s*21\b/i, name: "Century 21" },
  { test: /\bberkshire\s*hathaway\b/i, name: "Berkshire Hathaway HomeServices" },
  { test: /\bsotheby/i, name: "Sotheby's International Realty" },
  { test: /\bcompass\b/i, name: "Compass" },
  { test: /\bredfin\b/i, name: "Redfin" },
  { test: /\bebby\s*halliday\b/i, name: "Ebby Halliday" },
  { test: /\ballie\s*beth\b/i, name: "Allie Beth Allman" },
  { test: /\bjpar\b|\bjp\s*(&|and)\s*associates\b/i, name: "JPAR" },
  { test: /\bfathom\b/i, name: "Fathom Realty" },
  { test: /\bunited\s*real\s*estate\b/i, name: "United Real Estate" },
  { test: /\bbetter\s*homes\s*(&|and)\s*gardens\b/i, name: "Better Homes and Gardens Real Estate" },
  { test: /\bweichert\b/i, name: "Weichert" },
  { test: /\bhoward\s*hanna\b/i, name: "Howard Hanna" },
  { test: /\bexit\s*realty\b/i, name: "EXIT Realty" },
  { test: /\brealty\s*one\s*group\b/i, name: "Realty ONE Group" },
  { test: /\bhomesmart\b/i, name: "HomeSmart" },
  { test: /\bdouglas\s*elliman\b/i, name: "Douglas Elliman" },
  { test: /\bengel\s*(&|and)\s*v[oö]lkers\b/i, name: "Engel & Völkers" },
  { test: /\bmonument\s*realty\b/i, name: "Monument Realty" },
  { test: /\brogers\s*healy\b/i, name: "Rogers Healy" },
  { test: /\bstate\s*farm\b/i, name: "State Farm" },
  { test: /\ballstate\b/i, name: "Allstate" },
  { test: /\bfarmers\s+(insurance|agency|agent)/i, name: "Farmers Insurance" },
  { test: /\busaa\b/i, name: "USAA" },
  { test: /\bliberty\s*mutual\b/i, name: "Liberty Mutual" },
  { test: /\btravelers\s+(insurance|companies|indemnity)/i, name: "Travelers" },
  { test: /\bnationwide\s+(insurance|mutual)/i, name: "Nationwide" },
  { test: /\bprogressive\s+insurance/i, name: "Progressive" },
  { test: /\bgeico\b/i, name: "GEICO" },
  { test: /\bamerican\s*family\b|\bamfam\b/i, name: "American Family Insurance" },
  { test: /\bgoosehead\b/i, name: "Goosehead Insurance" },
];

/** The franchise brand a company name belongs to, if it is one we know. */
export function knownBrand(name: string): string | null {
  const text = name.trim();
  if (!text) return null;
  for (const brand of KNOWN_BRANDS) {
    if (brand.test.test(text)) return brand.name;
  }
  return null;
}

const LEGAL_SUFFIXES = new Set(["llc", "l l c", "inc", "incorporated", "co", "corp", "corporation", "ltd", "lp", "llp", "pllc", "pc", "pa"]);

const GENERIC_TAILS = new Set([
  "realty",
  "real estate",
  "realtors",
  "realtor",
  "brokerage",
  "brokers",
  "group",
  "team",
  "insurance",
  "agency",
  "agencies",
  "properties",
  "homes",
  "home services",
  "homeservices",
  "and associates",
  "associates",
  "partners",
  "company",
  "companies",
  "services",
  "office",
  "offices",
]);

/** Same lookup key the import uses for "already on file by name". */
export function companyNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Collapse a company name to the brand it most likely belongs to:
 * "Keller Williams Realty - Plano" → "keller williams",
 * "EXP Realty, LLC" → "exp", "Compass Real Estate" → "compass".
 */
export function companyBrandKey(name: string) {
  let text = name.toLowerCase();
  // Local qualifiers: "Fathom Realty - Frisco", "RE/MAX (Dallas)", "Ebby Halliday of Plano".
  text = text.split(/\s[-–—|:]\s|\(/)[0] ?? text;
  text = text.replace(/\s+(of|at|in)\s+.+$/, "");
  text = text.replace(/[^a-z0-9]+/g, " ").trim();
  if (!text) return "";
  let words = text.split(" ");
  let changed = true;
  while (changed && words.length > 1) {
    changed = false;
    for (let size = 2; size >= 1; size--) {
      if (words.length - size < 1) continue;
      const tail = words.slice(-size).join(" ");
      if (LEGAL_SUFFIXES.has(tail) || GENERIC_TAILS.has(tail)) {
        words = words.slice(0, -size);
        changed = true;
        break;
      }
    }
  }
  return words.join(" ");
}

function cleanName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

/** The words two office names share from the front: "Fathom Realty Frisco" + "Fathom Realty Plano" → "Fathom Realty". */
function commonWordPrefix(names: string[]) {
  if (names.length === 0) return "";
  const split = names.map((name) => cleanName(name).split(" "));
  const first = split[0] ?? [];
  let count = 0;
  while (count < first.length && split.every((words) => words[count]?.toLowerCase() === first[count]?.toLowerCase())) {
    count += 1;
  }
  return first.slice(0, count).join(" ");
}

function stripLegalSuffix(name: string) {
  const words = cleanName(name).split(" ");
  while (words.length > 1) {
    const tail = words[words.length - 1]!.toLowerCase().replace(/[^a-z]/g, "");
    if (LEGAL_SUFFIXES.has(tail)) words.pop();
    else break;
  }
  return words.join(" ").replace(/[,]+$/, "").trim();
}

export type CompanyGroupSuggestion = {
  /** Display name of the parent company (an existing one on file when it matches). */
  parentName: string;
  /** Existing company on file that is the parent, when there is one. */
  existingParentId: string | null;
  /** Names from the input that roll up under this parent. */
  members: string[];
  /** True when this came from the franchise list rather than name similarity. */
  known: boolean;
};

/**
 * Suggest a parent company for each name. A name gets a parent when it is a
 * known franchise brand, when two or more names collapse to the same brand,
 * when one name is a word-prefix of another, or when a company already on file
 * shares the brand. Names that stand alone get no suggestion.
 */
export function suggestCompanyGroups(names: string[], clients: Client[] = []): Map<string, CompanyGroupSuggestion> {
  const distinct = [...new Set(names.map(cleanName).filter(Boolean))];
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const clientsByNameKey = new Map<string, Client>();
  const clientsByBrand = new Map<string, Client[]>();
  for (const client of clients) {
    const nameKey = companyNameKey(client.name);
    if (nameKey && !clientsByNameKey.has(nameKey)) clientsByNameKey.set(nameKey, client);
    const brand = knownBrand(client.name) ? companyBrandKey(knownBrand(client.name)!) : companyBrandKey(client.name);
    if (!brand) continue;
    const list = clientsByBrand.get(brand) ?? [];
    list.push(client);
    clientsByBrand.set(brand, list);
  }

  // Bucket by brand key. Known brands collapse to the canonical brand's key.
  const buckets = new Map<string, { members: string[]; known: string | null }>();
  for (const name of distinct) {
    const known = knownBrand(name);
    const key = known ? companyBrandKey(known) : companyBrandKey(name);
    if (!key) continue;
    const bucket = buckets.get(key) ?? { members: [], known: null };
    bucket.members.push(name);
    if (known) bucket.known = known;
    buckets.set(key, bucket);
  }

  // A short brand key that starts a longer one owns it: "ebby halliday" ← "ebby halliday realtors frisco".
  const keys = [...buckets.keys()].sort((left, right) => left.length - right.length || left.localeCompare(right));
  for (let i = 0; i < keys.length; i++) {
    const short = keys[i]!;
    if (short.length < 4 || !buckets.has(short)) continue;
    for (let j = i + 1; j < keys.length; j++) {
      const long = keys[j]!;
      if (!buckets.has(long) || long === short || !long.startsWith(`${short} `)) continue;
      const from = buckets.get(long)!;
      const into = buckets.get(short)!;
      into.members.push(...from.members);
      if (!into.known && from.known) into.known = from.known;
      buckets.delete(long);
    }
  }

  // Offices named "<brand> <town>": "Blue Door Realty Frisco" and "Blue Door
  // Realty Plano" share "Blue Door Realty". Only merge when the shared words end
  // in a business word (Realty, Insurance, Group…) so "North Texas Roofing" and
  // "North Texas Adjusters" stay apart.
  const unknownKeys = [...buckets.keys()].filter((key) => !buckets.get(key)?.known);
  for (let i = 0; i < unknownKeys.length; i++) {
    const left = unknownKeys[i]!;
    if (!buckets.has(left)) continue;
    for (let j = i + 1; j < unknownKeys.length; j++) {
      const right = unknownKeys[j]!;
      if (!buckets.has(right) || !buckets.has(left)) continue;
      const leftBucket = buckets.get(left)!;
      const rightBucket = buckets.get(right)!;
      const prefix = commonWordPrefix([...leftBucket.members, ...rightBucket.members]);
      const prefixWords = prefix ? prefix.split(" ").length : 0;
      const merged = companyBrandKey(prefix);
      if (prefixWords < 2 || !merged || merged.split(" ").length >= prefixWords) continue;
      const target = buckets.get(merged) ?? { members: [], known: null };
      for (const source of [leftBucket, rightBucket]) {
        for (const member of source.members) {
          if (!target.members.includes(member)) target.members.push(member);
        }
      }
      buckets.delete(left);
      buckets.delete(right);
      buckets.set(merged, target);
      if (!unknownKeys.includes(merged)) unknownKeys.push(merged);
      break;
    }
  }

  const result = new Map<string, CompanyGroupSuggestion>();
  for (const [key, bucket] of buckets) {
    const onFile = clientsByBrand.get(key) ?? [];
    // An office already under a parent tells us the parent for its siblings.
    const linkedParent = onFile
      .map((client) => (client.parentClientId ? clientsById.get(client.parentClientId) : undefined))
      .find((parent): parent is Client => Boolean(parent));
    const standalone = bucket.members.length < 2 && !bucket.known && onFile.length === 0;
    if (standalone) continue;
    if (bucket.members.length < 2 && !bucket.known && !linkedParent) {
      // One name in the file, one sibling on file: only group when they differ,
      // otherwise this is the same company and the import simply reuses it.
      const nameKey = companyNameKey(bucket.members[0]!);
      if (onFile.every((client) => companyNameKey(client.name) === nameKey)) continue;
    }

    let parentName = "";
    let existingParentId: string | null = null;
    if (linkedParent) {
      parentName = linkedParent.name;
      existingParentId = linkedParent.id;
    } else {
      if (bucket.known) {
        parentName = bucket.known;
      } else {
        const candidates = [...onFile.map((client) => client.name), ...bucket.members];
        const prefix = commonWordPrefix(candidates);
        const shortest = [...candidates].sort((left, right) => left.length - right.length)[0] ?? "";
        parentName = stripLegalSuffix(prefix && companyBrandKey(prefix) === key ? prefix : shortest);
      }
      // The brand is already a company on file: reuse it rather than adding a second one.
      const existing = clientsByNameKey.get(companyNameKey(parentName));
      if (existing) {
        parentName = existing.name;
        existingParentId = existing.id;
      }
    }
    if (!parentName) continue;
    // A member that is the brand itself is the parent, not an office under it,
    // and its spelling wins so the import creates one company, not two.
    const parentKey = companyNameKey(parentName);
    const self = bucket.members.find((member) => companyNameKey(member) === parentKey);
    if (self && !existingParentId) parentName = self;
    const members = bucket.members.filter((member) => companyNameKey(member) !== parentKey);
    if (members.length === 0) continue;
    const suggestion: CompanyGroupSuggestion = {
      parentName,
      existingParentId,
      members,
      known: Boolean(bucket.known),
    };
    for (const member of members) result.set(member, suggestion);
  }
  return result;
}

/** Companies that point at this one, one level down. */
export function childCompanies(clients: Client[], parentId: string) {
  return clients.filter((client) => client.parentClientId === parentId);
}

/** The company plus every office under it, so stats can roll up. */
export function companyFamily(clients: Client[], rootId: string): Client[] {
  const byParent = new Map<string, Client[]>();
  for (const client of clients) {
    if (!client.parentClientId) continue;
    const list = byParent.get(client.parentClientId) ?? [];
    list.push(client);
    byParent.set(client.parentClientId, list);
  }
  const root = clients.find((client) => client.id === rootId);
  if (!root) return [];
  const seen = new Set<string>([root.id]);
  const out: Client[] = [root];
  const queue = [root.id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of byParent.get(current) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      out.push(child);
      queue.push(child.id);
    }
  }
  return out;
}

/** Companies that can be picked as this one's parent without making a loop. */
export function parentCandidates(clients: Client[], clientId: string) {
  const family = new Set(companyFamily(clients, clientId).map((client) => client.id));
  return clients
    .filter((client) => !family.has(client.id))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}
