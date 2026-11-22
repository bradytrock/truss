import type { DistressSignals, LienRecord, MortgageRecord, PropertyRecord } from "@/lib/pay-at-close";

/**
 * Public property records for Pay at Close underwriting.
 *
 * Providers return a normalized `PropertyRecord`. ATTOM is the first live
 * adapter; a deterministic sample adapter answers when no key is set so the
 * panel and PDF can be exercised before a records vendor is chosen.
 */

export interface PropertyAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface PropertyRecordsProvider {
  name: string;
  live: boolean;
  lookup: (address: PropertyAddress) => Promise<PropertyRecord | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(value: unknown, path: string): unknown {
  let cursor: unknown = value;
  for (const key of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: unknown) {
  const raw = str(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function formatPropertyAddress(address: PropertyAddress) {
  const line2 = [address.city, address.state].filter(Boolean).join(", ");
  return [address.street, [line2, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ */
/* ATTOM                                                                 */
/* ------------------------------------------------------------------ */

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

async function attomGet(key: string, path: string, params: Record<string, string>) {
  const url = new URL(`${ATTOM_BASE}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, {
    headers: { apikey: key, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`ATTOM ${path} failed (${response.status}).`);
  return (await response.json()) as unknown;
}

function attomVesting(owner: Record<string, unknown>, names: string[]) {
  const joined = names.join(" ").toLowerCase();
  if (/trust/.test(joined)) return "Trust";
  if (/\bllc\b|\binc\b|\bcorp/.test(joined)) return "Entity";
  if (/estate of/.test(joined)) return "Estate";
  const corporate = str(owner.corporateindicator);
  if (corporate.toUpperCase() === "Y") return "Entity";
  return names.length > 1 ? "Joint" : names.length === 1 ? "Individual" : "";
}

function attomMortgages(property: Record<string, unknown>): MortgageRecord[] {
  const mortgage = pick(property, "mortgage");
  if (!isRecord(mortgage)) return [];
  const slots: Array<[string, number]> = [
    ["FirstConcurrent", 1],
    ["SecondConcurrent", 2],
    ["ThirdConcurrent", 3],
  ];
  const result: MortgageRecord[] = [];
  for (const [slot, position] of slots) {
    const row = mortgage[slot];
    if (!isRecord(row)) continue;
    const amount = num(pick(row, "amount")) ?? num(pick(row, "amount.amount"));
    if (!amount || amount <= 0) continue;
    const loanType = str(row.loantypecode) || str(row.loantype) || str(pick(row, "loanType"));
    const termYears = num(row.term);
    result.push({
      id: `attom_${slot.toLowerCase()}`,
      lender: str(pick(row, "lender.lastname")) || str(pick(row, "lender.fullname")) || str(row.lendername),
      originalAmount: amount,
      recordedDate: isoDate(row.date ?? row.recordingdate),
      loanType,
      interestRate: num(row.interestrate),
      termMonths: termYears && termYears > 0 ? (termYears <= 50 ? termYears * 12 : termYears) : null,
      isHeloc: /heloc|credit line|equity line|revolving/i.test(loanType) || str(row.interestratetype).toLowerCase() === "heloc",
      position,
    });
  }
  return result;
}

function attomDistress(property: Record<string, unknown>): DistressSignals {
  const foreclosure = pick(property, "foreclosure");
  const hasForeclosure = isRecord(foreclosure) && Object.keys(foreclosure).length > 0;
  return {
    noticeOfDefault: hasForeclosure,
    lisPendens: hasForeclosure && /lis pendens/i.test(str(pick(foreclosure, "documenttype"))),
    bankruptcy: false,
    taxLien: false,
    preForeclosureDate: hasForeclosure ? isoDate(pick(foreclosure, "recordingdate")) : null,
  };
}

export function parseAttomProperty(detail: unknown, avm: unknown, address: PropertyAddress): PropertyRecord | null {
  const property = pick(detail, "property");
  const first = Array.isArray(property) ? property[0] : null;
  if (!isRecord(first)) return null;
  const owner = pick(first, "owner");
  const ownerRecord = isRecord(owner) ? owner : {};
  const names = ["owner1", "owner2", "owner3", "owner4"]
    .map((slot) => str(pick(ownerRecord, `${slot}.fullname`)) || [str(pick(ownerRecord, `${slot}.firstnameandmi`)), str(pick(ownerRecord, `${slot}.lastname`))].filter(Boolean).join(" "))
    .filter(Boolean);
  const avmProperty = pick(avm, "property");
  const avmFirst = Array.isArray(avmProperty) ? avmProperty[0] : null;
  const avmAmount = isRecord(avmFirst) ? pick(avmFirst, "avm.amount") : undefined;
  const mailingSame = str(pick(ownerRecord, "absenteeownerstatus")).toUpperCase();
  const taxDelinquent = num(pick(first, "assessment.tax.taxdelinquentamt")) ?? 0;
  const liens: LienRecord[] = [];
  const delinquentYear = str(pick(first, "assessment.tax.taxdelinquentyear"));
  if (taxDelinquent > 0 && delinquentYear) {
    liens.push({
      id: "attom_tax_delinquent",
      kind: "property_tax",
      holder: "County treasurer",
      amount: taxDelinquent,
      recordedDate: null,
      source: "public_record",
      verified: false,
      notes: `Delinquent since ${delinquentYear}.`,
    });
  }
  return {
    apn: str(pick(first, "identifier.apn")) || str(pick(first, "identifier.obPropId")),
    ownerNames: names,
    vesting: attomVesting(ownerRecord, names),
    ownerOccupied: mailingSame ? mailingSame === "O" || mailingSame === "OWNER OCCUPIED" : null,
    landUse: str(pick(first, "summary.propclass")) || str(pick(first, "summary.proptype")),
    yearBuilt: num(pick(first, "summary.yearbuilt")),
    livingSqFt: num(pick(first, "building.size.universalsize")) ?? num(pick(first, "building.size.livingsize")),
    lotSqFt: num(pick(first, "lot.lotsize2")),
    beds: num(pick(first, "building.rooms.beds")),
    baths: num(pick(first, "building.rooms.bathstotal")),
    lastSaleDate: isoDate(pick(first, "sale.saleTransDate") ?? pick(first, "sale.salesearchdate")),
    lastSalePrice: num(pick(first, "sale.amount.saleamt")),
    assessedValue: num(pick(first, "assessment.assessed.assdttlvalue")),
    avmValue: num(pick(avmAmount, "value")) ?? num(pick(first, "assessment.market.mktttlvalue")),
    avmLow: num(pick(avmAmount, "low")),
    avmHigh: num(pick(avmAmount, "high")),
    avmConfidence: num(pick(avmAmount, "scr")),
    annualTax: num(pick(first, "assessment.tax.taxamt")),
    taxDelinquentAmount: liens.length ? 0 : taxDelinquent,
    mortgages: attomMortgages(first),
    liens,
    distress: attomDistress(first),
    sourceName: `ATTOM public records for ${formatPropertyAddress(address)}`,
    fetchedAt: new Date().toISOString(),
  };
}

function attomProvider(key: string): PropertyRecordsProvider {
  return {
    name: "ATTOM",
    live: true,
    async lookup(address) {
      const params = {
        address1: address.street,
        address2: [address.city, address.state, address.postalCode].filter(Boolean).join(" "),
      };
      const [detail, avm] = await Promise.all([
        attomGet(key, "property/expandedprofile", params),
        attomGet(key, "attomavm/detail", params).catch(() => null),
      ]);
      if (!detail) return null;
      return parseAttomProperty(detail, avm, address);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Sample data                                                           */
/* ------------------------------------------------------------------ */

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic sample record keyed off the address so demos stay stable. */
export function samplePropertyRecord(address: PropertyAddress, ownerHint = ""): PropertyRecord {
  const seed = hashString(formatPropertyAddress(address).toLowerCase());
  const roll = (max: number, salt: number) => (hashString(`${seed}:${salt}`) % max);
  const yearBuilt = 1958 + roll(60, 1);
  const sqft = 1300 + roll(1900, 2);
  const value = Math.round((sqft * (180 + roll(140, 3))) / 1000) * 1000;
  const purchaseYear = Math.max(yearBuilt, 2004 + roll(20, 4));
  const purchasePrice = Math.round((value * (0.55 + roll(30, 5) / 100)) / 1000) * 1000;
  const ltv = 0.7 + roll(25, 6) / 100;
  const owner = ownerHint.trim() || ["Jordan Reyes", "Casey Nguyen", "Morgan Patel", "Taylor Brooks", "Avery Kim"][roll(5, 7)]!;
  const heloc = roll(4, 8) === 0;
  const trust = roll(6, 9) === 0;
  const names = trust ? [`${owner.split(" ").at(-1)} Family Trust`] : [owner];
  const distressRoll = roll(12, 10);
  const mortgages: MortgageRecord[] = [
    {
      id: "sample_first",
      lender: ["Wells Fargo", "Rocket Mortgage", "Chase", "US Bank", "Local Credit Union"][roll(5, 11)]!,
      originalAmount: Math.round((purchasePrice * ltv) / 1000) * 1000,
      recordedDate: `${purchaseYear}-${String(1 + roll(12, 12)).padStart(2, "0")}-15`,
      loanType: "Conventional",
      interestRate: null,
      termMonths: 360,
      isHeloc: false,
      position: 1,
    },
  ];
  if (heloc) {
    mortgages.push({
      id: "sample_heloc",
      lender: "Regional Bank",
      originalAmount: 25_000 + roll(60, 13) * 1000,
      recordedDate: `${Math.min(2025, purchaseYear + 2 + roll(5, 14))}-06-01`,
      loanType: "HELOC",
      interestRate: null,
      termMonths: null,
      isHeloc: true,
      position: 2,
    });
  }
  const liens: LienRecord[] = [];
  if (distressRoll === 1) {
    liens.push({
      id: "sample_hoa",
      kind: "hoa",
      holder: "Homeowners association",
      amount: 1_200 + roll(40, 15) * 100,
      recordedDate: "2026-03-10",
      source: "public_record",
      verified: false,
      notes: "Assessment lien recorded.",
    });
  }
  const taxDelinquent = distressRoll === 2 ? 2_400 + roll(30, 16) * 100 : 0;
  return {
    apn: `${roll(900, 17) + 100}-${roll(90, 18) + 10}-${roll(900, 19) + 100}`,
    ownerNames: names,
    vesting: trust ? "Trust" : "Individual",
    ownerOccupied: roll(5, 20) !== 0,
    landUse: "Single family residence",
    yearBuilt,
    livingSqFt: sqft,
    lotSqFt: 5_000 + roll(9_000, 21),
    beds: 2 + roll(4, 22),
    baths: 1 + roll(3, 23) * 0.5 + 0.5,
    lastSaleDate: `${purchaseYear}-${String(1 + roll(12, 12)).padStart(2, "0")}-01`,
    lastSalePrice: purchasePrice,
    assessedValue: Math.round((value * 0.82) / 1000) * 1000,
    avmValue: value,
    avmLow: Math.round((value * 0.93) / 1000) * 1000,
    avmHigh: Math.round((value * 1.07) / 1000) * 1000,
    avmConfidence: 62 + roll(30, 24),
    annualTax: Math.round(value * 0.0075),
    taxDelinquentAmount: taxDelinquent,
    mortgages,
    liens,
    distress: {
      noticeOfDefault: distressRoll === 3,
      lisPendens: false,
      bankruptcy: false,
      taxLien: false,
      preForeclosureDate: distressRoll === 3 ? "2026-08-14" : null,
    },
    sourceName: "Sample property data (no records provider key set)",
    fetchedAt: new Date().toISOString(),
  };
}

function sampleProvider(): PropertyRecordsProvider {
  return {
    name: "Sample",
    live: false,
    async lookup(address) {
      return samplePropertyRecord(address);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                            */
/* ------------------------------------------------------------------ */

export function propertyRecordsProvider(): PropertyRecordsProvider {
  const attomKey = process.env.ATTOM_API_KEY?.trim();
  if (attomKey) return attomProvider(attomKey);
  return sampleProvider();
}

export function propertyRecordsConfigured() {
  return Boolean(process.env.ATTOM_API_KEY?.trim());
}

export async function lookupPropertyRecord(address: PropertyAddress) {
  const provider = propertyRecordsProvider();
  const record = await provider.lookup(address);
  return { provider: provider.name, live: provider.live, record };
}
