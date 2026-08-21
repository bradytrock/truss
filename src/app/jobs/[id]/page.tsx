import { redirect } from "next/navigation";

export default async function JobDetailRedirect({
  params,
  searchParams,
}: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const next = new URLSearchParams();
  next.set("job", id);
  const tab = typeof query.tab === "string" ? query.tab : undefined;
  if (tab) next.set("tab", tab);
  redirect(`/jobs?${next.toString()}`);
}
