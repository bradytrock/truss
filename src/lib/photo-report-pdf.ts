import type {
  CompanySettings,
  Job,
  JobPhoto,
  PhotoReport,
  PhotoReportPage,
  PhotoReportPhotosPage,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { writePdfLetterhead } from "@/lib/letterhead-pdf";
import { PHOTO_CATEGORY_LABELS } from "@/lib/types";
import { layoutCapacity, photoById } from "@/lib/photo-report";
import { downloadBlob } from "@/lib/share";

type Doc = {
  setFont: (face: string, style?: string) => void;
  setFontSize: (size: number) => void;
  setTextColor: (r: number, g?: number, b?: number) => void;
  setDrawColor: (r: number, g?: number, b?: number) => void;
  setFillColor: (r: number, g?: number, b?: number) => void;
  text: (text: string | string[], x: number, y: number, options?: { align?: "left" | "right" | "center" }) => void;
  splitTextToSize: (text: string, width: number) => string[];
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  addPage: () => void;
  addImage: (
    imageData: string,
    format: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => void;
  getImageProperties: (imageData: string) => { width: number; height: number };
  output: (type: "blob") => Blob;
  getNumberOfPages: () => number;
  setPage: (page: number) => void;
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
};

async function createDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "pt", format: "letter" }) as unknown as Doc;
}

async function imageToJpeg(url: string): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.crossOrigin = "anonymous";
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Could not load photo."));
      node.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    if (!canvas.width || !canvas.height) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}

async function writeHeader(doc: Doc, company: CompanySettings, y: number) {
  return writePdfLetterhead(doc, company, y, 48);
}

function fitImage(
  doc: Doc,
  data: string,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  try {
    const props = doc.getImageProperties(data);
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    const x = boxX + (boxW - w) / 2;
    const y = boxY + (boxH - h) / 2;
    doc.addImage(data, "JPEG", x, y, w, h);
  } catch {
    doc.setFillColor(235, 235, 235);
    doc.rect(boxX, boxY, boxW, boxH, "F");
  }
}

function captionLines(page: PhotoReportPhotosPage, photo: JobPhoto | undefined, caption: string) {
  const lines: string[] = [];
  if (page.showCaptions && caption.trim()) lines.push(caption.trim());
  const meta: string[] = [];
  if (page.showCategory && photo) meta.push(PHOTO_CATEGORY_LABELS[photo.category]);
  if (page.showTakenAt && photo?.takenAt) meta.push(formatDate(photo.takenAt));
  if (meta.length) lines.push(meta.join("  ·  "));
  return lines;
}

async function drawPhotosPage(
  doc: Doc,
  page: PhotoReportPhotosPage,
  photos: JobPhoto[],
  cache: Map<string, string | null>,
) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = width - 48;
  let y = 48;
  if (page.heading.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(28, 28, 28);
    doc.text(page.heading.trim(), left, y);
    y += 18;
  }
  const cap = layoutCapacity(page.layout);
  const items = page.items.slice(0, cap);
  const slots = Math.max(items.length, 1);
  const gap = 12;
  const captionH = page.showCaptions || page.showTakenAt || page.showCategory ? 28 : 8;
  const availableH = height - y - 56;
  const cols = page.layout === "four" ? 2 : 1;
  const rows = page.layout === "four" ? 2 : slots;
  const cellW = cols === 1 ? right - left : (right - left - gap) / 2;
  const cellH = (availableH - gap * (rows - 1)) / rows;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const col = cols === 1 ? 0 : index % 2;
    const row = cols === 1 ? index : Math.floor(index / 2);
    const x = left + col * (cellW + gap);
    const top = y + row * (cellH + gap);
    const photo = photoById(photos, item.photoId);
    const boxH = cellH - captionH;
    doc.setFillColor(245, 245, 245);
    doc.rect(x, top, cellW, boxH, "F");
    if (photo) {
      let data = cache.get(photo.imageUrl);
      if (data === undefined) {
        data = await imageToJpeg(photo.imageUrl);
        cache.set(photo.imageUrl, data);
      }
      if (data) fitImage(doc, data, x + 4, top + 4, cellW - 8, boxH - 8);
    }
    const lines = captionLines(page, photo, item.caption);
    if (lines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text(doc.splitTextToSize(lines[0], cellW), x, top + boxH + 12);
      if (lines[1]) {
        doc.setTextColor(110, 110, 110);
        doc.text(doc.splitTextToSize(lines[1], cellW), x, top + boxH + 22);
      }
    }
  }
}

