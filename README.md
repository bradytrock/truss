# Truss

A contractor operating system for general contractors: pipeline, estimates, jobs, invoices, schedule, and job photos. Auth, Postgres, Row Level Security, Realtime, and Storage all run on Supabase.

The Northline Construction sample book is Denver work — the same loop Roofr and JobNimbus cover, without satellite takeoffs or payment processing.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run both migrations, in order:
   - [`supabase/migrations/20260819170000_truss_crm.sql`](supabase/migrations/20260819170000_truss_crm.sql) — companies, profiles, pipeline, jobs, RLS, signup trigger, Realtime
   - [`supabase/migrations/20260819180000_estimates_invoices_schedule.sql`](supabase/migrations/20260819180000_estimates_invoices_schedule.sql) — price book, estimates, invoices, payments, schedule, job photos, Storage bucket
3. Copy `.env.example` to `.env.local` and fill in the project URL plus the **publishable** key (or the legacy anon key).
4. In Authentication → URL configuration, add `http://localhost:3847/auth/callback` to the redirect allow list. For local work you can turn off “Confirm email”.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847). Without env keys the Northline sample book loads locally so you can click through estimates, invoices, schedule, and job photos. Create an account after connecting a project — Truss then opens a company, a profile, and the same book in your database.

## What you can do

- **Pipeline** — pursuits from pursuing through award; awarding opens a precon job
- **Price book** — CSI-style labor, material, equipment, allowance, and subcontract items
- **Estimates** — build a proposal from the catalog, send it, mark it accepted, convert it to an invoice
- **Jobs** — field snapshot, activity, related billing, and job photos (upload or URL)
- **Invoices** — draws and retainage with payment history and outstanding AR
- **Schedule** — week view for walks, inspections, production, and owner meetings

## What lives in Supabase

- **Auth** — email/password; each signup creates a `companies` row and a `profiles` row
- **Postgres** — clients, pursuits, jobs, catalog, estimates, invoices, payments, schedule, photos
- **RLS** — every query is limited to `current_company_id()`
- **Realtime** — the board and records refresh when anyone in the company writes
- **Storage** — `job-photos` bucket, files stored as `{companyId}/{jobId}/{uuid}`

Reset demo data (avatar menu) wipes that company’s CRM tables and reloads the sample book. It does not delete the Auth user.

Truss does not measure roofs from satellite imagery, collect card payments, or send SMS. Those are the pieces left to the tools you already use for takeoff and banking.
