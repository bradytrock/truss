export const FIELD_SEARCH_EVENT = "field-search";
export const FIELD_CREATE_EVENT = "field-create";
export const FIELD_NOTE_EVENT = "field-note";

export const FIELD = {
  bg: "#0c0c0e",
  card: "#1c1c1f",
  raised: "#2a2a2e",
  red: "#e23b32",
  green: "#3ddc84",
  muted: "#8e8e93",
  blue: "#2f6fed",
} as const;

export type FieldCreateKind = "opportunity" | "client" | "invoice" | "event" | "task" | "estimate";

export type FieldCreateDetail = {
  kind: FieldCreateKind;
  jobId?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  clientId?: string | null;
};

export type FieldNoteDetail = {
  entityType: "job" | "opportunity";
  entityId: string;
  label: string;
};

export function openFieldSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FIELD_SEARCH_EVENT));
}

export function openFieldCreate(detail: FieldCreateDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FieldCreateDetail>(FIELD_CREATE_EVENT, { detail }));
}

export function openFieldNote(detail: FieldNoteDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FieldNoteDetail>(FIELD_NOTE_EVENT, { detail }));
}
