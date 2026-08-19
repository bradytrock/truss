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
  mapCompany,
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
  NORTHLINE_COMPANY,
  NORTHLINE_STAFF,
  STAGE_LABELS,
  STAGE_PROBABILITY,
  initialsFromName,
  staffByName,
  type ActivityType,
  type CalendarAccount,
  type CalendarShare,
  type Client,
  type CompanySettings,
  type Contact,
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
  type SeatRole,
  type StaffMember,
} from "@/lib/types";
import {
  accountForStaff,
  clearLocalCalendar,
  demoGoogleEmail,
  readLocalCalendar,
  writeLocalCalendar,
} from "@/lib/calendar";
import {
  backfillRecordCodes,
  codeInsertError,
  existingRecordCodes,
  nextJobCode,
} from "@/lib/job-code";
import { resolveCustomerName, type CustomerRecord } from "@/lib/parties";
import { canLoginAs, loginAsTargets, scopeBook, scopeDescription } from "@/lib/visibility";

const emptyState: CrmState = {
  staff: [],
  teams: [],
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
  calendarAccounts: [],
  calendarShares: [],
};

function userFromStaff(
  staff: StaffMember,
  extras: { id: string; companyId: string; company: string }
): CurrentUser {
  return {
    id: extras.id,
    companyId: extras.companyId,
    staffId: staff.id,
    name: staff.name,
    title: staff.title,
    company: extras.company,
    initials: staff.initials || initialsFromName(staff.name),
    role: staff.role,
    teamId: staff.teamId,
  };
}

const guestUser: CurrentUser = {
  id: "",
  companyId: "",
  staffId: "",
  name: "Guest",
  title: "",
  company: "Truss",
  initials: "TR",
  role: "project_manager",
  teamId: null,
};

const northlineUser = userFromStaff(NORTHLINE_STAFF[0], {
  id: "local",
  companyId: "local",
  company: "Northline Construction",
});

const DEMO_STAFF_KEY = "truss.demoStaffId";
const COMPANY_SETTINGS_KEY = "truss.companySettings";

function allocateCode(
  creatorName: string,
  jobs: Job[],
  opportunities: Opportunity[],
  inherit?: string,
) {
  if (inherit) return inherit;
  return nextJobCode(creatorName, new Date(), existingRecordCodes([...jobs, ...opportunities]));
}

function readLocalCompany(): CompanySettings {
  try {
    const raw = window.localStorage.getItem(COMPANY_SETTINGS_KEY);
    if (!raw) return structuredClone(NORTHLINE_COMPANY);
    const parsed = JSON.parse(raw) as Partial<CompanySettings>;
    return {
      ...NORTHLINE_COMPANY,
      ...parsed,
      name: parsed.name?.trim() || NORTHLINE_COMPANY.name,
    };
  } catch {
    return structuredClone(NORTHLINE_COMPANY);
  }
}

function writeLocalCompany(settings: CompanySettings) {
  try {
    window.localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode
  }
}

function requireClient() {
  if (!isSupabaseConfigured()) {
    toast.message("Connect a Supabase project to save. You are browsing the Northline sample book locally.");
    return null;
  }
  return createClient();
}

