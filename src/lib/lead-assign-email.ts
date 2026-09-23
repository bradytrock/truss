export type LeadAssignRole = "assignee" | "team_lead";

export type LeadAssignFields = {
  homeownerName: string;
  homeownerPhone: string;
  homeownerEmail: string;
  propertyAddress: string;
  notes: string;
  assignedToName: string;
};

export type LeadAssignStaff = {
  id: string;
  name: string;
  email: string;
  teamId: string | null;
  role: string;
  locked?: boolean;
};

export type LeadAssignTeam = {
  id: string;
  leadStaffId: string;
};

export type LeadAssignRecipient = {
  role: LeadAssignRole;
  staffId: string;
  name: string;
  email: string;
};

function blank(value: string) {
  return value.trim() || "—";
}

function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function escapeLeadAssignHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function leadAssignPropertyAddress(input: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  location?: string | null;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const postal = input.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  const site = [street, locality].filter(Boolean).join(", ");
  return site || input.location?.trim() || "Address TBD";
}

export function leadAssignEmailSubject(
  role: LeadAssignRole,
  assignedToName: string,
  propertyAddress: string,
) {
  const address = propertyAddress.trim() || "Address TBD";
  if (role === "team_lead") {
    const who = assignedToName.trim() || "a teammate";
    return `New Lead for ${who} - ${address}`;
  }
  return `New Lead assigned to you - ${address}`;
}

export function leadAssignEmailText(fields: LeadAssignFields) {
  return [
    `Homeowner name: ${blank(fields.homeownerName)}`,
    `Homeowner phone number: ${blank(fields.homeownerPhone)}`,
    `Homeowner email: ${blank(fields.homeownerEmail)}`,
    `Homeowner property address: ${blank(fields.propertyAddress)}`,
    `Notes: ${blank(fields.notes)}`,
  ].join("\n");
}

