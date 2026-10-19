const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClerkSignupInput = {
  email: string;
  password: string;
  fullName: string;
  company: string;
  title: string;
  inviteToken?: string;
};

export function parseClerkSignup(
  body: unknown,
): { ok: true; value: ClerkSignupInput } | { ok: false; message: string } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const fullName = typeof record.fullName === "string" ? record.fullName.trim() : "";
  const company = typeof record.company === "string" ? record.company.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const inviteToken = typeof record.inviteToken === "string" ? record.inviteToken.trim() : "";

  if (!fullName) return { ok: false, message: "Name is required." };
  if (!email || !EMAIL.test(email)) return { ok: false, message: "Enter a valid email." };
  if (password.length < 8) return { ok: false, message: "Use at least 8 characters for the password." };
  if (!inviteToken && !company) return { ok: false, message: "Company is required." };

  return {
    ok: true,
    value: {
      email,
      password,
      fullName,
      company: company || "Truss",
      title: title || "Company admin",
      ...(inviteToken ? { inviteToken } : {}),
    },
  };
}

export function splitPersonName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

type ClerkErrorItem = { code?: string; message?: string; longMessage?: string };

export function readClerkError(error: unknown) {
  const errors = (error as { errors?: ClerkErrorItem[] } | null)?.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  if (first) {
    return {
      code: first.code ?? "",
      message: first.longMessage || first.message || "Could not create the account.",
    };
  }
  if (error instanceof Error && error.message) return { code: "", message: error.message };
  return { code: "", message: "Could not create the account." };
}

export function clerkIdentifierTaken(code: string, message: string) {
  const text = `${code} ${message}`.toLowerCase();
  return (
    code === "form_identifier_exists" ||
    text.includes("identifier_exists") ||
    text.includes("already exists") ||
    text.includes("email address is taken")
  );
}

export function missingClerkProvisionMessage(message: string) {
  if (
    /provision_clerk_user|claim_invite_for_clerk/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  ) {
    return "Account setup is missing a database update. Run supabase/migrations/20261019120000_clerk_accounts.sql, then create the account again.";
  }
  return message || "Could not save this account.";
}
