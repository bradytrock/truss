# iOS prompt — TheRoofingCRM estimate writer

Copy everything below the line into the assistant that is writing the iOS app for TheRoofingCRM. It is the source of truth for estimate writing. Do not invent Joist features that are not listed here.

---

You are implementing the **estimate writing** surface of **TheRoofingCRM**, a contractor OS for residential restoration and home improvement (DTC homeowners, demo company Northline Construction in Denver). Match the web app’s data model, totals formula, status machine, and copy. Do not build a second product.

## Product context

TheRoofingCRM already has contacts (homeowners first; no company required), pipeline, jobs, a CSI-style price book, invoices, calendar, and training. Estimates sit between a lead/job and an invoice.

The web writer is a Joist-style office/field tool: you write a proposal in sections, mark some lines optional, set tax / discount / deposit / terms, preview what the homeowner sees, send it, mark it accepted, and convert included lines to an invoice.

**Do not build:** card payments, satellite takeoff / roof measurement, SMS, e-sign vendors, public client magic links, or a second catalog. Deposit is informational (amount due after accept), not a charge. Convert-to-invoice copies line items; it does not collect money.

The unsigned web demo hydrates from in-memory Northline seed and mutates locally. When Supabase is configured and the user is signed in, the same mutations persist. iOS should do the same: a local book that works offline-first for demo, and the same Postgres tables when the app is attached to a company.

## Status machine

`draft` → **Send proposal** → `sent` → (optional) `viewed` → **Mark accepted** → `accepted` **or** **Decline** → `declined`.

- `draft` — full edit (name, client, job site, lines, tax, discount, deposit, intro, terms, notes).
- `sent` / `viewed` — lock prices and structure. Homeowner (and office) may still toggle **optional line selected**. Office may accept or decline.
- `accepted` — read-only except convert to invoice. Optional selection is frozen.
- `declined` — read-only.

**Convert to invoice** is allowed from `sent`, `viewed`, or `accepted` if no invoice already points at this estimate. Do not convert a draft. Do not convert if there are zero included lines. Conversion does **not** change estimate status.

Duplicate always creates a new `draft` with a new `EST-####` number, copied lines, copied tax/discount/deposit/terms/site, `sentAt`/`acceptedAt` cleared, and name suffixed ` (copy)` if it does not already end that way.

## Totals formula (must match web, to the cent)

All money is rounded to 2 decimals after every step (`Math.round(value * 100) / 100`).

A line amount is `quantity * unitCost`.

A line is **included** if `!optional || selected`. Optional + not selected is **out of the total** but still shown on the document.

```
included = lines where !optional || selected
subtotal = sum of included line amounts
discount = discountKind == "percent"
  ? subtotal * discountValue / 100
  : min(subtotal, discountValue)
afterDiscount = max(0, subtotal - discount)
taxableSubtotal = sum of included lines where taxable
taxableShare = subtotal > 0 ? taxableSubtotal / subtotal : 0
taxableAfterDiscount = max(0, taxableSubtotal - discount * taxableShare)
tax = taxableAfterDiscount * taxRate / 100
total = afterDiscount + tax
deposit = depositKind == "percent"
  ? total * depositValue / 100
  : min(total, depositValue)
```

Discount is allocated across taxable vs non-taxable in proportion to the included taxable share. Insurance jobs in the demo (Pell, Alvarez, Hart) use `taxRate: 0`. Ellison kitchen uses Denver `8.31`.

Deposit is **not** subtracted from total and is **not** an invoice line. Show it as “Deposit due”.

Unselected optional work should be summarized (“$X in optional work is not in this total”) but must not change `total`.

## Data model

### Estimate

| Field | Type | Notes |
|---|---|---|
| id | uuid/string | |
| number | string | `EST-1001` style via max+1 of existing numbers |
| name | string | Homeowner-facing title |
| clientId | string? | Company; null for homeowners |
| opportunityId | string? | Lead |
| jobId | string? | Sold job |
| contactId | string? | Homeowner / primary person |
| status | draft \| sent \| viewed \| accepted \| declined | |
| notes | string | **Internal only.** Do not put this on the client PDF/preview as body copy unless you label it Internal notes for office. |
| validUntil | date? | |
| sentAt / acceptedAt / createdAt | ISO | |
| taxRate | number | Percent, e.g. 8.31 |
| discountKind | percent \| amount | |
| discountValue | number | |
| depositKind | percent \| amount | |
| depositValue | number | |
| intro | string | Cover note the homeowner reads |
| terms | string | Default: “This proposal is good through the valid-until date. Work starts after you accept and pay any deposit. Changes on site will be written as a change order before we proceed.” |
| street, city, state, postalCode | string | Job site on the proposal (not the office letterhead) |

Postgres: `estimates` plus columns from `supabase/migrations/20260819290000_estimate_writer.sql` (`contact_id`, `tax_rate`, `discount_kind`, `discount_value`, `deposit_kind`, `deposit_value`, `intro`, `terms`, `street`, `city`, `state`, `postal_code`). If those columns are missing, keep working locally and tell the user to run that SQL.

