import { toE164 } from "../phone.ts";

/** A LiveKit SIP trunk, inbound or outbound, reduced to the fields conflict checks need. */
export type SipTrunkRef = {
  sipTrunkId?: string;
  numbers?: string[];
  allowedNumbers?: string[];
};

export function trunkErrorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return typeof error === "string" ? error : "";
}

/**
 * LiveKit rejects a new inbound trunk when another trunk already owns the called
 * number and neither has AllowedNumbers. The existing id is the second quoted id;
 * a create prints "<new>" for the trunk that was not saved.
 */
export function conflictingInboundTrunkId(message: string) {
  const match = message.match(/Conflicting inbound SIP Trunks:\s*"([^"]*)"\s+and\s+"([^"]*)"/i);
  if (!match) return "";
  const ids = [match[2], match[1]].filter((id) => id && id !== "<new>");
  return ids[0] ?? "";
}

export function trunkOwnsNumber(trunk: { numbers?: string[] }, number: string) {
  const want = toE164(number);
  if (!want) return false;
  return (trunk.numbers ?? []).some((value) => toE164(value) === want);
}

/**
 * Prefer the trunk that accepts every caller. That is the one LiveKit treats as
 * a conflict with a new trunk that also has no AllowedNumbers.
 */
export function pickTrunkForNumber<T extends SipTrunkRef>(
  trunks: Array<T | null | undefined>,
  number: string,
): T | null {
  const matches = trunks.filter((trunk): trunk is T => {
    if (!trunk?.sipTrunkId) return false;
    return trunkOwnsNumber(trunk, number);
  });
  return matches.find((trunk) => (trunk.allowedNumbers ?? []).length === 0) ?? matches[0] ?? null;
}

export async function reuseOrCreateTrunk<T extends SipTrunkRef>(options: {
  number: string;
  existingTrunkId?: string;
  getById: (id: string) => Promise<T | null>;
  listByNumber: (number: string) => Promise<Array<T | null | undefined>>;
  create: () => Promise<T>;
}): Promise<T> {
  if (options.existingTrunkId) {
    const current = await options.getById(options.existingTrunkId);
    if (current?.sipTrunkId && trunkOwnsNumber(current, options.number)) return current;
  }

  const listed = pickTrunkForNumber(await options.listByNumber(options.number), options.number);
  if (listed) return listed;

  try {
    return await options.create();
  } catch (error) {
    const conflictId = conflictingInboundTrunkId(trunkErrorText(error));
    if (conflictId) {
      const existing = await options.getById(conflictId);
      if (existing?.sipTrunkId) return existing;
    }
    throw error;
  }
}
