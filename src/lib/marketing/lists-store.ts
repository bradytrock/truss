"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { readMarketingLocal, subscribeMarketingLocal, writeMarketingLocal } from "@/lib/marketing/local-store";
import { isListRole, type ListRole } from "@/lib/marketing/lists";

export type MarketingList = {
  id: string;
  name: string;
  role: ListRole;
  contactIds: string[];
  createdAt: string;
};

const KEY = "truss.marketing.lists.v1";
const EMPTY: MarketingList[] = [];
let warned = false;
let revision = 0;

function storageKey(companyId: string) {
  return `${KEY}:${companyId}`;
}

function parseLists(raw: string): MarketingList[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return EMPTY;
  return parsed.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<MarketingList>;
    if (typeof row.id !== "string" || typeof row.name !== "string") return [];
    return [
      {
        id: row.id,
        name: row.name,
        role: typeof row.role === "string" && isListRole(row.role) ? row.role : "other",
        contactIds: Array.isArray(row.contactIds) ? row.contactIds.filter((id): id is string => typeof id === "string") : [],
        createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
      },
    ];
  });
}

export function loadMarketingLists(companyId: string) {
  return readMarketingLocal(storageKey(companyId), EMPTY, parseLists);
}

export function saveMarketingLists(companyId: string, lists: MarketingList[]) {
  writeMarketingLocal(storageKey(companyId), lists);
}

function browserSupabase() {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return null;
  try {
    return createClient();
  } catch {
    return null;
  }
}

function warnLocal(error: { message?: string; code?: string } | null) {
  if (warned) return;
  warned = true;
  const message = error?.message?.toLowerCase() ?? "";
  if (error?.code === "PGRST205" || message.includes("marketing_lists") || message.includes("schema cache")) {
    toast.message("Lists are saved in this browser until the marketing lists migration is applied.");
    return;
  }
  toast.message("Lists are saved in this browser. Sign in so the rest of the company can see them.");
}

function replaceList(companyId: string, listId: string, update: (list: MarketingList) => MarketingList) {
  const lists = loadMarketingLists(companyId);
  saveMarketingLists(
    companyId,
    lists.map((list) => (list.id === listId ? update(list) : list)),
  );
}

export async function refreshMarketingLists(companyId: string) {
  const seen = revision;
  const supabase = browserSupabase();
  if (!supabase || !companyId || companyId === "local") return;
  const [listsRes, membersRes] = await Promise.all([
    supabase.from("marketing_lists").select("id,name,role,created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("marketing_list_members").select("list_id,contact_id").eq("company_id", companyId),
  ]);
  if (listsRes.error || membersRes.error) return;
  const members = new Map<string, string[]>();
  for (const row of membersRes.data ?? []) {
    const ids = members.get(row.list_id) ?? [];
    ids.push(row.contact_id);
    members.set(row.list_id, ids);
  }
  const server: MarketingList[] = (listsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: isListRole(row.role) ? row.role : "other",
    contactIds: members.get(row.id) ?? [],
    createdAt: row.created_at,
  }));
  if (revision !== seen) return;
  const serverIds = new Set(server.map((list) => list.id));
  const pending = loadMarketingLists(companyId).filter((list) => !serverIds.has(list.id));
  saveMarketingLists(companyId, [...server, ...pending]);
}

export function useMarketingLists(companyId: string) {
  const lists = useSyncExternalStore(
    subscribeMarketingLocal,
    () => loadMarketingLists(companyId),
    () => EMPTY,
  );
  useEffect(() => {
    void refreshMarketingLists(companyId);
  }, [companyId]);
  return lists;
}

export async function createMarketingList(
  companyId: string,
  input: { name: string; role: ListRole; staffId?: string },
) {
  revision += 1;
  const list: MarketingList = {
    id: crypto.randomUUID(),
    name: input.name.trim() || "New list",
    role: input.role,
    contactIds: [],
    createdAt: new Date().toISOString(),
  };
  const supabase = browserSupabase();
  if (supabase && companyId && companyId !== "local") {
    const { error } = await supabase.from("marketing_lists").insert({
      id: list.id,
      company_id: companyId,
      name: list.name,
      role: list.role,
      created_by_staff_id: input.staffId || null,
    });
    if (error) warnLocal(error);
  }
  saveMarketingLists(companyId, [list, ...loadMarketingLists(companyId)]);
  return list;
}

export async function updateMarketingList(
  companyId: string,
  listId: string,
  patch: { name?: string; role?: ListRole },
) {
  revision += 1;
  replaceList(companyId, listId, (list) => ({
    ...list,
    name: patch.name === undefined ? list.name : patch.name.trim() || list.name,
    role: patch.role ?? list.role,
  }));
  const supabase = browserSupabase();
  if (!supabase || companyId === "local") return;
  const { error } = await supabase
    .from("marketing_lists")
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() || "New list" } : {}),
      ...(patch.role ? { role: patch.role } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listId)
    .eq("company_id", companyId);
  if (error) warnLocal(error);
}

export async function deleteMarketingList(companyId: string, listId: string) {
  revision += 1;
  saveMarketingLists(
    companyId,
    loadMarketingLists(companyId).filter((list) => list.id !== listId),
  );
  const supabase = browserSupabase();
  if (!supabase || companyId === "local") return;
  const { error } = await supabase.from("marketing_lists").delete().eq("id", listId).eq("company_id", companyId);
  if (error) warnLocal(error);
}

export async function addMarketingListMembers(companyId: string, listId: string, contactIds: string[]) {
  revision += 1;
  const current = loadMarketingLists(companyId).find((list) => list.id === listId);
  if (!current) return [];
  const fresh = contactIds.filter((id) => id && !current.contactIds.includes(id));
  if (!fresh.length) return [];
  replaceList(companyId, listId, (list) => ({ ...list, contactIds: [...list.contactIds, ...fresh] }));
  const supabase = browserSupabase();
  if (supabase && companyId !== "local") {
    const { error } = await supabase.from("marketing_list_members").insert(
      fresh.map((contactId) => ({ list_id: listId, company_id: companyId, contact_id: contactId })),
    );
    if (error) warnLocal(error);
  }
  return fresh;
}

export async function removeMarketingListMember(companyId: string, listId: string, contactId: string) {
  revision += 1;
  replaceList(companyId, listId, (list) => ({
    ...list,
    contactIds: list.contactIds.filter((id) => id !== contactId),
  }));
  const supabase = browserSupabase();
  if (!supabase || companyId === "local") return;
  const { error } = await supabase
    .from("marketing_list_members")
    .delete()
    .eq("list_id", listId)
    .eq("contact_id", contactId)
    .eq("company_id", companyId);
  if (error) warnLocal(error);
}

export async function copyMarketingListMembers(companyId: string, fromId: string, toId: string) {
  const source = loadMarketingLists(companyId).find((list) => list.id === fromId);
  if (!source) return [];
  return addMarketingListMembers(companyId, toId, source.contactIds);
}
