import { redirect } from "next/navigation";
import { jobRecordHref } from "@/lib/job-record";

export default async function JobDetailRedirect({
  params,
  searchParams,
}: PageProps<"/jobs/[id]">) {
  const resolved = await params;
  const query = await searchParams;
  const id = typeof resolved.id === "string" ? resolved.id.trim() : "";
  if (!id) redirect("/jobs");
  const tab = typeof query.tab === "string" ? query.tab : undefined;
  const doc = typeof query.doc === "string" ? query.doc : undefined;
  redirect(jobRecordHref(id, { tab, doc }));
}
