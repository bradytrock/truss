import type { Metadata } from "next";
import { BusinessCardMissing, BusinessCardView } from "@/components/business-card";
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
  if (!card?.available || !card.person) {
    return { title: "Card isn’t available", robots: { index: false, follow: false } };
  }
  const title = card.person.title
    ? `${card.person.name} · ${card.person.title}`
    : card.person.name;
  return {
    title: card.company.name ? `${title} · ${card.company.name}` : title,
    description: card.person.title
      ? `${card.person.name}, ${card.person.title} at ${card.company.name}`
      : `${card.person.name} at ${card.company.name}`,
  };
}

export default async function PublicCardPage({ params }: { params: Promise<CardParams> }) {
  const { company, person } = await params;
  const card = await loadSharedCard(company, person);
  if (!card) return <BusinessCardMissing />;
  return <BusinessCardView card={card} />;
}
