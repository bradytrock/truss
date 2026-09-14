import { UnsubscribeClient } from "./unsubscribe-client";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <UnsubscribeClient token={token} />;
}
