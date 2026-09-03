export type SocialNetwork = "facebook" | "instagram" | "youtube" | "linkedin" | "tiktok";

export type CompanySocialFields = {
  website?: string;
  socialFacebook?: string;
  socialInstagram?: string;
  socialYoutube?: string;
  socialLinkedin?: string;
  socialTiktok?: string;
};

export type SocialLink = {
  key: SocialNetwork | "website";
  label: string;
  href: string;
};

const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^(www\.)?[\w-]+(\.[\w-]+)+/.test(value);
}

function withScheme(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Accepts a handle (@trockroofing), a bare username, or a pasted profile URL.
 * Handles build the canonical profile link; a URL is used as typed.
 */
export function socialHref(network: SocialNetwork, raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (looksLikeUrl(value)) return withScheme(value);
  const handle = value.replace(/^@/, "").trim();
  if (!handle) return "";
  const encoded = encodeURIComponent(handle);
  switch (network) {
    case "facebook":
      return `https://facebook.com/${encoded}`;
    case "instagram":
      return `https://instagram.com/${encoded}`;
    case "youtube":
      return `https://youtube.com/@${encoded}`;
    case "linkedin":
      return `https://linkedin.com/company/${encoded}`;
    case "tiktok":
      return `https://tiktok.com/@${encoded}`;
  }
}

export function websiteHomepageHref(website: string) {
  const value = website.trim();
  if (!value) return "";
  return withScheme(value);
}

export function socialLinks(company: CompanySocialFields): SocialLink[] {
  const links: SocialLink[] = [];
  const website = websiteHomepageHref(company.website ?? "");
  if (website) links.push({ key: "website", label: "Website", href: website });

  const raw: Array<[SocialNetwork, string]> = [
    ["facebook", company.socialFacebook ?? ""],
    ["instagram", company.socialInstagram ?? ""],
    ["youtube", company.socialYoutube ?? ""],
    ["linkedin", company.socialLinkedin ?? ""],
    ["tiktok", company.socialTiktok ?? ""],
  ];
  for (const [network, value] of raw) {
    const href = socialHref(network, value);
    if (href) links.push({ key: network, label: SOCIAL_LABELS[network], href });
  }
  return links;
}

export function socialLabel(network: SocialNetwork) {
  return SOCIAL_LABELS[network];
}
