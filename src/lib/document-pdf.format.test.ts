import assert from "node:assert/strict";
import { extractText, extractTextItems } from "unpdf";
import { getDocument, OPS } from "unpdf/pdfjs";
import { buildEstimatePdf, buildInvoicePdf } from "./document-pdf.ts";
import type { CompanySettings, Estimate, EstimateLine, Invoice, InvoiceLine } from "./types.ts";

const company: CompanySettings = {
  name: "T Rock Roofing",
  slug: "t-rock",
  phone: "2145550100",
  email: "office@example.com",
  website: "",
  street: "1 Main",
  city: "Dallas",
  state: "TX",
  postalCode: "75000",
  licenseNumber: "",
};

const estimate = {
  id: "est_format",
  number: "EST-FORMAT",
  name: "9174 Shadowridge",
  clientId: null,
  opportunityId: null,
  jobId: null,
  contactId: null,
  secondContactId: null,
  status: "draft",
  notes: "",
  validUntil: "2026-10-14",
  sentAt: null,
  acceptedAt: null,
  secondAcceptedAt: null,
  ownerSignedAt: null,
  ownerSignedName: "",
  createdAt: "2026-09-14",
  taxRate: 0,
  discountKind: "percent",
  discountValue: 0,
  depositKind: "percent",
  depositValue: 0,
  intro: "",
  terms: "",
  street: "9174 Shadowridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
  shareToken: "share",
  secondShareToken: "share2",
  signatureName: "",
  signatureImage: "",
  secondSignatureName: "",
  secondSignatureImage: "",
  packageMode: "",
  selectedPackage: "good",
  marginPercent: 0,
  subtotalOverride: null,
  hideLinePrices: false,
} as Estimate;

const description = [
  "Your new roof will be a complete **TAMKO Heritage** system.",
  "- Tear-off to the decking",
  "- Synthetic underlayment",
  "- Hip and ridge shingles",
].join("\n");

const lines: EstimateLine[] = [
  {
    id: "line_1",
    estimateId: estimate.id,
    catalogItemId: null,
    title: "Roofing System",
    description,
    quantity: 1,
    unit: "LS",
    unitCost: 0,
    sortOrder: 0,
    groupName: "Scope of work",
    optional: false,
    selected: true,
    taxable: true,
    package: "",
    photoIds: [],
  },
];

const invoice: Invoice = {
  id: "inv_format",
  number: "INV-FORMAT",
  name: "9174 Shadowridge",
  clientId: null,
  jobId: null,
  estimateId: estimate.id,
  status: "draft",
  issuedAt: "2026-09-14",
  dueAt: "2026-10-14",
  notes: "",
  terms: "",
  shareToken: "invshare",
  qbStatus: "unsent",
};

const invoiceLines: InvoiceLine[] = [
  {
    id: "iline_1",
    invoiceId: invoice.id,
    description: `Roofing System\n\n${description}`,
    quantity: 1,
    unit: "LS",
    unitCost: 18450,
    sortOrder: 0,
  },
];

async function pagesFromPdf(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const extracted = await extractText(buffer);
  return Array.isArray(extracted.text) ? extracted.text : [extracted.text];
}

async function textFromPdf(blob: Blob) {
  return (await pagesFromPdf(blob)).join("\n");
}

type PdfItem = { str: string; x: number; y: number; width: number; height: number };

async function itemsFromPdf(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  const extracted = await extractTextItems(buffer);
  return extracted.items as PdfItem[][];
}

function pageText(items: PdfItem[]) {
  return items.map((item) => item.str).join(" ");
}

function assertClearOfFooter(items: PdfItem[][]) {
  for (const [index, page] of items.entries()) {
    for (const item of page) {
      if (item.height <= 0 || !item.str.trim() || item.y >= 40) continue;
      assert.match(
        item.str,
        /Page \d+ of \d+|T Rock|Roofing|Dallas|office@|469|214/,
        `page ${index + 1} text sits in the footer: ${item.str}`,
      );
    }
  }
}

