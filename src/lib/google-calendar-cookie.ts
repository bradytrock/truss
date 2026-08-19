import { cookies } from "next/headers";
import { GCAL_COOKIE, type StoredGoogleTokens } from "@/lib/google-calendar";

export async function readGoogleTokenCookie(): Promise<StoredGoogleTokens | null> {
  const store = await cookies();
  const raw = store.get(GCAL_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredGoogleTokens;
  } catch {
    return null;
  }
}
