export const LEGAL_BRAND = "Truss";
export const LEGAL_SITE = "https://myroofingtools.com";
export const LEGAL_EMAIL = "privacy@trockroofer.com";
export const LEGAL_UPDATED = "September 20, 2026";

export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy Policy", id: "privacy" },
  { href: "/terms", label: "Terms of Service", id: "terms" },
  { href: "/cookies", label: "Cookie Policy", id: "cookies" },
] as const;

export type LegalPageId = (typeof LEGAL_PAGES)[number]["id"];

export function isLegalPath(pathname: string) {
  const raw = pathname.split("?")[0]?.split("#")[0] ?? "";
  const normalized = raw.replace(/\/+$/, "").toLowerCase() || "/";
  return LEGAL_PAGES.some((page) => normalized === page.href || normalized.startsWith(`${page.href}/`));
}

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export const PRIVACY_INTRO =
  `This policy explains what Truss (TheRoofingCRM) collects, why we collect it, who can see it, and how to ask us to change or delete it. It covers the contractor workspace at ${LEGAL_SITE.replace("https://", "")} and the public links you send to homeowners.`;

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "Who this is for",
    paragraphs: [
      "Truss is a contractor operating system. Your company creates a workspace, invites seats, and keeps a job book: leads, homeowners, estimates, invoices, photos, texts, mail, and the calendar.",
      "For your company’s account, billing, and seat logins, we decide how that information is used. For the homeowner and job records you type in or upload, your company is the business that owns that book. We host it so you can run the job. You are responsible for telling homeowners why you have their information and for having a reason to text, email, or photograph them.",
    ],
  },
  {
    heading: "Information we collect",
    paragraphs: [
      "We collect what you and your teammates put in Truss, what is needed to sign you in, and a small amount of technical data so the product stays up.",
    ],
    bullets: [
      "Account: name, email, password (stored by our auth provider), title, role, company name, and optional phone, photo, and email signature.",
      "Job book: contacts, leads, jobs, estimates, invoices, expenses, payments, tasks, notes, calendar events, training progress, and company files.",
      "Field media: job photos, receipts, logos, and other files you upload. Photo storage is built so a deleted shot can be restored; do not upload anything you cannot keep.",
      "Messages: SMS and iMessage threads you send or receive through the connected text provider, plus Gmail you connect and mail Truss sends on your behalf.",
      "Payments: checkout and deposit status through Stripe. We do not store full card numbers.",
      "Public activity on a digital card: anonymous opens and taps (call, text, email, site, payment) so the office can see which card was used. Link-preview crawlers are filtered out.",
      "E-sign trail on a proposal: IP address, device, the unique link, consent, and a hash of the document. That certificate is office-only.",
      "Technical: sign-in session, browser local data (for example your Home layout), and basic server logs.",
    ],
  },
  {
    heading: "How we use it",
    paragraphs: [
      "We use this information to run Truss for your company: sign-in, the job book, sharing a proposal or invoice, sending a text or email you asked us to send, card payments you start, QuickBooks posting you approve, EagleView orders you place, and reminders such as a task that is due.",
      "If you use Ask Cassio, the question and the records needed to answer it are sent to the language-model provider configured on the host so the assistant can act in your book. Do not paste secrets you do not want a model to see.",
    ],
  },
  {
    heading: "When we share it",
    paragraphs: [
      "We do not sell your job book. We share information with the services that actually move the work, and only as needed:",
    ],
    bullets: [
      "Supabase — sign-in, database, and realtime updates.",
      "Backblaze B2 — file and photo storage.",
      "Stripe — card checkout and deposits.",
      "Sendblue — outbound and inbound texts.",
      "Resend — estimate, invoice, invite, and other product email (from no-reply@trockroofer.com).",
      "Google — Calendar and Gmail if a seat connects their Google account.",
      "QuickBooks Desktop — via the Web Connector when you approve a push.",
      "EagleView — when you order or pull a roof report.",
      "OpenAI or Anthropic — only when someone uses the assistant.",
    ],
  },
  {
    heading: "Public and guest links",
    paragraphs: [
      "A share link for an estimate, invoice, Page, or portal shows the homeowner only that document. They do not get a CRM login. A public digital card shows the name, title, photo, and contact paths you put on the card.",
      "Anyone with the link can open it. Treat those URLs like a document you handed over. You can expire or replace a link from the job.",
    ],
  },
  {
    heading: "Cookies and local storage",
    paragraphs: [
      "Truss uses a sign-in cookie so you stay logged in, and local storage for things like your Home module layout. See the Cookie Policy for the short list. We do not run advertising pixels.",
    ],
  },
  {
    heading: "Retention and deletion",
    paragraphs: [
      "Your company controls the job book. Company admins can remove seats, soft-delete jobs, and take down a card. Closing the company or asking us to delete an account removes the workspace we host for you, subject to backups and records we must keep for security, billing, or law.",
      "Job photos are stored so a trash action can be undone. If you need a file gone from storage, write us and we will confirm what the bucket still holds.",
    ],
  },
  {
    heading: "Your choices",
    paragraphs: [
      "You can update your profile in Truss, disconnect Google, turn off a calendar share, and unsubscribe from marketing mail with the link on that message.",
      "If you are in a place that grants access, correction, or deletion rights, email us. We will need enough detail to find the right company and seat. Homeowners should start with the contractor who collected their information; we will help that company if they ask.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "Truss is a business tool. It is not directed at children under 16. Do not create a seat for a child.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Each company’s book is separated in the database. Seats see what their role allows. Login As is an office tool: it lets an allowed admin work as another seat inside the same company. It is not a way to open another contractor’s book.",
    ],
  },
  {
    heading: "Changes",
    paragraphs: [
      "If we change this policy in a way that matters, we will update the date at the top of the page. Keep using Truss after that date means you have seen the new policy.",
    ],
  },
];

