# Truss

A high-level CRM for general contractors. Auth, Postgres, Row Level Security, and Realtime all run on Supabase.

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/migrations/20260819170000_truss_crm.sql`](supabase/migrations/20260819170000_truss_crm.sql). That creates the schema, company-scoped RLS, the signup trigger, and Realtime publication.
3. Copy `.env.example` to `.env.local` and fill in the project URL plus the **publishable** key (or the legacy anon key).
4. In Authentication → URL configuration, add `http://localhost:3847/auth/callback` to the redirect allow list. For local work you can turn off “Confirm email”.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847). Create an account — Truss opens a company, a profile, and the Northline sample book in your project.

## What lives in Supabase

- **Auth** — email/password; each signup creates a `companies` row and a `profiles` row
- **Postgres** — clients, contacts, pursuits, jobs, activity, tasks, team members
- **RLS** — every query is limited to `current_company_id()`
- **Realtime** — the board and records refresh when anyone in the company writes

Reset demo data (avatar menu) wipes that company’s CRM tables and reloads the sample book. It does not delete the Auth user.
