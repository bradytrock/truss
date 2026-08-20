import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import { isMissingEstimateWriter } from "@/lib/supabase/schema-errors";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

function remap(source: string, map: Map<string, string>) {
  const existing = map.get(source);
  if (existing) return existing;
  const next = crypto.randomUUID();
  map.set(source, next);
  return next;
}

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
  const [clients, opportunities, jobs, contacts] = await Promise.all([
    supabase.from("clients").select("id, name").eq("company_id", companyId),
    supabase.from("opportunities").select("id, name").eq("company_id", companyId),
    supabase.from("jobs").select("id, name").eq("company_id", companyId),
    supabase.from("contacts").select("id, name").eq("company_id", companyId),
  ]);
  if (clients.error) throw clients.error;
  if (opportunities.error) throw opportunities.error;
  if (jobs.error) throw jobs.error;
  if (contacts.error) throw contacts.error;

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
  for (const contact of seedState.contacts) {
    const match = (contacts.data ?? []).find((row) => row.name === contact.name);
    if (match) ids.set(contact.id, match.id);
  }
  return ids;
}

function mappedId(source: string | null | undefined, ids: Map<string, string>) {
  if (!source) return null;
  return ids.get(source) ?? null;
}

export async function insertOperations(
  supabase: Client,
  companyId: string,
  ids: Map<string, string>,
  householdId: string | null = null,
) {
  const seed = seedState;

  const { error: catalogError } = await supabase.from("catalog_items").insert(
    seed.catalog.map((item) => ({
      id: remap(item.id, ids),
      company_id: companyId,
      name: item.name,
      kind: item.kind,
      unit: item.unit,
      unit_cost: item.unitCost,
      cost_code: item.costCode,
    }))
  );
  if (catalogError) throw catalogError;

  const estimateRows = seed.estimates.flatMap((estimate) => {
    const clientId = estimate.clientId ? ids.get(estimate.clientId) ?? null : householdId;
    if (estimate.clientId && !clientId) return [];
    return [
      {
        id: remap(estimate.id, ids),
        company_id: companyId,
        number: estimate.number,
        name: estimate.name,
        client_id: clientId,
        opportunity_id: mappedId(estimate.opportunityId, ids),
        job_id: mappedId(estimate.jobId, ids),
        contact_id: mappedId(estimate.contactId, ids),
        status: estimate.status,
        notes: estimate.notes,
        valid_until: estimate.validUntil,
        sent_at: estimate.sentAt,
        accepted_at: estimate.acceptedAt,
        created_at: estimate.createdAt,
        tax_rate: estimate.taxRate,
        discount_kind: estimate.discountKind,
        discount_value: estimate.discountValue,
        deposit_kind: estimate.depositKind,
        deposit_value: estimate.depositValue,
        intro: estimate.intro,
        terms: estimate.terms,
        street: estimate.street,
        city: estimate.city,
        state: estimate.state,
        postal_code: estimate.postalCode,
      },
    ];
  });
  let { error: estimateError } = await supabase.from("estimates").insert(estimateRows);
  if (estimateError && isMissingEstimateWriter(estimateError)) {
    const retry = await supabase.from("estimates").insert(
      estimateRows.map((row) => ({
        id: row.id,
        company_id: row.company_id,
        number: row.number,
        name: row.name,
        client_id: row.client_id,
        opportunity_id: row.opportunity_id,
        job_id: row.job_id,
        status: row.status,
        notes: row.notes,
        valid_until: row.valid_until,
        sent_at: row.sent_at,
        accepted_at: row.accepted_at,
        created_at: row.created_at,
      })),
    );
    estimateError = retry.error;
  }
  if (estimateError) throw estimateError;

  const estimateLineRows = seed.estimateLines.flatMap((line) => {
    const estimateId = ids.get(line.estimateId);
    if (!estimateId) return [];
    return [
      {
        id: remap(line.id, ids),
        company_id: companyId,
        estimate_id: estimateId,
        catalog_item_id: mappedId(line.catalogItemId, ids),
        title: line.title,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_cost: line.unitCost,
        sort_order: line.sortOrder,
        group_name: line.groupName,
        optional: line.optional,
        selected: line.selected,
        taxable: line.taxable,
      },
    ];
  });
  let { error: estimateLineError } = await supabase.from("estimate_lines").insert(estimateLineRows);
  if (estimateLineError && isMissingEstimateWriter(estimateLineError)) {
    const retry = await supabase.from("estimate_lines").insert(
      estimateLineRows.map((row) => ({
        id: row.id,
        company_id: row.company_id,
        estimate_id: row.estimate_id,
        catalog_item_id: row.catalog_item_id,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unit_cost: row.unit_cost,
        sort_order: row.sort_order,
      })),
    );
    estimateLineError = retry.error;
  }
  if (estimateLineError) throw estimateLineError;

  const { error: invoiceError } = await supabase.from("invoices").insert(
    seed.invoices.flatMap((invoice) => {
      const clientId = invoice.clientId
        ? ids.get(invoice.clientId) ?? null
        : householdId;
      if (invoice.clientId && !clientId) return [];
      return [
        {
          id: remap(invoice.id, ids),
          company_id: companyId,
          number: invoice.number,
          name: invoice.name,
          client_id: clientId,
          job_id: invoice.jobId ? ids.get(invoice.jobId) ?? null : null,
          estimate_id: invoice.estimateId ? ids.get(invoice.estimateId) ?? null : null,
          status: invoice.status,
          issued_at: invoice.issuedAt,
          due_at: invoice.dueAt,
          notes: invoice.notes,
        },
      ];
    })
  );
  if (invoiceError) throw invoiceError;

  const { error: invoiceLineError } = await supabase.from("invoice_lines").insert(
    seed.invoiceLines.flatMap((line) => {
      const invoiceId = ids.get(line.invoiceId);
      if (!invoiceId) return [];
      return [
        {
          id: remap(line.id, ids),
          company_id: companyId,
          invoice_id: invoiceId,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
        },
      ];
    })
  );
  if (invoiceLineError) throw invoiceLineError;

  const { error: paymentError } = await supabase.from("payments").insert(
    seed.payments.flatMap((payment) => {
      const invoiceId = ids.get(payment.invoiceId);
      if (!invoiceId) return [];
      return [
        {
          id: remap(payment.id, ids),
          company_id: companyId,
          invoice_id: invoiceId,
          amount: payment.amount,
          method: payment.method,
          paid_at: payment.paidAt,
          reference: payment.reference,
        },
      ];
    })
  );
  if (paymentError) throw paymentError;

  const { error: eventError } = await supabase.from("schedule_events").insert(
    seed.events.map((event) => ({
      id: remap(event.id, ids),
      company_id: companyId,
      title: event.title,
      kind: event.kind,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      location: event.location,
      assignee: event.assignee,
      opportunity_id: event.opportunityId ? ids.get(event.opportunityId) ?? null : null,
      job_id: event.jobId ? ids.get(event.jobId) ?? null : null,
      client_id: event.clientId ? ids.get(event.clientId) ?? null : null,
      notes: event.notes,
    }))
  );
  if (eventError) throw eventError;

  const photoRows = seed.photos.flatMap((photo) => {
    const jobId = ids.get(photo.jobId);
    if (!jobId) return [];
    return [
      {
        id: remap(photo.id, ids),
        company_id: companyId,
        job_id: jobId,
        caption: photo.caption,
        category: photo.category,
        taken_at: photo.takenAt,
        image_url: photo.imageUrl,
        storage_path: photo.storagePath,
      },
    ];
  });
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
