import { geocodeAddress } from "@/lib/geocode-server";
import { googleMapsApiKey } from "@/lib/address-suggest-server";
import { isValidLatLng, jobSiteQuery } from "@/lib/project-map-logic";
import {
  SATELLITE_CSS_SIZE,
  SATELLITE_SCALE,
  SATELLITE_ZOOM,
  drawingFromRoofTrace,
  imagePixelSize,
  satelliteFeetPerPixel,
} from "@/lib/roof-measure-satellite";
import { ANTHROPIC_RECEIPT_MODELS, shouldRetryAnthropicModel } from "@/lib/receipt-extract";
import { uploadObject } from "@/lib/storage/object-store";
import type { RoofDrawing } from "@/lib/roof-measure";

export type SatelliteMeasureResult = {
  imagePath: string;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  contentType: string;
  feetPerPixel: number;
  drawing: RoofDrawing;
  warning: string;
};

const TRACE_PROMPT = `You are tracing the roof of the building in the center of this satellite photo. North is up.
Return JSON only, no markdown:
{"facets":[{"pitchRise":6,"points":[{"x":0.42,"y":0.31,"toNext":"eave"}]}]}
Rules:
- x and y are fractions of the image width and height, origin at the top-left, each between 0 and 1.
- Trace only the main house roof at the center. Skip trees, shadows, driveways, cars, and neighboring roofs.
- One facet is one flat plane of the roof. Use 3 to 8 corners. Order them around the plane.
- Corners shared by two planes must use the same x and y.
- toNext is the edge from that corner to the next corner: ridge, hip, valley, eave, rake, drip, flashing, step_flashing, or parapet.
- Ridges and hips are the high lines. Eaves are the low outer edges. Valleys are the inside corners where planes meet.
- pitchRise is the rise over 12. Asphalt roofs are usually 4 to 8. A flat roof is 0.
- If you cannot see a roof, return {"facets":[]}.`;

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function stripKey(text: string, key: string) {
  return (key ? text.replaceAll(key, "…") : text).slice(0, 180);
}

export async function fetchSatelliteImage(lat: number, lng: number) {
  const key = googleMapsApiKey();
  if (!key) {
    return { ok: false as const, error: "Add GOOGLE_MAPS_API_KEY on the host to pull a satellite photo." };
  }
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("center", `${lat},${lng}`);
  url.searchParams.set("zoom", String(SATELLITE_ZOOM));
  url.searchParams.set("size", `${SATELLITE_CSS_SIZE}x${SATELLITE_CSS_SIZE}`);
  url.searchParams.set("scale", String(SATELLITE_SCALE));
  url.searchParams.set("maptype", "satellite");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/") || bytes.length < 100) {
    const detail = stripKey(new TextDecoder().decode(bytes.slice(0, 240)), key);
    return {
      ok: false as const,
      error: detail
        ? `Google Maps did not return a satellite photo. ${detail}`
        : "Google Maps did not return a satellite photo. Enable the Maps Static API for this key.",
    };
  }
  const size = imagePixelSize(bytes) ?? {
    width: SATELLITE_CSS_SIZE * SATELLITE_SCALE,
    height: SATELLITE_CSS_SIZE * SATELLITE_SCALE,
  };
  const contentType = type.includes("jpeg") ? "image/jpeg" : "image/png";
  return { ok: true as const, bytes, contentType, width: size.width, height: size.height };
}

async function traceWithOpenAi(dataUrl: string): Promise<{ ok: true; trace: unknown } | { ok: false; error: string; missingKey?: boolean }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { ok: false, error: "OPENAI_API_KEY is not set on this host.", missingKey: true };
  const models = ["gpt-4o", "gpt-4o-mini"];
  let lastError = "OpenAI could not trace that roof.";
  for (const model of models) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: TRACE_PROMPT },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      lastError = "OpenAI could not trace that roof.";
      if (response.status === 404 || detail.toLowerCase().includes("model")) continue;
      return { ok: false, error: lastError };
    }
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = parseJsonObject(body.choices?.[0]?.message?.content ?? "");
    if (!parsed) {
      lastError = "The model did not return a roof trace.";
      continue;
    }
    return { ok: true, trace: parsed };
  }
  return { ok: false, error: lastError };
}

