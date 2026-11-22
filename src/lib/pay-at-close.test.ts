import assert from "node:assert/strict";
import {
  assumedRateForYear,
  buildPayAtCloseReport,
  decidePayAtClose,
  effectiveLiens,
  emptyJobPayAtClose,
  equityWaterfall,
  estimateMortgageBalance,
  findInterviewQuestion,
  interviewProgress,
  interviewSummary,
  interviewValue,
  jobPayAtClosePayload,
  newPayAtCloseRequest,
  parseChecklist,
  parseInterview,
  parseLiens,
  parsePropertyRecord,
  parseReport,
  payAtCloseActivityNote,
  payAtCloseAwaitingApproval,
  payAtCloseExposure,
  payAtCloseStatusChoices,
  pickEstimatedValue,
  recommend,
  resolveThresholds,
  riskFlags,
  riskScore,
  setInterviewValue,
  signersMatchOwners,
  stateChecklist,
  APPLICATION_AUTHORIZATIONS,
  APPLICATION_STEPS,
  REP_INTERVIEW_STEPS,
  SAMPLE_PROPERTY_SOURCE,
  isSamplePropertyRecord,
  applicationAuthorizationsComplete,
  applicationProgress,
  applicationState,
  applyApplicationSubmission,
  authorizationText,
  parseApplication,
  sendPayAtCloseApplication,
  type JobPayAtClose,
  type MortgageRecord,
  type PropertyRecord,
} from "./pay-at-close.ts";

const today = new Date("2026-11-22T12:00:00Z");

// Mortgage amortization: $400k at 3% for 30 years, 5 years in, leaves roughly $355k.
const loan: MortgageRecord = {
  id: "m1",
  lender: "Chase",
  originalAmount: 400_000,
  recordedDate: "2021-11-15",
  loanType: "Conventional",
  interestRate: 3,
  termMonths: 360,
  isHeloc: false,
  position: 1,
};
const balance = estimateMortgageBalance(loan, today);
assert.equal(balance.monthsElapsed, 60);
assert.ok(balance.balance > 352_000 && balance.balance < 358_000, `balance ${balance.balance}`);
assert.equal(balance.assumedRate, false);

// Missing rate falls back to the vintage table; HELOC counts the full line.
const vintage = estimateMortgageBalance({ ...loan, interestRate: null, recordedDate: "2012-06-01" }, today);
assert.equal(vintage.assumedRate, true);
assert.equal(vintage.rateUsed, assumedRateForYear(2012));
assert.ok(vintage.balance < 400_000);
const heloc = estimateMortgageBalance({ ...loan, isHeloc: true, originalAmount: 50_000 }, today);
assert.equal(heloc.balance, 50_000);
assert.equal(assumedRateForYear(1980), assumedRateForYear(1995));
assert.equal(assumedRateForYear(2040), assumedRateForYear(2026));

// Zero-rate loan amortizes straight-line.
const zero = estimateMortgageBalance({ ...loan, interestRate: 0, termMonths: 120, recordedDate: "2021-11-15" }, today);
assert.equal(zero.assumedRate, true); // 0 is treated as missing, so a vintage rate applies
assert.ok(zero.balance < 400_000);

const property: PropertyRecord = {
  apn: "123-45-678",
  ownerNames: ["Maria Alvarez", "Luis Alvarez"],
  vesting: "Joint tenants",
  ownerOccupied: true,
  landUse: "Single family",
  yearBuilt: 1998,
  livingSqFt: 2100,
  lotSqFt: 7400,
  beds: 4,
  baths: 2.5,
  lastSaleDate: "2021-11-15",
  lastSalePrice: 500_000,
  assessedValue: 480_000,
  avmValue: 620_000,
  avmLow: 590_000,
  avmHigh: 650_000,
  avmConfidence: 82,
  annualTax: 4_200,
  taxDelinquentAmount: 0,
  mortgages: [loan],
  liens: [],
  distress: { noticeOfDefault: false, lisPendens: false, bankruptcy: false, taxLien: false, preForeclosureDate: null },
  sourceName: "Test records",
  fetchedAt: today.toISOString(),
};

