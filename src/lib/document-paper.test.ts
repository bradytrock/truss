import assert from "node:assert/strict";
import {
  paperAuthorizationCopy,
  paperCompanyLines,
  paperEstimateMeta,
  paperFooterLeft,
  paperInvoiceBand,
  paperInvoiceBillTo,
  paperInvoiceFooterRight,
  paperInvoiceMeta,
  paperInvoicePaymentCopy,
  paperInvoiceQuestionsCopy,
  paperInvoiceThanks,
  paperBalanceDueNote,
  paperIssuedAt,
  paperKindLabel,
  paperMetaBlank,
  paperOptionChoiceCopy,
  paperManagerLines,
  paperPreparedForCard,
  paperPreparedForLines,
  paperPreparedForName,
  paperQtyLabel,
  paperRescissionCopy,
  paperSiteTitle,
  paperSplitColumns,
  paperTermsColumns,
} from "./document-paper.ts";

assert.equal(paperKindLabel("estimate"), "ESTIMATE");
assert.equal(paperKindLabel("invoice"), "INVOICE");

const site = paperSiteTitle({
  street: "9174 Shadowridge Drive",
  city: "Highland Village",
  state: "TX",
  postalCode: "75077",
  name: "Shadowridge",
});
assert.equal(site.title, "9174 Shadowridge Drive");
assert.equal(site.locality, "Highland Village, TX 75077");

assert.equal(paperSiteTitle({ name: "Roof replace", kindTitle: "Estimate" }).title, "Roof replace");
assert.equal(paperSiteTitle({ kindTitle: "Invoice" }).title, "Invoice");

assert.equal(paperMetaBlank(""), "—");
assert.equal(paperMetaBlank("  EST-1  "), "EST-1");
assert.equal(paperIssuedAt({ sentAt: "2026-09-20", createdAt: "2026-09-14" }), "2026-09-20");
assert.equal(paperIssuedAt({ sentAt: null, createdAt: "2026-09-14" }), "2026-09-14");
assert.equal(paperQtyLabel(1), "1");
assert.equal(paperQtyLabel(38.5), "38.5");

assert.deepEqual(
  paperPreparedForLines({ phone: "2145550142", email: "shawn@example.com" }),
  ["(214) 555-0142", "shawn@example.com"],
);
assert.deepEqual(paperPreparedForLines({ phone: "", email: "  " }), []);
assert.deepEqual(
  paperPreparedForLines({
    phone: "2145550142",
    email: "shawn@example.com",
    secondPhone: "2145550142",
    secondEmail: "jane@example.com",
  }),
  ["(214) 555-0142", "shawn@example.com", "jane@example.com"],
);
const preparedFor = paperPreparedForCard({
  name: "Shawn Gregory",
  phone: "4695550100",
  email: "shawn@example.com",
});
assert.equal(preparedFor.label, "Prepared for");
assert.equal(preparedFor.name, "Shawn Gregory");
assert.equal(preparedFor.lines[0], "(469) 555-0100");
assert.equal(preparedFor.lines[1], "shawn@example.com");
assert.equal(
  paperPreparedForName({
    customer: "Rajh — 4608 Darlington Drive, Flower Mound, TX 75022",
    primary: "Avanna Rajh",
  }),
  "Avanna Rajh",
);
assert.equal(
  paperPreparedForName({
    customer: "Shawn Gregory",
    primary: "Shawn Gregory",
    second: "Jordan Gregory",
  }),
  "Shawn Gregory and Jordan Gregory",
);
assert.equal(paperPreparedForName({ customer: "Shawn Gregory" }), "Shawn Gregory");
assert.deepEqual(
  paperManagerLines({
    title: "Project Manager",
    phone: "4697947701",
    email: "bjones@trockcontracting.com",
  }),
  ["Project Manager", "(469) 794-7701", "bjones@trockcontracting.com"],
);

const company = paperCompanyLines({
  name: "T Rock Roofing",
  street: "1 Main",
  city: "Dallas",
  state: "TX",
  postalCode: "75000",
  phone: "2145550100",
  email: "office@example.com",
  website: "trock.com",
  licenseNumber: "TACL123",
});
assert.equal(company.name, "T Rock Roofing");
assert.ok(company.address.some((line) => line.includes("1 Main")));
assert.match(company.contact, /214/);
assert.match(company.contact, /office@example.com/);
assert.deepEqual(company.contactLines.slice(0, 2).map((line) => line.includes("214") || line.includes("office@example.com")), [true, true]);
assert.equal(company.license, "License TACL123");

assert.match(paperFooterLeft({ name: "T Rock Roofing", phone: "2145550100", email: "office@example.com" }), /T Rock Roofing/);
assert.match(paperAuthorizationCopy("T Rock Roofing"), /T Rock Roofing/);
assert.match(paperRescissionCopy(), /third business day/i);
assert.equal(
  paperOptionChoiceCopy(),
  "Please choose the option you prefer. The price shown with it is the full amount for that selection.",
);
assert.doesNotMatch(paperOptionChoiceCopy(), /stack|shared work/i);

const estimateMeta = paperEstimateMeta({
  number: "EST-FORMAT",
  issuedAt: "2026-09-14",
  validUntil: "2026-10-14",
  jobCode: "JH091426-A",
});
assert.equal(estimateMeta[0]?.label, "Estimate no.");
assert.equal(estimateMeta[0]?.value, "EST-FORMAT");
assert.equal(estimateMeta[3]?.value, "JH091426-A");

