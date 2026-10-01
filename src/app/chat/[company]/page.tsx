import { WebsiteChatWidget } from "@/components/website-chat-widget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WebsiteChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ company: string }>;
  searchParams: Promise<{ embed?: string; person?: string }>;
}) {
  const { company } = await params;
  const query = await searchParams;
  return (
    <WebsiteChatWidget
      companySlug={company}
      embed={query.embed === "1"}
      ownerId={query.person?.trim() ?? ""}
    />
  );
}
