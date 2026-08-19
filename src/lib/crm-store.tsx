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
import { seedCompanyBook } from "@/lib/supabase/seed-company";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  jobPatch,
  mapActivity,
  mapClient,
  mapContact,
  mapJob,
  mapOpportunity,
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
  type Job,
  type Opportunity,
  type PipelineStage,
} from "@/lib/types";

const emptyState: CrmState = {
  clients: [],
  contacts: [],
  opportunities: [],
  jobs: [],
  activities: [],
  tasks: [],
};

const guestUser: CurrentUser = {
  id: "",
  companyId: "",
  name: "Guest",
  title: "",
  company: "Truss",
  initials: "TR",
};

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
  resetDemo: () => Promise<void>;
  signOut: () => Promise<void>;
};

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<CrmState>(emptyState);
  const [user, setUser] = useState<CurrentUser>(guestUser);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(!configured);
  const [hydrateError, setHydrateError] = useState<string | null>(
    configured
      ? null
      : "Connect a Supabase project to store the book of work. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY), then run the migration in /supabase/migrations."
  );
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
    const [clientsRes, contactsRes, oppsRes, jobsRes, activitiesRes, tasksRes, teamRes] =
      await Promise.all([
        supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
        supabase.from("contacts").select("*").eq("company_id", companyId).order("name"),
        supabase.from("opportunities").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("jobs").select("*").eq("company_id", companyId).order("start_date", { ascending: false }),
        supabase.from("activities").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("tasks").select("*").eq("company_id", companyId).order("due_at"),
        supabase.from("team_members").select("name").eq("company_id", companyId).order("name"),
      ]);

    const firstError =
      clientsRes.error ||
      contactsRes.error ||
      oppsRes.error ||
      jobsRes.error ||
      activitiesRes.error ||
      tasksRes.error ||
      teamRes.error;
    if (firstError) {
      setHydrateError(firstError.message);
      setHydrated(true);
      return;
    }

    const clients = (clientsRes.data ?? []).map(mapClient);
    const team = (teamRes.data ?? []).map((row) => row.name);

    let nextClients = clients;
    let nextTeam = team;
    let nextContacts = (contactsRes.data ?? []).map(mapContact);
    let nextOpportunities = (oppsRes.data ?? []).map(mapOpportunity);
    let nextJobs = (jobsRes.data ?? []).map(mapJob);
    let nextActivities = (activitiesRes.data ?? []).map(mapActivity);
    let nextTasks = (tasksRes.data ?? []).map(mapTask);

    if (clients.length === 0 && team.length === 0 && !seeding.current) {
      seeding.current = true;
      try {
        await seedCompanyBook(supabase, companyId);
        const second = await Promise.all([
          supabase.from("clients").select("*").eq("company_id", companyId).order("name"),
          supabase.from("contacts").select("*").eq("company_id", companyId).order("name"),
          supabase
            .from("opportunities")
            .select("*")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false }),
          supabase
            .from("jobs")
            .select("*")
            .eq("company_id", companyId)
            .order("start_date", { ascending: false }),
          supabase
            .from("activities")
            .select("*")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false }),
          supabase.from("tasks").select("*").eq("company_id", companyId).order("due_at"),
          supabase.from("team_members").select("name").eq("company_id", companyId).order("name"),
        ]);
        const seedError = second.find((result) => result.error)?.error;
        if (seedError) {
          setHydrateError(seedError.message);
          setHydrated(true);
          return;
        }
        nextClients = (second[0].data ?? []).map(mapClient);
        nextContacts = (second[1].data ?? []).map(mapContact);
        nextOpportunities = (second[2].data ?? []).map(mapOpportunity);
        nextJobs = (second[3].data ?? []).map(mapJob);
        nextActivities = (second[4].data ?? []).map(mapActivity);
        nextTasks = (second[5].data ?? []).map(mapTask);
        nextTeam = (second[6].data ?? []).map((row) => row.name);
      } catch (error) {
        setHydrateError(error instanceof Error ? error.message : "Could not load the sample book.");
        setHydrated(true);
        return;
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
    setTeamMembers(nextTeam);
    setState({
      clients: nextClients,
      contacts: nextContacts,
      opportunities: nextOpportunities,
      jobs: nextJobs,
      activities: nextActivities,
      tasks: nextTasks,
    });
    setHydrateError(null);
    setHydrated(true);
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
      const supabase = createClient();
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

      const supabase = createClient();
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
      const supabase = createClient();
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
    const supabase = createClient();
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
      const supabase = createClient();
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
      const supabase = createClient();
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
      const supabase = createClient();
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
    const supabase = createClient();
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
      const supabase = createClient();
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

  const resetDemo = useCallback(async () => {
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
    const supabase = createClient();
    await supabase.auth.signOut();
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
