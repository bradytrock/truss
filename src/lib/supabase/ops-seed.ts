import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
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

  const { error: estimateError } = await supabase.from("estimates").insert(
    seed.estimates.flatMap((estimate) => {
      const clientId = estimate.clientId ? ids.get(estimate.clientId) ?? null : null;
      if (estimate.clientId && !clientId) return [];
      return [
        {
          id: remap(estimate.id, ids),
          company_id: companyId,
          number: estimate.number,
          name: estimate.name,
          client_id: clientId,
          opportunity_id: estimate.opportunityId ? ids.get(estimate.opportunityId) ?? null : null,
          job_id: estimate.jobId ? ids.get(estimate.jobId) ?? null : null,
          status: estimate.status,
          notes: estimate.notes,
          valid_until: estimate.validUntil,
          sent_at: estimate.sentAt,
          accepted_at: estimate.acceptedAt,
          created_at: estimate.createdAt,
        },
      ];
    })
  );
  if (estimateError) throw estimateError;

  const { error: estimateLineError } = await supabase.from("estimate_lines").insert(
    seed.estimateLines.flatMap((line) => {
      const estimateId = ids.get(line.estimateId);
      if (!estimateId) return [];
      return [
        {
          id: remap(line.id, ids),
          company_id: companyId,
          estimate_id: estimateId,
          catalog_item_id: line.catalogItemId ? ids.get(line.catalogItemId) ?? null : null,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unit_cost: line.unitCost,
          sort_order: line.sortOrder,
        },
      ];
    })
  );
  if (estimateLineError) throw estimateLineError;

  const { error: invoiceError } = await supabase.from("invoices").insert(
    seed.invoices.flatMap((invoice) => {
      const clientId = invoice.clientId ? ids.get(invoice.clientId) ?? null : null;
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
