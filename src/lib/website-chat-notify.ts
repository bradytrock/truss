import { formatResendFrom, sendResendEmail } from "@/lib/resend-mail";
import { looksLikeEmail } from "@/lib/share-text";
import { websiteChatAdminSubject, websiteChatAdminText } from "@/lib/website-chat";

type Admin = { name?: string; email?: string };

export async function notifyWebsiteChatAdmins(input: {
  admins: Admin[];
  name: string;
  phone: string;
  street: string;
  companyName: string;
  companyEmail: string;
  email?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  market?: string;
  trades?: string;
}) {
  const recipients = input.admins
    .map((admin) => (admin.email ?? "").trim())
    .filter((email, index, all) => looksLikeEmail(email) && all.indexOf(email) === index);
  if (!recipients.length) return { sent: 0 };

  const subject = websiteChatAdminSubject(input.name, input.street);
  const text = websiteChatAdminText({
    name: input.name,
    phone: input.phone,
    street: input.street,
    companyName: input.companyName,
    email: input.email,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    market: input.market === "commercial" ? "Commercial" : input.market ? "Residential" : "",
    trades: input.trades,
  });
  const html = text
    .split("\n")
    .map((line) => `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</p>`)
    .join("");
  const replyTo = looksLikeEmail(input.companyEmail) ? input.companyEmail.trim() : undefined;
  const from = formatResendFrom({
    senderName: "Office",
    companyName: input.companyName.trim() || "Truss",
  });

  let sent = 0;
  for (const to of recipients) {
    const result = await sendResendEmail({ to, subject, text, html, from, replyTo });
    if (result.ok) sent += 1;
  }
  return { sent };
}
