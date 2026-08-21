export const COMPANY_ASSETS_BUCKET = "company-assets";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function logoExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName === "jpg" || fromName === "jpeg" || fromName === "png" || fromName === "webp" || fromName === "gif") {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "png";
}

export function validateLogoFile(file: File) {
  if (!LOGO_TYPES.has(file.type)) {
    return "Use a PNG, JPG, WebP, or GIF.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Keep the logo under 2 MB.";
  }
  return null;
}
