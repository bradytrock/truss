import assert from "node:assert/strict";
import { photoReportCoverModel } from "./photo-report-cover.ts";
import { emptyCoverPage } from "./photo-report.ts";
import type { CompanySettings, Job, PhotoReport, StaffMember } from "./types.ts";

const job = {
  id: "job_1",
  code: "J-1042",
  name: "Alvarez roof",
  primaryContactId: "",
  projectManager: "Dana Ruiz",
  ownerStaffId: "staff_office",
  street: "4418 E 32nd Ave",
  city: "Denver",
  state: "CO",
  postalCode: "80207",
  location: "",
  projectType: "roofing",
  customFields: [],
} as unknown as Job;

const company = {
  name: "Northline Roofing",
  phone: "(303) 555-0148",
  email: "office@northline.example",
  website: "https://northline.example",
  city: "Denver",
  state: "CO",
  licenseNumber: "RC-44190",
} as CompanySettings;

const office = {
  id: "staff_office",
  name: "Front Desk",
  title: "Office",
  email: "office@northline.example",
  phone: "(303) 555-0148",
} as StaffMember;

const manager = {
  id: "staff_dana",
  name: "Dana Ruiz",
  title: "Project Manager",
  email: "dana@northline.example",
  phone: "(303) 555-0110",
} as StaffMember;

const report = {
  id: "report_1",
  template: "inspection",
  createdAt: "2026-09-29T12:00:00.000Z",
  createdBy: "Front Desk",
} as PhotoReport;

const cover = photoReportCoverModel({
  page: emptyCoverPage({ title: "Alvarez roof" }),
  report,
  job,
  photos: [],
  company,
  contacts: [],
  staff: [office, manager],
  customerName: "Maria Alvarez",
});

assert.equal(cover.preparedByName, "Dana Ruiz");
assert.deepEqual(cover.preparedByDetail, ["Project Manager", "(303) 555-0110", "dana@northline.example"]);
assert.equal(cover.preparedByDetail.some((line) => line.includes("Northline Roofing")), false);
assert.equal(cover.preparedByDetail.some((line) => line.includes("office@northline.example")), false);
assert.equal("jobNumber" in cover, false);

const unnamed = photoReportCoverModel({
  page: emptyCoverPage(),
  report,
  job: { ...job, projectManager: "", ownerStaffId: "staff_dana" },
  photos: [],
  company,
  contacts: [],
  staff: [office, manager],
  customerName: "Maria Alvarez",
});
assert.equal(unnamed.preparedByName, "Dana Ruiz");
assert.equal(unnamed.preparedByDetail.includes("dana@northline.example"), true);
assert.equal(unnamed.preparedByDetail.includes("(303) 555-0148"), false);