async function assertStreetClearsHeaderRule(blob: Blob, street: string) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const text = await page.getTextContent();
  const streetItem = text.items.find((item) => "str" in item && item.str.includes(street));
  assert.ok(streetItem && "transform" in streetItem, `missing street ${street}`);
  const baseline = streetItem.transform[5];
  const ops = await page.getOperatorList();
  const rules = ops.fnArray.flatMap((fn, index) => {
    if (fn !== OPS.constructPath) return [];
    const path = ops.argsArray[index]?.[1];
    const chunks = Array.isArray(path) ? path : [path];
    const points = chunks.flatMap((chunk) => Array.from(chunk ?? []));
    const ys = points.filter((_, i) => i % 3 === 2);
    const xs = points.filter((_, i) => i % 3 === 1);
    if (ys.length < 2 || xs.length < 2) return [];
    const y = ys[0];
    if (!ys.every((value) => value === y)) return [];
    if (Math.max(...xs) - Math.min(...xs) < 400) return [];
    return [y];
  });
  const rule = rules.find((y) => y > baseline && y - baseline < 40);
  assert.ok(rule, `header rule should sit just above ${street}`);
  assert.ok(rule - baseline >= 15, `header rule cuts the street (gap ${rule - baseline})`);
}

async function main() {
  const estimatePdf = await buildEstimatePdf({
    estimate,
    lines,
    company,
    customer: "Shawn Gregory",
    customerPhone: "4695550142",
    customerEmail: "shawn@example.com",
    jobCode: "JH091426-A",
  });
  await assertStreetClearsHeaderRule(estimatePdf, "9174 Shadowridge Drive");
  const estimateText = await textFromPdf(estimatePdf);
  assert.match(estimateText, /ESTIMATE/);
  assert.match(estimateText, /PREPARED FOR/i);
  assert.match(estimateText, /Shawn Gregory/);
  assert.match(estimateText, /\(469\) 555-0142/);
  assert.match(estimateText, /shawn@example.com/);
  assert.match(estimateText, /9174 Shadowridge Drive/);
  assert.match(estimateText, /Roofing System/);
  assert.match(estimateText, /TAMKO Heritage/);
  assert.match(estimateText, /Tear-off to the decking/);
  assert.match(estimateText, /Synthetic underlayment/);
  assert.match(estimateText, /Hip and ridge shingles/);
  assert.match(estimateText, /TOTAL/);
  assert.match(estimateText, /AUTHORIZATION/);
  assert.doesNotMatch(estimateText, /Margin/);
  assert.doesNotMatch(estimateText, /\bLS\b/);

  const markedUp = await textFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, marginPercent: 20 },
      lines: [{ ...lines[0]!, unitCost: 1000, title: "Tear-off", unit: "sq" }],
      company,
      customer: "Shawn Gregory",
    }),
  );
  assert.doesNotMatch(markedUp, /Margin/);
  assert.match(markedUp, /\$1,200\.00/);
  assert.match(markedUp, /\bsq\b/);
  assert.doesNotMatch(markedUp, /\bLS\b/);

  const gbbText = await textFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, packageMode: "gbb", selectedPackage: "better", number: "EST-GBB" },
      lines: [
        { ...lines[0]!, id: "shared", title: "Tear-off", description: "", package: "", unitCost: 2000 },
        { ...lines[0]!, id: "good", title: "3-tab shingles", description: "", package: "good", groupName: "Good", unitCost: 4000 },
        { ...lines[0]!, id: "better", title: "Architectural shingles", description: "", package: "better", groupName: "Better", unitCost: 6000 },
        { ...lines[0]!, id: "best", title: "Designer shingles", description: "", package: "best", groupName: "Best", unitCost: 8000 },
      ],
      company,
      customer: "Shawn Gregory",
    }),
  );
  assert.match(gbbText, /Included in every option/i);
  assert.match(gbbText, /GOOD/);
  assert.match(gbbText, /BETTER/);
  assert.match(gbbText, /BEST/);
  assert.match(gbbText, /Tear-off/);
  assert.match(gbbText, /3-tab shingles/);
  assert.match(gbbText, /Architectural shingles/);
  assert.match(gbbText, /Designer shingles/);
  assert.match(gbbText, /Please choose the option you prefer/);
  assert.doesNotMatch(gbbText, /do not stack/);
  assert.doesNotMatch(gbbText, /This proposal is/);

  const invoiceText = await textFromPdf(
    await buildInvoicePdf({
      invoice,
      lines: invoiceLines,
      payments: [],
      company,
      customer: "Shawn Gregory",
    }),
  );
  assert.match(invoiceText, /INVOICE/);
  assert.match(invoiceText, /BILL TO/i);
  assert.match(invoiceText, /BALANCE DUE/);
  assert.match(invoiceText, /Roofing System/);
  assert.match(invoiceText, /TAMKO Heritage/);
  assert.match(invoiceText, /Tear-off to the decking/);
  assert.doesNotMatch(invoiceText, /\bLS\b/);
  assert.doesNotMatch(invoiceText, /PROJECT MANAGER/, "no manager column without a manager");
  assert.doesNotMatch(invoiceText, /PROJECT ADDRESS/, "no project address column without a site");

  const templatePages = await itemsFromPdf(
    await buildInvoicePdf({
      invoice: { ...invoice, number: "INV-1026", issuedAt: "2026-11-23", dueAt: "2026-12-23" },
      lines: [
        {
          ...invoiceLines[0]!,
          description: "Contract amount\n\nPer signed contract · Job BJ091426-A",
          unitCost: 22428.55,
        },
        { ...invoiceLines[0]!, id: "iline_2", description: "Additional siding repairs", unitCost: 350.45, sortOrder: 1 },
      ],
      payments: [],
      company: {
        ...company,
        name: "T Rock Roofing & Contracting",
        website: "DallasRoofer.com",
        street: "3001 Long Prairie Road, Suite 100",
        city: "Flower Mound",
        state: "TX",
        postalCode: "75022",
        phone: "4697947701",
      },
      customer: "Leonardo — 1825 Brook Lane",
      homeowners: [
        { name: "Anthony Leonardo", phone: "4695550142", email: "anthony@example.com" },
        { name: "Maria Leonardo", phone: "4695550199", email: "maria@example.com" },
      ],
      projectManager: {
        name: "Brady Jones",
        title: "Project Manager",
        phone: "4697947701",
        email: "bjones@trockcontracting.com",
      },
      jobCode: "BJ091426-A",
      site: { street: "1825 Brook Lane", city: "Flower Mound", state: "TX", postalCode: "75028" },
    }),
  );
  const templateFront = pageText(templatePages[0]!);
  assert.match(templateFront, /Maria Leonardo/);
  assert.match(templateFront, /\(469\) 555-0142/);
  assert.match(templateFront, /\(469\) 555-0199/);
  assert.match(templateFront, /anthony@example\.com/);
  assert.match(templateFront, /maria@example\.com/);
  assert.doesNotMatch(templateFront, /Leonardo — 1825|Leonardo - 1825/, "homeowners replace the lead label");
  const billToItems = templatePages[0]!.filter((item) =>
    /^(BILL TO|Anthony Leonardo|\(469\) 555-0142|anthony@example\.com|Maria Leonardo|\(469\) 555-0199|maria@example\.com|1825 Brook Lane)$/.test(
      item.str,
    ),
  );
  const billToX = billToItems.find((item) => item.str === "BILL TO")!.x;
  const column = billToItems.filter((item) => Math.abs(item.x - billToX) < 1).sort((a, b) => b.y - a.y);
  assert.deepEqual(
    column.map((item) => item.str),
    [
      "BILL TO",
      "Anthony Leonardo",
      "(469) 555-0142",
      "anthony@example.com",
      "Maria Leonardo",
      "(469) 555-0199",
      "maria@example.com",
      "1825 Brook Lane",
    ],
    "Bill to lists each homeowner with phone and email, then the address",
  );
  for (const label of ["INVOICE DATE", "DUE DATE", "JOB", "AMOUNT DUE", "BILL TO", "PROJECT ADDRESS", "PROJECT MANAGER", "DESCRIPTION", "QTY", "RATE", "AMOUNT", "BALANCE DUE", "PAYMENT", "QUESTIONS?"]) {
    assert.ok(templateFront.includes(label), `invoice front page carries the ${label} label`);
  }
  assert.match(templateFront, /INV-1026/);
  assert.match(templateFront, /Nov 23, 2026/);
  assert.match(templateFront, /Dec 23, 2026/);
  assert.match(templateFront, /by Dec 23, 2026/);
  assert.match(templateFront, /BJ091426-A/);
  assert.match(templateFront, /Anthony Leonardo/);
  assert.match(templateFront, /1825 Brook Lane/);
  assert.match(templateFront, /Flower Mound, TX 75028/);
  assert.match(templateFront, /Brady Jones/);
  assert.match(templateFront, /\(469\) 794-7701/);
  assert.match(templateFront, /bjones@trockcontracting.com/);
  assert.match(templateFront, /Contract amount/);
  assert.match(templateFront, /Per signed contract/);
  assert.match(templateFront, /Additional siding repairs/);
  assert.match(templateFront, /\$22,428\.55/);
  assert.match(templateFront, /\$350\.45/);
  assert.match(templateFront, /Subtotal/);
  assert.match(templateFront, /Payments received/);
  assert.match(templateFront, /\$22,779\.00/);
  assert.match(templateFront, /Please reference INV-1026 with your payment\./);
  assert.match(templateFront, /Checks payable to T Rock Roofing & Contracting\./);
  assert.match(templateFront, /Contact Brady Jones at \(469\) 794-7701/);
  assert.match(templateFront, /Thank you for trusting T Rock Roofing & Contracting with your home\./);
  assert.match(templateFront, /3001 Long Prairie Road, Suite 100 · Flower Mound, TX 75022/);
  assert.doesNotMatch(templateFront, /Project Manager/, "the manager card drops the title line");
  const templateHeaders = templatePages[0]!.filter((item) => /^(DESCRIPTION|QTY|RATE|AMOUNT)$/.test(item.str));
  assert.equal(templateHeaders.length, 4, "table header labels are whole words, not spaced letters");
  const headerY = templateHeaders[0]!.y;
  assert.ok(templateHeaders.every((item) => Math.abs(item.y - headerY) < 1), "table header labels share a baseline");
  const balancePill = templatePages[0]!.find((item) => item.str === "BALANCE DUE");
  const balanceAmounts = templatePages[0]!.filter((item) => item.str === "$22,779.00");
  assert.ok(balancePill, "balance pill label is printed");
  assert.ok(
    balanceAmounts.some((item) => item.height > 14 && Math.abs(item.y - balancePill!.y) < 12),
    "balance pill carries the large amount beside its label",
  );
  assertClearOfFooter(templatePages);

  const legalTerms = [
    "1. Contract price",
    "Pay the listed total when you sign.",
    "",
    "2. Scope of work",
    "The work is the included items listed above.",
    "",
    "3. Schedule",
    "Work starts after you sign.",
    "",
    "4. Changes",
    "Changes are written as a change order.",
    "",
    "5. Contractor",
    "T Rock Roofing is the contractor named on this proposal.",
  ].join("\n");
  const legalPages = await pagesFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, terms: legalTerms, number: "EST-LEGAL" },
      lines,
      company,
      customer: "Shawn Gregory",
    }),
  );
  const legalText = legalPages.join("\n");
  assert.ok(legalPages.length <= 3, `legal estimate should stay tight, got ${legalPages.length} pages`);
  assert.match(legalText, /Contract price/);
  assert.match(legalText, /Scope of work/);
  assert.match(legalText, /AUTHORIZATION/);
  assert.match(legalText, /Pay the listed total/);

  const attachmentText = await textFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, notes: "See the warranty.", number: "EST-FILES" },
      lines,
      company,
      customer: "Shawn Gregory",
      files: [{ name: "Warranty.pdf" }, { name: "  " }, { name: "Color sheet.pdf" }],
    }),
  );
  assert.match(attachmentText, /ATTACHMENTS/);
  assert.match(attachmentText, /Warranty\.pdf/);
  assert.match(attachmentText, /Color sheet\.pdf/);
  assert.match(attachmentText, /See the warranty/);

  const materials: Array<[string, number, string, number]> = [
    ["Beacon/QXO Delivery Fee", 1, "ea", 164.29],
    ["CertainTeed Landmark AR", 168, "sq", 145.5],
    ["CertainTeed XT-25 3-Tab", 1, "lf", 150],
    ["TriBuilt Synthetic", 5.25, "roll", 130.5],
    ["TriBuilt Starter Strip (100 LF) OC", 2.97, "bdl", 86.84],
    ["TriBuilt Ice and Water 2 sq", 1, "roll", 122.5],
    ["Metal Valley 20'x50'", 2.46, "roll", 136.57],
    ['Nails 1" Plastic Caps Hand Drive', 5.25, "box", 36.19],
    ['Drip Edge 2"x2" Painted', 40.2, "pc", 14.43],
    ["TriBuilt Paint - All Colors", 1, "ea", 13.1],
    ['Coil Nails 1 1/2"', 5.25, "box", 91.43],
    ["CertainTeed Shadow Ridge (30 LF)", 1, "bdl", 133.43],
  ];
  const gbbLines: EstimateLine[] = [];
  let lineNo = 0;
  for (const pkg of ["good", "better", "best"]) {
    for (const [title, qty, unit, cost] of materials) {
      gbbLines.push({
        ...lines[0]!,
        id: `gbb_${lineNo++}`,
        title,
        description: "",
        quantity: qty,
        unit,
        unitCost: cost,
        package: pkg,
        groupName: pkg,
      });
    }
  }
  const longEstimate = await itemsFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, packageMode: "gbb", selectedPackage: "good", number: "EST-1053", terms: legalTerms },
      lines: gbbLines,
      company,
      customer: "Jones",
      jobCode: "BJ092126-E",
    }),
  );
  assert.ok(longEstimate.length > 1, "a full Good/Better/Best estimate runs past page 1");
  const longJoined = longEstimate.map(pageText);
  if (!/TOTAL/.test(longJoined[0] ?? "")) {
    assert.doesNotMatch(longJoined[0] ?? "", /Sign on page/, "sign cue must not float over page 1 line items");
  }
  const signPage = longJoined.findIndex((text) => /Sign on page \d+ ->/.test(text));
  assert.ok(signPage >= 0, "estimate should point at the authorization page");
  assert.match(longJoined[signPage] ?? "", /TOTAL/);
  const signMatch = (longJoined[signPage] ?? "").match(/Sign on page (\d+) ->/);
  const authPage = Number(signMatch?.[1] ?? "0") - 1;
  assert.match(longJoined[authPage] ?? "", /AUTHORIZATION/);
  const signItems = longEstimate[signPage]!.filter((item) => item.height > 0 && /Sign on page/.test(item.str));
  assert.ok(signItems.length >= 1);
  const signY = signItems[0]!.y;
  const crowded = longEstimate[signPage]!.filter(
    (item) => item.height > 0 && Math.abs(item.y - signY) < 6 && /\$\d/.test(item.str),
  );
  assert.equal(crowded.length, 0, "sign cue overlaps an amount");
  const continued = longEstimate.findIndex((items, index) => index > 0 && /TriBuilt|CertainTeed/.test(pageText(items)));
  assert.ok(continued > 0);
  assert.match(pageText(longEstimate[continued]!), /DESCRIPTION/);
  assert.match(pageText(longEstimate[continued]!), /AMOUNT/);
  assertClearOfFooter(longEstimate);

  const token = `UNBROKEN${"X".repeat(48)}`;
  const wideItems = await itemsFromPdf(
    await buildEstimatePdf({
      estimate: { ...estimate, number: "EST-WIDE", terms: "" },
      lines: [{ ...lines[0]!, title: "Wide line", description: token, unitCost: 10 }],
      company,
      customer: "Shawn Gregory",
    }),
  );
  const wideBits = wideItems.flat().filter((item) => item.str.includes("UNBROKEN") || item.str.includes("XXXX"));
  assert.ok(wideBits.length >= 1);
  for (const bit of wideBits) {
    assert.ok(bit.x + bit.width < 360, `description runs into the amount column: ${bit.str}`);
  }

  const scope = [
    "StartMarker roof system",
    ...Array.from({ length: 70 }, (_, index) => `Scope line ${index + 1} synthetic underlayment and drip edge.`),
    "EndMarker underlayment note",
  ].join("\n");
  const longInvoice = await itemsFromPdf(
    await buildInvoicePdf({
      invoice: { ...invoice, number: "INV-LONG", terms: "" },
      lines: [{ ...invoiceLines[0]!, description: scope, unitCost: 4200 }],
      payments: [],
      company,
      customer: "Shawn Gregory",
    }),
  );
  const start = longInvoice
    .map((items, index) => ({ index, item: items.find((entry) => entry.str.includes("StartMarker")) }))
    .find((entry) => entry.item);
  assert.ok(start?.item, "invoice description starts on a page");
  const linedUp = longInvoice[start!.index]!.find(
    (item) => item.str === "$4,200.00" && Math.abs(item.y - start!.item!.y) < 2,
  );
  assert.ok(linedUp, "invoice amount stays on the first description line");
  for (const [index, items] of longInvoice.entries()) {
    for (const item of items) {
      if (item.str !== "$4,200.00") continue;
      const hit = items.find(
        (other) =>
          /Scope line|EndMarker/.test(other.str) && Math.abs(other.y - item.y) < 3,
      );
      assert.equal(hit, undefined, `amount overlaps ${hit?.str ?? ""} on invoice page ${index + 1}`);
    }
  }
  const invoiceContinued = longInvoice.findIndex(
    (items, index) => index > 0 && /Scope line/.test(pageText(items)),
  );
  assert.ok(invoiceContinued > 0);
  assert.match(pageText(longInvoice[invoiceContinued]!), /DESCRIPTION/);
  assertClearOfFooter(longInvoice);

  const clause =
    "1. Contract Price. In exchange for performance of the Work, Customer promises to pay the listed total.";
  const clausePdf = await buildEstimatePdf({
    estimate: { ...estimate, terms: clause, number: "EST-CLAUSE" },
    lines,
    company,
    customer: "Rajh — 4608 Darlington Drive, Flower Mound, TX 75022",
    primaryCustomer: "Avanna Rajh",
    customerPhone: "7133969172",
    customerEmail: "avanna.rajh@hotmail.com",
    projectManager: {
      name: "Brady Jones",
      title: "Project Manager",
      phone: "4697947701",
      email: "bjones@trockcontracting.com",
    },
  });
  const clauseText = await textFromPdf(clausePdf);
  assert.match(clauseText, /Avanna Rajh/);
  assert.doesNotMatch(clauseText, /Darlington/);
  assert.match(clauseText, /\(469\) 794-7701/);
  assert.doesNotMatch(clauseText, /794-7701 · bjones@trockcontracting.com/);
  const clauseDoc = await getDocument({
    data: new Uint8Array(await clausePdf.arrayBuffer()),
    disableWorker: true,
    isEvalSupported: false,
  }).promise;
  const clauseRuns: Array<{ str: string; fontName: string }> = [];
  for (let pageNumber = 1; pageNumber <= clauseDoc.numPages; pageNumber += 1) {
    const clausePage = await clauseDoc.getPage(pageNumber);
    const clauseContent = await clausePage.getTextContent();
    for (const item of clauseContent.items) {
      if ("str" in item) clauseRuns.push({ str: item.str, fontName: item.fontName });
    }
  }
  const titleItem = clauseRuns.find((item) => item.str.includes("Contract Price"));
  const bodyItem = clauseRuns.find((item) => item.str.includes("In exchange"));
  const knownBold = clauseRuns.find((item) => item.str === "TERMS");
  assert.ok(titleItem, "clause title is printed");
  assert.ok(bodyItem, "clause sentence is printed");
  assert.ok(knownBold, "terms heading is printed");
  assert.equal(titleItem.fontName, knownBold.fontName, "clause title stays bold");
  assert.notEqual(bodyItem.fontName, titleItem.fontName, "clause sentence is not bold");

  console.log("document-pdf format tests passed");
}

void main();
