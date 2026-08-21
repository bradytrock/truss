import { redirect } from "next/navigation";

export default async function ContactDetailRedirect({ params }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  redirect(`/contacts?contact=${encodeURIComponent(id)}`);
}