// Value pick order: contract price, list price, haircut AVM, assessed, last sale.
const thresholds = resolveThresholds();
assert.equal(pickEstimatedValue({ listPrice: 0, contractPrice: 0, listingStatus: "" }, property, thresholds).value, 620_000 * 0.95);
assert.equal(pickEstimatedValue({ listPrice: 630_000, contractPrice: 0, listingStatus: "active" }, property, thresholds).value, 630_000);
assert.equal(pickEstimatedValue({ listPrice: 630_000, contractPrice: 615_000, listingStatus: "under_contract" }, property, thresholds).estimated, false);
// A list price far above the AVM blends down.
assert.equal(pickEstimatedValue({ listPrice: 800_000, contractPrice: 0, listingStatus: "active" }, property, thresholds).value, 710_000);
assert.equal(pickEstimatedValue({ listPrice: 0, contractPrice: 0, listingStatus: "" }, { ...property, avmValue: null }, thresholds).value, 480_000);
assert.equal(pickEstimatedValue({ listPrice: 0, contractPrice: 0, listingStatus: "" }, null, thresholds).value, 0);

// A finished interview with nothing alarming in it.
const cleanAnswers = {
  sale_reason: "Relocating for work",
  prior_fall_through: false,
  all_owners_signing: true,
  legal_situation: "none",
  mortgage_current: true,
  payoff_statement: false,
  completion_before_close: true,
  agent_committed: true,
};

// Waterfall: $615k sale, ~$355k loan, 7% closing costs, $18k contract.
const record: JobPayAtClose = {
  ...emptyJobPayAtClose("job_1", "pac_1", "CO"),
  interview: { answers: cleanAnswers, sources: {}, completedAt: null },
  contractValue: 18_000,
  depositAmount: 0,
  listingStatus: "under_contract",
  listPrice: 630_000,
  contractPrice: 615_000,
  expectedCloseDate: "2026-12-20",
  titleCompany: "Land Title",
  signerNames: "Maria Alvarez and Luis Alvarez",
};
const waterfall = equityWaterfall({ record, property, asOf: today });
assert.equal(waterfall.estimatedValue, 615_000);
assert.equal(waterfall.lines.length, 1);
assert.equal(waterfall.closingCosts, 43_050);
assert.ok(waterfall.netProceeds > 210_000 && waterfall.netProceeds < 220_000, `net ${waterfall.netProceeds}`);
assert.ok((waterfall.coverageRatio ?? 0) > 11);
assert.equal(waterfall.payAtCloseAmount, 18_000);

// A deposit reduces what is due at closing.
const withDeposit = equityWaterfall({ record: { ...record, depositAmount: 5_000 }, property, asOf: today });
assert.equal(withDeposit.payAtCloseAmount, 13_000);

// A verified title-commitment mortgage replaces the amortized estimate.
const verified = parseLiens([
  { id: "l1", kind: "mortgage", holder: "Chase", amount: 350_000, source: "title_commitment", verified: true },
]);
assert.equal(verified[0]?.verified, true);
const verifiedFall = equityWaterfall({ record: { ...record, liens: verified }, property, asOf: today });
assert.equal(verifiedFall.lines.length, 1);
assert.equal(verifiedFall.lines[0]?.amount, 350_000);
assert.equal(verifiedFall.lines[0]?.estimated, false);

// effectiveLiens drops public-record liens of a kind the title commitment verified.
const recordWithPublicLien: PropertyRecord = {
  ...property,
  liens: [
    { id: "p1", kind: "hoa", holder: "HOA", amount: 2_000, recordedDate: null, source: "public_record", verified: false, notes: "" },
    { id: "p2", kind: "judgment", holder: "Capital One", amount: 9_000, recordedDate: null, source: "public_record", verified: false, notes: "" },
  ],
};
const merged = effectiveLiens(recordWithPublicLien, [
  { id: "t1", kind: "hoa", holder: "HOA", amount: 1_500, recordedDate: null, source: "title_commitment", verified: true, notes: "" },
]);
assert.equal(merged.length, 2);
assert.ok(merged.some((lien) => lien.id === "t1"));
assert.ok(merged.some((lien) => lien.id === "p2"));
assert.ok(!merged.some((lien) => lien.id === "p1"));

// Delinquent tax shows up as a line once.
const taxed = equityWaterfall({ record, property: { ...property, taxDelinquentAmount: 3_200 }, asOf: today });
assert.ok(taxed.lines.some((line) => line.key === "tax:delinquent" && line.amount === 3_200));

