/** Job / pipeline codes: BJ081926-A — creator initials, local MMDDYY, daily letter. */

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

export function nextJobCode(creatorName: string, when: Date, existingCodes: Iterable<string>) {
  const prefix = `${creatorInitials(creatorName)}${jobDateStamp(when)}-`;
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
    const code = nextJobCode(creator.name, dateForCode(opp.createdAt), used);
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
    const code = nextJobCode(creator.name, dateForCode(job.startDate), used);
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
