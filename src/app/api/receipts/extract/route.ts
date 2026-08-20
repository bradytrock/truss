import { NextResponse } from "next/server";
import { guessExpenseAccount, isExpenseAccount, isExpenseMethod } from "@/lib/job-financials";

export const runtime = "nodejs";

type ExtractKind = "expense" | "payment";

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

async function extractWithOpenAi(imageDataUrl: string, kind: ExtractKind) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const prompt =
    kind === "expense"
      ? 'Read this receipt. Return JSON only: {"vendor":"","amount":0,"date":"YYYY-MM-DD","memo":"","account":"materials|subcontractors|equipment_rental|dumpsters|permits|labor|fuel|office|insurance|other","method":"credit_card|debit|check|ach|cash"}'
      : 'Read this check, remit, or deposit slip. Return JSON only: {"amount":0,"date":"YYYY-MM-DD","method":"check|ACH|wire|card","reference":""}';
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content ?? "";
  return parseJsonObject(content);
}

async function extractWithAnthropic(imageDataUrl: string, kind: ExtractKind) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const match = imageDataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  const prompt =
    kind === "expense"
      ? 'Read this receipt. Return JSON only: {"vendor":"","amount":0,"date":"YYYY-MM-DD","memo":"","account":"materials|subcontractors|equipment_rental|dumpsters|permits|labor|fuel|office|insurance|other","method":"credit_card|debit|check|ach|cash"}'
      : 'Read this check, remit, or deposit slip. Return JSON only: {"amount":0,"date":"YYYY-MM-DD","method":"check|ACH|wire|card","reference":""}';
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
              source: { type: "base64", media_type: match[1], data: match[2] },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.find((part) => part.type === "text")?.text ?? "";
  return parseJsonObject(text);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { image?: unknown; kind?: unknown };
    const image = asString(body.image);
    const kind: ExtractKind = body.kind === "payment" ? "payment" : "expense";
    if (!image.startsWith("data:image")) {
      return NextResponse.json({ error: "Send a receipt photo." }, { status: 400 });
    }
    const extracted =
      (await extractWithOpenAi(image, kind)) ?? (await extractWithAnthropic(image, kind));
    if (!extracted) {
      return NextResponse.json({
        ok: false,
        source: "manual",
        message:
          "No AI key is configured (OPENAI_API_KEY or ANTHROPIC_API_KEY). Fill the fields from the photo — the image still stays on the record.",
      });
    }
    if (kind === "expense") {
      const vendor = asString(extracted.vendor);
      const accountRaw = asString(extracted.account);
      const methodRaw = asString(extracted.method);
      return NextResponse.json({
        ok: true,
        source: "ai",
        vendor,
        amount: asNumber(extracted.amount),
        date: asString(extracted.date),
        memo: asString(extracted.memo),
        account: isExpenseAccount(accountRaw) ? accountRaw : guessExpenseAccount(vendor, asString(extracted.memo)),
        method: isExpenseMethod(methodRaw) ? methodRaw : "credit_card",
      });
    }
    return NextResponse.json({
      ok: true,
      source: "ai",
      amount: asNumber(extracted.amount),
      date: asString(extracted.date),
      method: asString(extracted.method) || "check",
      reference: asString(extracted.reference),
    });
  } catch {
    return NextResponse.json({ error: "Could not read the receipt." }, { status: 500 });
  }
}
