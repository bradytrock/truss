import { defaultDeliveryForSource, formatJobSite, leadName } from "@/lib/leads";
import { localYmd } from "@/lib/format";
import { isDeletedJob } from "@/lib/job-record";
import { estimateTotals } from "@/lib/estimate-totals";
import { invoiceBalance, invoiceTotal } from "@/lib/money";
import { compressReceipt, guessExpenseAccount, isExpenseAccount, isExpenseMethod, jobProfitAndLoss } from "@/lib/job-financials";
import { projectTypeForMarket, workMarket } from "@/lib/market";
import { isWorkColumn, WORK_COLUMN_LABELS } from "@/lib/work-board";
import { fileFromDataUrl, asBoolean, asNumber, asString, parseLocalDateTime } from "@/lib/assistant/files";
import { money } from "@/lib/assistant/context";
import type { AssistantToolCall, AssistantToolResult } from "@/lib/assistant/types";
import { toolByName } from "@/lib/assistant/tools";
import { useCrm } from "@/lib/crm-store";
import {
  EVENT_KINDS,
  EXPENSE_ACCOUNTS,
  LEAD_SOURCES,
  PHOTO_CATEGORIES,
  type EventKind,
  type ExpenseAccount,
  type ExpenseMethod,
  type JobMarket,
  type LeadSource,
  type PhotoCategory,
} from "@/lib/types";
import { canDeleteJobs } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";
import { catalogProposalUnitPrice } from "@/lib/catalog-margin";
import { expenseRequiresJob } from "@/lib/qbwc/work";

type Crm = ReturnType<typeof useCrm>;

function haystack(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matches(hay: string, query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every((token) => hay.includes(token));
}

function fail(error: string): AssistantToolResult {
  return { ok: false, error };
}

function ok(data: unknown, extra?: Pick<AssistantToolResult, "href" | "label">): AssistantToolResult {
  return { ok: true, data, ...extra };
}

function arg(args: Record<string, unknown>, key: string) {
  return asString(args[key]);
}

function resolveJob(crm: Crm, value: string) {
  const needle = value.trim();
  if (!needle) return undefined;
  return (
    crm.getJob(needle) ||
    crm.jobs.find((job) => job.code.toLowerCase() === needle.toLowerCase()) ||
    crm.jobs.find((job) => matches(haystack(job.code, job.name, job.location), needle))
  );
}

function resolveContact(crm: Crm, value: string) {
  const needle = value.trim();
  if (!needle) return undefined;
  const byId = crm.getContact(needle);
  if (byId) return byId;
  const lower = needle.toLowerCase();
  return (
    crm.contacts.find((contact) => contact.name.toLowerCase() === lower) ||
    crm.contacts.find((contact) => matches(haystack(contact.name, contact.email, contact.phone, contact.title), needle))
  );
}

function resolveEstimate(crm: Crm, value: string) {
  const needle = value.trim();
  if (!needle) return undefined;
  return (
    crm.getEstimate(needle) ||
    crm.estimates.find((estimate) => estimate.number.toLowerCase() === needle.toLowerCase()) ||
    crm.estimates.find((estimate) => matches(haystack(estimate.number, estimate.name), needle))
  );
}

function resolveInvoice(crm: Crm, value: string) {
  const needle = value.trim();
  if (!needle) return undefined;
  return (
    crm.getInvoice(needle) ||
    crm.invoices.find((invoice) => invoice.number.toLowerCase() === needle.toLowerCase()) ||
    crm.invoices.find((invoice) => matches(haystack(invoice.number, invoice.name), needle))
  );
}

function isLeadSource(value: string): value is LeadSource {
  return (LEAD_SOURCES as readonly string[]).includes(value);
}

function isEventKind(value: string): value is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(value);
}

function isPhotoCategory(value: string): value is PhotoCategory {
  return (PHOTO_CATEGORIES as readonly string[]).includes(value);
}

async function extractReceipt(kind: "expense" | "payment", file: File) {
  try {
    const compressed = await compressReceipt(file);
    const response = await fetch("/api/receipts/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: compressed.dataUrl, kind }),
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; vendor?: string; amount?: number; date?: string; memo?: string; account?: string; method?: string; reference?: string }
      | null;
    return { file: compressed.file, extracted: body?.ok ? body : null };
  } catch {
    return { file, extracted: null };
  }
}