### Estimate line

| Field | Type | Notes |
|---|---|---|
| id | uuid/string | |
| estimateId | string | |
| catalogItemId | string? | Null for custom lines |
| title | string | Short name. If empty, fall back to description. |
| description | string | Detail under the title |
| quantity, unit, unitCost | number / string / number | Amount = qty × unitCost |
| sortOrder | int | Global order on the estimate |
| groupName | string | Section header. Empty → display as “Items” |
| optional | bool | Default false |
| selected | bool | Default true. Only matters when optional. |
| taxable | bool | Default true |

Postgres: `estimate_lines` plus `title`, `group_name`, `optional`, `selected`, `taxable`.

### Catalog (price book)

Existing `catalog_items`: name, kind (`labor` `material` `equipment` `allowance` `subcontract`), unit, unitCost, costCode. Adding from the book copies name → title and description, qty 1, catalog unit/cost, optional false, taxable true, into the current section.

Common units: `LS`, `ea`, `sq`, `sf`, `lf`, `cy`, `hr`, `day`, `mo`.

## Screens (iOS)

Mirror the web, adapted to iPhone/iPad.

1. **Estimates list** — number, name, homeowner (`contactId` then job/lead contact then company), status, valid until, **total from the formula above** (not a raw sum of every line). Filter by status. CTA: New estimate.

2. **New estimate** — name, homeowner/contact (required), optional lead and job. Copy job-site address from the job, else the lead. Default terms. Lands on the writer as `draft`.

3. **Writer (office)** — sticky actions: Send / Accept / Decline / Convert / Duplicate. Identity: number, editable name, status, homeowner, job site.
   - Customer & job site (contact picker, street/city/state/ZIP, links to lead/job).
   - Cover note (`intro`).
   - Line items grouped by `groupName`. Each line is a card: title, description, qty, unit, unit price, amount, Optional, Include in total (when optional), Taxable, up/down reorder, delete.
   - Add from price book (search sheet grouped by kind), custom item, add section (creates a custom line in that group).
   - Tax rate %, discount (% or $), deposit (% or $), valid until.
   - Terms, internal notes.
   - Running total (included count, optional-off count, total).

   Empty draft: “No lines yet. Pull items from the price book or add a lump-sum line. Optional work stays out of the total until you check it.”

4. **Preview (client document)** — company letterhead (name, office address, phone/email, license). Number, name, “Prepared for {homeowner}”, job site, valid until, intro, sections, line amounts, optional badges, totals (subtotal, discount, tax, total, deposit due), terms. Optional lines that are off are visually muted / struck on the amount. On `sent`/`viewed`, optional lines have a checkbox so the homeowner can add them. Internal notes are office-only; do not print them on a customer PDF.

   iPhone: Write | Preview tabs. iPad: writer + preview side by side.

5. **Convert** — invoice gets included lines only (title — description if they differ). If discount > 0, add a negative lump-sum “Discount” line. If tax > 0, add a “Tax (x%)” lump-sum line. Notes: `Converted from EST-####. Optional lines that were not selected were left off.` Deposit is not a line. Then open the invoice.

## Seed examples (Northline)

Use these to QA, not as hardcoded production data:

- **EST-1001 Ellison kitchen** (`est_ellison`) — draft, Marcus Ellison, 8.31% tax, 30% deposit, sections Demo / Cabinets & tops / Electrical. Flagship writer demo.
- **EST-1005 Pell roof** (`est_pell`) — viewed, Drew Pell, tax 0 (insurance), optional **leaf guards** unselected (`el_p4`). Toggling them must change the total.
- **EST-1007 Alvarez hail roof** (`est_alvarez`) — accepted, Dana Alvarez, tax 0, optional **dumpster** selected (`el_a3`). Convert should include the dumpster.

Homeowner names resolve from `contactId`, else the job/lead primary contact, else the company, else “Homeowner”.

## Local vs Supabase

- Not configured / unsigned: mutate local state. Do not crash. Do not toast “connect Supabase” on every keystroke.
- Configured: persist `estimates` / `estimate_lines`. If PostgREST reports missing columns (`PGRST204` / schema cache / `tax_rate` / `group_name`), keep the local write and tell the user to run `supabase/migrations/20260819290000_estimate_writer.sql`.
- RLS is company-scoped (`current_company_id()`). iOS must send the signed-in user’s session.

## Copy and UX

Real contractor language. No lorem. No “Welcome to your app.” Cover empty, loading, and error. Phone and iPad. Letterhead comes from company settings, not the job site. TheRoofingCRM does not measure roofs from satellite imagery, collect card payments, or send SMS.

## Out of scope for this slice

In-app PDF generation is nice; a native preview that matches the web preview is required. Drag-and-drop reorder is optional; up/down is enough. Change orders, progress billing, and invoice tax engines are not this feature.

Implement against this contract. If web and iOS totals disagree on Ellison or Pell, the iOS formula is wrong.
