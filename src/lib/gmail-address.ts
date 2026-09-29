function mailboxLocalPart(email: string) {
  const mailbox = email.trim().toLowerCase();
  const at = mailbox.lastIndexOf("@");
  return at > 0 ? mailbox.slice(0, at) : mailbox;
}

/** A name Gmail can show. The bare local-part (`bjones`) is what Gmail already displays when From has no name. */
export function usableSenderName(name: string, email: string) {
  const cleaned = name.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const lower = cleaned.toLowerCase();
  const mailbox = email.trim().toLowerCase();
  if (mailbox && lower === mailbox) return "";
  const local = mailboxLocalPart(email);
  if (local && lower === local) return "";
  return cleaned;
}

/** Seat name first, then the Gmail send-as name, skipping a username that matches the mailbox. */
export function senderDisplayName(input: { staffName?: string; sendAsName?: string; email: string }) {
  return (
    usableSenderName(input.staffName ?? "", input.email) ||
    usableSenderName(input.sendAsName ?? "", input.email)
  );
}

/** RFC 5322 mailbox. Quoted so Gmail shows the name instead of the address local-part. */
export function formatMailboxAddress(name: string, email: string) {
  const mailbox = email.replace(/[\r\n<>]/g, "").trim();
  const display = name.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!mailbox) return display;
  if (!display) return mailbox;
  if (/[^\u0000-\u007f]/.test(display)) {
    const encoded = `=?UTF-8?B?${Buffer.from(display, "utf8").toString("base64")}?=`;
    return `${encoded} <${mailbox}>`;
  }
  const quoted = `"${display.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `${quoted} <${mailbox}>`;
}

export function buildRfc822(input: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
}) {
  const from = input.from.includes("<")
    ? input.from.replace(/[\r\n]/g, " ").trim()
    : formatMailboxAddress(input.fromName ?? "", input.from);
  const needsEncode = /[^\u0000-\u007f]/.test(input.subject);
  const subject = needsEncode
    ? `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`
    : input.subject.replace(/[\r\n]/g, " ");
  return [
    `From: ${from}`,
    `To: ${input.to.replace(/[\r\n]/g, " ").trim()}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body.replace(/\r?\n/g, "\r\n"),
  ].join("\r\n");
}