export function leadAssignEmailHtml(fields: LeadAssignFields) {
  const rows: Array<[string, string]> = [
    ["Homeowner name", fields.homeownerName],
    ["Homeowner phone number", fields.homeownerPhone],
    ["Homeowner email", fields.homeownerEmail],
    ["Homeowner property address", fields.propertyAddress],
    ["Notes", fields.notes],
  ];
  const body = rows
    .map(([label, value]) => {
      const text = escapeLeadAssignHtml(blank(value)).replaceAll("\n", "<br/>");
      return `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#171717;"><strong>${escapeLeadAssignHtml(label)}:</strong> ${text}</p>`;
    })
    .join("");
  const subject = escapeLeadAssignHtml(
    leadAssignEmailSubject("assignee", fields.assignedToName, fields.propertyAddress),
  );
  return `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#e5e5e5;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e5e5e5;padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-collapse:collapse;">
            <tr>
              <td style="padding:32px 40px 8px;">${body}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function leadAssignRecipients(input: {
  assignee: LeadAssignStaff | null | undefined;
  staff: LeadAssignStaff[];
  teams: LeadAssignTeam[];
}): LeadAssignRecipient[] {
  const assignee = input.assignee;
  if (!assignee?.id || assignee.locked) return [];

  const out: LeadAssignRecipient[] = [];
  const seen = new Set<string>();

  const add = (role: LeadAssignRole, member: LeadAssignStaff) => {
    if (!member.id || member.locked) return;
    const email = member.email.trim();
    if (!looksLikeEmail(email)) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      role,
      staffId: member.id,
      name: member.name.trim(),
      email,
    });
  };

  add("assignee", assignee);

  const teamId = assignee.teamId?.trim() ?? "";
  if (!teamId) return out;

  const team = input.teams.find((item) => item.id === teamId);
  const leadIds = new Set<string>();
  const namedLead = team?.leadStaffId?.trim() ?? "";
  if (namedLead) leadIds.add(namedLead);
  for (const member of input.staff) {
    if (member.teamId === teamId && member.role === "team_lead") leadIds.add(member.id);
  }

  for (const id of leadIds) {
    if (id === assignee.id) continue;
    const member = input.staff.find((item) => item.id === id);
    if (member) add("team_lead", member);
  }

  return out;
}

/** Skip the notice when the person who opened the lead kept it. */
export function leadAssignNeedsEmail(input: {
  ownerStaffId?: string | null;
  originatorStaffId?: string | null;
}) {
  const owner = input.ownerStaffId?.trim() ?? "";
  if (!owner) return false;
  const originator = input.originatorStaffId?.trim() ?? "";
  return !originator || originator !== owner;
}

export function parseLeadAssignOpportunityId(body: Record<string, unknown>) {
  const raw = typeof body.opportunityId === "string" ? body.opportunityId : "";
  return raw.trim();
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function parseStaffList(raw: unknown): LeadAssignStaff[] {
  if (!Array.isArray(raw)) return [];
  const staff: LeadAssignStaff[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = asText(row.id ?? row.staffId).trim();
    if (!id) continue;
    staff.push({
      id,
      name: asText(row.name),
      email: asText(row.email),
      teamId: asText(row.teamId ?? row.team_id) || null,
      role: asText(row.role),
      locked: Boolean(row.locked),
    });
  }
  return staff;
}

export function parseVoiceLeadAssignContext(raw: unknown): {
  fields: LeadAssignFields;
  assignee: LeadAssignStaff | null;
  staff: LeadAssignStaff[];
  teams: LeadAssignTeam[];
  companyName: string;
  companyEmail: string;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (row.ok === false) return null;
  const staff = parseStaffList(row.staff);
  const ownerId = asText(row.ownerStaffId ?? row.owner_staff_id).trim();
  const assignee = staff.find((member) => member.id === ownerId) ?? null;
  const teams = Array.isArray(row.teams)
    ? row.teams
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const team = item as Record<string, unknown>;
          const id = asText(team.id).trim();
          if (!id) return null;
          return { id, leadStaffId: asText(team.leadStaffId ?? team.lead_staff_id) };
        })
        .filter((item): item is LeadAssignTeam => Boolean(item))
    : [];
  return {
    fields: {
      homeownerName: asText(row.homeownerName ?? row.homeowner_name),
      homeownerPhone: asText(row.homeownerPhone ?? row.homeowner_phone),
      homeownerEmail: asText(row.homeownerEmail ?? row.homeowner_email),
      propertyAddress: asText(row.propertyAddress ?? row.property_address) || "Address TBD",
      notes: asText(row.notes ?? row.leadNotes),
      assignedToName: asText(row.assignedToName ?? row.assigned_to_name),
    },
    assignee,
    staff,
    teams,
    companyName: asText(row.companyName ?? row.company_name),
    companyEmail: asText(row.companyEmail ?? row.company_email),
  };
}

export type LeadAssignNotifyResult = {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
};

export async function requestLeadAssignNotification(opportunityId: string) {
  const id = opportunityId.trim();
  if (!id) return { ok: false as const, sent: 0, failed: 0, skipped: 1, error: "Missing lead." };
  try {
    const response = await fetch("/api/leads/notify-assigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id }),
    });
    const data = (await response.json().catch(() => ({}))) as LeadAssignNotifyResult & {
      error?: string;
    };
    if (!response.ok) {
      return {
        ok: false as const,
        sent: data.sent ?? 0,
        failed: data.failed ?? 1,
        skipped: data.skipped ?? 0,
        error: data.error || "Could not email that lead assignment.",
      };
    }
    return {
      ok: Boolean(data.ok),
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
      skipped: data.skipped ?? 0,
      error: data.error,
    };
  } catch {
    return {
      ok: false as const,
      sent: 0,
      failed: 1,
      skipped: 0,
      error: "Could not email that lead assignment.",
    };
  }
}
