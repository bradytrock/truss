# Truss

A high-level CRM for general contractors — HubSpot-shaped, built around how a GC actually sells and runs work.

Northline Construction is the demo company: bid pipeline, jobs in the field, and the owners who award them. Data lives in the browser (`localStorage`) so you can click around without setting up a database.

## What it covers

- **Home** — open pipeline, weighted value, bids due this week, win rate, and work in the field
- **Pipeline** — drag pursuits through Pursuing → Estimating → Bid submitted → Interview/VE → Awarded / Lost. Awarding a bid opens a job.
- **Jobs** — precon through punch. Status, PM, contract value — not daily reports or RFIs
- **Clients** — owners, developers, public agencies, and the architects who put you on the list
- **Records** — next step, activity log, contacts, and the link from pursuit to job

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3847](http://localhost:3847). Use **Create** for a new pursuit, client, or job. **Reset demo data** in the avatar menu restores the Northline book of work.

Search with `⌘K` / `Ctrl+K`.
