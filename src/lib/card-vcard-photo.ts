import type { VcardPhotoEmbed } from "@/lib/card";
import { LOGO_MAX_BYTES } from "@/lib/company-logo";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function parseDataUrl(url: string): { mime: string; base64: string } | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(url.trim());
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2].replace(/\s+/g, "") };
}

function mimeToVcardType(mime: string): VcardPhotoEmbed["type"] | null {
  if (mime === "image/jpeg" || mime === "image/jpg") return "JPEG";
  if (mime === "image/png") return "PNG";
  return null;
}

async function blobToVcardPhoto(blob: Blob): Promise<VcardPhotoEmbed | null> {
  if (blob.size <= 0 || blob.size > LOGO_MAX_BYTES) return null;
  const direct = mimeToVcardType(blob.type);
  if (direct) {
    return { type: direct, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  }

  // WebP/GIF and unknown types: re-encode so iOS/Android Contacts accept the photo.
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.9);
    });
    if (!jpeg || jpeg.size > LOGO_MAX_BYTES) return null;
    return { type: "JPEG", base64: bytesToBase64(new Uint8Array(await jpeg.arrayBuffer())) };
  } catch {
    return null;
  }
}

async function fetchPhotoBlob(url: string): Promise<Blob | null> {
  // Same-origin proxy avoids CORS blocks on Supabase storage.
  try {
    const proxied = await fetch(`/api/cards/photo?src=${encodeURIComponent(url)}`);
    if (proxied.ok) {
      const blob = await proxied.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // Fall through to a direct fetch.
  }
  try {
    const direct = await fetch(url, { mode: "cors" });
    if (!direct.ok) return null;
    return await direct.blob();
  } catch {
    return null;
  }
}

/**
 * Load the seat headshot as an embedded PHOTO for a downloaded .vcf.
 * Phones routinely drop PHOTO;VALUE=URI, so we ship the bytes when we can.
 */
export async function embedVcardPhoto(photoUrl: string): Promise<VcardPhotoEmbed | null> {
  const url = photoUrl.trim();
  if (!url) return null;

  const data = parseDataUrl(url);
  if (data) {
    const type = mimeToVcardType(data.mime);
    if (type) return { type, base64: data.base64 };
    // data:image/webp — decode and re-encode via canvas.
    try {
      const binary = atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return blobToVcardPhoto(new Blob([bytes], { type: data.mime }));
    } catch {
      return null;
    }
  }

  if (!/^https?:\/\//i.test(url)) return null;
  const blob = await fetchPhotoBlob(url);
  if (!blob) return null;
  return blobToVcardPhoto(blob);
}
