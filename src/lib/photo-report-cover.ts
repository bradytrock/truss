import { jobAddress, parseLocation } from "@/lib/job-record";
import { photoById } from "@/lib/photo-report";
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

function isAdjuster(contact: Contact) {
  const blob = `${contact.title} ${contact.name}`.toLowerCase();
  return blob.includes("adjuster") || contact.title.toLowerCase() === "insurance";
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

  const homeowner =
    input.contacts.find((contact) => contact.id === job.primaryContactId)?.name.trim() ||
    page.subtitle.trim() ||
    input.customerName;
  const adjuster = input.contacts.find(
    (contact) =>
      (job.relatedContactIds.includes(contact.id) || contact.id === job.primaryContactId) && isAdjuster(contact),
  );
  const carrier = fieldValue(job, /carrier|insurance company|insurance carrier/i);
  const claimNumber = page.claimNumber.trim() || fieldValue(job, /claim/);
  const dateOfLoss = page.dateOfLoss.trim() || fieldValue(job, /date of loss|loss date/i);

  const author =
    input.staff.find((member) => member.name === report.createdBy) ||
    input.staff.find((member) => member.id === job.ownerStaffId) ||
    input.staff.find((member) => member.name === job.projectManager);
  const preparedByName = author?.name || report.createdBy || job.projectManager || company.name;
  const preparedByTitle = [author?.title || (job.projectManager ? "Project manager" : ""), company.name]
    .filter(Boolean)
    .join(" · ");
  const preparedByContact = [company.phone, company.email].filter(Boolean).join(" · ");

  const preparedForDetail = [
    carrier,
    adjuster ? [adjuster.name, adjuster.phone].filter(Boolean).join(" · ") : "",
  ].filter(Boolean);

  const region = [company.city, company.state].filter(Boolean).join(" · ").toUpperCase();
  const companyTag = region || displayWebsite(company.website);

  return {
    kicker: photoReportCoverKicker(job),
    reportTitle: "DOCUMENTATION REPORT",
    companyName: company.name,
    companyTag,
    street: page.showAddress ? street : "",
    cityLine: page.showAddress ? cityLine : "",
    inspectionDate: page.showDate ? dottedDate(report.createdAt || new Date().toISOString()) : "",
    dateOfLoss: dottedDate(dateOfLoss) || dateOfLoss,
    claimNumber,
    jobNumber: job.code || "",
    preparedForName: homeowner || "Homeowner",
    preparedForDetail,
    preparedByName,
    preparedByTitle,
    preparedByContact,
    footerLeft: company.name.toUpperCase(),
    footerRight: [displayWebsite(company.website), company.licenseNumber ? `${company.licenseNumber}` : ""]
      .filter(Boolean)
      .join("  •  "),
    hero: photoById(photos, page.heroPhotoId),
    notes: page.notes.trim(),
  };
}

export type PhotoReportCoverModel = ReturnType<typeof photoReportCoverModel>;
