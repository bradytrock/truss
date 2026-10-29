-- Parent companies.
--
-- A company on file can roll up under a parent brand: "Keller Williams Realty"
-- and "Keller Williams Dallas" both sit under "Keller Williams", every eXp
-- office sits under "eXp Realty", and so on. The parent is itself a row in
-- clients, so it has its own page, and the HubSpot contacts import can create
-- it while mapping Associated Company. Referred leads, pipeline, and jobs from
-- every office then read together on the parent, so ROI can be tracked for
-- the whole business rather than one office at a time.

alter table public.clients
  add column if not exists parent_client_id uuid references public.clients (id) on delete set null;

create index if not exists clients_parent_client_id_idx
  on public.clients (company_id, parent_client_id)
  where parent_client_id is not null;

notify pgrst, 'reload schema';
