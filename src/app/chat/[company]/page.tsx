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
  const embed = query.embed === "1";
  return (
    <>
      {embed ? (
        <style href="truss-chat-embed" precedence="default">
          {`html,body{background:transparent!important;background-color:transparent!important;overflow:hidden!important}nextjs-portal{display:none!important}`}
        </style>
      ) : null}
      <WebsiteChatWidget
        companySlug={company}
        embed={embed}
        ownerId={query.person?.trim() ?? ""}
      />
    </>
  );
}
