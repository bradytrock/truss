"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCrm } from "@/lib/crm-store";
import {
  createMaterialFromTemplate,
  loadMarketingState,
  newMarketingId,
  recordMaterialEvent,
  saveMarketingState,
  upsertAsset,
  upsertCampaign,
  upsertDrip,
  upsertSocialPost,
} from "@/lib/marketing/storage";
import type {
  MarketingAsset,
  MarketingCampaign,
  MarketingDrip,
  MarketingEventKind,
  MarketingMaterial,
  MarketingSocialPost,
  MarketingState,
  MarketingTemplate,
} from "@/lib/marketing/types";

type MarketingContextValue = MarketingState & {
  ready: boolean;
  saveMaterial: (material: MarketingMaterial) => void;
  createFromTemplate: (input: {
    template: MarketingTemplate;
    headline: string;
    subhead: string;
    body: string;
    cta: string;
    jobId?: string | null;
    contactId?: string | null;
    partnerContactId?: string | null;
    photoUrls?: string[];
    vanitySlug?: string;
  }) => MarketingMaterial;
  track: (materialId: string, kind: MarketingEventKind) => void;
  saveCampaign: (campaign: MarketingCampaign) => void;
  saveSocialPost: (post: MarketingSocialPost) => void;
  saveDrip: (drip: MarketingDrip) => void;
  saveAsset: (asset: MarketingAsset) => void;
  removeMaterial: (id: string) => void;
  newId: (prefix: string) => string;
};

const MarketingContext = createContext<MarketingContextValue | null>(null);

export function MarketingProvider({ children }: { children: ReactNode }) {
  const crm = useCrm();
  const companyId = crm.user.companyId || "local";
  const [state, setState] = useState<MarketingState | null>(null);

  useEffect(() => {
    setState(loadMarketingState(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!state) return;
    saveMarketingState(companyId, state);
  }, [companyId, state]);

  const saveMaterial = useCallback((material: MarketingMaterial) => {
    setState((prev) => {
      if (!prev) return prev;
      const exists = prev.materials.some((item) => item.id === material.id);
      return {
        ...prev,
        materials: exists
          ? prev.materials.map((item) => (item.id === material.id ? material : item))
          : [material, ...prev.materials],
      };
    });
  }, []);

  const createFromTemplate = useCallback(
    (input: {
      template: MarketingTemplate;
      headline: string;
      subhead: string;
      body: string;
      cta: string;
      jobId?: string | null;
      contactId?: string | null;
      partnerContactId?: string | null;
      photoUrls?: string[];
      vanitySlug?: string;
    }) => {
      const material = createMaterialFromTemplate({
        ...input,
        staffId: crm.effectiveStaff?.id || crm.user.staffId || "local",
        staffName: crm.effectiveStaff?.name || crm.user.name || "Team",
      });
      setState((prev) => {
        const base = prev ?? loadMarketingState(companyId);
        return { ...base, materials: [material, ...base.materials] };
      });
      return material;
    },
    [companyId, crm.effectiveStaff?.id, crm.effectiveStaff?.name, crm.user.name, crm.user.staffId],
  );

  const track = useCallback((materialId: string, kind: MarketingEventKind) => {
    setState((prev) => (prev ? recordMaterialEvent(prev, materialId, kind) : prev));
  }, []);

  const saveCampaign = useCallback((campaign: MarketingCampaign) => {
    setState((prev) => (prev ? upsertCampaign(prev, campaign) : prev));
  }, []);

  const saveSocialPost = useCallback((post: MarketingSocialPost) => {
    setState((prev) => (prev ? upsertSocialPost(prev, post) : prev));
  }, []);

  const saveDrip = useCallback((drip: MarketingDrip) => {
    setState((prev) => (prev ? upsertDrip(prev, drip) : prev));
  }, []);

  const saveAsset = useCallback((asset: MarketingAsset) => {
    setState((prev) => (prev ? upsertAsset(prev, asset) : prev));
  }, []);

  const removeMaterial = useCallback((id: string) => {
    setState((prev) =>
      prev ? { ...prev, materials: prev.materials.filter((item) => item.id !== id) } : prev,
    );
  }, []);

  const value = useMemo<MarketingContextValue>(() => {
    const current = state ?? loadMarketingState(companyId);
    return {
      ...current,
      ready: Boolean(state),
      saveMaterial,
      createFromTemplate,
      track,
      saveCampaign,
      saveSocialPost,
      saveDrip,
      saveAsset,
      removeMaterial,
      newId: newMarketingId,
    };
  }, [
    companyId,
    createFromTemplate,
    removeMaterial,
    saveAsset,
    saveCampaign,
    saveDrip,
    saveMaterial,
    saveSocialPost,
    state,
    track,
  ]);

  return <MarketingContext.Provider value={value}>{children}</MarketingContext.Provider>;
}

export function useMarketing() {
  const context = useContext(MarketingContext);
  if (!context) throw new Error("useMarketing must be used within MarketingProvider");
  return context;
}
