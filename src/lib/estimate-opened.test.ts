import assert from "node:assert/strict";
import {
  estimateOpenedActivityBody,
  estimateOpenedAddress,
  estimateOpenedEmailSubject,
  estimateOpenedEmailText,
  estimateOpenedProposalTotal,
  estimateOpenedSms,
  isLinkPreviewBot,
  parseEstimateOpenedNotify,
} from "./estimate-opened.ts";
import {
  estimateOpenedBrandColor,
  estimateOpenedEmailLinks,
  formatEstimateOpenedAt,
  renderEstimateOpenedEmailHtml,
} from "./estimate-opened-email.ts";

assert.equal(isLinkPreviewBot("facebookexternalhit/1.1 Facebot Twitterbot/1.0"), true);
assert.equal(isLinkPreviewBot("Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Applebot/0.1"), true);
assert.equal(isLinkPreviewBot("Slackbot-LinkExpanding 1.0"), true);
assert.equal(
  isLinkPreviewBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"),
  false,
);

assert.equal(
  estimateOpenedActivityBody({ contactName: "Jenn Whitby", estimateNumber: "EST-1042" }),
  "Jenn Whitby opened proposal EST-1042.",
);
assert.equal(estimateOpenedActivityBody({ estimateName: "Roof replacement" }), "The homeowner opened proposal Roof replacement.");

const notify = {
  name: "Alex Rivera",
  phone: "2145550101",
  email: "alex@example.com",
  estimateNumber: "EST-1042",
  estimateName: "Roof replacement",
  jobCode: "AR-1042",
  address: "4418 E 32nd Ave, Denver, CO 80205",
  contactName: "Jenn Whitby",
  companyName: "T-Rock Roofing",
  companyEmail: "office@example.com",
};

assert.equal(
  estimateOpenedSms(notify),
  "Jenn Whitby opened proposal EST-1042 (AR-1042 · 4418 E 32nd Ave, Denver, CO 80205).",
);
assert.equal(
  estimateOpenedEmailSubject(notify),
  "Proposal EST-1042 opened — 4418 E 32nd Ave, Denver, CO 80205",
);
assert.match(estimateOpenedEmailText(notify), /Job: AR-1042/);

assert.equal(parseEstimateOpenedNotify(null), null);
assert.equal(parseEstimateOpenedNotify({ notify: { name: "", phone: "", email: "" } }), null);
const parsed = parseEstimateOpenedNotify({
  ok: true,
  notify: {
    name: "Alex Rivera",
    phone: "2145550101",
    email: "alex@example.com",
    address: "100 Main",
    openCount: 2,
    street: "545 Arrowwood Beach Circle",
    city: "Trinidad",
    state: "TX",
    postalCode: "75163",
    subtotalOverride: null,
    discountKind: "amount",
    lines: [{ quantity: 2, unitCost: "100.5", optional: false, selected: true, taxable: true, package: "" }],
  },
});
assert.equal(parsed?.name, "Alex Rivera");
assert.equal(parsed?.address, "100 Main");
assert.equal(parsed?.openCount, 2);
assert.equal(parsed?.lines?.[0]?.unitCost, 100.5);
assert.equal(parsed?.discountKind, "amount");
assert.equal(parsed?.subtotalOverride, null);

assert.deepEqual(estimateOpenedAddress(parsed!), {
  line: "545 Arrowwood Beach Circle",
  city: "Trinidad, TX 75163",
  full: "545 Arrowwood Beach Circle, Trinidad, TX 75163",
});
assert.equal(
  estimateOpenedEmailSubject({
    estimateNumber: "EST-1180",
    address: "545 Arrowwood Beach Circle, Trinidad TX, 75163",
    street: "545 Arrowwood Beach Circle",
    city: "Trinidad",
    state: "TX",
    postalCode: "75163",
  }),
  "Proposal EST-1180 opened — 545 Arrowwood Beach Circle, Trinidad, TX 75163",
);

