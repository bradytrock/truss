export const HOME_MODULE_IDS = [
  "salesKpis",
  "closedWonGauge",
  "dealsByCloseDate",
  "closedBySource",
  "bdRoi",
  "qbApprove",
  "accountingNotices",
  "returningClients",
  "pipelinePath",
  "todaysWork",
  "calendarDay",
  "proposalsDue",
  "training",
  "recentActivity",
  "activeJobs",
] as const;

export type HomeModuleId = (typeof HOME_MODULE_IDS)[number];

export const HOME_MODULE_SPANS = [3, 4, 6, 8, 12] as const;
export type HomeModuleSpan = (typeof HOME_MODULE_SPANS)[number];

export type HomeModulePlacement = {
  id: HomeModuleId;
  hidden: boolean;
  span: HomeModuleSpan;
};

export const HOME_MODULE_LABELS: Record<HomeModuleId, string> = {
  salesKpis: "Sales totals",
  closedWonGauge: "Closed won sales",
  dealsByCloseDate: "Deals by close date",
  closedBySource: "Closed by source",
  bdRoi: "Agent ROI",
  qbApprove: "Approve for QuickBooks",
  accountingNotices: "Accounting needs you",
  returningClients: "Returning clients",
  pipelinePath: "Pipeline path",
  todaysWork: "Tasks",
  calendarDay: "Today’s calendar",
  proposalsDue: "Proposals due",
  training: "Training",
  recentActivity: "Recent activity",
  activeJobs: "Active jobs",
};

export const HOME_SPAN_OPTIONS: { span: HomeModuleSpan; label: string }[] = [
  { span: 3, label: "1/4" },
  { span: 4, label: "1/3" },
  { span: 6, label: "1/2" },
  { span: 8, label: "2/3" },
  { span: 12, label: "Full" },
];

export const SALES_HOME_MODULE_IDS: HomeModuleId[] = [
  "salesKpis",
  "closedWonGauge",
  "dealsByCloseDate",
  "closedBySource",
];

const DEFAULT_BY_ID: Record<HomeModuleId, HomeModulePlacement> = {
  salesKpis: { id: "salesKpis", hidden: false, span: 8 },
  closedWonGauge: { id: "closedWonGauge", hidden: false, span: 4 },
  dealsByCloseDate: { id: "dealsByCloseDate", hidden: false, span: 8 },
  closedBySource: { id: "closedBySource", hidden: false, span: 4 },
  bdRoi: { id: "bdRoi", hidden: false, span: 12 },
  qbApprove: { id: "qbApprove", hidden: false, span: 12 },
  accountingNotices: { id: "accountingNotices", hidden: false, span: 12 },
  returningClients: { id: "returningClients", hidden: false, span: 12 },
  pipelinePath: { id: "pipelinePath", hidden: false, span: 12 },
  todaysWork: { id: "todaysWork", hidden: false, span: 6 },
  calendarDay: { id: "calendarDay", hidden: false, span: 6 },
  proposalsDue: { id: "proposalsDue", hidden: false, span: 4 },
  training: { id: "training", hidden: false, span: 4 },
  recentActivity: { id: "recentActivity", hidden: false, span: 8 },
  activeJobs: { id: "activeJobs", hidden: false, span: 12 },
};

export function defaultHomeLayout(): HomeModulePlacement[] {
  return HOME_MODULE_IDS.map((id) => ({ ...DEFAULT_BY_ID[id] }));
}

export function isHomeModuleId(value: unknown): value is HomeModuleId {
  return typeof value === "string" && (HOME_MODULE_IDS as readonly string[]).includes(value);
}

export function isHomeModuleSpan(value: unknown): value is HomeModuleSpan {
  return typeof value === "number" && (HOME_MODULE_SPANS as readonly number[]).includes(value);
}

export function mergeHomeLayout(raw: unknown): HomeModulePlacement[] {
  const seen = new Set<HomeModuleId>();
  const next: HomeModulePlacement[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const id = "id" in item ? item.id : null;
      if (!isHomeModuleId(id) || seen.has(id)) continue;
      const fallback = DEFAULT_BY_ID[id];
      const hidden = "hidden" in item ? Boolean(item.hidden) : fallback.hidden;
      const span = "span" in item && isHomeModuleSpan(item.span) ? item.span : fallback.span;
      seen.add(id);
      next.push({ id, hidden, span });
    }
  }
  for (const id of HOME_MODULE_IDS) {
    if (!seen.has(id)) next.push({ ...DEFAULT_BY_ID[id] });
  }
  return next;
}

export function homeLayoutStorageKey(companyId: string, staffId: string) {
  return `truss.homeLayout.v2:${companyId || "local"}:${staffId || "anon"}`;
}

export function loadHomeLayout(companyId: string, staffId: string): HomeModulePlacement[] {
  if (typeof window === "undefined") return defaultHomeLayout();
  try {
    const raw = window.localStorage.getItem(homeLayoutStorageKey(companyId, staffId));
    return mergeHomeLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultHomeLayout();
  }
}

export function saveHomeLayout(
  companyId: string,
  staffId: string,
  layout: HomeModulePlacement[],
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(homeLayoutStorageKey(companyId, staffId), JSON.stringify(layout));
}

export function availableHomeModules(input: {
  hasLeads: boolean;
  isAccountant: boolean;
  isBd: boolean;
  canViewAccounting: boolean;
  hasAccountingNotices: boolean;
  hasReturningClients: boolean;
}): HomeModuleId[] {
  if (!input.hasLeads) return [];
  return HOME_MODULE_IDS.filter((id) => {
    if (SALES_HOME_MODULE_IDS.includes(id)) return !input.isAccountant;
    if (id === "bdRoi") return input.isBd;
    if (id === "qbApprove") return input.canViewAccounting;
    if (id === "accountingNotices") return input.hasAccountingNotices;
    if (id === "returningClients") return input.hasReturningClients;
    return true;
  });
}

export function visibleHomeLayout(
  layout: HomeModulePlacement[],
  available: Iterable<HomeModuleId>,
) {
  const allowed = new Set(available);
  return layout.filter((item) => !item.hidden && allowed.has(item.id));
}

export function hiddenHomeLayout(
  layout: HomeModulePlacement[],
  available: Iterable<HomeModuleId>,
) {
  const allowed = new Set(available);
  return layout.filter((item) => item.hidden && allowed.has(item.id));
}

export function setHomeModuleHidden(
  layout: HomeModulePlacement[],
  id: HomeModuleId,
  hidden: boolean,
) {
  return layout.map((item) => (item.id === id ? { ...item, hidden } : item));
}

export function setHomeModuleSpan(
  layout: HomeModulePlacement[],
  id: HomeModuleId,
  span: HomeModuleSpan,
) {
  return layout.map((item) => (item.id === id ? { ...item, span } : item));
}

export function reorderHomeLayout(
  layout: HomeModulePlacement[],
  activeId: string,
  overId: string,
) {
  const from = layout.findIndex((item) => item.id === activeId);
  const to = layout.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = layout.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function homeModuleSpanClass(span: HomeModuleSpan) {
  switch (span) {
    case 3:
      return "md:col-span-3";
    case 4:
      return "md:col-span-4";
    case 6:
      return "md:col-span-6";
    case 8:
      return "md:col-span-8";
    default:
      return "md:col-span-12";
  }
}
