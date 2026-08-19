"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { derivedInvoiceStatus, nextNumber } from "@/lib/money";
import { seedState } from "@/lib/seed";
import { fetchCompanyBook } from "@/lib/supabase/load-book";
import { seedOperationsIfMissing } from "@/lib/supabase/ops-seed";
import { seedCompanyBook } from "@/lib/supabase/seed-company";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  jobPatch,
  mapActivity,
  mapClient,
  mapContact,
  mapEstimate,
  mapEstimateLine,
  mapInvoice,
  mapJob,
  mapJobPhoto,
  mapOpportunity,
  mapPayment,
  mapScheduleEvent,
  mapTask,
  opportunityPatch,
} from "@/lib/supabase/mappers";
import {
  STAGE_LABELS,
  STAGE_PROBABILITY,
  type ActivityType,
  type Client,
  type CrmState,
  type CurrentUser,
  type Estimate,
  type EstimateLine,
  type Invoice,
  type Job,
  type Opportunity,
  type PhotoCategory,
  type PipelineStage,
  type ScheduleEvent,
  TEAM,
} from "@/lib/types";

const emptyState: CrmState = {
  clients: [],
  contacts: [],
  opportunities: [],
  jobs: [],
  activities: [],
  tasks: [],
  catalog: [],
  estimates: [],
  estimateLines: [],
  invoices: [],
  invoiceLines: [],
  payments: [],
  events: [],
  photos: [],
};

const guestUser: CurrentUser = {
  id: "",
  companyId: "",
  name: "Guest",
  title: "",
  company: "Truss",
  initials: "TR",
};

const northlineUser: CurrentUser = {
  id: "local",
  companyId: "local",
  name: "Jordan Hale",
  title: "VP, Preconstruction",
  company: "Northline Construction",
  initials: "JH",
};

function requireClient() {
  if (!isSupabaseConfigured()) {
    toast.message("Connect a Supabase project to save. You are browsing the Northline sample book locally.");
    return null;
  }
  return createClient();
}

