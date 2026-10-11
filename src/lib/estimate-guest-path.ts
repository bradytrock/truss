/** Staff writer URLs look like /estimates/<uuid>. Homeowners should never land there. */
const STAFF_ESTIMATE_PATH =
  /^\/estimates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

/** Only a path this function returns is safe to redirect a signed-out visitor to. */
const GUEST_SHARE_PATH = /^\/share\/e\/[A-Za-z0-9_-]+$/;

export function estimateIdFromStaffPath(pathname: string) {
  return pathname.match(STAFF_ESTIMATE_PATH)?.[1] ?? null;
}

export function isGuestEstimateSharePath(value: unknown): value is string {
  return typeof value === "string" && GUEST_SHARE_PATH.test(value);
}
