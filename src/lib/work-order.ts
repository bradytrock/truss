import { formatJobSite } from "@/lib/leads";
import type {
  Job,
  PhotoReportWorkOrderPage,
  WorkOrderChecklistItem,
  WorkOrderField,
  WorkOrderFieldKey,
} from "@/lib/types";

export const DEFAULT_WORK_ORDER_TASKS = [
  "Confirm materials on site",
  "Protect landscaping & AC unit",
  "Complete tear-off & dry-in",
  "Final nail sweep & photos",
] as const;

export function workOrderPropertyFromJob(
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location">,
) {
  return formatJobSite(job) || job.location.trim() || "";
}

export function workOrderCrewFromJob(job: Pick<Job, "assigned" | "superintendent">) {
  const assigned = job.assigned.map((name) => name.trim()).filter(Boolean);
  if (assigned.length > 0) return assigned.join(", ");
  return job.superintendent.trim();
}

export function workOrderStartDateFromJob(job: Pick<Job, "startDate">) {
  return job.startDate.trim();
}

export function workOrderFieldValue(
  field: WorkOrderField,
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location" | "assigned" | "superintendent" | "startDate">,
) {
  const stored = field.value.trim();
  if (stored) return field.value;
  if (field.key === "property") return workOrderPropertyFromJob(job);
  if (field.key === "crew") return workOrderCrewFromJob(job);
  if (field.key === "startDate") return workOrderStartDateFromJob(job);
  return "";
}

export function canRemoveWorkOrderField(field: WorkOrderField) {
  return !field.locked;
}

export function canRemoveWorkOrderItem(item: WorkOrderChecklistItem) {
  return !item.locked;
}

export function newWorkOrderPartId() {
  return crypto.randomUUID();
}

function field(
  key: Exclude<WorkOrderFieldKey, "custom">,
  label: string,
  value: string,
): WorkOrderField {
  return {
    id: newWorkOrderPartId(),
    key,
    label,
    value,
    locked: true,
  };
}

export function emptyWorkOrderPage(
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location" | "assigned" | "superintendent" | "startDate">,
  input?: Partial<PhotoReportWorkOrderPage>,
): PhotoReportWorkOrderPage {
  return {
    id: input?.id || newWorkOrderPartId(),
    type: "work_order",
    heading: input?.heading ?? "Work Order",
    fields:
      input?.fields ?? [
        field("crew", "Crew", workOrderCrewFromJob(job)),
        field("startDate", "Start date", workOrderStartDateFromJob(job)),
        field("property", "Property", workOrderPropertyFromJob(job)),
      ],
    tasksHeading: input?.tasksHeading ?? "Tasks",
    items:
      input?.items ??
      DEFAULT_WORK_ORDER_TASKS.map((text) => ({
        id: newWorkOrderPartId(),
        text,
        done: false,
        locked: true,
      })),
  };
}

export function fillWorkOrderFromJob(
  page: PhotoReportWorkOrderPage,
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location" | "assigned" | "superintendent" | "startDate">,
): PhotoReportWorkOrderPage {
  let changed = false;
  const fields = page.fields.map((item) => {
    if (item.value.trim()) return item;
    const next =
      item.key === "property"
        ? workOrderPropertyFromJob(job)
        : item.key === "crew"
          ? workOrderCrewFromJob(job)
          : item.key === "startDate"
            ? workOrderStartDateFromJob(job)
            : "";
    if (!next) return item;
    changed = true;
    return { ...item, value: next };
  });
  return changed ? { ...page, fields } : page;
}

export function addWorkOrderField(page: PhotoReportWorkOrderPage, label = "Field"): PhotoReportWorkOrderPage {
  return {
    ...page,
    fields: [
      ...page.fields,
      {
        id: newWorkOrderPartId(),
        key: "custom",
        label,
        value: "",
        locked: false,
      },
    ],
  };
}

export function addWorkOrderItem(page: PhotoReportWorkOrderPage, text = ""): PhotoReportWorkOrderPage {
  return {
    ...page,
    items: [
      ...page.items,
      {
        id: newWorkOrderPartId(),
        text,
        done: false,
        locked: false,
      },
    ],
  };
}

export function removeWorkOrderField(
  page: PhotoReportWorkOrderPage,
  fieldId: string,
): PhotoReportWorkOrderPage {
  const target = page.fields.find((item) => item.id === fieldId);
  if (!target || !canRemoveWorkOrderField(target)) return page;
  return { ...page, fields: page.fields.filter((item) => item.id !== fieldId) };
}

export function removeWorkOrderItem(
  page: PhotoReportWorkOrderPage,
  itemId: string,
): PhotoReportWorkOrderPage {
  const target = page.items.find((item) => item.id === itemId);
  if (!target || !canRemoveWorkOrderItem(target)) return page;
  return { ...page, items: page.items.filter((item) => item.id !== itemId) };
}

export function patchWorkOrderField(
  page: PhotoReportWorkOrderPage,
  fieldId: string,
  patch: Partial<Pick<WorkOrderField, "label" | "value">>,
): PhotoReportWorkOrderPage {
  return {
    ...page,
    fields: page.fields.map((item) => (item.id === fieldId ? { ...item, ...patch } : item)),
  };
}

export function patchWorkOrderItem(
  page: PhotoReportWorkOrderPage,
  itemId: string,
  patch: Partial<Pick<WorkOrderChecklistItem, "text" | "done">>,
): PhotoReportWorkOrderPage {
  return {
    ...page,
    items: page.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function parseFieldKey(value: unknown): WorkOrderFieldKey {
  if (value === "crew" || value === "startDate" || value === "property" || value === "custom") {
    return value;
  }
  return "custom";
}

export function parseWorkOrderPage(raw: unknown, fallbackId: string): PhotoReportWorkOrderPage | null {
  const row = asRecord(raw);
  if (!row || row.type !== "work_order") return null;
  const fields = Array.isArray(row.fields)
    ? row.fields
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => {
          const key = parseFieldKey(entry.key);
          return {
            id: asString(entry.id, newWorkOrderPartId()),
            key,
            label: asString(entry.label, key === "custom" ? "Field" : key),
            value: asString(entry.value),
            locked: asBool(entry.locked, key !== "custom"),
          } satisfies WorkOrderField;
        })
    : [];
  const items = Array.isArray(row.items)
    ? row.items
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          id: asString(entry.id, newWorkOrderPartId()),
          text: asString(entry.text),
          done: asBool(entry.done, false),
          locked: asBool(entry.locked, false),
        }))
    : [];
  return {
    id: asString(row.id, fallbackId),
    type: "work_order",
    heading: asString(row.heading, "Work Order"),
    fields,
    tasksHeading: asString(row.tasksHeading, "Tasks"),
    items,
  };
}
