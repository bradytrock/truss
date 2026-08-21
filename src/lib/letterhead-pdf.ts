import type { CompanySettings } from "@/lib/types";
import { formatCompanyAddress, formatCompanyContact } from "@/lib/format";

export type PdfLetterheadDoc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

export async function loadLogoForPdf(url: string) {
  if (!url || typeof document === "undefined") return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      if (!url.startsWith("data:")) node.crossOrigin = "anonymous";
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Could not load logo."));
      node.src = url;
    });
    const maxEdge = 900;
    const naturalW = image.naturalWidth || image.width;
    const naturalH = image.naturalHeight || image.height;
    if (!naturalW || !naturalH) return null;
    const scale = Math.min(1, maxEdge / Math.max(naturalW, naturalH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalW * scale));
    canvas.height = Math.max(1, Math.round(naturalH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      data: canvas.toDataURL("image/png"),
      format: "PNG",
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

export async function writePdfLetterhead(
  doc: PdfLetterheadDoc,
  company: CompanySettings,
  y: number,
  inset = 54,
) {
  const width = doc.internal.pageSize.getWidth();
  const right = width - inset;
  const logo = company.logoUrl?.trim() ? await loadLogoForPdf(company.logoUrl) : null;
  let textX = inset;
  let logoBottom = y;
  if (logo) {
    const maxH = 52;
    const maxW = 128;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const top = y - 12;
    doc.addImage(logo.data, logo.format, inset, top, w, h);
    textX = inset + w + 14;
    logoBottom = top + h;
  }

  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(28, 28, 28);
  doc.text(company.name, textX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  const address = formatCompanyAddress(company);
  const contact = formatCompanyContact(company);
  let next = y + 14;
  if (address) {
    doc.text(address, textX, next);
    next += 12;
  }
  if (contact) {
    doc.text(contact, textX, next);
    next += 12;
  }
  if (company.licenseNumber) {
    doc.text(`License ${company.licenseNumber}`, textX, next);
    next += 12;
  }
  const bottom = Math.max(next, logoBottom + 8);
  doc.setTextColor(210, 210, 210);
  doc.line(inset, bottom + 4, right, bottom + 4);
  return bottom + 22;
}
