"use client";

import { useEffect, useState } from "react";
import {
  PREFS_STORAGE_PREFIX,
  parseNotificationPrefs,
  prefsSignature,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

function readLocalPrefs(staffId: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_PREFIX + staffId);
    if (!raw) return null;
    return parseNotificationPrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocalPrefs(staffId: string, prefs: NotificationPrefs) {
  window.localStorage.setItem(PREFS_STORAGE_PREFIX + staffId, JSON.stringify(prefs));
}

function missingPrefsTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("notification_preferences") ||
    error.code === "PGRST205" ||
    error.code === "42P01"
  );
}

export async function loadSavedPrefs(staffId: string): Promise<NotificationPrefs> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("channels")
        .eq("staff_id", staffId)
        .maybeSingle();
      if (!error) return parseNotificationPrefs(data?.channels);
      if (!missingPrefsTable(error)) return readLocalPrefs(staffId) ?? {};
    } catch {
      return readLocalPrefs(staffId) ?? {};
    }
  }
  return readLocalPrefs(staffId) ?? {};
}

export async function saveSavedPrefs(input: {
  staffId: string;
  companyId: string;
  prefs: NotificationPrefs;
}): Promise<"remote" | "local"> {
  const stored = input.prefs;
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          staff_id: input.staffId,
          company_id: input.companyId,
          channels: stored,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "staff_id" },
      );
      if (!error) {
        window.localStorage.removeItem(PREFS_STORAGE_PREFIX + input.staffId);
        return "remote";
      }
      if (!missingPrefsTable(error)) throw new Error(error.message);
    } catch (error) {
      if (error instanceof Error && !missingPrefsTable({ message: error.message })) throw error;
    }
  }
  writeLocalPrefs(input.staffId, stored);
  return "local";
}

/** Saved switches for this seat. Null until the first read finishes. */
export function useSavedNotificationPrefs(staffId: string | undefined) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  if (staffId !== loadedFor && prefs !== null) {
    setLoadedFor(staffId);
    setPrefs(null);
  }
  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    void loadSavedPrefs(staffId).then((next) => {
      if (cancelled) return;
      setLoadedFor(staffId);
      setPrefs(next);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId]);
  return staffId ? prefs : null;
}

export function prefsMatch(left: NotificationPrefs, right: NotificationPrefs) {
  return prefsSignature(left) === prefsSignature(right);
}
