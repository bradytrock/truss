import { NextResponse } from "next/server";
import {
  buildPayAtCloseReport,
  emptyJobPayAtClose,
  interviewSummary,
  isListingStatus,
  isSamplePropertyRecord,
  isPayAtCloseStatus,
  parseChecklist,
  parseApplication,
  parseInterview,
  parseLiens,
  parsePropertyRecord,
  RECOMMENDATION_LABELS,
  type JobPayAtClose,
  type PayAtCloseReport,
  type PropertyRecord,
} from "@/lib/pay-at-close";
import {
  formatPropertyAddress,
  lookupPropertyRecord,
  propertyRecordsConfigured,
  type PropertyAddress,
} from "@/lib/property-records-server";
import { readSessionUser } from "@/lib/session-user";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReviewBody = {
  address?: Partial<PropertyAddress>;
  record?: Partial<JobPayAtClose> & { jobId?: string };
  /** Keep the saved property record instead of pulling a fresh one. */
  reuseProperty?: boolean;
  jobName?: string;
  homeowner?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function requireUser() {
  if (!isSupabaseConfigured()) return { id: "local" };
  const supabase = await createClient();
  return readSessionUser(supabase);
}

function recordFromBody(raw: unknown, state: string): JobPayAtClose {
  const row = isRecord(raw) ? raw : {};
  const base = emptyJobPayAtClose(str(row.jobId), str(row.id) || undefined, state);
  const listing = str(row.listingStatus);
  return {
    ...base,
    contractValue: num(row.contractValue),
    depositAmount: num(row.depositAmount),
    expectedCloseDate: str(row.expectedCloseDate) || null,
    listingStatus: isListingStatus(listing) ? listing : "",
    listPrice: num(row.listPrice),
    contractPrice: num(row.contractPrice),
    sellerConcessions: num(row.sellerConcessions),
    titleCompany: str(row.titleCompany),
    escrowOfficer: str(row.escrowOfficer),
    escrowEmail: str(row.escrowEmail),
    escrowPhone: str(row.escrowPhone),
    escrowFileNumber: str(row.escrowFileNumber),
    listingAgent: str(row.listingAgent),
    signerNames: str(row.signerNames),
    property: parsePropertyRecord(row.property),
    liens: parseLiens(row.liens),
    checklist: parseChecklist(row.checklist, state),
    status: isPayAtCloseStatus(str(row.status)) ? (str(row.status) as JobPayAtClose["status"]) : base.status,
    notes: str(row.notes),
    interview: parseInterview(row.interview),
    application: parseApplication(isRecord(row.application) ? row.application : null),
  };
}

/**
 * The model writes the plain-language summary from the computed numbers only.
 * It does not compute money and cannot change the recommendation.
 */
async function narrateWithOpenAi(input: {
  address: string;
  jobName: string;
  homeowner: string;
  report: PayAtCloseReport;
  property: PropertyRecord | null;
  interview: Array<{ label: string; value: string }>;
}) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return "";
  const facts = {
    homeownerInterview: input.interview,
    address: input.address,
    job: input.jobName,
    homeowner: input.homeowner,
    recommendation: RECOMMENDATION_LABELS[input.report.recommendation],
    score: input.report.score,
    waterfall: input.report.waterfall,
    flags: input.report.flags,
    owners: input.property?.ownerNames ?? [],
    vesting: input.property?.vesting ?? "",
    lastSale: input.property ? { date: input.property.lastSaleDate, price: input.property.lastSalePrice } : null,
    assumptions: input.report.assumptions,
  };
  const prompt = `You write the summary paragraph of a Pay at Close risk report for a roofing and exterior contractor. The contractor completes repairs before a home sale and is paid from seller proceeds at closing.
Write 3 to 5 plain sentences for the office manager. Use only the numbers given; do not invent or recompute any figure. State the value basis, the estimated seller net, how many times it covers the contractor's payment, the biggest risks in order (including anything the homeowner interview revealed), and end with the recommendation exactly as given. No bullet points, no headings, no markdown.`;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return "";
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  return NextResponse.json({
    recordsConfigured: propertyRecordsConfigured(),
    narrativeConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as ReviewBody | null;
  if (!body || !isRecord(body)) {
    return NextResponse.json({ error: "Send the job address and the pay-at-close fields." }, { status: 400 });
  }
  const address: PropertyAddress = {
    street: str(body.address?.street),
    city: str(body.address?.city),
    state: str(body.address?.state).toUpperCase(),
    postalCode: str(body.address?.postalCode),
  };
  if (!address.street || (!address.postalCode && !(address.city && address.state))) {
    return NextResponse.json(
      { error: "The job needs a street address with a city and state or a ZIP before a property review can run." },
      { status: 400 },
    );
  }

  const record = recordFromBody(body.record, address.state);
  const recordsConfigured = propertyRecordsConfigured();
  let property = record.property;
  // A sample record saved before the host had a provider key is not worth keeping:
  // re-scoring it would never call the provider, so pull live records instead.
  const reused = Boolean(body.reuseProperty && property && !(recordsConfigured && isSamplePropertyRecord(property)));
  let provider = reused ? "Saved record" : "";
  let live = false;
  let lookupError = "";
  if (!reused) {
    try {
      const result = await lookupPropertyRecord(address);
      provider = result.provider;
      live = result.live;
      if (result.record) property = result.record;
      else lookupError = `${result.provider} has no record for ${formatPropertyAddress(address)}. Check the address or enter liens by hand.`;
    } catch (error) {
      lookupError = error instanceof Error ? error.message : "Property lookup failed.";
    }
  }

  const draft = buildPayAtCloseReport({ record: { ...record, property }, property, state: address.state });
  const narrative = await narrateWithOpenAi({
    address: formatPropertyAddress(address),
    jobName: str(body.jobName),
    homeowner: str(body.homeowner),
    report: draft,
    property,
    interview: interviewSummary(record).map(({ label, value }) => ({ label, value })),
  });
  const report = narrative ? { ...draft, narrative } : draft;

  return NextResponse.json({
    ok: true,
    property,
    report,
    provider,
    live,
    reused,
    recordsConfigured,
    narrativeFromModel: Boolean(narrative),
    lookupError: lookupError || null,
  });
}
