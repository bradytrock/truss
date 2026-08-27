import { NextResponse } from "next/server";
import { guessExpenseAccount, isExpenseAccount, isExpenseMethod } from "@/lib/job-financials";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ExtractKind = "expense" | "payment";
type ProviderResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; missingKey?: boolean };

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function openaiUserError(status: number, detail: string) {
  const text = detail.toLowerCase();
  if (status === 401 || text.includes("incorrect api key") || text.includes("invalid_api_key")) {
    return "OPENAI_API_KEY on this host is not valid.";
  }
  if (status === 429 || text.includes("rate limit")) {
    return "OpenAI is rate-limiting. Try again in a moment.";
  }
  if (status === 413 || text.includes("too large") || text.includes("maximum context")) {
    return "That photo is too large for OpenAI. Try a closer shot of the totals.";
  }
  return "OpenAI could not read that photo. Try a clearer shot of the vendor and total.";
}

function expensePrompt() {
  return 'Read this receipt. Return JSON only: {"vendor":"","amount":0,"date":"YYYY-MM-DD","memo":"","account":"materials|subcontractors|equipment_rental|dumpsters|permits|labor|fuel|office|insurance|other","method":"credit_card|debit|check|ach|cash"}';
}

function paymentPrompt() {
  return 'Read this check, remit, or deposit slip. Return JSON only: {"amount":0,"date":"YYYY-MM-DD","method":"check|ACH|wire|card","reference":""}';
}

async function extractWithOpenAi(imageDataUrl: string, kind: ExtractKind): Promise<ProviderResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, error: "OPENAI_API_KEY is not set on this host.", missingKey: true };
  const prompt = kind === "expense" ? expensePrompt() : paymentPrompt();
  const models = ["gpt-4o-mini", "gpt-4o"];
  let lastError = "OpenAI could not read that photo.";
  for (const model of models) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Receipt OpenAI error", model, response.status, detail.slice(0, 500));
      lastError = openaiUserError(response.status, detail);
      if (response.status === 404 || detail.toLowerCase().includes("model")) continue;
      return { ok: false, error: lastError };
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonObject(content);
    if (!parsed) {
      lastError = "The model did not return receipt fields. Try a clearer photo.";
      continue;
    }
    return { ok: true, data: parsed };
  }
  return { ok: false, error: lastError };
}

async function extractWithAnthropic(imageDataUrl: string, kind: ExtractKind): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY is not set on this host.", missingKey: true };
  const match = imageDataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return { ok: false, error: "Send a JPEG or PNG of the receipt." };
  const mediaType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
    return { ok: false, error: "Send a JPEG or PNG of the receipt." };
  }
  const prompt = kind === "expense" ? expensePrompt() : paymentPrompt();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: match[2] },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Receipt Anthropic error", response.status, detail.slice(0, 500));
    return { ok: false, error: "Anthropic could not read that photo. Try a clearer shot of the vendor and total." };
  }
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.find((part) => part.type === "text")?.text ?? "";
  const parsed = parseJsonObject(text);
  if (!parsed) return { ok: false, error: "The model did not return receipt fields. Try a clearer photo." };
  return { ok: true, data: parsed };
}

export async function GET() {
  return NextResponse.json({
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  });
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw.trim()) {
      return NextResponse.json({ error: "The receipt photo did not arrive. Try a smaller JPEG." }, { status: 400 });
    }
    let body: { image?: unknown; kind?: unknown };
    try {
      body = JSON.parse(raw) as { image?: unknown; kind?: unknown };
    } catch {
      return NextResponse.json(
        { error: "That photo was too large for the server. Photograph just the totals." },
        { status: 413 },
      );
    }
    const image = asString(body.image);
    const kind: ExtractKind = body.kind === "payment" ? "payment" : "expense";
    if (!image.startsWith("data:image")) {
      return NextResponse.json(
        { error: "AI reads a photo of the receipt, not a PDF. Photograph the slip and try again." },
        { status: 400 },
      );
    }
    const openai = await extractWithOpenAi(image, kind);
    const extracted = openai.ok ? openai : await extractWithAnthropic(image, kind);
    if (extracted.ok) {
      if (kind === "expense") {
        const vendor = asString(extracted.data.vendor);
        const accountRaw = asString(extracted.data.account);
        const methodRaw = asString(extracted.data.method);
        return NextResponse.json({
          ok: true,
          source: "ai",
          vendor,
          amount: asNumber(extracted.data.amount),
          date: asString(extracted.data.date),
          memo: asString(extracted.data.memo),
          account: isExpenseAccount(accountRaw)
            ? accountRaw
            : guessExpenseAccount(vendor, asString(extracted.data.memo)),
          method: isExpenseMethod(methodRaw) ? methodRaw : "credit_card",
        });
      }
      return NextResponse.json({
        ok: true,
        source: "ai",
        amount: asNumber(extracted.data.amount),
        date: asString(extracted.data.date),
        method: asString(extracted.data.method) || "check",
        reference: asString(extracted.data.reference),
      });
    }
    const openaiFailed = !openai.ok ? openai : null;
    const fallbackFailed = !extracted.ok ? extracted : null;
    const missing = Boolean(openaiFailed?.missingKey && fallbackFailed?.missingKey);
    return NextResponse.json({
      ok: false,
      source: "manual",
      message: missing
        ? "No AI key is configured on this host (OPENAI_API_KEY, or ANTHROPIC_API_KEY as a fallback). Fill the fields from the photo — the image still stays on the record."
        : openaiFailed && !openaiFailed.missingKey
          ? openaiFailed.error
          : (fallbackFailed?.error ?? openaiFailed?.error ?? "Could not read the receipt."),
    });
  } catch (error) {
    console.error("Receipt extract failed", error);
    return NextResponse.json({ error: "Could not read the receipt." }, { status: 500 });
  }
}