// Signer matching tolerates trusts and partial names.
assert.equal(signersMatchOwners("Maria Alvarez and Luis Alvarez", ["ALVAREZ MARIA", "ALVAREZ LUIS"]), true);
assert.equal(signersMatchOwners("Bob Smith", ["Alvarez Family Trust"]), false);
assert.equal(signersMatchOwners("Maria Alvarez", ["The Alvarez Living Trust"]), true);
assert.equal(signersMatchOwners("", ["Alvarez"]), null);

// Clean deal: no high flags, approve.
const cleanFlags = riskFlags({ record, property, waterfall, state: "CO", today });
assert.ok(!cleanFlags.some((flag) => flag.severity === "high"), cleanFlags.map((f) => f.code).join(","));
assert.equal(recommend(waterfall, cleanFlags), "approve");
assert.ok(riskScore(cleanFlags) >= 80, `score ${riskScore(cleanFlags)}`);

// Thin equity: a $60k contract against a seller netting $40k declines.
const thinRecord: JobPayAtClose = { ...record, contractValue: 60_000, contractPrice: 420_000, listPrice: 420_000 };
const thinFall = equityWaterfall({ record: thinRecord, property, asOf: today });
assert.ok((thinFall.coverageRatio ?? 9) < 1.1, `coverage ${thinFall.coverageRatio}`);
const thinFlags = riskFlags({ record: thinRecord, property, waterfall: thinFall, state: "CO", today });
assert.ok(thinFlags.some((flag) => flag.code === "coverage_thin"));
assert.equal(recommend(thinFall, thinFlags), "decline");

// Middle band approves with a deposit: $60k contract against ~ $92k net.
const midRecord: JobPayAtClose = { ...record, contractValue: 60_000, contractPrice: 480_000, listPrice: 480_000 };
const midFall = equityWaterfall({ record: midRecord, property, asOf: today });
const midFlags = riskFlags({ record: midRecord, property, waterfall: midFall, state: "CO", today });
assert.equal(recommend(midFall, midFlags), "approve_with_deposit", `coverage ${midFall.coverageRatio}`);

// Hard stops: signer mismatch, bankruptcy, lis pendens.
const mismatchFlags = riskFlags({ record: { ...record, signerNames: "Bob Smith" }, property, waterfall, state: "CO", today });
assert.ok(mismatchFlags.some((flag) => flag.code === "owner_mismatch"));
assert.equal(recommend(waterfall, mismatchFlags), "decline");
const bk = { ...property, distress: { ...property.distress, bankruptcy: true } };
const bkFlags = riskFlags({ record, property: bk, waterfall, state: "CO", today });
assert.equal(recommend(waterfall, bkFlags), "decline");

// Notice of default is high severity and sends the deal to review, not auto-decline.
const nod = { ...property, distress: { ...property.distress, noticeOfDefault: true, preForeclosureDate: "2026-09-01" } };
const nodFlags = riskFlags({ record, property: nod, waterfall, state: "CO", today });
assert.equal(nodFlags[0]?.code, "notice_of_default");
assert.equal(recommend(waterfall, nodFlags), "review");

// Timing flags.
const lateFlags = riskFlags({ record: { ...record, expectedCloseDate: "2026-10-01" }, property, waterfall, state: "CO", today });
assert.ok(lateFlags.some((flag) => flag.code === "close_passed"));
const longFlags = riskFlags({ record: { ...record, expectedCloseDate: "2027-06-01" }, property, waterfall, state: "CO", today });
assert.ok(longFlags.some((flag) => flag.code === "long_carry"));
const noDateFlags = riskFlags({ record: { ...record, expectedCloseDate: null }, property, waterfall, state: "CO", today });
assert.ok(noDateFlags.some((flag) => flag.code === "no_close_date"));
const offMarket = riskFlags({ record: { ...record, listingStatus: "off_market" }, property, waterfall, state: "CO", today });
assert.ok(offMarket.some((flag) => flag.code === "off_market" && flag.severity === "high"));