export type ExecuteExtras = {
  attachment?: { dataUrl: string; name: string } | null;
  skipPaymentConfirm?: boolean;
};

export function describeToolCall(call: AssistantToolCall) {
  const args = call.arguments;
  switch (call.name) {
    case "send_estimate":
      return `Send estimate ${arg(args, "estimate") || "this proposal"} to the client?`;
    case "send_invoice":
      return `Send invoice ${arg(args, "invoice") || "this invoice"} to the client?`;
    case "void_invoice":
      return `Void invoice ${arg(args, "invoice") || "this invoice"}? This cannot be undone from the assistant.`;
    case "accept_estimate":
      return `Mark estimate ${arg(args, "estimate") || "this proposal"} signed in the office?`;
    case "delete_job":
      return `Delete job ${arg(args, "job") || "this job"}? ${arg(args, "reason") || "A reason is required."}`;
    case "log_payment":
      return `Record a ${money(asNumber(args.amount))} payment${arg(args, "invoice") || arg(args, "job") ? ` on ${arg(args, "invoice") || arg(args, "job")}` : ""}?`;
    default:
      return toolByName(call.name)?.status ?? "Do this?";
  }
}

export function shouldConfirmCall(call: AssistantToolCall, extras: ExecuteExtras) {
  if (call.name === "log_payment" && extras.attachment) return false;
  return Boolean(toolByName(call.name)?.confirm);
}