async function drawCover(
  doc: Doc,
  page: Extract<PhotoReportPage, { type: "cover" }>,
  job: Job,
  photos: JobPhoto[],
  company: CompanySettings,
  cache: Map<string, string | null>,
) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  let y = await writeHeader(doc, company, 54);
  y += 24;
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.setTextColor(28, 28, 28);
  const title = doc.splitTextToSize(page.title.trim() || "Photo report", width - 96);
  doc.text(title, 48, y);
  y += title.length * 28 + 8;
  if (page.subtitle.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(70, 70, 70);
    doc.text(page.subtitle.trim(), 48, y);
    y += 18;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  if (page.showAddress) {
    const address = jobAddress(job) || job.location;
    if (address) {
      doc.text(address, 48, y);
      y += 14;
    }
  }
  if (page.showDate) {
    doc.text(formatDate(new Date().toISOString()), 48, y);
    y += 18;
  }
  const hero = photoById(photos, page.heroPhotoId);
  if (hero) {
    y += 8;
    const boxW = width - 96;
    const boxH = Math.min(320, height - y - 120);
    doc.setFillColor(245, 245, 245);
    doc.rect(48, y, boxW, boxH, "F");
    let data = cache.get(hero.imageUrl);
    if (data === undefined) {
      data = await imageToJpeg(hero.imageUrl);
      cache.set(hero.imageUrl, data);
    }
    if (data) fitImage(doc, data, 52, y + 4, boxW - 8, boxH - 8);
    y += boxH + 16;
  }
  if (page.notes.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const wrapped = doc.splitTextToSize(page.notes.trim(), width - 96);
    doc.text(wrapped, 48, y);
  }
}

async function drawTextPage(doc: Doc, page: Extract<PhotoReportPage, { type: "text" }>, company: CompanySettings) {
  let y = await writeHeader(doc, company, 54);
  if (page.heading.trim()) {
    doc.setFont("times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(28, 28, 28);
    const heading = doc.splitTextToSize(page.heading.trim(), 514);
    doc.text(heading, 48, y);
    y += heading.length * 22 + 10;
  }
  if (page.body.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    const wrapped = doc.splitTextToSize(page.body.trim(), 514);
    doc.text(wrapped, 48, y);
  }
}

function stampFooter(doc: Doc, company: CompanySettings, reportTitle: string) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(220, 220, 220);
    doc.line(48, height - 36, width - 48, height - 36);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(company.name, 48, height - 22);
    doc.text(reportTitle, width / 2, height - 22, { align: "center" });
    doc.text(`${page} / ${pages}`, width - 48, height - 22, { align: "right" });
  }
}

export async function downloadPhotoReportPdf(input: {
  report: PhotoReport;
  job: Job;
  photos: JobPhoto[];
  company: CompanySettings;
}) {
  const doc = await createDoc();
  const cache = new Map<string, string | null>();
  const pages = input.report.pages.length ? input.report.pages : [emptyFallback()];
  for (const [index, page] of pages.entries()) {
    if (index > 0) doc.addPage();
    if (page.type === "cover") {
      await drawCover(doc, page, input.job, input.photos, input.company, cache);
    } else if (page.type === "text") {
      await drawTextPage(doc, page, input.company);
    } else {
      await drawPhotosPage(doc, page, input.photos, cache);
    }
  }
  const title = input.report.title.trim() || "Photo report";
  stampFooter(doc, input.company, title);
  const safe = title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "photo-report";
  downloadBlob(doc.output("blob"), `${safe}.pdf`);
}

function emptyFallback(): PhotoReportPage {
  return {
    id: "empty",
    type: "text",
    heading: "Photo report",
    body: "Add a cover, photos, or a notes page.",
  };
}
