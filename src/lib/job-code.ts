/** Job / pipeline codes: BJ081926-A — project manager initials, local MMDDYY, daily letter. */

export function creatorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0] ?? "";
    const last = parts[parts.length - 1]?.[0] ?? "";
    return (first + last).toUpperCase();
  }
  const single = parts[0] ?? "XX";
  return single.slice(0, 2).toUpperCase().padEnd(2, "X");
}

export function jobDateStamp(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}${day}${year}`;
}

function letterSuffix(index: number) {
  let n = index + 1;
  let suffix = "";
  while (n > 0) {
    n -= 1;
    suffix = String.fromCharCode(65 + (n % 26)) + suffix;
    n = Math.floor(n / 26);
  }
  return suffix;
}

export function nextJobCode(ownerName: string, when: Date, existingCodes: Iterable<string>) {
  const prefix = `${creatorInitials(ownerName)}${jobDateStamp(when)}-`;
  const taken = new Set(
    [...existingCodes]
      .filter((code) => code.startsWith(prefix))
      .map((code) => code.slice(prefix.length)),
  );
  let index = 0;
  while (taken.has(letterSuffix(index))) {
    index += 1;
  }
  return `${prefix}${letterSuffix(index)}`;
}

export function existingRecordCodes(records: Array<{ code?: string }>) {
  return records.map((record) => record.code).filter((code): code is string => Boolean(code));
}

/** Name whose initials go on the code — the assigned project manager, then the estimator, then the owner seat. */
export function jobCodeOwnerName(input: {
  projectManager?: string;
  estimator?: string;
  ownerStaffId?: string;
  staff?: Array<{ id: string; name: string }>;
  fallback?: string;
}) {
  const named = input.projectManager?.trim() || input.estimator?.trim();
  if (named) return named;
  const owner = input.ownerStaffId
    ? input.staff?.find((member) => member.id === input.ownerStaffId)?.name
    : "";
  return owner?.trim() || input.fallback?.trim() || "XX";
}

export function isJobReassigned(previousName: string, nextName: string) {
  const from = previousName.trim();
  const to = nextName.trim();
  if (!from || !to) return false;
  return from.toLowerCase() !== to.toLowerCase();
}

export function canReviewJobCodes(role: string | undefined) {
  return role === "company_admin" || role === "accountant";
}

export function codeReviewAudience<T extends { role: string; locked?: boolean }>(staff: T[]) {
  return staff.filter((member) => !member.locked && canReviewJobCodes(member.role));
}

export function parseJobCodeDate(code: string): Date | null {
  const match = /^[A-Za-z]{1,4}(\d{6})-/.exec(code.trim());
  if (!match) return null;
  const stamp = match[1] ?? "";
  const month = Number(stamp.slice(0, 2));
  const day = Number(stamp.slice(2, 4));
  const year = Number(stamp.slice(4, 6));
  if (!month || month > 12 || !day || day > 31) return null;
  return new Date(2000 + year, month - 1, day, 12, 0, 0);
}

/** Mint a code for the new PM, keeping the original date stamp when we can read it. */
export function suggestedJobCode(
  ownerName: string,
  currentCode: string,
  existingCodes: Iterable<string>,
  fallback = new Date(),
) {
  const when = parseJobCodeDate(currentCode) ?? fallback;
  const others = [...existingCodes].filter((code) => code !== currentCode);
  return nextJobCode(ownerName, when, others);
}

export function jobCodeReviewTitle(code: string) {
  return `Review job code ${code.trim() || "this job"}`;
}

export function isJobCodeReviewTask(task: { title?: string; relatedType?: string | null }) {
  return Boolean(task.title?.startsWith("Review job code ") && task.relatedType === "job");
}

export function jobCodeReviewNotes(input: {
  fromName: string;
  toName: string;
  fromCode: string;
  suggestedCode: string;
}) {
  return `Reassigned from ${input.fromName} to ${input.toName}.\nCurrent code: ${input.fromCode}\nSuggested code: ${input.suggestedCode}`;
}

export function parseJobCodeReviewNotes(notes: string | undefined) {
  const text = notes ?? "";
  return {
    fromName: /Reassigned from (.+) to (.+)\./i.exec(text)?.[1]?.trim() ?? "",
    toName: /Reassigned from (.+) to (.+)\./i.exec(text)?.[2]?.trim() ?? "",
    fromCode: /Current code:\s*(\S+)/i.exec(text)?.[1] ?? "",
    suggestedCode: /Suggested code:\s*(\S+)/i.exec(text)?.[1] ?? "",
  };
}

export function jobCodeReviewSms(input: {
  jobCode: string;
  fromName: string;
  toName: string;
  suggestedCode: string;
}) {
  const current = input.jobCode.trim() || "A job";
  return `${current} was reassigned from ${input.fromName} to ${input.toName}. Redo as ${input.suggestedCode} or keep the code on Home in Truss.`;
}

export type JobCodeReviewNotice = {
  jobId: string;
  jobCode: string;
  jobName: string;
  fromName: string;
  toName: string;
  fromCode: string;
  suggestedCode: string;
};

export function openJobCodeReviews(
  tasks: Array<{
    title?: string;
    relatedType?: string | null;
    relatedId?: string | null;
    completed?: boolean;
    notes?: string;
  }>,
  jobs: Array<{ id: string; code: string; name: string; projectManager?: string }>,
): JobCodeReviewNotice[] {
  const seen = new Set<string>();
  const notices: JobCodeReviewNotice[] = [];
  for (const task of tasks) {
    if (task.completed || !isJobCodeReviewTask(task) || !task.relatedId) continue;
    if (seen.has(task.relatedId)) continue;
    const job = jobs.find((item) => item.id === task.relatedId);
    if (!job) continue;
    seen.add(task.relatedId);
    const parsed = parseJobCodeReviewNotes(task.notes);
    const toName = parsed.toName || job.projectManager || "";
    notices.push({
      jobId: job.id,
      jobCode: job.code,
      jobName: job.name,
      fromName: parsed.fromName,
      toName,
      fromCode: parsed.fromCode || job.code,
      suggestedCode:
        parsed.suggestedCode ||
        suggestedJobCode(
          toName,
          job.code,
          jobs.map((item) => item.code),
        ),
    });
  }
  return notices;
}

export function actionableJobCodeReviews(
  tasks: Array<{
    title?: string;
    relatedType?: string | null;
    relatedId?: string | null;
    completed?: boolean;
    notes?: string;
  }>,
  jobs: Array<{ id: string; code: string; name: string; projectManager?: string }>,
  staff: { role?: string } | null | undefined,
) {
  if (!canReviewJobCodes(staff?.role)) return [];
  return openJobCodeReviews(tasks, jobs);
}

type NamedUser = { id: string; name: string };

function dateForCode(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0);
  }
  return new Date(value);
}

/** Fill missing codes on persisted / seed records without colliding. */
export function backfillRecordCodes<
  TOpp extends {
    id: string;
    code: string;
    createdBy?: string;
    ownerStaffId: string;
    createdAt: string;
  },
  TJob extends {
    id: string;
    code: string;
    createdBy?: string;
    ownerStaffId: string;
    startDate: string;
    opportunityId: string | null;
  },
>(
  opportunities: TOpp[],
  jobs: TJob[],
  users: NamedUser[],
): { opportunities: TOpp[]; jobs: TJob[] } {
  const used = new Set(existingRecordCodes([...jobs, ...opportunities]));
  const fallback = users[0];
  const oppCodes = new Map<string, string>();

  const oppOrder = [...opportunities].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  for (const opp of oppOrder) {
    if (opp.code) {
      used.add(opp.code);
      oppCodes.set(opp.id, opp.code);
      continue;
    }
    const creator =
      users.find((user) => user.id === (opp.createdBy || opp.ownerStaffId)) ?? fallback;
    const owner = jobCodeOwnerName({
      estimator: "estimator" in opp ? String(opp.estimator ?? "") : "",
      ownerStaffId: opp.ownerStaffId,
      staff: users,
      fallback: creator.name,
    });
    const code = nextJobCode(owner, dateForCode(opp.createdAt), used);
    used.add(code);
    oppCodes.set(opp.id, code);
  }

  const jobCodes = new Map<string, string>();
  const jobOrder = [...jobs].sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
  );
  for (const job of jobOrder) {
    if (job.code) {
      used.add(job.code);
      jobCodes.set(job.id, job.code);
      continue;
    }
    if (job.opportunityId) {
      const inherited = oppCodes.get(job.opportunityId);
      if (inherited) {
        used.add(inherited);
        jobCodes.set(job.id, inherited);
        continue;
      }
    }
    const creator =
      users.find((user) => user.id === (job.createdBy || job.ownerStaffId)) ?? fallback;
    const owner = jobCodeOwnerName({
      projectManager: "projectManager" in job ? String(job.projectManager ?? "") : "",
      ownerStaffId: job.ownerStaffId,
      staff: users,
      fallback: creator.name,
    });
    const code = nextJobCode(owner, dateForCode(job.startDate), used);
    used.add(code);
    jobCodes.set(job.id, code);
  }

  return {
    opportunities: opportunities.map((opp) => ({
      ...opp,
      code: oppCodes.get(opp.id) ?? opp.code,
    })),
    jobs: jobs.map((job) => ({
      ...job,
      code: jobCodes.get(job.id) ?? job.code,
    })),
  };
}

export const CODE_MIGRATION_SQL = "supabase/migrations/20260819220000_job_codes.sql";

export const CODE_MIGRATION_HINT =
  "Run supabase/migrations/20260819220000_job_codes.sql in the SQL editor, then try again.";

export function missingCodeColumnMessage() {
  return `Saved. Run ${CODE_MIGRATION_SQL} in the SQL editor so the job code stays in Postgres.`;
}

export function payloadWithoutCode<T extends { code?: string }>(row: T): Omit<T, "code"> {
  const { code: _code, ...rest } = row;
  return rest;
}

export function isMissingCodeColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  // postal_code / cost_code must not count as the jobs.code column.
  const text = message.replace(/postal_code/gi, "").replace(/cost_code/gi, "");
  return (
    /'code'|"code"/.test(text) ||
    /column\s+["']?code["']?/i.test(text) ||
    (text.toLowerCase().includes("column") && /(^|[^a-z_])code([^a-z_]|$)/i.test(text))
  );
}

export function codeInsertError(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  return isMissingCodeColumn(error) ? CODE_MIGRATION_HINT : error?.message ?? fallback;
}
