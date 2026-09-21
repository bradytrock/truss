export function isArchivedPaper(item?: { archivedAt?: string | null } | null) {
  return Boolean(item?.archivedAt);
}

export function livePaper<T extends { archivedAt?: string | null }>(items: T[]) {
  return items.filter((item) => !isArchivedPaper(item));
}

export function archivedPaper<T extends { archivedAt?: string | null }>(items: T[]) {
  return items.filter((item) => isArchivedPaper(item));
}

export function archiveStamp(now = new Date()) {
  return now.toISOString();
}
