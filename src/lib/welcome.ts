export const WELCOME_SESSION_KEY = "truss.welcome.pending";
export const WELCOME_SEEN_PREFIX = "truss.welcome.seen:";

export function welcomeSeenKey(userId: string) {
  return `${WELCOME_SEEN_PREFIX}${userId}`;
}

export function isWelcomePendingMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return false;
  const value = (metadata as { welcome_pending?: unknown }).welcome_pending;
  return value === true || value === "true";
}

export function shouldOpenWelcome(input: {
  alreadySeen: boolean;
  sessionPending: boolean;
  metadataPending: boolean;
  force?: boolean;
}) {
  if (input.force) return true;
  if (input.alreadySeen) return false;
  return input.sessionPending || input.metadataPending;
}

export function signupUserMetadata(input: {
  fullName: string;
  company: string;
  title: string;
  inviteToken?: string;
}) {
  return {
    full_name: input.fullName,
    company: input.company,
    title: input.title,
    welcome_pending: true,
    ...(input.inviteToken ? { invite_token: input.inviteToken } : {}),
  };
}

export function queueFirstWelcome(storage: Pick<Storage, "setItem"> | null = defaultSession()) {
  storage?.setItem(WELCOME_SESSION_KEY, "1");
}

export function peekWelcomePending(storage: Pick<Storage, "getItem"> | null = defaultSession()) {
  return storage?.getItem(WELCOME_SESSION_KEY) === "1";
}

export function clearWelcomePending(storage: Pick<Storage, "removeItem"> | null = defaultSession()) {
  storage?.removeItem(WELCOME_SESSION_KEY);
}

export function hasSeenWelcome(
  userId: string,
  storage: Pick<Storage, "getItem"> | null = defaultLocal(),
) {
  if (!userId) return false;
  return storage?.getItem(welcomeSeenKey(userId)) === "1";
}

export function markWelcomeSeen(
  userId: string,
  local: Pick<Storage, "setItem"> | null = defaultLocal(),
  session: Pick<Storage, "removeItem"> | null = defaultSession(),
) {
  if (userId) local?.setItem(welcomeSeenKey(userId), "1");
  clearWelcomePending(session);
}

function defaultSession() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function defaultLocal() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
