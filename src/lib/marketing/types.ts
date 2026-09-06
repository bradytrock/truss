export const MARKETING_TEMPLATE_KINDS = [
  "flyer",
  "social_square",
  "social_story",
  "door_hanger",
  "yard_sign",
  "postcard",
  "realtor_cobrand",
  "review_ask",
  "referral_ask",
  "case_study",
  "leave_behind",
  "email_drip",
  "sms_drip",
] as const;

export type MarketingTemplateKind = (typeof MARKETING_TEMPLATE_KINDS)[number];

export const MARKETING_TEMPLATE_KIND_LABELS: Record<MarketingTemplateKind, string> = {
  flyer: "Flyer",
  social_square: "Social square",
  social_story: "Social story",
  door_hanger: "Door hanger",
  yard_sign: "Yard sign",
  postcard: "Postcard",
  realtor_cobrand: "Realtor co-brand",
  review_ask: "Review ask",
  referral_ask: "Referral ask",
  case_study: "Case study",
  leave_behind: "Leave-behind",
  email_drip: "Email drip",
  sms_drip: "SMS drip",
};

export const MARKETING_CHANNELS = ["print", "social", "email", "sms", "partner", "web"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export type MarketingAudience = "homeowner" | "realtor" | "neighborhood" | "internal";
export type MarketingMaterialStatus = "draft" | "ready" | "shared" | "archived";
export type MarketingCampaignKind = "neighborhood" | "storm" | "partner" | "seasonal" | "custom";
export type MarketingSocialStatus = "idea" | "scheduled" | "posted";
export type MarketingEventKind = "view" | "download" | "share" | "cta";
export type MarketingAssetSource = "company_file" | "job_photo" | "upload" | "brand";

export type MarketingTemplate = {
  id: string;
  kind: MarketingTemplateKind;
  name: string;
  summary: string;
  channel: MarketingChannel;
  audience: MarketingAudience;
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  badge: string;
  accent: string;
  printReady: boolean;
  featured: boolean;
};

export type MarketingMaterial = {
  id: string;
  templateId: string;
  kind: MarketingTemplateKind;
  name: string;
  status: MarketingMaterialStatus;
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  badge: string;
  accent: string;
  jobId: string | null;
  contactId: string | null;
  partnerContactId: string | null;
  photoUrls: string[];
  shareToken: string;
  createdByStaffId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  downloads: number;
  shares: number;
  ctas: number;
  vanitySlug: string;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  kind: MarketingCampaignKind;
  summary: string;
  neighborhood: string;
  radiusMiles: number;
  stormName: string;
  status: "draft" | "active" | "done";
  materialIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MarketingSocialPost = {
  id: string;
  title: string;
  channel: "instagram" | "facebook" | "linkedin" | "tiktok";
  body: string;
  materialId: string | null;
  scheduledFor: string;
  status: MarketingSocialStatus;
  createdAt: string;
};

export type MarketingDrip = {
  id: string;
  name: string;
  channel: "email" | "sms";
  audience: MarketingAudience;
  subject: string;
  body: string;
  createdAt: string;
};

export type MarketingAsset = {
  id: string;
  name: string;
  source: MarketingAssetSource;
  url: string;
  notes: string;
  jobId: string | null;
  companyFileId: string | null;
  approved: boolean;
  createdAt: string;
};

export type MarketingEvent = {
  id: string;
  materialId: string;
  kind: MarketingEventKind;
  createdAt: string;
};

export type MarketingState = {
  materials: MarketingMaterial[];
  campaigns: MarketingCampaign[];
  socialPosts: MarketingSocialPost[];
  drips: MarketingDrip[];
  assets: MarketingAsset[];
  events: MarketingEvent[];
};

export type MarketingMergeContext = {
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  companyLicense: string;
  companyLogoUrl: string;
  staffName: string;
  staffTitle: string;
  staffPhone: string;
  staffEmail: string;
  staffCardUrl: string;
  jobName: string;
  jobCode: string;
  jobAddress: string;
  jobCity: string;
  jobScope: string;
  contactName: string;
  contactPhone: string;
  partnerName: string;
  partnerTitle: string;
  reviewUrl: string;
  portalHint: string;
};