// No property record yet is a watch, and the recommendation is review when nothing is known.
const emptyFall = equityWaterfall({ record: { ...record, contractPrice: 0, listPrice: 0 }, property: null, asOf: today });
const emptyFlags = riskFlags({ record: { ...record, contractPrice: 0, listPrice: 0 }, property: null, waterfall: emptyFall, state: "CO", today });
assert.ok(emptyFlags.some((flag) => flag.code === "no_property_record"));
assert.equal(recommend(emptyFall, emptyFlags), "decline"); // no_value is a hard stop until a value exists

// Full report round-trips through parse.
const report = buildPayAtCloseReport({ record, property, state: "CO", today });
assert.equal(report.recommendation, "approve");
assert.ok(report.narrative.includes("Recommendation: approve"));
assert.ok(report.sources[0]?.startsWith("Test records"));
const parsed = parseReport(JSON.parse(JSON.stringify(report)));
assert.ok(parsed);
assert.equal(parsed?.waterfall.netProceeds, report.waterfall.netProceeds);
assert.equal(parsed?.flags.length, report.flags.length);
assert.equal(parseReport({ nope: true }), null);

// A model narrative is used when provided.
const narrated = buildPayAtCloseReport({ record, property, state: "CO", today, narrative: "  Looks fine.  " });
assert.equal(narrated.narrative, "Looks fine.");

// Property record parse tolerates junk.
const parsedProperty = parsePropertyRecord({
  apn: "1",
  ownerNames: ["A", 3, ""],
  mortgages: [{ lender: "X", originalAmount: "250000", loanType: "HELOC" }],
  liens: [{ id: "", kind: "hoa" }, { id: "z", kind: "nope", amount: "12" }],
  distress: { bankruptcy: "yes" },
});
assert.equal(parsedProperty?.ownerNames.length, 1);
assert.equal(parsedProperty?.mortgages[0]?.isHeloc, true);
assert.equal(parsedProperty?.mortgages[0]?.originalAmount, 250_000);
assert.equal(parsedProperty?.liens.length, 1);
assert.equal(parsedProperty?.liens[0]?.kind, "other");
assert.equal(parsedProperty?.distress.bankruptcy, false);
assert.equal(parsePropertyRecord("x"), null);

// Checklist: Texas gets homestead wording, saved items keep their done state, unknown keys drop.
const tx = stateChecklist("tx");
assert.ok(tx.find((item) => item.key === "prelim_notice")?.detail.includes("Texas"));
assert.equal(tx.length, 8);
const restored = parseChecklist(
  [{ key: "agreement_signed", done: true, doneAt: "2026-11-01" }, { key: "bogus", done: true }],
  "CO",
);
assert.equal(restored.length, 8);
assert.equal(restored.find((item) => item.key === "agreement_signed")?.done, true);
assert.equal(restored.find((item) => item.key === "escrow_instructions")?.done, false);

// Exposure totals for the desk.
const exposure = payAtCloseExposure([
  { ...record, status: "in_progress", contractValue: 18_000, expectedCloseDate: "2026-12-20" },
  { ...record, id: "b", status: "awaiting_close", contractValue: 25_000, depositAmount: 5_000, expectedCloseDate: "2026-12-05" },
  { ...record, id: "c", status: "approved", contractValue: 9_000, expectedCloseDate: null },
  { ...record, id: "d", status: "paid", contractValue: 12_000 },
  { ...record, id: "e", status: "fell_through", contractValue: 7_000 },
  { ...record, id: "f", status: "screening", contractValue: 30_000 },
]);
assert.equal(exposure.openCount, 3);
assert.equal(exposure.openAmount, 18_000 + 20_000 + 9_000);
assert.equal(exposure.awaitingCloseAmount, 20_000);
assert.equal(exposure.paidAmount, 12_000);
assert.equal(exposure.fellThroughAmount, 7_000);
assert.equal(exposure.screeningCount, 1);
assert.equal(exposure.byMonth[0]?.month, "2026-12");
assert.equal(exposure.byMonth[0]?.amount, 38_000);
assert.equal(exposure.byMonth.at(-1)?.month, "unscheduled");

// Activity notes.
assert.equal(payAtCloseActivityNote(undefined, record), "Opened a pay-at-close review for $18,000.");
assert.equal(payAtCloseActivityNote(record, record), null);
const moved = payAtCloseActivityNote(record, { ...record, status: "approved", report });
assert.ok(moved?.includes("Pay at close is approved."));
assert.ok(moved?.includes("Property review ran: approve"));

