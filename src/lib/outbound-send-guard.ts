/** Prevents two identical outbound texts from leaving at once (double Enter, double click). */

const inflight = new Map<string, Promise<boolean>>();

export function outboundSendKey(to: string, content: string) {
  return `${to.trim()}|${content.trim()}`;
}

/**
 * Runs `send` once per key. A second call with the same key while the first
 * is still open returns the first promise instead of sending again.
 */
export function withOutboundSendGuard(key: string, send: () => Promise<boolean>) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = send().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

/** Test helper — clears in-flight keys between cases. */
export function resetOutboundSendGuard() {
  inflight.clear();
}
