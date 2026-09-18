import { buildMarketingMerge } from "@/lib/marketing/merge";
import type { CompanySettings, Contact, Job, StaffMember } from "@/lib/types";
import { WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "@/lib/work-board";
import {
  AUTOMATION_MERGE_FIELDS,
  type AutomationMergeField,
} from "@/lib/automations/types";

export type AutomationMergeContext = Record<AutomationMergeField, string>;

export function emptyAutomationMerge(): AutomationMergeContext {
  return {
    companyName: "Your company",
    companyPhone: "",
    staffName: "",
    staffPhone: "",
    jobName: "",
    jobCode: "",
    jobAddress: "",
    jobCity: "",
    jobStage: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    reviewUrl: "",
  };
}

export function buildAutomationMerge(input: {
  company: CompanySettings;
  staff?: { name?: string; phone?: string } | null;
  job?: Job | null;
  contact?: Contact | null;
  stage?: WorkColumn | "";
  reviewUrl?: string;
  origin?: string;
}): AutomationMergeContext {
  const marketing = buildMarketingMerge({
    company: input.company,
    staff: input.staff as StaffMember | undefined,
    job: input.job,
    contact: input.contact,
    reviewUrl: input.reviewUrl,
    origin: input.origin,
  });
  const stage =
    input.stage ||
    (input.job ? workColumnFor(input.job) : "") ||
    "";
  return {
    companyName: marketing.companyName,
    companyPhone: marketing.companyPhone,
    staffName: marketing.staffName,
    staffPhone: marketing.staffPhone,
    jobName: marketing.jobName,
    jobCode: marketing.jobCode,
    jobAddress: marketing.jobAddress,
    jobCity: marketing.jobCity,
    jobStage: stage ? WORK_COLUMN_LABELS[stage] ?? stage : "",
    contactName: marketing.contactName,
    contactPhone: marketing.contactPhone,
    contactEmail: input.contact?.email ?? "",
    reviewUrl: marketing.reviewUrl,
  };
}

export function applyAutomationMerge(template: string, ctx: AutomationMergeContext) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!isAutomationMergeField(key)) return `{{${key}}}`;
      return ctx[key]?.trim() ? ctx[key] : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function listAutomationMergeFields(template: string) {
  const found = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template))) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function unknownAutomationMergeFields(template: string) {
  return listAutomationMergeFields(template).filter((field) => !isAutomationMergeField(field));
}

export function isAutomationMergeField(value: string): value is AutomationMergeField {
  return (AUTOMATION_MERGE_FIELDS as readonly string[]).includes(value);
}

/** GSM-7 SMS: 160 chars first segment, 153 after. UCS-2: 70 / 67. */
export function smsSegmentCount(text: string) {
  const chars = [...text].length;
  const ucs2 = /[^\x00-\x7F]/.test(text);
  if (chars === 0) return { chars: 0, segments: 0, limit: ucs2 ? 70 : 160 };
  if (ucs2) {
    if (chars <= 70) return { chars, segments: 1, limit: 70 };
    return { chars, segments: Math.ceil(chars / 67), limit: 67 };
  }
  if (chars <= 160) return { chars, segments: 1, limit: 160 };
  return { chars, segments: Math.ceil(chars / 153), limit: 153 };
}