const priced = {
  ...parsed!,
  market: "residential",
  taxRate: 8.25,
  marginPercent: 0,
  packageMode: "",
};
assert.equal(estimateOpenedProposalTotal(priced), 201);
assert.equal(
  estimateOpenedProposalTotal({
    ...priced,
    marginPercent: 20,
    lines: [{ quantity: 1, unitCost: 1000, optional: false, selected: true, taxable: true, package: "", groupName: "" }],
  }),
  1200,
);
assert.equal(
  estimateOpenedProposalTotal({
    ...priced,
    market: "commercial",
    taxRate: 10,
    lines: [{ quantity: 1, unitCost: 100, optional: false, selected: true, taxable: true, package: "", groupName: "" }],
  }),
  110,
);
assert.equal(
  estimateOpenedProposalTotal({
    ...priced,
    packageMode: "gbb",
    selectedPackage: "better",
    lines: [
      { quantity: 1, unitCost: 100, optional: false, selected: true, taxable: true, package: "", groupName: "" },
      { quantity: 1, unitCost: 50, optional: false, selected: true, taxable: true, package: "good", groupName: "" },
      { quantity: 1, unitCost: 80, optional: false, selected: true, taxable: true, package: "better", groupName: "" },
    ],
  }),
  180,
);
assert.equal(
  estimateOpenedProposalTotal({
    ...priced,
    subtotalOverride: 500,
    lines: [{ quantity: 1, unitCost: 20, optional: false, selected: true, taxable: true, package: "", groupName: "" }],
  }),
  500,
);

assert.equal(
  formatEstimateOpenedAt("2026-11-11T04:31:00.000Z", "America/Chicago"),
  "Nov 10, 2026 · 10:31 PM",
);
assert.match(formatEstimateOpenedAt("2026-11-11T04:31:00.000Z", ""), /UTC$/);
assert.equal(estimateOpenedBrandColor("red;background:url(x)"), "#d71c27");
assert.equal(estimateOpenedBrandColor("#B91C1C"), "#B91C1C");

const origin = "https://app.example.com";
const html = renderEstimateOpenedEmailHtml({
  notify: {
    ...priced,
    contactName: "Brady <Jones>",
    estimateNumber: "EST-1180",
    estimateName: "Roof",
    jobCode: "BJ101426-A",
    jobId: "job-1",
    estimateId: "est-1",
    companyName: "T Rock Roofing & Contracting",
    companyPhone: "4697947701",
    openCount: 3,
    openedAt: "2026-11-11T04:31:00.000Z",
    staffTimeZone: "America/Chicago",
    address: "545 Arrowwood Beach Circle, Trinidad TX, 75163",
  },
  origin,
  logoUrl: "https://cdn.example.com/logo.png",
  now: new Date("2026-11-11T04:31:00.000Z"),
});
assert.match(html, /Proposal EST-1180 was opened/);
assert.match(html, /Brady &lt;Jones&gt;/);
assert.doesNotMatch(html, /Brady <Jones>/);
assert.match(html, /Times opened: <strong style="color:#374151;">3<\/strong>/);
assert.match(html, /\$201\.00/);
assert.match(html, /BJ101426-A/);
assert.match(html, /Trinidad, TX 75163/);
assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=545%20Arrowwood%20Beach%20Circle%2C%20Trinidad%2C%20TX%2075163/);
assert.match(html, /https:\/\/app\.example\.com\/estimates\/est-1/);
assert.match(html, /https:\/\/app\.example\.com\/jobs\?job=job-1/);
assert.match(html, /https:\/\/app\.example\.com\/settings/);
assert.match(html, /\(469\) 794-7701/);
assert.match(html, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
assert.match(html, /background:#d71c27/);
assert.doesNotMatch(html, /\{\{/);
assert.match(estimateOpenedEmailText(priced, { amount: "$201.00", openCount: 3, proposalUrl: "https://app.example.com/e" }), /Amount: \$201\.00/);

const plain = renderEstimateOpenedEmailHtml({
  notify: {
    ...priced,
    contactName: "",
    lines: undefined,
    companyName: "T Rock",
    companyPhone: "",
    jobCode: "",
    jobId: "",
    estimateId: "",
  },
  origin,
  logoUrl: "javascript:alert(1)",
});
assert.match(plain, /The homeowner/);
assert.match(plain, />T Rock</);
assert.doesNotMatch(plain, /<img/);
assert.doesNotMatch(plain, /javascript:/);
assert.doesNotMatch(plain, /Open job/);
assert.match(plain, /Address not on file|545 Arrowwood/);
assert.match(plain, /—/);

const custom = renderEstimateOpenedEmailHtml({
  notify: priced,
  origin,
  headline: "Custom <headline>",
  message: "Line one\nLine two",
  button: "See it",
});
assert.match(custom, /Custom &lt;headline&gt;/);
assert.match(custom, /Line one<br>Line two/);
assert.match(custom, />See it</);
assert.equal(
  estimateOpenedEmailLinks({ ...priced, estimateId: "est-1", jobId: "job 1" }, origin).jobUrl,
  "https://app.example.com/jobs?job=job%201",
);

console.log("estimate-opened.test.ts ok");
