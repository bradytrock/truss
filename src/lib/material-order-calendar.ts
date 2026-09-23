export const MATERIAL_ORDER_EVENT_KIND = "production" as const;
export const MATERIAL_ORDER_EVENT_MARKER = "material-order:";

export function materialOrderEventMarker(orderId: string) {
  return `${MATERIAL_ORDER_EVENT_MARKER}${orderId.trim()}`;
}

export function isMaterialOrderEvent(notes: string, orderId: string) {
  const marker = materialOrderEventMarker(orderId);
  return notes.split(/\r?\n/).some((line) => line.trim() === marker);
}

export function findMaterialOrderEvent<T extends { notes: string }>(events: T[], orderId: string) {
  return events.find((event) => isMaterialOrderEvent(event.notes, orderId));
}

export function materialOrderDeliveryWindow(neededBy: string) {
  const day = neededBy.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const starts = new Date(`${day}T08:00:00`);
  if (Number.isNaN(starts.getTime())) return null;
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString() };
}

export function materialOrderDeliveryTitle(order: { number: string; vendor?: string }) {
  const vendor = order.vendor?.trim();
  return vendor ? `Material delivery · ${vendor}` : `Material delivery · ${order.number}`;
}

export function materialOrderDeliveryNotes(input: { orderId: string; number: string; notes?: string }) {
  const marker = materialOrderEventMarker(input.orderId);
  const extra = input.notes?.trim();
  return extra ? `${marker}\n${input.number}\n${extra}` : `${marker}\n${input.number}`;
}

export function materialOrderDeliveryDraft(input: {
  order: {
    id: string;
    number: string;
    vendor: string;
    notes: string;
    neededBy: string | null;
    jobId: string;
  };
  location: string;
  assignee: string;
  opportunityId: string | null;
  clientId: string | null;
}) {
  const window = materialOrderDeliveryWindow(input.order.neededBy ?? "");
  if (!window) return null;
  return {
    title: materialOrderDeliveryTitle(input.order),
    kind: MATERIAL_ORDER_EVENT_KIND,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    location: input.location,
    assignee: input.assignee,
    opportunityId: input.opportunityId,
    jobId: input.order.jobId,
    clientId: input.clientId,
    notes: materialOrderDeliveryNotes({
      orderId: input.order.id,
      number: input.order.number,
      notes: input.order.notes,
    }),
  };
}