const invoiceMeta = paperInvoiceMeta({
  number: "INV-FORMAT",
  issuedAt: "2026-09-14",
  dueAt: "2026-10-14",
});
assert.equal(invoiceMeta[0]?.label, "Invoice no.");
assert.equal(invoiceMeta[3]?.value, "—");

const band = paperInvoiceBand({
  issuedAt: "2026-11-23",
  dueAt: "2026-12-23",
  jobCode: "BJ091426-A",
  amountDue: "$22,779.00",
});
assert.deepEqual(
  band.map((item) => item.label),
  ["Invoice date", "Due date", "Job", "Amount due"],
);
assert.equal(band[0]?.value, "Nov 23, 2026");
assert.equal(band[1]?.value, "Dec 23, 2026");
assert.equal(band[2]?.value, "BJ091426-A");
assert.equal(band[3]?.value, "$22,779.00");
assert.equal(paperInvoiceBand({ amountDue: "$0.00" })[1]?.value, "—");
assert.equal(paperInvoiceBand({ amountDue: "$0.00" })[2]?.value, "—");

const billTo = paperInvoiceBillTo({
  customer: "Leonardo — 1825 Brook Lane",
  homeowners: [
    { name: "Anthony Leonardo", phone: "4695550142", email: " anthony@example.com " },
    { name: "Maria Leonardo", phone: "", email: "maria@example.com" },
    { name: " anthony leonardo ", phone: "4695550142" },
    { name: "  ", phone: "2145550000" },
    { name: "Chris Leonardo", phone: "", email: "" },
  ],
  addressLines: ["1825 Brook Lane", "", "Flower Mound, TX 75028"],
});
assert.equal(billTo.label, "Bill to");
assert.deepEqual(billTo.people, [
  { name: "Anthony Leonardo", lines: ["(469) 555-0142", "anthony@example.com"] },
  { name: "Maria Leonardo", lines: ["maria@example.com"] },
  { name: "Chris Leonardo", lines: [] },
]);
assert.deepEqual(billTo.lines, ["1825 Brook Lane", "Flower Mound, TX 75028"]);
assert.deepEqual(paperInvoiceBillTo({ customer: "Shawn Gregory" }).people, [{ name: "Shawn Gregory", lines: [] }]);
assert.deepEqual(paperInvoiceBillTo({ customer: "Shawn Gregory", homeowners: [] }).people, [
  { name: "Shawn Gregory", lines: [] },
]);
assert.equal(paperInvoiceBillTo({ customer: "  " }).people[0]?.name, "—");

assert.equal(paperBalanceDueNote({ balance: 22779, total: 22779, dueAt: "2026-12-23" }), "by Dec 23, 2026");
assert.equal(paperBalanceDueNote({ balance: 0, total: 22779, dueAt: "2026-12-23" }), "Paid in full");
assert.equal(paperBalanceDueNote({ balance: 100, total: 100, dueAt: null }), "");

assert.deepEqual(
  paperInvoicePaymentCopy({ number: "INV-1026", companyName: "T Rock Roofing & Contracting" }),
  ["Please reference INV-1026 with your payment.", "Checks payable to T Rock Roofing & Contracting."],
);
assert.deepEqual(
  paperInvoicePaymentCopy({ number: "INV-1026", companyName: "T Rock", paymentNote: "Zelle to office@trock.com" }),
  ["Please reference INV-1026 with your payment.", "Zelle to office@trock.com"],
);

const trock = { name: "T Rock Roofing & Contracting", phone: "4697940000", email: "office@trockcontracting.com" };
assert.deepEqual(
  paperInvoiceQuestionsCopy(
    { name: "Brady Jones", phone: "4697947701", email: "bjones@trockcontracting.com" },
    trock,
  ),
  ["Contact Brady Jones at (469) 794-7701", "or bjones@trockcontracting.com"],
);
assert.deepEqual(paperInvoiceQuestionsCopy(null, trock), [
  "Contact T Rock Roofing & Contracting at (469) 794-0000",
  "or office@trockcontracting.com",
]);
assert.deepEqual(paperInvoiceQuestionsCopy({ name: "Brady Jones", email: "b@trock.com" }, { name: "T Rock" }), [
  "Contact Brady Jones",
  "at b@trock.com",
]);
assert.deepEqual(paperInvoiceQuestionsCopy({ name: "Brady Jones" }, { name: "T Rock" }), ["Contact Brady Jones"]);

assert.equal(
  paperInvoiceThanks("T Rock Roofing & Contracting"),
  "Thank you for trusting T Rock Roofing & Contracting with your home.",
);
assert.equal(
  paperInvoiceFooterRight({
    street: "3001 Long Prairie Road, Suite 100",
    city: "Flower Mound",
    state: "TX",
    postalCode: "75022",
    phone: "4697947701",
  }),
  "3001 Long Prairie Road, Suite 100 · Flower Mound, TX 75022 · (469) 794-7701",
);
assert.equal(paperInvoiceFooterRight({ phone: "4697947701" }), "(469) 794-7701");
assert.equal(paperInvoiceFooterRight({}), "");

const [left, right] = paperSplitColumns([1, 2, 3, 4, 5]);
assert.deepEqual(left, [1, 2, 3]);
assert.deepEqual(right, [4, 5]);

const [termLeft, termRight] = paperTermsColumns(
  "1. First\nOne.\n\n2. Second\nTwo.\n\n3. Third\nThree.",
);
assert.equal(termLeft.length, 2);
assert.equal(termRight.length, 1);

console.log("document-paper tests passed");
