const PREVIEW_BOT =
  /facebookexternalhit|facebot|twitterbot|applebot|slackbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|iframely|embedly|pinterest|bingpreview|googlebot|preview\/|crawler|spider|bot\/|bot;/i;

/** iMessage, Slack, and other unfurlers fetch the page without a person opening it. */
export function isLinkPreviewBot(userAgent: string | null | undefined) {
  return PREVIEW_BOT.test(userAgent ?? "");
}

export type EstimateOpenedLine = {
  quantity: number;
  unitCost: number;
  optional: boolean;
  selected: boolean;
  taxable: boolean;
  package: string;
  groupName: string;
};

export type EstimateOpenedNotify = {
  staffId?: string | null;
  name: string;
  phone: string;
  email: string;
  estimateNumber: string;
  estimateName: string;
  jobCode: string;
  address: string;
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyId: string;
  estimateId?: string;
  jobId?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  companyPhone?: string;
  companyLogoUrl?: string;
  companyLogoStoragePath?: string;
  cardLogoUrl?: string;
  cardLogoStoragePath?: string;
  staffTimeZone?: string;
  viewerTimeZone?: string;
  openedAt?: string;
  openCount?: number;
  market?: string;
  taxRate?: number;
  discountKind?: string;
  discountValue?: number;
  marginPercent?: number;
  subtotalOverride?: number | null;
  packageMode?: string;
  selectedPackage?: string;
  lines?: EstimateOpenedLine[];
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : 0;
}

function asNullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function parseOpenedLines(raw: unknown): EstimateOpenedLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const lines: EstimateOpenedLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    lines.push({
      quantity: asNumber(row.quantity),
      unitCost: asNumber(row.unitCost ?? row.unit_cost),
      optional: row.optional === true,
      selected: row.selected !== false,
      taxable: row.taxable !== false,
      package: asString(row.package),
      groupName: asString(row.groupName ?? row.group_name),
    });
  }
  return lines;
}

export function parseEstimateOpenedNotify(raw: unknown): EstimateOpenedNotify | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const notify =
    row.notify && typeof row.notify === "object" ? (row.notify as Record<string, unknown>) : row;
  const name = asString(notify.name);
  const phone = asString(notify.phone);
  const email = asString(notify.email);
  if (!name && !phone && !email) return null;
  return {
    staffId: asString(notify.staffId) || null,
    name,
    phone,
    email,
    estimateNumber: asString(notify.estimateNumber),
    estimateName: asString(notify.estimateName),
    jobCode: asString(notify.jobCode),
    address: asString(notify.address),
    contactName: asString(notify.contactName),
    companyName: asString(notify.companyName),
    companyEmail: asString(notify.companyEmail),
    companyId: asString(notify.companyId),
    estimateId: asString(notify.estimateId),
    jobId: asString(notify.jobId),
    street: asString(notify.street),
    city: asString(notify.city),
    state: asString(notify.state),
    postalCode: asString(notify.postalCode),
    companyPhone: asString(notify.companyPhone),
    companyLogoUrl: asString(notify.companyLogoUrl),
    companyLogoStoragePath: asString(notify.companyLogoStoragePath),
    cardLogoUrl: asString(notify.cardLogoUrl),
    cardLogoStoragePath: asString(notify.cardLogoStoragePath),
    staffTimeZone: asString(notify.staffTimeZone),
    viewerTimeZone: asString(notify.viewerTimeZone),
    openedAt: asString(notify.openedAt),
    openCount: Math.max(0, Math.round(asNumber(notify.openCount))),
    market: asString(notify.market),
    taxRate: asNumber(notify.taxRate),
    discountKind: asString(notify.discountKind) === "amount" ? "amount" : "percent",
    discountValue: asNumber(notify.discountValue),
    marginPercent: asNumber(notify.marginPercent),
    subtotalOverride: asNullableNumber(notify.subtotalOverride),
    packageMode: asString(notify.packageMode),
    selectedPackage: asString(notify.selectedPackage),
    lines: parseOpenedLines(notify.lines),
  };
}

export function estimateOpenedWho(contactName: string | null | undefined) {
  return contactName?.trim() || "The homeowner";
}

export function estimateOpenedLabel(input: {
  estimateNumber?: string | null;
  estimateName?: string | null;
}) {
  return input.estimateNumber?.trim() || input.estimateName?.trim() || "the proposal";
}

export function estimateOpenedActivityBody(input: {
  contactName?: string | null;
  estimateNumber?: string | null;
  estimateName?: string | null;
}) {
  return `${estimateOpenedWho(input.contactName)} opened proposal ${estimateOpenedLabel(input)}.`;
}

