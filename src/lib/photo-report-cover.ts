import { documentProjectManager } from "@/lib/document-owner";
import { paperPreparedForLines } from "@/lib/document-paper";
import { formatPhone } from "@/lib/format";
import { jobAddress, parseLocation } from "@/lib/job-record";
import { pageCoverCopy, photoById } from "@/lib/photo-report";
import { namesMatch } from "@/lib/seats";
import type {
  CompanySettings,
  Contact,
  Job,
  JobPhoto,
  PhotoReport,
  PhotoReportCoverPage,
  StaffMember,
} from "@/lib/types";

export const COVER_RED = { r: 196, g: 24, b: 42 };

function fieldValue(job: Job, match: RegExp) {
  return job.customFields.find((field) => match.test(field.label))?.value.trim() ?? "";
}

function dottedDate(iso: string) {
  if (!iso.trim()) return "";
  const date = iso.includes("T") ? new Date(iso) : new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso.trim();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}.${date.getFullYear()}`;
}

function displayWebsite(website: string) {
  return website
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "")
    .toUpperCase();
}

function coverProjectManager(job: Job, staff: StaffMember[]) {
  const named = job.projectManager.trim();
  if (named) {
    const member = staff.find((item) => namesMatch(item.name, named));
    return {
      name: member?.name.trim() || named,
      title: member?.title.trim() || "Project Manager",
      email: member?.email.trim() || "",
      phone: member?.phone.trim() || "",
    };
  }
  return documentProjectManager({ job, staff });
}

export function photoReportCoverKicker(job: Job) {
  if (job.projectType === "roofing" || job.projectType === "exterior" || /\broof/i.test(job.name)) {
    return "ROOF PHOTO";
  }
  if (job.projectType === "restoration") return "RESTORATION PHOTO";
  return "PHOTO";
}

export function photoReportCoverModel(input: {
  page: PhotoReportCoverPage;
  report: PhotoReport;
  job: Job;
  photos: JobPhoto[];
  company: CompanySettings;
  contacts: Contact[];
  staff: StaffMember[];
  customerName: string;
}) {
  const { page, report, job, photos, company } = input;
  const parsed = parseLocation(jobAddress(job) || job.location || "");
  const street = (job.street.trim() || parsed.street || page.title.trim() || "Job site").toUpperCase();
  const cityLine = (
    [job.city.trim() || parsed.city, job.state.trim() || parsed.state, job.postalCode.trim() || parsed.postalCode]
      .filter(Boolean)
      .join(" ") || ""
  ).toUpperCase();

  const client = input.contacts.find((contact) => contact.id === job.primaryContactId);
  const homeowner = client?.name.trim() || page.subtitle.trim() || input.customerName;
  const claimNumber = page.showClaimNumber
    ? page.claimNumber.trim() || fieldValue(job, /claim/)
    : "";
  const dateOfLoss = page.showDateOfLoss
    ? page.dateOfLoss.trim() || fieldValue(job, /date of loss|loss date/i)
    : "";

  const manager = coverProjectManager(job, input.staff);
  const managerPhone = manager?.phone.trim() ? formatPhone(manager.phone) : "";
  const preparedByDetail = [manager?.title.trim() || "", managerPhone === "—" ? "" : managerPhone, manager?.email.trim() || ""].filter(
    Boolean,
  );

  const preparedForDetail = paperPreparedForLines({
    phone: client?.phone,
    email: client?.email,
  });

  const region = [company.city, company.state].filter(Boolean).join(" · ").toUpperCase();
  const companyTag = region || displayWebsite(company.website);

  const copy = pageCoverCopy(report.template);
  return {
    kicker: copy.kicker || photoReportCoverKicker(job),
    reportTitle: copy.reportTitle,
    companyName: company.name,
    companyTag,
    street: page.showAddress ? street : "",
    cityLine: page.showAddress ? cityLine : "",
    showInspectionDate: page.showDate,
    showDateOfLoss: page.showDateOfLoss,
    showClaimNumber: page.showClaimNumber,
    inspectionDate: page.showDate ? dottedDate(report.createdAt || new Date().toISOString()) : "",
    dateOfLoss: page.showDateOfLoss ? dottedDate(dateOfLoss) || dateOfLoss : "",
    claimNumber,
    preparedForName: homeowner || "Homeowner",
    preparedForDetail,
    preparedByName: manager?.name || "",
    preparedByDetail,
    footerLeft: company.name.toUpperCase(),
    footerRight: [displayWebsite(company.website), company.licenseNumber ? `${company.licenseNumber}` : ""]
      .filter(Boolean)
      .join("  •  "),
    hero: photoById(photos, page.heroPhotoId),
    notes: page.notes.trim(),
  };
}

export type PhotoReportCoverModel = ReturnType<typeof photoReportCoverModel>;