// Requests and company-admin decisions.
const rep = { id: "staff_rep", name: "Casey Rep" };
const admin = { id: "staff_admin", name: "Brady Admin" };
const request = newPayAtCloseRequest({ jobId: "job_9", id: "pac_9", state: "TX", contractValue: 22_000, requester: rep, now: today });
assert.equal(request.status, "screening");
assert.equal(request.requestedBy, "staff_rep");
assert.equal(request.requestedByName, "Casey Rep");
assert.equal(request.requestedAt, today.toISOString());
assert.equal(request.decidedAt, null);
assert.ok(payAtCloseAwaitingApproval(request));
assert.equal(payAtCloseActivityNote(undefined, request), "Requested pay at close for $22,000. Waiting on a company admin.");
// Before a decision the plain status menu offers neither approve/decline nor work statuses.
assert.deepEqual(payAtCloseStatusChoices(request), ["screening", "fell_through"]);

const approved = decidePayAtClose(request, "approved", admin, "  Collect a $2,000 deposit. ", today);
assert.equal(approved.status, "approved");
assert.equal(approved.decidedBy, "staff_admin");
assert.equal(approved.decidedByName, "Brady Admin");
assert.equal(approved.decidedAt, today.toISOString());
assert.equal(approved.decisionNote, "Collect a $2,000 deposit.");
assert.ok(!payAtCloseAwaitingApproval(approved));
assert.equal(payAtCloseActivityNote(request, approved), "Pay at close approved by Brady Admin. Collect a $2,000 deposit.");
assert.deepEqual(payAtCloseStatusChoices(approved), ["screening", "approved", "in_progress", "awaiting_close", "paid", "fell_through"]);

const declined = decidePayAtClose(request, "declined", admin, "", today);
assert.equal(payAtCloseActivityNote(request, declined), "Pay at close declined by Brady Admin.");
assert.deepEqual(payAtCloseStatusChoices(declined), ["screening", "declined", "fell_through"]);

const payload = jobPayAtClosePayload(approved, "co_1");
assert.equal(payload.requested_by, "staff_rep");
assert.equal(payload.decided_by, "staff_admin");
assert.equal(payload.decided_at, today.toISOString());
assert.equal(jobPayAtClosePayload(emptyJobPayAtClose("job_1"), "co_1").requested_by, null);

// Qualification interview.
const blank = emptyJobPayAtClose("job_5", "pac_5", "TX");
const blankProgress = interviewProgress(blank);
assert.equal(blankProgress.complete, false);
assert.equal(blankProgress.nextStepIndex, 0);
assert.ok(blankProgress.requiredMissing.some((question) => question.id === "agent_committed"));
// Conditional questions stay hidden until relevant.
assert.ok(!blankProgress.requiredMissing.some((question) => question.id === "contractPrice"));
const depositQ = findInterviewQuestion("depositAmount")!;
assert.equal(depositQ.showWhen?.(blank), false);

// Field-bound questions write to the record; interview-only ones to answers.
const q = (id: string) => findInterviewQuestion(id)!;
let filled = setInterviewValue(blank, q("contractValue"), 24_000);
filled = setInterviewValue(filled, q("listingStatus"), "under_contract");
filled = setInterviewValue(filled, q("contractPrice"), 400_000);
filled = setInterviewValue(filled, q("expectedCloseDate"), "2027-01-15");
filled = setInterviewValue(filled, q("signerNames"), "Dana Reyes");
filled = setInterviewValue(filled, q("deposit_possible"), true);
filled = setInterviewValue(filled, q("depositAmount"), 1_500);
assert.equal(filled.contractValue, 24_000);
assert.equal(filled.listingStatus, "under_contract");
assert.equal(filled.depositAmount, 1_500);
assert.equal(filled.interview.answers.deposit_possible, true);
assert.equal(interviewValue(filled, q("contractPrice")), 400_000);
assert.equal(depositQ.showWhen?.(filled), true);
for (const [key, value] of Object.entries(cleanAnswers)) filled = setInterviewValue(filled, q(key), value);
const filledProgress = interviewProgress(filled);
assert.equal(filledProgress.complete, true, filledProgress.requiredMissing.map((m) => m.id).join(","));
assert.equal(filledProgress.nextStepIndex, 5);
assert.ok(interviewSummary(filled).some((row) => row.label === "Deposit" && row.value === "$1,500"));
// Clearing removes the key.
assert.equal("deposit_possible" in setInterviewValue(filled, q("deposit_possible"), null).interview.answers, false);