export const TERMS_INTRO =
  `These terms are the agreement between you and the operator of Truss (TheRoofingCRM) when you create an account, invite a teammate, or use ${LEGAL_SITE.replace("https://", "")}.`;

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "The service",
    paragraphs: [
      "Truss is software for restoration and home-improvement contractors: pipeline, jobs, estimates, invoices, calendar, photos, texts, mail, training, and the office tools around that work.",
      "We may add or remove features. Preview and demo data are not a production book.",
    ],
  },
  {
    heading: "Accounts and seats",
    paragraphs: [
      "You must be able to form a contract. One company workspace is created on first signup. Invite links join that company; they do not open a second one. You are responsible for who you invite and for what they do in the book.",
      "Keep passwords to yourselves. Company admins may use Login As on a teammate seat inside the same company.",
    ],
  },
  {
    heading: "Your job book",
    paragraphs: [
      "You own the records you put in Truss. You give us a license to host, display, back up, and transmit that data so the product works — including sending a text, email, or share link you asked for and posting to QuickBooks when you approve it.",
      "You represent that you have the right to store homeowner information, job-site photos, and payment details, and that your texts and emails follow the law (including consent for marketing messages).",
    ],
  },
  {
    heading: "Proposals and signatures",
    paragraphs: [
      "A signed proposal in Truss is your company’s document with the homeowner. We provide the capture and an office-only certificate. We are not a party to that contract and we do not give legal advice.",
    ],
  },
  {
    heading: "Payments and integrations",
    paragraphs: [
      "Card charges go through Stripe. Texts go through Sendblue. Mail you send from Truss goes through Resend. Calendar and Gmail use Google if a seat connects them. QuickBooks Desktop uses the Web Connector you install. EagleView reports are ordered under your credentials.",
      "Those companies have their own terms. If an integration is down or misconfigured, work may not leave Truss.",
    ],
  },
  {
    heading: "Acceptable use",
    paragraphs: [
      "Use Truss for lawful contracting work. Do not break into another company, scrape the service, send spam, upload malware, or use the assistant to generate something you could not send yourself.",
    ],
  },
  {
    heading: "Availability",
    paragraphs: [
      "We aim to keep Truss up, but we do not promise uninterrupted access. Features that depend on a third party can fail when that party fails.",
    ],
  },
  {
    heading: "Disclaimer",
    paragraphs: [
      "Truss is provided as is. We disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement to the fullest extent the law allows. We do not warrant that estimates, tax, or QuickBooks postings are complete for your books.",
    ],
  },
  {
    heading: "Liability",
    paragraphs: [
      "To the fullest extent the law allows, we are not liable for lost profits, lost jobs, or data you can restore from your own copies. Our total liability for a claim about Truss is limited to the amount you paid us for the service in the three months before the claim, or one hundred U.S. dollars if you have not paid us.",
    ],
  },
  {
    heading: "Indemnity",
    paragraphs: [
      "You will defend and hold us harmless from claims that come from your job book, your messages to homeowners, your share links, or your misuse of Truss.",
    ],
  },
  {
    heading: "Ending the account",
    paragraphs: [
      "You may stop using Truss at any time. We may suspend or close a workspace that breaks these terms or that puts the service or other companies at risk. After closure we delete or de-identify the hosted book as described in the Privacy Policy.",
    ],
  },
  {
    heading: "Law",
    paragraphs: [
      "These terms are governed by the laws of the State of Texas, excluding conflict-of-law rules. Courts in Texas have exclusive venue, except where applicable law requires otherwise.",
    ],
  },
];

export const COOKIE_INTRO =
  "Truss uses a short list of cookies and local storage so you can stay signed in and keep the desk the way you left it. We do not use advertising cookies.";

export const COOKIE_SECTIONS: LegalSection[] = [
  {
    heading: "Sign-in",
    paragraphs: [
      "When you log in, our auth provider sets a session cookie so the next request knows it is you. That cookie is required to use the workspace. Signing out clears it.",
    ],
  },
  {
    heading: "Local storage",
    paragraphs: [
      "The browser may keep a Home layout (which modules you hid or resized), a recent Login As list, and similar desk preferences on that device. Clearing site data resets those. It does not delete the job book.",
    ],
  },
  {
    heading: "Public pages",
    paragraphs: [
      "Guest estimate, invoice, portal, and card links do not require a CRM login. A card may record an anonymous open or tap so the office can see activity. That is not used to advertise to the guest.",
    ],
  },
  {
    heading: "Choices",
    paragraphs: [
      "You can block cookies in the browser. If you block the sign-in cookie, Truss cannot keep you logged in. For questions, email " +
        LEGAL_EMAIL +
        ".",
    ],
  },
];