type CrmContextValue = CrmState & {
  user: CurrentUser;
  teamMembers: string[];
  configured: boolean;
  hydrated: boolean;
  hydrateError: string | null;
  getClient: (id: string) => Client | undefined;
  getContact: (id: string) => CrmState["contacts"][number] | undefined;
  getOpportunity: (id: string) => Opportunity | undefined;
  getJob: (id: string) => Job | undefined;
  getEstimate: (id: string) => Estimate | undefined;
  getInvoice: (id: string) => Invoice | undefined;
  jobForOpportunity: (opportunityId: string) => Job | undefined;
  moveOpportunity: (
    id: string,
    stage: PipelineStage,
    lostReason?: string
  ) => Promise<Job | null>;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => Promise<void>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
  addOpportunity: (
    input: Omit<Opportunity, "id" | "createdAt" | "winProbability">
  ) => Promise<Opportunity>;
  addClient: (
    input: Omit<Client, "id"> & { contactName?: string; contactTitle?: string }
  ) => Promise<Client>;
  addJob: (input: Omit<Job, "id">) => Promise<Job>;
  addActivity: (input: {
    entityType: "opportunity" | "job" | "client";
    entityId: string;
    type: ActivityType;
    body: string;
  }) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addTask: (input: {
    title: string;
    dueAt: string;
    relatedType: "opportunity" | "job" | "client" | null;
    relatedId: string | null;
    assignee: string;
  }) => Promise<void>;
  addEstimate: (input: {
    name: string;
    clientId: string;
    opportunityId: string | null;
    jobId: string | null;
    notes?: string;
    validUntil?: string | null;
  }) => Promise<Estimate>;
  updateEstimate: (id: string, patch: Partial<Pick<Estimate, "name" | "notes" | "validUntil">>) => Promise<void>;
  sendEstimate: (id: string) => Promise<void>;
  acceptEstimate: (id: string) => Promise<void>;
  declineEstimate: (id: string) => Promise<void>;
  addEstimateLineFromCatalog: (estimateId: string, catalogItemId: string) => Promise<void>;
  addCustomEstimateLine: (estimateId: string) => Promise<void>;
  updateEstimateLine: (
    id: string,
    patch: Partial<Pick<EstimateLine, "description" | "quantity" | "unit" | "unitCost">>
  ) => Promise<void>;
  removeEstimateLine: (id: string) => Promise<void>;
  convertEstimateToInvoice: (estimateId: string) => Promise<Invoice>;
  addInvoice: (input: {
    name: string;
    clientId: string;
    jobId: string | null;
    dueAt: string | null;
    notes?: string;
  }) => Promise<Invoice>;
  sendInvoice: (id: string) => Promise<void>;
  voidInvoice: (id: string) => Promise<void>;
  recordPayment: (input: {
    invoiceId: string;
    amount: number;
    method: string;
    paidAt: string;
    reference: string;
  }) => Promise<void>;
  addScheduleEvent: (input: Omit<ScheduleEvent, "id">) => Promise<ScheduleEvent>;
  addJobPhoto: (input: {
    jobId: string;
    caption: string;
    category: PhotoCategory;
    takenAt: string;
    imageUrl?: string;
    file?: File;
  }) => Promise<void>;
  resetDemo: () => Promise<void>;
  signOut: () => Promise<void>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<CrmState>(configured ? emptyState : structuredClone(seedState));
  const [user, setUser] = useState<CurrentUser>(configured ? guestUser : northlineUser);
  const [teamMembers, setTeamMembers] = useState<string[]>(configured ? [] : [...TEAM]);
  const [hydrated, setHydrated] = useState(!configured);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const seeding = useRef(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !authUser) {
      setHydrateError(authError?.message ?? "Sign in to load the book of work.");
      setHydrated(true);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError || !profile) {
      setHydrateError(profileError?.message ?? "No profile yet. Sign out and create an account.");
      setHydrated(true);
      return;
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profile.company_id)
      .maybeSingle();

    const companyId = profile.company_id;
    try {
      let book = await fetchCompanyBook(supabase, companyId);
      if (book.state.clients.length === 0 && book.team.length === 0 && !seeding.current) {
        seeding.current = true;
        try {
          await seedCompanyBook(supabase, companyId);
          book = await fetchCompanyBook(supabase, companyId);
        } finally {
          seeding.current = false;
        }
      } else if (book.state.catalog.length === 0 && !seeding.current) {
        seeding.current = true;
        try {
          await seedOperationsIfMissing(supabase, companyId);
          book = await fetchCompanyBook(supabase, companyId);
        } finally {
          seeding.current = false;
        }
      }

      setUser({
        id: profile.id,
        companyId,
        name: profile.full_name,
        title: profile.title,
        company: company?.name ?? "Truss",
        initials: profile.initials,
      });
      setTeamMembers(book.team);
      setState(book.state);
      setHydrateError(null);
      setHydrated(true);
    } catch (error) {
      setHydrateError(error instanceof Error ? error.message : "Could not load the book of work.");
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [configured, load]);

  useEffect(() => {
    if (!configured || !user.companyId) return;
    const supabase = createClient();
    const tables = [
      "clients",
      "contacts",
      "opportunities",
      "jobs",
      "activities",
      "tasks",
      "team_members",
      "catalog_items",
      "estimates",
      "estimate_lines",
      "invoices",
      "invoice_lines",
      "payments",
      "schedule_events",
      "job_photos",
    ] as const;
    let timer: number | undefined;
    const channel = supabase.channel(`truss-company-${user.companyId}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `company_id=eq.${user.companyId}` },
        () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            void load();
          }, 200);
        }
      );
    }
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
      () => {
        void load();
      }
    );
    channel.subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [configured, load, user.companyId, user.id]);

  const getClient = useCallback(
    (id: string) => state.clients.find((client) => client.id === id),
    [state.clients]
  );
  const getContact = useCallback(
    (id: string) => state.contacts.find((contact) => contact.id === id),
    [state.contacts]
  );
  const getOpportunity = useCallback(
    (id: string) => state.opportunities.find((opportunity) => opportunity.id === id),
    [state.opportunities]
  );
  const getJob = useCallback(
    (id: string) => state.jobs.find((job) => job.id === id),
    [state.jobs]
  );
  const getEstimate = useCallback(
    (id: string) => state.estimates.find((estimate) => estimate.id === id),
    [state.estimates]
  );
  const getInvoice = useCallback(
    (id: string) => state.invoices.find((invoice) => invoice.id === id),
    [state.invoices]
  );
  const jobForOpportunity = useCallback(
    (opportunityId: string) =>
      state.jobs.find((job) => job.opportunityId === opportunityId),
    [state.jobs]
  );

  const addActivity = useCallback(
    async (input: {
      entityType: "opportunity" | "job" | "client";
      entityId: string;
      type: ActivityType;
      body: string;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const author = user.name;
      const { data, error } = await supabase
        .from("activities")
        .insert({
          company_id: user.companyId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          type: input.type,
          body: input.body,
          author,
        })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        activities: [mapActivity(data), ...prev.activities],
      }));
    },
    [user.companyId, user.name]
  );

  const moveOpportunity = useCallback(
    async (id: string, stage: PipelineStage, lostReason?: string) => {
      let createdJob: Job | null = null;
      const current = state.opportunities.find((opportunity) => opportunity.id === id);
      if (!current || current.stage === stage) return null;

      const supabase = requireClient();
      if (!supabase) return null;
      const { error } = await supabase
        .from("opportunities")
        .update({
          stage,
          win_probability: STAGE_PROBABILITY[stage],
          lost_reason: stage === "lost" ? lostReason ?? current.lostReason ?? null : null,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return null;
      }

      await addActivity({
        entityType: "opportunity",
        entityId: id,
        type: "stage_change",
        body: `Moved from ${STAGE_LABELS[current.stage]} to ${STAGE_LABELS[stage]}.${
          stage === "lost" && lostReason ? ` ${lostReason}` : ""
        }`,
      });

      if (stage === "awarded") {
        const already = state.jobs.some((job) => job.opportunityId === id);
        if (!already) {
          const { data, error: jobError } = await supabase
            .from("jobs")
            .insert({
              company_id: user.companyId,
              opportunity_id: id,
              name: current.name,
              client_id: current.clientId,
              status: "precon",
              contract_value: current.value,
              start_date: new Date().toISOString().slice(0, 10),
              superintendent: "Tom Brennan",
              project_manager: "Luis Ortega",
              location: current.location,
            })
            .select("*")
            .single();
          if (jobError) {
            toast.error(jobError.message);
          } else if (data) {
            createdJob = mapJob(data);
            await addActivity({
              entityType: "job",
              entityId: data.id,
              type: "note",
              body: "Job opened from an awarded bid. Assign precon lead and start buyout.",
            });
          }
        }
      }

      await load();
      return createdJob;
    },
    [addActivity, load, state.jobs, state.opportunities, user.companyId]
  );

  const updateOpportunity = useCallback(
    async (id: string, patch: Partial<Opportunity>) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { error } = await supabase.from("opportunities").update(opportunityPatch(patch)).eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        opportunities: prev.opportunities.map((opportunity) =>
          opportunity.id === id ? { ...opportunity, ...patch } : opportunity
        ),
      }));
    },
    []
  );

  const updateJob = useCallback(async (id: string, patch: Partial<Job>) => {
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("jobs").update(jobPatch(patch)).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    }));
  }, []);

  const addOpportunity = useCallback(
    async (input: Omit<Opportunity, "id" | "createdAt" | "winProbability">) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          company_id: user.companyId,
          name: input.name,
          client_id: input.clientId,
          primary_contact_id: input.primaryContactId || null,
          stage: input.stage,
          value: input.value,
          bid_due_at: input.bidDueAt,
          pre_bid_walk_at: input.preBidWalkAt,
          location: input.location,
          project_type: input.projectType,
          delivery_method: input.deliveryMethod,
          estimator: input.estimator,
          win_probability: STAGE_PROBABILITY[input.stage],
          next_step: input.nextStep,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not open the pursuit.");
        throw error ?? new Error("Could not open the pursuit.");
      }
      const opportunity = mapOpportunity(data);
      setState((prev) => ({ ...prev, opportunities: [opportunity, ...prev.opportunities] }));
      await addActivity({
        entityType: "opportunity",
        entityId: opportunity.id,
        type: "note",
        body: `Opened pursuit. Next step: ${opportunity.nextStep || "qualify the bid."}`,
      });
      return opportunity;
    },
    [addActivity, user.companyId]
  );

  const addClient = useCallback(
    async (input: Omit<Client, "id"> & { contactName?: string; contactTitle?: string }) => {
      const { contactName, contactTitle, ...clientInput } = input;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("clients")
        .insert({
          company_id: user.companyId,
          ...clientInput,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the client.");
        throw error ?? new Error("Could not add the client.");
      }
      const client = mapClient(data);
      setState((prev) => ({ ...prev, clients: [client, ...prev.clients] }));
      if (contactName) {
        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            company_id: user.companyId,
            client_id: client.id,
            name: contactName,
            title: contactTitle || "Primary contact",
          })
          .select("*")
          .single();
        if (contactError) toast.error(contactError.message);
        else if (contact) {
          setState((prev) => ({ ...prev, contacts: [mapContact(contact), ...prev.contacts] }));
        }
      }
      return client;
    },
    [user.companyId]
  );

  const addJob = useCallback(
    async (input: Omit<Job, "id">) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          company_id: user.companyId,
          opportunity_id: input.opportunityId,
          name: input.name,
          client_id: input.clientId,
          status: input.status,
          contract_value: input.contractValue,
          start_date: input.startDate,
          substantial_completion: input.substantialCompletion,
          superintendent: input.superintendent,
          project_manager: input.projectManager,
          location: input.location,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not log the job.");
        throw error ?? new Error("Could not log the job.");
      }
      const job = mapJob(data);
      setState((prev) => ({ ...prev, jobs: [job, ...prev.jobs] }));
      await addActivity({
        entityType: "job",
        entityId: job.id,
        type: "note",
        body: "Job logged. Set the field team and confirm contract value.",
      });
      return job;
    },
    [addActivity, user.companyId]
  );

  const toggleTask = useCallback(async (id: string) => {
    const current = state.tasks.find((task) => task.id === id);
    if (!current) return;
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("tasks").update({ completed: !current.completed }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      ),
    }));
  }, [state.tasks]);

  const addTask = useCallback(
    async (input: {
      title: string;
      dueAt: string;
      relatedType: "opportunity" | "job" | "client" | null;
      relatedId: string | null;
      assignee: string;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          company_id: user.companyId,
          title: input.title,
          due_at: input.dueAt,
          related_type: input.relatedType,
          related_id: input.relatedId,
          assignee: input.assignee,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the task.");
        return;
      }
      setState((prev) => ({ ...prev, tasks: [mapTask(data), ...prev.tasks] }));
    },
    [user.companyId]
  );

  const addEstimate = useCallback(
    async (input: {
      name: string;
      clientId: string;
      opportunityId: string | null;
      jobId: string | null;
      notes?: string;
      validUntil?: string | null;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const number = nextNumber("EST", state.estimates.map((estimate) => estimate.number));
      const { data, error } = await supabase
        .from("estimates")
        .insert({
          company_id: user.companyId,
          number,
          name: input.name,
          client_id: input.clientId,
          opportunity_id: input.opportunityId,
          job_id: input.jobId,
          notes: input.notes ?? "",
          valid_until: input.validUntil ?? null,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not create the estimate.");
        throw error ?? new Error("Could not create the estimate.");
      }
      const estimate = mapEstimate(data);
      setState((prev) => ({ ...prev, estimates: [estimate, ...prev.estimates] }));
      return estimate;
    },
    [state.estimates, user.companyId]
  );

  const updateEstimate = useCallback(
    async (id: string, patch: Partial<Pick<Estimate, "name" | "notes" | "validUntil">>) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { error } = await supabase
        .from("estimates")
        .update({
          name: patch.name,
          notes: patch.notes,
          valid_until: patch.validUntil,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, ...patch } : estimate
        ),
      }));
    },
    []
  );

  const sendEstimate = useCallback(
    async (id: string) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) return;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const sentAt = new Date().toISOString();
      const { error } = await supabase
        .from("estimates")
        .update({ status: "sent", sent_at: sentAt })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, status: "sent", sentAt } : estimate
        ),
      }));
      if (current.opportunityId) {
        await addActivity({
          entityType: "opportunity",
          entityId: current.opportunityId,
          type: "email",
          body: `Sent proposal ${current.number} — ${current.name}.`,
        });
      }
    },
    [addActivity, state.estimates]
  );

  const acceptEstimate = useCallback(
    async (id: string) => {
      const current = state.estimates.find((estimate) => estimate.id === id);
      if (!current) return;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const acceptedAt = new Date().toISOString();
      const { error } = await supabase
        .from("estimates")
        .update({ status: "accepted", accepted_at: acceptedAt })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, status: "accepted", acceptedAt } : estimate
        ),
      }));
      if (current.opportunityId) {
        await addActivity({
          entityType: "opportunity",
          entityId: current.opportunityId,
          type: "note",
          body: `Owner accepted proposal ${current.number}. Convert to an invoice when you are ready to bill.`,
        });
      }
    },
    [addActivity, state.estimates]
  );

  const declineEstimate = useCallback(
    async (id: string) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { error } = await supabase.from("estimates").update({ status: "declined" }).eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        estimates: prev.estimates.map((estimate) =>
          estimate.id === id ? { ...estimate, status: "declined" } : estimate
        ),
      }));
    },
    []
  );

  const addEstimateLineFromCatalog = useCallback(
    async (estimateId: string, catalogItemId: string) => {
      const item = state.catalog.find((entry) => entry.id === catalogItemId);
      if (!item) return;
      const sortOrder =
        Math.max(
          0,
          ...state.estimateLines
            .filter((line) => line.estimateId === estimateId)
            .map((line) => line.sortOrder)
        ) + 1;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("estimate_lines")
        .insert({
          company_id: user.companyId,
          estimate_id: estimateId,
          catalog_item_id: item.id,
          description: item.name,
          quantity: 1,
          unit: item.unit,
          unit_cost: item.unitCost,
          sort_order: sortOrder,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the line.");
        return;
      }
      setState((prev) => ({
        ...prev,
        estimateLines: [...prev.estimateLines, mapEstimateLine(data)],
      }));
    },
    [state.catalog, state.estimateLines, user.companyId]
  );

  const addCustomEstimateLine = useCallback(
    async (estimateId: string) => {
      const sortOrder =
        Math.max(
          0,
          ...state.estimateLines
            .filter((line) => line.estimateId === estimateId)
            .map((line) => line.sortOrder)
        ) + 1;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("estimate_lines")
        .insert({
          company_id: user.companyId,
          estimate_id: estimateId,
          description: "New line",
          quantity: 1,
          unit: "LS",
          unit_cost: 0,
          sort_order: sortOrder,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the line.");
        return;
      }
      setState((prev) => ({
        ...prev,
        estimateLines: [...prev.estimateLines, mapEstimateLine(data)],
      }));
    },
    [state.estimateLines, user.companyId]
  );

  const updateEstimateLine = useCallback(
    async (
      id: string,
      patch: Partial<Pick<EstimateLine, "description" | "quantity" | "unit" | "unitCost">>
    ) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { error } = await supabase
        .from("estimate_lines")
        .update({
          description: patch.description,
          quantity: patch.quantity,
          unit: patch.unit,
          unit_cost: patch.unitCost,
        })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setState((prev) => ({
        ...prev,
        estimateLines: prev.estimateLines.map((line) =>
          line.id === id ? { ...line, ...patch } : line
        ),
      }));
    },
    []
  );

  const removeEstimateLine = useCallback(async (id: string) => {
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("estimate_lines").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      estimateLines: prev.estimateLines.filter((line) => line.id !== id),
    }));
  }, []);

  const convertEstimateToInvoice = useCallback(
    async (estimateId: string) => {
      const estimate = state.estimates.find((item) => item.id === estimateId);
      if (!estimate) throw new Error("Estimate not found.");
      const lines = state.estimateLines.filter((line) => line.estimateId === estimateId);
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const number = nextNumber("INV", state.invoices.map((invoice) => invoice.number));
      const issuedAt = new Date().toISOString().slice(0, 10);
      const due = new Date();
      due.setDate(due.getDate() + 30);
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          company_id: user.companyId,
          number,
          name: estimate.name,
          client_id: estimate.clientId,
          job_id: estimate.jobId,
          estimate_id: estimate.id,
          status: "draft",
          issued_at: issuedAt,
          due_at: due.toISOString().slice(0, 10),
          notes: `Converted from ${estimate.number}.`,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not convert the estimate.");
        throw error ?? new Error("Could not convert the estimate.");
      }
      if (lines.length) {
        const { error: lineError } = await supabase.from("invoice_lines").insert(
          lines.map((line, index) => ({
            company_id: user.companyId,
            invoice_id: data.id,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unit_cost: line.unitCost,
            sort_order: index,
          }))
        );
        if (lineError) {
          toast.error(lineError.message);
          throw lineError;
        }
      }
      const invoice = mapInvoice(data);
      const mappedLines = lines.map((line, index) => ({
        id: crypto.randomUUID(),
        invoiceId: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        sortOrder: index,
      }));
      setState((prev) => ({
        ...prev,
        invoices: [invoice, ...prev.invoices],
        invoiceLines: [...prev.invoiceLines, ...mappedLines],
      }));
      await load();
      return invoice;
    },
    [load, state.estimateLines, state.estimates, state.invoices, user.companyId]
  );

  const addInvoice = useCallback(
    async (input: {
      name: string;
      clientId: string;
      jobId: string | null;
      dueAt: string | null;
      notes?: string;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const number = nextNumber("INV", state.invoices.map((invoice) => invoice.number));
      const { data, error } = await supabase
        .from("invoices")
        .insert({
          company_id: user.companyId,
          number,
          name: input.name,
          client_id: input.clientId,
          job_id: input.jobId,
          notes: input.notes ?? "",
          due_at: input.dueAt,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not create the invoice.");
        throw error ?? new Error("Could not create the invoice.");
      }
      const invoice = mapInvoice(data);
      setState((prev) => ({ ...prev, invoices: [invoice, ...prev.invoices] }));
      return invoice;
    },
    [state.invoices, user.companyId]
  );

  const sendInvoice = useCallback(async (id: string) => {
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("invoices").update({ status: "sent" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === id ? { ...invoice, status: "sent" } : invoice
      ),
    }));
  }, []);

  const voidInvoice = useCallback(async (id: string) => {
    const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
    const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setState((prev) => ({
      ...prev,
      invoices: prev.invoices.map((invoice) =>
        invoice.id === id ? { ...invoice, status: "void" } : invoice
      ),
    }));
  }, []);

  const recordPayment = useCallback(
    async (input: {
      invoiceId: string;
      amount: number;
      method: string;
      paidAt: string;
      reference: string;
    }) => {
      const invoice = state.invoices.find((item) => item.id === input.invoiceId);
      if (!invoice) return;
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("payments")
        .insert({
          company_id: user.companyId,
          invoice_id: input.invoiceId,
          amount: input.amount,
          method: input.method,
          paid_at: input.paidAt,
          reference: input.reference,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not record the payment.");
        return;
      }
      const payment = mapPayment(data);
      const nextPayments = [payment, ...state.payments];
      const nextStatus = derivedInvoiceStatus(
        { ...invoice, status: invoice.status === "void" ? "void" : invoice.status === "draft" ? "sent" : invoice.status },
        state.invoiceLines,
        nextPayments
      );
      const { error: statusError } = await supabase
        .from("invoices")
        .update({ status: nextStatus })
        .eq("id", invoice.id);
      if (statusError) toast.error(statusError.message);
      setState((prev) => ({
        ...prev,
        payments: [payment, ...prev.payments],
        invoices: prev.invoices.map((item) =>
          item.id === invoice.id ? { ...item, status: nextStatus } : item
        ),
      }));
      if (invoice.jobId) {
        await addActivity({
          entityType: "job",
          entityId: invoice.jobId,
          type: "note",
          body: `Payment of ${input.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })} recorded on ${invoice.number}.`,
        });
      }
    },
    [addActivity, state.invoiceLines, state.invoices, state.payments, user.companyId]
  );

  const addScheduleEvent = useCallback(
    async (input: Omit<ScheduleEvent, "id">) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      const { data, error } = await supabase
        .from("schedule_events")
        .insert({
          company_id: user.companyId,
          title: input.title,
          kind: input.kind,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          location: input.location,
          assignee: input.assignee,
          opportunity_id: input.opportunityId,
          job_id: input.jobId,
          client_id: input.clientId,
          notes: input.notes,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the event.");
        throw error ?? new Error("Could not add the event.");
      }
      const event = mapScheduleEvent(data);
      setState((prev) => ({ ...prev, events: [...prev.events, event] }));
      return event;
    },
    [user.companyId]
  );

  const addJobPhoto = useCallback(
    async (input: {
      jobId: string;
      caption: string;
      category: PhotoCategory;
      takenAt: string;
      imageUrl?: string;
      file?: File;
    }) => {
      const supabase = requireClient();
    if (!supabase) throw new Error("Connect a Supabase project to save.");
      let imageUrl = input.imageUrl?.trim() ?? "";
      let storagePath: string | null = null;
      if (input.file) {
        const ext = input.file.name.split(".").pop()?.toLowerCase() || "jpg";
        storagePath = `${user.companyId}/${input.jobId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("job-photos")
          .upload(storagePath, input.file, { contentType: input.file.type, upsert: false });
        if (uploadError) {
          toast.error(uploadError.message);
          return;
        }
        imageUrl = supabase.storage.from("job-photos").getPublicUrl(storagePath).data.publicUrl;
      }
      if (!imageUrl) {
        toast.error("Add a photo file or an image URL.");
        return;
      }
      const { data, error } = await supabase
        .from("job_photos")
        .insert({
          company_id: user.companyId,
          job_id: input.jobId,
          caption: input.caption,
          category: input.category,
          taken_at: input.takenAt,
          image_url: imageUrl,
          storage_path: storagePath,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not save the photo.");
        return;
      }
      setState((prev) => ({ ...prev, photos: [mapJobPhoto(data), ...prev.photos] }));
    },
    [user.companyId]
  );

  const resetDemo = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setState(structuredClone(seedState));
      toast.success("Northline sample book restored.");
      return;
    }
    if (!user.companyId) return;
    const supabase = createClient();
    try {
      await seedCompanyBook(supabase, user.companyId);
      await load();
      toast.success("Northline sample book restored in Supabase.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset demo data.");
    }
  }, [load, user.companyId]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo<CrmContextValue>(
    () => ({
      ...state,
      user,
      teamMembers,
      configured,
      hydrated,
      hydrateError,
      getClient,
      getContact,
      getOpportunity,
      getJob,
      getEstimate,
      getInvoice,
      jobForOpportunity,
      moveOpportunity,
      updateOpportunity,
      updateJob,
      addOpportunity,
      addClient,
      addJob,
      addActivity,
      toggleTask,
      addTask,
      addEstimate,
      updateEstimate,
      sendEstimate,
      acceptEstimate,
      declineEstimate,
      addEstimateLineFromCatalog,
      addCustomEstimateLine,
      updateEstimateLine,
      removeEstimateLine,
      convertEstimateToInvoice,
      addInvoice,
      sendInvoice,
      voidInvoice,
      recordPayment,
      addScheduleEvent,
      addJobPhoto,
      resetDemo,
      signOut,
    }),
    [
      state,
      user,
      teamMembers,
      configured,
      hydrated,
      hydrateError,
      getClient,
      getContact,
      getOpportunity,
      getJob,
      getEstimate,
      getInvoice,
      jobForOpportunity,
      moveOpportunity,
      updateOpportunity,
      updateJob,
      addOpportunity,
      addClient,
      addJob,
      addActivity,
      toggleTask,
      addTask,
      addEstimate,
      updateEstimate,
      sendEstimate,
      acceptEstimate,
      declineEstimate,
      addEstimateLineFromCatalog,
      addCustomEstimateLine,
      updateEstimateLine,
      removeEstimateLine,
      convertEstimateToInvoice,
      addInvoice,
      sendInvoice,
      voidInvoice,
      recordPayment,
      addScheduleEvent,
      addJobPhoto,
      resetDemo,
      signOut,
    ]
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const context = useContext(CrmContext);
  if (!context) {
    throw new Error("useCrm must be used within CrmProvider");
  }
  return context;
}