async function runTool(
  crm: Crm,
  call: AssistantToolCall,
  extras: ExecuteExtras,
): Promise<AssistantToolResult> {
  const def = toolByName(call.name);
  if (!def) return fail(`Unknown tool ${call.name}.`);
  const bd = isBusinessDevelopment(crm.viewer?.role);
  if (def.gate === "ops" && bd) return fail("This seat does not write estimates, invoices, or the calendar. Open a lead, a contact, or log an expense.");
  if (def.gate === "admin" && !canDeleteJobs(crm.viewer)) return fail("Only a company admin can delete a job.");

  const args = call.arguments;

  switch (call.name) {
    case "search_book": {
      const query = arg(args, "query");
      const kind = arg(args, "kind") || "all";
      if (!query) return fail("Need a search query.");
      const jobs =
        kind === "all" || kind === "job"
          ? crm.jobs
              .filter((job) => !isDeletedJob(job) && matches(haystack(job.code, job.name, job.location, job.street, job.city), query))
              .slice(0, 8)
              .map((job) => ({ kind: "job", id: job.id, code: job.code, name: job.name, location: job.location }))
          : [];
      const contacts =
        kind === "all" || kind === "contact"
          ? crm.contacts
              .filter((contact) => matches(haystack(contact.name, contact.title, contact.email, contact.phone), query))
              .slice(0, 8)
              .map((contact) => ({
                kind: "contact",
                id: contact.id,
                name: contact.name,
                title: contact.title,
                phone: contact.phone,
                email: contact.email,
              }))
          : [];
      const estimates =
        kind === "all" || kind === "estimate"
          ? crm.estimates
              .filter((estimate) => matches(haystack(estimate.number, estimate.name), query))
              .slice(0, 8)
              .map((estimate) => ({ kind: "estimate", id: estimate.id, number: estimate.number, name: estimate.name, status: estimate.status }))
          : [];
      const invoices =
        kind === "all" || kind === "invoice"
          ? crm.invoices
              .filter((invoice) => matches(haystack(invoice.number, invoice.name), query))
              .slice(0, 8)
              .map((invoice) => ({ kind: "invoice", id: invoice.id, number: invoice.number, name: invoice.name, status: invoice.status }))
          : [];
      return ok({ jobs, contacts, estimates, invoices, total: jobs.length + contacts.length + estimates.length + invoices.length });
    }
    case "get_job": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job in this book matches that.");
      const contact = crm.getContact(job.primaryContactId);
      const opportunity = job.opportunityId ? crm.getOpportunity(job.opportunityId) : undefined;
      const books = jobProfitAndLoss({
        job,
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
        basis: "accrual",
      });
      const estimates = crm.estimates
        .filter((estimate) => estimate.jobId === job.id)
        .map((estimate) => ({ id: estimate.id, number: estimate.number, name: estimate.name, status: estimate.status }));
      return ok({
        id: job.id,
        code: job.code,
        name: job.name,
        location: job.location,
        street: job.street,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
        status: job.status,
        market: workMarket(job, opportunity),
        homeowner: contact?.name ?? crm.customerName(job),
        phone: contact?.phone,
        projectManager: job.projectManager,
        superintendent: job.superintendent,
        contractValue: job.contractValue,
        invoiced: books.invoiced,
        collected: books.collected,
        ar: books.ar,
        expenses: books.expenses,
        estimates,
      });
    }
    case "get_contact": {
      const contact = resolveContact(crm, arg(args, "contact"));
      if (!contact) return fail("No person in this book matches that.");
      const jobs = crm.jobs
        .filter((job) => !isDeletedJob(job) && (job.primaryContactId === contact.id || job.relatedContactIds.includes(contact.id)))
        .slice(0, 8)
        .map((job) => ({ id: job.id, code: job.code, name: job.name }));
      return ok({
        id: contact.id,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        referralPartner: contact.isReferralPartner,
        jobs,
      });
    }
    case "get_estimate": {
      const estimate = resolveEstimate(crm, arg(args, "estimate"));
      if (!estimate) return fail("No estimate matches that.");
      const lines = crm.estimateLines.filter((line) => line.estimateId === estimate.id);
      const totals = estimateTotals(estimate, lines);
      const job = estimate.jobId ? crm.getJob(estimate.jobId) : undefined;
      return ok({
        id: estimate.id,
        number: estimate.number,
        name: estimate.name,
        status: estimate.status,
        job: job ? { id: job.id, code: job.code, name: job.name } : null,
        total: totals.total,
        lineCount: lines.length,
        lines: lines.slice(0, 20).map((line) => ({
          id: line.id,
          title: line.title,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          optional: line.optional,
        })),
      });
    }
    case "get_invoice": {
      const invoice = resolveInvoice(crm, arg(args, "invoice"));
      if (!invoice) return fail("No invoice matches that.");
      const total = invoiceTotal(invoice.id, crm.invoiceLines);
      const balance = invoiceBalance(invoice.id, crm.invoiceLines, crm.payments);
      const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
      return ok({
        id: invoice.id,
        number: invoice.number,
        name: invoice.name,
        status: invoice.status,
        total,
        balance,
        job: job ? { id: job.id, code: job.code, name: job.name } : null,
      });
    }
    case "search_catalog": {
      const query = arg(args, "query");
      if (!query) return fail("Need a catalog search.");
      const items = crm.catalog
        .filter((item) => matches(haystack(item.name, item.costCode, item.kind), query))
        .slice(0, 12)
        .map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          unitCost: item.unitCost,
          marginPercent: item.marginPercent,
          proposalPrice: catalogProposalUnitPrice(item, crm.company),
          kind: item.kind,
        }));
      return ok({ items });
    }
    case "open_record": {
      const kind = arg(args, "kind");
      const id = arg(args, "id");
      if (!kind || !id) return fail("Need a record kind and id.");
      const href =
        kind === "job"
          ? `/jobs?job=${id}`
          : kind === "contact"
            ? `/contacts?contact=${id}`
            : kind === "estimate"
              ? `/estimates/${id}`
              : kind === "invoice"
                ? `/invoices/${id}`
                : "";
      if (!href) return fail("Unknown record kind.");
      return ok({ kind, id }, { href, label: "Open" });
    }
    case "create_lead": {
      const firstName = arg(args, "firstName");
      const lastName = arg(args, "lastName");
      const phone = arg(args, "phone");
      const email = arg(args, "email");
      const source = arg(args, "source");
      if (!firstName || !lastName) return fail("First and last name are required.");
      if (!phone && !email) return fail("Add a phone or email so someone can call them back.");
      if (!isLeadSource(source)) return fail("Pick a seed (website, phone, realtor, referral, …).");
      const referralContactId = arg(args, "referralContactId");
      if (source === "referral" && !referralContactId) return fail("Referral leads need the person who sent them.");
      const market = (arg(args, "market") === "commercial" ? "commercial" : "residential") as JobMarket;
      const street = arg(args, "street");
      const city = arg(args, "city");
      const state = arg(args, "state");
      const postalCode = arg(args, "postalCode");
      const site = formatJobSite({ street, city, state, postalCode });
      const fullName = `${firstName} ${lastName}`;
      const existing = crm.contacts.find(
        (contact) =>
          contact.name.toLowerCase() === fullName.toLowerCase() ||
          (phone && contact.phone && contact.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")) ||
          (email && contact.email && contact.email.toLowerCase() === email.toLowerCase()),
      );
      const ownerId = crm.effectiveStaff?.id || crm.user.staffId;
      const contact =
        existing ??
        (await crm.addContact({
          clientId: null,
          name: fullName,
          title: "Homeowner",
          email,
          phone,
          ownerStaffId: ownerId,
          isReferralPartner: false,
        }));
      if (existing) {
        await crm.updateContact(existing.id, {
          phone: phone || existing.phone,
          email: email || existing.email,
        });
      }
      const created = await crm.addOpportunity({
        name: leadName(firstName, lastName, site || city),
        clientId: null,
        primaryContactId: contact.id,
        stage: "pursuing",
        value: 0,
        bidDueAt: null,
        preBidWalkAt: null,
        location: site || city || "Address TBD",
        projectType: projectTypeForMarket(market),
        market,
        deliveryMethod: defaultDeliveryForSource(source),
        estimator: crm.effectiveStaff?.name || crm.user.name,
        ownerStaffId: ownerId,
        originatorStaffId: crm.user.staffId,
        nextStep: "Call back within 5 minutes.",
        leadSource: source,
        referralContactId: source === "referral" ? referralContactId : null,
        street,
        city,
        state,
        postalCode,
        notes: arg(args, "notes"),
      });
      const job = created.costingJob;
      await crm.addTask({
        title: `Call ${fullName} back`,
        dueAt: localYmd(new Date()),
        relatedType: "opportunity",
        relatedId: created.id,
        assignee: crm.effectiveStaff?.name || crm.user.name,
      });
      return ok(
        { opportunityId: created.id, code: created.code, name: created.name, jobId: job?.id, contactId: contact.id },
        job ? { href: `/jobs?job=${job.id}`, label: `Open ${created.code}` } : { href: `/opportunities/${created.id}`, label: `Open ${created.code}` },
      );
    }
    case "create_or_update_contact": {
      const name = arg(args, "name");
      if (!name) return fail("A name is required.");
      const existing = arg(args, "contactId") ? crm.getContact(arg(args, "contactId")) : resolveContact(crm, name);
      const patch = {
        name,
        title: arg(args, "title") || existing?.title || "Homeowner",
        phone: arg(args, "phone") || existing?.phone || "",
        email: arg(args, "email") || existing?.email || "",
        isReferralPartner: asBoolean(args.isReferralPartner) ?? existing?.isReferralPartner ?? false,
      };
      if (existing) {
        await crm.updateContact(existing.id, patch);
        return ok({ id: existing.id, updated: true, ...patch }, { href: `/contacts?contact=${existing.id}`, label: `Open ${name}` });
      }
      const created = await crm.addContact({
        clientId: null,
        ownerStaffId: crm.effectiveStaff?.id || crm.user.staffId,
        ...patch,
      });
      return ok({ id: created.id, updated: false, name: created.name }, { href: `/contacts?contact=${created.id}`, label: `Open ${created.name}` });
    }
    case "update_job": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const street = arg(args, "street");
      const city = arg(args, "city");
      const state = arg(args, "state");
      const postalCode = arg(args, "postalCode");
      const site = formatJobSite({
        street: street || job.street,
        city: city || job.city,
        state: state || job.state,
        postalCode: postalCode || job.postalCode,
      });
      await crm.updateJob(job.id, {
        name: arg(args, "name") || job.name,
        street: street || job.street,
        city: city || job.city,
        state: state || job.state,
        postalCode: postalCode || job.postalCode,
        location: site || job.location,
        projectManager: arg(args, "projectManager") || job.projectManager,
        superintendent: arg(args, "superintendent") || job.superintendent,
        description: arg(args, "description") || job.description,
      });
      return ok({ id: job.id, code: job.code }, { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` });
    }
    case "move_job": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const column = arg(args, "column");
      if (!isWorkColumn(column) || column === "deleted") return fail("Pick a board column.");
      await crm.moveWork(job.id, column);
      return ok(
        { id: job.id, column, label: WORK_COLUMN_LABELS[column] },
        { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` },
      );
    }
    case "create_estimate": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const estimate = await crm.addEstimate({
        name: arg(args, "name") || job.name,
        clientId: job.clientId,
        opportunityId: job.opportunityId,
        jobId: job.id,
        contactId: job.primaryContactId,
        notes: arg(args, "notes"),
        street: job.street,
        city: job.city,
        state: job.state,
        postalCode: job.postalCode,
        market: job.market,
      });
      return ok(
        { id: estimate.id, number: estimate.number, name: estimate.name },
        { href: `/estimates/${estimate.id}`, label: `Open ${estimate.number}` },
      );
    }
    case "add_estimate_line": {
      const estimate = resolveEstimate(crm, arg(args, "estimate"));
      if (!estimate) return fail("No estimate matches that.");
      const catalogItemId = arg(args, "catalogItemId");
      const title = arg(args, "title");
      const quantity = asNumber(args.quantity) || 1;
      const groupName = arg(args, "groupName") || undefined;
      let line = catalogItemId ? await crm.addEstimateLineFromCatalog(estimate.id, catalogItemId, groupName) : undefined;
      if (!line) {
        line = await crm.addCustomEstimateLine(estimate.id, groupName);
      }
      if (!line) return fail("Could not add the line.");
      const patch: {
        title?: string;
        quantity?: number;
        unitCost?: number;
        unit?: string;
        optional?: boolean;
      } = { quantity };
      if (title) patch.title = title;
      if (args.unitCost !== undefined) patch.unitCost = asNumber(args.unitCost);
      if (arg(args, "unit")) patch.unit = arg(args, "unit");
      if (asBoolean(args.optional) !== undefined) patch.optional = asBoolean(args.optional);
      await crm.updateEstimateLine(line.id, patch);
      return ok({ lineId: line.id, estimateId: estimate.id, title: title || line.title, quantity }, { href: `/estimates/${estimate.id}`, label: `Open ${estimate.number}` });
    }
    case "update_estimate_line": {
      const lineId = arg(args, "lineId");
      const line = crm.estimateLines.find((item) => item.id === lineId);
      if (!line) return fail("No estimate line with that id.");
      await crm.updateEstimateLine(lineId, {
        quantity: args.quantity !== undefined ? asNumber(args.quantity) : line.quantity,
        unitCost: args.unitCost !== undefined ? asNumber(args.unitCost) : line.unitCost,
        title: arg(args, "title") || line.title,
        optional: asBoolean(args.optional) ?? line.optional,
        selected: asBoolean(args.selected) ?? line.selected,
      });
      return ok({ lineId }, { href: `/estimates/${line.estimateId}`, label: "Open estimate" });
    }
    case "create_invoice": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const invoice = await crm.addInvoice({
        name: arg(args, "name") || job.name,
        clientId: job.clientId,
        jobId: job.id,
        dueAt: null,
        notes: arg(args, "notes"),
      });
      return ok(
        { id: invoice.id, number: invoice.number },
        { href: `/invoices/${invoice.id}`, label: `Open ${invoice.number}` },
      );
    }
    case "convert_estimate_to_invoice": {
      const estimate = resolveEstimate(crm, arg(args, "estimate"));
      if (!estimate) return fail("No estimate matches that.");
      const invoice = await crm.convertEstimateToInvoice(estimate.id);
      return ok(
        { id: invoice.id, number: invoice.number },
        { href: `/invoices/${invoice.id}`, label: `Open ${invoice.number}` },
      );
    }
    case "log_expense": {
      let vendor = arg(args, "vendor");
      let amount = asNumber(args.amount);
      const job = arg(args, "job") ? resolveJob(crm, arg(args, "job")) : undefined;
      let account: ExpenseAccount = isExpenseAccount(arg(args, "account"))
        ? (arg(args, "account") as ExpenseAccount)
        : guessExpenseAccount(vendor, arg(args, "memo"));
      let method: ExpenseMethod = isExpenseMethod(arg(args, "method")) ? (arg(args, "method") as ExpenseMethod) : "credit_card";
      let date = arg(args, "date") || localYmd(new Date());
      let memo = arg(args, "memo");
      let file: File | undefined;
      let extractedByAi = false;
      if (extras.attachment) {
        const parsed = fileFromDataUrl(extras.attachment.dataUrl, extras.attachment.name || "receipt");
        if (parsed) {
          const read = await extractReceipt("expense", parsed);
          file = read.file;
          if (read.extracted) {
            extractedByAi = true;
            if (read.extracted.vendor) vendor = read.extracted.vendor;
            if (read.extracted.amount) amount = asNumber(read.extracted.amount);
            if (read.extracted.account && isExpenseAccount(read.extracted.account)) account = read.extracted.account;
            if (read.extracted.method && isExpenseMethod(read.extracted.method)) method = read.extracted.method;
            if (!arg(args, "date") && read.extracted.date) date = read.extracted.date;
            if (!memo && read.extracted.memo) memo = read.extracted.memo;
          }
        }
      }
      if (!vendor || !amount) return fail("Vendor and amount are required (or attach a receipt photo).");
      if (!file) return fail("Attach a receipt photo in the chat, then ask again.");
      const accountValue: ExpenseAccount = EXPENSE_ACCOUNTS.includes(account) ? account : "other";
      if (expenseRequiresJob(accountValue) && !job) {
        return fail("Name the job. Job costs post onto Customer:Job in QuickBooks, not company overhead.");
      }
      const expense = await crm.addExpense({
        jobId: job?.id ?? null,
        vendor,
        account: accountValue,
        amount,
        incurredAt: date,
        method,
        memo,
        file,
        extractedByAi,
      });
      if (!expense) return fail("Could not save the expense.");
      return ok(
        { id: expense.id, number: expense.number, vendor, amount },
        job ? { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` } : { href: "/accounting", label: "Open accounting" },
      );
    }
    case "log_payment": {
      const amount = asNumber(args.amount);
      if (!amount) return fail("Amount is required.");
      const invoice = arg(args, "invoice") ? resolveInvoice(crm, arg(args, "invoice")) : undefined;
      const job = arg(args, "job") ? resolveJob(crm, arg(args, "job")) : invoice?.jobId ? crm.getJob(invoice.jobId) : undefined;
      let method = arg(args, "method") || "check";
      let date = arg(args, "date") || localYmd(new Date());
      let reference = arg(args, "reference");
      let file: File | undefined;
      if (extras.attachment) {
        const parsed = fileFromDataUrl(extras.attachment.dataUrl, extras.attachment.name || "payment");
        if (parsed) {
          const read = await extractReceipt("payment", parsed);
          file = read.file;
          if (read.extracted) {
            if (!arg(args, "method") && read.extracted.method) method = read.extracted.method;
            if (!arg(args, "date") && read.extracted.date) date = read.extracted.date;
            if (!reference && read.extracted.reference) reference = read.extracted.reference;
          }
        }
      }
      await crm.recordPayment({
        invoiceId: invoice?.id ?? null,
        jobId: job?.id ?? invoice?.jobId ?? null,
        amount,
        method,
        paidAt: date,
        reference,
        file,
      });
      return ok(
        { amount, invoiceId: invoice?.id, jobId: job?.id },
        invoice
          ? { href: `/invoices/${invoice.id}`, label: `Open ${invoice.number}` }
          : job
            ? { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` }
            : undefined,
      );
    }
    case "add_job_photo": {
      if (!extras.attachment) return fail("Attach a photo in the chat, then ask again.");
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const file = fileFromDataUrl(extras.attachment.dataUrl, extras.attachment.name || "job-photo");
      if (!file) return fail("Could not read the attached photo.");
      const categoryRaw = arg(args, "category");
      const category: PhotoCategory = isPhotoCategory(categoryRaw) ? categoryRaw : "progress";
      await crm.addJobPhoto({
        jobId: job.id,
        caption: arg(args, "caption") || extras.attachment.name || "Field photo",
        category,
        takenAt: new Date().toISOString(),
        file,
      });
      return ok({ jobId: job.id }, { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` });
    }
    case "schedule_event": {
      const title = arg(args, "title");
      const startsAt = parseLocalDateTime(arg(args, "startsAt"));
      if (!title || !startsAt) return fail("Title and start time are required.");
      const endsAt = parseLocalDateTime(arg(args, "endsAt")) || new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString();
      const job = arg(args, "job") ? resolveJob(crm, arg(args, "job")) : undefined;
      const kindRaw = arg(args, "kind");
      const kind: EventKind = isEventKind(kindRaw) ? kindRaw : "site_walk";
      const event = await crm.addScheduleEvent({
        title,
        kind,
        startsAt,
        endsAt,
        location: arg(args, "location") || job?.location || "",
        assignee: crm.effectiveStaff?.name || crm.user.name,
        opportunityId: job?.opportunityId ?? null,
        jobId: job?.id ?? null,
        clientId: job?.clientId ?? null,
        notes: arg(args, "notes"),
      });
      return ok({ id: event.id, title: event.title }, { href: "/calendar", label: "Open calendar" });
    }
    case "add_activity": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const body = arg(args, "body");
      if (!body) return fail("The note is empty.");
      await crm.addActivity({ entityType: "job", entityId: job.id, type: "note", body });
      return ok({ jobId: job.id }, { href: `/jobs?job=${job.id}`, label: `Open ${job.code || job.name}` });
    }
    case "send_estimate": {
      const estimate = resolveEstimate(crm, arg(args, "estimate"));
      if (!estimate) return fail("No estimate matches that.");
      await crm.sendEstimate(estimate.id);
      const token = await crm.ensureEstimateShareToken(estimate.id);
      return ok(
        { id: estimate.id, number: estimate.number, share: `/share/e/${token}` },
        { href: `/estimates/${estimate.id}`, label: `Open ${estimate.number}` },
      );
    }
    case "send_invoice": {
      const invoice = resolveInvoice(crm, arg(args, "invoice"));
      if (!invoice) return fail("No invoice matches that.");
      await crm.sendInvoice(invoice.id);
      const token = await crm.ensureInvoiceShareToken(invoice.id);
      return ok(
        { id: invoice.id, number: invoice.number, share: `/share/i/${token}` },
        { href: `/invoices/${invoice.id}`, label: `Open ${invoice.number}` },
      );
    }
    case "void_invoice": {
      const invoice = resolveInvoice(crm, arg(args, "invoice"));
      if (!invoice) return fail("No invoice matches that.");
      await crm.voidInvoice(invoice.id);
      return ok({ id: invoice.id, number: invoice.number }, { href: `/invoices/${invoice.id}`, label: `Open ${invoice.number}` });
    }
    case "accept_estimate": {
      const estimate = resolveEstimate(crm, arg(args, "estimate"));
      if (!estimate) return fail("No estimate matches that.");
      await crm.acceptEstimate(estimate.id);
      return ok({ id: estimate.id, number: estimate.number }, { href: `/estimates/${estimate.id}`, label: `Open ${estimate.number}` });
    }
    case "delete_job": {
      const job = resolveJob(crm, arg(args, "job"));
      if (!job) return fail("No job matches that.");
      const reason = arg(args, "reason");
      if (!reason) return fail("A delete reason is required.");
      const deleted = await crm.deleteJob(job.id, reason);
      if (!deleted) return fail("Could not delete that job.");
      return ok({ id: job.id, code: job.code }, { href: "/jobs", label: "Open jobs" });
    }
    default:
      return fail(`Unknown tool ${call.name}.`);
  }
}

export async function executeToolCall(crm: Crm, call: AssistantToolCall, extras: ExecuteExtras = {}) {
  try {
    return await runTool(crm, call, extras);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "That did not save.");
  }
}

export function toolMessage(call: AssistantToolCall, result: AssistantToolResult) {
  return {
    role: "tool" as const,
    toolCallId: call.id,
    name: call.name,
    content: JSON.stringify(result),
  };
}
