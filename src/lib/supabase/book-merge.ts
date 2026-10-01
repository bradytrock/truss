export function overlayById<T extends { id: string }>(
  local: T[] | undefined,
  incoming: T[] | undefined,
): T[] {
  const remote = incoming ?? [];
  if (!local?.length) return remote;
  if (!remote.length) return local;
  const seen = new Set(local.map((item) => item.id));
  const extras = remote.filter((item) => !seen.has(item.id));
  return extras.length ? [...local, ...extras] : local;
}

/** Lists with no single id (calendar shares, training progress). Keep local edits. */
export function replaceIfEmpty<T>(local: T[] | undefined, incoming: T[] | undefined): T[] {
  if (local?.length) return local;
  return incoming ?? [];
}
