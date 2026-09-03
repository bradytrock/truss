import type { Metadata } from "next";
import { BusinessCardMissing, BusinessCardView } from "@/components/business-card";
import { appOrigin } from "@/lib/app-origin";
import { cardPath } from "@/lib/card";
import { loadSharedCard } from "@/lib/share-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CardParams = { company: string; person: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<CardParams>;
}): Promise<Metadata> {
  const { company, person } = await params;
  const card = await loadSharedCard(company, person);
  const origin = await appOrigin();
  // Texted and pasted links unfurl from these tags, so the base has to be absolute.
  const base = { metadataBase: new URL(origin) } satisfies Metadata;

  if (!card?.available || !card.person) {
    return {
      ...base,
      title: "Card isn’t available",
      robots: { index: false, follow: false },
    };
  }

  const role = card.person.title.trim();
  const companyName = card.company.name.trim();
  const title = role ? `${card.person.name} · ${role}` : card.person.name;
  const description = [role ? `${card.person.name}, ${role}` : card.person.name, companyName]
    .filter(Boolean)
    .join(" at ");
  const url = `${origin}${cardPath(card.company.slug, card.person.cardSlug)}`;
  // Pinned to the requested host. Left to metadataBase, Next resolves this against
  // localhost and the preview breaks everywhere but a dev machine.
  const image = {
    url: `${url}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: companyName ? `${card.person.name} · ${companyName}` : card.person.name,
  };

  return {
    ...base,
    title: companyName ? `${title} · ${companyName}` : title,
    description: `${description}. Call, text, email, or save the contact.`,
    openGraph: {
      type: "profile",
      title: companyName ? `${card.person.name} · ${companyName}` : card.person.name,
      description: role ? `${role}. Call, text, email, or save the contact.` : description,
      siteName: companyName || undefined,
      url,
      images: [image],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default async function PublicCardPage({ params }: { params: Promise<CardParams> }) {
  const { company, person } = await params;
  const card = await loadSharedCard(company, person);
  if (!card) return <BusinessCardMissing />;
  return <BusinessCardView card={card} />;
}
