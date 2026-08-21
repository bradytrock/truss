import type {
  CompanySettings,
  Contact,
  Job,
  JobPhoto,
  PhotoReport,
  PhotoReportPage,
  PhotoReportPhotosPage,
  StaffMember,
} from "@/lib/types";
import { formatDate, initials } from "@/lib/format";
import { loadLogoForPdf, writePdfLetterhead } from "@/lib/letterhead-pdf";
import { PHOTO_CATEGORY_LABELS } from "@/lib/types";
import { COVER_RED, photoReportCoverModel } from "@/lib/photo-report-cover";
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

async function imageToCoverJpeg(url: string, targetW: number, targetH: number): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.crossOrigin = "anonymous";
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Could not load photo."));
      node.src = url;
    });
    const srcW = image.naturalWidth || image.width;
    const srcH = image.naturalHeight || image.height;
    if (!srcW || !srcH) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(targetW));
    canvas.height = Math.max(1, Math.round(targetH));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const scale = Math.max(canvas.width / srcW, canvas.height / srcH);
    const w = srcW * scale;
    const h = srcH * scale;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return null;
  }
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
  input: {
    report: PhotoReport;
    job: Job;
    photos: JobPhoto[];
    company: CompanySettings;
    contacts: Contact[];
    staff: StaffMember[];
    customerName: string;
  },
) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const cover = photoReportCoverModel({
    page,
    report: input.report,
    job: input.job,
    photos: input.photos,
    company: input.company,
    contacts: input.contacts,
    staff: input.staff,
    customerName: input.customerName,
  });
  const headerH = 78;
  const footerH = 228;
  const heroY = headerH;
  const heroH = height - headerH - footerH;
  const inset = 26;
  const red = COVER_RED;

  doc.setFillColor(18, 18, 18);
  doc.rect(0, heroY, width, heroH, "F");
  if (cover.hero) {
    const data = await imageToCoverJpeg(cover.hero.imageUrl, width * 2, heroH * 2);
    if (data) {
      try {
        doc.addImage(data, "JPEG", 0, heroY, width, heroH);
      } catch {
        // Gray hero already painted.
      }
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 180);
    doc.text("Assign a cover photo in the report", width / 2, heroY + heroH / 2, { align: "center" });
  }

  if (cover.street) {
    const boxW = Math.min(340, width * 0.62);
    const boxH = cover.cityLine ? 58 : 44;
    const boxX = inset;
    const boxY = heroY + heroH - boxH - 16;
    doc.setFillColor(12, 12, 12);
    doc.rect(boxX, boxY, boxW, boxH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(red.r, red.g, red.b);
    doc.text("PROPERTY INSPECTED", boxX + 12, boxY + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const street = doc.splitTextToSize(cover.street, boxW - 24);
    doc.text(street[0], boxX + 12, boxY + 30);
    if (cover.cityLine) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(cover.cityLine, boxX + 12, boxY + 44);
    }
  }

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, headerH, "F");
  doc.setFillColor(red.r, red.g, red.b);
  doc.rect(0, headerH - 2, width, 2, "F");

  const logo = input.company.logoUrl?.trim() ? await loadLogoForPdf(input.company.logoUrl) : null;
  let textX = inset;
  if (logo) {
    const maxH = 46;
    const maxW = 92;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    doc.addImage(logo.data, logo.format, inset, (headerH - 2 - h) / 2, w, h);
    textX = inset + w + 12;
  } else {
    const mark = 40;
    doc.setFillColor(16, 16, 16);
    doc.rect(inset, 18, mark, mark, "F");
    doc.setFillColor(red.r, red.g, red.b);
    doc.rect(inset, 18, 4, mark, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text(initials(input.company.name) || "TR", inset + mark / 2 + 1, 44, { align: "center" });
    textX = inset + mark + 12;
  }

  const nameMax = width - textX - 210;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(16, 16, 16);
  const nameLines = doc.splitTextToSize(cover.companyName, Math.max(120, nameMax));
  doc.text(nameLines[0], textX, 34);
  if (cover.companyTag) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(cover.companyTag, textX, 48);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(16, 16, 16);
  doc.text(cover.kicker, width - inset, 32, { align: "right" });
  doc.setFontSize(11);
  doc.setTextColor(red.r, red.g, red.b);
  doc.text(cover.reportTitle, width - inset, 48, { align: "right" });

  const footerY = height - footerH;
  doc.setFillColor(8, 8, 8);
  doc.rect(0, footerY, width, footerH, "F");

  const meta = [
    { label: "INSPECTION DATE", value: cover.inspectionDate || "—" },
    { label: "DATE OF LOSS", value: cover.dateOfLoss || "—" },
    { label: "CLAIM NUMBER", value: cover.claimNumber || "—" },
    { label: "JOB NUMBER", value: cover.jobNumber || "—" },
  ];
  const colW = (width - inset * 2) / 4;
  const metaY = footerY + 28;
  meta.forEach((item, index) => {
    const x = inset + index * colW;
    if (index > 0) {
      doc.setDrawColor(red.r, red.g, red.b);
      doc.setFillColor(red.r, red.g, red.b);
      doc.rect(x - 8, metaY - 8, 0.8, 36, "F");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(red.r, red.g, red.b);
    doc.text(item.label, x, metaY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(item.value, x, metaY + 16);
  });

  const splitX = width / 2;
  const peopleY = footerY + 84;
  doc.setDrawColor(55, 55, 55);
  doc.line(splitX, peopleY - 6, splitX, footerY + footerH - 40);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(red.r, red.g, red.b);
  doc.text("PREPARED FOR", inset, peopleY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  const forName = doc.splitTextToSize(cover.preparedForName, splitX - inset - 16);
  doc.text(forName[0], inset, peopleY + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  cover.preparedForDetail.slice(0, 2).forEach((line, index) => {
    doc.text(line, inset, peopleY + 34 + index * 12);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(red.r, red.g, red.b);
  doc.text("PREPARED BY", splitX + 16, peopleY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(cover.preparedByName, splitX + 16, peopleY + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 200);
  if (cover.preparedByTitle) doc.text(cover.preparedByTitle, splitX + 16, peopleY + 34);
  if (cover.preparedByContact) doc.text(cover.preparedByContact, splitX + 16, peopleY + 46);

  doc.setFillColor(0, 0, 0);
  doc.rect(0, height - 28, width, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(cover.footerLeft, inset, height - 12);
  if (cover.footerRight) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(170, 170, 170);
    doc.text(cover.footerRight, width - inset, height - 12, { align: "right" });
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

function stampFooter(doc: Doc, company: CompanySettings, reportTitle: string, skipFirst: boolean) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page++) {
    if (skipFirst && page === 1) continue;
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
  contacts: Contact[];
  staff: StaffMember[];
  customerName: string;
}) {
  const doc = await createDoc();
  const cache = new Map<string, string | null>();
  const pages = input.report.pages.length ? input.report.pages : [emptyFallback()];
  for (const [index, page] of pages.entries()) {
    if (index > 0) doc.addPage();
    if (page.type === "cover") {
      await drawCover(doc, page, input);
    } else if (page.type === "text") {
      await drawTextPage(doc, page, input.company);
    } else {
      await drawPhotosPage(doc, page, input.photos, cache);
    }
  }
  const title = input.report.title.trim() || "Page";
  stampFooter(doc, input.company, title, pages[0]?.type === "cover");
  const safe = title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "page";
  downloadBlob(doc.output("blob"), `${safe}.pdf`);
}

function emptyFallback(): PhotoReportPage {
  return {
    id: "empty",
    type: "text",
    heading: "Page",
    body: "Add a cover, photos, or a notes page.",
  };
}
