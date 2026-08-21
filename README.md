# Truss

A contractor operating system for restoration and home improvement: jobs, estimates, invoices, calendar, training, and job photos. Auth, Postgres, Row Level Security, Realtime, and Storage all run on Supabase.

Northline Construction’s sample book is Denver residential work — hail roofs, water and fire restoration, kitchens, windows — plus a thin commercial leftover. Homeowners do not need a company on file.

The source of truth is [github.com/bradytrock/truss](https://github.com/bradytrock/truss).

```bash
git clone https://github.com/bradytrock/truss.git
cd truss
npm install
npm run dev
```

The app listens on port 3847. Everyone signs in with their own account. After you attach a Supabase project, create an account or use an existing one. Truss does not add sample people you can log in as.

Production (`npm run build`) uses webpack instead of Turbopack. Restricted hosts that block extra localhost ports otherwise panic while compiling `globals.css`. Honors `PORT` on `npm start`.

## Connect Supabase

Truss ships pointed at one shared project (`cxrgdjvkmvnuztubxldh`). Signup still creates a **company per account**; people on the same company share that book. You do not paste keys to sign in. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` override the baked-in project if you need a private instance.

The hosted MCP at `https://mcp.supabase.com/mcp` is online. This cloud agent cannot complete the OAuth click-through — authenticate Supabase under **Cursor Settings → MCP** in the desktop app if you want the agent to create projects for you.

On that shared project, paste and run one file in the SQL editor:

- [`supabase/bootstrap.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/bootstrap.sql) — every migration, in order, safe to re-run

Use the **Raw** link so the editor does not pick up a collapsed GitHub page. The numbered files under `supabase/migrations/` are the same SQL split up, if you ever need them one at a time.

If invite signup fails with **Database error saving new user**, you do not need to re-paste the whole bootstrap. Open the **Raw** file [`20260821010000_invite_signup.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821010000_invite_signup.sql), paste it in the SQL editor, and run it until the editor says **Success**. Then sign up again with the **same email the invite was sent to**. Hard-refresh the Raw page if you still see the old copy.

Photo reports need [`20260821140000_photo_reports.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821140000_photo_reports.sql) (or a fresh bootstrap) so Pages persist in Postgres. The builder still works in the browser until that runs.

Residential vs commercial on leads and jobs needs [`20260821160000_job_market.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821160000_job_market.sql) and [`20260821170000_residential_share_tax.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821170000_residential_share_tax.sql) (or a fresh bootstrap) so the choice persists and residential share links stay untaxed. Until those run, Truss still applies residential (no tax) vs commercial (taxed) in the browser.

A company logo on estimates, invoices, and Pages needs [`20260821180000_company_logo.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821180000_company_logo.sql) (or a fresh bootstrap). Until that runs, you can still upload a logo in this browser.

Company estimate templates need [`20260821190000_estimate_templates.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821190000_estimate_templates.sql) (or a fresh bootstrap) so they persist in Postgres. Until that runs, you can still build templates and start estimates from them in this browser.

Client signatures on estimates need [`20260821200000_estimate_signature.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821200000_estimate_signature.sql) (or a fresh bootstrap) so the drawing stays on the proposal and PDF. Until that runs, you can still collect a signature in this browser.

One costing job per lead needs [`20260821210000_one_job_per_lead.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821210000_one_job_per_lead.sql) (or a fresh bootstrap). That collapses duplicate board cards that share a lead and keeps Postgres from inserting a second job for the same opportunity. Until that runs, the Jobs board still shows one card per lead in this browser.

Company admins deleting a job needs [`20260821220000_job_soft_delete.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821220000_job_soft_delete.sql) (or a fresh bootstrap) so the reason and Deleted column persist. Until that runs, delete and restore still work in this browser.

Who took a job photo needs [`20260821230000_job_photo_created_by.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821230000_job_photo_created_by.sql) (or a fresh bootstrap) so the company Photos feed can show a name on each thumbnail. Until that runs, new photos still save and the feed still lists every shot.

Pages (job documents you send out) need [`20260821240000_page_share_tokens.sql`](https://raw.githubusercontent.com/bradytrock/truss/main/supabase/migrations/20260821240000_page_share_tokens.sql) (or a fresh bootstrap) so a client share link stays on the Page. Until that runs, you can still build Pages and download a PDF in this browser.

In Authentication → URL configuration, add `http://localhost:3847/auth/callback` (and the hosted app origin). For local work you can turn off “Confirm email”. Signup opens a company, a profile, and a seat for you. It does not add sample people. Add real teammates from Settings → People.

`.env.local` is optional. Copy `.env.example` only if you want to override the shared project.

To connect real Google Calendars, create an OAuth web client in Google Cloud (Calendar API + `.../auth/calendar.events.readonly`). Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, and add `http://localhost:3847/api/google/calendar/callback` as an authorized redirect URI. Without those keys, each seat can still **Link demo Google Calendar** so sharing and admin visibility can be tried locally.

## What you can do

- **Settings** — company name, logo, main phone, office email, website, license, and office address, plus **People**: add a roster seat, copy a 14-day signup invite into this company, restrict someone to their own book, lock a login, or remove them. Only a company admin sees this, under the initials menu in the top right. The logo and business block print on estimates, invoices, Pages, and client share links. Invites are not emailed from Truss — copy the link. A locked account is signed out on the next load. Restrict keeps the role but forces access to that person’s jobs only. You cannot lock, restrict, or remove the last unlocked company admin.
- **Ask Truss** — header control (⌘.) opens a chat that searches this seat’s book and does the work: new leads, contacts, job moves, estimates from the price book, invoices, expenses and payments (attach a receipt photo), job photos, calendar events, and notes. Sending an estimate or invoice, recording a payment without a photo, voiding, accepting, or deleting a job asks you to confirm first. Same OpenAI / Anthropic keys as receipt scanning; without a key the panel explains that and does not write records.
- **Contacts** — homeowners first (no company required), plus adjusters, realtors, and one architect as referral partners. Selecting a person opens an Outlook-style inspector over the list (details, pursuits, and jobs) without leaving the book. **Edit contact** from that window: name, title, phone, email, company, book owner, and referral flag.
- **Jobs** — one board from new lead through punch (Lead, Estimating, Proposal sent, In progress, Punch list, Complete, On hold, Lost). Company admins also see **Deleted**: the trash can on the job record requires a reason, writes it to the activity history, and parks the card there so it can be restored. `/pipeline` redirects here. Every new lead opens one costing job; the card keeps that job code (`BJ081926-A`) from day one. Drag a card when the work moves. Selecting a card opens the field record (site photo, address, crew, tags, related contacts, custom fields). **Pages** on the job record are branded documents you send out (photo documentation, inspection, completion, claim, or blank). Each Page has a cover, photo sheets you caption on the letter, and letterhead pages (blank, introduction, next steps, and the rest). Share a client link or download a PDF. The PDF cover is a full-page hero using the cover photo you assign, with company letterhead, job site, optional date of loss and claim number, and who prepared it. **New lead** slides in so you can pick who owns it, then capture **Residential or commercial** (residential proposals are not taxed; commercial includes sales tax), the homeowner, job site, and **Seed** (Podium, Website, Google Ad, Phone, Angie's List, Realtor, Referral, Sales Team, Text Main Line, Past Client, ChatGPT, Social Media). Business development sees every unlocked seat on that list, on each card, and on the record — assigning hands the owner, costing job, and homeowner over; sourced-by stays with BD. When a homeowner signs an estimate, the card’s dollar amount updates to the signed total and the work moves to In progress.
- **Business development** — nav is jobs from the agents they brought in, contacts, and ROI. They see company BD return (cash on sourced jobs ÷ office spend they logged) as well as their own numbers. Assigning a lead (new, job card, or open record) hands the owner, the costing job, and the homeowner to that person; sourced-by stays with BD.
- **Estimates** — Joist-style writer: sections, optional lines, tax, discount, deposit, terms, and a client preview. **New estimate** attaches to a homeowner and can start from a **company template** (or a blank page). Build templates under Estimates → Templates, or save any proposal as a template. Residential work is not taxed; commercial uses the tax rate on the proposal. Download a PDF, send a copyable client link for signature, collect a drawn signature in the office or on that link (it is stored on the estimate and prints on the PDF), mark it signed (the job card value becomes the signed total), convert included lines to an invoice.
- **Photos** — company feed of every job photo, grouped by day, with filters for date, job, who took it, and tag (before / progress / after / issue). Click a thumbnail for a larger view. **Open job** is only there if that job is already in your seat; everyone can still see the pictures. Add photos from a job record as before.
- **Price book** — roofing squares, extraction, cabinets, and the usual trades
- **Estimates** — write a proposal from a company template or the price book (sections, optional work, tax), download a PDF, send a client link for signature. The homeowner’s drawing is stored on the estimate and prints on the PDF. Signing writes the signed total onto the job card and moves the work to In progress. Convert included lines to an invoice.
- **Jobs** — field record (overview, photos, Pages, estimates/invoices, custom fields), activity, and job photos (upload or URL). The same Jobs board holds the lead from the first call through punch.
- **Invoices** — draws and retainage with payment history, outstanding AR, PDF, and a client share link
- **Accounting** — company admin and the Accounting seat get a company Profit and Loss in QuickBooks form, plus invoices, expenses, and payments that still need to be typed into QuickBooks Desktop. Mark a row after you enter it. The Desktop web connector comes later.
- **Log expense / Log payment** — Create (+) in the top right, or Ask Truss with a photo attached. A photo is required every time, whether or not AI reads the receipt. Images stay on the record. Optional `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` fills vendor, amount, date, and account from the photo.
- **Job financials** — QuickBooks-style Profit and Loss on the job (Income, Cost of Sales, Gross Profit, Expenses, Net Income). Accrual or cash. Receipt thumbnails stay under the statement.
- **Calendar** — week view of Truss field events plus each person’s Google Calendar. Link is per seat. Share with your team; company admins see every calendar and whether it is linked.
- **Training** — roofing certification course (companion to *Roofing Construction & Estimating, Revised* by Daniel Atcheson). Original lesson summaries, generated takeoff questions, 70% chapter/practice, 80% exam. Progress is per seat. Team leads and company admin see crew progress and can post training bulletins. Open jobs recommend chapters by project type.

Signup creates your seat only — no sample roster. Existing companies drop Northline demo seats (Jordan Hale, Priya Shah, and the rest) on load and reassign their jobs and contacts to you. Avatar menu → **Reset company data** wipes CRM tables and leaves your login as the only seat. **Login As** is only for real teammates you add. Add more people from Settings → People (`/signup?invite=…` joins the company that sent the link).

## What lives in Supabase

- **Auth** — email/password; each signup creates a `companies` row, a `profiles` row, and a `team_members` seat linked by `profiles.staff_id`
- **Postgres** — contacts, homeowners, pursuits, jobs, catalog, estimates, estimate templates, invoices, payments, expenses, schedule, calendar accounts, photos, pages, teams, seats, account invites, training progress, training bulletins
- **RLS** — every query is limited to `current_company_id()`
- **Realtime** — the board and records refresh when anyone in the company writes
- **Storage** — `job-photos` bucket (`{companyId}/{jobId}/{uuid}`), `receipts` bucket (`{companyId}/expenses|payments/{uuid}`), and `company-assets` bucket (`{companyId}/logo/{uuid}`) for the letterhead logo
- **Google Calendar** — refresh tokens stay in `calendar_tokens` (RPC only). Metadata and shares are company-visible; company admins can read every linked calendar.

**Reset company data** (avatar menu) wipes that company’s CRM tables and leaves your signed-in seat. It does not delete the Auth user.

Truss does not measure roofs from satellite imagery, collect card payments, or send SMS. Those are the pieces left to the tools you already use for takeoff and banking.

The estimate writer is specified for the iOS app in [`docs/ios-estimate-writer-prompt.md`](docs/ios-estimate-writer-prompt.md) — data model, totals formula, status machine, and screens.
