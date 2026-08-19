import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import type { Database } from "@/lib/supabase/database.types";
import type { CatalogKind, EventKind, PhotoCategory } from "@/lib/types";

type Client = SupabaseClient<Database>;

function remap(source: string, map: Map<string, string>) {
  const existing = map.get(source);
  if (existing) return existing;
  const next = crypto.randomUUID();
  map.set(source, next);
  return next;
}

const CATALOG: {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  unitCost: number;
  costCode: string;
}[] = [
  { id: "cat_sog", name: "Place & finish slab on grade", kind: "labor", unit: "sf", unitCost: 4.85, costCode: "03 30 00" },
  { id: "cat_mix", name: "Ready-mix 4000 psi", kind: "material", unit: "cy", unitCost: 168, costCode: "03 30 00" },
  { id: "cat_steel", name: "Structural steel package", kind: "subcontract", unit: "LS", unitCost: 2180000, costCode: "05 12 00" },
  { id: "cat_carp", name: "Rough carpentry", kind: "labor", unit: "lf", unitCost: 12.4, costCode: "06 10 00" },
  { id: "cat_insul", name: "Batt insulation", kind: "material", unit: "sf", unitCost: 1.85, costCode: "07 21 00" },
  { id: "cat_tpo", name: "TPO roofing", kind: "subcontract", unit: "sf", unitCost: 8.75, costCode: "07 54 00" },
  { id: "cat_doors", name: "HM doors & frames", kind: "material", unit: "ea", unitCost: 980, costCode: "08 11 00" },
  { id: "cat_dw", name: "Drywall hang, tape & finish", kind: "labor", unit: "sf", unitCost: 3.65, costCode: "09 29 00" },
  { id: "cat_paint", name: "Interior paint", kind: "labor", unit: "sf", unitCost: 1.95, costCode: "09 91 00" },
  { id: "cat_elec", name: "Electrical rough & trim", kind: "subcontract", unit: "sf", unitCost: 14.5, costCode: "26 05 00" },
  { id: "cat_plumb", name: "Plumbing rough", kind: "subcontract", unit: "sf", unitCost: 9.8, costCode: "22 00 00" },
  { id: "cat_hvac", name: "HVAC package", kind: "subcontract", unit: "sf", unitCost: 18.2, costCode: "23 00 00" },
  { id: "cat_temp", name: "Temporary facilities", kind: "allowance", unit: "mo", unitCost: 4200, costCode: "01 50 00" },
  { id: "cat_crane", name: "Tower crane", kind: "equipment", unit: "mo", unitCost: 28500, costCode: "01 54 00" },
  { id: "cat_demo", name: "Selective demolition", kind: "labor", unit: "sf", unitCost: 6.4, costCode: "02 41 00" },
  { id: "cat_gc", name: "General conditions", kind: "allowance", unit: "LS", unitCost: 1240000, costCode: "01 11 00" },
  { id: "cat_mep_pkg", name: "MEP design-assist package", kind: "subcontract", unit: "LS", unitCost: 6850000, costCode: "21 00 00" },
  { id: "cat_env", name: "Envelope & waterproofing", kind: "subcontract", unit: "LS", unitCost: 1960000, costCode: "07 10 00" },
  { id: "cat_int", name: "Interiors package", kind: "subcontract", unit: "LS", unitCost: 3410000, costCode: "09 00 00" },
  { id: "cat_conc_pkg", name: "Concrete package", kind: "subcontract", unit: "LS", unitCost: 1240000, costCode: "03 00 00" },
];

export async function wipeOperations(supabase: Client, companyId: string) {
  const tables = [
    "payments",
    "invoice_lines",
    "invoices",
    "estimate_lines",
    "estimates",
    "job_photos",
    "schedule_events",
    "catalog_items",
  ] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("company_id", companyId);
    if (error) throw error;
  }
}

export async function mapExistingSeedIds(supabase: Client, companyId: string) {
  const ids = new Map<string, string>();
  const [clients, opportunities, jobs] = await Promise.all([
    supabase.from("clients").select("id, name").eq("company_id", companyId),
    supabase.from("opportunities").select("id, name").eq("company_id", companyId),
    supabase.from("jobs").select("id, name").eq("company_id", companyId),
  ]);
  if (clients.error) throw clients.error;
  if (opportunities.error) throw opportunities.error;
  if (jobs.error) throw jobs.error;

  for (const client of seedState.clients) {
    const match = (clients.data ?? []).find((row) => row.name === client.name);
    if (match) ids.set(client.id, match.id);
  }
  for (const opportunity of seedState.opportunities) {
    const match = (opportunities.data ?? []).find((row) => row.name === opportunity.name);
    if (match) ids.set(opportunity.id, match.id);
  }
  for (const job of seedState.jobs) {
    const match = (jobs.data ?? []).find((row) => row.name === job.name);
    if (match) ids.set(job.id, match.id);
  }
  return ids;
}

