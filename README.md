# Truss

A contractor operating system for restoration and home improvement: pipeline, estimates, jobs, invoices, calendar, training, and job photos. Auth, Postgres, Row Level Security, Realtime, and Storage all run on Supabase.

Northline Construction’s sample book is Denver residential work — hail roofs, water and fire restoration, kitchens, windows — plus a thin commercial leftover. Homeowners do not need a company on file.

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
3. In Authentication → URL configuration, add `http://localhost:3847/auth/callback`. For local work you can turn off “Confirm email”.
4. Create an account. Signup opens a company, a profile, and the Northline sample book in Postgres.

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
- **Pipeline** — leads through sold and lost: hail, water, fire, kitchens, windows, an addition. Each card shows a job code (`BJ081926-A`) assigned when the lead is opened.
- **Jobs** — a status board of sold work. Codes carry over from the awarded lead; a job logged from scratch gets the next letter for that person’s day.
- **Estimates / invoices** — EST-1001–1010 and INV-2001–2010 against homeowners, with insurance draws and retainage
- **Calendar & photos** — Google Calendar per seat, team sharing, site walks, shingle days, punch, and job photos
- **Price book** — roofing squares, extraction, cabinets, and the usual trades
- **Estimates** — build a proposal from the catalog, send it, mark it accepted, convert it to an invoice
- **Jobs** — field snapshot, activity, related billing, and job photos (upload or URL)
- **Invoices** — draws and retainage with payment history and outstanding AR
- **Calendar** — week view of Truss field events plus each person’s Google Calendar. Link is per seat. Share with your team; company admins see every calendar and whether it is linked.
- **Training** — roofing certification course (companion to *Roofing Construction & Estimating, Revised* by Daniel Atcheson). Original lesson summaries, generated takeoff questions, 70% chapter/practice, 80% exam. Progress is per seat. Team leads and company admin see crew progress and can post training bulletins. Open jobs recommend chapters by project type.

The Northline sample book loads locally with no sign-in. Avatar menu → **Reset demo data** restores it in memory, or (after migrations and a signed-in company) wipes that company’s CRM tables and reloads this book. It does not delete the Auth user.

## What lives in Supabase

- **Auth** — email/password; each signup creates a `companies` row and a `profiles` row
- **Postgres** — contacts, homeowners, pursuits, jobs, catalog, estimates, invoices, payments, schedule, calendar accounts, photos, teams, seats, training progress, training bulletins
- **RLS** — every query is limited to `current_company_id()`
- **Realtime** — the board and records refresh when anyone in the company writes
- **Storage** — `job-photos` bucket, files stored as `{companyId}/{jobId}/{uuid}`
- **Google Calendar** — refresh tokens stay in `calendar_tokens` (RPC only). Metadata and shares are company-visible; company admins can read every linked calendar.

Reset demo data (avatar menu) wipes that company’s CRM tables and reloads the sample book. It does not delete the Auth user.

Truss does not measure roofs from satellite imagery, collect card payments, or send SMS. Those are the pieces left to the tools you already use for takeoff and banking.
