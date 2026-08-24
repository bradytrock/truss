import { cookies } from "next/headers";
import { GCAL_COOKIE, GCAL_COOKIE_LEGACY, type StoredGoogleTokens } from "@/lib/google-calendar";

export async function readGoogleTokenCookie(): Promise<StoredGoogleTokens | null> {
  const store = await cookies();
  const raw = store.get(GCAL_COOKIE)?.value ?? store.get(GCAL_COOKIE_LEGACY)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGoogleTokens;
  } catch {
    return null;
  }
}
