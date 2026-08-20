# Truss

A contractor operating system for restoration and home improvement: pipeline, estimates, jobs, invoices, calendar, training, and job photos. Auth, Postgres, Row Level Security, Realtime, and Storage all run on Supabase.

Northline Construction’s sample book is Denver residential work — hail roofs, water and fire restoration, kitchens, windows — plus a thin commercial leftover. Homeowners do not need a company on file.

The source of truth is [github.com/bradytrock/truss](https://github.com/bradytrock/truss).

```bash
git clone https://github.com/bradytrock/truss.git
cd truss
npm install
npm run dev
```

The app listens on port 3847. The unsigned demo loads Northline’s sample book in the browser. Sign in after you attach a Supabase project.

Production (`npm run build`) uses webpack instead of Turbopack. Restricted hosts that block extra localhost ports otherwise panic while compiling `globals.css`. Honors `PORT` on `npm start`.

## Connect Supabase

The hosted MCP at `https://mcp.supabase.com/mcp` is online. This cloud agent cannot complete the OAuth click-through — authenticate Supabase under **Cursor Settings → MCP** in the desktop app if you want the agent to create projects for you.

To attach a project that is already running:

1. Open [http://localhost:3847/login](http://localhost:3847/login) and paste the project URL plus the **publishable** (or anon) key from Settings → API. Truss checks that the project is reachable, then stores the keys for this browser and writes `.env.local`.
2. In the SQL editor, run the migrations, in order:
   - [`supabase/migrations/20260819170000_truss_crm.sql`](supabase/migrations/20260819170000_truss_crm.sql) — companies, profiles, pipeline, jobs, RLS, signup trigger, Realtime
   - [`supabase/migrations/20260819180000_estimates_invoices_schedule.sql`](supabase/migrations/20260819180000_estimates_invoices_schedule.sql) — price book, estimates, invoices, payments, schedule, job photos, Storage bucket
   - [`supabase/migrations/20260819190000_seats_contacts.sql`](supabase/migrations/20260819190000_seats_contacts.sql) — seats, teams, contact-book ownership, referral partners
   - [`supabase/migrations/20260819200000_residential_homeowners.sql`](supabase/migrations/20260819200000_residential_homeowners.sql) — optional company on contacts/jobs, residential types, insurance / T&M delivery
   - [`supabase/migrations/20260819210000_company_settings.sql`](supabase/migrations/20260819210000_company_settings.sql) — business name, phone, email, address, and license on `companies`
   - [`supabase/migrations/20260819220000_job_codes.sql`](supabase/migrations/20260819220000_job_codes.sql) — job / pipeline codes (`BJ081926-A`)
   - [`supabase/migrations/20260819230000_google_calendars.sql`](supabase/migrations/20260819230000_google_calendars.sql) — per-user Google Calendar links, team sharing, admin visibility
   - [`supabase/migrations/20260819240000_training.sql`](supabase/migrations/20260819240000_training.sql) — per-seat training progress, badges, attempts, and company training bulletins
   - [`supabase/migrations/20260819250000_lead_intake.sql`](supabase/migrations/20260819250000_lead_intake.sql) — lead source, referred-by contact, job-site address, and notes on pursuits
   - [`supabase/migrations/20260819260000_profile_staff.sql`](supabase/migrations/20260819260000_profile_staff.sql) — each signed-in profile gets its own seat so login does not land on the sample company admin
   - [`supabase/migrations/20260819270000_job_overview.sql`](supabase/migrations/20260819270000_job_overview.sql) — job-site address, crew, tags, related contacts, and custom fields on the job record
   - [`supabase/migrations/20260819280000_nullable_company.sql`](supabase/migrations/20260819280000_nullable_company.sql) — homeowners and trades do not need a company (`contacts.client_id` can be null)
   - [`supabase/migrations/20260819290000_estimate_writer.sql`](supabase/migrations/20260819290000_estimate_writer.sql) — tax, discount, deposit, terms, job-site address, sections, and optional lines on estimates
   - [`supabase/migrations/20260819300000_share_tokens.sql`](supabase/migrations/20260819300000_share_tokens.sql) — client share tokens on estimates and invoices, plus public lookup RPCs
   - [`supabase/migrations/20260819310000_ensure_residential_enums.sql`](supabase/migrations/20260819310000_ensure_residential_enums.sql) — `fixed_price`, insurance, and residential project types on the Postgres enums (safe to re-run)
   - [`supabase/migrations/20260819320000_sign_shared_estimate.sql`](supabase/migrations/20260819320000_sign_shared_estimate.sql) — homeowner can sign a shared estimate, which awards the lead and opens a job
   - [`supabase/migrations/20260819340000_project_financials.sql`](supabase/migrations/20260819340000_project_financials.sql) — Accounting seat, expenses with required receipts, payment images, QuickBooks entry queue
   - [`supabase/migrations/20260820120000_opportunity_originator.sql`](supabase/migrations/20260820120000_opportunity_originator.sql) — who sourced the lead (`originator_staff_id`) stays when it is assigned
3. In Authentication → URL configuration, add `http://localhost:3847/auth/callback`. For local work you can turn off “Confirm email”.
4. Create an account. Signup opens a company, a profile, a seat for you, and the Northline sample book in Postgres. The sample roster stays available under **Login As**; the app does not treat you as Jordan Hale.

You can still put the same values in `.env.local` by hand:

```bash
cp .env.example .env.local
npm install
npm run dev
```

To connect real Google Calendars, create an OAuth web client in Google Cloud (Calendar API + `.../auth/calendar.events.readonly`). Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, and add `http://localhost:3847/api/google/calendar/callback` as an authorized redirect URI. Without those keys, each seat can still **Link demo Google Calendar** so sharing and admin visibility can be tried locally.

## What you can do

- **Settings** — company name, main phone, office email, website, license, and office address. Only a company admin sees this, under the initials menu in the top right. The same block prints on estimates and invoices.
- **Contacts** — homeowners first (no company required), plus adjusters, realtors, and one architect as referral partners
- **Pipeline** — leads through Job Sold and lost. Every new lead (and every new estimate) opens a job for costing so expenses and P&L treat it like production work. When the homeowner signs, the card moves to Job Sold. Each card shows a job code (`BJ081926-A`) assigned when the lead is opened. **New lead** slides in from the right: assignee, homeowner name, phone, email, job-site address, and how they heard about you. If the source is Referral, search contacts this seat can see and connect the referrer. Business development keeps credit (`Sourced by`) when they assign the lead to a PM or estimator.
- **Business development** — sample seats Priya Shah and Claire Duvall. Their nav is pipeline, jobs from the agents they brought in, contacts, and ROI. They see company BD return (cash on sourced jobs ÷ office spend they logged) as well as their own numbers. Switch seat in the unsigned demo to try it.
- **Jobs** — a status board of every cost center, including open pipeline leads in Preconstruction. Open a job for the field record: site photo, address, crew, tags, related contacts, and custom fields (claim number, deductible). Codes are assigned when the lead is opened. If Postgres has not added `jobs.primary_contact_id` yet, Truss still opens the job and asks you to run `20260819200000_residential_homeowners.sql`.
- **Estimates** — Joist-style writer: sections, optional lines, tax, discount, deposit, terms, and a client preview. Download a PDF, send a copyable client link, mark it signed (Job Sold — the job was already open for costing), convert included lines to an invoice. EST-1001–1010 against homeowners.
- **Calendar & photos** — Google Calendar per seat, team sharing, site walks, shingle days, punch, and job photos
- **Price book** — roofing squares, extraction, cabinets, and the usual trades
- **Estimates** — write a proposal from the price book (sections, optional work, tax), download a PDF, send a client link. Signing moves the lead to Job Sold; costing already lived on that job. Convert included lines to an invoice.
- **Jobs** — field record (overview, photos, estimates/invoices, custom fields), activity, and job photos (upload or URL). Open pipeline work sits in Preconstruction.
- **Invoices** — draws and retainage with payment history, outstanding AR, PDF, and a client share link
- **Accounting** — company admin and the Accounting seat (sample: Nora Keene, Controller) get a company Profit and Loss in QuickBooks form, plus invoices, expenses, and payments that still need to be typed into QuickBooks Desktop. Mark a row after you enter it. The Desktop web connector comes later.
- **Log expense / Log payment** — Create (+) in the top right. A photo is required every time, whether or not AI reads the receipt. Images stay on the record. Optional `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` fills vendor, amount, date, and account from the photo.
- **Job financials** — QuickBooks-style Profit and Loss on the job (Income, Cost of Sales, Gross Profit, Expenses, Net Income). Accrual or cash. Receipt thumbnails stay under the statement.
- **Calendar** — week view of Truss field events plus each person’s Google Calendar. Link is per seat. Share with your team; company admins see every calendar and whether it is linked.
- **Training** — roofing certification course (companion to *Roofing Construction & Estimating, Revised* by Daniel Atcheson). Original lesson summaries, generated takeoff questions, 70% chapter/practice, 80% exam. Progress is per seat. Team leads and company admin see crew progress and can post training bulletins. Open jobs recommend chapters by project type.

The Northline sample book loads locally with no sign-in. Avatar menu → **Reset demo data** restores it in memory, or (after migrations and a signed-in company) wipes that company’s CRM tables and reloads this book. Your signed-in seat is put back on the roster. It does not delete the Auth user. **Switch seat** is only for the unsigned sample; when you are signed in, use **Login As** to look at someone else’s book.

## What lives in Supabase

- **Auth** — email/password; each signup creates a `companies` row, a `profiles` row, and a `team_members` seat linked by `profiles.staff_id`
- **Postgres** — contacts, homeowners, pursuits, jobs, catalog, estimates, invoices, payments, expenses, schedule, calendar accounts, photos, teams, seats, training progress, training bulletins
- **RLS** — every query is limited to `current_company_id()`
- **Realtime** — the board and records refresh when anyone in the company writes
- **Storage** — `job-photos` bucket (`{companyId}/{jobId}/{uuid}`) and `receipts` bucket (`{companyId}/expenses|payments/{uuid}`)
- **Google Calendar** — refresh tokens stay in `calendar_tokens` (RPC only). Metadata and shares are company-visible; company admins can read every linked calendar.

Reset demo data (avatar menu) wipes that company’s CRM tables and reloads the sample book. Your login stays on the roster. It does not delete the Auth user.

Truss does not measure roofs from satellite imagery, collect card payments, or send SMS. Those are the pieces left to the tools you already use for takeoff and banking.

The estimate writer is specified for the iOS app in [`docs/ios-estimate-writer-prompt.md`](docs/ios-estimate-writer-prompt.md) — data model, totals formula, status machine, and screens.