async function traceWithAnthropic(dataUrl: string, mediaType: "image/jpeg" | "image/png") {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { ok: false as const, error: "ANTHROPIC_API_KEY is not set on this host.", missingKey: true };
  const data = dataUrl.split(",")[1] ?? "";
  let lastError = "Anthropic could not trace that roof.";
  for (const model of ANTHROPIC_RECEIPT_MODELS) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 2500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TRACE_PROMPT },
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
          ],
        },
      ],
    };
    if (model === "claude-sonnet-5" || model.startsWith("claude-sonnet-5-")) {
      body.thinking = { type: "disabled" };
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (shouldRetryAnthropicModel(response.status, detail)) continue;
      return { ok: false as const, error: lastError };
    }
    const payload = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = payload.content?.find((part) => part.type === "text")?.text ?? "";
    const parsed = parseJsonObject(text);
    if (!parsed) {
      lastError = "Anthropic did not return a roof trace.";
      continue;
    }
    return { ok: true as const, trace: parsed };
  }
  return { ok: false as const, error: lastError };
}

export async function traceSatelliteRoof(input: {
  lat: number;
  lng: number;
  companyId: string;
  jobId: string;
}): Promise<{ ok: true; result: SatelliteMeasureResult } | { ok: false; error: string }> {
  const image = await fetchSatelliteImage(input.lat, input.lng);
  if (!image.ok) return image;
  const feetPerPixel = satelliteFeetPerPixel(
    input.lat,
    SATELLITE_ZOOM,
    image.width / SATELLITE_CSS_SIZE,
  );
  const mediaType = image.contentType === "image/jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  const openai = await traceWithOpenAi(dataUrl);
  const traced = openai.ok ? openai : await traceWithAnthropic(dataUrl, mediaType);
  const drawing = drawingFromRoofTrace({
    trace: traced.ok ? traced.trace : { facets: [] },
    imageWidth: image.width,
    imageHeight: image.height,
    feetPerPixel,
  });
  const ext = mediaType === "image/jpeg" ? "jpg" : "png";
  let imagePath = "";
  try {
    const uploaded = await uploadObject({
      companyId: input.companyId,
      kind: "job-files",
      path: `roof/${input.jobId}/satellite.${ext}`,
      body: Buffer.from(image.bytes),
      contentType: mediaType,
    });
    imagePath = uploaded.storagePath;
  } catch {
    imagePath = "";
  }
  let warning = "";
  if (!traced.ok) {
    warning = traced.missingKey
      ? "Satellite photo is ready. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) on the host to trace the roof."
      : "Satellite photo is ready. The trace did not come back, so draw the planes yourself.";
  } else if (drawing.facets.length === 0) {
    warning = "Satellite photo is ready. No roof planes were found — draw them, or try again.";
  }
  return {
    ok: true,
    result: {
      imagePath,
      imageDataUrl: imagePath ? "" : dataUrl,
      imageWidth: image.width,
      imageHeight: image.height,
      contentType: mediaType,
      feetPerPixel,
      drawing,
      warning,
    },
  };
}

export function coordsForJob(job: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const lat = Number(job.lat);
  const lng = Number(job.lng);
  if (isValidLatLng(lat, lng) && !(lat === 0 && lng === 0)) return { lat, lng, query: "" };
  const query = jobSiteQuery({
    street: job.street ?? "",
    city: job.city ?? "",
    state: job.state ?? "",
    postalCode: job.postalCode ?? job.postal_code ?? "",
    location: job.location ?? "",
  });
  return { lat: null, lng: null, query };
}

export async function resolveJobCoords(job: Parameters<typeof coordsForJob>[0]) {
  const known = coordsForJob(job);
  if (known.lat != null && known.lng != null) return { lat: known.lat, lng: known.lng };
  if (!known.query) return null;
  return geocodeAddress(known.query);
}