// An unfinished interview cannot reach approve, even on a clean property.
const unfinished: JobPayAtClose = { ...record, interview: { answers: {}, sources: {}, completedAt: null } };
const unfinishedFlags = riskFlags({ record: unfinished, property, waterfall, state: "CO", today });
assert.ok(unfinishedFlags.some((flag) => flag.code === "interview_incomplete"));
assert.equal(recommend(waterfall, unfinishedFlags), "review");

// Homeowner answers raise flags public records cannot see.
const risky: JobPayAtClose = {
  ...record,
  interview: {
    answers: {
      ...cleanAnswers,
      legal_situation: "divorce",
      all_owners_signing: false,
      mortgage_current: false,
      prior_fall_through: true,
      agent_committed: false,
      completion_before_close: false,
      repair_required_by: "lender_appraisal",
      mortgage_balance: 450_000,
    },
    completedAt: null,
  },
};
const riskyFlags = riskFlags({ record: risky, property, waterfall, state: "CO", today });
const riskyCodes = new Set(riskyFlags.map((flag) => flag.code));
for (const code of ["court_or_dispute", "missing_signer", "mortgage_delinquent", "prior_fall_through", "agent_not_committed", "completion_after_close", "lender_required", "homeowner_balance_differs"]) {
  assert.ok(riskyCodes.has(code), `missing ${code}`);
}
assert.ok(!riskyCodes.has("interview_incomplete"));
assert.equal(riskyFlags.find((flag) => flag.code === "agent_not_committed")?.severity, "watch");
assert.equal(recommend(waterfall, riskyFlags), "review");
assert.ok(riskScore(riskyFlags) < riskScore(cleanFlags));
// Once approved, an uncommitted agent is a high flag.
const approvedRisky = riskFlags({ record: { ...risky, status: "approved" }, property, waterfall, state: "CO", today });
assert.equal(approvedRisky.find((flag) => flag.code === "agent_not_committed")?.severity, "high");
// A lender-required repair earns a small credit.
const credited: JobPayAtClose = { ...record, interview: { answers: { ...cleanAnswers, repair_required_by: "buyer_inspection" }, sources: {}, completedAt: null } };
const creditedFlags = riskFlags({ record: credited, property, waterfall, state: "CO", today });
assert.ok(riskScore(creditedFlags) >= riskScore(cleanFlags));

// Interview round-trips through jsonb.
const parsedInterview = parseInterview({ answers: { a: true, b: "x", c: 12, d: null, e: { nested: 1 } }, completedAt: "2026-11-22T00:00:00Z" });
assert.deepEqual(parsedInterview.answers, { a: true, b: "x", c: 12, d: null });
assert.equal(parsedInterview.completedAt, "2026-11-22T00:00:00Z");
assert.deepEqual(parseInterview(null), { answers: {}, sources: {}, completedAt: null });
const submitted = { ...filled, interview: { ...filled.interview, completedAt: today.toISOString() } };
assert.ok(payAtCloseActivityNote(filled, submitted)?.includes("Qualification interview submitted"));

// Homeowner application. Office-only questions stay off the homeowner's form and vice versa.
const homeownerIds = new Set(APPLICATION_STEPS.flatMap((step) => step.questions.map((question) => question.id)));
const repIds = new Set(REP_INTERVIEW_STEPS.flatMap((step) => step.questions.map((question) => question.id)));
assert.ok(!homeownerIds.has("contractValue") && !homeownerIds.has("completion_before_close"));
assert.ok(repIds.has("contractValue") && !repIds.has("spouse_not_on_deed") && !repIds.has("lender_names"));
assert.ok(homeownerIds.has("spouse_not_on_deed") && homeownerIds.has("lender_names") && homeownerIds.has("agent_email"));
for (const step of APPLICATION_STEPS) {
  for (const question of step.questions) assert.ok(question.prompt.trim().length > 0, `homeowner prompt missing for ${question.id}`);
}
// Rep progress ignores homeowner-only questions.
// (depositAmount is hidden until deposit_possible is answered yes.)
assert.equal(interviewProgress(record).total, REP_INTERVIEW_STEPS.flatMap((step) => step.questions).length - 1);

