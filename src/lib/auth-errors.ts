export function authErrorMessage(error: { message?: string; code?: string } | string | null | undefined) {
  const raw = typeof error === "string" ? error : error?.message ?? "";
  const code = typeof error === "object" && error ? error.code ?? "" : "";
  const text = `${code} ${raw}`.toLowerCase();

  if (text.includes("email_not_confirmed") || text.includes("email not confirmed")) {
    return "This project requires a confirmed email. In Supabase go to Authentication → Providers → Email and turn off Confirm email, then try again.";
  }
  if (text.includes("invalid login") || text.includes("invalid_credentials")) {
    return "That email and password were not accepted. Create an account first, or turn off Confirm email if you just signed up and never got a message.";
  }
  if (text.includes("email_address_invalid") || text.includes("email address") && text.includes("invalid")) {
    return "Use a real-looking email (not example.com). Then create the account again.";
  }
  if (text.includes("rate limit") || text.includes("over_email_send")) {
    return "Supabase hit its email send limit. Turn off Confirm email in Authentication → Providers → Email so accounts can sign in without a message.";
  }
  if (text.includes("signup_disabled") || text.includes("signups not allowed")) {
    return "Signups are disabled on this project. Enable email signups under Authentication → Providers → Email.";
  }
  return raw || "Could not sign in.";
}
