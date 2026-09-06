import { newShareToken } from "@/lib/share";
import type {
  MarketingAsset,
  MarketingCampaign,
  MarketingDrip,
  MarketingEvent,
  MarketingEventKind,
  MarketingMaterial,
  MarketingSocialPost,
  MarketingState,
  MarketingTemplate,
} from "@/lib/marketing/types";
import { MARKETING_DRIP_SEEDS } from "@/lib/marketing/templates";

const STORAGE_PREFIX = "theroofingcrm.marketing.v1:";

function blankState(): MarketingState {
  return {
    materials: [],
    campaigns: [],
    socialPosts: [],
    drips: MARKETING_DRIP_SEEDS.map((drip) => ({ ...drip })),
    assets: [],
    events: [],
  };
}

export function marketingStorageKey(companyId: string) {
  return `${STORAGE_PREFIX}${companyId || "local"}`;
}

export function loadMarketingState(companyId: string): MarketingState {
  if (typeof window === "undefined") return blankState();
  try {
    const raw = window.localStorage.getItem(marketingStorageKey(companyId));
    if (!raw) return blankState();
    const parsed = JSON.parse(raw) as Partial<MarketingState>;
    return {
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
      socialPosts: Array.isArray(parsed.socialPosts) ? parsed.socialPosts : [],
      drips: Array.isArray(parsed.drips) && parsed.drips.length ? parsed.drips : blankState().drips,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return blankState();
  }
}

export function saveMarketingState(companyId: string, state: MarketingState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(marketingStorageKey(companyId), JSON.stringify(state));
}

export function newMarketingId(prefix: string) {
  return `${prefix}_${newShareToken().slice(0, 12)}`;
}

export function createMaterialFromTemplate(input: {
  template: MarketingTemplate;
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  jobId?: string | null;
  contactId?: string | null;
  partnerContactId?: string | null;
  photoUrls?: string[];
  staffId: string;
  staffName: string;
  vanitySlug?: string;
}): MarketingMaterial {
  const now = new Date().toISOString();
  return {
    id: newMarketingId("mat"),
    templateId: input.template.id,
    kind: input.template.kind,
    name: input.template.name,
    status: "ready",
    headline: input.headline,
    subhead: input.subhead,
    body: input.body,
    cta: input.cta,
    badge: input.template.badge,
    accent: input.template.accent,
    jobId: input.jobId ?? null,
    contactId: input.contactId ?? null,
    partnerContactId: input.partnerContactId ?? null,
    photoUrls: input.photoUrls ?? [],
    shareToken: `mk-${newShareToken()}`,
    createdByStaffId: input.staffId,
    createdByName: input.staffName,
    createdAt: now,
    updatedAt: now,
    views: 0,
    downloads: 0,
    shares: 0,
    ctas: 0,
    vanitySlug: input.vanitySlug?.trim() || "",
  };
}

export function recordMaterialEvent(
  state: MarketingState,
  materialId: string,
  kind: MarketingEventKind,
): MarketingState {
  const event: MarketingEvent = {
    id: newMarketingId("evt"),
    materialId,
    kind,
    createdAt: new Date().toISOString(),
  };
  return {
    ...state,
    events: [event, ...state.events].slice(0, 500),
    materials: state.materials.map((material) => {
      if (material.id !== materialId) return material;
      if (kind === "view") {
        return {
          ...material,
          views: material.views + 1,
          status: material.status === "ready" ? "shared" : material.status,
        };
      }
      if (kind === "download") return { ...material, downloads: material.downloads + 1 };
      if (kind === "share") return { ...material, shares: material.shares + 1, status: "shared" };
      return { ...material, ctas: material.ctas + 1 };
    }),
  };
}

export function upsertCampaign(state: MarketingState, campaign: MarketingCampaign): MarketingState {
  const exists = state.campaigns.some((item) => item.id === campaign.id);
  return {
    ...state,
    campaigns: exists
      ? state.campaigns.map((item) => (item.id === campaign.id ? campaign : item))
      : [campaign, ...state.campaigns],
  };
}

export function upsertSocialPost(state: MarketingState, post: MarketingSocialPost): MarketingState {
  const exists = state.socialPosts.some((item) => item.id === post.id);
  return {
    ...state,
    socialPosts: exists
      ? state.socialPosts.map((item) => (item.id === post.id ? post : item))
      : [post, ...state.socialPosts],
  };
}

export function upsertDrip(state: MarketingState, drip: MarketingDrip): MarketingState {
  const exists = state.drips.some((item) => item.id === drip.id);
  return {
    ...state,
    drips: exists ? state.drips.map((item) => (item.id === drip.id ? drip : item)) : [drip, ...state.drips],
  };
}

export function upsertAsset(state: MarketingState, asset: MarketingAsset): MarketingState {
  const exists = state.assets.some((item) => item.id === asset.id);
  return {
    ...state,
    assets: exists
      ? state.assets.map((item) => (item.id === asset.id ? asset : item))
      : [asset, ...state.assets],
  };
}

export function marketingSharePath(token: string) {
  return `/share/m/${token}`;
}

export function marketingShareUrl(token: string, origin = "") {
  const path = marketingSharePath(token);
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}
