import { sendblueText } from "@/lib/sendblue";
import { createAnonClient } from "@/lib/supabase/anon";

export type RealtorListingWatch = {
  companyId: string;
  contactId: string;
  contactName: string;
  watchUrl: string;
  ownerStaffId: string | null;
  ownerName: string;
  ownerPhone: string;
};

export type ExtractedListing = {
  externalKey?: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  price?: number | string | null;
  status?: string;
  beds?: number | string | null;
  baths?: number | string | null;
  sqft?: number | string | null;
  listedAt?: string | null;
  source?: string;
  sourceUrl?: string;
  summary?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWatchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "TrussListingWatch/1.0 (+https://truss.crm; daily realtor pipeline nurture)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Could not open listing page (${response.status}).`);
  }
  const html = await response.text();
  return stripHtml(html).slice(0, 24_000);
}

async function extractListingsWithOpenAi(
  url: string,
  pageText: string,
): Promise<ExtractedListing[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set on this host.");
  }
  const prompt = `You extract real-estate listings for a contractor CRM that nurtures realtor partners.
Return JSON only: {"listings":[{"externalKey":"","title":"","address":"","city":"","state":"","postalCode":"","price":0,"status":"active|pending|sold|off_market|unknown","beds":0,"baths":0,"sqft":0,"listedAt":"YYYY-MM-DD or null","source":"","sourceUrl":"","summary":""}]}
Prefer active or pending listings tied to this agent. If none are clear, return {"listings":[]}.
Source page: ${url}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nPage text:\n${pageText}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI listing extract failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content ?? "";
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(content.slice(start, end + 1)) as { listings?: unknown };
  if (!Array.isArray(parsed.listings)) return [];
  return parsed.listings.filter(isRecord) as ExtractedListing[];
}

function parseWatches(raw: unknown): RealtorListingWatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const companyId = typeof item.companyId === "string" ? item.companyId : "";
    const contactId = typeof item.contactId === "string" ? item.contactId : "";
    const watchUrl = typeof item.watchUrl === "string" ? item.watchUrl.trim() : "";
    if (!companyId || !contactId || watchUrl.length < 8) return [];
    return [
      {
        companyId,
        contactId,
        contactName: typeof item.contactName === "string" ? item.contactName : "Partner",
        watchUrl,
        ownerStaffId: typeof item.ownerStaffId === "string" ? item.ownerStaffId : null,
        ownerName: typeof item.ownerName === "string" ? item.ownerName : "",
        ownerPhone: typeof item.ownerPhone === "string" ? item.ownerPhone : "",
      },
    ];
  });
}

async function notifyOwnerOfNewListings(input: {
  ownerPhone: string;
  contactName: string;
  listings: Array<{ title?: string; address?: string; price?: number | null }>;
}) {
  if (!input.ownerPhone.trim() || input.listings.length === 0) return;
  const first = input.listings[0];
  const label = first.address || first.title || "a new property";
  const price =
    typeof first.price === "number"
      ? ` · $${Math.round(first.price).toLocaleString("en-US")}`
      : "";
  const extra =
    input.listings.length > 1 ? ` (+${input.listings.length - 1} more)` : "";
  const content = `New listing from ${input.contactName}: ${label}${price}${extra}. Open Truss to follow up.`;
  await sendblueText({ to: input.ownerPhone, content });
}

export async function listRealtorListingWatches() {
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("realtor_listing_watches");
  if (error) throw new Error(error.message);
  return parseWatches(data);
}

export async function browseRealtorListingWatch(watch: RealtorListingWatch) {
  const supabase = createAnonClient();
  let listings: ExtractedListing[] = [];
  let browseError = "";
  try {
    const pageText = await fetchWatchPage(watch.watchUrl);
    listings = await extractListingsWithOpenAi(watch.watchUrl, pageText);
  } catch (error) {
    browseError = error instanceof Error ? error.message : "Listing browse failed.";
  }

  const { data, error } = await supabase.rpc("ingest_realtor_listing_browse", {
    p_company_id: watch.companyId,
    p_contact_id: watch.contactId,
    p_source_url: watch.watchUrl,
    p_listings: listings,
    p_error: browseError,
  });
  if (error) throw new Error(error.message);

  const result = isRecord(data) ? data : {};
  const newListings = Array.isArray(result.newListings)
    ? (result.newListings.filter(isRecord) as Array<{
        title?: string;
        address?: string;
        price?: number | null;
      }>)
    : [];
  const ownerPhone =
    typeof result.ownerPhone === "string" && result.ownerPhone.trim()
      ? result.ownerPhone
      : watch.ownerPhone;
  const contactName =
    typeof result.contactName === "string" && result.contactName.trim()
      ? result.contactName
      : watch.contactName;

  if (!browseError && newListings.length > 0) {
    try {
      await notifyOwnerOfNewListings({
        ownerPhone,
        contactName,
        listings: newListings,
      });
    } catch (error) {
      console.error("[realtor-listings] notify failed", error);
    }
  }

  return {
    contactId: watch.contactId,
    contactName,
    found: typeof result.found === "number" ? result.found : listings.length,
    newCount: typeof result.newCount === "number" ? result.newCount : newListings.length,
    error: browseError,
  };
}

export async function runRealtorListingBrowse(options?: {
  contactId?: string;
  limit?: number;
}) {
  const watches = await listRealtorListingWatches();
  const filtered = options?.contactId
    ? watches.filter((watch) => watch.contactId === options.contactId)
    : watches;
  const limit = Math.max(1, Math.min(options?.limit ?? 40, 100));
  const selected = filtered.slice(0, limit);
  const results = [];
  for (const watch of selected) {
    results.push(await browseRealtorListingWatch(watch));
  }
  return {
    watched: watches.length,
    processed: results.length,
    results,
  };
}
