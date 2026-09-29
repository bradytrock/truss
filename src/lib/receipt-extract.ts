/** Claude Sonnet 4 (`claude-sonnet-4-20250514`) was retired on June 15, 2026. */
export const ANTHROPIC_RECEIPT_MODELS = ["claude-sonnet-4-6", "claude-sonnet-5"] as const;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type ReceiptUpload =
  | {
      ok: true;
      kind: "image";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      data: string;
    }
  | { ok: true; kind: "pdf"; mediaType: "application/pdf"; data: string }
  | { ok: false; error: string };

export type ProviderMiss = { ok: false; error: string; missingKey?: boolean; skipped?: boolean };

export function isReceiptUpload(file: { type: string; name: string }) {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return true;
  return false;
}

export function parseReceiptDataUrl(dataUrl: string): ReceiptUpload {
  const match = dataUrl.trim().match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (!match) return { ok: false, error: "Send a JPEG, PNG, or PDF of the receipt." };
  let mediaType = match[1].toLowerCase();
  if (mediaType === "image/jpg" || mediaType === "image/pjpeg") mediaType = "image/jpeg";
  const data = match[2].replace(/\s+/g, "");
  if (!data) return { ok: false, error: "That file was empty." };
  if (mediaType === "application/pdf") {
    return { ok: true, kind: "pdf", mediaType: "application/pdf", data };
  }
  if (mediaType === "image/heic" || mediaType === "image/heif") {
    return {
      ok: false,
      error: "HEIC photos are not sent to Anthropic. Export a JPEG or PDF, then try again.",
    };
  }
  if (!IMAGE_TYPES.has(mediaType)) {
    return { ok: false, error: "Send a JPEG, PNG, or PDF of the receipt." };
  }
  return {
    ok: true,
    kind: "image",
    mediaType: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
    data,
  };
}

export function anthropicFileBlock(upload: Extract<ReceiptUpload, { ok: true }>) {
  if (upload.kind === "pdf") {
    return {
      type: "document" as const,
      source: {
        type: "base64" as const,
        media_type: "application/pdf" as const,
        data: upload.data,
      },
    };
  }
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: upload.mediaType,
      data: upload.data,
    },
  };
}

export function anthropicReceiptBody(
  model: string,
  prompt: string,
  upload: Extract<ReceiptUpload, { ok: true }>,
) {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }, anthropicFileBlock(upload)],
      },
    ],
  };
  // Sonnet 5 spends the token budget on adaptive thinking unless it is turned off.
  if (model === "claude-sonnet-5" || model.startsWith("claude-sonnet-5-")) {
    body.thinking = { type: "disabled" };
  }
  return body;
}

export function shouldRetryAnthropicModel(status: number, detail: string) {
  const text = detail.toLowerCase();
  if (status === 404) return true;
  return (
    text.includes("not_found") ||
    text.includes("model_not_found") ||
    text.includes("deprecated") ||
    text.includes("retired") ||
    (text.includes("model") && text.includes("does not exist"))
  );
}

export function anthropicUserError(status: number, detail: string) {
  const text = detail.toLowerCase();
  if (status === 401 || text.includes("invalid x-api-key") || text.includes("authentication_error")) {
    return "ANTHROPIC_API_KEY on this host is not valid.";
  }
  if (status === 429 || text.includes("rate limit")) {
    return "Anthropic is rate-limiting. Try again in a moment.";
  }
  if (status === 413 || text.includes("too large") || text.includes("request size")) {
    return "That file is too large for Anthropic. Try a closer shot or a shorter PDF.";
  }
  if (shouldRetryAnthropicModel(status, detail)) {
    return "Anthropic rejected the receipt model. Try again in a moment.";
  }
  return "Anthropic could not read that file. Try a clearer shot of the vendor and total.";
}

export function explainReceiptFailure(openai: ProviderMiss | null, anthropic: ProviderMiss | null) {
  const openaiReal = openai && !openai.skipped ? openai : null;
  if (openaiReal?.missingKey && (!anthropic || anthropic.missingKey)) {
    return "No AI key is configured on this host (OPENAI_API_KEY, or ANTHROPIC_API_KEY as a fallback). Fill the fields from the photo — the image still stays on the record.";
  }
  if (!openaiReal || openaiReal.missingKey) {
    return anthropic?.error ?? openaiReal?.error ?? "Could not read the receipt.";
  }
  if (!anthropic || anthropic.missingKey || anthropic.skipped) return openaiReal.error;
  if (openaiReal.error === anthropic.error) return anthropic.error;
  return `${anthropic.error} ${openaiReal.error}`;
}