type CrmContextValue = CrmState & {
  user: CurrentUser;
  viewer: StaffMember | undefined;
  effectiveStaff: StaffMember | undefined;
  impersonatedStaff: StaffMember | undefined;
  loginAsOptions: StaffMember[];
  scopeLabel: string;
  teamMembers: string[];
  book: CrmState;
  configured: boolean;
  hydrated: boolean;
  hydrateError: string | null;
  switchSeat: (staffId: string) => void;
  loginAs: (staffId: string) => void;
  stopLoginAs: () => void;
  getClient: (id: string | null | undefined) => Client | undefined;
  getContact: (id: string | null | undefined) => Contact | undefined;
  customerName: (record: CustomerRecord) => string;
  getOpportunity: (id: string) => Opportunity | undefined;
  getJob: (id: string) => Job | undefined;
  getEstimate: (id: string) => Estimate | undefined;
  getInvoice: (id: string) => Invoice | undefined;
  jobForOpportunity: (opportunityId: string) => Job | undefined;
  company: CompanySettings;
  canEditCompany: boolean;
  updateCompany: (settings: CompanySettings) => Promise<boolean>;
  moveOpportunity: (
    id: string,
    stage: PipelineStage,
    lostReason?: string
  ) => Promise<Job | null>;
  updateOpportunity: (id: string, patch: Partial<Opportunity>) => Promise<void>;
  updateJob: (id: string, patch: Partial<Job>) => Promise<void>;
  addOpportunity: (
    input: Omit<Opportunity, "id" | "code" | "createdAt" | "winProbability" | "ownerStaffId"> & {
      ownerStaffId?: string;
    }
  ) => Promise<Opportunity>;
  addClient: (
    input: Omit<Client, "id"> & {
      contactName?: string;
      contactTitle?: string;
      isReferralPartner?: boolean;
    }
  ) => Promise<Client>;
  addContact: (input: Omit<Contact, "id">) => Promise<Contact>;
  addJob: (input: Omit<Job, "id" | "code" | "ownerStaffId"> & { ownerStaffId?: string }) => Promise<Job>;
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
    clientId: string | null;
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
    clientId: string | null;
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
  linkDemoCalendar: () => Promise<void>;
  markCalendarLinked: (staffId: string, googleEmail: string, source: "google" | "demo") => Promise<void>;
  disconnectCalendar: () => Promise<void>;
  setShareWithTeam: (shareWithTeam: boolean) => Promise<void>;
  setCalendarShare: (viewerStaffId: string, shared: boolean) => Promise<void>;
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
  const [companySettings, setCompanySettings] = useState<CompanySettings>(NORTHLINE_COMPANY);
  const [impersonatedStaffId, setImpersonatedStaffId] = useState<string | null>(null);
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
      const local = readLocalCompany();
      setCompanySettings(local);
      setState(structuredClone(seedState));
      setUser({ ...northlineUser, company: local.name });
      setHydrateError(null);
      setHydrated(true);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError || !profile) {
      const local = readLocalCompany();
      setCompanySettings(local);
      setState(structuredClone(seedState));
      setUser({ ...northlineUser, company: local.name });
      const missingSchema =
        profileError?.message?.includes("schema cache") ||
        profileError?.code === "PGRST205" ||
        profileError?.message?.includes("Could not find the table");
      setHydrateError(
        missingSchema
          ? "Signed in, but this project is missing the Truss tables. Run the files in supabase/migrations in the SQL editor (in order), then reset demo data."
          : profileError?.message ??
            "No profile yet. Create an account after the migrations have been applied."
      );
      setHydrated(true);
      return;
    }

    const { data: companyRow, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle();
    const settings = companyRow
      ? mapCompany(companyRow)
      : companyError
        ? NORTHLINE_COMPANY
        : { ...NORTHLINE_COMPANY, name: "Truss" };

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

      const roster = book.state.staff;
      const matched =
        roster.find((member) => member.name === profile.full_name) ||
        roster.find((member) => member.role === ((profile.role as SeatRole | undefined) ?? "company_admin")) ||
        roster.find((member) => member.role === "company_admin") ||
        roster[0];
      const role = (profile.role as SeatRole | undefined) ?? matched?.role ?? "company_admin";
      setCompanySettings(settings);
      setUser({
        id: profile.id,
        companyId,
        staffId: matched?.id ?? "",
        name: profile.full_name,
        title: profile.title,
        company: settings.name,
        initials: profile.initials,
        role,
        teamId: matched?.teamId ?? null,
      });
      const stamped = backfillRecordCodes(
        book.state.opportunities,
        book.state.jobs,
        book.state.staff.length > 0 ? book.state.staff : NORTHLINE_STAFF,
      );
      setState({ ...book.state, opportunities: stamped.opportunities, jobs: stamped.jobs });
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
      "teams",
      "catalog_items",
      "estimates",
      "estimate_lines",
      "invoices",
      "invoice_lines",
      "payments",
      "schedule_events",
      "job_photos",
      "calendar_accounts",
      "calendar_shares",
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
      { event: "*", schema: "public", table: "companies", filter: `id=eq.${user.companyId}` },
      () => {
        void load();
      }
    );
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

  useEffect(() => {
    if (configured) return;
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(DEMO_STAFF_KEY);
        const member = state.staff.find((item) => item.id === saved) ?? state.staff[0];
        const local = readLocalCompany();
        setCompanySettings(local);
        setState((prev) => ({ ...prev, ...readLocalCalendar(prev) }));
        if (!member) {
          setUser((current) => ({ ...current, company: local.name }));
          return;
        }
        setUser((current) =>
          userFromStaff(member, {
            id: current.id || "local",
            companyId: current.companyId || "local",
            company: local.name,
          })
        );
      } catch {
        // ignore storage
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once from seed
  }, [configured]);

  const viewer = useMemo(
    () =>
      state.staff.find((member) => member.id === user.staffId) ??
      state.staff.find((member) => member.name === user.name) ??
      state.staff[0],
    [state.staff, user.name, user.staffId]
  );
  const impersonatedStaff = useMemo(
    () => state.staff.find((member) => member.id === impersonatedStaffId),
    [impersonatedStaffId, state.staff]
  );
  const effectiveStaff = impersonatedStaff ?? viewer;
  const scoped = useMemo(() => scopeBook(state, effectiveStaff), [effectiveStaff, state]);
  const loginAsOptions = useMemo(
    () => (viewer ? loginAsTargets(viewer, state.staff) : []),
    [state.staff, viewer]
  );
  const teamMembers = useMemo(() => state.staff.map((member) => member.name), [state.staff]);
  const displayUser = useMemo(() => {
    if (!effectiveStaff) return user;
    return {
      ...user,
      staffId: effectiveStaff.id,
      name: effectiveStaff.name,
      title: impersonatedStaff
        ? `${effectiveStaff.title} · via ${viewer?.name ?? user.name}`
        : effectiveStaff.title,
      initials: effectiveStaff.initials,
      role: effectiveStaff.role,
      teamId: effectiveStaff.teamId,
    };
  }, [effectiveStaff, impersonatedStaff, user, viewer]);

  const switchSeat = useCallback(
    (staffId: string) => {
      const member = state.staff.find((item) => item.id === staffId);
      if (!member) return;
      setImpersonatedStaffId(null);
      setUser(
        userFromStaff(member, {
          id: user.id || "local",
          companyId: user.companyId || "local",
          company: user.company || "Northline Construction",
        })
      );
      try {
        window.localStorage.setItem(DEMO_STAFF_KEY, member.id);
      } catch {
        // ignore
      }
      toast.success(`Viewing as ${member.name}`);
    },
    [state.staff, user.company, user.companyId, user.id]
  );

  const loginAs = useCallback(
    (staffId: string) => {
      if (!viewer || !canLoginAs(viewer)) {
        toast.error("Your seat cannot log in as another user.");
        return;
      }
      const allowed = loginAsTargets(viewer, state.staff).some((member) => member.id === staffId);
      if (!allowed) {
        toast.error("You can only log in as someone on your team.");
        return;
      }
      const member = state.staff.find((item) => item.id === staffId);
      if (!member) return;
      setImpersonatedStaffId(member.id);
      toast.success(`Logged in as ${member.name}`);
    },
    [state.staff, viewer]
  );

  const stopLoginAs = useCallback(() => {
    setImpersonatedStaffId(null);
  }, []);

  const getClient = useCallback(
    (id: string | null | undefined) =>
      id ? scoped.clients.find((client) => client.id === id) : undefined,
    [scoped.clients]
  );
  const getContact = useCallback(
    (id: string | null | undefined) =>
      id ? scoped.contacts.find((contact) => contact.id === id) : undefined,
    [scoped.contacts]
  );
  const customerName = useCallback(
    (record: CustomerRecord) => resolveCustomerName(record, scoped),
    [scoped]
  );
  const getOpportunity = useCallback(
    (id: string) => scoped.opportunities.find((opportunity) => opportunity.id === id),
    [scoped.opportunities]
  );
  const getJob = useCallback(
    (id: string) => scoped.jobs.find((job) => job.id === id),
    [scoped.jobs]
  );
  const getEstimate = useCallback(
    (id: string) => scoped.estimates.find((estimate) => estimate.id === id),
    [scoped.estimates]
  );
  const getInvoice = useCallback(
    (id: string) => scoped.invoices.find((invoice) => invoice.id === id),
    [scoped.invoices]
  );
  const jobForOpportunity = useCallback(
    (opportunityId: string) =>
      scoped.jobs.find((job) => job.opportunityId === opportunityId),
    [scoped.jobs]
  );

  const addActivity = useCallback(
    async (input: {
      entityType: "opportunity" | "job" | "client";
      entityId: string;
      type: ActivityType;
      body: string;
    }) => {
      const supabase = requireClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          activities: [
            {
              id: crypto.randomUUID(),
              ...input,
              createdAt: new Date().toISOString(),
              author: user.name,
            },
            ...prev.activities,
          ],
        }));
        return;
      }
      const { data, error } = await supabase
        .from("activities")
        .insert({
          company_id: user.companyId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          type: input.type,
          body: input.body,
          author: user.name,
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
      if (!supabase) {
        setState((prev) => {
          const jobs = [...prev.jobs];
          let nextJobs = jobs;
          if (stage === "awarded" && !jobs.some((job) => job.opportunityId === id)) {
            nextJobs = [
              {
                id: crypto.randomUUID(),
                code: allocateCode(user.name, jobs, prev.opportunities, current.code),
                opportunityId: id,
                name: current.name,
                clientId: current.clientId,
                status: "precon",
                contractValue: current.value,
                startDate: new Date().toISOString().slice(0, 10),
                substantialCompletion: null,
                superintendent: "Tom Brennan",
                projectManager: user.name || "Luis Ortega",
                location: current.location,
                ownerStaffId: user.staffId,
                primaryContactId: current.primaryContactId || null,
              },
              ...jobs,
            ];
            createdJob = nextJobs[0];
          }
          return {
            ...prev,
            opportunities: prev.opportunities.map((opportunity) =>
              opportunity.id === id
                ? {
                    ...opportunity,
                    stage,
                    winProbability: STAGE_PROBABILITY[stage],
                    lostReason: stage === "lost" ? lostReason ?? opportunity.lostReason : opportunity.lostReason,
                  }
                : opportunity
            ),
            jobs: nextJobs,
            activities: [
              {
                id: crypto.randomUUID(),
                entityType: "opportunity" as const,
                entityId: id,
                type: "stage_change" as const,
                body: `Moved from ${STAGE_LABELS[current.stage]} to ${STAGE_LABELS[stage]}.${
                  stage === "lost" && lostReason ? ` ${lostReason}` : ""
                }`,
                createdAt: new Date().toISOString(),
                author: user.name,
              },
              ...prev.activities,
            ],
          };
        });
        return createdJob;
      }
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
              primary_contact_id: current.primaryContactId || null,
              status: "precon",
              contract_value: current.value,
              start_date: new Date().toISOString().slice(0, 10),
              superintendent: "Tom Brennan",
              project_manager: user.name || "Luis Ortega",
              location: current.location,
              owner_staff_id: user.staffId || null,
              code: allocateCode(user.name, state.jobs, state.opportunities, current.code),
            })
            .select("*")
            .single();
          if (jobError) {
            toast.error(codeInsertError(jobError, "Could not open the job."));
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
    [addActivity, load, state.jobs, state.opportunities, user.companyId, user.name, user.staffId]
  );

  const updateOpportunity = useCallback(
    async (id: string, patch: Partial<Opportunity>) => {
      const supabase = requireClient();
      if (!supabase) {
        setState((prev) => ({
          ...prev,
          opportunities: prev.opportunities.map((opportunity) =>
            opportunity.id === id ? { ...opportunity, ...patch } : opportunity
          ),
        }));
        return;
      }
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
    if (!supabase) {
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
      }));
      return;
    }
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
    async (
      input: Omit<Opportunity, "id" | "code" | "createdAt" | "winProbability" | "ownerStaffId"> & {
        ownerStaffId?: string;
      }
    ) => {
      const ownerStaffId =
        input.ownerStaffId ||
        staffByName(input.estimator, state.staff)?.id ||
        user.staffId;
      const code = allocateCode(user.name, state.jobs, state.opportunities);
      const supabase = requireClient();
      if (!supabase) {
        const opportunity: Opportunity = {
          ...input,
          id: crypto.randomUUID(),
          code,
          createdAt: new Date().toISOString(),
          winProbability: STAGE_PROBABILITY[input.stage],
          ownerStaffId,
        };
        setState((prev) => ({ ...prev, opportunities: [opportunity, ...prev.opportunities] }));
        return opportunity;
      }
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          company_id: user.companyId,
          name: input.name,
          client_id: input.clientId || null,
          primary_contact_id: input.primaryContactId || null,
          stage: input.stage,
          value: input.value,
          bid_due_at: input.bidDueAt,
          pre_bid_walk_at: input.preBidWalkAt,
          location: input.location,
          project_type: input.projectType,
          delivery_method: input.deliveryMethod,
          estimator: input.estimator,
          owner_staff_id: ownerStaffId || null,
          win_probability: STAGE_PROBABILITY[input.stage],
          next_step: input.nextStep,
          code,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(codeInsertError(error, "Could not open the pursuit."));
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
    [addActivity, state.jobs, state.opportunities, state.staff, user.companyId, user.name, user.staffId]
  );

  const addClient = useCallback(
    async (input: Omit<Client, "id"> & {
      contactName?: string;
      contactTitle?: string;
      isReferralPartner?: boolean;
    }) => {
      const { contactName, contactTitle, isReferralPartner, ...clientInput } = input;
      const supabase = requireClient();
      if (!supabase) {
        const client: Client = { ...clientInput, id: crypto.randomUUID() };
        const contacts = contactName
          ? [
              {
                id: crypto.randomUUID(),
                clientId: client.id,
                name: contactName,
                title: contactTitle || "Primary contact",
                email: "",
                phone: "",
                ownerStaffId: user.staffId,
                isReferralPartner: Boolean(isReferralPartner),
              } satisfies Contact,
            ]
          : [];
        setState((prev) => ({
          ...prev,
          clients: [client, ...prev.clients],
          contacts: [...contacts, ...prev.contacts],
        }));
        return client;
      }
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
            owner_staff_id: user.staffId || null,
            is_referral_partner: Boolean(isReferralPartner),
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
    [user.companyId, user.staffId]
  );

  const addContact = useCallback(
    async (input: Omit<Contact, "id">) => {
      const contact: Contact = {
        id: "",
        ...input,
        ownerStaffId: input.ownerStaffId || user.staffId,
      };
      const supabase = requireClient();
      if (!supabase) {
        const created = { ...contact, id: crypto.randomUUID() };
        setState((prev) => ({ ...prev, contacts: [created, ...prev.contacts] }));
        return created;
      }
      const { data, error } = await supabase
        .from("contacts")
        .insert({
          company_id: user.companyId,
          client_id: contact.clientId || null,
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          owner_staff_id: contact.ownerStaffId || null,
          is_referral_partner: contact.isReferralPartner,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add the contact.");
        throw error ?? new Error("Could not add the contact.");
      }
      const mapped = mapContact(data);
      setState((prev) => ({ ...prev, contacts: [mapped, ...prev.contacts] }));
      return mapped;
    },
    [user.companyId, user.staffId]
  );

  const addJob = useCallback(
    async (input: Omit<Job, "id" | "code" | "ownerStaffId"> & { ownerStaffId?: string }) => {
      const ownerStaffId =
        input.ownerStaffId ||
        staffByName(input.projectManager, state.staff)?.id ||
        user.staffId;
      const linked = input.opportunityId
        ? state.opportunities.find((opportunity) => opportunity.id === input.opportunityId)
        : undefined;
      const code = allocateCode(user.name, state.jobs, state.opportunities, linked?.code);
      const supabase = requireClient();
      if (!supabase) {
        const job: Job = { ...input, id: crypto.randomUUID(), ownerStaffId, code };
        setState((prev) => ({ ...prev, jobs: [job, ...prev.jobs] }));
        return job;
      }
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          company_id: user.companyId,
          opportunity_id: input.opportunityId,
          name: input.name,
          client_id: input.clientId || null,
          primary_contact_id: input.primaryContactId || null,
          status: input.status,
          contract_value: input.contractValue,
          start_date: input.startDate,
          substantial_completion: input.substantialCompletion,
          superintendent: input.superintendent,
          project_manager: input.projectManager,
          location: input.location,
          owner_staff_id: ownerStaffId || null,
          code,
        })
        .select("*")
        .single();
      if (error || !data) {
        toast.error(codeInsertError(error, "Could not log the job."));
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
    [addActivity, state.jobs, state.opportunities, state.staff, user.companyId, user.name, user.staffId]
  );

  const toggleTask = useCallback(async (id: string) => {
    const current = state.tasks.find((task) => task.id === id);
    if (!current) return;
    const supabase = requireClient();
    if (!supabase) {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === id ? { ...task, completed: !task.completed } : task
        ),
      }));
      return;
    }
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
      clientId: string | null;
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
          client_id: input.clientId || null,
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
      clientId: string | null;
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
          client_id: input.clientId || null,
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

  const persistCalendar = useCallback(
    (accounts: CalendarAccount[], shares: CalendarShare[]) => {
      if (!isSupabaseConfigured()) {
        writeLocalCalendar({ calendarAccounts: accounts, calendarShares: shares });
      }
    },
    []
  );

  const addScheduleEvent = useCallback(
    async (input: Omit<ScheduleEvent, "id">) => {
      const supabase = requireClient();
      if (!supabase) {
        const event: ScheduleEvent = { ...input, id: crypto.randomUUID() };
        setState((prev) => ({ ...prev, events: [...prev.events, event] }));
        return event;
      }
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

  const upsertAccount = useCallback(
    async (account: CalendarAccount) => {
      setState((prev) => {
        const exists = prev.calendarAccounts.some((item) => item.staffId === account.staffId);
        const calendarAccounts = exists
          ? prev.calendarAccounts.map((item) => (item.staffId === account.staffId ? account : item))
          : [...prev.calendarAccounts, account];
        persistCalendar(calendarAccounts, prev.calendarShares);
        return { ...prev, calendarAccounts };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") return;
      const { error } = await supabase.from("calendar_accounts").upsert(
        {
          company_id: user.companyId,
          staff_id: account.staffId,
          google_email: account.googleEmail,
          google_calendar_id: account.calendarId,
          linked: account.linked,
          linked_at: account.linkedAt,
          share_with_team: account.shareWithTeam,
          source: account.source,
        },
        { onConflict: "company_id,staff_id" }
      );
      if (error) toast.error(error.message);
    },
    [persistCalendar, user.companyId]
  );

  const linkDemoCalendar = useCallback(async () => {
    const staffId = user.staffId;
    if (!staffId) return;
    const current = accountForStaff(state.calendarAccounts, staffId);
    await upsertAccount({
      ...current,
      staffId,
      googleEmail: demoGoogleEmail(user.name),
      calendarId: "primary",
      linked: true,
      linkedAt: new Date().toISOString(),
      source: "demo",
    });
    toast.success("Demo Google Calendar linked.");
  }, [state.calendarAccounts, upsertAccount, user.name, user.staffId]);

  const markCalendarLinked = useCallback(
    async (staffId: string, googleEmail: string, source: "google" | "demo") => {
      const current = accountForStaff(state.calendarAccounts, staffId);
      await upsertAccount({
        ...current,
        staffId,
        googleEmail,
        linked: true,
        linkedAt: new Date().toISOString(),
        source,
      });
    },
    [state.calendarAccounts, upsertAccount]
  );

  const disconnectCalendar = useCallback(async () => {
    const staffId = user.staffId;
    if (!staffId) return;
    try {
      await fetch("/api/google/calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId }),
      });
    } catch {
      // Local demo still unlinks below.
    }
    const current = accountForStaff(state.calendarAccounts, staffId);
    await upsertAccount({
      ...current,
      googleEmail: "",
      linked: false,
      linkedAt: null,
      source: "demo",
    });
    toast.message("Google Calendar disconnected.");
  }, [state.calendarAccounts, upsertAccount, user.staffId]);

  const setShareWithTeam = useCallback(
    async (shareWithTeam: boolean) => {
      const staffId = user.staffId;
      if (!staffId) return;
      const current = accountForStaff(state.calendarAccounts, staffId);
      await upsertAccount({ ...current, staffId, shareWithTeam });
    },
    [state.calendarAccounts, upsertAccount, user.staffId]
  );

  const setCalendarShare = useCallback(
    async (viewerStaffId: string, shared: boolean) => {
      const ownerStaffId = user.staffId;
      if (!ownerStaffId || viewerStaffId === ownerStaffId) return;
      let nextShares: CalendarShare[] = [];
      setState((prev) => {
        const filtered = prev.calendarShares.filter(
          (share) => !(share.ownerStaffId === ownerStaffId && share.viewerStaffId === viewerStaffId)
        );
        nextShares = shared
          ? [...filtered, { ownerStaffId, viewerStaffId }]
          : filtered;
        persistCalendar(prev.calendarAccounts, nextShares);
        return { ...prev, calendarShares: nextShares };
      });
      const supabase = requireClient();
      if (!supabase || !user.companyId || user.companyId === "local") return;
      if (shared) {
        const { error } = await supabase.from("calendar_shares").insert({
          company_id: user.companyId,
          owner_staff_id: ownerStaffId,
          viewer_staff_id: viewerStaffId,
        });
        if (error && !error.message.toLowerCase().includes("duplicate")) toast.error(error.message);
      } else {
        const { error } = await supabase
          .from("calendar_shares")
          .delete()
          .eq("owner_staff_id", ownerStaffId)
          .eq("viewer_staff_id", viewerStaffId);
        if (error) toast.error(error.message);
      }
    },
    [persistCalendar, user.companyId, user.staffId]
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

  const canEditCompany = viewer?.role === "company_admin";

  const updateCompany = useCallback(
    async (next: CompanySettings) => {
      const name = next.name.trim();
      if (!name) {
        toast.error("Company name is required.");
        return false;
      }
      if (!canEditCompany) {
        toast.error("Only a company admin can change business settings.");
        return false;
      }
      const settings: CompanySettings = {
        name,
        phone: next.phone.trim(),
        email: next.email.trim(),
        website: next.website.trim(),
        street: next.street.trim(),
        city: next.city.trim(),
        state: next.state.trim(),
        postalCode: next.postalCode.trim(),
        licenseNumber: next.licenseNumber.trim(),
      };
      if (!isSupabaseConfigured() || !user.companyId || user.companyId === "local") {
        setCompanySettings(settings);
        setUser((current) => ({ ...current, company: settings.name }));
        writeLocalCompany(settings);
        toast.success("Business settings saved.");
        return true;
      }
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .update({
          name: settings.name,
          phone: settings.phone,
          email: settings.email,
          website: settings.website,
          street: settings.street,
          city: settings.city,
          state: settings.state,
          postal_code: settings.postalCode,
          license_number: settings.licenseNumber,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.companyId)
        .select("*")
        .single();
      if (error || !data) {
        const missingColumn =
          error?.message?.includes("schema cache") ||
          error?.code === "PGRST204" ||
          error?.message?.includes("Could not find the");
        toast.error(
          missingColumn
            ? "Run supabase/migrations/20260819210000_company_settings.sql in the SQL editor, then try again."
            : error?.message ?? "Could not save business settings."
        );
        return false;
      }
      const saved = mapCompany(data);
      setCompanySettings(saved);
      setUser((current) => ({ ...current, company: saved.name }));
      toast.success("Business settings saved.");
      return true;
    },
    [canEditCompany, user.companyId]
  );

  const resetDemo = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      clearLocalCalendar();
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
      ...scoped,
      user: displayUser,
      viewer,
      effectiveStaff,
      impersonatedStaff,
      loginAsOptions,
      scopeLabel: viewer
        ? scopeDescription(effectiveStaff ?? viewer, viewer, Boolean(impersonatedStaff), state.teams)
        : "",
      teamMembers,
      book: state,
      configured,
      hydrated,
      hydrateError,
      switchSeat,
      loginAs,
      stopLoginAs,
      getClient,
      getContact,
      customerName,
      getOpportunity,
      getJob,
      getEstimate,
      getInvoice,
      jobForOpportunity,
      company: companySettings,
      canEditCompany,
      updateCompany,
      moveOpportunity,
      updateOpportunity,
      updateJob,
      addOpportunity,
      addClient,
      addContact,
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
      linkDemoCalendar,
      markCalendarLinked,
      disconnectCalendar,
      setShareWithTeam,
      setCalendarShare,
      addJobPhoto,
      resetDemo,
      signOut,
    }),
    [
      scoped,
      displayUser,
      viewer,
      effectiveStaff,
      impersonatedStaff,
      loginAsOptions,
      state,
      teamMembers,
      configured,
      hydrated,
      hydrateError,
      switchSeat,
      loginAs,
      stopLoginAs,
      getClient,
      getContact,
      customerName,
      getOpportunity,
      getJob,
      getEstimate,
      getInvoice,
      jobForOpportunity,
      companySettings,
      canEditCompany,
      updateCompany,
      moveOpportunity,
      updateOpportunity,
      updateJob,
      addOpportunity,
      addClient,
      addContact,
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
      linkDemoCalendar,
      markCalendarLinked,
      disconnectCalendar,
      setShareWithTeam,
      setCalendarShare,
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
