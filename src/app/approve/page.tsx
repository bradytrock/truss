import { redirect } from "next/navigation";

export default async function ApproveShortcutPage({
  searchParams,
}: PageProps<"/approve">) {
  const query = await searchParams;
  const week = typeof query.week === "string" ? query.week : undefined;
  redirect(week ? `/accounting/approve?week=${encodeURIComponent(week)}` : "/accounting/approve");
}
