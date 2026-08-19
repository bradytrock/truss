"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedState } from "@/lib/seed";
import {
  CURRENT_USER,
  STAGE_LABELS,
  STAGE_PROBABILITY,
  type ActivityType,
  type Client,
  type CrmState,
  type Job,
  type Opportunity,
  type PipelineStage,
} from "@/lib/types";

const STORAGE_KEY = "truss-crm-v1";

type CrmContextValue = CrmState & {
  hydrated: boolean;
  hydrateError: string | null;
  getClient: (id: string) => Client | undefined;
  getContact: (id: string) => CrmState["contacts"][number] | undefined;
  getOpportunity: (id: string) => Opportunity | undefined;
  getJob: (id: string) => Job | undefined;
  jobForOpportunity: (opportunityId: string) => Job | undefined;
  moveOpportunity: (id: string, stage: PipelineStage, lostReason?: string) => Job | null;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => void;
  updateJob: (id: string, patch: Partial<Job>) => void;
  addOpportunity: (input: Omit<Opportunity, "id" | "createdAt" | "winProbability">) => Opportunity;
  addClient: (input: Omit<Client, "id"> & { contactName?: string; contactTitle?: string }) => Client;
  addJob: (input: Omit<Job, "id">) => Job;
  addActivity: (input: {
    entityType: "opportunity" | "job" | "client";
    entityId: string;
    type: ActivityType;
    body: string;
  }) => void;
  toggleTask: (id: string) => void;
  addTask: (input: {
    title: string;
    dueAt: string;
    relatedType: "opportunity" | "job" | "client" | null;
    relatedId: string | null;
    assignee: string;
  }) => void;
  resetDemo: () => void;
};

const CrmContext = createContext<CrmContextValue | null>(null);

function cloneSeed(): CrmState {
  return structuredClone(seedState);
}

function nowIso() {
  return new Date().toISOString();
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CrmState>(cloneSeed);
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as CrmState;
          if (
            parsed &&
            Array.isArray(parsed.clients) &&
            Array.isArray(parsed.opportunities) &&
            Array.isArray(parsed.jobs)
          ) {
            setState(parsed);
          }
        }
      } catch {
        setHydrateError("Could not load saved pipeline. Showing the Northline demo data.");
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

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
    (input: {
      entityType: "opportunity" | "job" | "client";
      entityId: string;
      type: ActivityType;
      body: string;
    }) => {
      setState((prev) => ({
        ...prev,
        activities: [
          {
            id: crypto.randomUUID(),
            author: CURRENT_USER.name,
            createdAt: nowIso(),
            ...input,
          },
          ...prev.activities,
        ],
      }));
    },
    []
  );

  const moveOpportunity = useCallback(
    (id: string, stage: PipelineStage, lostReason?: string) => {
      let createdJob: Job | null = null;
      setState((prev) => {
        const existing = prev.opportunities.find((opportunity) => opportunity.id === id);
        if (!existing || existing.stage === stage) return prev;

        const opportunities = prev.opportunities.map((opportunity) =>
          opportunity.id === id
            ? {
                ...opportunity,
                stage,
                winProbability: STAGE_PROBABILITY[stage],
                lostReason: stage === "lost" ? lostReason ?? opportunity.lostReason : undefined,
              }
            : opportunity
        );

        const activities = [
          {
            id: crypto.randomUUID(),
            entityType: "opportunity" as const,
            entityId: id,
            type: "stage_change" as const,
            body: `Moved from ${STAGE_LABELS[existing.stage]} to ${STAGE_LABELS[stage]}.${
              stage === "lost" && lostReason ? ` ${lostReason}` : ""
            }`,
            createdAt: nowIso(),
            author: CURRENT_USER.name,
          },
          ...prev.activities,
        ];

        let jobs = prev.jobs;
        if (stage === "awarded" && !jobs.some((job) => job.opportunityId === id)) {
          createdJob = {
            id: crypto.randomUUID(),
            opportunityId: id,
            name: existing.name,
            clientId: existing.clientId,
            status: "precon",
            contractValue: existing.value,
            startDate: new Date().toISOString().slice(0, 10),
            substantialCompletion: null,
            superintendent: "Tom Brennan",
            projectManager: "Luis Ortega",
            location: existing.location,
          };
          jobs = [createdJob, ...jobs];
          activities.unshift({
            id: crypto.randomUUID(),
            entityType: "job",
            entityId: createdJob.id,
            type: "note",
            body: "Job opened from an awarded bid. Assign precon lead and start buyout.",
            createdAt: nowIso(),
            author: CURRENT_USER.name,
          });
        }

        return { ...prev, opportunities, jobs, activities };
      });
      return createdJob;
    },
    []
  );

  const updateOpportunity = useCallback((id: string, patch: Partial<Opportunity>) => {
    setState((prev) => ({
      ...prev,
      opportunities: prev.opportunities.map((opportunity) =>
        opportunity.id === id ? { ...opportunity, ...patch } : opportunity
      ),
    }));
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    }));
  }, []);

  const addOpportunity = useCallback(
    (input: Omit<Opportunity, "id" | "createdAt" | "winProbability">) => {
      const opportunity: Opportunity = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: nowIso(),
        winProbability: STAGE_PROBABILITY[input.stage],
      };
      setState((prev) => ({
        ...prev,
        opportunities: [opportunity, ...prev.opportunities],
        activities: [
          {
            id: crypto.randomUUID(),
            entityType: "opportunity",
            entityId: opportunity.id,
            type: "note",
            body: `Opened pursuit. Next step: ${opportunity.nextStep || "qualify the bid."}`,
            createdAt: nowIso(),
            author: CURRENT_USER.name,
          },
          ...prev.activities,
        ],
      }));
      return opportunity;
    },
    []
  );

  const addClient = useCallback(
    (input: Omit<Client, "id"> & { contactName?: string; contactTitle?: string }) => {
      const { contactName, contactTitle, ...clientInput } = input;
      const client: Client = { ...clientInput, id: crypto.randomUUID() };
      setState((prev) => ({
        ...prev,
        clients: [client, ...prev.clients],
        contacts: contactName
          ? [
              {
                id: crypto.randomUUID(),
                clientId: client.id,
                name: contactName,
                title: contactTitle || "Primary contact",
                email: "",
                phone: "",
              },
              ...prev.contacts,
            ]
          : prev.contacts,
      }));
      return client;
    },
    []
  );

  const addJob = useCallback((input: Omit<Job, "id">) => {
    const job: Job = { ...input, id: crypto.randomUUID() };
    setState((prev) => ({
      ...prev,
      jobs: [job, ...prev.jobs],
      activities: [
        {
          id: crypto.randomUUID(),
          entityType: "job",
          entityId: job.id,
          type: "note",
          body: "Job logged. Set the field team and confirm contract value.",
          createdAt: nowIso(),
          author: CURRENT_USER.name,
        },
        ...prev.activities,
      ],
    }));
    return job;
  }, []);

  const toggleTask = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      ),
    }));
  }, []);

  const addTask = useCallback(
    (input: {
      title: string;
      dueAt: string;
      relatedType: "opportunity" | "job" | "client" | null;
      relatedId: string | null;
      assignee: string;
    }) => {
      setState((prev) => ({
        ...prev,
        tasks: [
          {
            id: crypto.randomUUID(),
            completed: false,
            ...input,
          },
          ...prev.tasks,
        ],
      }));
    },
    []
  );

  const resetDemo = useCallback(() => {
    setState(cloneSeed());
    setHydrateError(null);
  }, []);

  const value = useMemo<CrmContextValue>(
    () => ({
      ...state,
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
    }),
    [
      state,
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
