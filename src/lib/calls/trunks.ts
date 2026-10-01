import { toE164 } from "../phone.ts";

export function trunkListsNumber(trunk: { numbers?: string[] }, number: string) {
  const target = toE164(number);
  if (!target) return false;
  return (trunk.numbers ?? []).some((value) => toE164(value) === target);
}

/**
 * Inbound trunks that list the same DID conflict unless each one sets a caller
 * allow-list. Reuse the trunk that already owns the number.
 */
export function pickTrunkForNumber<T extends { sipTrunkId: string; numbers?: string[] }>(
  trunks: T[],
  number: string,
  preferredId?: string,
): T | undefined {
  const matches = trunks.filter((trunk) => trunkListsNumber(trunk, number));
  if (!matches.length) return undefined;
  if (preferredId) {
    const preferred = matches.find((trunk) => trunk.sipTrunkId === preferredId);
    if (preferred) return preferred;
  }
  return matches[0];
}

export function pickDispatchRuleForTrunk<
  T extends { sipDispatchRuleId: string; trunkIds?: string[] },
>(rules: T[], trunkId: string, preferredId?: string): T | undefined {
  const id = trunkId.trim();
  if (!id) return undefined;
  const matches = rules.filter((rule) => (rule.trunkIds ?? []).includes(id));
  if (!matches.length) return undefined;
  if (preferredId) {
    const preferred = matches.find((rule) => rule.sipDispatchRuleId === preferredId);
    if (preferred) return preferred;
  }
  return matches[0];
}

export function isSipTrunkNumberConflict(error: unknown) {
  let extra = "";
  if (error && typeof error === "object" && "metadata" in error) {
    try {
      extra = JSON.stringify((error as { metadata?: unknown }).metadata ?? "");
    } catch {
      extra = "";
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /conflicting (inbound|outbound) sip trunks/i.test(`${message} ${extra}`);
}
