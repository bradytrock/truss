# Truss

A contractor operating system for general contractors: pipeline, estimates, jobs, invoices, schedule, and job photos. Auth, Postgres, Row Level Security, Realtime, and Storage all run on Supabase.

The Northline Construction sample book is Denver work — the same loop Roofr and JobNimbus cover, without satellite takeoffs or payment processing.

## Connect Supabase

The hosted MCP at `https://mcp.supabase.com/mcp` is online. This cloud agent cannot complete the OAuth click-through — authenticate Supabase under **Cursor Settings → MCP** in the desktop app if you want the agent to create projects for you.

To attach a project that is already running:

1. Open [http://localhost:3847/login](http://localhost:3847/login) and paste the project URL plus the **publishable** (or anon) key from Settings → API. Truss checks that the project is reachable, then stores the keys for this browser and writes `.env.local`.
2. In the SQL editor, run both migrations, in order:
   - [`supabase/migrations/20260819170000_truss_crm.sql`](supabase/migrations/20260819170000_truss_crm.sql) — companies, profiles, pipeline, jobs, RLS, signup trigger, Realtime
   - [`supabase/migrations/20260819180000_estimates_invoices_schedule.sql`](supabase/migrations/20260819180000_estimates_invoices_schedule.sql) — price book, estimates, invoices, payments, schedule, job photos, Storage bucket
3. In Authentication → URL configuration, add `http://localhost:3847/auth/callback`. For local work you can turn off “Confirm email”.
4. Create an account. Signup opens a company, a profile, and the Northline sample book in Postgres.

You can still put the same values in `.env.local` by hand:

```bash
cp .env.example .env.local
npm install
npm run dev
```

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
