import type { SupabaseClient } from "@supabase/supabase-js";
import { seedState } from "@/lib/seed";
import { isMissingEstimateWriter, isMissingShareToken, isMissingFinancials, isMissingSignatureColumn, isMissingMessages, isMissingPriceLists, isMissingCatalogMargin } from "@/lib/supabase/schema-errors";
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
    "expenses",
    "payments",
    "invoice_lines",
    "invoices",
    "estimate_lines",
    "estimates",
    "estimate_template_lines",
    "estimate_templates",
    "material_order_template_lines",
    "material_order_templates",
    "material_order_lines",
    "material_orders",
    "job_photos",
    "photo_reports",
    "schedule_events",
    "catalog_items",
    "price_lists",
    "messages",
  ] as const;
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("company_id", companyId);
    if (error && (error.code === "PGRST205" || error.message.includes("schema cache") || error.message.includes("Could not find the") || error.message.includes("expenses"))) {
      continue;
    }
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
  const now = new Date().toISOString();
  const seedLists = seed.priceLists.length > 0
    ? seed.priceLists
    : [
        {
          id: crypto.randomUUID(),
          name: "Price list",
          effectiveOn: now.slice(0, 10),
          outdatedAt: null as string | null,
          createdAt: now,
        },
      ];
  const defaultListId = seedLists[0]?.id;
  const priceListRows = seedLists.map((list) => ({
    id: remap(list.id, ids),
    company_id: companyId,
    name: list.name,
    effective_on: list.effectiveOn,
    outdated_at: list.outdatedAt,
    created_at: list.createdAt,
  }));
  const { error: priceListError } = await supabase.from("price_lists").insert(priceListRows);
  if (priceListError && !isMissingPriceLists(priceListError)) throw priceListError;
  const listsPersist = !priceListError;

  const catalogPayload = seed.catalog.map((item) => ({
    id: remap(item.id, ids),
    company_id: companyId,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    unit_cost: item.unitCost,
    cost_code: item.costCode,
    margin_percent: item.marginPercent,
    price_list_id: listsPersist
      ? remap(item.priceListId || defaultListId || item.id, ids)
      : undefined,
  }));
  let catalogError = (await supabase.from("catalog_items").insert(catalogPayload)).error;
  if (catalogError && isMissingCatalogMargin(catalogError)) {
    catalogError = (
      await supabase.from("catalog_items").insert(
        catalogPayload.map(({ margin_percent: _margin, ...row }) => row),
      )
    ).error;
  }
  if (catalogError && isMissingPriceLists(catalogError)) {
    catalogError = (
      await supabase.from("catalog_items").insert(
        catalogPayload.map(({ price_list_id: _list, ...row }) => row),
      )
    ).error;
  }
  if (catalogError && isMissingCatalogMargin(catalogError)) {
    catalogError = (
      await supabase.from("catalog_items").insert(
        catalogPayload.map(({ margin_percent: _margin, price_list_id: _list, ...row }) => row),
      )
    ).error;
  }
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
        share_token: estimate.shareToken,
        signature_name: estimate.signatureName,
        signature_image: estimate.signatureImage,
      },
    ];
  });
  let { error: estimateError } = await supabase.from("estimates").insert(estimateRows);
  if (estimateError && isMissingSignatureColumn(estimateError)) {
    const retry = await supabase.from("estimates").insert(
      estimateRows.map(({ signature_name: _name, signature_image: _image, ...row }) => row),
    );
    estimateError = retry.error;
  }
  if (estimateError && isMissingShareToken(estimateError)) {
    const retry = await supabase.from("estimates").insert(
      estimateRows.map(({ share_token: _shareToken, ...row }) => row),
    );
    estimateError = retry.error;
  }
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

  const invoiceRows = seed.invoices.flatMap((invoice) => {
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
        share_token: invoice.shareToken,
        qb_status: invoice.qbStatus,
      },
    ];
  });
  let { error: invoiceError } = await supabase.from("invoices").insert(invoiceRows);
  if (invoiceError && isMissingFinancials(invoiceError)) {
    const retry = await supabase.from("invoices").insert(
      invoiceRows.map(({ qb_status: _qb, ...row }) => row),
    );
    invoiceError = retry.error;
  }
  if (invoiceError && isMissingShareToken(invoiceError)) {
    const retry = await supabase.from("invoices").insert(
      invoiceRows.map(({ share_token: _shareToken, ...row }) => row),
    );
    invoiceError = retry.error;
  }
  if (invoiceError && isMissingEstimateWriter(invoiceError)) {
    const retry = await supabase.from("invoices").insert(
      invoiceRows.map((row) => ({
        id: row.id,
        company_id: row.company_id,
        number: row.number,
        name: row.name,
        client_id: row.client_id,
        job_id: row.job_id,
        estimate_id: row.estimate_id,
        status: row.status,
        issued_at: row.issued_at,
        due_at: row.due_at,
        notes: row.notes,
      })),
    );
    invoiceError = retry.error;
  }
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

  let { error: paymentError } = await supabase.from("payments").insert(
    seed.payments.flatMap((payment) => {
      const invoiceId = payment.invoiceId ? ids.get(payment.invoiceId) ?? null : null;
      if (payment.invoiceId && !invoiceId) return [];
      return [
        {
          id: remap(payment.id, ids),
          company_id: companyId,
          invoice_id: invoiceId,
          job_id: payment.jobId ? ids.get(payment.jobId) ?? null : null,
          amount: payment.amount,
          method: payment.method,
          paid_at: payment.paidAt,
          reference: payment.reference,
          receipt_url: payment.receiptUrl,
          receipt_storage_path: payment.receiptStoragePath,
          qb_status: payment.qbStatus,
          created_by: payment.createdBy,
        },
      ];
    })
  );
  if (paymentError && isMissingFinancials(paymentError)) {
    const retry = await supabase.from("payments").insert(
      seed.payments.flatMap((payment) => {
        const invoiceId = payment.invoiceId ? ids.get(payment.invoiceId) ?? null : null;
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
      }),
    );
    paymentError = retry.error;
  }
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
        created_by: photo.createdBy ?? "",
      },
    ];
  });
  if (photoRows.length) {
    const { error: photoError } = await supabase.from("job_photos").insert(photoRows);
    if (photoError) throw photoError;
  }

  const expenseRows = seed.expenses.flatMap((expense) => {
    const jobId = expense.jobId ? ids.get(expense.jobId) ?? null : null;
    if (expense.jobId && !jobId) return [];
    return [
      {
        id: remap(expense.id, ids),
        company_id: companyId,
        number: expense.number,
        job_id: jobId,
        vendor: expense.vendor,
        account: expense.account,
        amount: expense.amount,
        incurred_at: expense.incurredAt,
        method: expense.method,
        memo: expense.memo,
        receipt_url: expense.receiptUrl,
        receipt_storage_path: expense.receiptStoragePath,
        qb_status: expense.qbStatus,
        extracted_by_ai: expense.extractedByAi,
        created_at: expense.createdAt,
        created_by: expense.createdBy,
      },
    ];
  });
  if (expenseRows.length) {
    const { error: expenseError } = await supabase.from("expenses").insert(expenseRows);
    if (expenseError && !isMissingFinancials(expenseError)) throw expenseError;
  }

  const messageRows = seed.messages.flatMap((message) => {
    const contactId = mappedId(message.contactId, ids);
    const jobId = mappedId(message.jobId, ids);
    const opportunityId = mappedId(message.opportunityId, ids);
    if (message.contactId && !contactId) return [];
    return [
      {
        id: remap(message.id, ids),
        company_id: companyId,
        contact_id: contactId,
        job_id: jobId,
        opportunity_id: opportunityId,
        direction: message.direction,
        phone: message.phone,
        body: message.body,
        handle: message.handle,
        status: message.status,
        media_url: message.mediaUrl,
        created_at: message.createdAt,
        created_by: message.createdBy,
      },
    ];
  });
  if (messageRows.length) {
    const { error: messageError } = await supabase.from("messages").insert(messageRows);
    if (messageError && !isMissingMessages(messageError)) throw messageError;
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
