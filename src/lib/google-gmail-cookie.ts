import { cookies } from "next/headers";
import { GMAIL_COOKIE, type StoredGmailTokens } from "@/lib/google-gmail";

export async function readGmailTokenCookie(): Promise<StoredGmailTokens | null> {
  const store = await cookies();
  const raw = store.get(GMAIL_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGmailTokens;
  } catch {
    return null;
  }
}