assert.equal(applicationState(record.application), "not_sent");
const sent = sendPayAtCloseApplication(record, "abc123def456abc123def456abc12345", "jane@example.com", today);
assert.equal(applicationState(sent.application), "sent");
assert.equal(sent.application.token, "abc123def456abc123def456abc12345");
assert.ok(payAtCloseActivityNote(record, sent)?.includes("Homeowner application sent to jane@example.com"));
// Re-sending keeps the same token so the first link still works.
assert.equal(sendPayAtCloseApplication(sent, "other", "jane@example.com").application.token, sent.application.token);
const sentFlags = riskFlags({ record: sent, property, waterfall, state: "CO", today });
assert.ok(sentFlags.some((flag) => flag.code === "application_unsigned"));

assert.ok(!applicationAuthorizationsComplete(["records"]));
assert.ok(applicationAuthorizationsComplete(APPLICATION_AUTHORIZATIONS.map((item) => item.id)));
assert.ok(authorizationText(APPLICATION_AUTHORIZATIONS[0], "Acme Roofing").includes("Acme Roofing"));
assert.ok(!authorizationText(APPLICATION_AUTHORIZATIONS[0], "Acme Roofing").includes("{company}"));

const signed = applyApplicationSubmission(sent, {
  answers: { mortgage_balance: 340_000, spouse_not_on_deed: true, lender_names: "Wells Fargo", contractValue: 1 },
  fields: { titleCompany: "Land Title", expectedCloseDate: "2026-12-22", contractValue: 1 },
  signatureName: "Jane Example",
  signatureImage: "data:image/png;base64,AAA",
  authorizations: APPLICATION_AUTHORIZATIONS.map((item) => item.id),
  now: today,
});
assert.equal(applicationState(signed.application), "submitted");
assert.equal(signed.titleCompany, "Land Title");
assert.equal(signed.expectedCloseDate, "2026-12-22");
// Office-only fields never come from the homeowner.
assert.equal(signed.contractValue, 18_000);
assert.equal(signed.interview.answers.mortgage_balance, 340_000);
assert.equal(signed.interview.sources.titleCompany, "homeowner");
assert.equal(signed.interview.sources.lender_names, "homeowner");
assert.equal(signed.interview.sources.sale_reason, undefined);
assert.ok(interviewSummary(signed).some((row) => row.label === "Lender(s)" && row.source === "homeowner"));
assert.ok(payAtCloseActivityNote(sent, signed)?.includes("signed by Jane Example"));
const signedFlags = riskFlags({ record: signed, property, waterfall, state: "CO", today });
assert.ok(!signedFlags.some((flag) => flag.code === "application_unsigned"));
assert.ok(signedFlags.some((flag) => flag.code === "spouse_off_title"));
assert.ok(applicationProgress(signed).answered > applicationProgress(sent).answered);

// Application columns round-trip.
const parsedApplication = parseApplication({ token: "t", sentAt: "2026-11-22T00:00:00Z", sentTo: "x", submittedAt: null, signatureName: "", signatureImage: "", authorizations: ["records", 3], uploads: [{ path: "c/r/f.pdf", size: 10 }, { nope: true }], ip: "", userAgent: "" });
assert.deepEqual(parsedApplication.authorizations, ["records"]);
assert.equal(parsedApplication.uploads.length, 1);
assert.equal(parsedApplication.uploads[0].name, "f.pdf");
assert.equal(parseApplication(null).token, "");
assert.equal(jobPayAtClosePayload(signed, "co_1").application_signature_name, "Jane Example");

// A record saved from the demo generator is recognised so a later review with a
// provider key re-pulls it instead of re-scoring sample data forever.
assert.equal(isSamplePropertyRecord({ sourceName: SAMPLE_PROPERTY_SOURCE }), true);
assert.equal(isSamplePropertyRecord({ sourceName: "ATTOM public records for 1 Main St" }), false);
assert.equal(isSamplePropertyRecord(null), false);

console.log("pay-at-close.test.ts ok");