export function estimateOpenedSms(input: EstimateOpenedNotify) {
  const who = estimateOpenedWho(input.contactName);
  const label = estimateOpenedLabel(input);
  const where = input.address.trim();
  const job = input.jobCode.trim();
  const site = [job, where].filter(Boolean).join(" · ");
  return site ? `${who} opened proposal ${label} (${site}).` : `${who} opened proposal ${label}.`;
}

export function estimateOpenedAddress(input: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  address?: string | null;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const postal = input.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityLine = [cityState, postal].filter(Boolean).join(" ");
  if (street || cityLine) {
    return {
      line: street || cityLine,
      city: street ? cityLine : "",
      full: [street, cityLine].filter(Boolean).join(", "),
    };
  }
  const combined = input.address?.trim() ?? "";
  return { line: combined, city: "", full: combined };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Customer total for the opened proposal. Residential work is not taxed. */
export function estimateOpenedProposalTotal(input: EstimateOpenedNotify) {
  if (!input.lines) return null;
  const packages = [
    ...new Set(input.lines.map((line) => line.package.trim()).filter(Boolean)),
  ];
  const selected = input.selectedPackage?.trim() ?? "";
  const pkg =
    input.packageMode === "gbb"
      ? selected && (packages.includes(selected) || packages.length === 0)
        ? selected
        : packages[0] || selected || "better"
      : "";
  const scoped =
    input.packageMode === "gbb"
      ? input.lines.filter((line) => {
          const assigned = line.package.trim();
          return assigned === "" || assigned === pkg;
        })
      : input.lines;
  const included = scoped.filter((line) => !line.optional || line.selected);
  const amountOf = (line: EstimateOpenedLine) => roundMoney(line.quantity * line.unitCost);
  const lineSubtotal = roundMoney(included.reduce((sum, line) => sum + amountOf(line), 0));
  const override = input.subtotalOverride;
  const hasOverride = override != null && Number.isFinite(override);
  const marginPercent = Math.max(0, Number(input.marginPercent) || 0);
  const marginAmount =
    !hasOverride && marginPercent > 0 ? roundMoney(lineSubtotal * (marginPercent / 100)) : 0;
  const subtotal = hasOverride ? roundMoney(override) : roundMoney(lineSubtotal + marginAmount);
  const discountValue = Number(input.discountValue) || 0;
  const discount =
    input.discountKind === "amount"
      ? roundMoney(Math.min(subtotal, discountValue))
      : roundMoney((subtotal * discountValue) / 100);
  const afterDiscount = Math.max(0, roundMoney(subtotal - discount));
  const taxableLineSubtotal = roundMoney(
    included.filter((line) => line.taxable).reduce((sum, line) => sum + amountOf(line), 0),
  );
  const pricedFromLines = hasOverride || marginAmount > 0;
  const taxableSubtotal =
    pricedFromLines && lineSubtotal > 0
      ? roundMoney(subtotal * (taxableLineSubtotal / lineSubtotal))
      : pricedFromLines
        ? subtotal
        : taxableLineSubtotal;
  const taxableShare = subtotal > 0 ? taxableSubtotal / subtotal : 0;
  const taxableAfterDiscount = Math.max(0, roundMoney(taxableSubtotal - discount * taxableShare));
  const market = input.market?.trim() ?? "";
  const taxRate = market === "commercial" ? Math.max(0, Number(input.taxRate) || 0) : 0;
  const tax = roundMoney((taxableAfterDiscount * taxRate) / 100);
  return roundMoney(afterDiscount + tax);
}

export function estimateOpenedEmailSubject(
  input: Pick<EstimateOpenedNotify, "estimateNumber" | "address"> &
    Partial<Pick<EstimateOpenedNotify, "street" | "city" | "state" | "postalCode">>,
) {
  const number = input.estimateNumber.trim();
  const address = estimateOpenedAddress(input).full;
  if (number && address) return `Proposal ${number} opened — ${address}`;
  if (number) return `Proposal ${number} was opened`;
  if (address) return `Proposal opened — ${address}`;
  return "A proposal was opened";
}

export function estimateOpenedEmailText(
  input: EstimateOpenedNotify,
  extras?: { amount?: string; openCount?: number; proposalUrl?: string; jobUrl?: string },
) {
  const lines = [
    estimateOpenedSms(input),
    input.jobCode.trim() ? `Job: ${input.jobCode.trim()}` : "",
    input.address.trim() ? `Address: ${input.address.trim()}` : "",
    extras?.amount && extras.amount !== "—" ? `Amount: ${extras.amount}` : "",
    extras?.openCount ? `Times opened: ${extras.openCount}` : "",
    extras?.proposalUrl ? `Proposal: ${extras.proposalUrl}` : "",
    extras?.jobUrl ? `Job link: ${extras.jobUrl}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