export async function insertOperations(
  supabase: Client,
  companyId: string,
  ids: Map<string, string>
) {
  const catalogIds = new Map<string, string>();
  const { error: catalogError } = await supabase.from("catalog_items").insert(
    CATALOG.map((item) => ({
      id: remap(item.id, catalogIds),
      company_id: companyId,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      unit_cost: item.unitCost,
      cost_code: item.costCode,
    }))
  );
  if (catalogError) throw catalogError;

  const cat = (seedId: string) => {
    const item = CATALOG.find((entry) => entry.id === seedId);
    if (!item) throw new Error(`Missing catalog seed ${seedId}`);
    return {
      catalog_item_id: catalogIds.get(seedId) ?? null,
      description: item.name,
      unit: item.unit,
      unit_cost: item.unitCost,
    };
  };

  const clientId = (seedId: string) => ids.get(seedId);
  const oppId = (seedId: string) => ids.get(seedId) ?? null;
  const jobId = (seedId: string) => ids.get(seedId) ?? null;

  type EstimateSeed = {
    id: string;
    number: string;
    name: string;
    client: string;
    opportunity?: string;
    job?: string;
    status: Database["public"]["Enums"]["estimate_status"];
    notes: string;
    validUntil: string | null;
    sentAt: string | null;
    acceptedAt: string | null;
    createdAt: string;
    lines: { catalog: string; quantity: number; unitCost?: number; description?: string }[];
  };

  const estimates: EstimateSeed[] = [
    {
      id: "est_imaging",
      number: "EST-1001",
      name: "St. Luke's Imaging Pavilion — GMP",
      client: "cli_luke",
      opportunity: "opp_imaging",
      status: "sent",
      notes: "GMP based on 90% CDs. Alternate for MRI shielding listed as an allowance. Valid through Labor Day.",
      validUntil: "2026-09-07",
      sentAt: "2026-08-18T21:10:00.000Z",
      acceptedAt: null,
      createdAt: "2026-08-12T16:00:00.000Z",
      lines: [
        { catalog: "cat_conc_pkg", quantity: 1 },
        { catalog: "cat_steel", quantity: 1 },
        { catalog: "cat_env", quantity: 1 },
        { catalog: "cat_int", quantity: 1 },
        { catalog: "cat_mep_pkg", quantity: 1 },
        { catalog: "cat_gc", quantity: 1 },
      ],
    },
    {
      id: "est_rino",
      number: "EST-1002",
      name: "River North Apartments — working takeoff",
      client: "cli_peakwest",
      opportunity: "opp_rino",
      status: "draft",
      notes: "Podium vs. wood-over-podium still open. Do not send until Thursday VE.",
      validUntil: "2026-09-11",
      sentAt: null,
      acceptedAt: null,
      createdAt: "2026-08-16T15:20:00.000Z",
      lines: [
        { catalog: "cat_sog", quantity: 42000 },
        { catalog: "cat_steel", quantity: 1, unitCost: 3640000, description: "Podium structural steel" },
        { catalog: "cat_carp", quantity: 18600 },
        { catalog: "cat_tpo", quantity: 28000 },
        { catalog: "cat_hvac", quantity: 186000 },
        { catalog: "cat_crane", quantity: 8 },
      ],
    },
    {
      id: "est_cherry",
      number: "EST-1003",
      name: "Cherry Creek Boutique TI — Suite 400",
      client: "cli_copperline",
      opportunity: "opp_cherry_ti",
      status: "accepted",
      notes: "Accepted verbally 8/19. Helen wants a Labor Day start. Convert deposit invoice on award.",
      validUntil: "2026-08-29",
      sentAt: "2026-08-17T18:00:00.000Z",
      acceptedAt: "2026-08-19T15:10:00.000Z",
      createdAt: "2026-08-14T19:30:00.000Z",
      lines: [
        { catalog: "cat_demo", quantity: 8200 },
        { catalog: "cat_dw", quantity: 16400 },
        { catalog: "cat_paint", quantity: 16400 },
        { catalog: "cat_elec", quantity: 8200 },
        { catalog: "cat_doors", quantity: 18 },
        { catalog: "cat_temp", quantity: 4 },
      ],
    },
    {
      id: "est_mob",
      number: "EST-1004",
      name: "Cherry Creek MOB — contract SOV",
      client: "cli_meridian",
      opportunity: "opp_mob",
      job: "job_mob",
      status: "accepted",
      notes: "Schedule of values used for progress billing. App 4 is the current invoice.",
      validUntil: null,
      sentAt: "2026-04-02T17:00:00.000Z",
      acceptedAt: "2026-04-18T16:00:00.000Z",
      createdAt: "2026-03-28T14:00:00.000Z",
      lines: [
        { catalog: "cat_conc_pkg", quantity: 1, unitCost: 4120000, description: "Foundations & structure concrete" },
        { catalog: "cat_steel", quantity: 1, unitCost: 5680000, description: "Structural steel & misc metals" },
        { catalog: "cat_env", quantity: 1, unitCost: 2740000 },
        { catalog: "cat_mep_pkg", quantity: 1, unitCost: 9420000 },
        { catalog: "cat_int", quantity: 1, unitCost: 4860000 },
        { catalog: "cat_gc", quantity: 1, unitCost: 4380000, description: "General conditions & fee" },
      ],
    },
  ];

  for (const estimate of estimates) {
    const cid = clientId(estimate.client);
    if (!cid) continue;
    const estimateUuid = remap(estimate.id, ids);
    const { error } = await supabase.from("estimates").insert({
      id: estimateUuid,
      company_id: companyId,
      number: estimate.number,
      name: estimate.name,
      client_id: cid,
      opportunity_id: estimate.opportunity ? oppId(estimate.opportunity) : null,
      job_id: estimate.job ? jobId(estimate.job) : null,
      status: estimate.status,
      notes: estimate.notes,
      valid_until: estimate.validUntil,
      sent_at: estimate.sentAt,
      accepted_at: estimate.acceptedAt,
      created_at: estimate.createdAt,
    });
    if (error) throw error;

    const { error: lineError } = await supabase.from("estimate_lines").insert(
      estimate.lines.map((line, index) => {
        const source = cat(line.catalog);
        return {
          company_id: companyId,
          estimate_id: estimateUuid,
          catalog_item_id: source.catalog_item_id,
          description: line.description ?? source.description,
          quantity: line.quantity,
          unit: source.unit,
          unit_cost: line.unitCost ?? source.unit_cost,
          sort_order: index,
        };
      })
    );
    if (lineError) throw lineError;
  }

  type InvoiceSeed = {
    id: string;
    number: string;
    name: string;
    client: string;
    job?: string;
    estimate?: string;
    status: Database["public"]["Enums"]["invoice_status"];
    issuedAt: string;
    dueAt: string;
    notes: string;
    lines: { description: string; quantity: number; unit: string; unitCost: number }[];
    payments?: { amount: number; method: string; paidAt: string; reference: string }[];
  };

  const invoices: InvoiceSeed[] = [
    {
      id: "inv_mob_app4",
      number: "INV-2001",
      name: "Cherry Creek MOB — Application 4",
      client: "cli_meridian",
      job: "job_mob",
      estimate: "est_mob",
      status: "partial",
      issuedAt: "2026-08-01",
      dueAt: "2026-08-31",
      notes: "Progress billing through July. Steel erection 60%. Storefront starting next week.",
      lines: [
        { description: "Structural steel — 60% complete", quantity: 0.6, unit: "LS", unitCost: 5680000 },
        { description: "Concrete package — 85% complete", quantity: 0.85, unit: "LS", unitCost: 4120000 },
        { description: "General conditions — July", quantity: 1, unit: "mo", unitCost: 186000 },
      ],
      payments: [
        {
          amount: 2140000,
          method: "ACH",
          paidAt: "2026-08-12",
          reference: "Meridian draw 4 — partial",
        },
      ],
    },
    {
      id: "inv_wynkoop",
      number: "INV-2002",
      name: "Wynkoop Mixed-Use — retainage release",
      client: "cli_meridian",
      job: "job_mixed",
      status: "sent",
      issuedAt: "2026-08-08",
      dueAt: "2026-08-22",
      notes: "Retainage held pending elevator inspection and TCO.",
      lines: [
        { description: "Retainage release — 5% of contract", quantity: 1, unit: "LS", unitCost: 410000 },
      ],
    },
    {
      id: "inv_cherry_dep",
      number: "INV-2003",
      name: "Cherry Creek TI — 10% deposit",
      client: "cli_copperline",
      estimate: "est_cherry",
      status: "paid",
      issuedAt: "2026-08-19",
      dueAt: "2026-08-26",
      notes: "Deposit against accepted proposal EST-1003. Balance to bill on weekly draws after start.",
      lines: [
        { description: "Mobilization & deposit — Suite 400", quantity: 1, unit: "LS", unitCost: 210000 },
      ],
      payments: [
        {
          amount: 210000,
          method: "check",
          paidAt: "2026-08-19",
          reference: "Copperline #4418",
        },
      ],
    },
    {
      id: "inv_rec_precon",
      number: "INV-2004",
      name: "Aurora Rec Center — precon fee",
      client: "cli_aurora",
      job: "job_rec",
      status: "overdue",
      issuedAt: "2026-07-15",
      dueAt: "2026-08-14",
      notes: "Preconstruction services. City AP is waiting on a PO revision.",
      lines: [
        { description: "Preconstruction services — May–July", quantity: 1, unit: "LS", unitCost: 85000 },
      ],
    },
  ];

  for (const invoice of invoices) {
    const cid = clientId(invoice.client);
    if (!cid) continue;
    const invoiceUuid = remap(invoice.id, ids);
    const { error } = await supabase.from("invoices").insert({
      id: invoiceUuid,
      company_id: companyId,
      number: invoice.number,
      name: invoice.name,
      client_id: cid,
      job_id: invoice.job ? jobId(invoice.job) : null,
      estimate_id: invoice.estimate ? ids.get(invoice.estimate) ?? null : null,
      status: invoice.status,
      issued_at: invoice.issuedAt,
      due_at: invoice.dueAt,
      notes: invoice.notes,
    });
    if (error) throw error;

    const { error: lineError } = await supabase.from("invoice_lines").insert(
      invoice.lines.map((line, index) => ({
        company_id: companyId,
        invoice_id: invoiceUuid,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: index,
      }))
    );
    if (lineError) throw lineError;

    if (invoice.payments?.length) {
      const { error: payError } = await supabase.from("payments").insert(
        invoice.payments.map((payment) => ({
          company_id: companyId,
          invoice_id: invoiceUuid,
          amount: payment.amount,
          method: payment.method,
          paid_at: payment.paidAt,
          reference: payment.reference,
        }))
      );
      if (payError) throw payError;
    }
  }

  const events: {
    title: string;
    kind: EventKind;
    startsAt: string;
    endsAt: string;
    location: string;
    assignee: string;
    opportunity?: string;
    job?: string;
    client?: string;
    notes: string;
  }[] = [
    {
      title: "Wynkoop OAC",
      kind: "meeting",
      startsAt: "2026-08-18T15:00:00.000Z",
      endsAt: "2026-08-18T16:00:00.000Z",
      location: "Wynkoop trailer",
      assignee: "Elena Voss",
      job: "job_mixed",
      client: "cli_meridian",
      notes: "Punch at 38 items. Elevator inspector Friday.",
    },
    {
      title: "Front Range freezer layout walk",
      kind: "site_walk",
      startsAt: "2026-08-19T16:00:00.000Z",
      endsAt: "2026-08-19T18:00:00.000Z",
      location: "Commerce City, CO",
      assignee: "Maya Chen",
      opportunity: "opp_cold",
      client: "cli_frontrange",
      notes: "Confirm panel vendor and after-hours pour window.",
    },
    {
      title: "Imaging pavilion GMP follow-up",
      kind: "meeting",
      startsAt: "2026-08-19T20:00:00.000Z",
      endsAt: "2026-08-19T20:45:00.000Z",
      location: "Teams",
      assignee: "Jordan Hale",
      opportunity: "opp_imaging",
      client: "cli_luke",
      notes: "Renee reviewing bid tab. Proposal EST-1001 is out.",
    },
    {
      title: "River North VE workshop",
      kind: "meeting",
      startsAt: "2026-08-20T15:00:00.000Z",
      endsAt: "2026-08-20T17:30:00.000Z",
      location: "Peak West — Boulder",
      assignee: "Priya Shah",
      opportunity: "opp_rino",
      client: "cli_peakwest",
      notes: "Wood-frame vs. podium cost delta. Do not send EST-1002 until after.",
    },
    {
      title: "MOB steel inspection",
      kind: "inspection",
      startsAt: "2026-08-20T19:00:00.000Z",
      endsAt: "2026-08-20T21:00:00.000Z",
      location: "Cherry Creek MOB",
      assignee: "Tom Brennan",
      job: "job_mob",
      client: "cli_meridian",
      notes: "City special inspector on moment frames.",
    },
    {
      title: "Imaging bid due — recap",
      kind: "meeting",
      startsAt: "2026-08-21T14:00:00.000Z",
      endsAt: "2026-08-21T15:00:00.000Z",
      location: "Northline office",
      assignee: "Maya Chen",
      opportunity: "opp_imaging",
      notes: "Internal recap. Bid due today.",
    },
    {
      title: "Wynkoop elevator inspection",
      kind: "inspection",
      startsAt: "2026-08-21T16:00:00.000Z",
      endsAt: "2026-08-21T18:00:00.000Z",
      location: "Wynkoop Mixed-Use",
      assignee: "Elena Voss",
      job: "job_mixed",
      notes: "Last gate before TCO. Ava wants Labor Day weekend.",
    },
    {
      title: "DPS West High — shop overheads",
      kind: "production",
      startsAt: "2026-08-17T14:00:00.000Z",
      endsAt: "2026-08-17T22:00:00.000Z",
      location: "West Colfax",
      assignee: "Tom Brennan",
      job: "job_school",
      client: "cli_dps",
      notes: "Occupied campus. After-hours only.",
    },
    {
      title: "Cherry Creek TI staffing review",
      kind: "pre_bid",
      startsAt: "2026-08-20T21:00:00.000Z",
      endsAt: "2026-08-20T21:30:00.000Z",
      location: "Call with Helen",
      assignee: "Jordan Hale",
      opportunity: "opp_cherry_ti",
      client: "cli_copperline",
      notes: "Send 14-week look-ahead. Labor Day start.",
    },
    {
      title: "Wynkoop punch walk",
      kind: "punch",
      startsAt: "2026-08-22T15:00:00.000Z",
      endsAt: "2026-08-22T18:00:00.000Z",
      location: "Wynkoop Mixed-Use",
      assignee: "Elena Voss",
      job: "job_mixed",
      notes: "Owner punch with Ava.",
    },
  ];

  const { error: eventError } = await supabase.from("schedule_events").insert(
    events.map((event) => ({
      company_id: companyId,
      title: event.title,
      kind: event.kind,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      location: event.location,
      assignee: event.assignee,
      opportunity_id: event.opportunity ? oppId(event.opportunity) : null,
      job_id: event.job ? jobId(event.job) : null,
      client_id: event.client ? clientId(event.client) ?? null : null,
      notes: event.notes,
    }))
  );
  if (eventError) throw eventError;

  const photos: {
    job: string;
    caption: string;
    category: PhotoCategory;
    takenAt: string;
    imageUrl: string;
  }[] = [
    {
      job: "job_mob",
      caption: "Level 3 deck pour looking west toward Cherry Creek.",
      category: "progress",
      takenAt: "2026-08-14",
      imageUrl:
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_mob",
      caption: "Steel erection — moment frame at grid D.",
      category: "progress",
      takenAt: "2026-08-11",
      imageUrl:
        "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_mob",
      caption: "Site logistics before the tower crane jumped.",
      category: "before",
      takenAt: "2026-06-04",
      imageUrl:
        "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_mixed",
      caption: "Lobby millwork punch — waiting on elevator cab finishes.",
      category: "issue",
      takenAt: "2026-08-16",
      imageUrl:
        "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_mixed",
      caption: "Unit 1204 after paint — ready for owner walk.",
      category: "after",
      takenAt: "2026-08-18",
      imageUrl:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_school",
      caption: "CTE shop overheads — after-hours set.",
      category: "progress",
      takenAt: "2026-08-17",
      imageUrl:
        "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1400&q=80",
    },
    {
      job: "job_school",
      caption: "Existing shop floor before demo. Dust control in place.",
      category: "before",
      takenAt: "2026-01-08",
      imageUrl:
        "https://images.unsplash.com/photo-1503384154456-cc0bfd9ab34a?auto=format&fit=crop&w=1400&q=80",
    },
  ];

  const photoRows = photos
    .map((photo) => {
      const jid = jobId(photo.job);
      if (!jid) return null;
      return {
        company_id: companyId,
        job_id: jid,
        caption: photo.caption,
        category: photo.category,
        taken_at: photo.takenAt,
        image_url: photo.imageUrl,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (photoRows.length) {
    const { error: photoError } = await supabase.from("job_photos").insert(photoRows);
    if (photoError) throw photoError;
  }
}

export async function seedOperationsIfMissing(supabase: Client, companyId: string) {
  const { count, error } = await supabase
    .from("catalog_items")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (error) throw error;
  if ((count ?? 0) > 0) return;
  const ids = await mapExistingSeedIds(supabase, companyId);
  await insertOperations(supabase, companyId, ids);
}
