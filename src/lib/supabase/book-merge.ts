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

function isIdList(value: unknown): value is { id: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string",
    )
  );
}

/**
 * Keep `preferred` for these ids (including a local delete or insert).
 * Every other row comes from `base`.
 */
export function preferIdList<T extends { id: string }>(
  base: readonly T[],
  preferred: readonly T[],
  ids: ReadonlySet<string>,
): T[] {
  if (ids.size === 0) return base as T[];
  const preferredById = new Map<string, T>();
  for (const item of preferred) {
    if (ids.has(item.id)) preferredById.set(item.id, item);
  }
  let changed = false;
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of base) {
    seen.add(item.id);
    if (!ids.has(item.id)) {
      result.push(item);
      continue;
    }
    const kept = preferredById.get(item.id);
    if (!kept) {
      changed = true;
      continue;
    }
    if (kept !== item) changed = true;
    result.push(kept);
  }
  for (const item of preferred) {
    if (!ids.has(item.id) || seen.has(item.id)) continue;
    changed = true;
    result.push(item);
  }
  return changed ? result : (base as T[]);
}

/** A server snapshot must not wipe rows this desk just edited. */
export function preferRows<T extends object>(base: T, preferred: T, ids: readonly string[]): T {
  const dirty = new Set(ids.filter((id) => id.length > 0));
  if (dirty.size === 0) return base;
  let next: T | null = null;
  for (const key of Object.keys(base) as (keyof T)[]) {
    const baseList = base[key];
    const preferredList = preferred[key];
    if (!isIdList(baseList) || !isIdList(preferredList)) continue;
    const merged = preferIdList(baseList, preferredList, dirty);
    if (merged === baseList) continue;
    if (!next) next = { ...base };
    next[key] = merged as T[keyof T];
  }
  return next ?? base;
}

/** Lists with no single id (calendar shares, training progress). Keep local edits. */
export function replaceIfEmpty<T>(local: T[] | undefined, incoming: T[] | undefined): T[] {
  if (local?.length) return local;
  return incoming ?? [];
}
